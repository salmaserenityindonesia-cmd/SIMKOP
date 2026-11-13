/**
 * complianceService.ts
 * Layanan kepatuhan simpanan anggota, analisis audit, dan rekonsiliasi mutasi buku besar.
 */
import { supabase } from '../lib/supabaseClient';
import type { ParsedMonthlyDeposit } from '../utils/savingsMatrixImporter';
import {
  SavingsRateTier,
  getRateTiers,
  getApplicableTierRate,
  getActivePokokTariff
} from './savingsRateService';

export { getApplicableTierRate, getActivePokokTariff } from './savingsRateService';
export { reconcileMemberSavingsDeposit, autoReconcileSavingsLedger } from './savingsMatrixService';

export interface DepositTypeItem {
  id: string;
  name: string;
  code?: string;
  default_amount?: number;
}

/**
 * Helper untuk mengambil seluruh data dari Supabase dengan paging otomatis
 * guna mengatasi batasan default 1.000 baris per request pada PostgREST.
 */
export async function fetchAllPaged<T = any>(
  table: string,
  columns: string,
  filterFn?: (query: any) => any
): Promise<{ data: T[]; error: any }> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let page = 0;
  let hasMore = true;
  let lastError: any = null;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query: any = supabase.from(table).select(columns);
    if (filterFn) {
      query = filterFn(query);
    }

    if (typeof query.range === 'function') {
      const { data, error } = await query.range(from, to);
      if (error) {
        lastError = error;
        hasMore = false;
        break;
      }
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allData.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          page++;
        }
      }
    } else {
      const { data, error } = await query;
      if (error) {
        lastError = error;
      } else if (data && Array.isArray(data)) {
        allData = data;
      }
      hasMore = false;
    }
  }

  return { data: allData, error: lastError };
}

/**
 * Helper to identify deposit type based on code or name keywords.
 */
export function matchDepositType(
  types: DepositTypeItem[],
  codes: string[],
  nameKeywords: string[]
): DepositTypeItem | undefined {
  return types.find((t) => {
    const code = (t.code || '').toUpperCase();
    if (codes.some((c) => c.toUpperCase() === code)) return true;
    const name = (t.name || '').toLowerCase();
    return nameKeywords.some((k) => name.includes(k.toLowerCase()));
  });
}

/**
 * Mengambil rentang tahun (descending) yang tersedia untuk tracking kepatuhan simpanan
 * berdasarkan 3 kondisi kewajiban masa lalu yang belum terselesaikan:
 * 1. Simpanan pokok belum lunas oleh anggota aktif (dihitung sejak tahun registrasinya).
 * 2. Simpanan hari raya/lebaran yang masih memiliki sisa saldo (belum ditarik habis).
 * 3. Bulan simpanan wajib yang belum terbayar (menunggak) oleh anggota aktif.
 *
 * Fallback: Mengembalikan [currentYear] jika terjadi gangguan koneksi/query atau seluruh
 * kewajiban masa lampau telah terpenuhi.
 */
export async function getSavingsComplianceAvailableYears(
  referenceDate: Date = new Date()
): Promise<number[]> {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth(); // 0-indexed (0: Jan, 11: Des)
  const candidateYears: number[] = [currentYear];

  try {
    // 1. Fetch deposit types
    const { data: dTypes, error: dTypesError } = await supabase
      .from('deposit_types')
      .select('*');

    if (dTypesError || !dTypes || dTypes.length === 0) {
      if (dTypesError) {
        console.error('Error fetching deposit types for available years:', dTypesError);
      }
      return [currentYear];
    }

    const pokokType = matchDepositType(dTypes, ['POKOK', 'SP'], ['pokok']);
    const wajibType = matchDepositType(dTypes, ['WAJIB', 'SW'], ['wajib']);
    const lebaranType = matchDepositType(dTypes, ['LEBARAN', 'SL'], ['lebaran', 'hari raya']);

    // 2. Fetch all active members from public.anggota (BUKAN members)
    let members: any[] = [];
    let membersError: any = null;

    const selectBuilder: any = supabase
      .from('anggota')
      .select('id, nama, nrp, status, membership_status, created_at');

    if (typeof selectBuilder.order === 'function') {
      const resp = await selectBuilder.order('nama', { ascending: true });
      members = resp.data || [];
      membersError = resp.error;
    } else if (typeof selectBuilder.eq === 'function') {
      const resp = await selectBuilder.eq('status', 'aktif');
      members = resp.data || [];
      membersError = resp.error;
    } else {
      const resp = await selectBuilder;
      members = resp.data || [];
      membersError = resp.error;
    }

    if (membersError || !members || members.length === 0) {
      if (membersError) {
        console.error('Error fetching active members for available years:', membersError);
      }
      return [currentYear];
    }

    const activeMembers = members.filter((m: any) => {
      const st = (m.status || '').toLowerCase();
      const mst = (m.membership_status || '').toUpperCase();
      return st !== 'nonaktif' && mst !== 'RESIGNED';
    });

    const membersToUse = activeMembers.length > 0 ? activeMembers : members;
    members = membersToUse;

    // 3. Fetch deposit transactions with automatic paging (supporting >1000 records)
    const { data: transactions, error: txError } = await fetchAllPaged(
      'deposit_transactions',
      'amount, transaction_type, for_year, for_month, created_at, description, member_deposits!inner(member_id, deposit_type_id)'
    );

    if (txError) {
      console.error('Error fetching deposit transactions for available years:', txError);
      return [currentYear];
    }

    const txList = transactions || [];

    // Helper to extract transaction metadata safely
    const parseTx = (tx: any) => {
      const md = Array.isArray(tx.member_deposits) ? tx.member_deposits[0] : tx.member_deposits;
      const memberId = tx.member_id || md?.member_id;
      const depositTypeId = tx.deposit_type_id || md?.deposit_type_id;
      const amount = Number(tx.amount) || 0;
      const type = tx.transaction_type || 'deposit';

      let year = currentYear;
      if (tx.for_year !== null && tx.for_year !== undefined && !isNaN(Number(tx.for_year))) {
        year = Number(tx.for_year);
      } else if (tx.created_at) {
        const y = new Date(tx.created_at).getFullYear();
        if (!isNaN(y)) year = y;
      }

      let month = 0;
      const hasExplicitMonth = tx.for_month !== null && tx.for_month !== undefined && !isNaN(Number(tx.for_month));
      if (hasExplicitMonth) {
        month = Number(tx.for_month) - 1; // 1-indexed to 0-indexed
      } else if (tx.created_at) {
        const m = new Date(tx.created_at).getMonth();
        if (!isNaN(m)) month = m;
      }

      return { memberId, depositTypeId, amount, type, year, month, hasExplicitMonth };
    };

    // --- KONDISI 1: Simpanan Pokok Belum Lunas ---
    if (pokokType) {
      const pokokDefaultAmount = Number(pokokType.default_amount) || 100000;
      const pokokDepositsByMember: Record<string, number> = {};

      txList.forEach((tx: any) => {
        const parsed = parseTx(tx);
        if (parsed.depositTypeId === pokokType.id && parsed.memberId) {
          if (!pokokDepositsByMember[parsed.memberId]) {
            pokokDepositsByMember[parsed.memberId] = 0;
          }
          if (parsed.type === 'deposit') {
            pokokDepositsByMember[parsed.memberId] += parsed.amount;
          } else if (parsed.type === 'withdrawal') {
            pokokDepositsByMember[parsed.memberId] -= parsed.amount;
          }
        }
      });

      members.forEach((m: any) => {
        const totalPokok = pokokDepositsByMember[m.id] || 0;
        if (totalPokok < pokokDefaultAmount) {
          const regDate = m.created_at ? new Date(m.created_at) : new Date();
          const regYear = isNaN(regDate.getFullYear()) ? currentYear : regDate.getFullYear();
          if (regYear <= currentYear) {
            candidateYears.push(regYear);
          }
        }
      });
    }

    // --- KONDISI 2: Saldo Simpanan Lebaran Belum Ditarik Habis ---
    if (lebaranType) {
      const lebaranTxsByMember: Record<
        string,
        { totalDeposit: number; totalWithdrawal: number; depositYears: number[] }
      > = {};

      txList.forEach((tx: any) => {
        const parsed = parseTx(tx);
        if (parsed.depositTypeId === lebaranType.id && parsed.memberId) {
          if (!lebaranTxsByMember[parsed.memberId]) {
            lebaranTxsByMember[parsed.memberId] = {
              totalDeposit: 0,
              totalWithdrawal: 0,
              depositYears: [],
            };
          }
          if (parsed.type === 'deposit') {
            lebaranTxsByMember[parsed.memberId].totalDeposit += parsed.amount;
            if (parsed.year <= currentYear) {
              lebaranTxsByMember[parsed.memberId].depositYears.push(parsed.year);
            }
          } else if (parsed.type === 'withdrawal') {
            lebaranTxsByMember[parsed.memberId].totalWithdrawal += parsed.amount;
          }
        }
      });

      members.forEach((m: any) => {
        const record = lebaranTxsByMember[m.id];
        if (record) {
          const netBalance = record.totalDeposit - record.totalWithdrawal;
          if (netBalance > 0) {
            const uniqueYears = Array.from(new Set(record.depositYears));
            uniqueYears.forEach((y) => candidateYears.push(y));
          }
        }
      });
    }

    // --- KONDISI 3: Tunggakan Bulan Simpanan Wajib ---
    if (wajibType) {
      const paidWajibSet = new Set<string>();

      txList.forEach((tx: any) => {
        const parsed = parseTx(tx);
        if (
          parsed.depositTypeId === wajibType.id &&
          parsed.memberId &&
          parsed.type === 'deposit' &&
          parsed.amount > 0
        ) {
          paidWajibSet.add(`${parsed.memberId}_${parsed.year}_${parsed.month}`);
        }
      });

      let oldestRegYear = currentYear;
      members.forEach((m: any) => {
        const regDate = m.created_at ? new Date(m.created_at) : new Date();
        const y = isNaN(regDate.getFullYear()) ? currentYear : regDate.getFullYear();
        if (y < oldestRegYear) {
          oldestRegYear = y;
        }
      });

      for (let y = oldestRegYear; y <= currentYear; y++) {
        let yearHasArrears = false;

        for (const m of members) {
          const regDate = m.created_at ? new Date(m.created_at) : new Date();
          const joinYear = isNaN(regDate.getFullYear()) ? currentYear : regDate.getFullYear();
          const joinMonth = isNaN(regDate.getMonth()) ? 0 : regDate.getMonth();

          if (y < joinYear) {
            continue;
          }

          const startMonth = y === joinYear ? joinMonth : 0;
          const endMonth = y === currentYear ? currentMonth : 11;

          for (let month = startMonth; month <= endMonth; month++) {
            const key = `${m.id}_${y}_${month}`;
            if (!paidWajibSet.has(key)) {
              yearHasArrears = true;
              break;
            }
          }

          if (yearHasArrears) {
            break;
          }
        }

        if (yearHasArrears) {
          candidateYears.push(y);
        }
      }
    }

    const cutoffInfo = await resolveCutoffDateInfo(txList);

    let startYear = Math.min(...candidateYears);
    if (cutoffInfo?.year) {
      startYear = Math.max(startYear, cutoffInfo.year);
    }
    const maxYear = Math.max(currentYear, cutoffInfo?.year || currentYear);
    const years: number[] = [];
    for (let y = maxYear; y >= startYear; y--) {
      years.push(y);
    }

    return years.length > 0 ? years : [currentYear];
  } catch (err) {
    console.error('Unexpected error resolving savings compliance available years:', err);
    return [currentYear];
  }
}

export const getComplianceAvailableYears = getSavingsComplianceAvailableYears;


export interface SavingsSubItem {
  status: 'paid' | 'unpaid' | 'not_applicable' | 'partial' | 'unbilled' | 'covered_by_opening';
  amount: number;
  targetAmount?: number;
  reference_no?: string;
  notes?: string;
}

export interface CutoffDateInfo {
  dateStr: string;
  year: number;
  month: number; // 1-12
  day: number;
  periodIndex: number;
  formattedDate: string;
}

export function parseCutoffDateInfo(dateStr?: string | null): CutoffDateInfo | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const match = trimmed.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  let year: number;
  let month: number;
  let day: number;
  let normalizedDateStr: string;

  if (match) {
    year = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    day = parseInt(match[3], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    normalizedDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
    normalizedDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return {
    dateStr: normalizedDateStr,
    year,
    month,
    day,
    periodIndex: year * 12 + month,
    formattedDate: `${day} ${MONTH_LABELS[month - 1]} ${year}`,
  };
}

async function resolveCutoffDateInfo(transactions?: any[] | null): Promise<CutoffDateInfo | null> {
  let rawCutoffDateStr: string | null = null;
  try {
    const settingsQuery: any = supabase.from('system_settings').select('key, value');
    if (typeof settingsQuery?.eq === 'function') {
      const eqQ = settingsQuery.eq('key', 'initial_savings_effective_date');
      const res = typeof eqQ?.maybeSingle === 'function'
        ? await eqQ.maybeSingle()
        : (typeof eqQ?.single === 'function' ? await eqQ.single() : await eqQ);
      const rowData = Array.isArray(res?.data) ? res.data[0] : res?.data;
      if (rowData?.value) {
        rawCutoffDateStr = String(rowData.value);
      }
    } else if (settingsQuery && typeof settingsQuery.then === 'function') {
      const res = await settingsQuery;
      const rows = Array.isArray(res?.data) ? res.data : (res?.data ? [res.data] : []);
      const found = rows.find((r: any) => r?.key === 'initial_savings_effective_date');
      if (found?.value) {
        rawCutoffDateStr = String(found.value);
      }
    }
  } catch {
    // Fallback ke pemindaian deskripsi transaksi di bawah
  }

  if (!rawCutoffDateStr && Array.isArray(transactions) && transactions.length > 0) {
    let latestExtractedDate = '';
    for (const tx of transactions) {
      const desc = String(tx.description || '');
      if (desc.toLowerCase().includes('saldo awal simpanan')) {
        const descMatch = desc.match(/(\d{4}-\d{2}-\d{2})/);
        let candidate = descMatch ? descMatch[1] : '';
        if (!candidate && tx.created_at) {
          const parsed = parseCutoffDateInfo(String(tx.created_at));
          if (parsed) candidate = parsed.dateStr;
        }
        if (candidate && (!latestExtractedDate || candidate > latestExtractedDate)) {
          latestExtractedDate = candidate;
        }
      }
    }
    if (latestExtractedDate) {
      rawCutoffDateStr = latestExtractedDate;
    }
  }

  return parseCutoffDateInfo(rawCutoffDateStr);
}

export interface MonthSavingsCell {
  month: number;
  wajib: SavingsSubItem;
  belanja: SavingsSubItem;
  lebaran: SavingsSubItem;
}

export interface MonthPeriod {
  year: number;
  month: number; // 1-12
  label: string; // misal 'Des-25', 'Jan-26', ..., 'Nov-26'
  periodIndex: number; // year * 12 + month
}

export function getRolling12MonthRange(endYear: number, endMonth: number): MonthPeriod[] {
  const months: MonthPeriod[] = [];
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

  for (let i = 11; i >= 0; i--) {
    let m = endMonth - i;
    let y = endYear;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.push({
      year: y,
      month: m,
      label: `${MONTH_LABELS[m - 1]}-${String(y).slice(-2)}`,
      periodIndex: y * 12 + m
    });
  }
  return months;
}

export function getRolling12Months(refYear: number, refMonth: number): MonthPeriod[] {
  return getRolling12MonthRange(refYear, refMonth);
}

export interface ComplianceMonthData {
  w: number;
  b: number;
  l: number;
  bal_w: number;
  bal_b: number;
  bal_l: number;
  cum_w?: number;
  cum_b?: number;
  cum_l?: number;
  isOpeningBalanceMonth?: boolean;
  isBeforeCutoff?: boolean;
  wajib?: SavingsSubItem;
  belanja?: SavingsSubItem;
  lebaran?: SavingsSubItem;
}

export interface MemberNetSavings {
  wajib: number;
  belanja: number;
  lebaran: number;
  total: number;
}

export interface PriorBalanceSummary {
  pokok?: number;
  wajib: number;
  belanja: number;
  lebaran: number;
  total: number;
}

export interface ComplianceMatrixRow {
  member_id: string;
  nrp: string;
  nama: string;
  pokokLunas: boolean;
  pokokBalance?: number;
  compliance: number;
  balances: { w: number; b: number; l: number };
  openingBalance?: { w: number; b: number; l: number };
  priorSummary?: PriorBalanceSummary;
  cutoffDate?: string | null;
  cutoffYear?: number | null;
  cutoffMonth?: number | null;
  cutoffPeriodIndex?: number | null;
  periods?: MonthPeriod[];
  months: (ComplianceMonthData | null)[];
  created_at?: string;
  tgl_awal_anggota?: string;
  netSavings?: MemberNetSavings;
}

export interface ComplianceMatrixResult {
  rows: ComplianceMatrixRow[];
  targets: {
    wajib: number;
    belanja: number;
    lebaran: number;
  };
  rateTiers?: SavingsRateTier[];
  periods?: MonthPeriod[];
  windowStartIndex?: number;
  cutoffIndex?: number;
  cutoffDate?: string | null;
  cutoffYear?: number | null;
  cutoffMonth?: number | null;
  cutoffPeriodIndex?: number | null;
}

/**
 * Memuat data matriks kepatuhan simpanan seluruh anggota aktif untuk tahun tertentu atau jendela 12 bulan bergulir.
 * Menjamin:
 * 1. Mengambil master data dari tabel `public.anggota` (BUKAN `members`).
 * 2. Menyertakan seluruh anggota aktif yang terdaftar sebelum atau pada rentang periode tersebut.
 * 3. Menggunakan LEFT JOIN / pemisahan kueri transaksi sehingga anggota yang belum memiliki setoran TIDAK tereliminasi.
 * 4. Mendukung jendela 12 bulan bergulir (rolling) dengan Saldo Bawaan (Opening Balance) dan akumulasi berantai.
 */
export async function getComplianceMatrixData(
  yearOrRolling?: number | string,
  depositType?: string,
  refMonth?: number
): Promise<ComplianceMatrixResult> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed (0 = Jan .. 11 = Des)
  const currentMonth1Based = currentMonth + 1; // 1-indexed (1 = Jan .. 12 = Des)

  const isRolling =
    yearOrRolling === 'rolling' ||
    yearOrRolling === undefined ||
    (typeof yearOrRolling === 'string' && yearOrRolling.toLowerCase() === 'rolling') ||
    refMonth !== undefined;

  // 1. Ambil tipe simpanan
  const { data: dTypes } = await supabase.from('deposit_types').select('*');
  const typeList = dTypes || [];
  const typeMap: Record<string, string> = {};
  typeList.forEach((dt: any) => {
    typeMap[(dt.name || '').toLowerCase()] = dt.id;
    if (dt.code) typeMap[(dt.code || '').toLowerCase()] = dt.id;
  });

  const isTypeMatch = (dt: any, codes: string[], keywords: string[]) => {
    const c = (dt.code || '').toUpperCase();
    const n = (dt.name || '').toLowerCase();
    return codes.some((code) => c === code.toUpperCase()) || keywords.some((k) => n.includes(k.toLowerCase()));
  };

  const pokokType = matchDepositType(typeList, ['POKOK', 'SP'], ['pokok']);
  const wajibType = matchDepositType(typeList, ['WAJIB', 'SW'], ['wajib']);
  const belanjaType = matchDepositType(typeList, ['BELANJA', 'SB'], ['belanja']);
  const lebaranType = matchDepositType(typeList, ['LEBARAN', 'SL', 'SHR'], ['lebaran', 'hari raya']);

  const keys = Object.keys(typeMap);
  const pokokId = pokokType?.id || typeMap[keys.find((k) => k.includes('pokok') || k === 'sp') || ''] || '';
  const wajibId = wajibType?.id || typeMap[keys.find((k) => k.includes('wajib') || k === 'sw') || ''] || '';
  const belanjaId = belanjaType?.id || typeMap[keys.find((k) => k.includes('belanja') || k === 'sb') || ''] || '';
  const lebaranId = lebaranType?.id || typeMap[keys.find((k) => k.includes('lebaran') || k.includes('hari raya') || k === 'sl') || ''] || '';

  const pokokTypeIds = new Set(typeList.filter((dt) => isTypeMatch(dt, ['POKOK', 'SP'], ['pokok'])).map((dt) => dt.id));
  const wajibTypeIds = new Set(typeList.filter((dt) => isTypeMatch(dt, ['WAJIB', 'SW'], ['wajib'])).map((dt) => dt.id));
  const belanjaTypeIds = new Set(typeList.filter((dt) => isTypeMatch(dt, ['BELANJA', 'SB'], ['belanja'])).map((dt) => dt.id));
  const lebaranTypeIds = new Set(typeList.filter((dt) => isTypeMatch(dt, ['LEBARAN', 'SL', 'SHR'], ['lebaran', 'hari raya'])).map((dt) => dt.id));

  if (pokokId) pokokTypeIds.add(pokokId);
  if (wajibId) wajibTypeIds.add(wajibId);
  if (belanjaId) belanjaTypeIds.add(belanjaId);
  if (lebaranId) lebaranTypeIds.add(lebaranId);

  // 2. Ambil Rekening Simpanan & Transaksi Secara Terpisah (LEFT JOIN) dengan paging
  const { data: memberDepositsList } = await fetchAllPaged(
    'member_deposits',
    'id, member_id, deposit_type_id'
  );
  const mdMap = new Map<string, { member_id: string; deposit_type_id: string }>();
  (memberDepositsList || []).forEach((md: any) => {
    if (md.id) {
      mdMap.set(md.id, { member_id: md.member_id, deposit_type_id: md.deposit_type_id });
    }
  });

  const { data: transactions } = await fetchAllPaged(
    'deposit_transactions',
    'id, member_deposit_id, amount, transaction_type, for_year, for_month, created_at, description, reference_no, notes, member_deposits(member_id, deposit_type_id)'
  );

  // Helper untuk mengekstrak member_id dan deposit_type_id dari transaksi
  const parseTxInfo = (tx: any) => {
    const md = Array.isArray(tx.member_deposits) ? tx.member_deposits[0] : tx.member_deposits;
    const mdFromMap = tx.member_deposit_id ? mdMap.get(tx.member_deposit_id) : undefined;
    const memberId = tx.member_id || md?.member_id || mdFromMap?.member_id;
    const depositTypeId = tx.deposit_type_id || md?.deposit_type_id || mdFromMap?.deposit_type_id;
    return { memberId, depositTypeId };
  };

  // 3. Tentukan jendela 12 bulan bergulir lintas tahun berdasarkan parameter atau transaksi setoran terakhir
  let latestDepositYear = currentYear;
  let latestDepositMonth = currentMonth1Based;
  let hasDepositTx = false;
  let maxDepositPeriod = -1;

  if (transactions && Array.isArray(transactions) && transactions.length > 0) {
    transactions.forEach((tx: any) => {
      if (tx.transaction_type === 'deposit') {
        let ty = 0;
        let tm = -1;

        if (tx.for_year !== null && tx.for_year !== undefined && !isNaN(Number(tx.for_year))) {
          ty = Number(tx.for_year);
        } else if (tx.created_at) {
          ty = new Date(tx.created_at).getFullYear();
        }

        if (tx.for_month !== null && tx.for_month !== undefined && !isNaN(Number(tx.for_month))) {
          const rawM = Number(tx.for_month);
          tm = rawM >= 1 && rawM <= 12 ? rawM : rawM + 1;
        } else if (tx.created_at) {
          tm = new Date(tx.created_at).getMonth() + 1;
        }

        if (ty > 0 && tm >= 1 && tm <= 12) {
          const pIdx = ty * 12 + tm;
          if (pIdx > maxDepositPeriod) {
            maxDepositPeriod = pIdx;
            latestDepositYear = ty;
            latestDepositMonth = tm;
            hasDepositTx = true;
          }
        }
      }
    });
  }

  let targetYear: number;
  let periods: MonthPeriod[];

  if (refMonth !== undefined) {
    targetYear = typeof yearOrRolling === 'number' ? yearOrRolling : currentYear;
    periods = getRolling12MonthRange(targetYear, refMonth);
  } else if (isRolling) {
    if (hasDepositTx) {
      targetYear = latestDepositYear;
      periods = getRolling12MonthRange(latestDepositYear, latestDepositMonth);
    } else {
      targetYear = currentYear;
      periods = getRolling12MonthRange(currentYear, currentMonth1Based);
    }
  } else {
    targetYear = typeof yearOrRolling === 'number' ? yearOrRolling : parseInt(String(yearOrRolling), 10) || currentYear;
    // Mode kalender 12 bulan (Jan s/d Des untuk targetYear)
    periods = getRolling12MonthRange(targetYear, 12);
  }

  const cutoffIndex = periods[0].periodIndex;
  const windowStartIndex = cutoffIndex;

  // 4. Ambil seluruh anggota dari public.anggota (BUKAN members)
  // WAJIB mengambil seluruh anggota aktif dari public.anggota yang terdaftar pada atau sebelum akhir jendela periode
  const endPeriod = periods[11];
  const lastDayOfMonth = new Date(endPeriod.year, endPeriod.month, 0).getDate();
  const windowEndIso = `${endPeriod.year}-${String(endPeriod.month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}T23:59:59.999Z`;

  let rawMembers: any[] = [];
  let memberErr: any = null;

  try {
    const memberSelectBuilder: any = supabase
      .from('anggota')
      .select('id, nrp, nama, pangkat, bank_account_number, membership_status, created_at, status');

    let executed = false;
    // Chaining kueri Supabase PostgREST: .eq('status', 'aktif').lte('created_at', windowEndIso).order('nama', { ascending: true })
    if (typeof memberSelectBuilder.eq === 'function') {
      const eqBuilder = memberSelectBuilder.eq('status', 'aktif');
      if (eqBuilder && typeof eqBuilder.lte === 'function') {
        const lteBuilder = eqBuilder.lte('created_at', windowEndIso);
        if (lteBuilder && typeof lteBuilder.order === 'function') {
          const resp = await lteBuilder.order('nama', { ascending: true });
          rawMembers = resp.data || [];
          memberErr = resp.error;
          executed = true;
        } else {
          const resp = await (lteBuilder || eqBuilder);
          rawMembers = resp.data || [];
          memberErr = resp.error;
          executed = true;
        }
      } else if (eqBuilder && typeof eqBuilder.order === 'function') {
        const resp = await eqBuilder.order('nama', { ascending: true });
        rawMembers = resp.data || [];
        memberErr = resp.error;
        executed = true;
      } else if (eqBuilder && typeof eqBuilder.then === 'function') {
        const resp = await eqBuilder;
        rawMembers = resp.data || [];
        memberErr = resp.error;
        executed = true;
      }
    }

    if (!executed) {
      if (typeof memberSelectBuilder.order === 'function') {
        const resp = await memberSelectBuilder.order('nama', { ascending: true });
        rawMembers = resp.data || [];
        memberErr = resp.error;
      } else {
        const resp = await memberSelectBuilder;
        rawMembers = resp.data || [];
        memberErr = resp.error;
      }
    }

    // Jika filter status di DB mengembalikan data kosong (misal karena status legacy bernilai NULL),
    // lakukan fallback query tanpa filter status agar data anggota aktif tetap diambil
    if ((!rawMembers || rawMembers.length === 0) && !memberErr && typeof memberSelectBuilder.order === 'function') {
      const fallbackResp = await memberSelectBuilder.order('nama', { ascending: true });
      if (fallbackResp?.data && fallbackResp.data.length > 0) {
        rawMembers = fallbackResp.data;
      }
    }
  } catch (err: any) {
    console.error('Error fetching members from anggota for compliance matrix:', err);
    memberErr = err;
  }

  if (memberErr) {
    console.error('Error fetching members from anggota for compliance matrix:', memberErr);
    return { rows: [], targets: { wajib: 0, belanja: 0, lebaran: 0 } };
  }

  const allMembers = rawMembers || [];

  // Filter anggota aktif: bukan berstatus nonaktif atau RESIGNED
  const activeMembers = allMembers.filter((m: any) => {
    const st = (m.status || '').toLowerCase();
    const mst = (m.membership_status || '').toUpperCase();
    return st !== 'nonaktif' && mst !== 'RESIGNED';
  });

  const membersToFilter = activeMembers.length > 0 ? activeMembers : allMembers;

  // Filter berdasarkan masa keanggotaan: anggota yang bergabung sebelum atau pada akhir jendela periode
  const windowEndDate = new Date(windowEndIso);
  const eligibleMembers = membersToFilter.filter((m: any) => {
    const joinDateStr = m.created_at || m.tgl_awal_anggota;
    if (!joinDateStr) return true;
    const joinDate = new Date(joinDateStr);
    return isNaN(joinDate.getTime()) || joinDate <= windowEndDate;
  });

  // Ambil data master tarif berjenjang dari savings_rate_tiers
  let rateTiers: SavingsRateTier[] = [];
  try {
    const { data: tiersData, error: tiersErr } = await supabase
      .from('savings_rate_tiers')
      .select('*')
      .order('start_year', { ascending: true })
      .order('start_month', { ascending: true });
    if (!tiersErr && tiersData && tiersData.length > 0) {
      rateTiers = tiersData;
    } else {
      rateTiers = await getRateTiers(undefined, false);
    }
  } catch {
    try {
      rateTiers = await getRateTiers(undefined, false);
    } catch {
      rateTiers = [];
    }
  }

  // 5. Ambil transaksi pokok dengan paging
  const { data: pokokTxs } = await fetchAllPaged(
    'deposit_transactions',
    'id, member_deposit_id, amount, transaction_type, member_deposits(member_id, deposit_type_id)'
  );

  const pokokPaidByMember = new Set<string>();
  const openingPokokByMember: Record<string, number> = {};
  if (pokokTxs) {
    const pokokSums: Record<string, number> = {};
    pokokTxs.forEach((tx: any) => {
      const { memberId: mId, depositTypeId: tId } = parseTxInfo(tx);
      if (mId && (!pokokId || pokokTypeIds.has(tId) || tId === pokokId)) {
        const amt = Number(tx.amount) || 0;
        if (tx.transaction_type === 'deposit') {
          pokokSums[mId] = (pokokSums[mId] || 0) + amt;
        } else if (tx.transaction_type === 'withdrawal') {
          pokokSums[mId] = (pokokSums[mId] || 0) - amt;
        }
      }
    });

    const activePokokTier = (rateTiers || []).find((t: any) => {
      const c = (t.deposit_type_code || '').toUpperCase();
      return (c === 'POKOK' || c === 'SP') && (t.end_year === null || t.end_year === undefined);
    });
    const pokokTarget = activePokokTier && Number(activePokokTier.monthly_rate) > 0
      ? Number(activePokokTier.monthly_rate)
      : (typeList.find((dt: any) => dt.id === pokokId)?.default_amount || 100000);
    Object.keys(pokokSums).forEach((mId) => {
      if (pokokId || pokokTypeIds.size > 0) {
        openingPokokByMember[mId] = Math.max(0, pokokSums[mId]);
      }
      if (pokokSums[mId] >= pokokTarget) {
        pokokPaidByMember.add(mId);
      }
    });
  }

  // Ambil tanggal pengesahan saldo awal (cut-off) dari system_settings atau transaksi Saldo Awal Simpanan
  const cutoffInfo = await resolveCutoffDateInfo(transactions);

  // 3b. Query view_member_net_savings untuk posisi saldo kas riil netto
  const netSavingsByMember: Record<string, MemberNetSavings> = {};
  try {
    const { data: viewNetSavings, error: viewError } = await supabase
      .from('view_member_net_savings')
      .select('member_id, deposit_type_code, deposit_type_name, net_cash_balance');

    if (!viewError && Array.isArray(viewNetSavings) && viewNetSavings.length > 0) {
      viewNetSavings.forEach((row: any) => {
        const mId = row.member_id;
        if (!mId) return;
        if (!netSavingsByMember[mId]) {
          netSavingsByMember[mId] = { wajib: 0, belanja: 0, lebaran: 0, total: 0 };
        }

        const code = (row.deposit_type_code || '').toUpperCase();
        const name = (row.deposit_type_name || '').toLowerCase();
        const netAmt = Number(row.net_cash_balance) || 0;

        if (code === 'WAJIB' || code === 'SW' || name.includes('wajib')) {
          netSavingsByMember[mId].wajib += netAmt;
        } else if (code === 'BELANJA' || code === 'SB' || name.includes('belanja')) {
          netSavingsByMember[mId].belanja += netAmt;
        } else if (
          code === 'LEBARAN' ||
          code === 'SL' ||
          code === 'SHR' ||
          name.includes('lebaran') ||
          name.includes('hari raya')
        ) {
          netSavingsByMember[mId].lebaran += netAmt;
        }
      });

      Object.keys(netSavingsByMember).forEach((mId) => {
        const s = netSavingsByMember[mId];
        s.total = s.wajib + s.belanja + s.lebaran;
      });
    }
  } catch (err) {
    // Fallback resilien ke kalkulasi log transaksi jika view belum tersedia
  }

  // Helper untuk mengidentifikasi transaksi saldo awal cut-off resmi
  const isInitialSavingsCutoffTx = (tx: any): boolean => {
    const desc = (tx.description || '').toLowerCase();
    return desc.includes('saldo awal simpanan');
  };

  // Helper untuk mengidentifikasi transaksi gelondongan migrasi / saldo awal
  const isBulkMigrationTx = (tx: any): boolean => {
    const desc = (tx.description || '').toLowerCase();
    const isMigrationDesc =
      desc.includes('migra') ||
      desc.includes('saldo awal') ||
      desc.includes('historical') ||
      desc.includes('one-time');

    const hasExplicitMonth =
      tx.for_month !== null && tx.for_month !== undefined && !isNaN(Number(tx.for_month));
    const isLumpSumAmount = Number(tx.amount) > 210000;

    return (
      isMigrationDesc &&
      (!hasExplicitMonth ||
        (isLumpSumAmount &&
          (desc.includes('saldo awal migrasi sistem') || desc.includes('migrasi saldo awal (as-is)'))))
    );
  };

  // Cek apakah akun simpanan anggota sudah memiliki rincian bulanan (breakdown mutasi)
  const hasBreakdownSet = new Set<string>();
  if (transactions) {
    transactions.forEach((tx: any) => {
      const { memberId: mId, depositTypeId: tId } = parseTxInfo(tx);
      if (!mId) return;
      const key = `${mId}_${tId}`;

      const desc = (tx.description || '').toLowerCase();
      const isBreakdown =
        tx.transaction_type === 'deposit' &&
        tx.for_month !== null &&
        tx.for_month !== undefined &&
        tx.for_year !== null &&
        tx.for_year !== undefined &&
        (desc.includes('setoran matriks') || !isBulkMigrationTx(tx));

      if (isBreakdown) {
        hasBreakdownSet.add(key);
      }
    });
  }

  // Agregasi setoran bulanan dan transaksi anggota
  interface MonthlyPaymentDetail {
    w: number;
    b: number;
    l: number;
    ref_w?: string;
    ref_b?: string;
    ref_l?: string;
    notes_w?: string;
    notes_b?: string;
    notes_l?: string;
  }
  // Keyed by member_id, then by column index (0..11) matching periods[0..11]
  const paymentsByMember: Record<string, Record<number, MonthlyPaymentDetail>> = {};
  const withdrawalsByMember: Record<string, Record<number, { w: number; b: number; l: number }>> = {};

  // Saldo bawaan pra-jendela 12 bulan atau Saldo Awal Cut-Off utuh
  const openingBalances: Record<string, { w: number; b: number; l: number }> = {};

  const memberTxs: Record<
    string,
    Array<{ year: number; month: number; periodIndex: number; type: string; amt: number; tId: string }>
  > = {};

  const billedMonthsW = new Set<number>();
  const billedMonthsB = new Set<number>();
  const billedMonthsL = new Set<number>();

  if (transactions) {
    transactions.forEach((tx: any) => {
      const { memberId: mId, depositTypeId: tId } = parseTxInfo(tx);
      if (!mId) return;
      const amt = Number(tx.amount) || 0;
      const key = `${mId}_${tId}`;

      const isCutoffOpening = isInitialSavingsCutoffTx(tx);
      const isBulk = isBulkMigrationTx(tx);
      const hasBreakdown = hasBreakdownSet.has(key);

      // Jika bukan mode cut-off saldo awal dan rincian bulanan sudah ada, singkirkan transaksi gelondongan awal migrasi agar tidak terhitung dua kali
      if (!isCutoffOpening && cutoffInfo === null && isBulk && hasBreakdown) {
        return;
      }

      let txYear = 0;
      let txMonth = -1; // 0-indexed: 0 = Jan .. 11 = Des

      if (tx.for_year !== null && tx.for_year !== undefined && !isNaN(Number(tx.for_year))) {
        txYear = Number(tx.for_year);
      } else if (tx.created_at) {
        txYear = new Date(tx.created_at).getFullYear();
      } else {
        txYear = new Date().getFullYear();
      }

      if (tx.for_month !== null && tx.for_month !== undefined && !isNaN(Number(tx.for_month))) {
        const rawM = Number(tx.for_month);
        txMonth = rawM >= 1 && rawM <= 12 ? rawM - 1 : rawM;
      } else if (tx.created_at) {
        txMonth = new Date(tx.created_at).getMonth();
      } else {
        txMonth = new Date().getMonth();
      }

      const txPeriodIndex = txYear * 12 + (txMonth + 1);

      if (!memberTxs[mId]) memberTxs[mId] = [];
      memberTxs[mId].push({ year: txYear, month: txMonth, periodIndex: txPeriodIndex, type: tx.transaction_type, amt, tId });

      if (!openingBalances[mId]) {
        openingBalances[mId] = { w: 0, b: 0, l: 0 };
      }

      const isWajib = wajibTypeIds.has(tId) || tId === wajibId;
      const isBelanja = belanjaTypeIds.has(tId) || tId === belanjaId;
      const isLebaran = lebaranTypeIds.has(tId) || tId === lebaranId;
      const hasExplicitMonth = tx.for_month !== null && tx.for_month !== undefined && !isNaN(Number(tx.for_month));

      // 1A. Mode Cut-Off Saldo Awal Utuh:
      // Transaksi Saldo Awal Simpanan / migrasi gelondongan masuk utuh ke openingBalance (tidak diurai mundur)
      if (
        isCutoffOpening ||
        (cutoffInfo !== null &&
          (isBulk || (tx.transaction_type === 'deposit' && !hasExplicitMonth && txPeriodIndex <= cutoffInfo.periodIndex))) ||
        (cutoffInfo === null && isBulk && !hasBreakdown && !hasExplicitMonth)
      ) {
        if (tx.transaction_type === 'deposit') {
          if (isWajib) openingBalances[mId].w += amt;
          if (isBelanja) openingBalances[mId].b += amt;
          if (isLebaran) openingBalances[mId].l += amt;
        } else if (tx.transaction_type === 'withdrawal') {
          if (isWajib) openingBalances[mId].w -= amt;
          if (isBelanja) openingBalances[mId].b -= amt;
          if (isLebaran) openingBalances[mId].l -= amt;
        }
        return;
      }

      // Jika mode Cut-Off aktif dan transaksi berada sebelum bulan cut-off, abaikan dari sel bulanan (sudah terangkum di Saldo Awal)
      if (cutoffInfo !== null && txPeriodIndex < cutoffInfo.periodIndex) {
        return;
      }

      // 1B. Akumulasi ke Saldo Bawaan (Opening Balance) jika transaksi terjadi sebelum jendela 12 bulan (mode tanpa cut-off)
      if (cutoffInfo === null && txPeriodIndex < windowStartIndex) {
        if (tx.transaction_type === 'deposit') {
          if (isWajib) openingBalances[mId].w += amt;
          if (isBelanja) openingBalances[mId].b += amt;
          if (isLebaran) openingBalances[mId].l += amt;
        } else if (tx.transaction_type === 'withdrawal') {
          if (isWajib) openingBalances[mId].w -= amt;
          if (isBelanja) openingBalances[mId].b -= amt;
          if (isLebaran) openingBalances[mId].l -= amt;
        }
        return;
      }

      // 2. Transaksi dalam jendela 12 bulan (dan >= cutoffPeriodIndex jika mode cut-off aktif)
      const colIdx = periods.findIndex((p) => p.periodIndex === txPeriodIndex);

      if (colIdx >= 0 && colIdx < 12) {
        if (tx.transaction_type === 'withdrawal') {
          if (!withdrawalsByMember[mId]) withdrawalsByMember[mId] = {};
          if (!withdrawalsByMember[mId][colIdx]) withdrawalsByMember[mId][colIdx] = { w: 0, b: 0, l: 0 };
          if (isWajib) withdrawalsByMember[mId][colIdx].w += amt;
          if (isBelanja) withdrawalsByMember[mId][colIdx].b += amt;
          if (isLebaran) withdrawalsByMember[mId][colIdx].l += amt;
        } else if (tx.transaction_type === 'deposit') {
          const isRoutineMonthly = hasExplicitMonth && !isBulk && !isCutoffOpening;
          if (isRoutineMonthly) {
            if (!paymentsByMember[mId]) paymentsByMember[mId] = {};
            if (!paymentsByMember[mId][colIdx]) paymentsByMember[mId][colIdx] = { w: 0, b: 0, l: 0 };

            if (isWajib) {
              paymentsByMember[mId][colIdx].w += amt;
              if (tx.reference_no) paymentsByMember[mId][colIdx].ref_w = tx.reference_no;
              if (tx.notes) paymentsByMember[mId][colIdx].notes_w = tx.notes;
              billedMonthsW.add(colIdx);
            }
            if (isBelanja) {
              paymentsByMember[mId][colIdx].b += amt;
              if (tx.reference_no) paymentsByMember[mId][colIdx].ref_b = tx.reference_no;
              if (tx.notes) paymentsByMember[mId][colIdx].notes_b = tx.notes;
              billedMonthsB.add(colIdx);
            }
            if (isLebaran) {
              paymentsByMember[mId][colIdx].l += amt;
              if (tx.reference_no) paymentsByMember[mId][colIdx].ref_l = tx.reference_no;
              if (tx.notes) paymentsByMember[mId][colIdx].notes_l = tx.notes;
              billedMonthsL.add(colIdx);
            }
          }
        }
      }
    });
  }

  const targetWajib = typeList.find((dt: any) => dt.id === wajibId)?.default_amount || 25000;
  const targetBelanja = typeList.find((dt: any) => dt.id === belanjaId)?.default_amount || 50000;
  const targetLebaran = typeList.find((dt: any) => dt.id === lebaranId)?.default_amount || 50000;

  // 4. Susun baris untuk setiap anggota yang eligible
  // PENTING: Jangan buang anggota yang belum memiliki transaksi di tahun tersebut!
  const results: ComplianceMatrixRow[] = eligibleMembers.map((m: any) => {
    const monthsData: (ComplianceMonthData | null)[] = [];
    let expectedCount = 0;
    let paidCount = 0;

    const joinDateStr = m.tgl_awal_anggota || m.created_at;
    const joinDate = joinDateStr ? new Date(joinDateStr) : new Date(0);
    const joinMonth = isNaN(joinDate.getMonth()) ? 0 : joinDate.getMonth();
    const joinYear = isNaN(joinDate.getFullYear()) ? currentYear : joinDate.getFullYear();
    const joinPeriodIndex = joinYear * 12 + (joinMonth + 1);

    // Saldo bawaan pra-jendela atau Saldo Awal Cut-Off anggota
    const openBal = openingBalances[m.id] || { w: 0, b: 0, l: 0 };
    const priorSummary: PriorBalanceSummary = {
      wajib: openBal.w,
      belanja: openBal.b,
      lebaran: openBal.l,
      total: openBal.w + openBal.b + openBal.l,
    };

    // Deteksi transaksi dan status sisa parsial anggota pada 12 kolom periode ini
    let lastPaidColW = -1;
    let hasPartialW = false;
    let partialColW = -1;

    let lastPaidColB = -1;
    let hasPartialB = false;
    let partialColB = -1;

    let lastPaidColL = -1;
    let hasPartialL = false;
    let partialColL = -1;

    for (let k = 0; k < 12; k++) {
      const pk = paymentsByMember[m.id]?.[k];
      const pPeriod = periods[k];
      if (pk) {
        if (pk.w > 0) {
          lastPaidColW = k;
          const rateW = rateTiers.length > 0
            ? getApplicableTierRate(rateTiers, 'WAJIB', pPeriod.year, pPeriod.month)
            : targetWajib;
          if (pk.w < rateW) {
            hasPartialW = true;
            partialColW = k;
          }
        }
        if (pk.b > 0) {
          lastPaidColB = k;
          const rateB = rateTiers.length > 0
            ? getApplicableTierRate(rateTiers, 'BELANJA', pPeriod.year, pPeriod.month)
            : targetBelanja;
          if (pk.b < rateB) {
            hasPartialB = true;
            partialColB = k;
          }
        }
        if (pk.l > 0) {
          lastPaidColL = k;
          const rateL = rateTiers.length > 0
            ? getApplicableTierRate(rateTiers, 'LEBARAN', pPeriod.year, pPeriod.month)
            : targetLebaran;
          if (pk.l < rateL) {
            hasPartialL = true;
            partialColL = k;
          }
        }
      }
    }

    // Running cumulative balance yang mengalir dari priorSummary / opening balance
    let runningCumW = priorSummary.wajib;
    let runningCumB = priorSummary.belanja;
    let runningCumL = priorSummary.lebaran;

    for (let i = 0; i < 12; i++) {
      const colPeriod = periods[i];
      const isBeforeJoin = colPeriod.periodIndex < joinPeriodIndex;
      const isBeforeCutoff = cutoffInfo !== null && colPeriod.periodIndex < cutoffInfo.periodIndex;
      const isFuture = !isRolling && colPeriod.periodIndex > (currentYear * 12 + currentMonth1Based);

      const p = paymentsByMember[m.id]?.[i] || { w: 0, b: 0, l: 0 };
      const wDraw = withdrawalsByMember[m.id]?.[i] || { w: 0, b: 0, l: 0 };
      const hasAnyPayment = p.w > 0 || p.b > 0 || p.l > 0;

      // Akumulasikan setoran bulan ini dan kurangkan penarikan ke running balance
      runningCumW += p.w - wDraw.w;
      runningCumB += p.b - wDraw.b;
      runningCumL += p.l - wDraw.l;

      if (isFuture) {
        monthsData.push(null);
      } else if (isBeforeCutoff) {
        const coveredItem: SavingsSubItem = {
          status: 'covered_by_opening',
          amount: 0,
          notes: 'Sudah tercakup dalam Saldo Awal',
        };
        monthsData.push({
          w: 0,
          b: 0,
          l: 0,
          bal_w: runningCumW,
          bal_b: runningCumB,
          bal_l: runningCumL,
          cum_w: runningCumW,
          cum_b: runningCumB,
          cum_l: runningCumL,
          isOpeningBalanceMonth: i === 0,
          isBeforeCutoff: true,
          wajib: { ...coveredItem },
          belanja: { ...coveredItem },
          lebaran: { ...coveredItem },
        });
      } else if (isBeforeJoin && !hasAnyPayment) {
        monthsData.push(null);
      } else {
        // Resolusi tarif dinamis berjenjang untuk periode kolom i
        const applicableTariffW = rateTiers.length > 0
          ? getApplicableTierRate(rateTiers, 'WAJIB', colPeriod.year, colPeriod.month)
          : targetWajib;
        const applicableTariffB = rateTiers.length > 0
          ? getApplicableTierRate(rateTiers, 'BELANJA', colPeriod.year, colPeriod.month)
          : targetBelanja;
        const applicableTariffL = rateTiers.length > 0
          ? getApplicableTierRate(rateTiers, 'LEBARAN', colPeriod.year, colPeriod.month)
          : targetLebaran;

        // Evaluasi status bulan untuk WAJIB
        const isPostAllocationW = hasPartialW && i > partialColW;
        const isUnbilledW = isPostAllocationW || (
          colPeriod.periodIndex >= (currentYear * 12 + currentMonth1Based) &&
          i > lastPaidColW &&
          (!billedMonthsW.has(i) || colPeriod.periodIndex >= (currentYear * 12 + currentMonth1Based))
        );
        let statusW: SavingsSubItem['status'];
        let amtW = p.w;

        if (p.w >= applicableTariffW) {
          statusW = 'paid';
          amtW = p.w;
        } else if (p.w > 0) {
          statusW = 'partial';
          amtW = p.w;
        } else if (isBeforeJoin) {
          statusW = 'not_applicable';
          amtW = 0;
        } else if (isUnbilledW) {
          statusW = 'unbilled';
          amtW = 0;
        } else {
          statusW = 'unpaid';
          amtW = applicableTariffW;
        }

        const wajibItem: SavingsSubItem = {
          status: statusW,
          amount: amtW,
          ...(statusW === 'partial' ? { targetAmount: applicableTariffW } : {}),
          ...(p.ref_w ? { reference_no: p.ref_w } : {}),
          ...(p.notes_w ? { notes: p.notes_w } : {}),
        };

        // Evaluasi status bulan untuk BELANJA
        const isPostAllocationB = hasPartialB && i > partialColB;
        const isUnbilledB = isPostAllocationB || (
          colPeriod.periodIndex >= (currentYear * 12 + currentMonth1Based) &&
          i > lastPaidColB &&
          (!billedMonthsB.has(i) || colPeriod.periodIndex >= (currentYear * 12 + currentMonth1Based))
        );
        let statusB: SavingsSubItem['status'];
        let amtB = p.b;

        if (p.b >= applicableTariffB) {
          statusB = 'paid';
          amtB = p.b;
        } else if (p.b > 0) {
          statusB = 'partial';
          amtB = p.b;
        } else if (isBeforeJoin) {
          statusB = 'not_applicable';
          amtB = 0;
        } else if (isUnbilledB) {
          statusB = 'unbilled';
          amtB = 0;
        } else {
          statusB = 'unpaid';
          amtB = applicableTariffB;
        }

        const belanjaItem: SavingsSubItem = {
          status: statusB,
          amount: amtB,
          ...(statusB === 'partial' ? { targetAmount: applicableTariffB } : {}),
          ...(p.ref_b ? { reference_no: p.ref_b } : {}),
          ...(p.notes_b ? { notes: p.notes_b } : {}),
        };

        // Evaluasi status bulan untuk LEBARAN
        const isPostAllocationL = hasPartialL && i > partialColL;
        const isUnbilledL = isPostAllocationL || (
          colPeriod.periodIndex >= (currentYear * 12 + currentMonth1Based) &&
          i > lastPaidColL &&
          (!billedMonthsL.has(i) || colPeriod.periodIndex >= (currentYear * 12 + currentMonth1Based))
        );
        let statusL: SavingsSubItem['status'];
        let amtL = p.l;

        if (p.l >= applicableTariffL) {
          statusL = 'paid';
          amtL = p.l;
        } else if (p.l > 0) {
          statusL = 'partial';
          amtL = p.l;
        } else if (isBeforeJoin) {
          statusL = 'not_applicable';
          amtL = 0;
        } else if (isUnbilledL) {
          statusL = 'unbilled';
          amtL = 0;
        } else {
          statusL = 'unpaid';
          amtL = applicableTariffL;
        }

        const lebaranItem: SavingsSubItem = {
          status: statusL,
          amount: amtL,
          ...(statusL === 'partial' ? { targetAmount: applicableTariffL } : {}),
          ...(p.ref_l ? { reference_no: p.ref_l } : {}),
          ...(p.notes_l ? { notes: p.notes_l } : {}),
        };

        monthsData.push({
          ...p,
          bal_w: runningCumW,
          bal_b: runningCumB,
          bal_l: runningCumL,
          cum_w: runningCumW,
          cum_b: runningCumB,
          cum_l: runningCumL,
          isOpeningBalanceMonth: i === 0,
          wajib: wajibItem,
          belanja: belanjaItem,
          lebaran: lebaranItem,
        });

        if (wajibItem.status !== 'not_applicable' && wajibItem.status !== 'unbilled' && wajibItem.status !== 'covered_by_opening') {
          expectedCount += 1;
          if (wajibItem.status === 'paid') paidCount += 1;
        }
        if (belanjaItem.status !== 'not_applicable' && belanjaItem.status !== 'unbilled' && belanjaItem.status !== 'covered_by_opening') {
          expectedCount += 1;
          if (belanjaItem.status === 'paid') paidCount += 1;
        }
        if (lebaranItem.status !== 'not_applicable' && lebaranItem.status !== 'unbilled' && lebaranItem.status !== 'covered_by_opening') {
          expectedCount += 1;
          if (lebaranItem.status === 'paid') paidCount += 1;
        }
      }
    }

    const compliance = expectedCount > 0 ? Math.round((paidCount / expectedCount) * 100) : 100;

    // Hitung posisi saldo kas riil netto (dari view atau fallback dari log transaksi)
    let netSavings = netSavingsByMember[m.id];
    if (!netSavings) {
      const memberTxList = memberTxs[m.id] || [];
      let fallbackWajib = 0;
      let fallbackBelanja = 0;
      let fallbackLebaran = 0;

      for (const t of memberTxList) {
        const isWajib = wajibTypeIds.has(t.tId) || t.tId === wajibId;
        const isBelanja = belanjaTypeIds.has(t.tId) || t.tId === belanjaId;
        const isLebaran = lebaranTypeIds.has(t.tId) || t.tId === lebaranId;

        const amt = Math.abs(t.amt);
        if (t.type === 'deposit') {
          if (isWajib) fallbackWajib += amt;
          if (isBelanja) fallbackBelanja += amt;
          if (isLebaran) fallbackLebaran += amt;
        } else if (t.type === 'withdrawal') {
          if (isWajib) fallbackWajib -= amt;
          if (isBelanja) fallbackBelanja -= amt;
          if (isLebaran) fallbackLebaran -= amt;
        }
      }

      netSavings = {
        wajib: fallbackWajib,
        belanja: fallbackBelanja,
        lebaran: fallbackLebaran,
        total: fallbackWajib + fallbackBelanja + fallbackLebaran,
      };
    }

    return {
      member_id: m.id,
      nrp: m.nrp,
      nama: m.nama,
      pokokLunas: pokokPaidByMember.has(m.id),
      pokokBalance: openingPokokByMember[m.id] || 0,
      compliance,
      balances: { w: 0, b: 0, l: 0 },
      openingBalance: openBal,
      priorSummary,
      cutoffDate: cutoffInfo?.dateStr || null,
      cutoffYear: cutoffInfo?.year || null,
      cutoffMonth: cutoffInfo?.month || null,
      cutoffPeriodIndex: cutoffInfo?.periodIndex || null,
      periods,
      months: monthsData,
      created_at: m.created_at,
      tgl_awal_anggota: m.tgl_awal_anggota || m.created_at,
      netSavings,
    };
  });

  return {
    rows: results,
    targets: {
      wajib: targetWajib,
      belanja: targetBelanja,
      lebaran: targetLebaran,
    },
    rateTiers,
    periods,
    windowStartIndex: cutoffIndex,
    cutoffIndex,
    cutoffDate: cutoffInfo?.dateStr || null,
    cutoffYear: cutoffInfo?.year || null,
    cutoffMonth: cutoffInfo?.month || null,
    cutoffPeriodIndex: cutoffInfo?.periodIndex || null,
  };
}

export interface ImportSavingsMatrixLedgerResult {
  success: boolean;
  totalMembers: number;
  totalTransactions: number;
  totalSuccess?: number;
  totalFailed?: number;
  errorList?: string[];
  errors?: string[];
}

export interface ImportSavingsMatrixProgress {
  processed: number;
  total: number;
  percent: number;
  currentMember?: string;
  memberIndex?: number;
  totalMembers?: number;
  message?: string;
}

/**
 * Menyinkronkan mutasi bulanan hasil parsing matriks simpanan Excel ke tabel deposit_transactions.
 * Dilengkapi isolasi pemrosesan per anggota (try-catch), auto-provisioning akun rekening member_deposits,
 * pembersihan mutasi lama/migrasi gelondongan, dan chunking massal maksimal 100 baris per request.
 */
export async function importSavingsMatrixLedger(
  depositTypeCode: 'WAJIB' | 'BELANJA' | 'LEBARAN',
  mutations: ParsedMonthlyDeposit[],
  onProgress?: (progress: ImportSavingsMatrixProgress) => void
): Promise<ImportSavingsMatrixLedgerResult> {
  const errorList: string[] = [];

  if (!mutations || mutations.length === 0) {
    return {
      success: true,
      totalMembers: 0,
      totalTransactions: 0,
      totalSuccess: 0,
      totalFailed: 0,
      errorList: [],
      errors: []
    };
  }

  try {
    // 1. Resolusi Deposit Type ID
    const { data: dTypes, error: dtErr } = await supabase
      .from('deposit_types')
      .select('id, name, code');

    if (dtErr || !dTypes || dTypes.length === 0) {
      const msg = 'Gagal memuat tipe simpanan: ' + (dtErr?.message || 'Data deposit_types kosong');
      return {
        success: false,
        totalMembers: 0,
        totalTransactions: 0,
        totalSuccess: 0,
        totalFailed: 0,
        errorList: [msg],
        errors: [msg]
      };
    }

    let targetType: DepositTypeItem | undefined;
    if (depositTypeCode === 'WAJIB') {
      targetType = matchDepositType(dTypes, ['WAJIB', 'SW'], ['wajib']);
    } else if (depositTypeCode === 'BELANJA') {
      targetType = matchDepositType(dTypes, ['BELANJA', 'SB'], ['belanja']);
    } else if (depositTypeCode === 'LEBARAN') {
      targetType = matchDepositType(dTypes, ['LEBARAN', 'SL'], ['lebaran', 'hari raya']);
    }

    if (!targetType) {
      const msg = `Tipe simpanan "${depositTypeCode}" tidak ditemukan dalam database.`;
      return {
        success: false,
        totalMembers: 0,
        totalTransactions: 0,
        totalSuccess: 0,
        totalFailed: 0,
        errorList: [msg],
        errors: [msg]
      };
    }

    // 2. Auto-Provisioning Akun member_deposits
    const uniqueNrps = Array.from(
      new Set(mutations.map(m => String(m.nrp || '').trim()).filter(Boolean))
    );

    // Ambil seluruh ID anggota dari public.anggota yang cocok dengan nrp pada file Excel
    const nrpToMemberMap = new Map<string, any>();
    const NRP_CHUNK_SIZE = 100;
    for (let i = 0; i < uniqueNrps.length; i += NRP_CHUNK_SIZE) {
      const chunk = uniqueNrps.slice(i, i + NRP_CHUNK_SIZE);
      const { data: members, error: mErr } = await supabase
        .from('anggota')
        .select('id, nrp, nama, status, membership_status')
        .in('nrp', chunk);

      if (mErr) {
        const msg = 'Gagal memuat data anggota: ' + mErr.message;
        return {
          success: false,
          totalMembers: 0,
          totalTransactions: 0,
          totalSuccess: 0,
          totalFailed: 0,
          errorList: [msg],
          errors: [msg]
        };
      }

      if (members) {
        for (const m of members) {
          if (m.nrp) {
            nrpToMemberMap.set(String(m.nrp).trim().toUpperCase(), m);
          }
        }
      }
    }

    const missingNrps = uniqueNrps.filter(nrp => !nrpToMemberMap.has(nrp.toUpperCase()));
    if (missingNrps.length > 0) {
      errorList.push(`Beberapa NRP tidak ditemukan di database: ${missingNrps.join(', ')}`);
    }

    // Saring mutasi valid (anggota ada di database dan nominal > 0)
    const validMutations = mutations.filter(
      m => nrpToMemberMap.has(String(m.nrp || '').trim().toUpperCase()) && m.amount > 0
    );

    if (validMutations.length === 0) {
      const msg = 'Tidak ada data mutasi yang cocok dengan anggota aktif di sistem.';
      errorList.unshift(msg);
      return {
        success: false,
        totalMembers: 0,
        totalTransactions: 0,
        totalSuccess: 0,
        totalFailed: 0,
        errorList,
        errors: errorList
      };
    }

    // Identifikasi urutan anggota unik yang akan diproses
    const matchedMembers: any[] = [];
    const seenMemberIds = new Set<string>();
    for (const nrp of uniqueNrps) {
      const member = nrpToMemberMap.get(nrp.toUpperCase());
      if (member && !seenMemberIds.has(member.id)) {
        seenMemberIds.add(member.id);
        matchedMembers.push(member);
      }
    }

    const matchedMemberIds = matchedMembers.map(m => m.id);

    // Periksa akun rekening member_deposits yang sudah ada
    const memberIdToDepositId = new Map<string, string>();
    for (let i = 0; i < matchedMemberIds.length; i += 100) {
      const chunkIds = matchedMemberIds.slice(i, i + 100);
      const { data: existingDeposits, error: depErr } = await supabase
        .from('member_deposits')
        .select('id, member_id, deposit_type_id')
        .eq('deposit_type_id', targetType.id)
        .in('member_id', chunkIds);

      if (depErr) {
        const msg = 'Gagal memuat member_deposits: ' + depErr.message;
        errorList.push(msg);
        return {
          success: false,
          totalMembers: 0,
          totalTransactions: 0,
          totalSuccess: 0,
          totalFailed: 0,
          errorList,
          errors: errorList
        };
      }

      if (existingDeposits) {
        for (const dep of existingDeposits) {
          memberIdToDepositId.set(dep.member_id, dep.id);
        }
      }
    }

    // Auto-provision jika ada anggota yang belum memiliki baris rekening di member_deposits
    const missingDepositMembers = matchedMembers.filter(m => !memberIdToDepositId.has(m.id));
    if (missingDepositMembers.length > 0) {
      const newDepositRows = missingDepositMembers.map(mem => ({
        member_id: mem.id,
        deposit_type_id: targetType!.id,
        is_terminated: false,
        status: 'active'
      }));

      for (let i = 0; i < newDepositRows.length; i += 100) {
        const insertChunk = newDepositRows.slice(i, i + 100);
        const insBuilder: any = supabase.from('member_deposits').insert(insertChunk);

        let createdDeps: any = null;
        if (typeof insBuilder.select === 'function') {
          const { data, error } = await insBuilder.select('id, member_id');
          if (error) {
            console.warn('Gagal insert member_deposits:', error.message);
          } else {
            createdDeps = data;
          }
        } else {
          const { error } = await insBuilder;
          if (error) {
            console.warn('Gagal insert member_deposits:', error.message);
          }
        }

        if (!createdDeps || createdDeps.length === 0) {
          const chunkMemberIds = insertChunk.map(r => r.member_id);
          const { data: refetched } = await supabase
            .from('member_deposits')
            .select('id, member_id')
            .eq('deposit_type_id', targetType.id)
            .in('member_id', chunkMemberIds);
          createdDeps = refetched || [];
        }

        if (createdDeps) {
          for (const cd of createdDeps) {
            memberIdToDepositId.set(cd.member_id, cd.id);
          }
        }
      }
    }

    // 3. Isolasi Pemrosesan per Anggota (Try-Catch per Baris) & 4. Chunking Massal
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalTransactions = 0;
    const totalMemberCount = matchedMembers.length;

    for (let idx = 0; idx < totalMemberCount; idx++) {
      const member = matchedMembers[idx];
      const memberNrpUpper = String(member.nrp || '').trim().toUpperCase();
      const currentMemberName = member.nama || member.nrp;

      if (onProgress) {
        const memberIdx = idx + 1;
        const percent = Math.round((idx / totalMemberCount) * 100);
        onProgress({
          processed: totalTransactions,
          total: validMutations.length,
          percent,
          currentMember: currentMemberName,
          memberIndex: memberIdx,
          totalMembers: totalMemberCount,
          message: `Memproses anggota ${memberIdx} dari ${totalMemberCount}...`
        });
      }

      try {
        let depositAccountId = memberIdToDepositId.get(member.id);
        if (!depositAccountId) {
          // Auto-provision via upsert jika belum terdaftar di map (menjamin akun Setyawan Pratama dkk selalu tersedia)
          const { data: upsertData } = await supabase
            .from('member_deposits')
            .upsert(
              {
                member_id: member.id,
                deposit_type_id: targetType.id,
                is_terminated: false,
                status: 'active'
              },
              { onConflict: 'member_id,deposit_type_id' }
            )
            .select('id')
            .maybeSingle();

          if (upsertData?.id) {
            depositAccountId = upsertData.id;
          } else {
            const { data: refetched } = await supabase
              .from('member_deposits')
              .select('id')
              .eq('member_id', member.id)
              .eq('deposit_type_id', targetType.id)
              .maybeSingle();
            depositAccountId = refetched?.id;
          }

          if (depositAccountId) {
            memberIdToDepositId.set(member.id, depositAccountId);
          }
        }

        if (!depositAccountId) {
          throw new Error(`Akun rekening simpanan tidak ditemukan untuk anggota ${currentMemberName}`);
        }

        // Hapus seluruh mutasi lama milik akun simpanan ini untuk memastikan data baru bersih (Strict Clean Overwrite)
        const { error: delErr } = await supabase
          .from('deposit_transactions')
          .delete()
          .eq('member_deposit_id', depositAccountId);

        if (delErr) {
          console.error(`Gagal menghapus mutasi lama untuk deposit ID ${depositAccountId}:`, delErr);
          throw delErr;
        }

        // d. Kumpulkan mutasi bulanan milik anggota ini yang memiliki amount > 0
        const memberMutations = validMutations.filter(
          m => String(m.nrp || '').trim().toUpperCase() === memberNrpUpper
        );

        const memberTransactions = memberMutations.map(m => ({
          member_deposit_id: depositAccountId,
          transaction_type: 'deposit',
          amount: m.amount,
          for_month: m.month,
          for_year: m.year,
          description: 'Import Matriks Buku Besar Excel'
        }));

        // e. Chunking Massal Transaksi Baru (Maksimal 100 Baris per Request)
        const CHUNK_SIZE = 100;
        for (let i = 0; i < memberTransactions.length; i += CHUNK_SIZE) {
          const batch = memberTransactions.slice(i, i + CHUNK_SIZE);
          const { error: insErr } = await supabase
            .from('deposit_transactions')
            .insert(batch);
          if (insErr) {
            console.error(`Gagal menyimpan batch transaksi ${i} - ${i + CHUNK_SIZE} (${currentMemberName}):`, insErr);
            throw insErr;
          }
        }

        totalTransactions += memberTransactions.length;
        totalSuccess++;
      } catch (memberErr: any) {
        totalFailed++;
        const errMsg = `Gagal memproses anggota ${currentMemberName} (${member.nrp}): ${memberErr?.message || String(memberErr)}`;
        console.error(errMsg, memberErr);
        errorList.push(errMsg);
      }

      if (onProgress) {
        const memberIdx = idx + 1;
        const percent = Math.round((memberIdx / totalMemberCount) * 100);
        onProgress({
          processed: totalTransactions,
          total: validMutations.length,
          percent,
          currentMember: currentMemberName,
          memberIndex: memberIdx,
          totalMembers: totalMemberCount,
          message: `Memproses anggota ${memberIdx} dari ${totalMemberCount}...`
        });
      }
    }

    return {
      success: totalSuccess > 0,
      totalMembers: totalMemberCount,
      totalTransactions,
      totalSuccess,
      totalFailed,
      errorList,
      errors: errorList.length > 0 ? errorList : undefined
    };
  } catch (err: any) {
    const fatalMsg = 'Terjadi kesalahan saat memproses impor mutasi: ' + (err?.message || String(err));
    return {
      success: false,
      totalMembers: 0,
      totalTransactions: 0,
      totalSuccess: 0,
      totalFailed: 0,
      errorList: [fatalMsg],
      errors: [fatalMsg]
    };
  }
}

export interface PayPrincipalSavingsPayload {
  memberId: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
}

/**
 * Melakukan pembayaran / pelunasan Simpanan Pokok anggota:
 * 1. Mengidentifikasi atau memastikan akun rekening member_deposits untuk jenis simpanan POKOK.
 * 2. Menyisipkan transaksi setoran ke public.deposit_transactions.
 * 3. Mengembalikan mutasi transaksi yang tersimpan.
 */
export async function payMemberPrincipalSavings(payload: PayPrincipalSavingsPayload): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const { memberId, amount, paymentMethod = 'cash', notes } = payload;
    if (!memberId) {
      throw new Error('Member ID wajib diisi');
    }
    if (!amount || amount <= 0) {
      throw new Error('Nominal setoran simpanan pokok harus lebih dari 0');
    }

    // 1. Ambil atau identifikasi deposit_types untuk POKOK
    let pokokTypeId: string | null = null;
    const { data: dTypes, error: dtError } = await supabase
      .from('deposit_types')
      .select('id, code, name');

    if (dtError) {
      console.warn('Gagal memuat deposit_types:', dtError);
    }

    if (dTypes && dTypes.length > 0) {
      const matched = matchDepositType(dTypes, ['POKOK', 'SP'], ['pokok']);
      if (matched) {
        pokokTypeId = matched.id;
      }
    }

    if (!pokokTypeId) {
      const directQuery: any = supabase
        .from('deposit_types')
        .select('id, code, name');
      const { data: directData } = await directQuery;
      if (directData && Array.isArray(directData)) {
        const found = directData.find((d: any) =>
          (d.code || '').toUpperCase() === 'POKOK' ||
          (d.code || '').toUpperCase() === 'SP' ||
          (d.name || '').toLowerCase().includes('pokok')
        );
        if (found) {
          pokokTypeId = found.id;
        }
      }
    }

    if (!pokokTypeId) {
      throw new Error('Jenis simpanan pokok tidak ditemukan di master deposit_types.');
    }

    // 2. Cari atau buat akun rekening member_deposits milik anggota untuk POKOK
    let memberDepositId: string | null = null;
    const checkQuery: any = supabase
      .from('member_deposits')
      .select('id, member_id, deposit_type_id');

    if (typeof checkQuery.eq === 'function') {
      const eqMember = checkQuery.eq('member_id', memberId);
      if (eqMember && typeof eqMember.eq === 'function') {
        const eqType = eqMember.eq('deposit_type_id', pokokTypeId);
        const checkRes = typeof eqType.maybeSingle === 'function'
          ? await eqType.maybeSingle()
          : (typeof eqType.single === 'function' ? await eqType.single() : await eqType);
        if (checkRes?.data) {
          const row = Array.isArray(checkRes.data) ? checkRes.data[0] : checkRes.data;
          memberDepositId = row?.id;
        }
      }
    }

    // Jika rekening belum ada, buat baris rekening baru di public.member_deposits
    if (!memberDepositId) {
      const tableDeposits: any = supabase.from('member_deposits');
      const insPayload = {
        member_id: memberId,
        deposit_type_id: pokokTypeId,
        is_terminated: false,
        created_at: new Date().toISOString()
      };

      const insQuery = tableDeposits.insert(insPayload);
      let insRes: any = null;
      if (typeof insQuery.select === 'function') {
        const selQuery = insQuery.select('id');
        insRes = typeof selQuery.maybeSingle === 'function'
          ? await selQuery.maybeSingle()
          : (typeof selQuery.single === 'function' ? await selQuery.single() : await selQuery);
      } else {
        insRes = await insQuery;
      }

      if (insRes?.error) {
        throw insRes.error;
      }
      if (insRes?.data) {
        const row = Array.isArray(insRes.data) ? insRes.data[0] : insRes.data;
        memberDepositId = row?.id;
      }
    }

    if (!memberDepositId) {
      throw new Error('Gagal membuat rekening simpanan pokok anggota.');
    }

    // 3. Sisipkan transaksi setoran ke public.deposit_transactions
    const refNo = `KW-POKOK-${Date.now()}`;
    const txRow = {
      member_deposit_id: memberDepositId,
      transaction_type: 'deposit',
      amount: amount,
      payment_method: paymentMethod || 'cash',
      reference_no: refNo,
      description: notes || 'Pelunasan Simpanan Pokok Anggota',
      created_at: new Date().toISOString()
    };

    const insertTxQuery: any = supabase.from('deposit_transactions').insert(txRow);
    let insertedData: any = null;

    if (typeof insertTxQuery.select === 'function') {
      const sel = insertTxQuery.select();
      const res = typeof sel.single === 'function' ? await sel.single() : await sel;
      if (res?.error) throw res.error;
      insertedData = res?.data;
    } else {
      const res = await insertTxQuery;
      if (res?.error) throw res.error;
      insertedData = res?.data;
    }

    return {
      success: true,
      data: insertedData || txRow
    };
  } catch (err: any) {
    console.error('Error saat pelunasan simpanan pokok:', err);
    return {
      success: false,
      error: err?.message || String(err)
    };
  }
}


import { supabase } from '../lib/supabaseClient';
import {
  getRateTiers,
  getApplicableRate,
  buildSavingsRateResolver,
  SavingsRateTier,
  DepositTypeRateRef
} from './savingsRateService';
import { getLastCompletedLebaranCycle } from './bulkWithdrawalService';

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'
];

export const FULL_MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export interface CheckMonthPayload {
  memberDepositId: string;
  month: number;
  year: number;
  amount: number;
  referenceNo?: string;
  paymentMethod?: string;
  notes?: string;
  description?: string;
}

export interface MonthAuditHistoryItem {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  amount?: number;
  forMonth: number;
  forYear: number;
  referenceNo?: string;
  paymentMethod?: string;
  notes?: string;
  performerName?: string;
  performerId?: string;
  createdAt: string;
}

export interface BulkCheckProgress {
  current: number;
  total: number;
  currentMemberName: string;
}

export interface ReconcileSingleMemberOptions {
  rateTiers?: SavingsRateTier[];
  depTypes?: any[];
  joinDate?: string | null;
  startYear?: number;
  endYear?: number;
  memberDeposits?: any[];
  targetBalance?: number;
  lastLebaranCutOffDate?: string | null;
  initialSavingsCutOffDate?: string | Date | null;
  isPostCutOffTarget?: boolean;
}

export interface ReconcileSingleMemberResult {
  success: boolean;
  memberDepositId?: string;
  matchedKeys: string[];
  insertedCount: number;
  allocatedTransactions?: FifoAllocatedTransaction[];
  totalAllocated?: number;
}

export interface FifoAllocatedTransaction {
  member_deposit_id?: string;
  transaction_type: 'deposit';
  amount: number;
  for_month: number;
  for_year: number;
  description: string;
  key: string;
  applicableRate: number;
  isPartial: boolean;
}

export interface FifoAllocationResult {
  matchedKeys: string[];
  allocatedTransactions: FifoAllocatedTransaction[];
  totalAllocated: number;
  remainingBalance: number;
  partialTransaction?: FifoAllocatedTransaction;
}

/**
 * Memeriksa apakah suatu periode (tahun, bulan) berada sebelum tanggal masuk anggota
 */
export function isMonthBeforeJoin(
  year: number,
  month: number,
  joinDate?: string | Date | null
): boolean {
  if (!joinDate) return false;
  const d = typeof joinDate === 'string' ? new Date(joinDate) : joinDate;
  if (isNaN(d.getTime())) return false;

  const joinYear = d.getFullYear();
  const joinMonth = d.getMonth() + 1;

  const targetIndex = year * 12 + month;
  const joinIndex = joinYear * 12 + joinMonth;

  return targetIndex < joinIndex;
}

/**
 * Memeriksa apakah suatu periode (tahun, bulan) berada sebelum atau tepat pada tanggal cut-off siklus pencairan
 */
export function isMonthSettledByCutOff(
  year: number,
  month: number,
  cutOffDate?: string | Date | null
): boolean {
  if (!cutOffDate) return false;
  let cutOffYear: number;
  let cutOffMonth: number;

  if (typeof cutOffDate === 'string') {
    const parts = cutOffDate.slice(0, 10).split('-');
    if (parts.length >= 2) {
      cutOffYear = parseInt(parts[0], 10);
      cutOffMonth = parseInt(parts[1], 10);
      if (isNaN(cutOffYear) || isNaN(cutOffMonth)) return false;
    } else {
      const d = new Date(cutOffDate);
      if (isNaN(d.getTime())) return false;
      cutOffYear = d.getFullYear();
      cutOffMonth = d.getMonth() + 1;
    }
  } else {
    if (isNaN(cutOffDate.getTime())) return false;
    cutOffYear = cutOffDate.getFullYear();
    cutOffMonth = cutOffDate.getMonth() + 1;
  }

  const targetIndex = year * 12 + month;
  const cutOffIndex = cutOffYear * 12 + cutOffMonth;

  return targetIndex <= cutOffIndex;
}

/**
 * Helper untuk memeriksa apakah suatu bulan berada SEBELUM bulan pengesahan Saldo Awal Simpanan (cut-off).
 * Bulan sebelum cut-off dianggap sudah tercakup penuh di Saldo Awal dan tidak dicicil ulang.
 */
export function isMonthBeforeCutOff(
  year: number,
  month: number,
  cutOffDate?: string | Date | null
): boolean {
  if (!cutOffDate) return false;
  let cutOffYear = 0;
  let cutOffMonth = 0;

  if (typeof cutOffDate === 'string') {
    const match = cutOffDate.trim().match(/(\d{4})-(\d{1,2})/);
    if (match) {
      cutOffYear = parseInt(match[1], 10);
      cutOffMonth = parseInt(match[2], 10);
    } else {
      const d = new Date(cutOffDate);
      if (isNaN(d.getTime())) return false;
      cutOffYear = d.getFullYear();
      cutOffMonth = d.getMonth() + 1;
    }
  } else {
    if (isNaN(cutOffDate.getTime())) return false;
    cutOffYear = cutOffDate.getFullYear();
    cutOffMonth = cutOffDate.getMonth() + 1;
  }

  if (isNaN(cutOffYear) || isNaN(cutOffMonth) || cutOffMonth < 1 || cutOffMonth > 12) return false;

  const targetIndex = year * 12 + month;
  const cutOffIndex = cutOffYear * 12 + cutOffMonth;

  return targetIndex < cutOffIndex;
}

/**
 * Mengambil tanggal pengesahan saldo awal (initial_savings_effective_date) dari system_settings,
 * atau fallback dari deskripsi transaksi 'Saldo Awal Simpanan'.
 */
export async function getInitialSavingsCutOffDate(transactions?: any[]): Promise<string | null> {
  try {
    const query: any = supabase.from('system_settings').select('key, value');
    if (typeof query?.eq === 'function') {
      const eqQ = query.eq('key', 'initial_savings_effective_date');
      const res = typeof eqQ?.maybeSingle === 'function'
        ? await eqQ.maybeSingle()
        : (typeof eqQ?.single === 'function' ? await eqQ.single() : await eqQ);
      const rowData = Array.isArray(res?.data) ? res.data[0] : res?.data;
      if (rowData?.value) {
        return String(rowData.value).slice(0, 10);
      }
    } else if (query && typeof query.then === 'function') {
      const res = await query;
      const rows = Array.isArray(res?.data) ? res.data : (res?.data ? [res.data] : []);
      const found = rows.find((r: any) => r?.key === 'initial_savings_effective_date');
      if (found?.value) {
        return String(found.value).slice(0, 10);
      }
    }
  } catch {
    // Abaikan dan lanjut ke fallback transaksi
  }

  if (Array.isArray(transactions) && transactions.length > 0) {
    let latestDate = '';
    for (const tx of transactions) {
      const desc = String(tx?.description || '');
      if (desc.toLowerCase().includes('saldo awal simpanan')) {
        const match = desc.match(/(\d{4}-\d{2}-\d{2})/);
        if (match && (!latestDate || match[1] > latestDate)) {
          latestDate = match[1];
        }
      }
    }
    if (latestDate) return latestDate;
  }

  return null;
}

/**
 * Helper untuk mengambil cut-off date siklus pencairan lebaran terakhir yang COMPLETED
 */
export async function getLastCompletedLebaranCutOff(): Promise<string | null> {
  try {
    const cycle = await getLastCompletedLebaranCycle();
    return cycle?.cut_off_date || null;
  } catch (err) {
    console.warn('Gagal mengambil cut-off date lebaran terakhir:', err);
    return null;
  }
}

export { getLastCompletedLebaranCycle };

export interface TimelineMonthItem {
  year: number;
  month: number;
  label: string;
  key: string;
}

function parseYearMonthFromDate(dateVal?: string | Date | null): { year: number; month: number } | null {
  if (!dateVal) return null;
  if (typeof dateVal === 'string') {
    const match = dateVal.trim().match(/(\d{4})-(\d{1,2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
        return { year: y, month: m };
      }
    }
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }
    return null;
  }
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    return { year: dateVal.getFullYear(), month: dateVal.getMonth() + 1 };
  }
  return null;
}

/**
 * Menghasilkan timeline bulan matriks anggota mulai dari periode pengesahan saldo awal (cut-off)
 * hingga akhir tahun target, atau fallback ke tanggal bergabung anggota jika cut-off belum ditetapkan.
 * Tidak menghasilkan kolom bulan pra-cut-off.
 */
export function generateMemberTimeline(
  effectiveDateOrOptions?:
    | string
    | Date
    | null
    | {
        effectiveDate?: string | Date | null;
        cutOffDate?: string | Date | null;
        joinDate?: string | Date | null;
        startYear?: number;
        endYear?: number;
        order?: 'asc' | 'desc';
      },
  joinDateArg?: string | Date | null,
  endYearArg?: number,
  orderArg: 'asc' | 'desc' = 'asc'
): TimelineMonthItem[] {
  const opts =
    typeof effectiveDateOrOptions === 'object' &&
    effectiveDateOrOptions !== null &&
    !(effectiveDateOrOptions instanceof Date)
      ? effectiveDateOrOptions
      : null;

  const effectiveDate: string | Date | null | undefined = opts
    ? (opts.effectiveDate ?? opts.cutOffDate)
    : (effectiveDateOrOptions as string | Date | null | undefined);
  const joinDate = opts ? (joinDateArg ?? opts.joinDate) : joinDateArg;
  const order = opts ? (opts.order ?? orderArg) : orderArg;
  const fallbackStartYear = opts ? opts.startYear : undefined;
  const resolvedEndYearOpt = opts ? (endYearArg ?? opts.endYear) : endYearArg;

  const effectivePeriod = parseYearMonthFromDate(effectiveDate);
  const joinPeriod = parseYearMonthFromDate(joinDate);

  let startYear: number;
  let startMonth: number;

  if (effectivePeriod) {
    startYear = effectivePeriod.year;
    startMonth = effectivePeriod.month;
  } else if (joinPeriod) {
    startYear = joinPeriod.year;
    startMonth = joinPeriod.month;
  } else {
    startYear = fallbackStartYear ?? 2024;
    startMonth = 1;
  }

  const eYear = resolvedEndYearOpt ?? Math.max(2026, new Date().getFullYear(), startYear);

  const list: TimelineMonthItem[] = [];
  for (let y = startYear; y <= eYear; y++) {
    const firstMonth = y === startYear ? startMonth : 1;
    for (let m = firstMonth; m <= 12; m++) {
      list.push({
        year: y,
        month: m,
        label: `${MONTH_NAMES[m - 1]}-${String(y).slice(-2)}`,
        key: `${y}-${String(m).padStart(2, '0')}`
      });
    }
  }

  if (order === 'desc') {
    return list.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
  }
  return list;
}

/**
 * Menghasilkan daftar bulan dalam format grid (default terurut kronologis asc, atau desc).
 * Mendukung parameter opsional bulan mulai atau tanggal cut-off pengesahan saldo awal.
 */
export function generateMonthGrid(
  startYear: number,
  endYear: number,
  order: 'asc' | 'desc' = 'asc',
  effectiveDateOrStartMonth?: number | string | Date | null
): Array<{ year: number; month: number; label: string; key: string }> {
  if (typeof effectiveDateOrStartMonth === 'string' || effectiveDateOrStartMonth instanceof Date) {
    return generateMemberTimeline(effectiveDateOrStartMonth, null, endYear, order);
  }

  const startMonth =
    typeof effectiveDateOrStartMonth === 'number' &&
    effectiveDateOrStartMonth >= 1 &&
    effectiveDateOrStartMonth <= 12
      ? effectiveDateOrStartMonth
      : 1;

  const list: Array<{ year: number; month: number; label: string; key: string }> = [];
  for (let y = startYear; y <= endYear; y++) {
    const firstMonth = y === startYear ? startMonth : 1;
    for (let m = firstMonth; m <= 12; m++) {
      list.push({
        year: y,
        month: m,
        label: `${MONTH_NAMES[m - 1]}-${String(y).slice(-2)}`,
        key: `${y}-${String(m).padStart(2, '0')}`
      });
    }
  }
  if (order === 'desc') {
    return list.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
  }
  return list;
}

/**
 * Menghitung total nominal dari bulan-bulan yang tercentang.
 * Mendukung override nominal parsial riil melalui parameter opsional customAmounts.
 */
export function calculateTotalChecked(
  checkedKeys: Iterable<string>,
  depositTypeCode: string,
  rateTiers: SavingsRateTier[],
  customAmounts?: Map<string, number> | Record<string, number>,
  depositTypes?: DepositTypeRateRef[]
): number {
  let total = 0;
  for (const key of checkedKeys) {
    if (customAmounts) {
      const customAmt = customAmounts instanceof Map
        ? customAmounts.get(key)
        : customAmounts[key];
      if (typeof customAmt === 'number') {
        total += customAmt;
        continue;
      }
    }
    const [yStr, mStr] = key.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (!isNaN(y) && !isNaN(m)) {
      total += getApplicableRate(depositTypeCode, y, m, rateTiers, depositTypes);
    }
  }
  return total;
}

/**
 * Algoritma FIFO komprehensif: Mengalokasikan target saldo ke bulan-bulan kronologis
 * berurutan sesuai tarif aktif bertingkat.
 * Jika terdapat sisa saldo pecahan (remainingBalance < applicableRate && remainingBalance > 0),
 * sisa saldo tersebut dimasukkan ke slot kalender bulan berikutnya dengan status parsial
 * sehingga total alokasi persis seimbang dengan saldo database (selisih = 0).
 */
export function calculateFifoAllocation(
  targetBalance: number,
  months: Array<{ year: number; month: number; key: string }>,
  depositTypeCode: string,
  rateTiers: SavingsRateTier[],
  joinDate?: string | Date | null,
  memberDepositId?: string,
  cutOffDate?: string | Date | null,
  initialSavingsCutOffDate?: string | Date | null,
  depositTypes?: DepositTypeRateRef[]
): FifoAllocationResult {
  if (targetBalance <= 0) {
    return {
      matchedKeys: [],
      allocatedTransactions: [],
      totalAllocated: 0,
      remainingBalance: 0
    };
  }

  let remaining = targetBalance;
  const matchedKeys: string[] = [];
  const allocatedTransactions: FifoAllocatedTransaction[] = [];

  // Urutkan bulan secara kronologis
  const sortedMonths = [...months].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));

  let nextCandidateMonth: { year: number; month: number; key: string } | null = null;
  let lastProcessedMonth: { year: number; month: number } | null = null;

  for (let i = 0; i < sortedMonths.length; i++) {
    const m = sortedMonths[i];
    if (isMonthBeforeJoin(m.year, m.month, joinDate)) {
      continue;
    }
    // Abaikan bulan sebelum tanggal pengesahan Saldo Awal Simpanan (cut-off)
    if (isMonthBeforeCutOff(m.year, m.month, initialSavingsCutOffDate)) {
      continue;
    }
    // Abaikan bulan yang berada pada atau sebelum cut-off date jika tipe simpanan LEBARAN
    if (depositTypeCode === 'LEBARAN' && isMonthSettledByCutOff(m.year, m.month, cutOffDate)) {
      continue;
    }

    const rate = getApplicableRate(depositTypeCode, m.year, m.month, rateTiers, depositTypes);
    if (rate <= 0) continue;

    lastProcessedMonth = { year: m.year, month: m.month };

    if (remaining >= rate) {
      matchedKeys.push(m.key);
      allocatedTransactions.push({
        member_deposit_id: memberDepositId,
        transaction_type: 'deposit',
        amount: rate,
        for_month: m.month,
        for_year: m.year,
        description: `Setoran Matriks ${depositTypeCode} ${MONTH_NAMES[m.month - 1]} ${m.year}`,
        key: m.key,
        applicableRate: rate,
        isPartial: false
      });
      remaining -= rate;
    } else {
      // Saldo tidak mencukupi untuk bulan penuh ini, simpan slot bulan ini untuk alokasi sisa parsial
      nextCandidateMonth = m;
      break;
    }
  }

  let partialTransaction: FifoAllocatedTransaction | undefined;

  // Jika masih ada sisa saldo (remaining > 0), alokasikan ke bulan urutan berikutnya sebagai setoran parsial
  if (remaining > 0) {
    let nextYear: number;
    let nextMonth: number;
    let nextKey: string;

    if (nextCandidateMonth) {
      nextYear = nextCandidateMonth.year;
      nextMonth = nextCandidateMonth.month;
      nextKey = nextCandidateMonth.key;
    } else if (lastProcessedMonth) {
      nextYear = lastProcessedMonth.month === 12 ? lastProcessedMonth.year + 1 : lastProcessedMonth.year;
      nextMonth = lastProcessedMonth.month === 12 ? 1 : lastProcessedMonth.month + 1;
      nextKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    } else {
      const firstValid = sortedMonths.find(m => {
        if (isMonthBeforeJoin(m.year, m.month, joinDate)) return false;
        if (isMonthBeforeCutOff(m.year, m.month, initialSavingsCutOffDate)) return false;
        if (depositTypeCode === 'LEBARAN' && isMonthSettledByCutOff(m.year, m.month, cutOffDate)) return false;
        return true;
      });
      if (firstValid) {
        nextYear = firstValid.year;
        nextMonth = firstValid.month;
        nextKey = firstValid.key;
      } else if (initialSavingsCutOffDate) {
        let icYear = new Date().getFullYear();
        let icMonth = new Date().getMonth() + 1;
        if (typeof initialSavingsCutOffDate === 'string') {
          const match = initialSavingsCutOffDate.trim().match(/(\d{4})-(\d{1,2})/);
          if (match) {
            icYear = parseInt(match[1], 10);
            icMonth = parseInt(match[2], 10);
          }
        } else if (!isNaN(initialSavingsCutOffDate.getTime())) {
          icYear = initialSavingsCutOffDate.getFullYear();
          icMonth = initialSavingsCutOffDate.getMonth() + 1;
        }
        nextYear = icYear;
        nextMonth = icMonth;
        nextKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
      } else if (depositTypeCode === 'LEBARAN' && cutOffDate) {
        let cYear = new Date().getFullYear();
        let cMonth = new Date().getMonth() + 1;
        if (typeof cutOffDate === 'string') {
          const parts = cutOffDate.slice(0, 10).split('-');
          if (parts.length >= 2) {
            cYear = parseInt(parts[0], 10);
            cMonth = parseInt(parts[1], 10);
          }
        } else {
          cYear = cutOffDate.getFullYear();
          cMonth = cutOffDate.getMonth() + 1;
        }
        nextYear = cMonth === 12 ? cYear + 1 : cYear;
        nextMonth = cMonth === 12 ? 1 : cMonth + 1;
        nextKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
      } else {
        const now = new Date();
        nextYear = now.getFullYear();
        nextMonth = now.getMonth() + 1;
        nextKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
      }
    }

    const applicableRate = getApplicableRate(depositTypeCode, nextYear, nextMonth, rateTiers, depositTypes);

    partialTransaction = {
      member_deposit_id: memberDepositId,
      transaction_type: 'deposit',
      amount: remaining,
      for_month: nextMonth,
      for_year: nextYear,
      description: 'Rekonsiliasi Otomatis (Setoran Parsial)',
      key: nextKey,
      applicableRate,
      isPartial: true
    };

    allocatedTransactions.push(partialTransaction);
    matchedKeys.push(nextKey);
    remaining = 0;
  }

  const totalAllocated = allocatedTransactions.reduce((acc, tx) => acc + tx.amount, 0);

  return {
    matchedKeys,
    allocatedTransactions,
    totalAllocated,
    remainingBalance: remaining,
    partialTransaction
  };
}

/**
 * Algoritma FIFO: Mulai dari bulan awal yang valid (setelah tanggal bergabung),
 * centang berurutan ke bulan-bulan berikutnya dengan nominal tarif aktif periode tersebut.
 * Secara default (includePartial=true), menyertakan bulan berikutnya jika terdapat sisa saldo parsial.
 */
export function matchAutomaticFifo(
  targetBalance: number,
  months: Array<{ year: number; month: number; key: string }>,
  depositTypeCode: string,
  rateTiers: SavingsRateTier[],
  joinDate?: string | Date | null,
  options?: { includePartial?: boolean; cutOffDate?: string | Date | null; initialSavingsCutOffDate?: string | Date | null; depositTypes?: DepositTypeRateRef[] }
): string[] {
  const includePartial = options?.includePartial ?? true;
  const res = calculateFifoAllocation(
    targetBalance,
    months,
    depositTypeCode,
    rateTiers,
    joinDate,
    undefined,
    options?.cutOffDate,
    options?.initialSavingsCutOffDate,
    options?.depositTypes
  );
  if (!includePartial && res.partialTransaction) {
    return res.matchedKeys.filter(k => k !== res.partialTransaction?.key);
  }
  return res.matchedKeys;
}

/**
 * Mengidentifikasi tipe simpanan standar ('WAJIB', 'BELANJA', 'LEBARAN') dari objek deposit_types
 */
export function resolveDepositTypeCode(typeObj: any): 'WAJIB' | 'BELANJA' | 'LEBARAN' | null {
  if (!typeObj) return null;
  const actualObj = Array.isArray(typeObj) ? typeObj[0] : typeObj;
  const name = (actualObj?.name || '').toLowerCase();
  const code = (actualObj?.code || '').toUpperCase();

  if (code === 'WAJIB' || code === 'SW' || name.includes('wajib')) return 'WAJIB';
  if (code === 'BELANJA' || code === 'SB' || name.includes('belanja')) return 'BELANJA';
  if (code === 'LEBARAN' || code === 'SL' || name.includes('lebaran') || name.includes('hari raya')) return 'LEBARAN';
  return null;
}

/**
 * Melakukan rekonsiliasi FIFO otomatis saldo buku besar simpanan untuk satu anggota individual.
 * Digunakan untuk rekonsiliasi saldo simpanan anggota secara otomatis berbasis FIFO.
 */
export async function reconcileSingleMemberDeposit(
  memberId: string,
  depositTypeCode: string,
  options?: ReconcileSingleMemberOptions
): Promise<ReconcileSingleMemberResult> {
  const rawType = (depositTypeCode || 'ALL').trim();
  const isAll = !rawType || rawType === 'ALL' || rawType.toLowerCase().includes('semua');

  // Jika ALL / SEMUA, proses WAJIB, BELANJA, dan LEBARAN secara berurutan
  if (isAll) {
    const subTypes: Array<'WAJIB' | 'BELANJA' | 'LEBARAN'> = ['WAJIB', 'BELANJA', 'LEBARAN'];
    let totalInserted = 0;
    const allKeys: string[] = [];
    let lastMdId: string | undefined;

    for (const st of subTypes) {
      const res = await reconcileSingleMemberDeposit(memberId, st, options);
      totalInserted += res.insertedCount;
      allKeys.push(...res.matchedKeys);
      if (res.memberDepositId) lastMdId = res.memberDepositId;
    }

    return {
      success: true,
      memberDepositId: lastMdId,
      matchedKeys: allKeys,
      insertedCount: totalInserted
    };
  }

  const resolved = resolveDepositTypeCode(rawType);
  const targetType = (resolved || rawType.toUpperCase()) as 'WAJIB' | 'BELANJA' | 'LEBARAN';

  // Dapatkan cut-off date simpanan lebaran jika memproses LEBARAN
  let effectiveLebaranCutOff = options?.lastLebaranCutOffDate;
  if (targetType === 'LEBARAN' && effectiveLebaranCutOff === undefined) {
    try {
      const cycle = await getLastCompletedLebaranCycle();
      if (cycle && cycle.cut_off_date) {
        effectiveLebaranCutOff = cycle.cut_off_date;
      } else {
        effectiveLebaranCutOff = null;
      }
    } catch (err) {
      console.warn('Gagal memuat getLastCompletedLebaranCycle di reconcileSingleMemberDeposit:', err);
      effectiveLebaranCutOff = null;
    }
  }

  // 1. Ambil master rate tiers jika tidak disediakan
  let rateTiers = options?.rateTiers;
  if (!rateTiers || rateTiers.length === 0) {
    try {
      rateTiers = await getRateTiers(undefined, false);
    } catch (err) {
      console.warn('Gagal memuat rate tiers via getRateTiers:', err);
    }

    if (!rateTiers || rateTiers.length === 0) {
      try {
        const { data: tiers } = await supabase
          .from('savings_rate_tiers')
          .select('*')
          .order('start_year', { ascending: true })
          .order('start_month', { ascending: true });
        if (tiers && tiers.length > 0) {
          rateTiers = tiers as any;
        }
      } catch (err) {
        console.warn('Gagal query savings_rate_tiers langsung:', err);
      }
    }

    if (!rateTiers) {
      rateTiers = [];
    }
  }

  // 2. Ambil master deposit_types jika tidak disediakan
  let dtList = options?.depTypes;
  if (!dtList || dtList.length === 0) {
    try {
      const { data: dTypes } = await supabase
        .from('deposit_types')
        .select('id, name, code, default_amount');
      dtList = dTypes || [];
    } catch (err) {
      console.warn('Gagal memuat deposit_types:', err);
      dtList = [];
    }
  }

  const findDtId = (keywords: string[], fallbackId: string) => {
    const match = (dtList || []).find((dt: any) => {
      const c = (dt.code || '').toUpperCase();
      const n = (dt.name || '').toLowerCase();
      return keywords.some(k => c === k.toUpperCase() || n.includes(k.toLowerCase()));
    });
    return match?.id || fallbackId;
  };

  let targetDepTypeId: string | undefined;
  if (targetType === 'WAJIB') {
    targetDepTypeId = findDtId(['WAJIB', 'SW'], 'dt-wajib');
  } else if (targetType === 'BELANJA') {
    targetDepTypeId = findDtId(['BELANJA', 'SB'], 'dt-belanja');
  } else if (targetType === 'LEBARAN') {
    targetDepTypeId = findDtId(['LEBARAN', 'SL', 'HARI RAYA'], 'dt-lebaran');
  }

  // 3. Ambil join date jika belum disediakan
  let effectiveJoin = options?.joinDate;
  if (!effectiveJoin && memberId) {
    try {
      let memberQuery: any = supabase
        .from('anggota')
        .select('created_at');

      let memberRecord: any = null;
      if (typeof memberQuery.eq === 'function') {
        const eqQuery = memberQuery.eq('id', memberId);
        if (eqQuery && typeof eqQuery.single === 'function') {
          const resp = await eqQuery.single();
          memberRecord = resp.data;
        } else if (eqQuery && typeof eqQuery.then === 'function') {
          const resp = await eqQuery;
          memberRecord = Array.isArray(resp.data) ? resp.data[0] : resp.data;
        }
      }

      if (memberRecord) {
        effectiveJoin = memberRecord.tgl_awal_anggota || memberRecord.created_at;
      }
    } catch (err) {
      console.warn('Gagal query join date anggota:', err);
    }
  }

  // 4. Ambil data member_deposits untuk member ini
  let mDeposits: any[] = options?.memberDeposits || [];
  if (!mDeposits || mDeposits.length === 0) {
    try {
      let mdQuery: any = supabase
        .from('member_deposits')
        .select(`
          id,
          member_id,
          deposit_type_id,
          deposit_types ( id, name, code ),
          deposit_transactions (
            id,
            amount,
            for_month,
            for_year,
            transaction_type,
            description,
            created_at
          )
        `);

      if (typeof mdQuery.eq === 'function') {
        const resp = await mdQuery.eq('member_id', memberId);
        mDeposits = resp.data || [];
      } else if (typeof mdQuery.in === 'function') {
        const resp = await mdQuery.in('member_id', [memberId]);
        mDeposits = resp.data || [];
      } else {
        const resp = await mdQuery;
        mDeposits = resp.data || [];
      }
    } catch (err) {
      console.warn(`Gagal query member_deposits untuk memberId ${memberId}:`, err);
      mDeposits = [];
    }
  }

  let md = mDeposits.find((d: any) => {
    if (d.member_id && d.member_id !== memberId) return false;
    if (targetDepTypeId && d.deposit_type_id === targetDepTypeId) return true;
    const resolvedCode = resolveDepositTypeCode(d.deposit_types);
    return resolvedCode === targetType;
  });

  // Cari atau buat (upsert) rekening di public.member_deposits jika belum ada
  if (!md && targetDepTypeId) {
    try {
      let existingId: string | null = null;
      const checkQuery: any = supabase
        .from('member_deposits')
        .select('id');

      if (typeof checkQuery.eq === 'function') {
        const eqQuery = checkQuery.eq('member_id', memberId);
        if (eqQuery && typeof eqQuery.eq === 'function') {
          const eqTypeQuery = eqQuery.eq('deposit_type_id', targetDepTypeId);
          const checkRes = typeof eqTypeQuery.maybeSingle === 'function'
            ? await eqTypeQuery.maybeSingle()
            : await eqTypeQuery;
          if (checkRes?.data) {
            const row = Array.isArray(checkRes.data) ? checkRes.data[0] : checkRes.data;
            existingId = row?.id;
          }
        }
      }

      const tableDeposits: any = supabase.from('member_deposits');
      if (!existingId && typeof tableDeposits.insert === 'function') {
        const insQuery: any = tableDeposits
          .insert({
            member_id: memberId,
            deposit_type_id: targetDepTypeId,
            is_terminated: false
          });

        let insRes: any = null;
        if (typeof insQuery.select === 'function') {
          const selQuery = insQuery.select('id');
          insRes = typeof selQuery.maybeSingle === 'function'
            ? await selQuery.maybeSingle()
            : (typeof selQuery.single === 'function' ? await selQuery.single() : await selQuery);
        } else {
          insRes = await insQuery;
        }

        if (insRes?.data) {
          const row = Array.isArray(insRes.data) ? insRes.data[0] : insRes.data;
          existingId = row?.id;
        }
      }

      if (existingId) {
        md = {
          id: existingId,
          member_id: memberId,
          deposit_type_id: targetDepTypeId,
          deposit_types: { id: targetDepTypeId, code: targetType },
          deposit_transactions: []
        };
      }
    } catch (upsertErr) {
      console.warn(`Gagal upsert member_deposits untuk ${memberId} (${targetType}):`, upsertErr);
    }
  }

  if (!md) {
    return { success: true, matchedKeys: [], insertedCount: 0 };
  }

  const txs: any[] = Array.isArray(md.deposit_transactions) ? md.deposit_transactions : [];

  // Resolve Tanggal Pengesahan Saldo Awal (Cut-Off) jika ada
  let effectiveInitialCutOff: string | Date | null = options?.initialSavingsCutOffDate ?? null;
  if (!effectiveInitialCutOff) {
    effectiveInitialCutOff = await getInitialSavingsCutOffDate(txs);
  }

  // Jika effectiveLebaranCutOff belum terisi, coba deteksi dari transaksi penarikan massal yang ada di txs
  if (targetType === 'LEBARAN' && !effectiveLebaranCutOff) {
    const massWithdrawalTx = txs.find((t: any) => {
      const desc = (t.description || '').toLowerCase();
      const notes = (t.notes || '').toLowerCase();
      return (
        t.transaction_type === 'withdrawal' &&
        (desc.includes('pencairan') ||
          desc.includes('lebaran') ||
          desc.includes('thr') ||
          notes.includes('pencairan') ||
          notes.includes('lebaran'))
      );
    });
    if (massWithdrawalTx) {
      effectiveLebaranCutOff = massWithdrawalTx.transaction_date || massWithdrawalTx.created_at || null;
    }
  }

  // 5. Tentukan saldo yang akan direkonsiliasi:
  // Jika mode Cut-Off Saldo Awal aktif, HANYA hitung mutasi setoran baru pasca cut-off (Saldo Awal tetap utuh).
  let targetBalance = options?.targetBalance ?? 0;
  if (effectiveInitialCutOff && (!options?.targetBalance || options?.isPostCutOffTarget === false)) {
    let postCutOffNet = 0;
    for (const t of txs) {
      const desc = (t.description || '').toLowerCase();
      const isOpeningOrBulk =
        desc.includes('saldo awal') ||
        desc.includes('migra') ||
        desc.includes('historical') ||
        desc.includes('one-time') ||
        desc.includes('belum teralokasi');
      const hasExplicitMonth = t.for_month !== null && t.for_month !== undefined && !isNaN(Number(t.for_month));

      if (t.transaction_type === 'deposit') {
        if (isOpeningOrBulk || !hasExplicitMonth) continue;
        if (t.for_year && t.for_month && isMonthBeforeCutOff(Number(t.for_year), Number(t.for_month), effectiveInitialCutOff)) {
          continue;
        }
        postCutOffNet += Number(t.amount || 0);
      } else if (t.transaction_type === 'withdrawal') {
        if (t.for_year && t.for_month && isMonthBeforeCutOff(Number(t.for_year), Number(t.for_month), effectiveInitialCutOff)) {
          continue;
        }
        if (!t.for_month && t.transaction_date && String(t.transaction_date).slice(0, 10) < String(effectiveInitialCutOff).slice(0, 10)) {
          continue;
        }
        postCutOffNet -= Number(t.amount || 0);
      }
    }
    targetBalance = Math.max(0, postCutOffNet);
  } else if (!targetBalance || targetBalance <= 0) {
    if (targetType === 'LEBARAN') {
      let runningBalance = 0;
      for (const t of txs) {
        const amt = Number(t.amount || 0);
        if (t.transaction_type === 'withdrawal') {
          runningBalance -= amt;
        } else {
          runningBalance += amt;
        }
      }
      targetBalance = Math.max(0, runningBalance);
    } else {
      const migrationTx = txs.find((t: any) => {
        const d = (t.description || '').toLowerCase();
        return (
          d.includes('migra') ||
          d.includes('saldo awal') ||
          d.includes('historical') ||
          d.includes('one-time') ||
          d.includes('belum teralokasi')
        );
      });

      if (migrationTx) {
        let totalWithdrawals = 0;
        for (const t of txs) {
          if (t.transaction_type === 'withdrawal') {
            totalWithdrawals += Number(t.amount || 0);
          }
        }
        targetBalance = Math.max(0, Number(migrationTx.amount || 0) - totalWithdrawals);
      } else {
        let net = 0;
        for (const t of txs) {
          const amt = Number(t.amount || 0);
          if (t.transaction_type === 'withdrawal') net -= amt;
          else net += amt;
        }
        targetBalance = Math.max(0, net);
      }
    }
  }

  if (targetBalance <= 0) {
    if (targetType === 'LEBARAN') {
      const unsettledRoutineTxIds = txs
        .filter((t: any) => {
          if (t.transaction_type !== 'deposit') return false;
          if (effectiveLebaranCutOff) {
            if (t.for_year && t.for_month && isMonthSettledByCutOff(t.for_year, t.for_month, effectiveLebaranCutOff)) {
              return false;
            }
            if (t.transaction_date && new Date(t.transaction_date) <= new Date(effectiveLebaranCutOff)) {
              return false;
            }
            if (t.created_at && new Date(t.created_at) <= new Date(effectiveLebaranCutOff)) {
              return false;
            }
          }
          const desc = (t.description || '').toLowerCase();
          return desc.includes('setoran matriks') || desc.includes('rekonsiliasi otomatis');
        })
        .map((t: any) => t.id)
        .filter(Boolean);

      if (unsettledRoutineTxIds.length > 0) {
        try {
          const delInQuery: any = supabase.from('deposit_transactions').delete();
          if (typeof delInQuery.in === 'function') {
            await delInQuery.in('id', unsettledRoutineTxIds);
          }
        } catch (e) {
          console.warn('Gagal membersihkan mutasi LEBARAN unsettled:', e);
        }
      }
    }
    return { success: true, memberDepositId: md.id, matchedKeys: [], insertedCount: 0 };
  }

  // 6. Grid rentang tahun / timeline bulan mulai dari periode pengesahan saldo awal (cut-off) ke depan
  let sYear = options?.startYear ?? 2024;
  if (!options?.startYear && effectiveJoin) {
    const d = new Date(effectiveJoin);
    if (!isNaN(d.getTime())) {
      sYear = Math.min(2024, d.getFullYear());
    }
  }
  const currentYear = new Date().getFullYear();
  const eYear = options?.endYear ?? Math.max(2026, currentYear);
  const monthGrid = effectiveInitialCutOff
    ? generateMemberTimeline(effectiveInitialCutOff, effectiveJoin, eYear)
    : generateMonthGrid(sYear, eYear);
  if (effectiveInitialCutOff && monthGrid.length > 0) {
    sYear = monthGrid[0].year;
  }

  // 7. Hitung bulan yang tercentang menggunakan algoritma FIFO (termasuk alokasi sisa saldo parsial)
  const fifoResult = calculateFifoAllocation(
    targetBalance,
    monthGrid,
    targetType,
    rateTiers,
    effectiveJoin,
    md.id,
    targetType === 'LEBARAN' ? effectiveLebaranCutOff : undefined,
    effectiveInitialCutOff,
    dtList
  );
  const matchedKeys = fifoResult.matchedKeys;

  // 8. Hapus transaksi rutin bulanan lama pada rentang grid (lindungi mutasi migrasi riil & Saldo Awal)
  const oldRoutineTxIds = txs
    .filter((t: any) => {
      if (t.transaction_type !== 'deposit') return false;
      const desc = (t.description || '').toLowerCase();
      if (
        desc.includes('migra') ||
        desc.includes('saldo awal') ||
        desc.includes('historical') ||
        desc.includes('one-time') ||
        desc.includes('belum teralokasi')
      ) {
        return false;
      }
      // Jika mode Cut-Off Saldo Awal aktif, lindungi seluruh transaksi sebelum bulan cut-off
      if (effectiveInitialCutOff && t.for_year && t.for_month && isMonthBeforeCutOff(t.for_year, t.for_month, effectiveInitialCutOff)) {
        return false;
      }
      // Khusus LEBARAN: lindungi seluruh transaksi yang berada pada atau sebelum cut-off date siklus selesai
      if (targetType === 'LEBARAN' && effectiveLebaranCutOff) {
        if (t.for_year && t.for_month && isMonthSettledByCutOff(t.for_year, t.for_month, effectiveLebaranCutOff)) {
          return false;
        }
        if (t.transaction_date && new Date(t.transaction_date) <= new Date(effectiveLebaranCutOff)) {
          return false;
        }
        if (t.created_at && new Date(t.created_at) <= new Date(effectiveLebaranCutOff)) {
          return false;
        }
      }
      const y = t.for_year;
      return (y && y >= sYear && y <= eYear) || desc.includes('setoran matriks') || desc.includes('rekonsiliasi otomatis');
    })
    .map((t: any) => t.id)
    .filter(Boolean);

  if (oldRoutineTxIds.length > 0) {
    const delInQuery: any = supabase.from('deposit_transactions').delete();
    if (typeof delInQuery.in === 'function') {
      const { error: delErr } = await delInQuery.in('id', oldRoutineTxIds);
      if (delErr) throw delErr;
    }
  }

  // Juga eksekusi query delete bermetode chained seperti modal jika didukung (hanya jika BUKAN mode Cut-Off & non-LEBARAN)
  if (!effectiveInitialCutOff && (targetType !== 'LEBARAN' || !effectiveLebaranCutOff)) {
    const deleteQuery: any = supabase
      .from('deposit_transactions')
      .delete();

    if (typeof deleteQuery.eq === 'function') {
      const eqQuery = deleteQuery.eq('member_deposit_id', md.id);
      if (eqQuery && typeof eqQuery.gte === 'function') {
        const gteQuery = eqQuery.gte('for_year', sYear);
        if (gteQuery && typeof gteQuery.lte === 'function') {
          const lteQuery = gteQuery.lte('for_year', eYear);
          if (lteQuery && typeof lteQuery.eq === 'function') {
            const typeQuery = lteQuery.eq('transaction_type', 'deposit');
            if (typeQuery && typeof typeQuery.neq === 'function') {
              await typeQuery.neq('description', 'Migrasi Saldo Awal (As-Is)');
            } else if (typeQuery && typeof typeQuery.then === 'function') {
              await typeQuery;
            }
          }
        }
      }
    }
  }

  // 9. Singkirkan transaksi gelondongan migrasi / penampung belum teralokasi jika matchedKeys > 0
  // PENTING: Dalam mode Cut-Off Saldo Awal, JANGAN PERNAH menghapus/memecah Saldo Awal Simpanan!
  if (!effectiveInitialCutOff && matchedKeys.length > 0) {
    try {
      const bulkMigrationTxIds = txs
        .filter((t: any) => {
          const desc = (t.description || '').toLowerCase();
          const isBulk =
            desc.includes('migra') ||
            desc.includes('saldo awal') ||
            desc.includes('belum teralokasi');
          if (!isBulk) return false;
          // Khusus LEBARAN: lindungi transaksi migrasi lampau yang sudah settled
          if (targetType === 'LEBARAN' && effectiveLebaranCutOff) {
            if (t.for_year && t.for_month && isMonthSettledByCutOff(t.for_year, t.for_month, effectiveLebaranCutOff)) {
              return false;
            }
            if (t.transaction_date && new Date(t.transaction_date) <= new Date(effectiveLebaranCutOff)) {
              return false;
            }
            if (t.created_at && new Date(t.created_at) <= new Date(effectiveLebaranCutOff)) {
              return false;
            }
          }
          return (
            t.for_month === null ||
            t.for_month === undefined ||
            desc.includes('saldo awal migrasi sistem') ||
            desc.includes('belum teralokasi')
          );
        })
        .map((t: any) => t.id)
        .filter(Boolean);

      if (bulkMigrationTxIds.length > 0) {
        const delByIdQuery: any = supabase.from('deposit_transactions').delete();
        if (typeof delByIdQuery.in === 'function') {
          await delByIdQuery.in('id', bulkMigrationTxIds);
        }
      }

      if (targetType !== 'LEBARAN' || !effectiveLebaranCutOff) {
        const delQuery: any = supabase.from('deposit_transactions').delete();
        if (typeof delQuery.eq === 'function') {
          const eqQuery = delQuery.eq('member_deposit_id', md.id);
          if (eqQuery && typeof eqQuery.is === 'function') {
            const isQuery = eqQuery.is('for_month', null);
            if (isQuery && typeof isQuery.ilike === 'function') {
              await isQuery.ilike('description', '%migrasi%');
            } else if (isQuery && typeof isQuery.then === 'function') {
              await isQuery;
            }
          } else if (eqQuery && typeof eqQuery.then === 'function') {
            await eqQuery;
          }
        }
      }
    } catch (delBulkErr) {
      console.warn('Gagal menghapus transaksi migrasi gelondongan:', delBulkErr);
    }
  }

  // Enforce Clean Purge per Member Deposit Account:
  // Bersihkan seluruh transaksi ledger migrasi/rekonsiliasi lama pada akun deposit ini sebelum menyisipkan mutasi baru
  // Khusus mode Cut-Off Saldo Awal & LEBARAN dengan siklus selesai, hindari purge blanket agar Saldo Awal / masa lalu tidak terhapus
  if (!effectiveInitialCutOff && (targetType !== 'LEBARAN' || !effectiveLebaranCutOff)) {
    try {
      const delPurgeBuilder: any = supabase
        .from('deposit_transactions')
        .delete();

      if (typeof delPurgeBuilder.eq === 'function') {
        const eqBuilder = delPurgeBuilder.eq('member_deposit_id', md.id);
        if (eqBuilder && typeof eqBuilder.or === 'function') {
          const { error: delErr } = await eqBuilder.or(
            'description.ilike.%matriks%,description.ilike.%rekonsiliasi%,description.ilike.%migrasi%,description.ilike.%saldo awal%,description.ilike.%belum teralokasi%'
          );
          if (delErr) {
            console.warn('Peringatan saat purge transaksi buku besar lama:', delErr);
          }
        }
      }
    } catch (purgeErr) {
      console.warn('Exception saat purge transaksi buku besar lama:', purgeErr);
    }
  }

  // 10. Simpan transaksi baru untuk setiap bulan yang dicocokkan FIFO
  const txsToInsert = fifoResult.allocatedTransactions.map(item => ({
    member_deposit_id: md.id,
    amount: item.amount,
    for_month: item.for_month,
    for_year: item.for_year,
    transaction_type: 'deposit',
    description: item.description
  }));

  if (txsToInsert.length > 0) {
    const { error: insErr } = await supabase
      .from('deposit_transactions')
      .insert(txsToInsert);
    if (insErr) throw insErr;
  }

  return {
    success: true,
    memberDepositId: md.id,
    matchedKeys,
    insertedCount: txsToInsert.length,
    allocatedTransactions: fifoResult.allocatedTransactions,
    totalAllocated: fifoResult.totalAllocated
  };
}

export const reconcileMemberSavingsDeposit = reconcileSingleMemberDeposit;
export const autoReconcileMember = reconcileSingleMemberDeposit;
export const autoReconcileSavingsLedger = reconcileSingleMemberDeposit;

/**
 * Menjalankan centang lunas massal seluruh anggota aktif dari tanggal awal bergabung
 * masing-masing hingga bulan berjalan saat ini secara aman, bertahap, dan terlindungi dari rate limit.
 */
export async function bulkCheckAllUpToCurrentMonth(
  selectedType: string = 'ALL',
  onProgress?: (progress: BulkCheckProgress) => void
): Promise<{ totalSuccess: number; totalFailed: number }> {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1 - 12

  // 1. Ambil seluruh anggota aktif dari public.anggota
  let membersQuery: any = supabase
    .from('anggota')
    .select('id, nrp, nama, created_at, status, membership_status');

  let membersData: any[] = [];
  let membersError: any = null;

  if (typeof membersQuery.eq === 'function') {
    const eqQuery = membersQuery.eq('status', 'aktif');
    if (eqQuery && typeof eqQuery.order === 'function') {
      const resp = await eqQuery.order('nama', { ascending: true });
      membersData = resp.data || [];
      membersError = resp.error;
    } else if (eqQuery && typeof eqQuery.then === 'function') {
      const resp = await eqQuery;
      membersData = resp.data || [];
      membersError = resp.error;
    }
  }

  if ((!membersData || membersData.length === 0) && !membersError) {
    if (typeof membersQuery.order === 'function') {
      const resp = await membersQuery.order('nama', { ascending: true });
      membersData = resp.data || [];
      membersError = resp.error;
    } else if (typeof membersQuery.then === 'function') {
      const resp = await membersQuery;
      membersData = resp.data || [];
      membersError = resp.error;
    }
  }

  if (membersError) {
    throw new Error(`Gagal memuat data anggota: ${membersError.message || membersError}`);
  }

  const activeMembers = (membersData || []).filter((m: any) => {
    const st = (m.status || 'aktif').toLowerCase();
    const mst = (m.membership_status || 'ACTIVE').toUpperCase();
    return st !== 'nonaktif' && mst !== 'RESIGNED';
  });

  if (activeMembers.length === 0) {
    return { totalSuccess: 0, totalFailed: 0 };
  }

  // 2. Tentukan tipe simpanan yang dipilih
  const rawType = (selectedType || 'ALL').trim();
  const isAll = !rawType || rawType === 'ALL' || rawType.toLowerCase().includes('semua');
  let typesToProcess: Array<'WAJIB' | 'BELANJA' | 'LEBARAN'> = [];
  if (isAll) {
    typesToProcess = ['WAJIB', 'BELANJA', 'LEBARAN'];
  } else {
    const resolved = resolveDepositTypeCode(rawType);
    if (resolved) {
      typesToProcess = [resolved];
    } else {
      const codeUpper = rawType.toUpperCase();
      if (codeUpper === 'SW' || codeUpper === 'WAJIB') typesToProcess = ['WAJIB'];
      else if (codeUpper === 'SB' || codeUpper === 'BELANJA') typesToProcess = ['BELANJA'];
      else if (codeUpper === 'SL' || codeUpper === 'LEBARAN') typesToProcess = ['LEBARAN'];
      else typesToProcess = [codeUpper as any];
    }
  }

  // 3. Ambil data rekening simpanan & master tarif bertingkat
  let depTypes: any[] = [];
  try {
    const { data: dtData } = await supabase
      .from('deposit_types')
      .select('id, code, name, default_amount');
    depTypes = dtData || [];
  } catch (err) {
    console.warn('Gagal memuat deposit_types:', err);
  }

  let rateTiers: SavingsRateTier[] = [];
  try {
    rateTiers = await getRateTiers(undefined, false);
  } catch (err) {
    console.warn('Gagal memuat rate tiers via getRateTiers:', err);
  }

  if (!rateTiers || rateTiers.length === 0) {
    try {
      const { data: tiers } = await supabase
        .from('savings_rate_tiers')
        .select('*')
        .order('start_year', { ascending: true })
        .order('start_month', { ascending: true });
      if (tiers && tiers.length > 0) {
        rateTiers = tiers as any;
      }
    } catch (err) {
      console.warn('Gagal query savings_rate_tiers langsung:', err);
    }
  }

  if (!rateTiers) {
    rateTiers = [];
  }

  // Ambil tanggal pengesahan Saldo Awal Simpanan (Cut-Off) sekali saja di awal
  const initialSavingsCutOffDate = await getInitialSavingsCutOffDate();

  // Ambil siklus pencairan lebaran terakhir yang selesai sekali saja di awal untuk cache efisien
  let lastLebaranCutOffDate: string | null = null;
  if (typesToProcess.includes('LEBARAN')) {
    try {
      const lastCycle = await getLastCompletedLebaranCycle();
      if (lastCycle && lastCycle.cut_off_date) {
        lastLebaranCutOffDate = lastCycle.cut_off_date;
      }
    } catch (err) {
      console.warn('Gagal memuat siklus lebaran terakhir di bulkCheckAllUpToCurrentMonth:', err);
    }
  }

  const { getRateForPeriod } = buildSavingsRateResolver(rateTiers, depTypes);
  let totalSuccess = 0;
  let totalFailed = 0;
  const BATCH_MEMBER_SIZE = 25;

  // 4. Iterasi bertahap per anggota
  for (let m = 0; m < activeMembers.length; m++) {
    const member = activeMembers[m];
    if (onProgress) {
      onProgress({
        current: m + 1,
        total: activeMembers.length,
        currentMemberName: member.nama || member.nrp || 'Anggota',
      });
    }

    try {
      const parsedJoin = new Date(member.created_at || '2022-01-01');
      const joinDate = isNaN(parsedJoin.getTime()) ? new Date('2022-01-01') : parsedJoin;
      const joinYear = joinDate.getFullYear();
      const joinMonth = joinDate.getMonth() + 1;

      let memberSuccessCount = 0;

      for (const typeCode of typesToProcess) {
        try {
          const dType = depTypes.find((t: any) => {
            const resolved = resolveDepositTypeCode(t);
            return resolved === typeCode || (t.code && t.code.toUpperCase() === typeCode);
          });
          if (!dType) continue;

          // Pastikan rekening simpanan tersedia
          let memberDepositId: string | null = null;
          const checkQuery: any = supabase.from('member_deposits').select('id');
          if (typeof checkQuery.eq === 'function') {
            const eqQuery = checkQuery.eq('member_id', member.id);
            if (eqQuery && typeof eqQuery.eq === 'function') {
              const eqTypeQuery = eqQuery.eq('deposit_type_id', dType.id);
              const checkRes = typeof eqTypeQuery.maybeSingle === 'function'
                ? await eqTypeQuery.maybeSingle()
                : await eqTypeQuery;
              if (checkRes?.data) {
                const row = Array.isArray(checkRes.data) ? checkRes.data[0] : checkRes.data;
                memberDepositId = row?.id || null;
              }
            }
          }

          if (!memberDepositId) {
            const tableDeposits: any = supabase.from('member_deposits');
            if (typeof tableDeposits.insert === 'function') {
              const insQuery = tableDeposits.insert({
                member_id: member.id,
                deposit_type_id: dType.id,
                is_terminated: false
              });

              let insRes: any = null;
              if (typeof insQuery.select === 'function') {
                const selQuery = insQuery.select('id');
                insRes = typeof selQuery.maybeSingle === 'function'
                  ? await selQuery.maybeSingle()
                  : (typeof selQuery.single === 'function' ? await selQuery.single() : await selQuery);
              } else {
                insRes = await insQuery;
              }

              if (insRes?.data) {
                const row = Array.isArray(insRes.data) ? insRes.data[0] : insRes.data;
                memberDepositId = row?.id || null;
              }
            }
          }

          if (!memberDepositId) {
            console.warn(`Lewati simpanan ${typeCode} untuk ${member.nama}: akun rekening tidak dapat dibuat/ditemukan.`);
            continue;
          }

          // Bersihkan transaksi alokasi bulanan lama (lindungi histori LEBARAN & bulan pra-cut-off Saldo Awal)
          if (initialSavingsCutOffDate) {
            try {
              const txListRes: any = await supabase
                .from('deposit_transactions')
                .select('id, for_year, for_month, description, transaction_type')
                .eq('member_deposit_id', memberDepositId);
              const existingTxs = Array.isArray(txListRes?.data) ? txListRes.data : [];
              const postCutoffIdsToDelete = existingTxs
                .filter((t: any) => {
                  if (t.transaction_type !== 'deposit') return false;
                  const desc = (t.description || '').toLowerCase();
                  if (desc.includes('saldo awal')) return false;
                  if (t.for_month === null || t.for_month === undefined) return false;
                  if (t.for_year && isMonthBeforeCutOff(Number(t.for_year), Number(t.for_month), initialSavingsCutOffDate)) {
                    return false;
                  }
                  if (typeCode === 'LEBARAN' && lastLebaranCutOffDate && t.for_year && isMonthSettledByCutOff(Number(t.for_year), Number(t.for_month), lastLebaranCutOffDate)) {
                    return false;
                  }
                  return true;
                })
                .map((t: any) => t.id)
                .filter(Boolean);
              if (postCutoffIdsToDelete.length > 0) {
                const delIn: any = supabase.from('deposit_transactions').delete();
                if (typeof delIn.in === 'function') {
                  await delIn.in('id', postCutoffIdsToDelete);
                }
              }
            } catch {
              // Abaikan jika gagal membersihkan transaksi pasca cut-off
            }
          } else if (typeCode !== 'LEBARAN' || !lastLebaranCutOffDate) {
            const delQuery: any = supabase.from('deposit_transactions').delete();
            if (typeof delQuery.eq === 'function') {
              const eqQuery = delQuery.eq('member_deposit_id', memberDepositId);
              if (eqQuery && typeof eqQuery.not === 'function') {
                await eqQuery.not('for_month', 'is', null);
              } else if (eqQuery && typeof eqQuery.then === 'function') {
                await eqQuery;
              }
            }
          }

          // Bersihkan saldo migrasi penampung belum teralokasi (for_month IS NULL) hanya jika BUKAN mode Cut-Off Saldo Awal
          if (!initialSavingsCutOffDate && (typeCode !== 'LEBARAN' || !lastLebaranCutOffDate)) {
            try {
              const delBulk: any = supabase.from('deposit_transactions').delete();
              if (typeof delBulk.eq === 'function') {
                const eqBulk = delBulk.eq('member_deposit_id', memberDepositId);
                if (eqBulk && typeof eqBulk.is === 'function') {
                  const isBulk = eqBulk.is('for_month', null);
                  if (isBulk && typeof isBulk.then === 'function') {
                    await isBulk;
                  }
                }
              }
            } catch {
              // ignore
            }
          }

          // Susun mutasi baru dari bulan bergabung (atau pasca cut-off) sampai bulan berjalan saat ini
          const txsToInsert: any[] = [];
          for (let y = joinYear; y <= currentYear; y++) {
            const startM = (y === joinYear) ? joinMonth : 1;
            const endM = (y === currentYear) ? currentMonth : 12;

            for (let mon = startM; mon <= endM; mon++) {
              // Abaikan bulan sebelum tanggal pengesahan Saldo Awal (cut-off)
              if (isMonthBeforeCutOff(y, mon, initialSavingsCutOffDate)) {
                continue;
              }
              // Abaikan bulan yang berada pada atau sebelum cut-off date jika tipe simpanan LEBARAN
              if (typeCode === 'LEBARAN' && isMonthSettledByCutOff(y, mon, lastLebaranCutOffDate)) {
                continue;
              }

              const rateAmount = getRateForPeriod(typeCode, y, mon) || 200000;

              txsToInsert.push({
                member_deposit_id: memberDepositId,
                transaction_type: 'deposit',
                amount: rateAmount,
                for_month: mon,
                for_year: y,
                description: `Centang Setoran Rutin Matriks (${typeCode})`
              });
            }
          }

          // Chunking insert mutasi (max 100 rows per request)
          const CHUNK_SIZE = 100;
          for (let c = 0; c < txsToInsert.length; c += CHUNK_SIZE) {
            const chunk = txsToInsert.slice(c, c + CHUNK_SIZE);
            const { error: insErr } = await supabase.from('deposit_transactions').insert(chunk);
            if (insErr) {
              console.error(`Gagal insert mutasi ${typeCode} chunk untuk ${member.nama}:`, insErr);
              throw insErr;
            }
          }

          memberSuccessCount++;
        } catch (typeErr) {
          console.error(`Gagal memproses ${typeCode} untuk anggota ${member.nama}:`, typeErr);
        }
      }

      if (memberSuccessCount > 0) {
        totalSuccess++;
      } else {
        totalFailed++;
      }
    } catch (err) {
      console.error(`Gagal centang massal untuk anggota ${member.nama}:`, err);
      totalFailed++;
    }

    // Throttle jeda antar anggota agar browser responsif dan terhindar dari rate limit
    if ((m + 1) % BATCH_MEMBER_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  }

  return { totalSuccess, totalFailed };
}

/**
 * Menyimpan pencatatan setoran bulanan individual ke deposit_transactions
 * lengkap dengan dokumentasi bukti pembayaran (nomor referensi, metode bayar, catatan, admin pencatat).
 */
export async function saveMonthDepositWithEvidence(
  payload: CheckMonthPayload
): Promise<{ success: boolean; data?: any }> {
  if (!payload.memberDepositId || !payload.month || !payload.year) {
    throw new Error('memberDepositId, month, dan year wajib diisi');
  }

  // 1. Ambil admin yang sedang login
  let currentUserId: string | null = null;
  try {
    if (supabase.auth && typeof supabase.auth.getUser === 'function') {
      const { data: authData } = await supabase.auth.getUser();
      currentUserId = authData?.user?.id || null;
    }
  } catch {
    // abaikan jika tidak dalam sesi auth aktif
  }

  // 2. Bersihkan mutasi lama untuk periode (member_deposit_id, year, month) jika ada
  try {
    const delQuery: any = supabase.from('deposit_transactions').delete();
    if (typeof delQuery.eq === 'function') {
      const q1 = delQuery.eq('member_deposit_id', payload.memberDepositId);
      if (q1 && typeof q1.eq === 'function') {
        const q2 = q1.eq('for_year', payload.year);
        if (q2 && typeof q2.eq === 'function') {
          await q2.eq('for_month', payload.month);
        } else if (q2 && typeof q2.then === 'function') {
          await q2;
        }
      } else if (q1 && typeof q1.then === 'function') {
        await q1;
      }
    }
  } catch (err) {
    console.warn('Gagal membersihkan mutasi lama sebelum simpan bukti:', err);
  }

  // 3. Sisipkan transaksi baru dengan atribut bukti lengkap
  const rowToInsert = {
    member_deposit_id: payload.memberDepositId,
    amount: payload.amount,
    transaction_type: 'deposit',
    for_month: payload.month,
    for_year: payload.year,
    description: payload.description || `Setoran Matriks Bulan ${MONTH_NAMES[payload.month - 1] || payload.month} ${payload.year}`,
    reference_no: payload.referenceNo || null,
    payment_method: payload.paymentMethod || 'tunai',
    notes: payload.notes || null,
    created_by: currentUserId
  };

  const insertQuery: any = supabase.from('deposit_transactions').insert(rowToInsert);
  let insertedData: any = null;

  if (typeof insertQuery.select === 'function') {
    const sel = insertQuery.select();
    const res = typeof sel.single === 'function' ? await sel.single() : await sel;
    if (res?.error) throw res.error;
    insertedData = res?.data;
  } else {
    const res = await insertQuery;
    if (res?.error) throw res.error;
    insertedData = res?.data;
  }

  return { success: true, data: insertedData };
}

/**
 * Membatalkan (uncheck) setoran bulanan individual pada matriks simpanan:
 * Mengambil transaksi aktif, mencatat audit log eksplisit ke public.audit_logs
 * dengan alasan pembatalan dan identitas admin, lalu menghapus transaksi dari deposit_transactions.
 */
export async function cancelMonthDepositWithReason(
  memberDepositId: string,
  year: number,
  month: number,
  reason: string
): Promise<{ success: boolean; cancelledCount: number }> {
  if (!memberDepositId || !year || !month) {
    throw new Error('memberDepositId, year, dan month wajib diisi');
  }
  if (!reason || reason.trim() === '') {
    throw new Error('Alasan pembatalan wajib diisi');
  }

  // 1. Ambil transaksi yang akan dihapus
  let existingTxs: any[] = [];
  try {
    const selQuery: any = supabase.from('deposit_transactions').select('*');
    if (typeof selQuery.eq === 'function') {
      const q1 = selQuery.eq('member_deposit_id', memberDepositId);
      if (q1 && typeof q1.eq === 'function') {
        const q2 = q1.eq('for_year', year);
        if (q2 && typeof q2.eq === 'function') {
          const res = await q2.eq('for_month', month);
          existingTxs = res.data || [];
        } else if (q2 && typeof q2.then === 'function') {
          const res = await q2;
          existingTxs = res.data || [];
        }
      } else if (q1 && typeof q1.then === 'function') {
        const res = await q1;
        existingTxs = res.data || [];
      }
    }
  } catch (selErr) {
    console.warn('Gagal memuat transaksi yang akan dibatalkan:', selErr);
  }

  // 2. Ambil admin yang sedang login
  let currentUserId: string | null = null;
  let currentUserName: string = 'Pengelola';
  try {
    if (supabase.auth && typeof supabase.auth.getUser === 'function') {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        currentUserId = authData.user.id;
        currentUserName =
          authData.user.user_metadata?.nama ||
          authData.user.user_metadata?.name ||
          authData.user.email ||
          'Pengelola';
      }
    }
  } catch {
    // fallback
  }

  // 3. Catat audit log eksplisit ke audit_logs untuk setiap transaksi yang dibatalkan
  if (existingTxs && existingTxs.length > 0) {
    for (const tx of existingTxs) {
      try {
        const auditPayload = {
          table_name: 'deposit_transactions',
          action: 'DELETE',
          record_id: tx.id ? String(tx.id) : undefined,
          entity_name: 'deposit_transactions',
          entity_id: memberDepositId,
          old_data: tx,
          performed_by: currentUserId,
          performer_name: currentUserName,
          notes: reason.trim(),
          created_at: new Date().toISOString()
        };
        await supabase.from('audit_logs').insert(auditPayload);
      } catch (auditErr) {
        console.warn('Gagal mencatat riwayat audit pembatalan:', auditErr);
      }

      // 3b. Perbarui deskripsi transaksi menjadi alasan pembatalan admin sebelum dihapus
      // agar trigger database trg_audit_deposit_tx_delete secara otomatis menangkap alasan ini sebagai OLD.description
      if (tx.id) {
        try {
          const tableRef: any = supabase.from('deposit_transactions');
          if (typeof tableRef.update === 'function') {
            const updBuilder = tableRef.update({
              description: reason.trim()
            });
            if (typeof updBuilder.eq === 'function') {
              await updBuilder.eq('id', tx.id);
            }
          }
        } catch (updErr) {
          console.warn('Gagal memperbarui deskripsi transaksi sebelum pembatalan:', updErr);
        }
      }
    }
  }

  // 4. Hapus transaksi dari deposit_transactions
  const delQuery: any = supabase.from('deposit_transactions').delete();
  if (typeof delQuery.eq === 'function') {
    const q1 = delQuery.eq('member_deposit_id', memberDepositId);
    if (q1 && typeof q1.eq === 'function') {
      const q2 = q1.eq('for_year', year);
      if (q2 && typeof q2.eq === 'function') {
        const delRes = await q2.eq('for_month', month);
        if (delRes?.error) throw delRes.error;
      } else if (q2 && typeof q2.then === 'function') {
        const delRes = await q2;
        if (delRes?.error) throw delRes.error;
      }
    }
  }

  // 4b. Pastikan catatan audit log untuk transaksi yang baru dihapus memuat alasan admin
  if (existingTxs && existingTxs.length > 0) {
    for (const tx of existingTxs) {
      if (tx.id) {
        try {
          const auditTable: any = supabase.from('audit_logs');
          if (typeof auditTable.update === 'function') {
            const auditUpd = auditTable.update({
              notes: reason.trim()
            });
            if (typeof auditUpd.eq === 'function') {
              const qTbl = auditUpd.eq('table_name', 'deposit_transactions');
              if (qTbl && typeof qTbl.eq === 'function') {
                const qRec = qTbl.eq('record_id', String(tx.id));
                if (qRec && typeof qRec.eq === 'function') {
                  await qRec.eq('action', 'DELETE');
                }
              }
            }
          }
        } catch {
          // ignore non-critical update
        }
      }
    }
  }

  return { success: true, cancelledCount: existingTxs.length };
}

/**
 * Memeriksa apakah teks keterangan/alasan merupakan deskripsi otomatis bawaan sistem
 * (misal dari rekonsiliasi, mutasi matriks, atau fallback trigger database)
 * dan BUKAN alasan manual yang diketik oleh admin.
 */
export const isSystemDefaultDescription = (text?: string | null): boolean => {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  return (
    t.includes('setoran matriks') ||
    t.includes('matriks') ||
    t.includes('rekonsiliasi otomatis') ||
    t.includes('centang setoran') ||
    t.includes('penghapusan / batal centang') ||
    t.includes('saldo awal') ||
    t.includes('migrasi') ||
    t.includes('belum teralokasi') ||
    t.includes('setoran parsial') ||
    t.includes('setoran rutin') ||
    t === 'pembatalan / batal centang simpanan' ||
    t === 'penghapusan / batal centang simpanan'
  );
};

/**
 * Mengambil kronologi riwayat audit untuk sel bulan tertentu pada rekening simpanan.
 * Menggabungkan mutasi aktif dari deposit_transactions (status CREATE/aktif)
 * dengan log pembatalan atau perubahan dari tabel public.audit_logs (status DELETE/UPDATE),
 * diurutkan secara kronologis dari yang terbaru ke terlama.
 */
export async function getMonthAuditHistory(
  memberDepositId: string,
  year: number,
  month: number
): Promise<MonthAuditHistoryItem[]> {
  if (!memberDepositId || !year || !month) {
    return [];
  }

  // 1. Ambil transaksi aktif dari deposit_transactions
  let activeTxs: any[] = [];
  try {
    const selTx: any = supabase.from('deposit_transactions').select('*');
    if (typeof selTx.eq === 'function') {
      const q1 = selTx.eq('member_deposit_id', memberDepositId);
      if (q1 && typeof q1.eq === 'function') {
        const q2 = q1.eq('for_year', year);
        if (q2 && typeof q2.eq === 'function') {
          const res = await q2.eq('for_month', month);
          activeTxs = res.data || [];
        } else if (q2 && typeof q2.then === 'function') {
          const res = await q2;
          activeTxs = res.data || [];
        }
      }
    }
  } catch (err) {
    console.warn('Gagal mengambil transaksi aktif untuk riwayat audit:', err);
  }

  // 2. Ambil catatan audit_logs terkait deposit_transactions dan memberDepositId
  let auditLogs: any[] = [];
  try {
    const selAudit: any = supabase.from('audit_logs').select('*');
    if (typeof selAudit.eq === 'function') {
      const q1 = selAudit.eq('table_name', 'deposit_transactions');
      if (q1 && typeof q1.eq === 'function') {
        const q2 = q1.eq('entity_id', memberDepositId);
        let res: any;
        if (q2 && typeof q2.order === 'function') {
          res = await q2.order('created_at', { ascending: false });
        } else if (q2 && typeof q2.then === 'function') {
          res = await q2;
        } else {
          res = await q2;
        }
        auditLogs = res?.data || [];
      }
    }
  } catch (err) {
    console.warn('Gagal mengambil audit_logs untuk riwayat audit:', err);
  }

  // Filter audit logs yang relevan dengan for_year dan for_month ini
  const matchingLogs = (auditLogs || []).filter((log: any) => {
    const oldD = log.old_data || {};
    const newD = log.new_data || {};
    const logMonth = oldD.for_month ?? newD.for_month;
    const logYear = oldD.for_year ?? newD.for_year;
    return Number(logMonth) === Number(month) && Number(logYear) === Number(year);
  });

  // 3. Kumpulkan user IDs untuk lookup nama pengelola jika belum ada nama eksplisit
  const userIdsToLookup = new Set<string>();
  activeTxs.forEach((tx: any) => {
    if (tx.created_by) userIdsToLookup.add(tx.created_by);
  });
  matchingLogs.forEach((log: any) => {
    if (log.performed_by && !log.performer_name) {
      userIdsToLookup.add(log.performed_by);
    }
  });

  const performerNames = new Map<string, string>();
  if (userIdsToLookup.size > 0) {
    try {
      const pengelolaQuery: any = supabase.from('pengelola').select('id, nama');
      if (typeof pengelolaQuery.in === 'function') {
        const { data: pList } = await pengelolaQuery.in('id', Array.from(userIdsToLookup));
        (pList || []).forEach((p: any) => {
          if (p.id && p.nama) performerNames.set(p.id, p.nama);
        });
      }
    } catch {
      // abaikan jika tabel pengelola tidak tersedia di mock
    }
  }

  // 4. Petakan transaksi aktif ke MonthAuditHistoryItem
  const activeItems: MonthAuditHistoryItem[] = activeTxs.map((tx: any) => {
    const performer =
      (tx.created_by ? performerNames.get(tx.created_by) : undefined) ||
      tx.performer_name ||
      'Pengelola';

    return {
      id: String(tx.id),
      action: 'CREATE',
      amount: tx.amount ? Number(tx.amount) : undefined,
      forMonth: Number(tx.for_month),
      forYear: Number(tx.for_year),
      referenceNo: tx.reference_no || undefined,
      paymentMethod: tx.payment_method || undefined,
      notes: tx.notes || tx.description || undefined,
      performerName: performer,
      performerId: tx.created_by || undefined,
      createdAt: tx.created_at || new Date().toISOString()
    };
  });

  // 5. Petakan catatan audit log ke MonthAuditHistoryItem
  const auditItems: MonthAuditHistoryItem[] = matchingLogs.map((log: any) => {
    const oldD = log.old_data || {};
    const newD = log.new_data || {};
    const amt = oldD.amount ?? newD.amount;
    const refNo = oldD.reference_no ?? newD.reference_no;
    const payMethod = oldD.payment_method ?? newD.payment_method;
    const performer =
      log.performer_name ||
      (log.performed_by ? performerNames.get(log.performed_by) : undefined) ||
      'Pengelola';

    return {
      id: String(log.id),
      action: (log.action || 'DELETE') as 'CREATE' | 'UPDATE' | 'DELETE',
      amount: amt !== undefined && amt !== null ? Number(amt) : undefined,
      forMonth: Number(oldD.for_month ?? newD.for_month ?? month),
      forYear: Number(oldD.for_year ?? newD.for_year ?? year),
      referenceNo: refNo || undefined,
      paymentMethod: payMethod || undefined,
      notes: log.notes || oldD.notes || oldD.description || undefined,
      performerName: performer,
      performerId: log.performed_by || undefined,
      createdAt: log.created_at || new Date().toISOString()
    };
  });

  // Deduplikasi cerdas untuk entri pembatalan (DELETE):
  // Menyingkirkan pencatatan ganda antara database trigger (yang mencatat OLD.description)
  // dan pencatatan aplikasi eksplisit (yang mencatat alasan pembatalan input admin).
  const deduplicatedAuditItems = auditItems.filter((log, idx, arr) => {
    if (log.action !== 'DELETE') return true;

    // Cari apakah ada entri pembatalan lain untuk periode/transaksi yang sama dalam selisih waktu <= 10 detik
    const closeSiblings = arr.filter((other, oIdx) => {
      if (oIdx === idx || other.action !== 'DELETE') return false;
      const timeDiff = Math.abs(
        new Date(other.createdAt).getTime() - new Date(log.createdAt).getTime()
      );
      return (
        timeDiff <= 10000 &&
        other.forMonth === log.forMonth &&
        other.forYear === log.forYear
      );
    });

    if (closeSiblings.length === 0) return true;

    const isCurrentDefault = isSystemDefaultDescription(log.notes);
    const hasCustomSibling = closeSiblings.some(s => !isSystemDefaultDescription(s.notes));

    // Jika entri saat ini hanyalah deskripsi default/otomatis sistem dan ada entri saudara dengan alasan admin kustom, buang entri default ini
    if (isCurrentDefault && hasCustomSibling) {
      return false;
    }

    // Jika entri saat ini memiliki alasan custom dan ada entri saudara yang default, pertahankan entri custom ini
    if (!isCurrentDefault && closeSiblings.some(s => isSystemDefaultDescription(s.notes))) {
      return true;
    }

    // Jika kedua entri memiliki tipe alasan yang sama, pertahankan entri pertama
    const firstMatchingIdx = arr.findIndex((other) => {
      if (other.action !== 'DELETE') return false;
      const timeDiff = Math.abs(
        new Date(other.createdAt).getTime() - new Date(log.createdAt).getTime()
      );
      return (
        timeDiff <= 10000 &&
        other.forMonth === log.forMonth &&
        other.forYear === log.forYear
      );
    });

    return idx === firstMatchingIdx;
  });

  // 6. Gabungkan dan urutkan descending berdasarkan waktu (terbaru lebih dulu)
  const allItems = [...activeItems, ...deduplicatedAuditItems];
  allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return allItems;
}

export interface DiscrepancyWithdrawalItem {
  id: string;
  created_at: string;
  transaction_date?: string;
  amount: number;
  reference_no?: string;
  description?: string;
  payment_method?: string;
  created_by?: string;
  cashier_name?: string;
  notes?: string;
  is_pos_sale?: boolean;
  source?: string;
}

export interface SavingsDiscrepancyBreakdown {
  withdrawals: DiscrepancyWithdrawalItem[];
  totalSpent: number;
}

/**
 * Mengambil rincian faktor pengeluaran/penarikan simpanan yang menyebabkan selisih
 * antara Total Tercentang (Iuran) dengan Saldo Riil Database (misal: belanja POS atau penarikan tunai).
 * Mendukung signature:
 * - getSavingsDiscrepancyBreakdown(memberId: string, memberDepositId?: string, depositTypeCode?: string)
 * - getSavingsDiscrepancyBreakdown(memberDepositId: string, depositTypeCode?: string, memberId?: string)
 */
export async function getSavingsDiscrepancyBreakdown(
  memberId: string,
  memberDepositId?: string,
  depositTypeCode?: string
): Promise<SavingsDiscrepancyBreakdown>;
export async function getSavingsDiscrepancyBreakdown(
  memberDepositId: string,
  depositTypeCode?: string,
  memberId?: string
): Promise<SavingsDiscrepancyBreakdown>;
export async function getSavingsDiscrepancyBreakdown(
  arg1: string,
  arg2?: string,
  arg3: string = 'BELANJA'
): Promise<SavingsDiscrepancyBreakdown> {
  if (!arg1 && !arg2 && !arg3) {
    return { withdrawals: [], totalSpent: 0 };
  }

  // 1. Deteksi variasi signature parameter (lama vs baru)
  const KNOWN_CODES = ['BELANJA', 'WAJIB', 'LEBARAN', 'POKOK', 'SUKARELA', 'SB', 'SW', 'SP'];
  const isArg2TypeCode = typeof arg2 === 'string' &&
    (KNOWN_CODES.includes(arg2.toUpperCase()) || /^[A-Z_]{2,10}$/.test(arg2.trim()));

  let memberId = '';
  let memberDepositId = '';
  let depositTypeCode = 'BELANJA';

  if (isArg2TypeCode) {
    // Signature lama: (memberDepositId, depositTypeCode, memberId)
    memberDepositId = arg1 || '';
    depositTypeCode = arg2 || 'BELANJA';
    memberId = (arg3 && arg3 !== 'BELANJA') ? arg3 : '';
  } else {
    // Signature baru: (memberId, memberDepositId, depositTypeCode)
    memberId = arg1 || '';
    memberDepositId = arg2 || '';
    depositTypeCode = arg3 || 'BELANJA';
  }

  if (!memberId && !memberDepositId) {
    return { withdrawals: [], totalSpent: 0 };
  }

  // 2. Sinkronkan orphan sales POS jika tipe simpanan adalah BELANJA
  if (depositTypeCode?.toUpperCase() === 'BELANJA' || !depositTypeCode) {
    try {
      const { syncOrphanSalesToDepositLedger } = await import('./shoppingSavingsLedgerService');
      await syncOrphanSalesToDepositLedger();
    } catch {
      // Abaikan jika service tidak dapat dipanggil
    }
  }

  // 3. Resolusi identitas akun simpanan (targetDepositId & targetMemberId)
  let targetDepositId = memberDepositId;
  let targetMemberId = memberId;

  // Jika memberDepositId ada tapi memberId kosong, cari member_id-nya
  if (targetDepositId && !targetMemberId) {
    try {
      const { data: md } = await supabase
        .from('member_deposits')
        .select('id, member_id')
        .eq('id', targetDepositId)
        .maybeSingle();
      if (md?.member_id) {
        targetMemberId = md.member_id;
      }
    } catch {
      // Abaikan
    }
  }

  // Jika targetDepositId kosong namun targetMemberId ada:
  // Cek apakah targetMemberId sebenarnya adalah ID di tabel member_deposits
  if (!targetDepositId && targetMemberId) {
    try {
      const { data: mdDirect } = await supabase
        .from('member_deposits')
        .select('id, member_id')
        .eq('id', targetMemberId)
        .maybeSingle();
      if (mdDirect?.id) {
        targetDepositId = mdDirect.id;
        if (mdDirect.member_id) targetMemberId = mdDirect.member_id;
      }
    } catch {
      // Abaikan
    }
  }

  // Jika targetDepositId masih kosong namun targetMemberId & depositTypeCode ada, cari ID member_deposits
  if (!targetDepositId && targetMemberId && depositTypeCode) {
    try {
      const { data: depTypes } = await supabase
        .from('deposit_types')
        .select('id, code')
        .ilike('code', `%${depositTypeCode}%`);

      const depTypeId = depTypes?.[0]?.id;
      if (depTypeId) {
        const { data: md } = await supabase
          .from('member_deposits')
          .select('id')
          .eq('member_id', targetMemberId)
          .eq('deposit_type_id', depTypeId)
          .maybeSingle();
        if (md?.id) targetDepositId = md.id;
      }
    } catch {
      // Fallback
    }
  }

  const rawList: any[] = [];

  // 4. Kueri Transaksi Pengurang dari deposit_transactions
  if (targetDepositId) {
    let txQuery: any = supabase
      .from('deposit_transactions')
      .select(`
        id,
        created_at,
        amount,
        reference_no,
        description,
        payment_method,
        created_by,
        notes
      `)
      .eq('member_deposit_id', targetDepositId);

    // Kriteria transaksi pengeluaran (pada PostgreSQL enum deposit_tx_type: 'withdrawal')
    if (typeof txQuery.in === 'function') {
      txQuery = txQuery.in('transaction_type', ['withdrawal']);
    }
    if (typeof txQuery.order === 'function') {
      txQuery = txQuery.order('created_at', { ascending: false });
    }

    const { data: withdrawals, error: txError } = await txQuery;
    if (txError) throw txError;

    if (withdrawals && withdrawals.length > 0) {
      rawList.push(...withdrawals);
    } else {
      // Fallback kueri deposit_transactions untuk kriteria amount < 0, description ilike, atau payment_method
      try {
        const { data: altTx } = await supabase
          .from('deposit_transactions')
          .select(`
            id,
            created_at,
            amount,
            reference_no,
            description,
            payment_method,
            created_by,
            notes
          `)
          .eq('member_deposit_id', targetDepositId)
          .or('amount.lt.0,description.ilike.%belanja%,description.ilike.%tarik%,payment_method.eq.potong_simpanan_belanja')
          .order('created_at', { ascending: false });
        if (altTx && altTx.length > 0) {
          rawList.push(...altTx);
        }
      } catch {
        // Abaikan jika query or tidak didukung di mock / env
      }
    }
  }

  // 5. Fallback & Rekonsiliasi ke Tabel Penjualan Kasir POS (public.sales)
  // Digunakan jika transaksi belanja di deposit_transactions kosong atau ada penjualan kasir yang belum tersinkron
  if (targetMemberId && (depositTypeCode?.toUpperCase() === 'BELANJA' || !depositTypeCode)) {
    try {
      // Coba query dengan invoice_number terlebih dahulu sesuai spec
      let { data: posSales, error: salesErr } = await supabase
        .from('sales')
        .select('id, invoice_number, created_at, paid_deposit, total_amount, payment_scheme, cashier_id')
        .eq('member_id', targetMemberId)
        .gt('paid_deposit', 0)
        .order('created_at', { ascending: false });

      // Jika kolom invoice_number tidak ada di schema (menggunakan sale_number), lakukan fallback
      if (salesErr) {
        const { data: salesByNumber, error: numErr } = await supabase
          .from('sales')
          .select('id, sale_number, created_at, paid_deposit, total_amount, payment_scheme, cashier_id')
          .eq('member_id', targetMemberId)
          .gt('paid_deposit', 0)
          .order('created_at', { ascending: false });
        if (!numErr && salesByNumber) {
          posSales = salesByNumber.map(s => ({
            ...s,
            invoice_number: (s as any).sale_number
          }));
          salesErr = null;
        }
      }

      if (!salesErr && posSales && posSales.length > 0) {
        const existingRefs = new Set(
          rawList.map(w => (w.reference_no || '').toUpperCase().trim()).filter(Boolean)
        );

        for (const sale of posSales) {
          const invNo = (sale as any).invoice_number || (sale as any).sale_number || `INV-${sale.id}`;
          if (!existingRefs.has(invNo.toUpperCase().trim())) {
            const amount = Math.abs(Number(sale.paid_deposit || 0));
            if (amount > 0) {
              rawList.push({
                id: sale.id,
                created_at: sale.created_at || new Date().toISOString(),
                transaction_date: sale.created_at || new Date().toISOString(),
                amount,
                reference_no: invNo,
                description: `Belanja Kasir POS (Struk ${invNo})`,
                payment_method: 'potong_simpanan_belanja',
                created_by: sale.cashier_id,
                is_pos_sale: true,
                source: 'sales_pos'
              });
              existingRefs.add(invNo.toUpperCase().trim());
            }
          }
        }
      }
    } catch {
      // Abaikan jika tabel sales tidak dapat diakses
    }
  }

  if (rawList.length === 0 && !targetDepositId && !targetMemberId) {
    return { withdrawals: [], totalSpent: 0 };
  }

  // 6. Ambil data nama kasir/pengelola untuk setiap created_by
  const cashierIds = Array.from(new Set(rawList.map(w => w.created_by).filter(Boolean)));
  const cashierMap = new Map<string, string>();
  if (cashierIds.length > 0) {
    try {
      const { data: cashiers } = await supabase
        .from('pengelola')
        .select('id, nama')
        .in('id', cashierIds);
      (cashiers || []).forEach((c: any) => {
        if (c?.id && c?.nama) cashierMap.set(c.id, c.nama);
      });
    } catch {
      // Abaikan jika tabel pengelola tidak dapat diakses
    }
  }

  // 7. Transformasi dan penandaan is_pos_sale
  const items: DiscrepancyWithdrawalItem[] = rawList.map(w => {
    const desc = (w.description || '').toLowerCase();
    const ref = (w.reference_no || '').toUpperCase();
    const pm = (w.payment_method || '').toLowerCase();
    const isPos =
      w.is_pos_sale ??
      (desc.includes('belanja') ||
        desc.includes('pos') ||
        desc.includes('kasir') ||
        ref.startsWith('INV') ||
        pm === 'potong_simpanan_belanja');

    return {
      id: w.id,
      created_at: w.created_at,
      transaction_date: w.transaction_date || w.created_at,
      amount: Math.abs(Number(w.amount || 0)),
      reference_no: w.reference_no || undefined,
      description: w.description || undefined,
      payment_method: w.payment_method || undefined,
      created_by: w.created_by || undefined,
      cashier_name: w.created_by ? cashierMap.get(w.created_by) : undefined,
      notes: w.notes || undefined,
      is_pos_sale: isPos,
      source: w.source
    };
  });

  const totalSpent = items.reduce((acc, curr) => acc + curr.amount, 0);

  return {
    withdrawals: items,
    totalSpent
  };
}



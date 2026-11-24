import { supabase } from '../lib/supabaseClient';
import { fetchAllPaged, resolveCutoffDateInfo } from './complianceService';
import { ensureMandatoryDepositsAndEnroll } from './depositManagementService';
import {
  getActivePokokTariff,
  getMemberLebaranRates,
  getRateTiers,
  MemberLebaranRate,
  normalizeDepositTypeCode,
  resolveMemberSavingsRate,
  SavingsRateTier,
} from './savingsRateService';
import {
  formatMatrixDepositCashFlowDescription,
  isOpeningOrMigrationDepositDescription,
  SHORT_MONTH_NAMES_ID,
} from '../utils/depositCashFlowFormat';
import {
  generateCompactRegisterSync,
  generateNextCompactRegister,
} from '../utils/receiptGenerator';

export const BILLING_CUTOFF_YEAR = 2026;
export const BILLING_CUTOFF_MONTH = 1; // Default fallback: Januari (awal tahun fiskal)

const FULL_MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export type SavingsBillingStatus = 'LUNAS' | 'PARSIAL' | 'MENUNGGAK' | 'BELUM_BAYAR';

export interface SavingsBillingUnpaidMonth {
  year: number;
  month: number; // 1-12 untuk simpanan bulanan, 0 untuk POKOK
  periodIndex: number; // year * 12 + month (0 untuk POKOK)
  label: string; // misal 'Mar-26' atau 'Kewajiban Awal'
  fullLabel: string; // misal 'Maret 2026' atau 'Kewajiban Awal Keanggotaan'
  expectedAmount: number;
  paidAmount: number;
  remaining: number;
  isArrears: boolean;
}

export interface SavingsAggregateBillRow {
  id: string;
  member_id: string;
  member_deposit_id: string | null;
  deposit_type_id: string;
  deposit_code: string;
  deposit_name: string;
  isPokok: boolean;
  anggota: {
    id: string;
    nama: string;
    nrp: string;
    tanggal_lahir?: string | null;
  };
  selectedYear: number;
  selectedMonth: number;
  currentMonthDue: number;
  currentMonthPaid: number;
  currentMonthRemaining: number;
  previousArrearsAmount: number;
  previousArrearsMonthsCount: number;
  totalAggregateBill: number;
  remainingArrears: number;
  totalPaidAllUnpaid: number;
  unpaidMonths: SavingsBillingUnpaidMonth[];
  unpaidMonthsCount: number;
  unpaidMonthsSummary: string;
  unpaidMonthsFullList: string;
  status: SavingsBillingStatus;
}

export interface SavingsBillingDataset {
  rows: SavingsAggregateBillRow[];
  cutoffDate: string;
  cutoffYear: number;
  cutoffMonth: number;
  totalActiveMembersCount: number;
  availableDepositTypes: Array<{ code: string; name: string }>;
  isSelectedPeriodBeforeCutoff: boolean;
}

export interface PaySavingsBillInput {
  bill: SavingsAggregateBillRow;
  paymentAmount: number;
  selectedMonths?: Array<{ year: number; month: number }>;
  paymentMethod: 'tunai' | 'transfer_bank';
  referenceNo?: string;
  notes?: string;
}

export interface PaySavingsBillResult {
  success: boolean;
  referenceNo: string;
  totalAllocated: number;
  insertedCount: number;
  allocations: Array<{
    txId: string | null;
    year: number | null;
    month: number | null;
    label: string;
    amount: number;
  }>;
}

function isPostgrestColumnError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

function parseYearMonth(raw?: string | null): { year: number; month: number } | null {
  if (!raw) return null;
  const str = String(raw).trim();
  const match = str.match(/^(\d{4})-(\d{1,2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (year > 1900 && month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
  }
  return null;
}

function getCanonicalDepositCode(dt: any): string {
  const normalized = normalizeDepositTypeCode(dt?.code || dt?.name);
  if (normalized) return normalized;
  const rawCode = String(dt?.code || '').trim().toUpperCase();
  if (rawCode) return rawCode;
  return String(dt?.name || 'OTHER').trim().toUpperCase();
}

function isMatrixSettledTxDescription(desc?: string | null): boolean {
  const lower = String(desc || '').toLowerCase();
  return (
    lower.includes('buku besar') ||
    lower.includes('setoran rutin') ||
    lower.includes('matriks')
  );
}

function getDepositSortOrder(code: string): number {
  switch (code) {
    case 'WAJIB':
      return 0;
    case 'BELANJA':
      return 1;
    case 'LEBARAN':
      return 2;
    case 'POKOK':
      return 3;
    default:
      return 4;
  }
}

export function formatShortPeriod(year: number, month: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return '-';
  }
  return `${SHORT_MONTH_NAMES_ID[month - 1]}-${String(year).slice(-2)}`;
}

export function formatUnpaidMonthsSummary(unpaidMonths: SavingsBillingUnpaidMonth[]): {
  summary: string;
  fullList: string;
} {
  if (!unpaidMonths || unpaidMonths.length === 0) {
    return { summary: '', fullList: '' };
  }

  if (unpaidMonths.some((m) => m.month === 0)) {
    return {
      summary: 'Kewajiban Awal Keanggotaan',
      fullList: 'Kewajiban Awal Keanggotaan',
    };
  }

  const sorted = [...unpaidMonths].sort((a, b) => a.periodIndex - b.periodIndex);
  const fullList = sorted.map((m) => m.label).join(', ');

  if (sorted.length <= 3) {
    return { summary: fullList, fullList };
  }

  let isContiguous = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].periodIndex !== sorted[i - 1].periodIndex + 1) {
      isContiguous = false;
      break;
    }
  }

  if (isContiguous) {
    return {
      summary: `${sorted[0].label} s/d ${sorted[sorted.length - 1].label}`,
      fullList,
    };
  }

  const preview = sorted
    .slice(0, 3)
    .map((m) => m.label)
    .join(', ');
  return {
    summary: `${preview} (+${sorted.length - 3} bln)`,
    fullList,
  };
}

function generateBillingReferenceNo(now: Date = new Date()): string {
  return generateCompactRegisterSync('KS', now);
}

function getLocalIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchActiveMembersResilient(): Promise<any[]> {
  const buildFilter = (q: any) => {
    let next = q;
    if (next && typeof next.eq === 'function') {
      next = next.eq('status', 'aktif');
    }
    if (next && typeof next.order === 'function') {
      next = next.order('nama', { ascending: true });
    }
    return next;
  };

  let res = await fetchAllPaged<any>(
    'anggota',
    'id, nrp, nama, tanggal_lahir, status, membership_status, created_at, joined_at',
    buildFilter
  );

  if (res.error && isPostgrestColumnError(res.error)) {
    res = await fetchAllPaged<any>(
      'anggota',
      'id, nrp, nama, tanggal_lahir, status, membership_status, created_at',
      buildFilter
    );
  }

  if (res.error) {
    throw new Error(`Gagal memuat data anggota aktif: ${res.error.message || res.error}`);
  }

  return (res.data || []).filter((m: any) => {
    const rowStatus = String(m?.status || 'aktif').trim().toLowerCase();
    const memStatus = String(m?.membership_status || 'ACTIVE').trim().toUpperCase();
    return rowStatus === 'aktif' && memStatus === 'ACTIVE';
  });
}

async function fetchAllDepositTransactionsResilient(): Promise<any[]> {
  let res = await fetchAllPaged<any>(
    'deposit_transactions',
    'id, member_deposit_id, amount, transaction_type, for_year, for_month, description, reference_no, created_at'
  );

  if (res.error && isPostgrestColumnError(res.error)) {
    res = await fetchAllPaged<any>(
      'deposit_transactions',
      'id, member_deposit_id, amount, transaction_type, for_year, for_month, description, created_at'
    );
  }

  if (res.error) {
    throw new Error(`Gagal memuat mutasi simpanan: ${res.error.message || res.error}`);
  }

  return res.data || [];
}

/**
 * Menghitung tagihan & agregat tunggakan simpanan per anggota aktif per jenis simpanan
 * mulai dari batas cut-off aktual / awal tahun fiskal (atau tanggal bergabung pasca cut-off)
 * hingga periode (selectedMonth, selectedYear) yang dipilih.
 */
export async function getAggregateSavingsBills(
  selectedMonth: number,
  selectedYear: number
): Promise<SavingsBillingDataset> {
  const safeMonth = Math.min(12, Math.max(1, Math.trunc(selectedMonth || 1)));
  const safeYear = Math.max(1900, Math.trunc(selectedYear || new Date().getFullYear()));
  const selectedPeriodIndex = safeYear * 12 + safeMonth;

  const [
    activeMembers,
    depositTypesRes,
    memberDepositsRes,
    allTransactions,
    tiersRes,
    memberLebaranRates,
    activePokokRate,
  ] = await Promise.all([
    fetchActiveMembersResilient(),
    supabase.from('deposit_types').select('*'),
    fetchAllPaged<any>('member_deposits', 'id, member_id, deposit_type_id'),
    fetchAllDepositTransactionsResilient(),
    supabase.from('savings_rate_tiers').select('*'),
    getMemberLebaranRates(undefined, true).catch(() => [] as MemberLebaranRate[]),
    getActivePokokTariff().catch(() => 0),
  ]);

  if (depositTypesRes.error) {
    throw new Error(`Gagal memuat jenis simpanan: ${depositTypesRes.error.message}`);
  }
  if (memberDepositsRes.error) {
    throw new Error(
      `Gagal memuat rekening simpanan anggota: ${memberDepositsRes.error.message || memberDepositsRes.error}`
    );
  }

  const depositTypes = (depositTypesRes.data || []).filter((dt: any) => dt?.is_active !== false);
  const memberDeposits = memberDepositsRes.data || [];

  let rateTiers: SavingsRateTier[] = [];
  if (!tiersRes.error && Array.isArray(tiersRes.data)) {
    rateTiers = tiersRes.data as SavingsRateTier[];
  } else {
    rateTiers = await getRateTiers(undefined, false).catch(() => []);
  }

  // Tentukan tanggal cut-off aktual selaras dengan /admin/compliance-matrix & /admin/setoran
  // Prioritas: system_settings (initial_savings_effective_date) -> transaksi Saldo Awal -> fallback 1 Januari tahun terpilih
  const cutoffInfo = await resolveCutoffDateInfo(allTransactions).catch(() => null);
  const cutoffYear = cutoffInfo ? cutoffInfo.year : safeYear;
  const cutoffMonth = cutoffInfo ? cutoffInfo.month : BILLING_CUTOFF_MONTH;
  const resolvedCutoffIndex = cutoffYear * 12 + cutoffMonth;
  const cutoffDate =
    cutoffInfo?.dateStr || `${cutoffYear}-${String(cutoffMonth).padStart(2, '0')}-01`;

  // Indeks rekening simpanan anggota & jenis simpanan
  const dtById = new Map<string, any>();
  for (const dt of depositTypes) {
    if (dt?.id) dtById.set(String(dt.id), dt);
  }

  const mdById = new Map<string, { member_id: string; deposit_type_id: string }>();
  const mdByMemberType = new Map<string, string>();
  for (const md of memberDeposits) {
    if (!md?.id || !md?.member_id || !md?.deposit_type_id) continue;
    const mdId = String(md.id);
    const memberId = String(md.member_id);
    const dtId = String(md.deposit_type_id);
    mdById.set(mdId, { member_id: memberId, deposit_type_id: dtId });
    mdByMemberType.set(`${memberId}::${dtId}`, mdId);
  }

  // Indeks mutasi setoran & pelacakan saldo awal / setoran matriks
  const pokokNetPaidByMemberType = new Map<string, number>();
  const paidByMemberTypePeriod = new Map<string, number>();
  const matrixSettledKeys = new Set<string>();
  const hasOpeningOrEarlyTxByMember = new Set<string>();

  for (const tx of allTransactions) {
    const mdInfo = tx?.member_deposit_id ? mdById.get(String(tx.member_deposit_id)) : undefined;
    if (!mdInfo) continue;

    const { member_id: memberId, deposit_type_id: dtId } = mdInfo;
    const dt = dtById.get(dtId);
    const canonicalCode = dt ? getCanonicalDepositCode(dt) : '';
    const amount = Number(tx?.amount || 0);
    const txType = String(tx?.transaction_type || 'deposit').toLowerCase();

    const fy =
      tx?.for_year !== null && tx?.for_year !== undefined && tx?.for_year !== ''
        ? Number(tx.for_year)
        : NaN;
    const fm =
      tx?.for_month !== null && tx?.for_month !== undefined && tx?.for_month !== ''
        ? Number(tx.for_month)
        : NaN;

    if (isOpeningOrMigrationDepositDescription(tx?.description)) {
      hasOpeningOrEarlyTxByMember.add(memberId);
    } else if (Number.isInteger(fy) && Number.isInteger(fm) && fm >= 1 && fm <= 12) {
      if (fy * 12 + fm <= resolvedCutoffIndex) {
        hasOpeningOrEarlyTxByMember.add(memberId);
      }
    }

    if (canonicalCode === 'POKOK') {
      const key = `${memberId}::${dtId}`;
      const prev = pokokNetPaidByMemberType.get(key) || 0;
      if (txType === 'withdrawal') {
        pokokNetPaidByMemberType.set(key, prev - amount);
      } else if (txType === 'deposit') {
        pokokNetPaidByMemberType.set(key, prev + amount);
      }
      continue;
    }

    if (txType !== 'deposit') continue;
    if (!Number.isInteger(fy) || !Number.isInteger(fm) || fm < 1 || fm > 12) continue;

    const descLower = String(tx?.description || '').toLowerCase();
    if (isOpeningOrMigrationDepositDescription(tx?.description) || descLower.includes('bulk')) {
      continue;
    }

    const periodKey = `${memberId}::${dtId}::${fy}-${fm}`;
    paidByMemberTypePeriod.set(periodKey, (paidByMemberTypePeriod.get(periodKey) || 0) + amount);
    if (isMatrixSettledTxDescription(tx?.description)) {
      matrixSettledKeys.add(periodKey);
    }
  }

  // Klasifikasi jenis simpanan aktif (Pokok + Rutin Bulanan)
  const pokokTypes = depositTypes.filter((dt: any) => getCanonicalDepositCode(dt) === 'POKOK');
  const routineMonthlyTypes = depositTypes
    .filter((dt: any) => {
      const code = getCanonicalDepositCode(dt);
      if (code === 'POKOK') return false;
      const freq = String(dt?.frequency_type || '').trim().toLowerCase();
      return freq !== 'voluntary' && freq !== 'one_time' && freq !== 'once';
    })
    .sort((a: any, b: any) => {
      const ca = getCanonicalDepositCode(a);
      const cb = getCanonicalDepositCode(b);
      const diff = getDepositSortOrder(ca) - getDepositSortOrder(cb);
      if (diff !== 0) return diff;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'id');
    });

  const normalizedDepositTypesForResolver = depositTypes.map((dt: any) => ({
    ...dt,
    default_amount: dt.default_amount ?? dt.monthly_amount ?? 0,
  }));

  const rows: SavingsAggregateBillRow[] = [];
  const emittedDepositTypesMap = new Map<string, string>();

  for (const member of activeMembers) {
    const memberId = String(member.id);
    // Abaikan created_at agar anggota hasil impor massal tetap ditagih sejak cut-off aktual / awal tahun fiskal;
    // hanya maju jika ada joined_at eksplisit pasca cut-off dan belum memiliki mutasi awal.
    let memberStartIndex = resolvedCutoffIndex;
    const explicitJoin = parseYearMonth((member as any).joined_at || (member as any).tgl_awal_anggota);
    if (explicitJoin && !hasOpeningOrEarlyTxByMember.has(memberId)) {
      const joinIdx = explicitJoin.year * 12 + explicitJoin.month;
      if (joinIdx > memberStartIndex) {
        memberStartIndex = joinIdx;
      }
    }

    // 1. Evaluasi Simpanan Rutin Bulanan (WAJIB, BELANJA, LEBARAN, dll.)
    for (const dt of routineMonthlyTypes) {
      const dtId = String(dt.id);
      const canonicalCode = getCanonicalDepositCode(dt);
      const depositName = String(dt.name || canonicalCode);
      const memberDepositId = mdByMemberType.get(`${memberId}::${dtId}`) || null;

      let currentMonthDue = 0;
      let currentMonthPaid = 0;
      let currentMonthRemaining = 0;
      let previousArrearsAmount = 0;
      let previousArrearsMonthsCount = 0;
      let hasPositiveRate = false;
      const unpaidMonths: SavingsBillingUnpaidMonth[] = [];

      if (selectedPeriodIndex < memberStartIndex) {
        const previewRate = resolveMemberSavingsRate(
          memberId,
          canonicalCode || dt.code || dt.name || '',
          safeYear,
          safeMonth,
          {
            globalTiers: rateTiers,
            depositTypes: normalizedDepositTypesForResolver,
            memberLebaranRates,
          }
        );
        hasPositiveRate = previewRate > 0;
      } else {
        for (let p = memberStartIndex; p <= selectedPeriodIndex; p++) {
          const y = Math.floor((p - 1) / 12);
          const mo = ((p - 1) % 12) + 1;
          const expectedRate = resolveMemberSavingsRate(
            memberId,
            canonicalCode || dt.code || dt.name || '',
            y,
            mo,
            {
              globalTiers: rateTiers,
              depositTypes: normalizedDepositTypesForResolver,
              memberLebaranRates,
            }
          );

          if (expectedRate <= 0) continue;
          hasPositiveRate = true;

          const periodKey = `${memberId}::${dtId}::${y}-${mo}`;
          const paidForMonth = paidByMemberTypePeriod.get(periodKey) || 0;
          const isMatrixSettled = paidForMonth > 0 && matrixSettledKeys.has(periodKey);
          const shortfall = isMatrixSettled ? 0 : Math.max(0, expectedRate - paidForMonth);

          if (p === selectedPeriodIndex) {
            currentMonthDue = expectedRate;
            currentMonthPaid = paidForMonth;
            currentMonthRemaining = shortfall;
          } else if (shortfall > 0) {
            previousArrearsAmount += shortfall;
            previousArrearsMonthsCount += 1;
          }

          if (shortfall > 0) {
            const isArrears = p < selectedPeriodIndex;
            unpaidMonths.push({
              year: y,
              month: mo,
              periodIndex: p,
              label: formatShortPeriod(y, mo),
              fullLabel: `${FULL_MONTH_NAMES_ID[mo - 1]} ${y}`,
              expectedAmount: expectedRate,
              paidAmount: paidForMonth,
              remaining: shortfall,
              isArrears,
            });
          }
        }
      }

      if (!hasPositiveRate) {
        continue;
      }

      const totalAggregateBill = currentMonthDue + previousArrearsAmount;
      const remainingArrears = currentMonthRemaining + previousArrearsAmount;
      const totalPaidAllUnpaid = unpaidMonths.reduce((sum, u) => sum + u.paidAmount, 0);
      const { summary, fullList } = formatUnpaidMonthsSummary(unpaidMonths);

      let status: SavingsBillingStatus;
      if (remainingArrears <= 0) {
        status = 'LUNAS';
      } else if (unpaidMonths.some((u) => u.paidAmount > 0)) {
        status = 'PARSIAL';
      } else if (previousArrearsMonthsCount > 0) {
        status = 'MENUNGGAK';
      } else {
        status = 'BELUM_BAYAR';
      }

      emittedDepositTypesMap.set(canonicalCode, depositName);
      rows.push({
        id: `${memberId}:${dtId}`,
        member_id: memberId,
        member_deposit_id: memberDepositId,
        deposit_type_id: dtId,
        deposit_code: canonicalCode,
        deposit_name: depositName,
        isPokok: false,
        anggota: {
          id: memberId,
          nama: String(member.nama || '-'),
          nrp: String(member.nrp || '-'),
          tanggal_lahir: member.tanggal_lahir ?? null,
        },
        selectedYear: safeYear,
        selectedMonth: safeMonth,
        currentMonthDue,
        currentMonthPaid,
        currentMonthRemaining,
        previousArrearsAmount,
        previousArrearsMonthsCount,
        totalAggregateBill,
        remainingArrears,
        totalPaidAllUnpaid,
        unpaidMonths,
        unpaidMonthsCount: unpaidMonths.length,
        unpaidMonthsSummary: summary,
        unpaidMonthsFullList: fullList,
        status,
      });
    }

    // 2. Evaluasi Simpanan Pokok (POKOK) sekali bayar awal keanggotaan
    const pokokType = pokokTypes[0];
    if (pokokType) {
      const dtId = String(pokokType.id);
      const depositName = String(pokokType.name || 'Simpanan Pokok');
      const memberDepositId = mdByMemberType.get(`${memberId}::${dtId}`) || null;
      const resolvedPokok = resolveMemberSavingsRate(
        memberId,
        'POKOK',
        safeYear,
        safeMonth,
        {
          globalTiers: rateTiers,
          depositTypes: normalizedDepositTypesForResolver,
          memberLebaranRates,
        }
      );
      const pokokTariff =
        activePokokRate > 0
          ? activePokokRate
          : resolvedPokok > 0
          ? resolvedPokok
          : Number(pokokType.default_amount ?? pokokType.monthly_amount ?? 0);

      if (pokokTariff > 0) {
        const netPaid = Math.max(0, pokokNetPaidByMemberType.get(`${memberId}::${dtId}`) || 0);
        const shortfall = selectedPeriodIndex < memberStartIndex && explicitJoin ? 0 : Math.max(0, pokokTariff - netPaid);
        const unpaidMonths: SavingsBillingUnpaidMonth[] =
          shortfall > 0
            ? [
                {
                  year: safeYear,
                  month: 0,
                  periodIndex: 0,
                  label: 'Kewajiban Awal',
                  fullLabel: 'Kewajiban Awal Keanggotaan',
                  expectedAmount: pokokTariff,
                  paidAmount: netPaid,
                  remaining: shortfall,
                  isArrears: true,
                },
              ]
            : [];

        const status: SavingsBillingStatus =
          shortfall <= 0 ? 'LUNAS' : netPaid > 0 ? 'PARSIAL' : 'MENUNGGAK';

        emittedDepositTypesMap.set('POKOK', depositName);
        rows.push({
          id: `${memberId}:${dtId}`,
          member_id: memberId,
          member_deposit_id: memberDepositId,
          deposit_type_id: dtId,
          deposit_code: 'POKOK',
          deposit_name: depositName,
          isPokok: true,
          anggota: {
            id: memberId,
            nama: String(member.nama || '-'),
            nrp: String(member.nrp || '-'),
            tanggal_lahir: member.tanggal_lahir ?? null,
          },
          selectedYear: safeYear,
          selectedMonth: safeMonth,
          currentMonthDue: 0,
          currentMonthPaid: 0,
          currentMonthRemaining: 0,
          previousArrearsAmount: shortfall,
          previousArrearsMonthsCount: shortfall > 0 ? 1 : 0,
          totalAggregateBill: shortfall > 0 ? shortfall : pokokTariff,
          remainingArrears: shortfall,
          totalPaidAllUnpaid: shortfall > 0 ? netPaid : pokokTariff,
          unpaidMonths,
          unpaidMonthsCount: shortfall > 0 ? 1 : 0,
          unpaidMonthsSummary: shortfall > 0 ? 'Kewajiban Awal Keanggotaan' : 'Lunas',
          unpaidMonthsFullList: 'Kewajiban Awal Keanggotaan',
          status,
        });
      }
    }
  }

  // Urutkan default: Sisa tagihan terbesar di atas, lalu nama A-Z, lalu urutan jenis simpanan
  rows.sort((a, b) => {
    if (b.remainingArrears !== a.remainingArrears) {
      return b.remainingArrears - a.remainingArrears;
    }
    const nameDiff = (a.anggota.nama || '').localeCompare(b.anggota.nama || '', 'id');
    if (nameDiff !== 0) return nameDiff;
    return getDepositSortOrder(a.deposit_code) - getDepositSortOrder(b.deposit_code);
  });

  const availableDepositTypes = Array.from(emittedDepositTypesMap.entries())
    .sort((a, b) => getDepositSortOrder(a[0]) - getDepositSortOrder(b[0]))
    .map(([code, name]) => ({ code, name }));

  return {
    rows,
    cutoffDate,
    cutoffYear,
    cutoffMonth,
    totalActiveMembersCount: activeMembers.length,
    availableDepositTypes,
    isSelectedPeriodBeforeCutoff: selectedPeriodIndex < resolvedCutoffIndex,
  };
}

async function resolveOrCreateMemberDepositId(bill: SavingsAggregateBillRow): Promise<string> {
  if (bill.member_deposit_id) return bill.member_deposit_id;

  try {
    await ensureMandatoryDepositsAndEnroll(bill.member_id);
  } catch {
    // non-blocking
  }

  try {
    const mdTable: any = supabase.from('member_deposits');
    if (mdTable && typeof mdTable.select === 'function') {
      const q1 = mdTable.select('id');
      const q2 = q1 && typeof q1.eq === 'function' ? q1.eq('member_id', bill.member_id) : q1;
      const q3 = q2 && typeof q2.eq === 'function' ? q2.eq('deposit_type_id', bill.deposit_type_id) : q2;
      const existingRes =
        q3 && typeof q3.maybeSingle === 'function' ? await q3.maybeSingle() : await q3;
      const existingRow = Array.isArray(existingRes?.data) ? existingRes.data[0] : existingRes?.data;
      if (existingRow?.id) {
        return String(existingRow.id);
      }

      if (typeof mdTable.insert === 'function') {
        const insQ = mdTable.insert({
          member_id: bill.member_id,
          deposit_type_id: bill.deposit_type_id,
          balance: 0,
        });
        const selQ = insQ && typeof insQ.select === 'function' ? insQ.select('id') : insQ;
        const createdRes =
          selQ && typeof selQ.single === 'function' ? await selQ.single() : await selQ;
        if (createdRes?.error) {
          throw new Error(createdRes.error.message || 'Gagal membuat rekening simpanan');
        }
        const createdRow = Array.isArray(createdRes?.data) ? createdRes.data[0] : createdRes?.data;
        if (createdRow?.id) {
          return String(createdRow.id);
        }
      }
    }
  } catch (err: any) {
    throw new Error(
      `Gagal menemukan atau membuat rekening simpanan anggota: ${err?.message || 'Unknown error'}`
    );
  }

  throw new Error('Rekening simpanan anggota tidak dapat ditemukan atau dibuat.');
}

async function insertDepositTransactionAndCashFlow(params: {
  memberDepositId: string;
  amount: number;
  month: number | null;
  year: number | null;
  description: string;
  referenceNo: string;
  paymentMethod: 'tunai' | 'transfer_bank';
  notes?: string;
  cashierId: string | null;
  todayIsoDate: string;
  bill: SavingsAggregateBillRow;
}): Promise<{ txId: string | null; createdAt: string }> {
  const nowIso = new Date().toISOString();
  const paymentMethodLabel = params.paymentMethod === 'transfer_bank' ? 'Transfer Bank' : 'Tunai';
  const notesText = params.notes?.trim()
    ? `${params.notes.trim()} | Metode: ${paymentMethodLabel} | Ref: ${params.referenceNo}`
    : `Metode: ${paymentMethodLabel} | Ref: ${params.referenceNo}`;

  const fullPayload: Record<string, any> = {
    member_deposit_id: params.memberDepositId,
    transaction_type: 'deposit',
    amount: params.amount,
    for_month: params.month,
    for_year: params.year,
    reference_no: params.referenceNo,
    payment_method: params.paymentMethod,
    transaction_date: params.todayIsoDate,
    description: params.description,
    notes: notesText,
    created_by: params.cashierId,
  };

  const dtTable: any = supabase.from('deposit_transactions');
  const tryInsert = async (payload: Record<string, any>) => {
    const insQ = dtTable.insert(payload);
    if (insQ && typeof insQ.select === 'function') {
      const selQ = insQ.select('id, created_at');
      return typeof selQ?.single === 'function' ? await selQ.single() : await selQ;
    }
    return await insQ;
  };

  let txRes = await tryInsert(fullPayload);
  if (txRes?.error && isPostgrestColumnError(txRes.error)) {
    const { transaction_date: _td, ...fallback1 } = fullPayload;
    txRes = await tryInsert(fallback1);
  }
  if (txRes?.error && isPostgrestColumnError(txRes.error)) {
    txRes = await tryInsert({
      member_deposit_id: params.memberDepositId,
      transaction_type: 'deposit',
      amount: params.amount,
      for_month: params.month,
      for_year: params.year,
      description: params.description,
    });
  }
  if (txRes?.error) {
    throw new Error(`Gagal menyimpan transaksi simpanan: ${txRes.error.message}`);
  }

  const insertedRow = Array.isArray(txRes?.data) ? txRes.data[0] : txRes?.data;
  const txId = insertedRow?.id ? String(insertedRow.id) : null;
  const createdAt = insertedRow?.created_at ? String(insertedRow.created_at) : nowIso;

  // Catat kas masuk ke public.cash_flow (dengan reference_id agar tidak duplikat dengan syncMatrixDepositsToCashFlow)
  const cfTable: any = supabase?.from?.('cash_flow');
  if (cfTable && typeof cfTable.insert === 'function') {
    const cashFlowDesc = formatMatrixDepositCashFlowDescription({
      depositTypeName: params.bill.deposit_name,
      month: params.bill.isPokok ? null : params.month,
      year: params.bill.isPokok ? null : params.year,
      memberNrp: params.bill.anggota.nrp,
      memberName: params.bill.anggota.nama,
      referenceNo: params.referenceNo,
    });

    const cfRes: any = await cfTable.insert({
      direction: 'in',
      category: 'Setoran Simpanan',
      amount: params.amount,
      reference_id: txId,
      description: cashFlowDesc,
      created_at: createdAt,
    });

    if (cfRes?.error && isPostgrestColumnError(cfRes.error)) {
      const cfFallback = await cfTable.insert({
        direction: 'in',
        category: 'Setoran Simpanan',
        amount: params.amount,
        reference_id: txId,
        created_at: createdAt,
      });
      if (cfFallback?.error) {
        throw new Error(`Gagal mencatat arus kas setoran: ${cfFallback.error.message}`);
      }
    } else if (cfRes?.error) {
      throw new Error(`Gagal mencatat arus kas setoran: ${cfRes.error.message}`);
    }
  }

  return { txId, createdAt };
}

/**
 * Mencatat pelunasan tagihan & tunggakan simpanan (1 bulan, beberapa bulan, seluruh tunggakan, atau parsial)
 * ke `public.deposit_transactions` dan `public.cash_flow` secara kronologis (FIFO).
 */
export async function paySavingsBillArrears(
  input: PaySavingsBillInput
): Promise<PaySavingsBillResult> {
  const { bill } = input;
  const payAmount = Math.round(Number(input.paymentAmount || 0));

  if (payAmount <= 0) {
    throw new Error('Nominal pembayaran harus lebih dari Rp 0.');
  }
  if (bill.remainingArrears <= 0) {
    throw new Error('Tagihan simpanan ini sudah lunas.');
  }

  const memberDepositId = await resolveOrCreateMemberDepositId(bill);

  let cashierId: string | null = null;
  try {
    const authApi = (supabase as any)?.auth;
    if (authApi && typeof authApi.getUser === 'function') {
      const { data: authData } = await authApi.getUser();
      cashierId = authData?.user?.id || null;
    }
  } catch {
    // abaikan jika tidak dalam sesi auth aktif
  }

  const now = new Date();
  const todayIsoDate = getLocalIsoDate(now);
  const effectiveRefNo =
    input.referenceNo?.trim() ||
    (await generateNextCompactRegister(supabase, {
      table: 'deposit_transactions',
      column: 'reference_no',
      prefix: 'KS',
      date: now,
    }));

  const allocations: PaySavingsBillResult['allocations'] = [];
  let totalAllocated = 0;

  if (bill.isPokok) {
    const alloc = Math.min(payAmount, bill.remainingArrears);
    const { txId } = await insertDepositTransactionAndCashFlow({
      memberDepositId,
      amount: alloc,
      month: null,
      year: null,
      description: `Setoran ${bill.deposit_name}`,
      referenceNo: effectiveRefNo,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      cashierId,
      todayIsoDate,
      bill,
    });

    allocations.push({
      txId,
      year: null,
      month: null,
      label: 'Kewajiban Awal Keanggotaan',
      amount: alloc,
    });
    totalAllocated = alloc;
  } else {
    let targetMonths = [...bill.unpaidMonths].sort((a, b) => a.periodIndex - b.periodIndex);

    if (input.selectedMonths && input.selectedMonths.length > 0) {
      const selectedKeys = new Set(input.selectedMonths.map((m) => `${m.year}-${m.month}`));
      const filtered = targetMonths.filter((m) => selectedKeys.has(`${m.year}-${m.month}`));
      if (filtered.length > 0) {
        targetMonths = filtered;
      }
    }

    let remainingPay = payAmount;
    for (const m of targetMonths) {
      if (remainingPay <= 0) break;
      const alloc = Math.min(remainingPay, m.remaining);
      if (alloc <= 0) continue;

      const { txId } = await insertDepositTransactionAndCashFlow({
        memberDepositId,
        amount: alloc,
        month: m.month,
        year: m.year,
        description: `Setoran ${bill.deposit_name} (${m.label})`,
        referenceNo: effectiveRefNo,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        cashierId,
        todayIsoDate,
        bill,
      });

      allocations.push({
        txId,
        year: m.year,
        month: m.month,
        label: m.label,
        amount: alloc,
      });
      remainingPay -= alloc;
      totalAllocated += alloc;
    }

    // Jika nominal melebihi bulan terpilih tetapi masih ada sisa tagihan pada bulan belum lunas lainnya
    if (remainingPay > 0 && input.selectedMonths && input.selectedMonths.length > 0) {
      const alreadyHandled = new Set(allocations.map((a) => `${a.year}-${a.month}`));
      const fallbackMonths = [...bill.unpaidMonths]
        .filter((m) => !alreadyHandled.has(`${m.year}-${m.month}`))
        .sort((a, b) => a.periodIndex - b.periodIndex);

      for (const m of fallbackMonths) {
        if (remainingPay <= 0) break;
        const alloc = Math.min(remainingPay, m.remaining);
        if (alloc <= 0) continue;

        const { txId } = await insertDepositTransactionAndCashFlow({
          memberDepositId,
          amount: alloc,
          month: m.month,
          year: m.year,
          description: `Setoran ${bill.deposit_name} (${m.label})`,
          referenceNo: effectiveRefNo,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          cashierId,
          todayIsoDate,
          bill,
        });

        allocations.push({
          txId,
          year: m.year,
          month: m.month,
          label: m.label,
          amount: alloc,
        });
        remainingPay -= alloc;
        totalAllocated += alloc;
      }
    }
  }

  if (totalAllocated <= 0) {
    throw new Error('Tidak ada nominal pembayaran yang dapat dialokasikan ke tagihan.');
  }

  return {
    success: true,
    referenceNo: effectiveRefNo,
    totalAllocated,
    insertedCount: allocations.length,
    allocations,
  };
}

import { supabase } from '../lib/supabaseClient';
import { fetchAllPaged, matchDepositType, parseCutoffDateInfo } from './complianceService';
import { ensureMandatoryDepositsAndEnroll } from './depositManagementService';
import { getInitialLoansCutOffDate, parseLoanCutoffDateInfo } from './loanMatrixService';
import { getActivePokokTariff, getApplicableTierRate, getRateTiers, SavingsRateTier } from './savingsRateService';
import { getInitialSavingsCutOffDate } from './savingsMatrixService';
import { getKoperasiProfile, KoperasiProfile } from './settingsService';

export type SetoranPaymentMethod = 'tunai' | 'transfer_bank';

export const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

export const FULL_MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export interface UnpaidMonthBreakdown {
  year: number;
  month: number; // 1-12 for monthly periods, 0 for one-time obligation (e.g. Pokok)
  periodIndex: number; // year * 12 + month (0 for one-time)
  label: string; // e.g. "Okt 2026"
  fullLabel: string; // e.g. "Oktober 2026"
  expectedAmount: number;
  paidAmount: number;
  remaining: number;
  isArrears: boolean;
  statusLabel: 'Tunggakan' | 'Bulan Ini' | 'Kewajiban Pokok';
  scheduleId?: string;
  commitmentId?: string;
  periodNumber?: number;
}

export interface MemberBillingItem {
  id: string;
  category: 'savings' | 'pokok' | 'loan';
  code: string; // 'WAJIB' | 'BELANJA' | 'LEBARAN' | 'POKOK' | 'PINJAMAN' | custom code
  name: string;
  depositTypeId?: string;
  memberDepositId?: string | null;
  loanId?: string;
  loanTenor?: number;
  loanTotalRemaining?: number;
  totalDue: number;
  arrearsAmount: number;
  currentMonthAmount: number;
  unpaidMonths: UnpaidMonthBreakdown[];
  canPayPartial: boolean;
}

export interface SettledBillingInfo {
  id: string;
  code: string;
  name: string;
  category: 'savings' | 'pokok' | 'loan';
}

export interface MemberBillingSummary {
  member: {
    id: string;
    nama: string;
    nrp: string;
    pangkat?: string | null;
    created_at?: string;
  };
  selectedYear: number;
  selectedMonth: number;
  savingsCutoffDate: string | null;
  loansCutoffDate: string | null;
  items: MemberBillingItem[];
  settledItems: SettledBillingInfo[];
  totalTagihan: number;
  totalTunggakan: number;
  totalBulanIni: number;
}

export interface PaymentItemInput {
  item: MemberBillingItem;
  payAmount: number;
}

export interface ProcessMemberPaymentInput {
  member: {
    id: string;
    nama: string;
    nrp: string;
    pangkat?: string | null;
  };
  items: PaymentItemInput[];
  paymentMethod: SetoranPaymentMethod;
  cashierId?: string | null;
  cashierName?: string | null;
  selectedYear?: number;
  selectedMonth?: number;
}

export interface ReceiptAllocationLine {
  id: string;
  category: 'savings' | 'pokok' | 'loan';
  itemName: string;
  code: string;
  periodLabel: string;
  isArrears: boolean;
  allocationTag: 'Tunggakan' | 'Bulan Ini' | 'Kewajiban Pokok';
  year: number | null;
  month: number | null;
  amount: number;
  remainingAfter: number;
}

export interface ReceiptPayload {
  receiptNo: string;
  paidAt: string;
  transactionDate: string;
  memberId: string;
  memberName: string;
  memberNrp: string;
  memberPangkat?: string | null;
  paymentMethod: SetoranPaymentMethod;
  paymentMethodLabel: 'Tunai' | 'Transfer Bank';
  cashierId?: string | null;
  cashierName: string;
  totalPaid: number;
  lines: ReceiptAllocationLine[];
  koperasiProfile: KoperasiProfile;
  selectedPeriodLabel?: string;
}

export function formatPeriodLabel(year: number, month: number, full = false): string {
  if (!month || month < 1 || month > 12) return 'Sekali Bayar';
  const names = full ? FULL_MONTH_NAMES : SHORT_MONTH_NAMES;
  return `${names[month - 1]} ${year}`;
}

export function getLocalIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateSetoranReceiptNumber(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand4 = String(Math.floor(1000 + Math.random() * 9000));
  return `KW-SETOR-${y}${m}${d}-${rand4}`;
}

function isRoutineMonthlyDepositTx(tx: any): boolean {
  if (!tx || tx.transaction_type !== 'deposit') return false;
  const month = Number(tx.for_month || 0);
  const year = Number(tx.for_year || 0);
  if (month < 1 || month > 12 || year <= 0) return false;
  const desc = String(tx.description || '').toLowerCase();
  if (
    desc.includes('saldo awal') ||
    desc.includes('migrasi') ||
    desc.includes('bulk')
  ) {
    return false;
  }
  return true;
}

function getCanonicalDepositCode(depositType: any): string {
  const code = String(depositType?.code || '').trim().toUpperCase();
  const name = String(depositType?.name || '').trim().toLowerCase();
  if (code === 'POKOK' || name.includes('pokok')) return 'POKOK';
  if (code === 'WAJIB' || name.includes('wajib')) return 'WAJIB';
  if (code === 'BELANJA' || name.includes('belanja') || name.includes('toko')) return 'BELANJA';
  if (code === 'LEBARAN' || code === 'HARI_RAYA' || code === 'THR' || name.includes('lebaran') || name.includes('hari raya')) {
    return 'LEBARAN';
  }
  return code || 'OTHER';
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

function parseDateToYearMonth(rawDate?: string | null): { year: number; month: number } | null {
  if (!rawDate) return null;
  const str = String(rawDate).trim();
  const match = str.match(/^(\d{4})-(\d{1,2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (year > 1900 && month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  return null;
}

function resolveSchedulePeriod(
  sched: any,
  loan: any
): { year: number; month: number; periodIndex: number } {
  const explicitYear = Number(sched.due_year || sched.for_year || 0);
  const explicitMonth = Number(sched.due_month || sched.for_month || 0);
  if (explicitYear > 1900 && explicitMonth >= 1 && explicitMonth <= 12) {
    return {
      year: explicitYear,
      month: explicitMonth,
      periodIndex: explicitYear * 12 + explicitMonth,
    };
  }

  const parsedDue = parseDateToYearMonth(sched.due_date);
  if (parsedDue) {
    return {
      year: parsedDue.year,
      month: parsedDue.month,
      periodIndex: parsedDue.year * 12 + parsedDue.month,
    };
  }

  const baseParsed =
    parseDateToYearMonth(loan?.disbursed_at) ||
    parseDateToYearMonth(loan?.created_at);
  const periodNumber = Math.max(1, Number(sched.period_number || 1));
  if (baseParsed) {
    const baseIdx = baseParsed.year * 12 + baseParsed.month + (periodNumber - 1);
    const year = Math.floor((baseIdx - 1) / 12);
    const month = ((baseIdx - 1) % 12) + 1;
    return { year, month, periodIndex: baseIdx };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, periodIndex: year * 12 + month };
}

/**
 * Calculates cumulative unpaid & partial obligations (savings + Pokok + active loans)
 * from the post-cut-off effective period up to `(selectedYear, selectedMonth)`.
 */
export async function calculateMemberCumulativeBills(
  memberOrId:
    | string
    | {
        id: string;
        nama: string;
        nrp: string;
        pangkat?: string | null;
        created_at?: string;
        tgl_awal_anggota?: string;
      },
  selectedYear: number,
  selectedMonth: number
): Promise<MemberBillingSummary> {
  const selectedPeriodIndex = selectedYear * 12 + selectedMonth;

  // 1. Resolve member identity (never select tgl_awal_anggota from Postgres)
  let memberRecord: {
    id: string;
    nama: string;
    nrp: string;
    pangkat?: string | null;
    created_at?: string;
    tgl_awal_anggota?: string;
  };

  if (typeof memberOrId === 'string') {
    const { data, error } = await supabase
      .from('anggota')
      .select('id, nama, nrp, pangkat, created_at')
      .eq('id', memberOrId)
      .single();
    if (error || !data) {
      throw new Error(`Data anggota tidak ditemukan: ${error?.message || memberOrId}`);
    }
    memberRecord = data;
  } else {
    memberRecord = { ...memberOrId };
  }

  // Ensure mandatory deposit accounts exist for this member
  try {
    await ensureMandatoryDepositsAndEnroll(memberRecord.id);
  } catch (err) {
    console.warn('ensureMandatoryDepositsAndEnroll warning:', err);
  }

  // 2. Fetch deposit types, member deposit accounts, and rate tiers in parallel
  const [depositTypesRes, memberDepositsRes, directTiersRes, activePokokRate] = await Promise.all([
    supabase.from('deposit_types').select('*'),
    supabase.from('member_deposits').select('*').eq('member_id', memberRecord.id),
    supabase.from('savings_rate_tiers').select('*'),
    getActivePokokTariff().catch(() => 0),
  ]);

  if (depositTypesRes.error) {
    throw new Error(`Gagal memuat jenis simpanan: ${depositTypesRes.error.message}`);
  }
  if (memberDepositsRes.error) {
    throw new Error(`Gagal memuat akun simpanan anggota: ${memberDepositsRes.error.message}`);
  }

  const depositTypes = (depositTypesRes.data || []).filter((dt: any) => dt.is_active !== false);
  const memberDeposits = memberDepositsRes.data || [];

  let rateTiers: SavingsRateTier[] = [];
  if (!directTiersRes.error && directTiersRes.data) {
    rateTiers = directTiersRes.data as SavingsRateTier[];
  } else {
    rateTiers = await getRateTiers(undefined, false);
  }

  // 3. Fetch all deposit_transactions for this member's accounts
  const memberDepositIds = memberDeposits.map((md: any) => md.id).filter(Boolean);
  let allMemberTxs: any[] = [];
  if (memberDepositIds.length > 0) {
    const { data: txData, error: txError } = await fetchAllPaged<any>(
      'deposit_transactions',
      '*',
      (q) => q.in('member_deposit_id', memberDepositIds)
    );
    if (txError) {
      throw new Error(`Gagal memuat mutasi simpanan: ${txError.message}`);
    }
    allMemberTxs = txData || [];
  }

  // 4. Resolve savings cut-off date & scan start period
  const savingsCutoffDate = await getInitialSavingsCutOffDate(allMemberTxs);
  const savingsCutoffInfo = parseCutoffDateInfo(savingsCutoffDate);

  let savingsStartPeriodIndex: number;
  if (savingsCutoffInfo) {
    // Anchor strictly to initial_savings_effective_date (bulk-imported members have recent created_at)
    savingsStartPeriodIndex = savingsCutoffInfo.periodIndex;
    const explicitJoin = parseDateToYearMonth((memberRecord as any).tgl_awal_anggota);
    if (explicitJoin) {
      const explicitIdx = explicitJoin.year * 12 + explicitJoin.month;
      if (explicitIdx > savingsStartPeriodIndex) {
        savingsStartPeriodIndex = explicitIdx;
      }
    }
  } else {
    const joinFallback =
      parseDateToYearMonth((memberRecord as any).tgl_awal_anggota) ||
      parseDateToYearMonth(memberRecord.created_at);
    savingsStartPeriodIndex = joinFallback
      ? joinFallback.year * 12 + joinFallback.month
      : selectedPeriodIndex;
  }

  // Group member deposits and transactions by deposit_type_id
  const accountByTypeId = new Map<string, any>();
  for (const md of memberDeposits) {
    if (md.deposit_type_id) {
      accountByTypeId.set(md.deposit_type_id, md);
    }
  }

  const txsByAccountId = new Map<string, any[]>();
  for (const tx of allMemberTxs) {
    const accId = tx.member_deposit_id;
    if (!accId) continue;
    if (!txsByAccountId.has(accId)) txsByAccountId.set(accId, []);
    txsByAccountId.get(accId)!.push(tx);
  }

  const items: MemberBillingItem[] = [];
  const settledItems: SettledBillingInfo[] = [];

  // 5A. Savings Obligations: POKOK + Routine Monthly (WAJIB, BELANJA, LEBARAN, etc.)
  const pokokType = matchDepositType(depositTypes, ['POKOK'], ['pokok']);
  if (pokokType) {
    const account = accountByTypeId.get(pokokType.id);
    const txs = account ? txsByAccountId.get(account.id) || [] : [];
    const netPokokPaid = txs.reduce((sum: number, tx: any) => {
      const amt = Number(tx.amount || 0);
      return tx.transaction_type === 'withdrawal' ? sum - amt : sum + amt;
    }, 0);

    const targetPokok =
      activePokokRate > 0
        ? activePokokRate
        : Number(pokokType.default_amount ?? (pokokType as any).monthly_amount ?? 0);
    const deficit = Math.max(0, targetPokok - netPokokPaid);

    if (deficit > 0) {
      items.push({
        id: `pokok:${pokokType.id}`,
        category: 'pokok',
        code: 'POKOK',
        name: pokokType.name || 'Simpanan Pokok',
        depositTypeId: pokokType.id,
        memberDepositId: account?.id || null,
        totalDue: deficit,
        arrearsAmount: deficit,
        currentMonthAmount: 0,
        unpaidMonths: [
          {
            year: selectedYear,
            month: 0,
            periodIndex: 0,
            label: 'Kekurangan Pokok',
            fullLabel: 'Kekurangan Simpanan Pokok',
            expectedAmount: targetPokok,
            paidAmount: Math.max(0, netPokokPaid),
            remaining: deficit,
            isArrears: true,
            statusLabel: 'Kewajiban Pokok',
          },
        ],
        canPayPartial: true,
      });
    } else if (targetPokok > 0) {
      settledItems.push({
        id: `pokok:${pokokType.id}`,
        code: 'POKOK',
        name: pokokType.name || 'Simpanan Pokok',
        category: 'pokok',
      });
    }
  }

  // Sort routine types nicely: WAJIB, BELANJA, LEBARAN, then others
  const routineOrder = ['WAJIB', 'BELANJA', 'LEBARAN'];
  const nonPokokTypes = depositTypes
    .filter((dt: any) => !pokokType || dt.id !== pokokType.id)
    .sort((a: any, b: any) => {
      const ca = getCanonicalDepositCode(a);
      const cb = getCanonicalDepositCode(b);
      const ia = routineOrder.indexOf(ca);
      const ib = routineOrder.indexOf(cb);
      const oa = ia === -1 ? 99 : ia;
      const ob = ib === -1 ? 99 : ib;
      return oa - ob;
    });

  for (const dt of nonPokokTypes) {
    const canonicalCode = getCanonicalDepositCode(dt);
    // Skip purely voluntary savings with no tariff configured
    const account = accountByTypeId.get(dt.id);
    const txs = account ? txsByAccountId.get(account.id) || [] : [];

    const paidByPeriod = new Map<string, number>();
    for (const tx of txs) {
      if (!isRoutineMonthlyDepositTx(tx)) continue;
      const key = `${Number(tx.for_year)}-${Number(tx.for_month)}`;
      paidByPeriod.set(key, (paidByPeriod.get(key) || 0) + Number(tx.amount || 0));
    }

    const unpaidMonths: UnpaidMonthBreakdown[] = [];
    let hasPositiveTariff = false;

    for (let p = savingsStartPeriodIndex; p <= selectedPeriodIndex; p++) {
      const year = Math.floor((p - 1) / 12);
      const month = ((p - 1) % 12) + 1;

      let rate = 0;
      if (['WAJIB', 'BELANJA', 'LEBARAN'].includes(canonicalCode)) {
        rate = getApplicableTierRate(rateTiers, canonicalCode, year, month);
      } else {
        const matchingTiers = rateTiers.filter(
          (t) => String(t.deposit_type_code || '').toUpperCase() === canonicalCode
        );
        rate =
          matchingTiers.length > 0
            ? getApplicableTierRate(rateTiers, canonicalCode, year, month)
            : Number(dt.default_amount ?? dt.monthly_amount ?? 0);
      }

      if (rate <= 0) continue;
      hasPositiveTariff = true;

      const paid = paidByPeriod.get(`${year}-${month}`) || 0;
      const remaining = Math.max(0, rate - paid);
      if (remaining > 0) {
        const isArrears = p < selectedPeriodIndex;
        unpaidMonths.push({
          year,
          month,
          periodIndex: p,
          label: formatPeriodLabel(year, month, false),
          fullLabel: formatPeriodLabel(year, month, true),
          expectedAmount: rate,
          paidAmount: paid,
          remaining,
          isArrears,
          statusLabel: isArrears ? 'Tunggakan' : 'Bulan Ini',
        });
      }
    }

    if (unpaidMonths.length > 0) {
      const totalDue = unpaidMonths.reduce((s, m) => s + m.remaining, 0);
      const arrearsAmount = unpaidMonths
        .filter((m) => m.isArrears)
        .reduce((s, m) => s + m.remaining, 0);
      const currentMonthAmount = totalDue - arrearsAmount;

      items.push({
        id: `savings:${dt.id}`,
        category: 'savings',
        code: canonicalCode,
        name: dt.name || canonicalCode,
        depositTypeId: dt.id,
        memberDepositId: account?.id || null,
        totalDue,
        arrearsAmount,
        currentMonthAmount,
        unpaidMonths,
        canPayPartial: true,
      });
    } else if (hasPositiveTariff) {
      settledItems.push({
        id: `savings:${dt.id}`,
        code: canonicalCode,
        name: dt.name || canonicalCode,
        category: 'savings',
      });
    }
  }

  // 5B. Active Loans & Schedules up to (selectedYear, selectedMonth)
  const { data: loansData, error: loansError } = await supabase
    .from('loans')
    .select('*')
    .eq('member_id', memberRecord.id)
    .in('status', ['active', 'approved']);

  if (loansError) {
    throw new Error(`Gagal memuat data pinjaman anggota: ${loansError.message}`);
  }

  const activeLoans = loansData || [];
  const loansCutoffDate = await getInitialLoansCutOffDate(activeLoans);
  const loansCutoffInfo = parseLoanCutoffDateInfo(loansCutoffDate);
  const loanCutoffPeriodIndex = loansCutoffInfo ? loansCutoffInfo.periodIndex : 0;

  for (const loan of activeLoans) {
    const { data: schedulesData, error: schedError } = await supabase
      .from('loan_schedules')
      .select('*')
      .eq('loan_id', loan.id)
      .order('period_number', { ascending: true });

    if (schedError) {
      throw new Error(`Gagal memuat jadwal angsuran pinjaman: ${schedError.message}`);
    }

    const allSchedules = schedulesData || [];
    const unpaidMonths: UnpaidMonthBreakdown[] = [];

    if (allSchedules.length > 0) {
      for (const sched of allSchedules) {
        if (sched.status !== 'unpaid' && sched.status !== 'partial') continue;

        const period = resolveSchedulePeriod(sched, loan);
        if (loanCutoffPeriodIndex > 0 && period.periodIndex < loanCutoffPeriodIndex) {
          continue;
        }
        if (period.periodIndex > selectedPeriodIndex) {
          continue;
        }

        const expectedAmount = Number(
          sched.total_amount ??
            sched.amount ??
            sched.installment_amount ??
            Number(sched.principal_amount || 0) + Number(sched.interest_amount || 0)
        );
        const paidAmount = Number(sched.paid_amount ?? 0);
        const remaining = Math.max(0, expectedAmount - paidAmount);
        if (remaining <= 0) continue;

        const isArrears = period.periodIndex < selectedPeriodIndex;
        const periodNum = Number(sched.period_number || 0);
        const label = `${formatPeriodLabel(period.year, period.month, false)}${
          periodNum > 0 ? ` (Ke-${periodNum})` : ''
        }`;

        unpaidMonths.push({
          year: period.year,
          month: period.month,
          periodIndex: period.periodIndex,
          label,
          fullLabel: `${formatPeriodLabel(period.year, period.month, true)}${
            periodNum > 0 ? ` (Angsuran Ke-${periodNum})` : ''
          }`,
          expectedAmount,
          paidAmount,
          remaining,
          isArrears,
          statusLabel: isArrears ? 'Tunggakan' : 'Bulan Ini',
          scheduleId: sched.id,
          periodNumber: periodNum || undefined,
        });
      }
    } else {
      // Fallback for legacy loans tracked via monthly_loan_commitments
      const { data: commitmentsData } = await supabase
        .from('monthly_loan_commitments')
        .select('*')
        .eq('loan_id', loan.id)
        .neq('status', 'lunas')
        .order('for_year', { ascending: true })
        .order('for_month', { ascending: true });

      for (const comm of commitmentsData || []) {
        const y = Number(comm.for_year || 0);
        const m = Number(comm.for_month || 0);
        if (y <= 1900 || m < 1 || m > 12) continue;
        const p = y * 12 + m;
        if (loanCutoffPeriodIndex > 0 && p < loanCutoffPeriodIndex) continue;
        if (p > selectedPeriodIndex) continue;

        const expected = Number(comm.amount || comm.installment_amount || loan.angsuran_per_bulan || 0);
        const paid = Number(comm.paid_amount || 0);
        const remaining = Math.max(0, expected - paid);
        if (remaining <= 0) continue;

        const isArrears = p < selectedPeriodIndex;
        unpaidMonths.push({
          year: y,
          month: m,
          periodIndex: p,
          label: formatPeriodLabel(y, m, false),
          fullLabel: formatPeriodLabel(y, m, true),
          expectedAmount: expected,
          paidAmount: paid,
          remaining,
          isArrears,
          statusLabel: isArrears ? 'Tunggakan' : 'Bulan Ini',
          commitmentId: comm.id,
        });
      }
    }

    unpaidMonths.sort((a, b) => {
      if (a.periodIndex !== b.periodIndex) return a.periodIndex - b.periodIndex;
      return (a.periodNumber || 0) - (b.periodNumber || 0);
    });

    const loanLabel = loan.loan_type_name || loan.jenis_pinjaman || 'Pinjaman Anggota';

    if (unpaidMonths.length > 0) {
      const totalDue = unpaidMonths.reduce((s, m) => s + m.remaining, 0);
      const arrearsAmount = unpaidMonths
        .filter((m) => m.isArrears)
        .reduce((s, m) => s + m.remaining, 0);
      const currentMonthAmount = totalDue - arrearsAmount;

      items.push({
        id: `loan:${loan.id}`,
        category: 'loan',
        code: 'PINJAMAN',
        name: `Angsuran ${loanLabel}`,
        loanId: loan.id,
        loanTenor: Number(loan.tenor || 0) || undefined,
        loanTotalRemaining: Number(loan.sisa_pinjaman ?? totalDue),
        totalDue,
        arrearsAmount,
        currentMonthAmount,
        unpaidMonths,
        canPayPartial: true,
      });
    } else {
      settledItems.push({
        id: `loan:${loan.id}`,
        code: 'PINJAMAN',
        name: `Angsuran ${loanLabel}`,
        category: 'loan',
      });
    }
  }

  const totalTagihan = items.reduce((s, item) => s + item.totalDue, 0);
  const totalTunggakan = items.reduce((s, item) => s + item.arrearsAmount, 0);
  const totalBulanIni = items.reduce((s, item) => s + item.currentMonthAmount, 0);

  return {
    member: {
      id: memberRecord.id,
      nama: memberRecord.nama,
      nrp: memberRecord.nrp,
      pangkat: memberRecord.pangkat ?? null,
      created_at: memberRecord.created_at,
    },
    selectedYear,
    selectedMonth,
    savingsCutoffDate,
    loansCutoffDate,
    items,
    settledItems,
    totalTagihan,
    totalTunggakan,
    totalBulanIni,
  };
}

async function insertDepositTransactionResilient(payload: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('deposit_transactions').insert(payload);
  if (!error) return;

  if (isPostgrestColumnError(error)) {
    const fallback1: Record<string, any> = { ...payload };
    delete fallback1.transaction_date;
    const { error: err1 } = await supabase.from('deposit_transactions').insert(fallback1);
    if (!err1) return;

    if (isPostgrestColumnError(err1)) {
      const fallback2: Record<string, any> = {
        member_deposit_id: payload.member_deposit_id,
        transaction_type: payload.transaction_type,
        amount: payload.amount,
        for_month: payload.for_month,
        for_year: payload.for_year,
        payment_method: payload.payment_method,
        description: payload.description,
        notes: payload.notes,
      };
      const { error: err2 } = await supabase.from('deposit_transactions').insert(fallback2);
      if (!err2) return;

      if (isPostgrestColumnError(err2)) {
        const fallback3: Record<string, any> = {
          member_deposit_id: payload.member_deposit_id,
          transaction_type: payload.transaction_type,
          amount: payload.amount,
          for_month: payload.for_month,
          for_year: payload.for_year,
          description: payload.description,
        };
        const { error: err3 } = await supabase.from('deposit_transactions').insert(fallback3);
        if (!err3) return;
        throw new Error(`Gagal menyimpan transaksi simpanan: ${err3.message}`);
      }
      throw new Error(`Gagal menyimpan transaksi simpanan: ${err2.message}`);
    }
    throw new Error(`Gagal menyimpan transaksi simpanan: ${err1.message}`);
  }

  throw new Error(`Gagal menyimpan transaksi simpanan: ${error.message}`);
}

async function insertLoanRepaymentResilient(payload: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('loan_repayments').insert(payload);
  if (!error) return;

  if (isPostgrestColumnError(error)) {
    const fallback1 = {
      loan_id: payload.loan_id,
      schedule_id: payload.schedule_id,
      amount_paid: payload.amount_paid,
      payment_method: payload.payment_method,
      receipt_number: payload.receipt_number,
      notes: payload.notes,
    };
    const { error: err1 } = await supabase.from('loan_repayments').insert(fallback1);
    if (!err1) return;

    if (isPostgrestColumnError(err1)) {
      const fallback2 = {
        loan_id: payload.loan_id,
        schedule_id: payload.schedule_id,
        amount_paid: payload.amount_paid,
        notes: payload.notes,
      };
      const { error: err2 } = await supabase.from('loan_repayments').insert(fallback2);
      if (!err2) return;
      throw new Error(`Gagal mencatat pembayaran angsuran: ${err2.message}`);
    }
    throw new Error(`Gagal mencatat pembayaran angsuran: ${err1.message}`);
  }

  throw new Error(`Gagal mencatat pembayaran angsuran: ${error.message}`);
}

async function insertCashFlowResilient(
  amount: number,
  description: string,
  cashierId?: string | null
): Promise<void> {
  const { error } = await supabase.from('cash_flow').insert({
    direction: 'in',
    amount,
    category: 'SETORAN_ANGGOTA',
    description,
    created_by: cashierId || null,
  });

  if (!error) return;

  if (isPostgrestColumnError(error)) {
    const { error: err2 } = await supabase.from('cash_flow').insert({
      direction: 'in',
      amount,
      category: 'SETORAN_ANGGOTA',
    });
    if (!err2) return;
    throw new Error(`Gagal mencatat arus kas setoran: ${err2.message}`);
  }

  throw new Error(`Gagal mencatat arus kas setoran: ${error.message}`);
}

async function resolveMemberDepositAccountId(
  memberId: string,
  depositTypeId?: string,
  existingAccountId?: string | null
): Promise<string> {
  if (existingAccountId) return existingAccountId;
  if (!depositTypeId) {
    throw new Error('Jenis simpanan tidak valid untuk membuat akun simpanan anggota.');
  }

  await ensureMandatoryDepositsAndEnroll(memberId);
  const { data: existing, error: fetchErr } = await supabase
    .from('member_deposits')
    .select('id')
    .eq('member_id', memberId)
    .eq('deposit_type_id', depositTypeId)
    .maybeSingle();

  if (!fetchErr && existing?.id) {
    return existing.id;
  }

  const { data: created, error: insertErr } = await supabase
    .from('member_deposits')
    .insert({
      member_id: memberId,
      deposit_type_id: depositTypeId,
      balance: 0,
    })
    .select('id')
    .single();

  if (insertErr || !created?.id) {
    throw new Error(
      `Gagal menemukan atau membuat akun simpanan anggota: ${insertErr?.message || 'Unknown error'}`
    );
  }
  return created.id;
}

/**
 * Executes a member's combined payment using strict FIFO chronological allocation,
 * attaches explicit payment method (`tunai` | `transfer_bank`), records `cash_flow`,
 * and returns complete receipt payload ready for print or PDF download.
 */
export async function processMemberPayment(
  input: ProcessMemberPaymentInput
): Promise<ReceiptPayload> {
  const {
    member,
    items,
    paymentMethod,
    cashierId,
    cashierName,
    selectedYear,
    selectedMonth,
  } = input;

  const payableItems = items
    .map((entry) => ({
      item: entry.item,
      payAmount: Math.round(Number(entry.payAmount || 0)),
    }))
    .filter((entry) => entry.payAmount > 0);

  if (payableItems.length === 0) {
    throw new Error('Tidak ada item dengan nominal pembayaran lebih dari Rp 0.');
  }

  const now = new Date();
  const todayIsoDate = getLocalIsoDate(now);
  const receiptNo = generateSetoranReceiptNumber(now);
  const paymentMethodLabel: 'Tunai' | 'Transfer Bank' =
    paymentMethod === 'transfer_bank' ? 'Transfer Bank' : 'Tunai';

  const receiptLines: ReceiptAllocationLine[] = [];
  let totalPaid = 0;

  // Pre-count expected loan schedule allocations so multi-row loan_repayments get unique receipt suffixes
  let plannedLoanScheduleCount = 0;
  for (const { item, payAmount } of payableItems) {
    if (item.category !== 'loan') continue;
    const sorted = [...item.unpaidMonths].sort((a, b) => a.periodIndex - b.periodIndex);
    let rem = payAmount;
    for (const m of sorted) {
      if (rem <= 0) break;
      if (m.scheduleId) {
        const alloc = Math.min(rem, m.remaining);
        if (alloc > 0) {
          plannedLoanScheduleCount += 1;
          rem -= alloc;
        }
      }
    }
  }

  let loanScheduleRowIndex = 0;

  // 1. Allocate each checked item
  for (const { item, payAmount } of payableItems) {
    if (item.category === 'pokok') {
      const depositAccountId = await resolveMemberDepositAccountId(
        member.id,
        item.depositTypeId,
        item.memberDepositId
      );

      await insertDepositTransactionResilient({
        member_deposit_id: depositAccountId,
        transaction_type: 'deposit',
        amount: payAmount,
        for_month: null,
        for_year: null,
        reference_no: receiptNo,
        payment_method: paymentMethod,
        transaction_date: todayIsoDate,
        description: `Setoran ${item.name}`,
        notes: `Metode: ${paymentMethodLabel} | Kwitansi: ${receiptNo}`,
        created_by: cashierId || null,
      });

      totalPaid += payAmount;
      const expectedRem = item.unpaidMonths[0]?.remaining ?? payAmount;
      receiptLines.push({
        id: `${item.id}-pokok`,
        category: 'pokok',
        itemName: item.name,
        code: item.code,
        periodLabel: 'Kewajiban Pokok',
        isArrears: true,
        allocationTag: 'Kewajiban Pokok',
        year: null,
        month: null,
        amount: payAmount,
        remainingAfter: Math.max(0, expectedRem - payAmount),
      });
      continue;
    }

    if (item.category === 'savings') {
      const depositAccountId = await resolveMemberDepositAccountId(
        member.id,
        item.depositTypeId,
        item.memberDepositId
      );

      const sortedMonths = [...item.unpaidMonths].sort((a, b) => a.periodIndex - b.periodIndex);
      let remainingPay = payAmount;

      for (const m of sortedMonths) {
        if (remainingPay <= 0) break;
        const alloc = Math.min(remainingPay, m.remaining);
        if (alloc <= 0) continue;

        await insertDepositTransactionResilient({
          member_deposit_id: depositAccountId,
          transaction_type: 'deposit',
          amount: alloc,
          for_month: m.month,
          for_year: m.year,
          reference_no: receiptNo,
          payment_method: paymentMethod,
          transaction_date: todayIsoDate,
          description: `Setoran ${item.name} (${m.label})`,
          notes: `Metode: ${paymentMethodLabel} | Kwitansi: ${receiptNo}`,
          created_by: cashierId || null,
        });

        remainingPay -= alloc;
        totalPaid += alloc;
        receiptLines.push({
          id: `${item.id}-${m.year}-${m.month}`,
          category: 'savings',
          itemName: item.name,
          code: item.code,
          periodLabel: m.label,
          isArrears: m.isArrears,
          allocationTag: m.isArrears ? 'Tunggakan' : 'Bulan Ini',
          year: m.year,
          month: m.month,
          amount: alloc,
          remainingAfter: Math.max(0, m.remaining - alloc),
        });
      }

      // Guard if cashier somehow entered an amount slightly above combined unpaid months
      if (remainingPay > 0) {
        const targetYear = selectedYear || now.getFullYear();
        const targetMonth = selectedMonth || now.getMonth() + 1;
        const label = formatPeriodLabel(targetYear, targetMonth, false);

        await insertDepositTransactionResilient({
          member_deposit_id: depositAccountId,
          transaction_type: 'deposit',
          amount: remainingPay,
          for_month: targetMonth,
          for_year: targetYear,
          reference_no: receiptNo,
          payment_method: paymentMethod,
          transaction_date: todayIsoDate,
          description: `Setoran ${item.name} (${label})`,
          notes: `Metode: ${paymentMethodLabel} | Kwitansi: ${receiptNo}`,
          created_by: cashierId || null,
        });

        totalPaid += remainingPay;
        receiptLines.push({
          id: `${item.id}-extra-${targetYear}-${targetMonth}`,
          category: 'savings',
          itemName: item.name,
          code: item.code,
          periodLabel: label,
          isArrears: false,
          allocationTag: 'Bulan Ini',
          year: targetYear,
          month: targetMonth,
          amount: remainingPay,
          remainingAfter: 0,
        });
      }
      continue;
    }

    if (item.category === 'loan' && item.loanId) {
      const sortedSchedules = [...item.unpaidMonths].sort((a, b) => {
        if (a.periodIndex !== b.periodIndex) return a.periodIndex - b.periodIndex;
        return (a.periodNumber || 0) - (b.periodNumber || 0);
      });

      let remainingPay = payAmount;
      let allocatedForLoan = 0;

      for (const m of sortedSchedules) {
        if (remainingPay <= 0) break;
        const alloc = Math.min(remainingPay, m.remaining);
        if (alloc <= 0) continue;

        if (m.scheduleId) {
          loanScheduleRowIndex += 1;
          const rowReceiptNo =
            plannedLoanScheduleCount > 1
              ? `${receiptNo}-L${loanScheduleRowIndex}`
              : receiptNo;

          const newPaidAmount = m.paidAmount + alloc;
          const isFullyPaid = newPaidAmount >= m.expectedAmount - 0.01;
          const newStatus = isFullyPaid ? 'paid' : 'partial';

          const { error: schedUpdErr } = await supabase
            .from('loan_schedules')
            .update({
              paid_amount: newPaidAmount,
              status: newStatus,
            })
            .eq('id', m.scheduleId);

          if (schedUpdErr) {
            throw new Error(
              `Gagal memperbarui jadwal angsuran (${m.label}): ${schedUpdErr.message}`
            );
          }

          await insertLoanRepaymentResilient({
            loan_id: item.loanId,
            schedule_id: m.scheduleId,
            amount_paid: alloc,
            payment_method: paymentMethod,
            receipt_number: rowReceiptNo,
            payment_date: todayIsoDate,
            notes: `Metode: ${paymentMethodLabel} | ${m.fullLabel} | Kwitansi: ${receiptNo}`,
            created_by: cashierId || null,
          });
        } else if (m.commitmentId) {
          const isFullyPaid = alloc >= m.remaining - 0.01;
          await supabase
            .from('monthly_loan_commitments')
            .update({ status: isFullyPaid ? 'lunas' : 'sebagian' })
            .eq('id', m.commitmentId);
        }

        // Sync legacy loan_installments ledger non-blockingly
        try {
          await supabase.from('loan_installments').insert({
            loan_id: item.loanId,
            installment_number: m.periodNumber || null,
            amount: alloc,
            payment_date: todayIsoDate,
            for_month: m.month || null,
            for_year: m.year || null,
            notes: `Metode: ${paymentMethodLabel} | ${m.label} | Kwitansi: ${receiptNo}`,
          });
        } catch (instErr) {
          console.warn('Non-blocking loan_installments insert failed:', instErr);
        }

        remainingPay -= alloc;
        allocatedForLoan += alloc;
        totalPaid += alloc;

        receiptLines.push({
          id: `${item.id}-${m.scheduleId || m.commitmentId || `${m.year}-${m.month}`}`,
          category: 'loan',
          itemName: item.name,
          code: item.code,
          periodLabel: m.label,
          isArrears: m.isArrears,
          allocationTag: m.isArrears ? 'Tunggakan' : 'Bulan Ini',
          year: m.year || null,
          month: m.month || null,
          amount: alloc,
          remainingAfter: Math.max(0, m.remaining - alloc),
        });
      }

      // Update loan sisa_pinjaman and check if all schedules across entire loan are paid
      if (allocatedForLoan > 0) {
        const [{ data: loanRow }, { data: allLoanSchedules }] = await Promise.all([
          supabase.from('loans').select('id, sisa_pinjaman, status').eq('id', item.loanId).maybeSingle(),
          supabase.from('loan_schedules').select('id, status').eq('loan_id', item.loanId),
        ]);

        const hasSchedules = Array.isArray(allLoanSchedules) && allLoanSchedules.length > 0;
        const allPaid =
          hasSchedules && allLoanSchedules.every((s: any) => s.status === 'paid');

        const currentSisa = Number(loanRow?.sisa_pinjaman ?? item.loanTotalRemaining ?? 0);
        const newSisa = allPaid ? 0 : Math.max(0, currentSisa - allocatedForLoan);
        const nextStatus = allPaid || (newSisa <= 0 && !hasSchedules) ? 'paid_off' : 'active';

        const { error: loanUpdErr } = await supabase
          .from('loans')
          .update({
            sisa_pinjaman: newSisa,
            status: nextStatus,
          })
          .eq('id', item.loanId);

        if (loanUpdErr && nextStatus === 'paid_off') {
          await supabase
            .from('loans')
            .update({
              sisa_pinjaman: newSisa,
              status: 'completed',
            })
            .eq('id', item.loanId);
        }
      }
    }
  }

  // 2. Record combined inflow in cash_flow
  const cashFlowDescription = `Setoran Anggota ${member.nama} (${member.nrp}) - ${paymentMethodLabel} [${receiptNo}]`;
  await insertCashFlowResilient(totalPaid, cashFlowDescription, cashierId);

  // 3. Load official koperasi profile for receipt header
  const koperasiProfile = await getKoperasiProfile();

  return {
    receiptNo,
    paidAt: now.toISOString(),
    transactionDate: todayIsoDate,
    memberId: member.id,
    memberName: member.nama,
    memberNrp: member.nrp,
    memberPangkat: member.pangkat ?? null,
    paymentMethod,
    paymentMethodLabel,
    cashierId: cashierId ?? null,
    cashierName: cashierName || 'Petugas Kasir',
    totalPaid,
    lines: receiptLines,
    koperasiProfile,
    selectedPeriodLabel:
      selectedYear && selectedMonth
        ? formatPeriodLabel(selectedYear, selectedMonth, true)
        : undefined,
  };
}

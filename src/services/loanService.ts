import { supabase } from '../lib/supabaseClient';
import {
  getActiveSavingsRateTiers,
  loadSavingsRateConfig,
  resolveMemberSavingsRate,
  normalizeDepositTypeCode
} from './savingsRateService';
import { LoanType, FinancingScheme } from './koperasiService';
import { normalizeName, type InitialLoanRow } from '../utils/initialLoansParser';
import {
  RecordLoanRepaymentRpcResponse,
  PayScheduleResult,
  MakePaymentResult
} from '../types/loan';
import {
  getLoanSettings,
  updateLoanSettings,
  DEFAULT_MIN_REMAINING_THP,
  DEFAULT_RAT_NOTES,
  type LoanSettings
} from './settingsService';
import {
  generateNextCompactRegister,
  incrementCompactRegister,
  isUniqueConstraintError,
} from '../utils/receiptGenerator';

export {
  getLoanSettings,
  updateLoanSettings,
  DEFAULT_MIN_REMAINING_THP,
  DEFAULT_RAT_NOTES,
  type LoanSettings
};
export type { LoanType, FinancingScheme };

export interface Loan {
  id: string;
  loan_number?: string;
  member_id: string;
  loan_type_id?: string;
  refinanced_loan_id?: string | null;
  topup_settlement_amount?: number;
  topup_old_loan_numbers?: string[];
  notes: string;
  amount: number;
  principal_amount?: number;
  item_description?: string | null;
  cost_price?: number;
  markup_amount?: number;
  agreed_tenor_months?: number;
  planned_installment_amount?: number;
  tenor: number;
  monthly_target: number;
  sisa_pinjaman?: number;
  status: 'draft' | 'approved' | 'active' | 'berjalan' | 'disbursed' | 'paid_off' | 'defaulted' | 'completed' | 'rejected';
  disbursed_at: string | null;
  created_at: string;
  updated_at?: string;
  loan_types?: Partial<LoanType> | null;
}

export interface LoanSchedule {
  id: string;
  loan_id: string;
  period_number: number;
  due_date: string;
  target_amount: number;
  principal_portion?: number;
  margin_portion?: number;
  paid_amount: number;
  status: 'unpaid' | 'partial' | 'paid';
}

export interface LoanRepayment {
  id: string;
  loan_id: string;
  schedule_id: string | null;
  amount_paid: number;
  principal_portion?: number;
  margin_portion?: number;
  payment_date: string;
  payment_method: string;
  notes: string | null;
}

export interface GoodsMarkupScheduleItem {
  period_number: number;
  principal_portion: number;
  margin_portion: number;
  target_amount: number;
}

export const ACTIVE_RUNNING_LOAN_STATUSES = ['berjalan', 'active', 'approved', 'disbursed'];
export const ACTIVE_RUNNING_LOAN_STATUSES_ENUM_SAFE = ['active', 'approved'];

export function isRunningLoanStatus(status?: string | null): boolean {
  return ACTIVE_RUNNING_LOAN_STATUSES.includes(String(status || '').trim().toLowerCase());
}

function isInvalidEnumStatusError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return code === '22P02' || msg.includes('invalid input value for enum');
}

async function runEnumSafeLoanStatusQuery<T>(
  runner: (statuses: string[]) => Promise<T>
): Promise<T> {
  const primaryRes = await runner(ACTIVE_RUNNING_LOAN_STATUSES);
  if ((primaryRes as any)?.error && isInvalidEnumStatusError((primaryRes as any).error)) {
    return await runner(ACTIVE_RUNNING_LOAN_STATUSES_ENUM_SAFE);
  }
  return primaryRes;
}

export function isGoodsMarkupLoanType(loanType?: Partial<LoanType> | null): boolean {
  if (!loanType) return false;
  if (loanType.financing_scheme === 'GOODS_MARKUP') return true;
  const code = String(loanType.code || '').trim().toUpperCase();
  return code === 'PEMBIAYAAN_BARANG' || code === 'GOODS_MARKUP';
}

export function isGoodsMarkupLoan(loan: any): boolean {
  if (!loan) return false;
  const lt = Array.isArray(loan.loan_types) ? loan.loan_types[0] : loan.loan_types;
  if (isGoodsMarkupLoanType(lt)) return true;
  if (Number(loan.markup_amount || 0) > 0) return true;
  if (typeof loan.item_description === 'string' && loan.item_description.trim().length > 0) {
    return true;
  }
  return false;
}

/**
 * Membagi Harga Beli/Modal Supplier (costPrice) dan Margin Keuntungan (markupAmount)
 * secara proporsional per bulan untuk jadwal angsuran pembiayaan barang, dengan periode
 * terakhir menyerap selisih pembulatan agar total pokok & total margin tetap presisi.
 */
export function calculateGoodsMarkupScheduleSplit(
  costPrice: number,
  markupAmount: number,
  tenor: number
): GoodsMarkupScheduleItem[] {
  const safeTenor = Math.max(1, Math.floor(Number(tenor) || 1));
  const totalCost = Math.max(0, Math.round(Number(costPrice) || 0));
  const totalMargin = Math.max(0, Math.round(Number(markupAmount) || 0));

  const items: GoodsMarkupScheduleItem[] = [];
  let accPrincipal = 0;
  let accMargin = 0;

  for (let period = 1; period <= safeTenor; period++) {
    let principalPortion: number;
    let marginPortion: number;

    if (period < safeTenor) {
      principalPortion = Math.round(totalCost / safeTenor);
      marginPortion = Math.round(totalMargin / safeTenor);
      accPrincipal += principalPortion;
      accMargin += marginPortion;
    } else {
      principalPortion = Math.max(0, totalCost - accPrincipal);
      marginPortion = Math.max(0, totalMargin - accMargin);
    }

    items.push({
      period_number: period,
      principal_portion: principalPortion,
      margin_portion: marginPortion,
      target_amount: principalPortion + marginPortion,
    });
  }

  return items;
}

/**
 * Menghitung pemisahan porsi pokok vs porsi margin keuntungan pada pembayaran angsuran.
 * Untuk pinjaman tunai 0% bunga, porsi margin selalu 0.
 */
export function calculateRepaymentPortions(params: {
  amountPaid: number;
  targetAmount: number;
  schedulePrincipalPortion?: number | null;
  scheduleMarginPortion?: number | null;
  loanCostPrice?: number | null;
  loanMarkupAmount?: number | null;
  loanTotalAmount?: number | null;
}): { principalPortion: number; marginPortion: number } {
  const paid = Math.max(0, Math.round(Number(params.amountPaid) || 0));
  if (paid <= 0) {
    return { principalPortion: 0, marginPortion: 0 };
  }

  const target = Math.max(0, Math.round(Number(params.targetAmount) || 0));
  const schedMargin = Math.max(0, Math.round(Number(params.scheduleMarginPortion || 0)));

  if (schedMargin > 0 && target > 0) {
    const isExactOrFull = paid >= target || Math.abs(target - paid) <= 5;
    const marginPortion = isExactOrFull
      ? Math.min(paid, schedMargin)
      : Math.min(paid, Math.round((paid * schedMargin) / target));
    return {
      principalPortion: Math.max(0, paid - marginPortion),
      marginPortion,
    };
  }

  const loanMarkup = Math.max(0, Math.round(Number(params.loanMarkupAmount || 0)));
  const loanTotal = Math.max(
    0,
    Math.round(Number(params.loanTotalAmount || 0)) ||
      Math.round(Number(params.loanCostPrice || 0)) + loanMarkup
  );

  if (loanMarkup > 0 && loanTotal > 0) {
    const marginPortion = Math.min(paid, Math.round((paid * loanMarkup) / loanTotal));
    return {
      principalPortion: Math.max(0, paid - marginPortion),
      marginPortion,
    };
  }

  return { principalPortion: paid, marginPortion: 0 };
}

function isMissingColumnError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('column') ||
    msg.includes('schema cache') ||
    msg.includes('financing_scheme') ||
    msg.includes('default_markup_percent') ||
    msg.includes('item_description') ||
    msg.includes('cost_price') ||
    msg.includes('markup_amount') ||
    msg.includes('principal_portion') ||
    msg.includes('margin_portion') ||
    msg.includes('description')
  );
}

function formatRupiahPlain(val: number): string {
  return Math.round(Number(val) || 0).toLocaleString('id-ID');
}

export const MIN_REMAINING_THP = 1500000;

export interface THPEligibilityResult {
  finalRemainingThp: number;
  isEligible: boolean;
  shortfall: number;
}

export const calculateTHPEligibility = (
  remainingThp: number,
  newInstallment: number,
  minThreshold: number = MIN_REMAINING_THP
): THPEligibilityResult => {
  const finalRemainingThp = Number(remainingThp || 0) - Number(newInstallment || 0);
  const isEligible = finalRemainingThp >= minThreshold;
  const shortfall = Math.max(0, minThreshold - finalRemainingThp);
  return {
    finalRemainingThp,
    isEligible,
    shortfall
  };
};

export const calculateRemainingInstallmentDeficit = (
  targetAmount: number,
  paidAmount: number
): number => {
  const target = Number(targetAmount || 0);
  const paid = Number(paidAmount || 0);
  return Math.max(0, Math.round(target - paid));
};

export async function getActiveLoanTypes(): Promise<LoanType[]> {
  const { data, error } = await supabase
    .from('loan_types')
    .select('id, code, name, max_duration_months, is_active, financing_scheme, default_markup_percent')
    .eq('is_active', true)
    .order('code', { ascending: true });
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase
      .from('loan_types')
      .select('id, code, name, max_duration_months, is_active')
      .eq('is_active', true)
      .order('code', { ascending: true });
    if (fallback.error) throw fallback.error;
    return (fallback.data || []) as LoanType[];
  }
  if (error) throw error;
  return (data || []) as LoanType[];
}

export type LoanApplicationStatusTab = 'PENDING' | 'APPROVED' | 'ALL';

export interface InitialLoansSyncResult {
  insertedCount: number;
  skippedCount: number;
  skippedNrps: string[];
  effectiveDate: string;
}

function formatDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildMonthlyDueDate(baseDateStr: string, periodNumber: number): string {
  const parts = baseDateStr.split('-').map((p) => parseInt(p, 10));
  const baseYear = parts[0];
  const baseMonth = parts[1] - 1;
  const baseDay = parts[2];

  const targetMonthOffset = baseMonth + periodNumber;
  const targetYear = baseYear + Math.floor(targetMonthOffset / 12);
  const targetMonth = ((targetMonthOffset % 12) + 12) % 12;
  const maxDayInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(baseDay, maxDayInMonth);

  return formatDateYmd(new Date(targetYear, targetMonth, clampedDay));
}

function shouldFallbackFromRepaymentRpc(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    code === '42804' ||
    msg.includes('Could not find the function') ||
    msg.includes('is of type loan_status') ||
    msg.includes('expression is of type text')
  );
}

/**
 * Menyimpan saldo awal pinjaman anggota berdasarkan NRP dan jenis pinjaman Master Produk
 * dengan Clean Overwrite, pembuatan jadwal angsuran penuh mulai (tgl_awal_pinjaman + 1 bulan)
 * hingga tenor beserta alokasi FIFO total_terangsur, ringkasan repayment historis, dan audit_logs.
 */
export async function syncInitialLoanBalances(
  rows: InitialLoanRow[],
  effectiveDate?: string
): Promise<InitialLoansSyncResult> {
  const rawEffective = typeof effectiveDate === 'string' ? effectiveDate.trim() : '';
  if (rawEffective) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawEffective)) {
      throw new Error('Tanggal aktif saldo awal pinjaman wajib diisi dengan format YYYY-MM-DD yang valid.');
    }
    const parsedEffectiveDate = new Date(`${rawEffective}T00:00:00`);
    if (isNaN(parsedEffectiveDate.getTime())) {
      throw new Error('Tanggal aktif saldo awal pinjaman wajib diisi dengan format YYYY-MM-DD yang valid.');
    }
  }
  const trimmedDate = rawEffective || formatDateYmd(new Date());

  if (!rows || rows.length === 0) {
    throw new Error('Tidak ada data baris saldo awal pinjaman untuk disimpan.');
  }

  // 1. Pemetaan NRP -> anggota.id & nama
  let memberRows: Array<{ id: string; nrp: string; nama?: string }> = [];
  const { data: queriedMembers, error: memberFetchErr } = await supabase
    .from('anggota')
    .select('id, nrp, nama');

  if (memberFetchErr) {
    throw new Error(`Gagal memuat data anggota: ${memberFetchErr.message}`);
  }
  memberRows = (queriedMembers || []) as Array<{ id: string; nrp: string; nama?: string }>;

  if (memberRows.length >= 1000) {
    try {
      const allPaged: Array<{ id: string; nrp: string; nama?: string }> = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const queryAny: any = supabase.from('anggota').select('id, nrp, nama');
        if (typeof queryAny?.range !== 'function') break;
        const { data: pageData, error: pageErr } = await queryAny.range(offset, offset + pageSize - 1);
        if (pageErr || !pageData || pageData.length === 0) break;
        allPaged.push(...pageData);
        if (pageData.length < pageSize) break;
        offset += pageSize;
      }
      if (allPaged.length > memberRows.length) {
        memberRows = allPaged;
      }
    } catch (e) {
      console.warn('Gagal memuat halaman tambahan anggota:', e);
    }
  }

  const memberMap = new Map<string, { id: string; nama?: string }>();
  for (const m of memberRows) {
    if (m.nrp) {
      memberMap.set(String(m.nrp).trim(), { id: m.id, nama: m.nama });
    }
  }

  // 1b. Validasi ketat NRP & Nama sebelum menulis saldo awal pinjaman ke database
  for (const row of rows) {
    if (Number(row.jumlah_pinjaman) <= 0) continue;

    const nrpKey = String(row.nrp || '').trim();
    const dbMember = memberMap.get(nrpKey);
    if (!dbMember) {
      throw new Error(
        `NRP ${nrpKey} (${row.nama || '-'}) belum terdaftar di sistem. Silakan isi/impor data anggotanya terlebih dahulu!`
      );
    }
    if (
      dbMember.nama &&
      String(dbMember.nama).trim() !== '' &&
      normalizeName(row.nama) !== normalizeName(dbMember.nama)
    ) {
      throw new Error(
        `Nama tidak cocok! Di Excel tertulis '${row.nama || '-'}', sedangkan di sistem untuk NRP ${nrpKey} terdaftar atas nama '${dbMember.nama}'.`
      );
    }
    if (row.isValid === false) {
      throw new Error(row.errorMessage || `Data saldo awal pinjaman untuk NRP ${nrpKey} tidak valid.`);
    }
  }

  // 2. Fallback pemetaan loan_types jika ada baris yang belum memiliki loan_type_id
  const loanTypeLookup = new Map<string, string>();
  const needsLoanTypeLookup = rows.some((r) => !r.loan_type_id && r.jenis_pinjaman);
  if (needsLoanTypeLookup) {
    const { data: lTypes, error: ltErr } = await supabase
      .from('loan_types')
      .select('id, code, name');
    if (!ltErr && Array.isArray(lTypes)) {
      for (const lt of lTypes as Array<{ id: string; code?: string; name?: string }>) {
        if (lt.code) loanTypeLookup.set(String(lt.code).trim().toLowerCase(), lt.id);
        if (lt.name) loanTypeLookup.set(String(lt.name).trim().toLowerCase(), lt.id);
      }
    }
  }

  let insertedCount = 0;
  let skippedCount = 0;
  const skippedNrps: string[] = [];

  for (const row of rows) {
    const nrpKey = String(row.nrp || '').trim();
    const memberId = memberMap.get(nrpKey)?.id;
    const resolvedLoanTypeId =
      row.loan_type_id ||
      (row.jenis_pinjaman
        ? loanTypeLookup.get(String(row.jenis_pinjaman).trim().toLowerCase()) || null
        : null);

    if (Number(row.jumlah_pinjaman) <= 0 || !memberId || !resolvedLoanTypeId) {
      skippedCount++;
      if (nrpKey) skippedNrps.push(nrpKey);
      continue;
    }

    const cleanTypeCode = String(row.jenis_pinjaman || row.loan_type_name || 'PINJ')
      .toUpperCase()
      .replace(/\s+/g, '');
    const loanNumber = `SALDO-AWAL-${nrpKey}-${cleanTypeCode}`;

    // Clean Overwrite: hapus saldo awal pinjaman lama untuk member & jenis pinjaman terkait
    const { data: existingLoans, error: existingLoansErr } = await supabase
      .from('loans')
      .select('id, loan_number, loan_type_id, notes')
      .eq('member_id', memberId);

    if (existingLoansErr) {
      throw new Error(`Gagal memeriksa pinjaman lama anggota ${nrpKey}: ${existingLoansErr.message}`);
    }

    const oldLoanIds = (existingLoans || [])
      .filter((l: any) => {
        const sameNumber = l.loan_number === loanNumber;
        const sameInitialType =
          l.loan_type_id === resolvedLoanTypeId &&
          String(l.notes || '').includes('Saldo Awal Pinjaman');
        return sameNumber || sameInitialType;
      })
      .map((l: any) => l.id)
      .filter(Boolean);

    if (oldLoanIds.length > 0) {
      const { error: delRepayErr } = await supabase
        .from('loan_repayments')
        .delete()
        .in('loan_id', oldLoanIds);
      if (delRepayErr) {
        throw new Error(`Gagal membersihkan riwayat angsuran lama anggota ${nrpKey}: ${delRepayErr.message}`);
      }

      const { error: delSchedErr } = await supabase
        .from('loan_schedules')
        .delete()
        .in('loan_id', oldLoanIds);
      if (delSchedErr) {
        throw new Error(`Gagal membersihkan jadwal angsuran lama anggota ${nrpKey}: ${delSchedErr.message}`);
      }

      const { error: delLoanErr } = await supabase
        .from('loans')
        .delete()
        .in('id', oldLoanIds);
      if (delLoanErr) {
        throw new Error(`Gagal membersihkan pinjaman saldo awal lama anggota ${nrpKey}: ${delLoanErr.message}`);
      }
    }

    const principalAmount = Number(row.jumlah_pinjaman);
    const tenor = Math.max(1, Math.floor(Number(row.tenor) || 1));
    const monthlyInstallment =
      Number(row.nilai_angsuran) > 0
        ? Math.round(Number(row.nilai_angsuran))
        : Math.round(principalAmount / tenor);
    const totalTerangsur = Math.max(0, Number(row.total_terangsur) || 0);
    const sisaPinjaman = Math.max(0, principalAmount - totalTerangsur);
    const loanStatus = sisaPinjaman <= 0 ? 'completed' : 'active';
    const disbursedDateStr =
      row.tgl_awal_pinjaman && /^\d{4}-\d{2}-\d{2}$/.test(row.tgl_awal_pinjaman.trim())
        ? row.tgl_awal_pinjaman.trim()
        : trimmedDate;

    const loanPayload = {
      loan_number: loanNumber,
      member_id: memberId,
      loan_type_id: resolvedLoanTypeId,
      principal_amount: principalAmount,
      amount: principalAmount,
      agreed_tenor_months: tenor,
      tenor: tenor,
      planned_installment_amount: monthlyInstallment,
      monthly_target: monthlyInstallment,
      disbursed_at: disbursedDateStr,
      sisa_pinjaman: sisaPinjaman,
      status: loanStatus,
      notes: 'Saldo Awal Pinjaman',
    };

    let { data: newLoan, error: insLoanErr } = await supabase
      .from('loans')
      .insert(loanPayload)
      .select('id')
      .single();

    if (insLoanErr && insLoanErr.message?.includes('sisa_pinjaman')) {
      const { sisa_pinjaman: _omitted, ...fallbackPayload } = loanPayload;
      const retryRes = await supabase
        .from('loans')
        .insert(fallbackPayload)
        .select('id')
        .single();
      newLoan = retryRes.data;
      insLoanErr = retryRes.error;
    }

    if (insLoanErr || !newLoan?.id) {
      throw new Error(
        `Gagal menyimpan saldo awal pinjaman anggota ${nrpKey}: ${insLoanErr?.message || 'ID pinjaman kosong'}`
      );
    }

    // Bangun jadwal angsuran penuh sebanyak tenor (mulai tgl_awal_pinjaman + 1 bulan)
    // dengan alokasi FIFO total_terangsur
    let remainingPaid = totalTerangsur;
    const schedulesToInsert = [];

    for (let period = 1; period <= tenor; period++) {
      const targetAmount = monthlyInstallment;
      let paidAmount = 0;
      let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';

      if (remainingPaid >= targetAmount) {
        status = 'paid';
        paidAmount = targetAmount;
        remainingPaid = Math.max(0, remainingPaid - targetAmount);
      } else if (remainingPaid > 0) {
        status = 'partial';
        paidAmount = remainingPaid;
        remainingPaid = 0;
      }

      schedulesToInsert.push({
        loan_id: newLoan.id,
        period_number: period,
        due_date: buildMonthlyDueDate(disbursedDateStr, period),
        target_amount: targetAmount,
        paid_amount: paidAmount,
        status,
      });
    }

    if (schedulesToInsert.length > 0) {
      const { error: insSchedErr } = await supabase
        .from('loan_schedules')
        .insert(schedulesToInsert);

      if (insSchedErr) {
        throw new Error(
          `Gagal menyimpan jadwal angsuran saldo awal anggota ${nrpKey}: ${insSchedErr.message}`
        );
      }
    }

    if (totalTerangsur > 0) {
      const { error: insRepayErr } = await supabase.from('loan_repayments').insert({
        loan_id: newLoan.id,
        schedule_id: null,
        payment_method: 'SALDO_AWAL',
        amount_paid: totalTerangsur,
        payment_date: new Date(`${trimmedDate}T00:00:00`).toISOString(),
        notes: `Total Terangsur Saldo Awal (${trimmedDate})`,
      });

      if (insRepayErr) {
        throw new Error(
          `Gagal menyimpan ringkasan angsuran saldo awal anggota ${nrpKey}: ${insRepayErr.message}`
        );
      }
    }

    insertedCount++;
  }

  // 3. Hapus pengaturan cut-off pinjaman lama (jika ada) agar pelacakan jadwal berjalan penuh & catat audit_logs
  try {
    const settingsTable: any = supabase.from('system_settings');
    if (typeof settingsTable?.delete === 'function') {
      await settingsTable.delete().eq('key', 'initial_loans_effective_date');
    }
  } catch (e) {
    console.warn('Gagal membersihkan initial_loans_effective_date dari system_settings:', e);
  }

  try {
    await supabase.from('audit_logs').insert({
      table_name: 'loans',
      action: 'UPLOAD_INITIAL_LOANS',
      record_id: trimmedDate,
      new_data: {
        effective_date: trimmedDate,
        inserted_count: insertedCount,
        skipped_count: skippedCount,
        skipped_nrps: skippedNrps,
      },
      notes: `Upload Saldo Awal Pinjaman dengan jadwal angsuran penuh (${insertedCount} pinjaman disimpan)`,
    });
  } catch (e) {
    console.warn('Gagal mencatat UPLOAD_INITIAL_LOANS ke audit_logs:', e);
  }

  return {
    insertedCount,
    skippedCount,
    skippedNrps,
    effectiveDate: trimmedDate,
  };
}

/**
 * Menghitung sisa kewajiban riil sebuah kontrak pinjaman langsung dari:
 * total_tagihan - SUM(paid_amount) di loan_schedules / loan_installments,
 * dengan fallback ke sisa_pinjaman jika jadwal angsuran belum tersedia.
 */
export function computeRealRemainingPrincipal(loan: any): number {
  const principal = Number(loan?.principal_amount ?? loan?.amount ?? 0);
  const schedules = Array.isArray(loan?.loan_schedules) ? loan.loan_schedules : [];

  if (schedules.length > 0) {
    const totalTarget = schedules.reduce(
      (sum: number, s: any) => sum + Number(s?.target_amount || 0),
      0
    );
    const totalObligation = Math.max(principal, totalTarget);
    const totalPaidFromSchedules = schedules.reduce(
      (sum: number, s: any) => sum + Number(s?.paid_amount || 0),
      0
    );
    return Math.max(0, Math.round(totalObligation - totalPaidFromSchedules));
  }

  const installments = Array.isArray(loan?.loan_installments) ? loan.loan_installments : [];
  if (installments.length > 0) {
    const totalInstTarget = installments.reduce(
      (sum: number, i: any) => sum + Number(i?.target_amount ?? i?.amount ?? 0),
      0
    );
    const totalObligation = Math.max(principal, totalInstTarget);
    const totalPaidFromInstallments = installments.reduce(
      (sum: number, i: any) =>
        sum +
        Number(
          i?.paid_amount ??
            i?.amount_paid ??
            (String(i?.status || '').toLowerCase() === 'paid'
              ? (i?.target_amount ?? i?.amount ?? 0)
              : 0)
        ),
      0
    );
    return Math.max(0, Math.round(totalObligation - totalPaidFromInstallments));
  }

  return Math.max(0, Math.round(Number(loan?.sisa_pinjaman ?? principal)));
}

/**
 * Menyelaraskan nilai topup_settlement_amount pada pengajuan yang masih pending
 * agar selalu mencerminkan sisa kewajiban riil dari loan_schedules kontrak lama,
 * bukan kolom sisa_pinjaman yang mungkin belum sinkron.
 */
async function enrichPendingTopupSettlements(applications: any[]): Promise<any[]> {
  if (!Array.isArray(applications) || applications.length === 0) {
    return applications;
  }

  const pendingApps = applications.filter((app) => {
    const isPending = !app?.status || app.status === 'draft' || app.status === 'pending';
    return isPending && (app.refinanced_loan_id || Number(app.topup_settlement_amount || 0) > 0 || (app.member_id && app.loan_type_id));
  });

  if (pendingApps.length === 0) {
    return applications;
  }

  try {
    const memberIds = Array.from(
      new Set(pendingApps.map((a) => a.member_id).filter(Boolean).map(String))
    );
    const refinancedIds = Array.from(
      new Set(pendingApps.map((a) => a.refinanced_loan_id).filter(Boolean).map(String))
    );

    const activeLoansById = new Map<string, any>();

    if (memberIds.length > 0) {
      const activeRes: any = await runEnumSafeLoanStatusQuery(async (statuses) =>
        await supabase
          .from('loans')
          .select('id, loan_number, member_id, loan_type_id, principal_amount, amount, sisa_pinjaman, status, loan_schedules ( id, target_amount, paid_amount, status )')
          .in('member_id', memberIds)
          .in('status', statuses)
      );

      for (const row of activeRes?.data || []) {
        if (row?.id) {
          activeLoansById.set(String(row.id), row);
        }
      }
    }

    const missingRefIds = refinancedIds.filter((id) => !activeLoansById.has(id));
    if (missingRefIds.length > 0) {
      const refRes: any = await supabase
        .from('loans')
        .select('id, loan_number, member_id, loan_type_id, principal_amount, amount, sisa_pinjaman, status, loan_schedules ( id, target_amount, paid_amount, status )')
        .in('id', missingRefIds);

      for (const row of refRes?.data || []) {
        const statusLower = String(row?.status || '').trim().toLowerCase();
        if (row?.id && !['paid_off', 'completed', 'lunas', 'paid', 'rejected'].includes(statusLower)) {
          activeLoansById.set(String(row.id), row);
        }
      }
    }

    if (activeLoansById.size === 0) {
      return applications;
    }

    return applications.map((app) => {
      const isPending = !app?.status || app.status === 'draft' || app.status === 'pending';
      if (!isPending) return app;

      const matchedOldLoans = new Map<string, any>();

      if (app.member_id && app.loan_type_id) {
        for (const oldLoan of activeLoansById.values()) {
          if (
            String(oldLoan.id) !== String(app.id) &&
            String(oldLoan.member_id) === String(app.member_id) &&
            String(oldLoan.loan_type_id) === String(app.loan_type_id) &&
            (!oldLoan.status || isRunningLoanStatus(oldLoan.status)) &&
            computeRealRemainingPrincipal(oldLoan) > 0
          ) {
            matchedOldLoans.set(String(oldLoan.id), oldLoan);
          }
        }
      }

      if (app.refinanced_loan_id) {
        const refLoan = activeLoansById.get(String(app.refinanced_loan_id));
        const refStatusLower = String(refLoan?.status || '').trim().toLowerCase();
        if (
          refLoan &&
          !['paid_off', 'completed', 'lunas', 'paid', 'rejected'].includes(refStatusLower) &&
          !matchedOldLoans.has(String(refLoan.id)) &&
          computeRealRemainingPrincipal(refLoan) > 0
        ) {
          matchedOldLoans.set(String(refLoan.id), refLoan);
        }
      }

      if (matchedOldLoans.size === 0) {
        return app;
      }

      const realSettlement = Array.from(matchedOldLoans.values()).reduce(
        (sum, oldLoan) => sum + computeRealRemainingPrincipal(oldLoan),
        0
      );
      const oldLoanNumbers = Array.from(matchedOldLoans.values())
        .map((l) => l.loan_number)
        .filter((num): num is string => Boolean(num && String(num).trim()));

      return {
        ...app,
        topup_settlement_amount: realSettlement,
        ...(oldLoanNumbers.length > 0 ? { topup_old_loan_numbers: oldLoanNumbers } : {}),
      };
    });
  } catch (err) {
    console.warn('Gagal menghitung ulang sisa pokok top-up pending:', err);
    return applications;
  }
}

export const loanService = {
  getActiveLoanTypes,
  syncInitialLoanBalances,
  async getLoanApplications(statusTab: LoanApplicationStatusTab = 'PENDING') {
    const buildQuery = (withGoodsColumns: boolean) => {
      const selectFields = withGoodsColumns
        ? `
        id,
        loan_number,
        member_id,
        loan_type_id,
        refinanced_loan_id,
        topup_settlement_amount,
        amount,
        principal_amount,
        item_description,
        cost_price,
        markup_amount,
        agreed_tenor_months,
        tenor,
        planned_installment_amount,
        monthly_target,
        disbursed_at,
        created_at,
        status,
        notes,
        loan_types:loan_type_id (
          id,
          code,
          name,
          financing_scheme,
          default_markup_percent
        ),
        anggota:member_id (
          id,
          nrp,
          nama,
          tanggal_lahir,
          take_home_pay,
          master_thp,
          bank_account_number
        )
      `
        : `
        id,
        loan_number,
        member_id,
        loan_type_id,
        refinanced_loan_id,
        topup_settlement_amount,
        amount,
        principal_amount,
        agreed_tenor_months,
        tenor,
        planned_installment_amount,
        monthly_target,
        disbursed_at,
        created_at,
        status,
        notes,
        loan_types:loan_type_id (
          id,
          code,
          name
        ),
        anggota:member_id (
          id,
          nrp,
          nama,
          tanggal_lahir,
          take_home_pay,
          master_thp,
          bank_account_number
        )
      `;

      let query: any = (supabase.from('loans') as any)
        .select(selectFields)
        .order('created_at', { ascending: false });

      if (statusTab === 'PENDING') {
        // Di skema database, permohonan baru yang menunggu persetujuan berstatus 'draft'
        query = query.eq('status', 'draft');
      } else if (statusTab === 'APPROVED') {
        query = query.in('status', ['approved', 'active', 'paid_off']);
      }
      // Jika 'ALL', tidak ada filter status (mengambil semua riwayat)
      return query;
    };

    let { data, error } = await buildQuery(true);
    if (error && isMissingColumnError(error)) {
      const fallbackRes = await buildQuery(false);
      data = fallbackRes.data;
      error = fallbackRes.error;
    }
    if (error) throw new Error(error.message);
    return enrichPendingTopupSettlements(data || []);
  },

  async getPendingLoans() {
    return this.getLoanApplications('PENDING');
  },

  async getAllLoans() {
    const { data, error } = await supabase
      .from('loans')
      .select('*, anggota(nama, nrp)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async getLoanById(id: string) {
    let { data, error } = await supabase
      .from('loans')
      .select('*, anggota(nama, nrp), loan_types(id, code, name, financing_scheme, default_markup_percent)')
      .eq('id', id)
      .single();
    if (error && isMissingColumnError(error)) {
      const fallback = await supabase
        .from('loans')
        .select('*, anggota(nama, nrp)')
        .eq('id', id)
        .single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw new Error(error.message);
    return data;
  },

  async getLoanSchedules(loanId: string) {
    const { data, error } = await supabase
      .from('loan_schedules')
      .select('*')
      .eq('loan_id', loanId)
      .order('period_number', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  async getMemberTHP(memberId: string): Promise<{
    master_thp: number;
    active_installments: number;
    angsuran_lain_lain: number;
    savings_deduction: number;
    remaining_thp: number;
  }> {
    // 1. Get member master_thp with fallback
    let memberData: any = null;
    const { data: member, error: memberError } = await supabase
      .from('anggota')
      .select('id, nrp, nama, tanggal_lahir, take_home_pay, master_thp, salary, angsuran_lain_lain, bank_account_number')
      .eq('id', memberId)
      .single();

    if (memberError) {
      const { data: fallbackMember, error: fbError } = await supabase
        .from('anggota')
        .select('*')
        .eq('id', memberId)
        .single();
      if (fbError) throw new Error(fbError.message);
      memberData = fallbackMember;
    } else {
      memberData = member;
    }

    // Resolusi THP: utamakan nominal positif dari take_home_pay, master_thp, atau salary
    const cleanNumber = (val: any): number => {
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      if (!val) return 0;
      let str = String(val).trim().replace(/[,.]00$/, '');
      return Number(str.replace(/[^0-9]/g, '')) || 0;
    };

    const candidates = [
      memberData?.master_thp,
      memberData?.take_home_pay,
      memberData?.gaji_pokok,
      memberData?.base_salary,
      memberData?.salary,
    ];
    let resolvedThp = 0;
    for (const c of candidates) {
      if (c !== undefined && c !== null && c !== '') {
        const num = cleanNumber(c);
        if (num > 0) {
          resolvedThp = num;
          break;
        }
      }
    }

    const rawThp = resolvedThp > 0
      ? resolvedThp
      : (memberData?.take_home_pay ?? memberData?.master_thp ?? memberData?.salary ?? 0);
    const masterThp = cleanNumber(rawThp);

    // 2. Get active/running loans
    const loansRes: any = await runEnumSafeLoanStatusQuery(async (statuses) =>
      await supabase
        .from('loans')
        .select('monthly_target, planned_installment_amount, status')
        .eq('member_id', memberId)
        .in('status', statuses)
    );
    const { data: activeLoans, error: loansError } = loansRes || {};

    if (loansError) throw new Error(loansError.message);

    const activeInstallments = (activeLoans || []).reduce(
      (sum: number, loan: any) =>
        sum + Number(loan.monthly_target ?? loan.planned_installment_amount ?? 0),
      0
    );

    // 3. Get active savings rate tiers & member deposit commitments
    let savingsDeduction = 0;
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const { data: memberDeposits, error: depError } = await supabase
        .from('member_deposits')
        .select('id, deposit_type_id, is_terminated, deposit_types(code, name, default_amount)')
        .eq('member_id', memberId)
        .eq('is_terminated', false);

      const [activeRates, rateConfig] = await Promise.all([
        getActiveSavingsRateTiers(currentYear, currentMonth).catch(() => ({} as Record<string, number>)),
        loadSavingsRateConfig(false).catch(() => null),
      ]);
      const defaultWajibRate = activeRates['WAJIB'] || 200000;

      if (!depError && memberDeposits && memberDeposits.length > 0) {
        let total = 0;
        let hasWajib = false;
        let hasLebaran = false;
        for (const dep of memberDeposits) {
          const dtObj = Array.isArray(dep.deposit_types)
            ? dep.deposit_types[0]
            : (dep.deposit_types as any);
          const rawCode = dtObj?.code;
          const code = (rawCode || '').toUpperCase();
          const canonicalCode = normalizeDepositTypeCode(rawCode || dtObj?.name);
          if (code === 'POKOK' || code === 'SP' || canonicalCode === 'POKOK') {
            continue;
          }
          if (code === 'WAJIB' || code === 'SW' || canonicalCode === 'WAJIB') {
            hasWajib = true;
          }
          if (canonicalCode === 'LEBARAN') {
            hasLebaran = true;
            const resolvedLebaran = resolveMemberSavingsRate(memberId, 'LEBARAN', currentYear, currentMonth, {
              globalTiers: rateConfig?.tiers,
              depositTypes: rateConfig?.depositTypes?.length
                ? rateConfig.depositTypes
                : [{ code: 'LEBARAN', default_amount: dtObj?.default_amount || 0 }],
              memberLebaranRates: rateConfig?.memberLebaranRates,
            });
            const rate =
              resolvedLebaran > 0
                ? resolvedLebaran
                : activeRates[code] || activeRates['LEBARAN'] || Number(dtObj?.default_amount || 0);
            total += rate;
            continue;
          }
          const rate =
            activeRates[code] ||
            Number(dtObj?.default_amount || 0) ||
            (code === 'WAJIB' || code === 'SW' ? defaultWajibRate : 0);
          total += rate;
        }
        if (!hasWajib && defaultWajibRate > 0) {
          total += defaultWajibRate;
        }
        if (!hasLebaran) {
          const fallbackLebaran = resolveMemberSavingsRate(memberId, 'LEBARAN', currentYear, currentMonth, {
            globalTiers: rateConfig?.tiers,
            depositTypes: rateConfig?.depositTypes,
            memberLebaranRates: rateConfig?.memberLebaranRates,
          });
          if (fallbackLebaran > 0) {
            total += fallbackLebaran;
          }
        }
        savingsDeduction = total;
      } else {
        const fallbackLebaran = resolveMemberSavingsRate(memberId, 'LEBARAN', currentYear, currentMonth, {
          globalTiers: rateConfig?.tiers,
          depositTypes: rateConfig?.depositTypes,
          memberLebaranRates: rateConfig?.memberLebaranRates,
        });
        savingsDeduction = defaultWajibRate + (activeRates['BELANJA'] || 0) + fallbackLebaran;
      }
    } catch (err) {
      console.warn('Gagal memuat potongan simpanan aktif, fallback default:', err);
      savingsDeduction = 200000;
    }

    const angsuranLainLain = cleanNumber(memberData?.angsuran_lain_lain);
    const remainingThp = masterThp - activeInstallments - angsuranLainLain - savingsDeduction;

    return {
      master_thp: masterThp,
      active_installments: activeInstallments,
      angsuran_lain_lain: angsuranLainLain,
      savings_deduction: savingsDeduction,
      remaining_thp: remainingThp
    };
  },

  async applyLoan(
    memberId: string,
    purpose: string,
    amount: number,
    tenor: number,
    loanTypeId?: string,
    minThreshold: number = MIN_REMAINING_THP,
    topUpOptions?: {
      refinancedLoanId?: string | null;
      topupSettlementAmount?: number;
      replacedMonthlyInstallment?: number;
    },
    goodsOptions?: {
      financingScheme?: FinancingScheme;
      itemDescription?: string;
      costPrice?: number;
      markupAmount?: number;
    }
  ) {
    const isGoodsMarkup = goodsOptions?.financingScheme === 'GOODS_MARKUP';
    let effectiveAmount = Number(amount || 0);
    let costPrice = effectiveAmount;
    let markupAmount = 0;
    let itemDescription: string | undefined;

    if (isGoodsMarkup) {
      itemDescription = String(goodsOptions?.itemDescription || '').trim();
      if (!itemDescription) {
        throw new Error('Nama / spesifikasi barang wajib diisi untuk skema pembiayaan barang.');
      }
      costPrice = Math.round(Number(goodsOptions?.costPrice || 0));
      if (costPrice <= 0) {
        throw new Error('Harga beli / modal supplier harus lebih besar dari Rp 0.');
      }
      markupAmount = Math.round(Number(goodsOptions?.markupAmount ?? 0));
      if (markupAmount < 0) {
        throw new Error('Margin keuntungan koperasi tidak boleh bernilai negatif.');
      }
      effectiveAmount = costPrice + markupAmount;
    } else {
      // Pinjaman tunai selalu 0% bunga & 0 markup
      markupAmount = 0;
      costPrice = effectiveAmount;
    }

    const monthlyTarget = isGoodsMarkup
      ? Math.round(effectiveAmount / tenor)
      : effectiveAmount / tenor;
    const settlementAmount = Math.max(0, Number(topUpOptions?.topupSettlementAmount || 0));
    const replacedInstallment = Math.max(0, Number(topUpOptions?.replacedMonthlyInstallment || 0));
    const grossDisbursementBase = isGoodsMarkup ? costPrice : effectiveAmount;

    if (settlementAmount > 0 && grossDisbursementBase <= settlementAmount) {
      const baseLabel = isGoodsMarkup
        ? 'Harga modal / nilai pencairan baru'
        : 'Plafon pinjaman baru';
      throw new Error(
        `${baseLabel} (Rp ${grossDisbursementBase.toLocaleString('id-ID')}) harus lebih besar dari sisa pinjaman lama yang dilunasi (Rp ${settlementAmount.toLocaleString('id-ID')}).`
      );
    }

    const { remaining_thp } = await this.getMemberTHP(memberId);
    const effectiveRemainingThp = remaining_thp + replacedInstallment;
    const eligibility = calculateTHPEligibility(effectiveRemainingThp, monthlyTarget, minThreshold);
    if (!eligibility.isEligible) {
      throw new Error(
        `Pengajuan ditolak: Sisa THP setelah pemotongan (Rp ${eligibility.finalRemainingThp.toLocaleString('id-ID')}) kurang Rp ${eligibility.shortfall.toLocaleString('id-ID')} dari batas minimal Rp ${minThreshold.toLocaleString('id-ID')}.`
      );
    }

    let targetLoanTypeId = loanTypeId;
    if (!targetLoanTypeId) {
      // Fetch a default loan type to satisfy the NOT NULL constraint on loan_type_id
      const { data: loanTypes } = await supabase.from('loan_types').select('id').eq('is_active', true).limit(1);
      if (!loanTypes || loanTypes.length === 0) {
        throw new Error('Tidak ada Tipe Pinjaman (Loan Type) yang aktif di sistem.');
      }
      targetLoanTypeId = loanTypes[0].id;
    }

    const effectiveNotes = isGoodsMarkup
      ? (purpose && purpose.trim() ? purpose.trim() : `Pembiayaan Barang: ${itemDescription}`)
      : purpose;

    let loanNumber = await generateNextCompactRegister(supabase, {
      table: 'loans',
      column: 'loan_number',
      prefix: 'LN',
    });

    const baseInsertPayload: Record<string, any> = {
      member_id: memberId,
      loan_type_id: targetLoanTypeId,
      principal_amount: effectiveAmount,
      agreed_tenor_months: tenor,
      planned_installment_amount: monthlyTarget,
      amount: effectiveAmount,
      tenor: tenor,
      monthly_target: monthlyTarget,
      notes: effectiveNotes,
      status: 'draft'
    };

    if (isGoodsMarkup) {
      baseInsertPayload.item_description = itemDescription;
      baseInsertPayload.cost_price = costPrice;
      baseInsertPayload.markup_amount = markupAmount;
    } else if (goodsOptions) {
      baseInsertPayload.cost_price = costPrice;
      baseInsertPayload.markup_amount = 0;
    }

    if (topUpOptions?.refinancedLoanId) {
      baseInsertPayload.refinanced_loan_id = topUpOptions.refinancedLoanId;
    }
    if (settlementAmount > 0) {
      baseInsertPayload.topup_settlement_amount = settlementAmount;
    }

    let data: any = null;
    let error: any = null;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const insertPayload: Record<string, any> = {
        loan_number: loanNumber,
        ...baseInsertPayload,
      };

      const res = await supabase
        .from('loans')
        .insert([insertPayload])
        .select()
        .single();
      data = res.data;
      error = res.error;

      if (error && isMissingColumnError(error)) {
        const {
          item_description: _id,
          cost_price: _cp,
          markup_amount: _ma,
          ...legacyPayload
        } = insertPayload;
        const fallbackRes = await supabase
          .from('loans')
          .insert([legacyPayload])
          .select()
          .single();
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (!error) {
        break;
      }

      if (isUniqueConstraintError(error) && attempt < maxAttempts) {
        loanNumber = incrementCompactRegister(loanNumber, 1);
        continue;
      }

      break;
    }

    if (error) throw new Error(error.message);
    return data as Loan;
  },

  async createLoanApplication(params: {
    memberId: string;
    purpose: string;
    amount: number;
    tenor: number;
    loanTypeId?: string;
    minThreshold?: number;
    topUpOptions?: {
      refinancedLoanId?: string | null;
      topupSettlementAmount?: number;
      replacedMonthlyInstallment?: number;
    };
    financingScheme?: FinancingScheme;
    itemDescription?: string;
    costPrice?: number;
    markupAmount?: number;
  }) {
    return this.applyLoan(
      params.memberId,
      params.purpose,
      params.amount,
      params.tenor,
      params.loanTypeId,
      params.minThreshold ?? MIN_REMAINING_THP,
      params.topUpOptions,
      params.financingScheme
        ? {
            financingScheme: params.financingScheme,
            itemDescription: params.itemDescription,
            costPrice: params.costPrice,
            markupAmount: params.markupAmount,
          }
        : undefined
    );
  },

  async approveLoan(loanId: string, disbursedDate?: string): Promise<Loan> {
    const todayDate =
      disbursedDate && /^\d{4}-\d{2}-\d{2}$/.test(disbursedDate.trim())
        ? disbursedDate.trim()
        : formatDateYmd(new Date());

    // 1. Ambil data pinjaman saat ini untuk membaca pokok pinjaman dan parameter tenor
    let existingLoan: any = null;
    try {
      const loansFetchTable: any = supabase.from('loans');
      if (loansFetchTable && typeof loansFetchTable.select === 'function') {
        const runLoanFetch = async (withGoodsCols: boolean) => {
          const cols = withGoodsCols
            ? 'id, loan_number, member_id, loan_type_id, refinanced_loan_id, topup_settlement_amount, principal_amount, amount, item_description, cost_price, markup_amount, notes, tenor, agreed_tenor_months, monthly_target, planned_installment_amount, status, loan_types:loan_type_id ( id, code, name, financing_scheme ), anggota:member_id ( nrp, nama )'
            : 'id, loan_number, member_id, loan_type_id, refinanced_loan_id, topup_settlement_amount, principal_amount, amount, tenor, agreed_tenor_months, monthly_target, planned_installment_amount, status';
          const fetchQuery = loansFetchTable.select(cols).eq('id', loanId);
          return typeof fetchQuery?.maybeSingle === 'function'
            ? await fetchQuery.maybeSingle()
            : typeof fetchQuery?.single === 'function'
              ? await fetchQuery.single()
              : await fetchQuery;
        };

        let fetchRes = await runLoanFetch(true);
        if (fetchRes?.error && isMissingColumnError(fetchRes.error)) {
          fetchRes = await runLoanFetch(false);
        }
        if (fetchRes?.data) {
          existingLoan = Array.isArray(fetchRes.data) ? fetchRes.data[0] : fetchRes.data;
        }
      }
    } catch {
      // Fallback jika environment mock tidak menyediakan select pada loans
    }

    const principalAmount = Number(existingLoan?.principal_amount) || Number(existingLoan?.amount) || 0;

    // 2. Perbarui status pinjaman ke 'active' dan isi disbursed_at sesuai skema public.loans
    const { data: updatedLoan, error: updateError } = await supabase
      .from('loans')
      .update({
        status: 'active',
        disbursed_at: todayDate,
        sisa_pinjaman: principalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', loanId)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    const loanRecord: any = updatedLoan || existingLoan || { id: loanId };
    const targetLoanId = loanRecord.id || loanId;
    const finalPrincipal =
      Number(loanRecord.principal_amount) || Number(loanRecord.amount) || principalAmount || 0;
    const tenor = Math.max(
      1,
      Math.floor(Number(loanRecord.tenor) || Number(loanRecord.agreed_tenor_months) || 1)
    );
    const rawMonthlyTarget =
      Number(loanRecord.monthly_target) || Number(loanRecord.planned_installment_amount) || 0;
    const monthlyInstallment =
      rawMonthlyTarget > 0
        ? Math.round(rawMonthlyTarget)
        : Math.round(finalPrincipal / tenor);

    const isGoodsMarkup = isGoodsMarkupLoan(loanRecord) || isGoodsMarkupLoan(existingLoan);
    const markupAmount = isGoodsMarkup
      ? Math.max(0, Math.round(Number(loanRecord.markup_amount ?? existingLoan?.markup_amount ?? 0)))
      : 0;
    const costPrice = isGoodsMarkup
      ? Math.max(
          0,
          Math.round(
            Number(
              loanRecord.cost_price ??
                existingLoan?.cost_price ??
                Math.max(0, finalPrincipal - markupAmount)
            )
          )
        )
      : finalPrincipal;

    // 3. Periksa apakah jadwal angsuran di loan_schedules sudah tersedia
    let hasExistingSchedules = false;
    try {
      const schedCheckTable: any = supabase.from('loan_schedules');
      if (schedCheckTable && typeof schedCheckTable.select === 'function') {
        const schedQuery = schedCheckTable
          .select('id')
          .eq('loan_id', targetLoanId);
        const schedRes = typeof schedQuery?.limit === 'function'
          ? await schedQuery.limit(1)
          : await schedQuery;
        if (Array.isArray(schedRes?.data) && schedRes.data.length > 0) {
          hasExistingSchedules = true;
        }
      }
    } catch {
      // Fallback jika mock tidak menyediakan select pada loan_schedules
    }

    // 4. Bangkitkan jadwal angsuran 1..tenor mulai bulan berikutnya setelah disbursed_at
    if (!hasExistingSchedules) {
      let schedules: any[] = [];
      if (isGoodsMarkup) {
        const splitItems = calculateGoodsMarkupScheduleSplit(costPrice, markupAmount, tenor);
        schedules = splitItems.map((item) => ({
          loan_id: targetLoanId,
          period_number: item.period_number,
          due_date: buildMonthlyDueDate(todayDate, item.period_number),
          target_amount: item.target_amount,
          principal_portion: item.principal_portion,
          margin_portion: item.margin_portion,
          paid_amount: 0,
          status: 'unpaid',
        }));
      } else {
        for (let period = 1; period <= tenor; period++) {
          schedules.push({
            loan_id: targetLoanId,
            period_number: period,
            due_date: buildMonthlyDueDate(todayDate, period),
            target_amount: monthlyInstallment,
            paid_amount: 0,
            status: 'unpaid',
          });
        }
      }

      if (schedules.length > 0) {
        let { error: scheduleError } = await supabase
          .from('loan_schedules')
          .insert(schedules);

        if (scheduleError && isMissingColumnError(scheduleError) && isGoodsMarkup) {
          const legacySchedules = schedules.map(({ principal_portion: _pp, margin_portion: _mp, ...rest }) => rest);
          const retrySched = await supabase
            .from('loan_schedules')
            .insert(legacySchedules);
          scheduleError = retrySched.error;
        }

        if (scheduleError) throw new Error(scheduleError.message);
      }
    }

    // 4b. Pelunasan otomatis penuh kontrak pinjaman lama sejenis (termasuk status 'berjalan' & skema pembiayaan)
    let totalSettlementAmt = 0;
    const settledOldLoanNumbers: string[] = [];
    const settledOldLoanIds: string[] = [];
    const memberIdForTopup = loanRecord.member_id || existingLoan?.member_id;
    const loanTypeIdForTopup = loanRecord.loan_type_id || existingLoan?.loan_type_id;
    const refinancedLoanId = loanRecord.refinanced_loan_id || existingLoan?.refinanced_loan_id || null;

    if (memberIdForTopup && (loanTypeIdForTopup || refinancedLoanId)) {
      try {
        const oldLoansMap = new Map<string, any>();

        if (loanTypeIdForTopup) {
          const sameTypeRes: any = await runEnumSafeLoanStatusQuery(async (statuses) =>
            await supabase
              .from('loans')
              .select('id, loan_number, principal_amount, amount, sisa_pinjaman, status, notes, loan_schedules ( id, target_amount, paid_amount, status )')
              .eq('member_id', memberIdForTopup)
              .eq('loan_type_id', loanTypeIdForTopup)
              .in('status', statuses)
              .neq('id', targetLoanId)
          );

          for (const row of sameTypeRes?.data || []) {
            if (
              row?.id &&
              String(row.id) !== String(targetLoanId) &&
              (!row.status || isRunningLoanStatus(row.status)) &&
              computeRealRemainingPrincipal(row) > 0
            ) {
              oldLoansMap.set(String(row.id), row);
            }
          }
        }

        if (refinancedLoanId && !oldLoansMap.has(String(refinancedLoanId))) {
          const refRes: any = await supabase
            .from('loans')
            .select('id, loan_number, principal_amount, amount, sisa_pinjaman, status, notes, loan_schedules ( id, target_amount, paid_amount, status )')
            .eq('id', refinancedLoanId)
            .maybeSingle();
          const refRow = refRes?.data;
          const refStatusLower = String(refRow?.status || '').trim().toLowerCase();
          if (
            refRow?.id &&
            !['paid_off', 'completed', 'lunas', 'paid', 'rejected'].includes(refStatusLower) &&
            computeRealRemainingPrincipal(refRow) > 0
          ) {
            oldLoansMap.set(String(refRow.id), refRow);
          }
        }

        const newLoanNumber = String(
          loanRecord.loan_number || existingLoan?.loan_number || targetLoanId
        );
        const usedTopupReceipts: string[] = [];

        for (const oldLoan of oldLoansMap.values()) {
          const settlementAmt = computeRealRemainingPrincipal(oldLoan);
          totalSettlementAmt += settlementAmt;
          settledOldLoanIds.push(String(oldLoan.id));
          settledOldLoanNumbers.push(String(oldLoan.loan_number || oldLoan.id));

          const oldSchedQuery: any = supabase
            .from('loan_schedules')
            .select('id, period_number, target_amount, paid_amount, status')
            .eq('loan_id', oldLoan.id);
          const oldSchedRes =
            typeof oldSchedQuery?.then === 'function'
              ? await oldSchedQuery
              : typeof oldSchedQuery?.neq === 'function'
                ? await oldSchedQuery.neq('status', 'paid')
                : { data: [] };

          const schedulesToSettle = (oldSchedRes?.data || []).filter(
            (sch: any) =>
              String(sch?.status || '').trim().toLowerCase() !== 'paid' ||
              Number(sch?.paid_amount || 0) < Number(sch?.target_amount || 0)
          );

          for (const sch of schedulesToSettle) {
            await supabase
              .from('loan_schedules')
              .update({
                paid_amount: Number(sch.target_amount || 0),
                status: 'paid',
              })
              .eq('id', sch.id);
          }

          // Sinkronkan tabel loan_installments secara non-blocking jika digunakan
          try {
            const instTable: any = supabase.from('loan_installments');
            if (instTable && typeof instTable.select === 'function') {
              const instRes: any = await instTable
                .select('id, target_amount, amount, paid_amount, status')
                .eq('loan_id', oldLoan.id);
              for (const inst of instRes?.data || []) {
                const instStatus = String(inst?.status || '').trim().toLowerCase();
                const instTarget = Number(inst?.target_amount ?? inst?.amount ?? 0);
                const instPaid = Number(inst?.paid_amount ?? inst?.amount_paid ?? 0);
                if (instStatus !== 'paid' || (instTarget > 0 && instPaid < instTarget)) {
                  const instUpdatePayload: Record<string, any> = { status: 'paid' };
                  if (inst?.paid_amount !== undefined && instTarget > 0) {
                    instUpdatePayload.paid_amount = instTarget;
                  }
                  await instTable.update(instUpdatePayload).eq('id', inst.id);
                }
              }
            }
          } catch {
            // Non-blocking jika tabel loan_installments tidak digunakan atau tidak tersedia
          }

          if (settlementAmt > 0) {
            const topupReceiptNo = await generateNextCompactRegister(supabase, {
              table: 'loan_repayments',
              column: 'receipt_number',
              prefix: 'KW',
              extraCodes: usedTopupReceipts,
            });
            usedTopupReceipts.push(topupReceiptNo);

            await supabase.from('loan_repayments').insert({
              loan_id: oldLoan.id,
              schedule_id: null,
              amount_paid: settlementAmt,
              payment_method: 'TOPUP_COMPENSATION',
              payment_date: new Date().toISOString(),
              receipt_number: topupReceiptNo,
              notes: `Pelunasan otomatis s/d angsuran terakhir melalui pinjaman baru ${newLoanNumber}`,
            });
          }

          const oldCompNote = `[LUNAS KOMPENSASI] Dilunasi penuh s/d angsuran terakhir sebesar Rp ${formatRupiahPlain(settlementAmt)} dari pencairan pinjaman baru ${newLoanNumber}`;
          const existingOldNotes = String(oldLoan.notes || '').trim();
          const updatedOldNotes = existingOldNotes.includes('[LUNAS KOMPENSASI]')
            ? existingOldNotes
            : existingOldNotes
              ? `${existingOldNotes} | ${oldCompNote}`
              : oldCompNote;

          const oldLoanUpdateRes: any = await supabase
            .from('loans')
            .update({
              status: 'paid_off',
              sisa_pinjaman: 0,
              notes: updatedOldNotes,
              updated_at: new Date().toISOString(),
            })
            .eq('id', oldLoan.id);

          if (oldLoanUpdateRes?.error) {
            const fallbackOldUpdate: Record<string, any> = {
              status: isInvalidEnumStatusError(oldLoanUpdateRes.error) ? 'completed' : 'paid_off',
              updated_at: new Date().toISOString(),
            };
            if (!isMissingColumnError(oldLoanUpdateRes.error)) {
              fallbackOldUpdate.sisa_pinjaman = 0;
              fallbackOldUpdate.notes = updatedOldNotes;
            }
            await supabase.from('loans').update(fallbackOldUpdate).eq('id', oldLoan.id);
          }
        }

        // Perbarui topup_settlement_amount & catatan kompensasi pada kontrak baru
        if (oldLoansMap.size > 0 && totalSettlementAmt > 0) {
          const grossDisbursementBase = isGoodsMarkup ? costPrice : finalPrincipal;
          const netCashToBorrower = Math.max(0, grossDisbursementBase - totalSettlementAmt);
          const newCompNote = `[KOMPENSASI PELUNASAN SEJENIS] Pencairan Rp ${formatRupiahPlain(grossDisbursementBase)} dipotong pelunasan ${settledOldLoanNumbers.join(', ')} sebesar Rp ${formatRupiahPlain(totalSettlementAmt)} • Sisa uang diterima peminjam: Rp ${formatRupiahPlain(netCashToBorrower)}`;
          const existingNewNotes = String(loanRecord.notes ?? existingLoan?.notes ?? '').trim();
          const updatedNewNotes = existingNewNotes.includes('[KOMPENSASI PELUNASAN SEJENIS]')
            ? existingNewNotes
            : existingNewNotes
              ? `${existingNewNotes} | ${newCompNote}`
              : newCompNote;

          const newLoanCompensationPayload: Record<string, any> = {
            topup_settlement_amount: totalSettlementAmt,
            notes: updatedNewNotes,
            updated_at: new Date().toISOString(),
          };
          if (!refinancedLoanId && settledOldLoanIds[0]) {
            newLoanCompensationPayload.refinanced_loan_id = settledOldLoanIds[0];
          }

          const newUpdRes: any = await supabase
            .from('loans')
            .update(newLoanCompensationPayload)
            .eq('id', targetLoanId);

          if (newUpdRes?.error && isMissingColumnError(newUpdRes.error)) {
            await supabase
              .from('loans')
              .update({
                notes: updatedNewNotes,
                updated_at: new Date().toISOString(),
              })
              .eq('id', targetLoanId);
          }

          loanRecord.topup_settlement_amount = totalSettlementAmt;
          loanRecord.notes = updatedNewNotes;
          if (!loanRecord.refinanced_loan_id && settledOldLoanIds[0]) {
            loanRecord.refinanced_loan_id = settledOldLoanIds[0];
          }
        }
      } catch (topupErr) {
        console.warn('Gagal memproses pelunasan otomatis pinjaman top-up:', topupErr);
      }
    }

    // 4c. Catat pengeluaran kas riil ke public.cash_flow secara idempoten
    // Untuk Pembiayaan Barang: dasar pencairan adalah Harga Beli/Modal ke Supplier (cost_price)
    const effectiveSettlement =
      totalSettlementAmt > 0
        ? totalSettlementAmt
        : Math.max(0, Number(loanRecord.topup_settlement_amount ?? existingLoan?.topup_settlement_amount ?? 0));
    const grossDisbursementBase = isGoodsMarkup ? costPrice : finalPrincipal;
    const disbursementOutflowAmount = Math.max(0, grossDisbursementBase - effectiveSettlement);

    if (disbursementOutflowAmount > 0) {
      let cashFlowInsertError: Error | null = null;
      try {
        const cfTable: any = supabase.from('cash_flow');
        if (cfTable && typeof cfTable.insert === 'function') {
          let alreadyRecorded = false;
          if (typeof cfTable.select === 'function') {
            try {
              const cfSelectQ: any = cfTable.select('id, direction, reference_id');
              if (cfSelectQ && typeof cfSelectQ.eq === 'function') {
                let checkQ: any = cfSelectQ.eq('reference_id', targetLoanId);
                if (checkQ && typeof checkQ.eq === 'function') {
                  checkQ = checkQ.eq('direction', 'out');
                }
                if (checkQ && typeof checkQ.limit === 'function') {
                  checkQ = checkQ.limit(1);
                }
                const existingCfRes = await checkQ;
                const existingCfRows = Array.isArray(existingCfRes?.data)
                  ? existingCfRes.data
                  : existingCfRes?.data
                    ? [existingCfRes.data]
                    : [];
                alreadyRecorded = existingCfRows.some(
                  (r: any) =>
                    String(r?.reference_id || '') === String(targetLoanId) &&
                    (!r?.direction || String(r.direction).toLowerCase() === 'out')
                );
              }
            } catch {
              // Non-blocking idempotency check fallback
            }
          }

          if (!alreadyRecorded) {
            let memberInfo: any = Array.isArray(existingLoan?.anggota)
              ? existingLoan.anggota[0]
              : existingLoan?.anggota || (Array.isArray(loanRecord?.anggota) ? loanRecord.anggota[0] : loanRecord?.anggota);

            if (!memberInfo && memberIdForTopup) {
              try {
                const memberTable: any = supabase.from('anggota');
                if (memberTable && typeof memberTable.select === 'function') {
                  const mQ = memberTable.select('nrp, nama').eq('id', memberIdForTopup);
                  const mRes = typeof mQ?.maybeSingle === 'function'
                    ? await mQ.maybeSingle()
                    : typeof mQ?.single === 'function'
                      ? await mQ.single()
                      : await mQ;
                  if (mRes?.data) {
                    memberInfo = Array.isArray(mRes.data) ? mRes.data[0] : mRes.data;
                  }
                }
              } catch {
                // Non-blocking member lookup
              }
            }

            const nrpStr = String(memberInfo?.nrp || '').trim();
            const namaStr = String(memberInfo?.nama || '').trim();
            const memberSegment = [nrpStr, namaStr].filter(Boolean).join(' - ') || 'Anggota';
            const loanNumber = String(loanRecord.loan_number || existingLoan?.loan_number || '').trim();
            const loanNumberSeg = loanNumber ? ` [${loanNumber}]` : '';
            const itemDesc = String(
              loanRecord.item_description ||
                existingLoan?.item_description ||
                loanRecord.notes ||
                existingLoan?.notes ||
                'Barang'
            ).trim();

            const cfDescription = isGoodsMarkup
              ? `Pembiayaan Barang (${itemDesc}) — ${memberSegment} | Modal Supplier: Rp ${formatRupiahPlain(costPrice)} (Harga Jual Akad: Rp ${formatRupiahPlain(finalPrincipal)})${effectiveSettlement > 0 ? ` • Potong Top-Up: Rp ${formatRupiahPlain(effectiveSettlement)}` : ''}`
              : `Pencairan Pinjaman${loanNumberSeg} — ${memberSegment} (Tenor ${tenor} Bln${effectiveSettlement > 0 ? `, Potong Top-Up: Rp ${formatRupiahPlain(effectiveSettlement)}` : ''})`;

            const cfCategory = isGoodsMarkup ? 'pembiayaan_barang' : 'pencairan_pinjaman';
            const roundedAmount = Math.round(disbursementOutflowAmount);
            const createdAtIso = new Date().toISOString();

            let cfRes: any = await cfTable.insert([{
              direction: 'out',
              amount: roundedAmount,
              category: cfCategory,
              reference_id: targetLoanId,
              description: cfDescription,
              created_at: createdAtIso,
            }]);
            if (cfRes?.error && isMissingColumnError(cfRes.error)) {
              cfRes = await cfTable.insert([{
                direction: 'out',
                amount: roundedAmount,
                category: cfCategory,
                reference_id: targetLoanId,
                created_at: createdAtIso,
              }]);
            }
            if (cfRes?.error) {
              console.error('[approveLoan -> cash_flow] Gagal mencatat kas keluar pencairan:', cfRes.error);
              const errMsg = cfRes.error?.message || 'Gagal mencatat kas keluar pencairan ke cash_flow';
              cashFlowInsertError = new Error(`Pinjaman disetujui, namun pencatatan Kas Keluar gagal: ${errMsg}`);
            }
          }
        }
      } catch (cfErr: any) {
        console.warn('Gagal mencatat pencairan pinjaman ke cash_flow:', cfErr);
        const errMsg = cfErr?.message || String(cfErr || 'Gagal mencatat kas keluar pencairan ke cash_flow');
        cashFlowInsertError = new Error(`Pinjaman disetujui, namun pencatatan Kas Keluar gagal: ${errMsg}`);
      }
      if (cashFlowInsertError) {
        throw cashFlowInsertError;
      }
    }

    // 5. Catat riwayat persetujuan ke public.audit_logs
    try {
      const auditTable: any = supabase.from('audit_logs');
      if (auditTable && typeof auditTable.insert === 'function') {
        const auditRes = await auditTable.insert({
          table_name: 'loans',
          action: 'APPROVE',
          record_id: targetLoanId,
          entity_name: 'loans',
          entity_id: targetLoanId,
          new_data: {
            id: targetLoanId,
            status: 'active',
            disbursed_at: todayDate,
            sisa_pinjaman: finalPrincipal,
            tenor,
            monthly_target: monthlyInstallment,
            ...(isGoodsMarkup
              ? {
                  cost_price: costPrice,
                  markup_amount: markupAmount,
                  item_description: loanRecord.item_description ?? existingLoan?.item_description ?? null,
                }
              : {}),
          },
          notes: `Pengajuan pinjaman disetujui dan diaktifkan (${todayDate})`,
        });
        if (auditRes?.error) {
          console.warn('Gagal mencatat APPROVE ke audit_logs:', auditRes.error);
        }
      }
    } catch (e) {
      console.warn('Gagal mencatat APPROVE ke audit_logs:', e);
    }

    return loanRecord as Loan;
  },

  async approveLoanApplication(loanId: string, disbursedDate?: string): Promise<Loan> {
    return this.approveLoan(loanId, disbursedDate);
  },

  async rejectLoan(loanId: string) {
    const { error } = await supabase
      .from('loans')
      .update({
        status: 'rejected'
      })
      .eq('id', loanId);

    if (error) throw new Error(error.message);
    return true;
  },

  /**
   * Pembayaran angsuran terisolasi khusus pada satu baris jadwal tertentu (scheduleId)
   */
  async paySchedule(
    loanId: string,
    scheduleId: string,
    paymentAmount: number,
    paymentMethod: string = 'CASH',
    notes?: string,
    receiptNumber?: string
  ): Promise<PayScheduleResult> {
    if (supabase.rpc && typeof supabase.rpc === 'function') {
      try {
        const rpcRes = (await supabase.rpc('record_loan_repayment_atomic', {
          p_loan_id: loanId,
          p_amount_paid: paymentAmount,
          p_payment_method: paymentMethod || 'CASH',
          p_schedule_id: scheduleId,
          p_notes: notes || 'Pelunasan parsial jadwal periode terkait',
          p_receipt_number: receiptNumber?.trim() || null
        } as any)) as any;

        if (rpcRes) {
          const { data, error } = rpcRes;
          if (error) {
            if (!shouldFallbackFromRepaymentRpc(error)) {
              throw new Error(error.message || 'Gagal memproses pembayaran angsuran via atomic RPC');
            }
          } else if (data) {
            const responseData = data as RecordLoanRepaymentRpcResponse;
            if (responseData.success === false) {
              throw new Error(responseData.message || 'Pembayaran angsuran ditolak');
            }
            return {
              success: true,
              newStatus: responseData.newStatus,
              newPaidTotal: Number(responseData.newPaidTotal),
              sisaPinjaman: Number(responseData.sisaPinjaman),
              isAllPaid: Boolean(responseData.isAllPaid),
              repaymentId: responseData.repayment_id,
              receiptNumber: responseData.receipt_number
            };
          }
        }
      } catch (err: any) {
        if (!shouldFallbackFromRepaymentRpc(err)) {
          throw err;
        }
      }
    }

    // Fallback: sequential client-side execution (for environments without record_loan_repayment_atomic RPC)
    // 1. Ambil data baris loan_schedules yang sedang aktif berdasarkan id = scheduleId
    let { data: schedule, error: schErr } = await supabase
      .from('loan_schedules')
      .select('id, period_number, target_amount, paid_amount, status, principal_portion, margin_portion')
      .eq('id', scheduleId)
      .single();

    if (schErr && isMissingColumnError(schErr)) {
      const fbSched = await supabase
        .from('loan_schedules')
        .select('id, target_amount, paid_amount, status')
        .eq('id', scheduleId)
        .single();
      schedule = fbSched.data as any;
      schErr = fbSched.error;
    }

    if (schErr || !schedule) throw schErr || new Error('Jadwal angsuran tidak ditemukan');

    // 2. Hitung total bayar baru HANYA untuk baris ini
    const paymentAmountClean = Math.round(Number(paymentAmount));
    const currentPaid = Math.round(Number(schedule.paid_amount || 0));
    const newPaid = currentPaid + paymentAmountClean;
    const target = Math.round(Number(schedule.target_amount || 0));
    // Beri toleransi pembulatan +/- 5 Rupiah untuk pelunasan akhir
    const isFullyPaid = (newPaid >= target) || (Math.abs(target - newPaid) <= 5);
    const newPaidTotal = isFullyPaid ? target : newPaid;
    const newStatus: 'paid' | 'partial' | 'unpaid' = isFullyPaid ? 'paid' : (newPaidTotal > 0 ? 'partial' : 'unpaid');

    const scheduleMarginPortion = Number((schedule as any).margin_portion || 0);
    const portions = calculateRepaymentPortions({
      amountPaid: paymentAmountClean,
      targetAmount: target,
      schedulePrincipalPortion: (schedule as any).principal_portion,
      scheduleMarginPortion,
    });
    const hasMarginSplit = portions.marginPortion > 0 || scheduleMarginPortion > 0;

    // 3. Lakukan UPDATE HANYA pada satu baris jadwal tersebut (ISOLASI KETAT)
    const { error: updateErr } = await supabase
      .from('loan_schedules')
      .update({
        paid_amount: newPaidTotal,
        status: newStatus
      })
      .eq('id', scheduleId);

    if (updateErr) throw new Error(updateErr.message || 'Gagal memperbarui jadwal angsuran');

    // 4. Catat mutasi di tabel loan_repayments dengan mengaitkan schedule_id: selectedScheduleId
    const repaymentInsertPayload: Record<string, any> = {
      loan_id: loanId,
      schedule_id: scheduleId,
      amount_paid: paymentAmountClean,
      payment_method: paymentMethod || 'CASH',
      notes: notes || 'Pelunasan parsial jadwal periode terkait',
      receipt_number: receiptNumber?.trim() || undefined
    };
    if (hasMarginSplit) {
      repaymentInsertPayload.principal_portion = portions.principalPortion;
      repaymentInsertPayload.margin_portion = portions.marginPortion;
    }

    let { error: repayErr } = await supabase
      .from('loan_repayments')
      .insert([repaymentInsertPayload]);

    if (repayErr && hasMarginSplit && isMissingColumnError(repayErr)) {
      const { principal_portion: _pp, margin_portion: _mp, ...legacyRepayPayload } = repaymentInsertPayload;
      const retryRepay = await supabase
        .from('loan_repayments')
        .insert([legacyRepayPayload]);
      repayErr = retryRepay.error;
    }

    if (repayErr) throw new Error(repayErr.message || 'Gagal mencatat mutasi pembayaran');

    // 5. Perbarui nilai akumulasi pinjaman induk (loans)
    const { data: allSchedules, error: allSchedulesErr } = await supabase
      .from('loan_schedules')
      .select('id, target_amount, paid_amount, status')
      .eq('loan_id', loanId);

    if (!allSchedulesErr && allSchedules) {
      let { data: loanData, error: loanFetchErr } = await supabase
        .from('loans')
        .select('id, loan_number, amount, principal_amount, cost_price, markup_amount, item_description, status, member_id, anggota:member_id(nrp, nama)')
        .eq('id', loanId)
        .single();

      if (loanFetchErr && isMissingColumnError(loanFetchErr)) {
        const fbLoan = await supabase
          .from('loans')
          .select('id, amount, principal_amount, status, member_id')
          .eq('id', loanId)
          .single();
        loanData = fbLoan.data as any;
      }

      const principalAmount = Number(loanData?.principal_amount || loanData?.amount || 0);
      const totalPaidAll = allSchedules.reduce((sum, s) => {
        const val = s.id === scheduleId ? newPaidTotal : Number(s.paid_amount || 0);
        return sum + val;
      }, 0);

      const sisaPinjaman = Math.max(0, principalAmount - totalPaidAll);
      const isAllPaid = allSchedules.every(s => 
        s.id === scheduleId ? newStatus === 'paid' : (s.status === 'paid' || Math.round(Number(s.paid_amount || 0)) >= Math.round(Number(s.target_amount || 0)) || Math.abs(Math.round(Number(s.target_amount || 0)) - Math.round(Number(s.paid_amount || 0))) <= 5)
      );

      const newLoanStatus: 'paid_off' | 'active' = isAllPaid ? 'paid_off' : 'active';

      // Update loans status & sisa_pinjaman
      const { error: updateLoanErr } = await supabase
        .from('loans')
        .update({
          status: newLoanStatus,
          sisa_pinjaman: sisaPinjaman
        })
        .eq('id', loanId);

      if (updateLoanErr) {
        // Fallback jika database belum mendukung status 'paid_off' atau kolom sisa_pinjaman
        const fallbackLoanStatus: 'completed' | 'active' = isAllPaid ? 'completed' : 'active';
        await supabase
          .from('loans')
          .update({
            status: fallbackLoanStatus
          })
          .eq('id', loanId);
      }

      // Auto-Detection for Final Resignation Approval jika lunas
      if (isAllPaid && loanData?.member_id) {
        const { data: otherLoans } = await supabase
          .from('loans')
          .select('id')
          .eq('member_id', loanData.member_id)
          .in('status', ['approved', 'active']);
          
        if (!otherLoans || otherLoans.length === 0) {
          const { data: memberData } = await supabase.from('anggota').select('membership_status').eq('id', loanData.member_id).single();
          if (memberData && memberData.membership_status === 'PENDING_RESIGNED') {
            await supabase.from('anggota').update({ membership_status: 'READY_TO_RESIGN' }).eq('id', loanData.member_id);
          }
        }
      }

      // Catat kas masuk ke cash_flow (dengan metadata pemisahan pokok vs margin bila pembiayaan barang)
      if (paymentAmountClean > 0) {
        try {
          const finalPortions = hasMarginSplit
            ? portions
            : calculateRepaymentPortions({
                amountPaid: paymentAmountClean,
                targetAmount: target,
                loanCostPrice: (loanData as any)?.cost_price,
                loanMarkupAmount: (loanData as any)?.markup_amount,
                loanTotalAmount: principalAmount,
              });
          const memberObj = Array.isArray((loanData as any)?.anggota)
            ? (loanData as any).anggota[0]
            : (loanData as any)?.anggota;
          const memberSeg = [memberObj?.nrp, memberObj?.nama].filter(Boolean).join(' - ');
          const periodNum = (schedule as any).period_number ?? '-';
          const cfDescription =
            finalPortions.marginPortion > 0
              ? `Angsuran Pembiayaan Barang (${(loanData as any)?.item_description || (loanData as any)?.loan_number || 'Barang'}) Bln ke-${periodNum}${memberSeg ? ` — ${memberSeg}` : ''} | Pokok: Rp ${formatRupiahPlain(finalPortions.principalPortion)} | Margin: Rp ${formatRupiahPlain(finalPortions.marginPortion)}`
              : `Angsuran Pinjaman (${(loanData as any)?.loan_number || loanId}) Bln ke-${periodNum}${memberSeg ? ` — ${memberSeg}` : ''}`;

          const cfTable: any = supabase.from('cash_flow');
          if (cfTable && typeof cfTable.insert === 'function') {
            const cfRes = await cfTable.insert([{
              direction: 'in',
              amount: paymentAmountClean,
              category: 'angsuran_pinjaman',
              reference_id: loanId,
              description: cfDescription,
              created_at: new Date().toISOString(),
            }]);
            if (cfRes?.error && isMissingColumnError(cfRes.error)) {
              await cfTable.insert([{
                direction: 'in',
                amount: paymentAmountClean,
                category: 'angsuran_pinjaman',
                reference_id: loanId,
                created_at: new Date().toISOString(),
              }]);
            }
          }
        } catch (cfErr) {
          console.warn('Gagal mencatat angsuran pinjaman ke cash_flow:', cfErr);
        }
      }

      return {
        success: true,
        newStatus,
        newPaidTotal,
        sisaPinjaman,
        isAllPaid
      };
    }

    return { success: true, newStatus, newPaidTotal };
  },

  async makePayment(
    loanId: string, 
    amountPaid: number, 
    paymentMethod: string, 
    notes?: string,
    scheduleId?: string,
    receiptNumber?: string
  ): Promise<MakePaymentResult> {
    if (scheduleId) {
      return receiptNumber !== undefined
        ? this.paySchedule(loanId, scheduleId, amountPaid, paymentMethod, notes, receiptNumber)
        : this.paySchedule(loanId, scheduleId, amountPaid, paymentMethod, notes);
    }

    if (supabase.rpc && typeof supabase.rpc === 'function') {
      try {
        const rpcRes = (await supabase.rpc('record_loan_repayment_atomic', {
          p_loan_id: loanId,
          p_amount_paid: amountPaid,
          p_payment_method: paymentMethod || 'CASH',
          p_schedule_id: null,
          p_notes: notes || 'Pembayaran angsuran pinjaman (FIFO)',
          p_receipt_number: receiptNumber?.trim() || null
        } as any)) as any;

        if (rpcRes) {
          const { data, error } = rpcRes;
          if (error) {
            if (!shouldFallbackFromRepaymentRpc(error)) {
              throw new Error(error.message || 'Gagal memproses pembayaran angsuran via atomic RPC');
            }
          } else if (data) {
            const responseData = data as RecordLoanRepaymentRpcResponse;
            if (responseData.success === false) {
              throw new Error(responseData.message || 'Pembayaran angsuran ditolak');
            }
            return {
              success: true,
              excess_amount: Number(responseData.excess_amount || 0),
              sisaPinjaman: Number(responseData.sisaPinjaman),
              isAllPaid: Boolean(responseData.isAllPaid)
            };
          }
        }
      } catch (err: any) {
        if (!shouldFallbackFromRepaymentRpc(err)) {
          throw err;
        }
      }
    }

    // Fallback: sequential client-side execution (for environments without record_loan_repayment_atomic RPC)
    let remainingPayment = amountPaid;
    let totalPaidNow = 0;
    let totalPrincipalPortion = 0;
    let totalMarginPortion = 0;
    
    // Get all unpaid/partial schedules ordered by period_number (FIFO)
    const { data: schedules, error: scheduleError } = await supabase
      .from('loan_schedules')
      .select('*')
      .eq('loan_id', loanId)
      .in('status', ['unpaid', 'partial'])
      .order('period_number', { ascending: true });

    if (scheduleError) throw new Error(scheduleError.message);

    for (const schedule of schedules) {
      if (remainingPayment <= 0) break;

      const scheduleShortfall = Number(schedule.target_amount) - Number(schedule.paid_amount);
      const paymentForSchedule = Math.min(remainingPayment, scheduleShortfall);
      
      const newPaidAmount = Number(schedule.paid_amount) + paymentForSchedule;
      const newStatus: 'paid' | 'partial' = newPaidAmount >= Number(schedule.target_amount) ? 'paid' : 'partial';

      const schedMarginPortion = Number(schedule.margin_portion || 0);
      const portions = calculateRepaymentPortions({
        amountPaid: paymentForSchedule,
        targetAmount: Number(schedule.target_amount || 0),
        schedulePrincipalPortion: schedule.principal_portion,
        scheduleMarginPortion: schedMarginPortion,
      });
      const hasMarginSplit = portions.marginPortion > 0 || schedMarginPortion > 0;

      // Update schedule
      const { error: updateError } = await supabase
        .from('loan_schedules')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus
        })
        .eq('id', schedule.id);
        
      if (updateError) throw new Error(updateError.message);

      // Record repayment
      const repayPayload: Record<string, any> = {
        loan_id: loanId,
        schedule_id: schedule.id,
        amount_paid: paymentForSchedule,
        payment_method: paymentMethod,
        notes: notes
      };
      if (hasMarginSplit) {
        repayPayload.principal_portion = portions.principalPortion;
        repayPayload.margin_portion = portions.marginPortion;
      }

      let { error: repayError } = await supabase
        .from('loan_repayments')
        .insert([repayPayload]);

      if (repayError && hasMarginSplit && isMissingColumnError(repayError)) {
        const { principal_portion: _pp, margin_portion: _mp, ...legacyRepayPayload } = repayPayload;
        const retryRepay = await supabase
          .from('loan_repayments')
          .insert([legacyRepayPayload]);
        repayError = retryRepay.error;
      }

      if (repayError) throw new Error(repayError.message);

      totalPaidNow += paymentForSchedule;
      totalPrincipalPortion += portions.principalPortion;
      totalMarginPortion += portions.marginPortion;
      remainingPayment -= paymentForSchedule;
    }

    // Check if all schedules are paid
    const { data: allSchedules, error: allSchedulesError } = await supabase
      .from('loan_schedules')
      .select('status, paid_amount')
      .eq('loan_id', loanId);

    const isAllPaid = !allSchedulesError && (allSchedules || []).length > 0 && allSchedules.every(s => s.status === 'paid');

    let { data: loanData, error: loanFetchErr } = await supabase
      .from('loans')
      .select('id, loan_number, amount, principal_amount, cost_price, markup_amount, item_description, status, member_id')
      .eq('id', loanId)
      .single();

    if (loanFetchErr && isMissingColumnError(loanFetchErr)) {
      const fbLoan = await supabase
        .from('loans')
        .select('id, amount, principal_amount, status, member_id')
        .eq('id', loanId)
        .single();
      loanData = fbLoan.data as any;
    }

    const principalAmount = Number(loanData?.principal_amount || loanData?.amount || 0);
    const totalPaidAll = (allSchedules || []).reduce((sum, s) => sum + Number(s.paid_amount || 0), 0);
    const sisaPinjaman = Math.max(0, principalAmount - totalPaidAll);
    const newLoanStatus: 'paid_off' | 'active' = isAllPaid ? 'paid_off' : 'active';

    const { error: loanUpdateErr } = await supabase
      .from('loans')
      .update({
        status: newLoanStatus,
        sisa_pinjaman: sisaPinjaman
      })
      .eq('id', loanId);

    if (loanUpdateErr) {
      const fallbackLoanStatus: 'completed' | 'active' = isAllPaid ? 'completed' : 'active';
      await supabase
        .from('loans')
        .update({ status: fallbackLoanStatus })
        .eq('id', loanId);
    }

    if (isAllPaid && loanData?.member_id) {
      // Auto-Detection for Final Resignation Approval
      const { data: otherLoans } = await supabase
        .from('loans')
        .select('id')
        .eq('member_id', loanData.member_id)
        .in('status', ['approved', 'active']);
        
      if (!otherLoans || otherLoans.length === 0) {
        const { data: memberData } = await supabase.from('anggota').select('membership_status').eq('id', loanData.member_id).single();
        if (memberData && memberData.membership_status === 'PENDING_RESIGNED') {
          await supabase.from('anggota').update({ membership_status: 'READY_TO_RESIGN' }).eq('id', loanData.member_id);
        }
      }
    }

    if (totalPaidNow > 0) {
      try {
        const cfTable: any = supabase.from('cash_flow');
        if (cfTable && typeof cfTable.insert === 'function') {
          const fallbackPortions = totalMarginPortion > 0
            ? { principalPortion: totalPrincipalPortion, marginPortion: totalMarginPortion }
            : calculateRepaymentPortions({
                amountPaid: totalPaidNow,
                targetAmount: totalPaidNow,
                loanCostPrice: (loanData as any)?.cost_price,
                loanMarkupAmount: (loanData as any)?.markup_amount,
                loanTotalAmount: principalAmount,
              });
          const cfDescription =
            fallbackPortions.marginPortion > 0
              ? `Angsuran Pembiayaan Barang (${(loanData as any)?.item_description || (loanData as any)?.loan_number || 'Barang'}) | Pokok: Rp ${formatRupiahPlain(fallbackPortions.principalPortion)} | Margin: Rp ${formatRupiahPlain(fallbackPortions.marginPortion)}`
              : `Angsuran Pinjaman (${(loanData as any)?.loan_number || loanId})`;
          const cfRes = await cfTable.insert([{
            direction: 'in',
            amount: totalPaidNow,
            category: 'angsuran_pinjaman',
            reference_id: loanId,
            description: cfDescription,
            created_at: new Date().toISOString(),
          }]);
          if (cfRes?.error && isMissingColumnError(cfRes.error)) {
            await cfTable.insert([{
              direction: 'in',
              amount: totalPaidNow,
              category: 'angsuran_pinjaman',
              reference_id: loanId,
              created_at: new Date().toISOString(),
            }]);
          }
        }
      } catch (cfErr) {
        console.warn('Gagal mencatat angsuran FIFO ke cash_flow:', cfErr);
      }
    }
    
    return { success: true, excess_amount: remainingPayment };
  },

  async recordLoanRepayment(params: {
    loanId: string;
    amountPaid: number;
    paymentMethod?: string;
    scheduleId?: string;
    notes?: string;
    receiptNumber?: string;
  }) {
    const method = params.paymentMethod || 'CASH';
    if (params.scheduleId) {
      return this.paySchedule(
        params.loanId,
        params.scheduleId,
        params.amountPaid,
        method,
        params.notes,
        params.receiptNumber
      );
    }
    return this.makePayment(
      params.loanId,
      params.amountPaid,
      method,
      params.notes,
      undefined,
      params.receiptNumber
    );
  },
  
  async fullPayoff(loanId: string, paymentMethod: string, notes?: string) {
    const { data: schedules, error: scheduleError } = await supabase
      .from('loan_schedules')
      .select('*')
      .eq('loan_id', loanId)
      .in('status', ['unpaid', 'partial']);

    if (scheduleError) throw new Error(scheduleError.message);

    let totalRequired = 0;
    for (const schedule of schedules) {
      totalRequired += Number(schedule.target_amount) - Number(schedule.paid_amount);
    }
    
    if (totalRequired > 0) {
      await this.makePayment(loanId, totalRequired, paymentMethod, notes || 'Pelunasan Penuh');
    }
    
    return { success: true };
  },

  getLoanSettings,
  updateLoanSettings
};

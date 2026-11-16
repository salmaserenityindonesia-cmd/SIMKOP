import { supabase } from '../lib/supabaseClient';
import {
  getActiveSavingsRateTiers,
  loadSavingsRateConfig,
  resolveMemberSavingsRate,
  normalizeDepositTypeCode
} from './savingsRateService';
import { LoanType } from './koperasiService';
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

export {
  getLoanSettings,
  updateLoanSettings,
  DEFAULT_MIN_REMAINING_THP,
  DEFAULT_RAT_NOTES,
  type LoanSettings
};

export interface Loan {
  id: string;
  member_id: string;
  loan_type_id?: string;
  refinanced_loan_id?: string | null;
  topup_settlement_amount?: number;
  notes: string;
  amount: number;
  principal_amount?: number;
  agreed_tenor_months?: number;
  planned_installment_amount?: number;
  tenor: number;
  monthly_target: number;
  sisa_pinjaman?: number;
  status: 'draft' | 'approved' | 'active' | 'paid_off' | 'defaulted' | 'completed' | 'rejected';
  disbursed_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface LoanSchedule {
  id: string;
  loan_id: string;
  period_number: number;
  due_date: string;
  target_amount: number;
  paid_amount: number;
  status: 'unpaid' | 'partial' | 'paid';
}

export interface LoanRepayment {
  id: string;
  loan_id: string;
  schedule_id: string | null;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  notes: string | null;
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
    .select('id, code, name, max_duration_months, is_active')
    .eq('is_active', true)
    .order('code', { ascending: true });
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

export const loanService = {
  getActiveLoanTypes,
  syncInitialLoanBalances,
  async getLoanApplications(statusTab: LoanApplicationStatusTab = 'PENDING') {
    let query: any = supabase
      .from('loans')
      .select(`
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
        monthly_target,
        disbursed_at,
        created_at,
        status,
        notes,
        anggota:member_id (
          id,
          nrp,
          nama,
          pangkat,
          take_home_pay,
          master_thp,
          bank_account_number
        )
      `)
      .order('created_at', { ascending: false });

    if (statusTab === 'PENDING') {
      // Di skema database, permohonan baru yang menunggu persetujuan berstatus 'draft'
      query = query.eq('status', 'draft');
    } else if (statusTab === 'APPROVED') {
      query = query.in('status', ['approved', 'active', 'paid_off']);
    }
    // Jika 'ALL', tidak ada filter status (mengambil semua riwayat)

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
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
    const { data, error } = await supabase
      .from('loans')
      .select('*, anggota(nama, nrp)')
      .eq('id', id)
      .single();
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
      .select('id, nrp, nama, pangkat, take_home_pay, master_thp, salary, angsuran_lain_lain, bank_account_number')
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

    const candidates = [memberData?.take_home_pay, memberData?.master_thp, memberData?.salary];
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

    // 2. Get active loans
    const { data: activeLoans, error: loansError } = await supabase
      .from('loans')
      .select('monthly_target')
      .eq('member_id', memberId)
      .in('status', ['approved', 'active']);

    if (loansError) throw new Error(loansError.message);

    const activeInstallments = (activeLoans || []).reduce((sum, loan) => sum + Number(loan.monthly_target || 0), 0);

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
    }
  ) {
    const monthlyTarget = amount / tenor;
    const settlementAmount = Math.max(0, Number(topUpOptions?.topupSettlementAmount || 0));
    const replacedInstallment = Math.max(0, Number(topUpOptions?.replacedMonthlyInstallment || 0));

    if (settlementAmount > 0 && amount <= settlementAmount) {
      throw new Error(
        `Plafon pinjaman baru (Rp ${amount.toLocaleString('id-ID')}) harus lebih besar dari sisa pinjaman lama yang dilunasi (Rp ${settlementAmount.toLocaleString('id-ID')}).`
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

    const insertPayload: Record<string, any> = {
      loan_number: `LOAN-${Date.now()}`,
      member_id: memberId,
      loan_type_id: targetLoanTypeId,
      principal_amount: amount,
      agreed_tenor_months: tenor,
      planned_installment_amount: monthlyTarget,
      amount: amount,
      tenor: tenor,
      monthly_target: monthlyTarget,
      notes: purpose,
      status: 'draft'
    };

    if (topUpOptions?.refinancedLoanId) {
      insertPayload.refinanced_loan_id = topUpOptions.refinancedLoanId;
    }
    if (settlementAmount > 0) {
      insertPayload.topup_settlement_amount = settlementAmount;
    }

    const { data, error } = await supabase
      .from('loans')
      .insert([insertPayload])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Loan;
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
        const fetchQuery = loansFetchTable
          .select('id, loan_number, member_id, loan_type_id, refinanced_loan_id, topup_settlement_amount, principal_amount, amount, tenor, agreed_tenor_months, monthly_target, planned_installment_amount, status')
          .eq('id', loanId);
        const fetchRes = typeof fetchQuery?.maybeSingle === 'function'
          ? await fetchQuery.maybeSingle()
          : typeof fetchQuery?.single === 'function'
            ? await fetchQuery.single()
            : await fetchQuery;
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
      const schedules = [];
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

      if (schedules.length > 0) {
        const { error: scheduleError } = await supabase
          .from('loan_schedules')
          .insert(schedules);

        if (scheduleError) throw new Error(scheduleError.message);
      }
    }

    // 4b. Pelunasan otomatis kontrak pinjaman lama sejenis jika ini adalah pengajuan Top-Up
    let totalSettlementAmt = 0;
    const memberIdForTopup = loanRecord.member_id || existingLoan?.member_id;
    const loanTypeIdForTopup = loanRecord.loan_type_id || existingLoan?.loan_type_id;
    const refinancedLoanId = loanRecord.refinanced_loan_id || existingLoan?.refinanced_loan_id || null;

    if (memberIdForTopup && (loanTypeIdForTopup || refinancedLoanId)) {
      try {
        const oldLoansMap = new Map<string, any>();

        if (loanTypeIdForTopup) {
          const sameTypeRes: any = await supabase
            .from('loans')
            .select('id, loan_number, sisa_pinjaman, status')
            .eq('member_id', memberIdForTopup)
            .eq('loan_type_id', loanTypeIdForTopup)
            .in('status', ['active', 'approved'])
            .neq('id', targetLoanId);

          for (const row of sameTypeRes?.data || []) {
            if (row?.id && Number(row.sisa_pinjaman ?? 0) > 0) {
              oldLoansMap.set(String(row.id), row);
            }
          }
        }

        if (refinancedLoanId && !oldLoansMap.has(String(refinancedLoanId))) {
          const refRes: any = await supabase
            .from('loans')
            .select('id, loan_number, sisa_pinjaman, status')
            .eq('id', refinancedLoanId)
            .maybeSingle();
          const refRow = refRes?.data;
          if (refRow?.id && refRow.status !== 'paid_off' && Number(refRow.sisa_pinjaman ?? 0) > 0) {
            oldLoansMap.set(String(refRow.id), refRow);
          }
        }

        for (const oldLoan of oldLoansMap.values()) {
          const settlementAmt = Math.max(0, Number(oldLoan.sisa_pinjaman ?? 0));
          totalSettlementAmt += settlementAmt;

          const { data: unpaidOldSchedules } = await supabase
            .from('loan_schedules')
            .select('id, target_amount, paid_amount, status')
            .eq('loan_id', oldLoan.id)
            .neq('status', 'paid');

          for (const sch of unpaidOldSchedules || []) {
            await supabase
              .from('loan_schedules')
              .update({
                paid_amount: Number(sch.target_amount || 0),
                status: 'paid',
              })
              .eq('id', sch.id);
          }

          if (settlementAmt > 0) {
            await supabase.from('loan_repayments').insert({
              loan_id: oldLoan.id,
              schedule_id: null,
              amount_paid: settlementAmt,
              payment_method: 'TOPUP_COMPENSATION',
              payment_date: new Date().toISOString(),
              receipt_number: `KW-TOPUP-${Date.now()}`,
              notes: `Pelunasan otomatis via top-up pinjaman baru ${loanRecord.loan_number || targetLoanId}`,
            });
          }

          await supabase
            .from('loans')
            .update({
              status: 'paid_off',
              sisa_pinjaman: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', oldLoan.id);
        }
      } catch (topupErr) {
        console.warn('Gagal memproses pelunasan otomatis pinjaman top-up:', topupErr);
      }
    }

    // 4c. Catat pengeluaran kas riil (dana bersih diterima anggota) ke public.cash_flow
    const effectiveSettlement = totalSettlementAmt > 0
      ? totalSettlementAmt
      : Math.max(0, Number(loanRecord.topup_settlement_amount ?? existingLoan?.topup_settlement_amount ?? 0));
    const netDisbursedAmount = Math.max(0, finalPrincipal - effectiveSettlement);
    if (netDisbursedAmount > 0) {
      try {
        const cfTable: any = supabase.from('cash_flow');
        if (cfTable && typeof cfTable.insert === 'function') {
          await cfTable.insert([{
            direction: 'out',
            amount: netDisbursedAmount,
            category: 'pencairan_pinjaman',
            reference_id: targetLoanId,
            created_at: new Date().toISOString(),
          }]);
        }
      } catch (cfErr) {
        console.warn('Gagal mencatat pencairan pinjaman ke cash_flow:', cfErr);
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
    const { data: schedule, error: schErr } = await supabase
      .from('loan_schedules')
      .select('id, target_amount, paid_amount, status')
      .eq('id', scheduleId)
      .single();

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
    const { error: repayErr } = await supabase
      .from('loan_repayments')
      .insert([{
        loan_id: loanId,
        schedule_id: scheduleId,
        amount_paid: paymentAmountClean,
        payment_method: paymentMethod || 'CASH',
        notes: notes || 'Pelunasan parsial jadwal periode terkait',
        receipt_number: receiptNumber?.trim() || undefined
      }]);

    if (repayErr) throw new Error(repayErr.message || 'Gagal mencatat mutasi pembayaran');

    // 5. Perbarui nilai akumulasi pinjaman induk (loans)
    const { data: allSchedules, error: allSchedulesErr } = await supabase
      .from('loan_schedules')
      .select('id, target_amount, paid_amount, status')
      .eq('loan_id', loanId);

    if (!allSchedulesErr && allSchedules) {
      const { data: loanData } = await supabase
        .from('loans')
        .select('id, amount, principal_amount, status, member_id')
        .eq('id', loanId)
        .single();

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
      const { error: repayError } = await supabase
        .from('loan_repayments')
        .insert([{
          loan_id: loanId,
          schedule_id: schedule.id,
          amount_paid: paymentForSchedule,
          payment_method: paymentMethod,
          notes: notes
        }]);

      if (repayError) throw new Error(repayError.message);

      remainingPayment -= paymentForSchedule;
    }

    // Check if all schedules are paid
    const { data: allSchedules, error: allSchedulesError } = await supabase
      .from('loan_schedules')
      .select('status, paid_amount')
      .eq('loan_id', loanId);

    const isAllPaid = !allSchedulesError && (allSchedules || []).length > 0 && allSchedules.every(s => s.status === 'paid');

    const { data: loanData } = await supabase
      .from('loans')
      .select('id, amount, principal_amount, status, member_id')
      .eq('id', loanId)
      .single();

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
    
    return { success: true, excess_amount: remainingPayment };
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

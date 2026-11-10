import { supabase } from '../lib/supabaseClient';
import { getActiveSavingsRateTiers } from './savingsRateService';
import { LoanType } from './koperasiService';
import {
  ApproveLoanRpcResponse,
  RecordLoanRepaymentRpcResponse,
  PayScheduleResult,
  MakePaymentResult
} from '../types/loan';

export interface Loan {
  id: string;
  member_id: string;
  notes: string;
  amount: number;
  tenor: number;
  monthly_target: number;
  status: 'draft' | 'approved' | 'active' | 'paid_off' | 'defaulted' | 'completed' | 'rejected';
  disbursed_at: string | null;
  created_at: string;
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

export const loanService = {
  getActiveLoanTypes,
  async getLoanApplications(statusTab: LoanApplicationStatusTab = 'PENDING') {
    let query: any = supabase
      .from('loans')
      .select(`
        id,
        loan_number,
        member_id,
        loan_type_id,
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
    savings_deduction: number;
    remaining_thp: number;
  }> {
    // 1. Get member master_thp with fallback
    let memberData: any = null;
    const { data: member, error: memberError } = await supabase
      .from('anggota')
      .select('id, nrp, nama, pangkat, take_home_pay, master_thp, salary, bank_account_number')
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
      const activeRates = await getActiveSavingsRateTiers();
      const defaultWajibRate = activeRates['WAJIB'] || 200000;

      const { data: memberDeposits, error: depError } = await supabase
        .from('member_deposits')
        .select('id, deposit_type_id, is_terminated, deposit_types(code)')
        .eq('member_id', memberId)
        .eq('is_terminated', false);

      if (!depError && memberDeposits && memberDeposits.length > 0) {
        let total = 0;
        let hasWajib = false;
        for (const dep of memberDeposits) {
          const rawCode = Array.isArray(dep.deposit_types)
            ? dep.deposit_types[0]?.code
            : (dep.deposit_types as any)?.code;
          const code = (rawCode || '').toUpperCase();
          if (code === 'WAJIB' || code === 'SW') {
            hasWajib = true;
          }
          const rate = activeRates[code] || (code === 'WAJIB' || code === 'SW' ? defaultWajibRate : 0);
          total += rate;
        }
        if (!hasWajib && defaultWajibRate > 0) {
          total += defaultWajibRate;
        }
        savingsDeduction = total;
      } else {
        savingsDeduction = defaultWajibRate;
      }
    } catch (err) {
      console.warn('Gagal memuat potongan simpanan aktif, fallback default:', err);
      savingsDeduction = 200000;
    }

    const remainingThp = masterThp - activeInstallments - savingsDeduction;

    return {
      master_thp: masterThp,
      active_installments: activeInstallments,
      savings_deduction: savingsDeduction,
      remaining_thp: remainingThp
    };
  },

  async applyLoan(memberId: string, purpose: string, amount: number, tenor: number, loanTypeId?: string) {
    const monthlyTarget = amount / tenor;
    
    const { remaining_thp } = await this.getMemberTHP(memberId);
    const eligibility = calculateTHPEligibility(remaining_thp, monthlyTarget, MIN_REMAINING_THP);
    if (!eligibility.isEligible) {
      throw new Error(
        `Pengajuan ditolak: Sisa THP setelah pemotongan (Rp ${eligibility.finalRemainingThp.toLocaleString('id-ID')}) kurang Rp ${eligibility.shortfall.toLocaleString('id-ID')} dari batas minimal Rp ${MIN_REMAINING_THP.toLocaleString('id-ID')}.`
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

    const { data, error } = await supabase
      .from('loans')
      .insert([{
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
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Loan;
  },

  async approveLoan(loanId: string, startDate: string) {
    if (supabase.rpc && typeof supabase.rpc === 'function') {
      try {
        const rpcRes = (await supabase.rpc('approve_loan_atomic', {
          p_loan_id: loanId,
          p_start_date: startDate
        } as any)) as any;

        if (rpcRes) {
          const { data, error } = rpcRes;
          if (error) {
            const isMissingFunction = error.code === 'PGRST202' || error.message?.includes('Could not find the function') || error.code === '42883';
            if (!isMissingFunction) {
              throw new Error(error.message || 'Gagal menyetujui pinjaman via atomic RPC');
            }
          } else if (data) {
            const responseData = data as ApproveLoanRpcResponse;
            if (responseData.success === false) {
              throw new Error(responseData.message || 'Persetujuan pinjaman ditolak');
            }
            return {
              id: responseData.id || loanId,
              member_id: responseData.member_id || '',
              notes: '',
              amount: Number(responseData.amount || 0),
              tenor: Number(responseData.tenor || 0),
              monthly_target: Number(responseData.monthly_target || 0),
              status: 'approved',
              disbursed_at: responseData.disbursed_at || startDate,
              created_at: new Date().toISOString()
            } as Loan;
          }
        }
      } catch (err: any) {
        if (!err.message?.includes('Could not find the function') && err.code !== 'PGRST202' && err.code !== '42883') {
          throw err;
        }
      }
    }

    // Fallback: sequential client-side mutations (for environments without approve_loan_atomic RPC)
    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .update({
        status: 'approved',
        disbursed_at: startDate
      })
      .eq('id', loanId)
      .select()
      .single();

    if (loanError) throw new Error(loanError.message);

    // Auto-generate schedules
    const schedules = [];
    const start = new Date(startDate);
    for (let i = 1; i <= loan.tenor; i++) {
      const dueDate = new Date(start);
      const sm = start.getMonth();
      dueDate.setMonth(sm + i);
      if (dueDate.getMonth() !== (sm + i) % 12) dueDate.setDate(0);
      
      schedules.push({
        loan_id: loan.id,
        period_number: i,
        due_date: dueDate.toISOString().split('T')[0],
        target_amount: loan.monthly_target,
        paid_amount: 0,
        status: 'unpaid'
      });
    }

    const { error: scheduleError } = await supabase
      .from('loan_schedules')
      .insert(schedules);

    if (scheduleError) throw new Error(scheduleError.message);
    
    return loan as Loan;
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
            const isMissingFunction = error.code === 'PGRST202' || error.message?.includes('Could not find the function') || error.code === '42883';
            if (!isMissingFunction) {
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
        if (!err.message?.includes('Could not find the function') && err.code !== 'PGRST202' && err.code !== '42883') {
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
    const newStatus = isFullyPaid ? 'paid' : (newPaidTotal > 0 ? 'partial' : 'unpaid');

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

      const newLoanStatus = isAllPaid ? 'paid_off' : 'active';

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
        await supabase
          .from('loans')
          .update({
            status: isAllPaid ? 'completed' : 'active'
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
            const isMissingFunction = error.code === 'PGRST202' || error.message?.includes('Could not find the function') || error.code === '42883';
            if (!isMissingFunction) {
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
        if (!err.message?.includes('Could not find the function') && err.code !== 'PGRST202' && err.code !== '42883') {
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
      const newStatus = newPaidAmount >= Number(schedule.target_amount) ? 'paid' : 'partial';

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
    const newLoanStatus = isAllPaid ? 'paid_off' : 'active';

    const { error: loanUpdateErr } = await supabase
      .from('loans')
      .update({
        status: newLoanStatus,
        sisa_pinjaman: sisaPinjaman
      })
      .eq('id', loanId);

    if (loanUpdateErr) {
      await supabase
        .from('loans')
        .update({ status: isAllPaid ? 'completed' : 'active' })
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
  }
};

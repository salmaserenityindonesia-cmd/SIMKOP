import { supabase } from '../lib/supabaseClient';

export interface Loan {
  id: string;
  member_id: string;
  notes: string;
  amount: number;
  tenor: number;
  monthly_target: number;
  status: 'draft' | 'pending' | 'approved' | 'active' | 'rejected' | 'completed';
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

export const loanService = {
  async getPendingLoans() {
    const { data, error } = await supabase
      .from('loans')
      .select('*, anggota(nama, nrp)')
      .eq('status', 'draft')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
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

  async getMemberTHP(memberId: string): Promise<{ master_thp: number; active_installments: number; remaining_thp: number }> {
    // 1. Get member master_thp
    const { data: member, error: memberError } = await supabase
      .from('anggota')
      .select('master_thp')
      .eq('id', memberId)
      .single();

    if (memberError) throw new Error(memberError.message);
    const masterThp = member.master_thp || 0;

    // 2. Get active loans
    const { data: activeLoans, error: loansError } = await supabase
      .from('loans')
      .select('monthly_target')
      .eq('member_id', memberId)
      .in('status', ['approved', 'active']);

    if (loansError) throw new Error(loansError.message);

    const activeInstallments = activeLoans.reduce((sum, loan) => sum + Number(loan.monthly_target), 0);
    const remainingThp = masterThp - activeInstallments;

    return { master_thp: masterThp, active_installments: activeInstallments, remaining_thp: remainingThp };
  },

  async applyLoan(memberId: string, purpose: string, amount: number, tenor: number) {
    const monthlyTarget = amount / tenor;
    
    const { remaining_thp } = await this.getMemberTHP(memberId);
    if (remaining_thp - monthlyTarget < 1500000) {
      throw new Error(`Pengajuan ditolak: Sisa THP setelah potongan (Rp ${remaining_thp - monthlyTarget}) di bawah batas minimal Rp1.500.000.`);
    }

    // Fetch a default loan type to satisfy the NOT NULL constraint on loan_type_id
    const { data: loanTypes } = await supabase.from('loan_types').select('id').eq('is_active', true).limit(1);
    if (!loanTypes || loanTypes.length === 0) {
      throw new Error('Tidak ada Tipe Pinjaman (Loan Type) yang aktif di sistem.');
    }
    const loanTypeId = loanTypes[0].id;

    const { data, error } = await supabase
      .from('loans')
      .insert([{
        loan_number: `LOAN-${Date.now()}`,
        member_id: memberId,
        loan_type_id: loanTypeId,
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
      dueDate.setMonth(start.getMonth() + i);
      
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

  async makePayment(loanId: string, amountPaid: number, paymentMethod: string, notes?: string) {
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
      .select('status')
      .eq('loan_id', loanId);

    if (!allSchedulesError && allSchedules.every(s => s.status === 'paid')) {
      await supabase
        .from('loans')
        .update({ status: 'completed' })
        .eq('id', loanId);
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

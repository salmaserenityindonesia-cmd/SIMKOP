import { supabase } from '../lib/supabaseClient';

export interface LoanMatrixMonth {
  month: number;
  year?: number;
  dueDate?: string;
  status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'PROJECTED' | 'FINISHED' | 'NONE' | 'paid' | 'partial' | 'unpaid' | 'projection' | 'not_applicable';
  targetAmount: number;
  paidAmount: number;
  cumulativePaidAmount?: number;
  remainingBalance?: number;
  loanId?: string;
  loanNumber?: string;
  tenor?: number;
  periodNumber?: number;
}

export type MonthLoanCell = LoanMatrixMonth;

export interface LoanMatrixMember {
  id?: string; // loan.id (untuk key unik baris matriks)
  loanId?: string;
  loanNumber?: string;
  memberId: string;
  nrp: string;
  nama: string;
  pangkat?: string;
  loanTypeName?: string;
  agreedTenorMonths?: number;
  tenor?: number;
  monthlyTarget?: number;
  principalAmount?: number;
  disbursedAt?: string | null;
  isLoanActive: boolean;
  totalLoans: number;
  months: Record<number, LoanMatrixMonth>;
  complianceYTD: number;
  anggota?: { id: string; nrp: string; nama: string; pangkat?: string };
  loan_types?: { id: string; code: string; name: string };
}

export type LoanMatrixRow = LoanMatrixMember;

export interface LoanMatrixSummary {
  complianceYTD: number;
  totalCollectedYTD: number;
  projectedNextMonth: number;
  unpaidMembersCount: number;
  members: LoanMatrixMember[];
}

export const getLoanMatrix = async (year: number): Promise<LoanMatrixSummary> => {
  // First, get all schedules for the given year
  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;

  const { data: yearSchedules, error: yearError } = await supabase
    .from('loan_schedules')
    .select('loan_id')
    .gte('due_date', startOfYear)
    .lte('due_date', endOfYear);

  if (yearError) {
    console.error('Error fetching loan matrix schedules:', yearError);
    throw yearError;
  }

  const scheduleLoanIds = (yearSchedules || []).map(s => s.loan_id).filter(Boolean);
  let loanIds = Array.from(new Set(scheduleLoanIds));

  // Ambil juga pinjaman aktif/disetujui yang relevan jika tabel loans tersedia
  try {
    const loanQuery = supabase.from('loans')?.select('id');
    if (loanQuery && typeof loanQuery.in === 'function') {
      const { data: activeLoans } = await loanQuery.in('status', ['active', 'approved']);
      if (activeLoans && activeLoans.length > 0) {
        loanIds = Array.from(new Set([...loanIds, ...activeLoans.map((l: any) => l.id)]));
      }
    }
  } catch {
    // Graceful fallback jika tabel loans tidak distub pada lingkungan test
  }

  if (loanIds.length === 0) {
    return {
      complianceYTD: 100,
      totalCollectedYTD: 0,
      projectedNextMonth: 0,
      unpaidMembersCount: 0,
      members: []
    };
  }

  // Fetch ALL schedules for those loans so we can calculate running balance properly
  const { data: schedules, error: scheduleError } = await supabase
    .from('loan_schedules')
    .select(`
      id,
      period_number,
      due_date,
      target_amount,
      paid_amount,
      status,
      loan:loans (
        id,
        loan_number,
        member_id,
        principal_amount,
        tenor,
        agreed_tenor_months,
        monthly_target,
        planned_installment_amount,
        disbursed_at,
        status,
        loan_types ( id, code, name ),
        member:anggota (
          id,
          nrp,
          nama,
          pangkat
        )
      )
    `)
    .in('loan_id', loanIds)
    .order('due_date', { ascending: true });

  if (scheduleError) {
    console.error('Error fetching full loan matrix schedules:', scheduleError);
    throw scheduleError;
  }

  const currentMonth = new Date().getMonth() + 1; // 1-12
  const currentYear = new Date().getFullYear();

  // Model baris matriks berbasis loan.id (1 Baris = 1 Pinjaman Aktif/Berjalan)
  const loansMap: Record<string, LoanMatrixMember> = {};

  let totalTargetYTD = 0;
  let totalCollectedYTD = 0;
  let projectedNextMonth = 0;
  const unpaidMembersSet = new Set<string>();
  
  // To track running balance per loan
  const loanBalances: Record<string, number> = {};
  const loanCumulativePaid: Record<string, number> = {};

  (schedules || []).forEach((sched: any) => {
    const loan = sched.loan;
    if (!loan) return;
    const member = loan.member || loan.anggota;
    if (!member) return;

    const dueDate = new Date(sched.due_date);
    const month = dueDate.getMonth() + 1;
    const scheduleYear = dueDate.getFullYear();

    // Initialize running balance for this loan if not exists
    // Expected total is tenor * monthly_target (or fallback to principal_amount)
    if (loanBalances[loan.id] === undefined) {
      const expectedTotal = (Number(loan.tenor) || 0) * (Number(loan.monthly_target || loan.planned_installment_amount) || 0);
      loanBalances[loan.id] = expectedTotal > 0 ? expectedTotal : Number(loan.principal_amount || loan.amount || 0);
    }
    
    // Decrease the remaining balance by what has been paid in this schedule
    loanBalances[loan.id] -= Number(sched.paid_amount);

    if (loanCumulativePaid[loan.id] === undefined) {
      loanCumulativePaid[loan.id] = 0;
    }
    loanCumulativePaid[loan.id] += Number(sched.paid_amount || 0);

    const loanType = loan.loan_types || loan.loanType || loan.loan_type;

    if (!loansMap[loan.id]) {
      const isLoanActive = loan.status === 'active' || loan.status === 'approved';
      loansMap[loan.id] = {
        id: loan.id,
        loanId: loan.id,
        loanNumber: loan.loan_number || '',
        memberId: member.id,
        nrp: member.nrp,
        nama: member.nama,
        pangkat: member.pangkat || loan.pangkat || '',
        loanTypeName: loanType?.name || loan.loanTypeName || '',
        agreedTenorMonths: Number(loan.agreed_tenor_months || loan.tenor || 0),
        tenor: Number(loan.tenor || 0),
        monthlyTarget: Number(loan.monthly_target || loan.planned_installment_amount || 0),
        principalAmount: Number(loan.principal_amount || loan.amount || 0),
        disbursedAt: loan.disbursed_at || null,
        isLoanActive,
        totalLoans: 1,
        months: {},
        complianceYTD: 0,
        anggota: member,
        loan_types: loanType,
      };
      
      // Initialize all 12 months with NONE
      for (let i = 1; i <= 12; i++) {
        loansMap[loan.id].months[i] = {
          month: i,
          year: year,
          status: 'NONE',
          targetAmount: 0,
          paidAmount: 0,
          loanId: loan.id,
          loanNumber: loan.loan_number,
          tenor: loan.tenor,
        };
      }
    } else {
      if (loan.status === 'active' || loan.status === 'approved') {
        loansMap[loan.id].isLoanActive = true;
      }
    }

    // ONLY populate matrix cell and YTD stats if the schedule is in the requested matrix year
    if (scheduleYear === year) {
      // Determine cell status
      let cellStatus: LoanMatrixMonth['status'] = 'NONE';
      
      if (scheduleYear > currentYear || (scheduleYear === currentYear && month > currentMonth)) {
        // Future month
        if (Number(sched.paid_amount) >= Number(sched.target_amount) && Number(sched.target_amount) > 0) {
          cellStatus = 'PAID';
          totalTargetYTD += Number(sched.target_amount);
          totalCollectedYTD += Number(sched.paid_amount);
        } else if (Number(sched.paid_amount) > 0) {
          cellStatus = 'PARTIAL';
          totalTargetYTD += Number(sched.target_amount);
          totalCollectedYTD += Number(sched.paid_amount);
        } else {
          cellStatus = 'PROJECTED';
          if (month === currentMonth + 1 && scheduleYear === currentYear) {
            projectedNextMonth += Number(sched.target_amount);
          }
        }
      } else {
        // Past or current month
        totalTargetYTD += Number(sched.target_amount);
        totalCollectedYTD += Number(sched.paid_amount);
        
        if (Number(sched.paid_amount) >= Number(sched.target_amount)) {
          cellStatus = 'PAID';
        } else if (Number(sched.paid_amount) > 0) {
          cellStatus = 'PARTIAL';
        } else {
          cellStatus = 'UNPAID';
          if (month === currentMonth && scheduleYear === currentYear) {
             unpaidMembersSet.add(member.id);
          }
        }
      }

      // If the loan is completed/finished, the status can reflect it
      if (loan.status === 'completed' && cellStatus === 'PAID') {
        cellStatus = 'FINISHED';
      }

      loansMap[loan.id].months[month] = {
        month,
        year: scheduleYear,
        dueDate: sched.due_date,
        status: cellStatus,
        targetAmount: Number(sched.target_amount),
        paidAmount: Number(sched.paid_amount),
        cumulativePaidAmount: loanCumulativePaid[loan.id],
        remainingBalance: Math.max(0, loanBalances[loan.id]), // Ensure it doesn't go below 0 visually
        loanId: loan.id,
        loanNumber: loan.loan_number,
        tenor: loan.tenor,
        periodNumber: sched.period_number
      };
    }
  });

  // Hitung jumlah pinjaman per anggota
  const memberLoanCounts: Record<string, number> = {};
  Object.values(loansMap).forEach(row => {
    memberLoanCounts[row.memberId] = (memberLoanCounts[row.memberId] || 0) + 1;
  });
  Object.values(loansMap).forEach(row => {
    row.totalLoans = memberLoanCounts[row.memberId] || 1;
  });

  // Calculate compliance per loan and handle FINISHED logic
  Object.values(loansMap).forEach(row => {
    let loanTarget = 0;
    let loanPaid = 0;
    let lastActiveMonth = 0;

    for (let i = 1; i <= 12; i++) {
      const m = row.months[i];
      if (m.status === 'PAID' || m.status === 'PARTIAL' || m.status === 'UNPAID') {
        loanTarget += m.targetAmount;
        loanPaid += m.paidAmount;
        lastActiveMonth = i;
      }
    }

    row.complianceYTD = loanTarget > 0 ? (loanPaid / loanTarget) * 100 : 100;

    // Apply finished status for months after the last active month if loan is fully paid
    if (!row.isLoanActive && lastActiveMonth > 0) {
       for(let i = lastActiveMonth + 1; i <= 12; i++) {
           row.months[i].status = 'FINISHED';
       }
    }
  });

  const overallComplianceYTD = totalTargetYTD > 0 ? (totalCollectedYTD / totalTargetYTD) * 100 : 100;

  return {
    complianceYTD: overallComplianceYTD,
    totalCollectedYTD,
    projectedNextMonth,
    unpaidMembersCount: unpaidMembersSet.size,
    members: Object.values(loansMap)
  };
};

export const getCumulativePaidUpToMonth = (
  member: LoanMatrixMember,
  targetMonth: number,
  targetYear?: number
): number => {
  if (!member || !member.months) return 0;
  const targetCell = member.months[targetMonth];
  if (targetCell?.cumulativePaidAmount !== undefined) {
    return targetCell.cumulativePaidAmount;
  }
  // Fallback: jumlahkan paidAmount dari bulan 1 sampai targetMonth untuk loanId yang sama
  let total = 0;
  const targetLoanId = targetCell?.loanId;
  for (let m = 1; m <= targetMonth; m++) {
    const cell = member.months[m];
    if (cell && (!targetLoanId || cell.loanId === targetLoanId)) {
      total += Number(cell.paidAmount || 0);
    }
  }
  return total;
};

export const getLoanMatrixAvailableYears = async (): Promise<number[]> => {
  const currentYear = new Date().getFullYear();
  try {
    let startYear = currentYear;
    let endYear = currentYear;

    const { data: oldestActiveLoan, error: oldestError } = await supabase
      .from('loans')
      .select('disbursed_at, created_at')
      .in('status', ['active', 'approved'])
      .order('disbursed_at', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (oldestError) {
      console.error('Error fetching oldest active loan:', oldestError);
      return [currentYear];
    }

    if (oldestActiveLoan) {
      const loanDateStr = oldestActiveLoan.disbursed_at || oldestActiveLoan.created_at;
      if (loanDateStr) {
        const parsedYear = new Date(loanDateStr).getFullYear();
        if (!isNaN(parsedYear) && parsedYear <= currentYear) {
          startYear = parsedYear;
        }
      }
    }

    const { data: latestSchedule, error: scheduleError } = await supabase
      .from('loan_schedules')
      .select('due_date')
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scheduleError) {
      console.error('Error fetching latest loan schedule:', scheduleError);
      return [currentYear];
    }

    if (latestSchedule?.due_date) {
      const scheduleYear = new Date(latestSchedule.due_date).getFullYear();
      if (!isNaN(scheduleYear) && scheduleYear > currentYear) {
        endYear = scheduleYear;
      }
    }

    const years: number[] = [];
    for (let y = endYear; y >= startYear; y--) {
      years.push(y);
    }

    return years.length > 0 ? years : [currentYear];
  } catch (err) {
    console.error('Error fetching available loan matrix years:', err);
    return [currentYear];
  }
};

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'
];

export interface LoanGridPeriod {
  id: string;
  loanId: string;
  periodNumber: number;
  dueDate: string;
  targetAmount: number;
  paidAmount: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'PROJECTED';
  label: string; // e.g. "Bulan 1 [Jul-26]"
  isCurrentMonth: boolean;
  repayments: Array<{
    id: string;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: string;
    notes: string | null;
    receiptNumber?: string | null;
  }>;
}

export interface LoanInteractiveGridSummary {
  loanId: string;
  loanNumber: string;
  memberId: string;
  memberName: string;
  memberNrp: string;
  principalAmount: number;
  tenor: number;
  monthlyTarget: number;
  disbursedAt: string | null;
  totalPaid: number;
  sisaPinjaman: number;
  isBalanced: boolean;
  periods: LoanGridPeriod[];
  notes?: string | null;
  sisa_pinjaman?: number;
  jumlah_terangsur?: number;
}

export const getLoanInteractiveGrid = async (loanId: string): Promise<LoanInteractiveGridSummary> => {
  const { data: loan, error: loanErr } = await supabase
    .from('loans')
    .select(`
      id,
      loan_number,
      principal_amount,
      amount,
      tenor,
      monthly_target,
      disbursed_at,
      status,
      notes,
      member:anggota (
        id,
        nama,
        nrp
      )
    `)
    .eq('id', loanId)
    .single();

  if (loanErr || !loan) {
    console.error('Error fetching loan for interactive grid:', loanErr);
    throw loanErr || new Error(`Pinjaman dengan ID ${loanId} tidak ditemukan`);
  }

  const { data: schedules, error: schedErr } = await supabase
    .from('loan_schedules')
    .select('*')
    .eq('loan_id', loanId)
    .order('period_number', { ascending: true });

  if (schedErr) {
    console.error('Error fetching schedules for interactive grid:', schedErr);
    throw schedErr;
  }

  const { data: repayments, error: repayErr } = await supabase
    .from('loan_repayments')
    .select('*')
    .eq('loan_id', loanId)
    .order('payment_date', { ascending: true });

  if (repayErr) {
    console.error('Error fetching repayments for interactive grid:', repayErr);
    throw repayErr;
  }

  const principalAmount = Number(loan.principal_amount || loan.amount || 0);
  const tenor = Number(loan.tenor || 0);
  const monthlyTarget = Number(loan.monthly_target || 0);

  const totalPaidFromRepayments = (repayments || []).reduce(
    (sum: number, r: any) => sum + Number(r.amount_paid || 0),
    0
  );
  const totalPaidFromSchedules = (schedules || []).reduce(
    (sum: number, s: any) => sum + Number(s.paid_amount || 0),
    0
  );
  const totalPaid = Math.max(totalPaidFromRepayments, totalPaidFromSchedules);

  const sisaPinjaman = Math.max(0, principalAmount - totalPaid);
  const isBalanced = totalPaid >= principalAmount;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const periods: LoanGridPeriod[] = (schedules || []).map((sched: any) => {
    const d = new Date(sched.due_date);
    const sYear = d.getFullYear();
    const sMonth = d.getMonth() + 1;
    const isCurrentMonth = sYear === currentYear && sMonth === currentMonth;

    const targetAmount = Math.round(Number(sched.target_amount || 0));
    const paidAmount = Math.round(Number(sched.paid_amount || 0));

    let status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'PROJECTED';
    const isSettled = sched.status === 'paid' ||
      (paidAmount >= targetAmount && targetAmount > 0) ||
      (targetAmount > 0 && Math.abs(targetAmount - paidAmount) <= 5);

    if (isSettled) {
      status = 'PAID';
    } else if (paidAmount > 0) {
      status = 'PARTIAL';
    } else if (sched.due_date > todayStr) {
      status = 'PROJECTED';
    } else {
      status = 'UNPAID';
    }

    const monthName = MONTH_NAMES[sMonth - 1] || 'Bln';
    const yearShort = String(sYear).slice(-2);
    const label = `Bulan ${sched.period_number} [${monthName}-${yearShort}]`;

    const schedRepayments = (repayments || [])
      .filter((r: any) => r.schedule_id === sched.id)
      .map((r: any) => ({
        id: r.id,
        amountPaid: Number(r.amount_paid || 0),
        paymentDate: r.payment_date,
        paymentMethod: r.payment_method || 'transfer',
        notes: r.notes || null,
        receiptNumber: r.receipt_number || null
      }));

    return {
      id: sched.id,
      loanId: sched.loan_id,
      periodNumber: Number(sched.period_number),
      dueDate: sched.due_date,
      targetAmount,
      paidAmount,
      status,
      label,
      isCurrentMonth,
      repayments: schedRepayments
    };
  });

  const member = loan.member as any;

  return {
    loanId: loan.id,
    loanNumber: loan.loan_number || '',
    memberId: member?.id || '',
    memberName: member?.nama || '',
    memberNrp: member?.nrp || '',
    principalAmount,
    tenor,
    monthlyTarget,
    disbursedAt: loan.disbursed_at || null,
    totalPaid,
    sisaPinjaman,
    isBalanced,
    periods,
    notes: loan.notes || null,
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

export const toggleLoanSchedulePaid = async (
  scheduleId: string,
  paid: boolean,
  payload?: {
    amount?: number;
    receiptNo?: string;
    notes?: string;
    paymentMethod?: string;
  }
): Promise<void> => {
  const { data: schedule, error: schedErr } = await supabase
    .from('loan_schedules')
    .select('*, loan:loans(id, status, principal_amount, amount)')
    .eq('id', scheduleId)
    .single();

  if (schedErr || !schedule) {
    console.error('Error fetching schedule to toggle:', schedErr);
    throw schedErr || new Error(`Jadwal pinjaman ${scheduleId} tidak ditemukan`);
  }

  const loanId = schedule.loan_id;

  if (paid) {
    const rawPayAmount = payload?.amount !== undefined ? payload.amount : Number(schedule.target_amount || 0);
    const payAmount = Math.round(Number(rawPayAmount));
    const notesDetail = [
      payload?.receiptNo ? `Kwitansi: ${payload.receiptNo}` : '',
      payload?.notes || ''
    ].filter(Boolean).join(' - ') || 'Pelunasan Angsuran Pinjaman';

    const { error: repayErr } = await supabase.from('loan_repayments').insert({
      loan_id: loanId,
      schedule_id: scheduleId,
      amount_paid: payAmount,
      payment_date: new Date().toISOString(),
      payment_method: payload?.paymentMethod || 'transfer',
      notes: notesDetail,
      receipt_number: payload?.receiptNo?.trim() || undefined
    });

    if (repayErr) {
      console.error('Error inserting loan repayment:', repayErr);
      throw repayErr;
    }

    const currentPaid = Math.round(Number(schedule.paid_amount || 0));
    const newPaid = currentPaid + payAmount;
    const target = Math.round(Number(schedule.target_amount || 0));
    // Beri toleransi pembulatan +/- 5 Rupiah untuk pelunasan akhir
    const isFullyPaid = (newPaid >= target) || (Math.abs(target - newPaid) <= 5);
    const newPaidAmount = isFullyPaid ? target : newPaid;
    const newStatus = isFullyPaid ? 'paid' : (newPaidAmount > 0 ? 'partial' : 'unpaid');

    const { error: updateSchedErr } = await supabase
      .from('loan_schedules')
      .update({
        paid_amount: newPaidAmount,
        status: newStatus
      })
      .eq('id', scheduleId);

    if (updateSchedErr) {
      console.error('Error updating loan schedule:', updateSchedErr);
      throw updateSchedErr;
    }

    // Check if all schedules for this loan are now paid
    const { data: allSchedules } = await supabase
      .from('loan_schedules')
      .select('id, status, paid_amount, target_amount')
      .eq('loan_id', loanId);

    const allPaid = (allSchedules || []).length > 0 && (allSchedules || []).every((s: any) =>
      s.id === scheduleId
        ? (newStatus === 'paid')
        : (s.status === 'paid' || Math.round(Number(s.paid_amount)) >= Math.round(Number(s.target_amount)) || Math.abs(Math.round(Number(s.target_amount || 0)) - Math.round(Number(s.paid_amount || 0))) <= 5)
    );

    if (allPaid) {
      await supabase.from('loans').update({ status: 'completed' }).eq('id', loanId);
    }
  } else {
    // Uncheck / cancel payment
    const { error: deleteRepayErr } = await supabase
      .from('loan_repayments')
      .delete()
      .eq('schedule_id', scheduleId);

    if (deleteRepayErr) {
      console.error('Error deleting loan repayment:', deleteRepayErr);
      throw deleteRepayErr;
    }

    const { error: resetSchedErr } = await supabase
      .from('loan_schedules')
      .update({
        paid_amount: 0,
        status: 'unpaid'
      })
      .eq('id', scheduleId);

    if (resetSchedErr) {
      console.error('Error resetting loan schedule:', resetSchedErr);
      throw resetSchedErr;
    }

    // Check loan status to revert if completed
    let isCompleted = schedule.loan?.status === 'completed';
    if (!schedule.loan) {
      const { data: currentLoan } = await supabase.from('loans').select('status').eq('id', loanId).single();
      isCompleted = currentLoan?.status === 'completed';
    }

    if (isCompleted) {
      await supabase.from('loans').update({ status: 'active' }).eq('id', loanId);
    }
  }
};

export const autoReconcileLoanInstallments = async (
  loanId: string,
  totalPaidAvailable: number
): Promise<{ success: boolean; message: string; reconciledCount: number; remainingAmount: number }> => {
  const { data: schedules, error: schedErr } = await supabase
    .from('loan_schedules')
    .select('*')
    .eq('loan_id', loanId)
    .order('period_number', { ascending: true });

  if (schedErr || !schedules) {
    console.error('Error fetching schedules for reconcile:', schedErr);
    throw schedErr || new Error('Gagal memuat jadwal angsuran');
  }

  // Delete existing repayments for this loan
  const { error: delErr } = await supabase
    .from('loan_repayments')
    .delete()
    .eq('loan_id', loanId);

  if (delErr) {
    console.error('Error deleting existing loan repayments for reconcile:', delErr);
    throw delErr;
  }

  let remaining = Math.round(Math.max(0, Number(totalPaidAvailable) || 0));
  const repaymentsToInsert: any[] = [];
  const scheduleUpdates: Array<{ id: string; paid_amount: number; status: string }> = [];

  for (const sched of (schedules || [])) {
    const target = Math.round(Number(sched.target_amount || 0));
    if (remaining <= 0) {
      scheduleUpdates.push({ id: sched.id, paid_amount: 0, status: 'unpaid' });
    } else if (remaining >= target) {
      remaining -= target;
      scheduleUpdates.push({ id: sched.id, paid_amount: target, status: 'paid' });
      repaymentsToInsert.push({
        loan_id: loanId,
        schedule_id: sched.id,
        amount_paid: target,
        payment_date: new Date().toISOString(),
        payment_method: 'REKONSILIASI_IMPOR',
        notes: `Pelunasan Otomatis Angsuran Bulan ke-${sched.period_number}`
      });
    } else {
      const partialAmount = remaining;
      remaining = 0;
      scheduleUpdates.push({ id: sched.id, paid_amount: partialAmount, status: 'partial' });
      repaymentsToInsert.push({
        loan_id: loanId,
        schedule_id: sched.id,
        amount_paid: partialAmount,
        payment_date: new Date().toISOString(),
        payment_method: 'REKONSILIASI_IMPOR',
        notes: `Pelunasan Parsial Angsuran Bulan ke-${sched.period_number}`
      });
    }
  }

  for (const update of scheduleUpdates) {
    await supabase
      .from('loan_schedules')
      .update({ paid_amount: update.paid_amount, status: update.status })
      .eq('id', update.id);
  }

  if (repaymentsToInsert.length > 0) {
    const { error: insErr } = await supabase.from('loan_repayments').insert(repaymentsToInsert);
    if (insErr) {
      console.error('Error inserting repayments for reconcile:', insErr);
      throw insErr;
    }
  }

  const allPaid = scheduleUpdates.length > 0 && scheduleUpdates.every(s => s.status === 'paid');
  await supabase.from('loans').update({ status: allPaid ? 'completed' : 'active' }).eq('id', loanId);

  return {
    success: true,
    message: 'Alokasi angsuran berhasil dicocokkan otomatis.',
    reconciledCount: scheduleUpdates.filter(s => s.status === 'paid').length,
    remainingAmount: remaining
  };
};

export const checkAllLoanUpToCurrentMonth = async (
  loanId: string
): Promise<{ checkedCount: number }> => {
  const now = new Date();
  const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const endOfCurrentMonthStr = `${endOfCurrentMonth.getFullYear()}-${String(endOfCurrentMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfCurrentMonth.getDate()).padStart(2, '0')}`;

  const { data: schedules, error: schedErr } = await supabase
    .from('loan_schedules')
    .select('*')
    .eq('loan_id', loanId)
    .order('period_number', { ascending: true });

  if (schedErr) {
    console.error('Error fetching schedules for checkAllLoanUpToCurrentMonth:', schedErr);
    throw schedErr;
  }

  let checkedCount = 0;
  const targetSchedules = (schedules || []).filter((s: any) => s.due_date <= endOfCurrentMonthStr);

  for (const sched of targetSchedules) {
    const targetAmount = Number(sched.target_amount || 0);
    const paidAmount = Number(sched.paid_amount || 0);

    if (sched.status !== 'paid' || paidAmount < targetAmount) {
      await supabase.from('loan_repayments').delete().eq('schedule_id', sched.id);

      await supabase.from('loan_repayments').insert({
        loan_id: loanId,
        schedule_id: sched.id,
        amount_paid: targetAmount,
        payment_date: new Date().toISOString(),
        payment_method: 'POTONG_GAJI',
        notes: `Pelunasan Otomatis Angsuran Periode ${sched.period_number} (s/d Bulan Berjalan)`
      });

      await supabase
        .from('loan_schedules')
        .update({
          paid_amount: targetAmount,
          status: 'paid'
        })
        .eq('id', sched.id);

      checkedCount++;
    }
  }

  // Check if all schedules for this loan are now paid
  const { data: allSchedules } = await supabase
    .from('loan_schedules')
    .select('status, paid_amount, target_amount')
    .eq('loan_id', loanId);

  const allPaid = (allSchedules || []).length > 0 && (allSchedules || []).every(
    (s: any) => s.status === 'paid' || Number(s.paid_amount) >= Number(s.target_amount)
  );

  if (allPaid) {
    await supabase.from('loans').update({ status: 'completed' }).eq('id', loanId);
  }

  return { checkedCount };
};

export const uncheckAllLoanSchedules = async (loanId: string): Promise<void> => {
  const { error: delErr } = await supabase
    .from('loan_repayments')
    .delete()
    .eq('loan_id', loanId);

  if (delErr) {
    console.error('Error deleting loan repayments:', delErr);
    throw delErr;
  }

  const { error: updErr } = await supabase
    .from('loan_schedules')
    .update({
      paid_amount: 0,
      status: 'unpaid'
    })
    .eq('loan_id', loanId);

  if (updErr) {
    console.error('Error resetting loan schedules:', updErr);
    throw updErr;
  }

  const { error: loanErr } = await supabase
    .from('loans')
    .update({ status: 'active' })
    .eq('id', loanId);

  if (loanErr) {
    console.error('Error resetting loan status:', loanErr);
    throw loanErr;
  }
};

/**
 * Dapatkan saldo terangsur awal / baseline dari data pinjaman (impor Excel / riil)
 */
export const getImportedRepaidBalance = (loan: any): number => {
  if (!loan) return 0;
  if (loan.jumlah_terangsur && Number(loan.jumlah_terangsur) > 0) {
    return Number(loan.jumlah_terangsur);
  }
  const principal = Number(loan.principal_amount || loan.amount || loan.principalAmount || 0);
  let sisa: number | null = null;
  if (loan.sisa_pinjaman !== undefined && loan.sisa_pinjaman !== null) {
    sisa = Number(loan.sisa_pinjaman);
  } else if (loan.sisaPinjaman !== undefined && loan.sisaPinjaman !== null) {
    sisa = Number(loan.sisaPinjaman);
  } else if (loan.notes && typeof loan.notes === 'string') {
    const match = loan.notes.match(/Sisa:\s*Rp\s*([\d\.,]+)/i);
    if (match && match[1]) {
      const parsed = Number(match[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(parsed)) {
        sisa = parsed;
      }
    }
  }

  if (sisa !== null && !isNaN(sisa)) {
    return Math.max(0, principal - sisa);
  }

  if (loan.totalPaid && Number(loan.totalPaid) > 0) {
    return Number(loan.totalPaid);
  }

  return 0;
};

export interface BulkLoanProgress {
  processed: number;
  total: number;
  currentMemberName?: string;
  currentLoanNumber?: string;
}

export interface BulkLoanResult {
  totalLoans: number;
  totalSuccess: number;
  totalFailed: number;
  successCount: number;
  failCount: number;
  errors?: Array<{ loanId: string; error: string }>;
  errorMessages?: string[];
}

/**
 * Menjalankan centang lunas massal s/d bulan ini untuk seluruh pinjaman aktif
 */
export const bulkCheckAllLoansUpToCurrentMonth = async (
  onProgress?: (progress: BulkLoanProgress) => void
): Promise<BulkLoanResult> => {
  // 1. Tentukan tanggal acuan jatuh tempo bulan berjalan
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const cutoffDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
  const cutoffDateIso = cutoffDate.toISOString();
  const cutoffDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(new Date(currentYear, currentMonth, 0).getDate()).padStart(2, '0')}`;

  // 2. Ambil seluruh data pinjaman aktif yang masih berjalan (status IN ('active', 'approved'))
  let query: any = supabase
    .from('loans')
    .select(`
      id,
      member_id,
      loan_number,
      principal_amount,
      monthly_target,
      status,
      member:anggota (
        id,
        nrp,
        nama
      )
    `);

  if (typeof query.in === 'function') {
    query = query.in('status', ['active', 'approved']);
  }

  const { data: activeLoans, error: loanErr } = await query;

  if (loanErr || !activeLoans) {
    console.error('Error fetching loans for bulkCheckAllLoansUpToCurrentMonth:', loanErr);
    throw loanErr || new Error('Gagal memuat pinjaman aktif');
  }

  // 3. Ambil user ID admin aktif dari supabase.auth.getUser() untuk mengisi kolom created_by
  let currentUserId: string | null = null;
  try {
    if (supabase?.auth && typeof supabase.auth.getUser === 'function') {
      const { data: userData } = await supabase.auth.getUser();
      currentUserId = userData?.user?.id || null;
    }
  } catch (authErr) {
    console.warn('Could not retrieve current user for bulk loan check:', authErr);
  }

  // 4. Eksekusi pemrosesan secara bertahap (batch loop per pinjaman)
  const loanList = activeLoans || [];
  const total = loanList.length;
  let successCount = 0;
  let failCount = 0;
  const errors: Array<{ loanId: string; error: string }> = [];
  const errorMessages: string[] = [];

  for (let i = 0; i < total; i++) {
    const loan = loanList[i];
    const memberName = (loan.member as any)?.nama || `Pinjaman ${loan.loan_number || loan.id}`;

    if (onProgress) {
      onProgress({
        processed: i + 1,
        total,
        currentMemberName: memberName,
        currentLoanNumber: loan.loan_number || undefined,
      });
    }

    try {
      let schedQuery: any = supabase
        .from('loan_schedules')
        .select('*')
        .eq('loan_id', loan.id);

      if (typeof schedQuery.order === 'function') {
        schedQuery = schedQuery.order('period_number', { ascending: true });
      }

      const { data: schedules, error: schedErr } = await schedQuery;
      if (schedErr) throw schedErr;

      const targetSchedules = (schedules || []).filter((s: any) => {
        if (!s.due_date) return false;
        const isDue = s.due_date <= cutoffDateStr || s.due_date <= cutoffDateIso;
        const target = Number(s.target_amount || 0);
        const paid = Number(s.paid_amount || 0);
        const isUnpaid = s.status !== 'paid' || paid < target;
        return isDue && isUnpaid;
      });

      const repaymentsToInsert: any[] = [];

      for (const sched of targetSchedules) {
        const targetAmount = Number(sched.target_amount || 0);
        const paidAmount = Number(sched.paid_amount || 0);
        const remainingAmount = targetAmount - paidAmount;

        const { error: updErr } = await supabase
          .from('loan_schedules')
          .update({
            paid_amount: targetAmount,
            status: 'paid',
          })
          .eq('id', sched.id);

        if (updErr) throw updErr;

        if (remainingAmount > 0) {
          repaymentsToInsert.push({
            loan_id: loan.id,
            schedule_id: sched.id,
            amount_paid: remainingAmount,
            payment_method: 'POTONG_GAJI',
            payment_date: new Date().toISOString(),
            receipt_number: `KW-BULK-${loan.loan_number || loan.id}-B${sched.period_number}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            notes: `Centang Massal Angsuran s/d Bulan ${currentMonth}/${currentYear}`,
            created_by: currentUserId || null,
            created_at: new Date().toISOString(),
          });
        }
      }

      // Simpan mutasi loan_repayments dalam chunk maksimal 50 baris per panggilan HTTP
      if (repaymentsToInsert.length > 0) {
        const CHUNK_SIZE = 50;
        for (let c = 0; c < repaymentsToInsert.length; c += CHUNK_SIZE) {
          const chunk = repaymentsToInsert.slice(c, c + CHUNK_SIZE);
          let { error: insErr } = await supabase.from('loan_repayments').insert(chunk);
          if (insErr) {
            // Fallback if schema lacks extended fields (receipt_number, created_by, created_at)
            const fallbackChunk = chunk.map((r: any) => ({
              loan_id: r.loan_id,
              schedule_id: r.schedule_id,
              amount_paid: r.amount_paid,
              payment_method: r.payment_method,
              payment_date: r.payment_date,
              notes: r.notes,
            }));
            const { error: retryErr } = await supabase.from('loan_repayments').insert(fallbackChunk);
            if (retryErr) throw retryErr;
          }
        }
      }

      // Check if all schedules for this loan are now paid
      let allSchedQuery: any = supabase
        .from('loan_schedules')
        .select('status, paid_amount, target_amount')
        .eq('loan_id', loan.id);

      if (typeof allSchedQuery?.order === 'function') {
        allSchedQuery = allSchedQuery.order('period_number', { ascending: true });
      }

      const { data: allSchedules } = await allSchedQuery;
      const allPaid = (allSchedules || []).length > 0 && (allSchedules || []).every(
        (s: any) => s.status === 'paid' || Number(s.paid_amount) >= Number(s.target_amount)
      );

      if (allPaid) {
        await supabase.from('loans').update({ status: 'completed' }).eq('id', loan.id);
      }

      successCount++;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error(`Error checking loan ${loan.id}:`, err);
      failCount++;
      errors.push({ loanId: loan.id, error: errorMsg });
      errorMessages.push(`Pinjaman ${loan.loan_number || loan.id} (${memberName}): ${errorMsg}`);
    }
  }

  return {
    totalLoans: total,
    totalSuccess: successCount,
    totalFailed: failCount,
    successCount,
    failCount,
    errors,
    errorMessages,
  };
};

/**
 * Menjalankan rekonsiliasi otomatis saldo terangsur (FIFO) massal untuk seluruh pinjaman aktif
 */
export async function bulkAutoReconcileLoans(
  onProgress?: ((current: number, total: number, loanNumber: string, progressObj?: BulkLoanProgress) => void) | ((progress: BulkLoanProgress) => void)
): Promise<{
  totalLoans: number;
  totalSuccess: number;
  totalFailed: number;
  successCount: number;
  failCount: number;
  errors: string[];
  errorMessages: string[];
}> {
  // 1. Ambil seluruh data pinjaman aktif
  let loanQuery: any = supabase
    .from('loans')
    .select(`
      id,
      loan_number,
      principal_amount,
      amount,
      notes,
      status,
      member:anggota (
        id,
        nrp,
        nama
      )
    `);

  if (typeof loanQuery.in === 'function') {
    loanQuery = loanQuery.in('status', ['active', 'approved']);
  }

  const { data: loans, error: loanErr } = await loanQuery;

  if (loanErr || !loans) {
    throw new Error(loanErr?.message || 'Gagal mengambil data pinjaman aktif');
  }

  let totalSuccess = 0;
  let totalFailed = 0;
  const errors: string[] = [];

  // 2. Iterasi per pinjaman secara sekuensial (aman dari lock & payload overflow)
  for (let i = 0; i < loans.length; i++) {
    const loan = loans[i];
    const memberName = (loan.member as any)?.nama || `Pinjaman ${loan.loan_number || loan.id}`;
    const loanNumber = loan.loan_number || loan.id;

    if (onProgress) {
      const progressObj: BulkLoanProgress = {
        processed: i + 1,
        total: loans.length,
        currentMemberName: memberName,
        currentLoanNumber: loan.loan_number || undefined,
      };

      try {
        if (typeof onProgress === 'function') {
          if (onProgress.length === 1) {
            (onProgress as any)(progressObj);
          } else {
            (onProgress as any)(i + 1, loans.length, loanNumber, progressObj);
          }
        }
      } catch (progErr) {
        console.warn('Progress callback error:', progErr);
      }
    }

    try {
      // Hitung saldo acuan terangsur hasil migrasi/impor
      let repaidAvailable = getImportedRepaidBalance(loan);

      // Ambil jadwal angsuran pinjaman terurut berdasarkan periode
      let schQuery: any = supabase
        .from('loan_schedules')
        .select('*');
      if (typeof schQuery.eq === 'function') {
        schQuery = schQuery.eq('loan_id', loan.id);
      }
      if (schQuery && typeof schQuery.order === 'function') {
        schQuery = schQuery.order('period_number', { ascending: true });
      }

      const { data: schedules, error: schErr } = await schQuery;

      if (schErr || !schedules) {
        throw new Error(`Gagal memuat jadwal untuk ${loan.loan_number || loan.id}: ${schErr?.message}`);
      }

      // Jika saldo dari catatan impor 0, gunakan akumulasi paid_amount dari jadwal jika ada
      if (repaidAvailable === 0 && schedules.length > 0) {
        const schedulePaid = schedules.reduce((acc: number, s: any) => acc + Number(s.paid_amount || 0), 0);
        if (schedulePaid > 0) {
          repaidAvailable = schedulePaid;
        }
      }

      // Bersihkan repayment lama bertipe rekonsiliasi
      let delQuery: any = supabase
        .from('loan_repayments')
        .delete();
      if (typeof delQuery.eq === 'function') {
        delQuery = delQuery.eq('loan_id', loan.id);
      }
      if (delQuery && typeof delQuery.or === 'function') {
        await delQuery.or('payment_method.eq.REKONSILIASI_IMPOR,notes.ilike.%otomatis%');
      } else {
        await delQuery;
      }

      let remainingBalance = repaidAvailable;
      const repaymentsToInsert: any[] = [];
      const updatedStatuses: string[] = [];

      // Alokasi FIFO ke masing-masing jadwal
      for (const schedule of schedules) {
        const target = Math.round(Number(schedule.target_amount || 0));
        let paidForThisPeriod = 0;
        let scheduleStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';

        if (remainingBalance >= target && target > 0) {
          paidForThisPeriod = target;
          scheduleStatus = 'paid';
          remainingBalance -= target;
        } else if (remainingBalance > 0 && target > 0) {
          paidForThisPeriod = remainingBalance;
          scheduleStatus = 'partial';
          remainingBalance = 0;
        }

        updatedStatuses.push(scheduleStatus);

        // Update baris loan_schedules
        let updQuery: any = supabase
          .from('loan_schedules')
          .update({
            paid_amount: paidForThisPeriod,
            status: scheduleStatus,
          });
        if (typeof updQuery.eq === 'function') {
          await updQuery.eq('id', schedule.id);
        }

        if (paidForThisPeriod > 0) {
          repaymentsToInsert.push({
            loan_id: loan.id,
            schedule_id: schedule.id,
            amount_paid: paidForThisPeriod,
            payment_date: new Date().toISOString(),
            payment_method: 'REKONSILIASI_IMPOR',
            receipt_number: `KW-RECON-${loan.loan_number || loan.id}-B${schedule.period_number}`,
            notes: `Rekonsiliasi Otomatis Saldo Terangsur Bulan ke-${schedule.period_number}`,
            created_at: new Date().toISOString(),
          });
        }
      }

      // Chunk insert repayments jika ada
      if (repaymentsToInsert.length > 0) {
        const CHUNK = 50;
        for (let c = 0; c < repaymentsToInsert.length; c += CHUNK) {
          const chunk = repaymentsToInsert.slice(c, c + CHUNK);
          let { error: insErr } = await supabase.from('loan_repayments').insert(chunk);
          if (insErr) {
            // Fallback jika skema database tidak mendukung kolom tambahan
            const fallbackChunk = chunk.map((r: any) => ({
              loan_id: r.loan_id,
              schedule_id: r.schedule_id,
              amount_paid: r.amount_paid,
              payment_method: r.payment_method,
              payment_date: r.payment_date,
              notes: r.notes,
            }));
            const { error: retryErr } = await supabase.from('loan_repayments').insert(fallbackChunk);
            if (retryErr) throw retryErr;
          }
        }
      }

      // Update status pinjaman jika seluruh jadwal lunas
      const isAllPaid = schedules.length > 0 && updatedStatuses.every((st) => st === 'paid');
      let loanUpd: any = supabase
        .from('loans')
        .update({ status: isAllPaid ? 'completed' : 'active' });
      if (typeof loanUpd.eq === 'function') {
        await loanUpd.eq('id', loan.id);
      }

      totalSuccess++;
    } catch (err: any) {
      console.error(`Gagal mencocokkan pinjaman ${loan.loan_number || loan.id}:`, err);
      totalFailed++;
      errors.push(`${loan.loan_number || loan.id}: ${err?.message || 'Error tidak diketahui'}`);
    }
  }

  return {
    totalLoans: loans.length,
    totalSuccess,
    totalFailed,
    successCount: totalSuccess,
    failCount: totalFailed,
    errors,
    errorMessages: errors,
  };
}

export const bulkAutoReconcileLoansUpToImportedBalance = bulkAutoReconcileLoans;

export const bulkAutoReconcileAllLoans = async (
  onProgress?: (progress: BulkLoanProgress) => void
): Promise<BulkLoanResult> => {
  const res = await bulkAutoReconcileLoans(
    onProgress
      ? (current: number, total: number, loanNumber: string, progressObj?: BulkLoanProgress) => {
          onProgress(
            progressObj || {
              processed: current,
              total,
              currentLoanNumber: loanNumber,
            }
          );
        }
      : undefined
  );

  return {
    totalLoans: res.totalLoans,
    totalSuccess: res.totalSuccess,
    totalFailed: res.totalFailed,
    successCount: res.successCount,
    failCount: res.failCount,
    errors: res.errors.map((err) => {
      const parts = err.split(':');
      return { loanId: parts[0]?.trim() || '', error: parts.slice(1).join(':').trim() || err };
    }),
    errorMessages: res.errors,
  };
};



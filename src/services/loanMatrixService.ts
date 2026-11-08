import { supabase } from '../lib/supabaseClient';

export interface LoanMatrixMonth {
  month: number;
  year?: number;
  dueDate?: string;
  status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'PROJECTED' | 'FINISHED' | 'NONE' | 'paid' | 'partial' | 'unpaid' | 'projection' | 'not_applicable';
  targetAmount: number;
  paidAmount: number;
  remainingBalance?: number;
  loanId?: string;
  loanNumber?: string;
  tenor?: number;
  periodNumber?: number;
}

export type MonthLoanCell = LoanMatrixMonth;

export interface LoanMatrixMember {
  memberId: string;
  nrp: string;
  nama: string;
  isLoanActive: boolean;
  totalLoans: number;
  months: Record<number, LoanMatrixMonth>;
  complianceYTD: number;
}

export interface LoanMatrixSummary {
  complianceYTD: number;
  totalCollectedYTD: number;
  projectedNextMonth: number;
  unpaidMembersCount: number;
  members: LoanMatrixMember[];
}

export const getLoanMatrix = async (year: number): Promise<LoanMatrixSummary> => {
  // Fetch members who have loans in this year
  // A loan is in this year if any of its schedules fall in this year
  
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

  const loanIds = Array.from(new Set(yearSchedules?.map(s => s.loan_id) || []));

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
        tenor,
        status,
        monthly_target,
        member:anggota (
          id,
          nrp,
          nama
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

  const membersMap: Record<string, LoanMatrixMember> = {};

  let totalTargetYTD = 0;
  let totalCollectedYTD = 0;
  let projectedNextMonth = 0;
  const unpaidMembersSet = new Set<string>();
  
  // To track running balance per loan
  const loanBalances: Record<string, number> = {};

  (schedules || []).forEach((sched: any) => {
    if (!sched.loan || !sched.loan.member) return;

    const member = sched.loan.member;
    const loan = sched.loan;
    const dueDate = new Date(sched.due_date);
    const month = dueDate.getMonth() + 1;
    const scheduleYear = dueDate.getFullYear();

    // Initialize running balance for this loan if not exists
    // The total loan expected is tenor * monthly_target
    if (loanBalances[loan.id] === undefined) {
      loanBalances[loan.id] = (Number(loan.tenor) || 0) * (Number(loan.monthly_target) || 0);
    }
    
    // Decrease the remaining balance by what has been paid in this schedule
    loanBalances[loan.id] -= Number(sched.paid_amount);

    if (!membersMap[member.id]) {
      membersMap[member.id] = {
        memberId: member.id,
        nrp: member.nrp,
        nama: member.nama,
        isLoanActive: loan.status === 'active' || loan.status === 'approved',
        totalLoans: 1,
        months: {},
        complianceYTD: 0
      };
      
      // Initialize all 12 months with NONE
      for (let i = 1; i <= 12; i++) {
        membersMap[member.id].months[i] = {
          month: i,
          year: year,
          status: 'NONE',
          targetAmount: 0,
          paidAmount: 0
        };
      }
    } else {
      // Check if we need to update isLoanActive
      if (loan.status === 'active' || loan.status === 'approved') {
        membersMap[member.id].isLoanActive = true;
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

      membersMap[member.id].months[month] = {
        month,
        year: scheduleYear,
        dueDate: sched.due_date,
        status: cellStatus,
        targetAmount: Number(sched.target_amount),
        paidAmount: Number(sched.paid_amount),
        remainingBalance: Math.max(0, loanBalances[loan.id]), // Ensure it doesn't go below 0 visually
        loanId: loan.id,
        loanNumber: loan.loan_number,
        tenor: loan.tenor,
        periodNumber: sched.period_number
      };
    }
  });

  // Calculate compliance per member and handle FINISHED logic
  Object.values(membersMap).forEach(member => {
    let memberTarget = 0;
    let memberPaid = 0;
    let lastActiveMonth = 0;

    for (let i = 1; i <= 12; i++) {
      const m = member.months[i];
      if (m.status === 'PAID' || m.status === 'PARTIAL' || m.status === 'UNPAID') {
        memberTarget += m.targetAmount;
        memberPaid += m.paidAmount;
        lastActiveMonth = i;
      }
    }

    member.complianceYTD = memberTarget > 0 ? (memberPaid / memberTarget) * 100 : 100;

    // Apply finished status for months after the last active month if loan is fully paid
    // But since we only have schedules for the current loan, we might just leave them as NONE
    // The requirement says: Jika pinjaman sudah selesai (tenor selesai di bulan sebelumnya), tampilkan badge '-' (Selesai).
    if (!member.isLoanActive && lastActiveMonth > 0) {
       for(let i = lastActiveMonth + 1; i <= 12; i++) {
           member.months[i].status = 'FINISHED';
       }
    }
  });

  const overallComplianceYTD = totalTargetYTD > 0 ? (totalCollectedYTD / totalTargetYTD) * 100 : 100;

  return {
    complianceYTD: overallComplianceYTD,
    totalCollectedYTD,
    projectedNextMonth,
    unpaidMembersCount: unpaidMembersSet.size,
    members: Object.values(membersMap)
  };
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

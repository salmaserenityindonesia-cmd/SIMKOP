import { supabase } from '../lib/supabaseClient';

export interface LoanMatrixMonth {
  month: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'PROJECTED' | 'FINISHED' | 'NONE';
  targetAmount: number;
  paidAmount: number;
  loanId?: string;
  loanNumber?: string;
  tenor?: number;
  periodNumber?: number;
}

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
        member:anggota (
          id,
          nrp,
          nama
        )
      )
    `)
    .gte('due_date', startOfYear)
    .lte('due_date', endOfYear)
    .order('due_date', { ascending: true });

  if (scheduleError) {
    console.error('Error fetching loan matrix schedules:', scheduleError);
    throw scheduleError;
  }

  const currentMonth = new Date().getMonth() + 1; // 1-12
  const currentYear = new Date().getFullYear();

  const membersMap: Record<string, LoanMatrixMember> = {};

  let totalTargetYTD = 0;
  let totalCollectedYTD = 0;
  let projectedNextMonth = 0;
  const unpaidMembersSet = new Set<string>();

  (schedules || []).forEach((sched: any) => {
    if (!sched.loan || !sched.loan.member) return;

    const member = sched.loan.member;
    const loan = sched.loan;
    const dueDate = new Date(sched.due_date);
    const month = dueDate.getMonth() + 1;
    const scheduleYear = dueDate.getFullYear();

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

    membersMap[member.id].months[month] = {
      month,
      status: cellStatus,
      targetAmount: Number(sched.target_amount),
      paidAmount: Number(sched.paid_amount),
      loanId: loan.id,
      loanNumber: loan.loan_number,
      tenor: loan.tenor,
      periodNumber: sched.period_number
    };
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLoanMatrixAvailableYears,
  getLoanMatrix,
  MonthLoanCell,
  LoanMatrixMonth,
  LoanMatrixMember,
  LoanMatrixRow,
  getCumulativePaidUpToMonth,
  getLoanInteractiveGrid,
  toggleLoanSchedulePaid,
  calculateRemainingInstallmentDeficit,
  autoReconcileLoanInstallments,
  checkAllLoanUpToCurrentMonth,
  uncheckAllLoanSchedules,
  getImportedRepaidBalance,
  bulkCheckAllLoansUpToMonth,
  bulkCheckAllLoansUpToCurrentMonth,
  bulkAutoReconcileAllLoans,
  bulkAutoReconcileLoans,
  bulkAutoReconcileLoansUpToImportedBalance,
} from './loanMatrixService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe('loanMatrixService - getLoanMatrixAvailableYears', () => {
  const currentYear = 2026;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setupSupabaseMock = (
    loansResult: { data: any; error: any },
    schedulesResult: { data: any; error: any }
  ) => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue(loansResult),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue(schedulesResult),
              }),
            }),
          }),
        };
      }
      return {};
    });
  };

  it('Kasus 1: Tidak ada pinjaman aktif -> mengembalikan [currentYear]', async () => {
    setupSupabaseMock(
      { data: null, error: null },
      { data: null, error: null }
    );

    const years = await getLoanMatrixAvailableYears();
    expect(years).toEqual([currentYear]);
  });

  it('Kasus 2: Pinjaman aktif tertua 2023-05-10, jadwal terjauh 2026-12-01 -> [2026, 2025, 2024, 2023]', async () => {
    setupSupabaseMock(
      { data: { disbursed_at: '2023-05-10T00:00:00.000Z', created_at: '2023-05-01T00:00:00.000Z' }, error: null },
      { data: { due_date: '2026-12-01' }, error: null }
    );

    const years = await getLoanMatrixAvailableYears();
    expect(years).toEqual([2026, 2025, 2024, 2023]);
  });

  it('Kasus 3: Pinjaman aktif tertua 2024-01-15, jadwal jatuh tempo terjauh hingga 2028-10-01 -> [2028, 2027, 2026, 2025, 2024]', async () => {
    setupSupabaseMock(
      { data: { disbursed_at: '2024-01-15T00:00:00.000Z', created_at: '2024-01-10T00:00:00.000Z' }, error: null },
      { data: { due_date: '2028-10-01' }, error: null }
    );

    const years = await getLoanMatrixAvailableYears();
    expect(years).toEqual([2028, 2027, 2026, 2025, 2024]);
  });

  it('Kasus 4: disbursed_at null, fallback ke created_at (2022-08-01) -> tahun mulai 2022', async () => {
    setupSupabaseMock(
      { data: { disbursed_at: null, created_at: '2022-08-01T00:00:00.000Z' }, error: null },
      { data: { due_date: '2026-05-01' }, error: null }
    );

    const years = await getLoanMatrixAvailableYears();
    expect(years).toEqual([2026, 2025, 2024, 2023, 2022]);
  });

  it('Kasus 5: Error query supabase -> graceful fallback mengembalikan [currentYear]', async () => {
    // Sub-case 5a: loans error
    setupSupabaseMock(
      { data: null, error: new Error('Database connection failed') },
      { data: { due_date: '2028-10-01' }, error: null }
    );

    let years = await getLoanMatrixAvailableYears();
    expect(years).toEqual([currentYear]);

    // Sub-case 5b: loan_schedules error
    setupSupabaseMock(
      { data: { disbursed_at: '2023-01-01', created_at: '2023-01-01' }, error: null },
      { data: null, error: new Error('Schedule query timeout') }
    );

    years = await getLoanMatrixAvailableYears();
    expect(years).toEqual([currentYear]);

    // Sub-case 5c: thrown exception
    (supabase.from as any).mockImplementationOnce(() => {
      throw new Error('Fatal network crash');
    });

    years = await getLoanMatrixAvailableYears();
    expect(years).toEqual([currentYear]);
  });
});

describe('loanMatrixService - getLoanMatrix & MonthLoanCell Data Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('MonthLoanCell contract allows both uppercase and lowercase status and optional year/dueDate', () => {
    const sampleCell: MonthLoanCell = {
      month: 1,
      year: 2026,
      dueDate: '2026-01-10',
      status: 'PAID',
      targetAmount: 500000,
      paidAmount: 500000,
    };
    expect(sampleCell.month).toBe(1);
    expect(sampleCell.year).toBe(2026);
    expect(sampleCell.dueDate).toBe('2026-01-10');
    expect(sampleCell.status).toBe('PAID');
    expect(sampleCell.targetAmount).toBe(500000);
    expect(sampleCell.paidAmount).toBe(500000);

    const lowercaseCell: MonthLoanCell = {
      month: 2,
      year: 2026,
      dueDate: '2026-02-10',
      status: 'projection',
      targetAmount: 500000,
      paidAmount: 0,
    };
    expect(lowercaseCell.status).toBe('projection');
  });

  it('getLoanMatrix returns empty summary when no loans exist for the year', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(summary.complianceYTD).toBe(100);
    expect(summary.totalCollectedYTD).toBe(0);
    expect(summary.projectedNextMonth).toBe(0);
    expect(summary.unpaidMembersCount).toBe(0);
    expect(summary.members).toEqual([]);
  });

  it('getLoanMatrix populates year, dueDate, and MonthLoanCell properties on schedules', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [{ loan_id: 'loan-101' }],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'sched-101',
                      period_number: 1,
                      due_date: '2026-01-15',
                      target_amount: 1000000,
                      paid_amount: 1000000,
                      status: 'paid',
                      loan: {
                        id: 'loan-101',
                        loan_number: 'PINJ-2026-001',
                        tenor: 12,
                        status: 'active',
                        monthly_target: 1000000,
                        member: {
                          id: 'mem-101',
                          nrp: 'NRP-999',
                          nama: 'Sertu Bambang',
                        },
                      },
                    },
                    {
                      id: 'sched-102',
                      period_number: 2,
                      due_date: '2026-02-15',
                      target_amount: 1000000,
                      paid_amount: 500000,
                      status: 'partial',
                      loan: {
                        id: 'loan-101',
                        loan_number: 'PINJ-2026-001',
                        tenor: 12,
                        status: 'active',
                        monthly_target: 1000000,
                        member: {
                          id: 'mem-101',
                          nrp: 'NRP-999',
                          nama: 'Sertu Bambang',
                        },
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(summary.members.length).toBe(1);

    const member = summary.members[0];
    expect(member.memberId).toBe('mem-101');
    expect(member.nama).toBe('Sertu Bambang');

    // Month 1 should have schedule details with year and dueDate
    const janCell: MonthLoanCell = member.months[1];
    expect(janCell).toBeDefined();
    expect(janCell.month).toBe(1);
    expect(janCell.year).toBe(2026);
    expect(janCell.dueDate).toBe('2026-01-15');
    expect(janCell.status).toBe('PAID');
    expect(janCell.targetAmount).toBe(1000000);
    expect(janCell.paidAmount).toBe(1000000);
    expect(janCell.cumulativePaidAmount).toBe(1000000);

    // Month 2 partial
    const febCell: MonthLoanCell = member.months[2];
    expect(febCell).toBeDefined();
    expect(febCell.month).toBe(2);
    expect(febCell.year).toBe(2026);
    expect(febCell.dueDate).toBe('2026-02-15');
    expect(febCell.status).toBe('PARTIAL');
    expect(febCell.targetAmount).toBe(1000000);
    expect(febCell.paidAmount).toBe(500000);
    expect(febCell.cumulativePaidAmount).toBe(1500000);

    // Month 12 unpopulated should have default initialization with year and status NONE
    const decCell: MonthLoanCell = member.months[12];
    expect(decCell).toBeDefined();
    expect(decCell.month).toBe(12);
    expect(decCell.year).toBe(2026);
    expect(decCell.status).toBe('NONE');
    expect(decCell.targetAmount).toBe(0);
    expect(decCell.paidAmount).toBe(0);
    expect(decCell.cumulativePaidAmount).toBeUndefined();
  });

  it('calculates priorYearPaid and priorYearRemaining correctly for loans spanning multiple years', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [
                      { loan_id: 'loan-prior-1' },
                      { loan_id: 'loan-new-2' },
                      { loan_id: 'loan-overpaid-3' },
                    ],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    // Loan 1: Prior year payments in 2025 (total 2,000,000 out of 10,000,000 principal)
                    {
                      id: 's-1',
                      period_number: 1,
                      due_date: '2025-11-10',
                      target_amount: 1000000,
                      paid_amount: 1000000,
                      status: 'paid',
                      loan: {
                        id: 'loan-prior-1',
                        loan_number: 'PINJ-2025-001',
                        principal_amount: 10000000,
                        tenor: 10,
                        monthly_target: 1000000,
                        status: 'active',
                        member: { id: 'mem-1', nrp: '111', nama: 'Prajurit Satu' },
                      },
                    },
                    {
                      id: 's-2',
                      period_number: 2,
                      due_date: '2025-12-10',
                      target_amount: 1000000,
                      paid_amount: 1000000,
                      status: 'paid',
                      loan: {
                        id: 'loan-prior-1',
                        loan_number: 'PINJ-2025-001',
                        principal_amount: 10000000,
                        tenor: 10,
                        monthly_target: 1000000,
                        status: 'active',
                        member: { id: 'mem-1', nrp: '111', nama: 'Prajurit Satu' },
                      },
                    },
                    {
                      id: 's-3',
                      period_number: 3,
                      due_date: '2026-01-10',
                      target_amount: 1000000,
                      paid_amount: 1000000,
                      status: 'paid',
                      loan: {
                        id: 'loan-prior-1',
                        loan_number: 'PINJ-2025-001',
                        principal_amount: 10000000,
                        tenor: 10,
                        monthly_target: 1000000,
                        status: 'active',
                        member: { id: 'mem-1', nrp: '111', nama: 'Prajurit Satu' },
                      },
                    },
                    // Loan 2: New loan starting in 2026 (no prior year payments, 5,000,000 principal)
                    {
                      id: 's-4',
                      period_number: 1,
                      due_date: '2026-01-15',
                      target_amount: 1000000,
                      paid_amount: 1000000,
                      status: 'paid',
                      loan: {
                        id: 'loan-new-2',
                        loan_number: 'PINJ-2026-002',
                        principal_amount: 5000000,
                        tenor: 5,
                        monthly_target: 1000000,
                        status: 'active',
                        member: { id: 'mem-2', nrp: '222', nama: 'Prajurit Dua' },
                      },
                    },
                    // Loan 3: Overpaid in prior year (3,500,000 paid vs 3,000,000 principal)
                    {
                      id: 's-5',
                      period_number: 1,
                      due_date: '2025-10-15',
                      target_amount: 1500000,
                      paid_amount: 1500000,
                      status: 'paid',
                      loan: {
                        id: 'loan-overpaid-3',
                        loan_number: 'PINJ-2025-003',
                        principal_amount: 3000000,
                        tenor: 2,
                        monthly_target: 1500000,
                        status: 'active',
                        member: { id: 'mem-3', nrp: '333', nama: 'Prajurit Tiga' },
                      },
                    },
                    {
                      id: 's-6',
                      period_number: 2,
                      due_date: '2025-11-15',
                      target_amount: 1500000,
                      paid_amount: 2000000,
                      status: 'paid',
                      loan: {
                        id: 'loan-overpaid-3',
                        loan_number: 'PINJ-2025-003',
                        principal_amount: 3000000,
                        tenor: 2,
                        monthly_target: 1500000,
                        status: 'active',
                        member: { id: 'mem-3', nrp: '333', nama: 'Prajurit Tiga' },
                      },
                    },
                    {
                      id: 's-7',
                      period_number: 3,
                      due_date: '2026-01-20',
                      target_amount: 500000,
                      paid_amount: 0,
                      status: 'unpaid',
                      loan: {
                        id: 'loan-overpaid-3',
                        loan_number: 'PINJ-2025-003',
                        principal_amount: 3000000,
                        tenor: 3,
                        monthly_target: 500000,
                        status: 'active',
                        member: { id: 'mem-3', nrp: '333', nama: 'Prajurit Tiga' },
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(summary.members.length).toBe(3);

    const rowLoan1 = summary.members.find(m => m.loanId === 'loan-prior-1');
    expect(rowLoan1).toBeDefined();
    expect(rowLoan1?.principalAmount).toBe(10000000);
    expect(rowLoan1?.priorYearPaid).toBe(2000000);
    expect(rowLoan1?.priorYearRemaining).toBe(8000000);

    const rowLoan2 = summary.members.find(m => m.loanId === 'loan-new-2');
    expect(rowLoan2).toBeDefined();
    expect(rowLoan2?.principalAmount).toBe(5000000);
    expect(rowLoan2?.priorYearPaid).toBe(0);
    expect(rowLoan2?.priorYearRemaining).toBe(5000000);

    const rowLoan3 = summary.members.find(m => m.loanId === 'loan-overpaid-3');
    expect(rowLoan3).toBeDefined();
    expect(rowLoan3?.principalAmount).toBe(3000000);
    expect(rowLoan3?.priorYearPaid).toBe(3500000);
    // priorYearRemaining must not be negative: Math.max(0, 3000000 - 3500000) === 0
    expect(rowLoan3?.priorYearRemaining).toBe(0);
  });

  it('excludes completed, paid_off, and all-schedules-paid loans from getLoanMatrix and KPIs', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [
                      { loan_id: 'loan-completed-x' },
                      { loan_id: 'loan-paidoff-y' },
                      { loan_id: 'loan-allpaid-z' },
                      { loan_id: 'loan-active-1' },
                    ],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'sched-comp-1',
                      period_number: 1,
                      due_date: '2026-01-15',
                      target_amount: 1000000,
                      paid_amount: 1000000,
                      status: 'paid',
                      loan: {
                        id: 'loan-completed-x',
                        loan_number: 'PINJ-COMP-001',
                        principal_amount: 2000000,
                        tenor: 2,
                        monthly_target: 1000000,
                        status: 'completed',
                        member: { id: 'mem-comp-1', nrp: '112233', nama: 'Mulyono Santoso' },
                      },
                    },
                    {
                      id: 'sched-comp-2',
                      period_number: 2,
                      due_date: '2026-02-15',
                      target_amount: 1000000,
                      paid_amount: 1000000,
                      status: 'paid',
                      loan: {
                        id: 'loan-completed-x',
                        loan_number: 'PINJ-COMP-001',
                        principal_amount: 2000000,
                        tenor: 2,
                        monthly_target: 1000000,
                        status: 'completed',
                        member: { id: 'mem-comp-1', nrp: '112233', nama: 'Mulyono Santoso' },
                      },
                    },
                    {
                      id: 'sched-po-1',
                      period_number: 1,
                      due_date: '2026-01-15',
                      target_amount: 500000,
                      paid_amount: 500000,
                      status: 'paid',
                      loan: {
                        id: 'loan-paidoff-y',
                        loan_number: 'PINJ-PO-002',
                        principal_amount: 500000,
                        tenor: 1,
                        monthly_target: 500000,
                        status: 'paid_off',
                        member: { id: 'mem-po-1', nrp: '445566', nama: 'Guntur Sutrisno' },
                      },
                    },
                    {
                      id: 'sched-ap-1',
                      period_number: 1,
                      due_date: '2026-01-15',
                      target_amount: 750000,
                      paid_amount: 750000,
                      status: 'paid',
                      loan: {
                        id: 'loan-allpaid-z',
                        loan_number: 'PINJ-AP-003',
                        principal_amount: 750000,
                        tenor: 1,
                        monthly_target: 750000,
                        status: 'active',
                        member: { id: 'mem-ap-1', nrp: '778899', nama: 'Sertu Lunas Penuh' },
                      },
                    },
                    {
                      id: 'sched-act-1',
                      period_number: 1,
                      due_date: '2026-01-15',
                      target_amount: 1000000,
                      paid_amount: 0,
                      status: 'unpaid',
                      loan: {
                        id: 'loan-active-1',
                        loan_number: 'PINJ-ACT-004',
                        principal_amount: 2000000,
                        tenor: 2,
                        monthly_target: 1000000,
                        status: 'active',
                        member: { id: 'mem-act-1', nrp: '990011', nama: 'Kopda Berjalan' },
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(summary.members.length).toBe(1);
    expect(summary.members[0].loanId).toBe('loan-active-1');
    expect(summary.members[0].nama).toBe('Kopda Berjalan');
    // KPIs only reflect the active unfinished loan (0 collected out of 1,000,000 target)
    expect(summary.totalCollectedYTD).toBe(0);
    expect(summary.complianceYTD).toBe(0);
  });
});

describe('loanMatrixService - cumulativePaidAmount & getCumulativePaidUpToMonth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengembalikan cumulativePaidAmount langsung dari targetCell jika tersedia', () => {
    const mockMember: LoanMatrixMember = {
      memberId: 'mem-001',
      nrp: 'NRP-001',
      nama: 'Kopda Suryo',
      isLoanActive: true,
      totalLoans: 1,
      complianceYTD: 100,
      months: {
        1: {
          month: 1,
          year: 2026,
          targetAmount: 1000000,
          paidAmount: 1000000,
          cumulativePaidAmount: 1000000,
          status: 'PAID',
          loanId: 'loan-abc',
        },
        2: {
          month: 2,
          year: 2026,
          targetAmount: 1000000,
          paidAmount: 1000000,
          cumulativePaidAmount: 2000000,
          status: 'PAID',
          loanId: 'loan-abc',
        },
        3: {
          month: 3,
          year: 2026,
          targetAmount: 1000000,
          paidAmount: 500000,
          cumulativePaidAmount: 2500000,
          status: 'PARTIAL',
          loanId: 'loan-abc',
        },
      },
    };

    expect(getCumulativePaidUpToMonth(mockMember, 1)).toBe(1000000);
    expect(getCumulativePaidUpToMonth(mockMember, 2)).toBe(2000000);
    expect(getCumulativePaidUpToMonth(mockMember, 3)).toBe(2500000);
  });

  it('melakukan fallback dengan menjumlahkan paidAmount dari bulan 1 s/d targetMonth jika cumulativePaidAmount belum ada', () => {
    const mockMember: LoanMatrixMember = {
      memberId: 'mem-002',
      nrp: 'NRP-002',
      nama: 'Praka Danu',
      isLoanActive: true,
      totalLoans: 1,
      complianceYTD: 80,
      months: {
        1: {
          month: 1,
          year: 2026,
          targetAmount: 1000000,
          paidAmount: 1000000,
          status: 'PAID',
          loanId: 'loan-xyz',
        },
        2: {
          month: 2,
          year: 2026,
          targetAmount: 1000000,
          paidAmount: 600000,
          status: 'PARTIAL',
          loanId: 'loan-xyz',
        },
        3: {
          month: 3,
          year: 2026,
          targetAmount: 1000000,
          paidAmount: 0,
          status: 'UNPAID',
          loanId: 'loan-xyz',
        },
      },
    };

    expect(getCumulativePaidUpToMonth(mockMember, 1)).toBe(1000000);
    expect(getCumulativePaidUpToMonth(mockMember, 2)).toBe(1600000);
    expect(getCumulativePaidUpToMonth(mockMember, 3)).toBe(1600000);
  });

  it('memfilter loanId yang sesuai saat fallback jika terdapat beberapa pinjaman', () => {
    const mockMember: LoanMatrixMember = {
      memberId: 'mem-003',
      nrp: 'NRP-003',
      nama: 'Letda Haris',
      isLoanActive: true,
      totalLoans: 2,
      complianceYTD: 100,
      months: {
        1: {
          month: 1,
          year: 2026,
          targetAmount: 500000,
          paidAmount: 500000,
          status: 'PAID',
          loanId: 'loan-old',
        },
        2: {
          month: 2,
          year: 2026,
          targetAmount: 800000,
          paidAmount: 800000,
          status: 'PAID',
          loanId: 'loan-new',
        },
        3: {
          month: 3,
          year: 2026,
          targetAmount: 800000,
          paidAmount: 800000,
          status: 'PAID',
          loanId: 'loan-new',
        },
      },
    };

    // Target bulan 3 berasal dari pinjaman 'loan-new', sehingga bulan 1 (loan-old) tidak ikut dijumlahkan
    expect(getCumulativePaidUpToMonth(mockMember, 3)).toBe(1600000);
    // Target bulan 1 berasal dari pinjaman 'loan-old'
    expect(getCumulativePaidUpToMonth(mockMember, 1)).toBe(500000);
  });

  it('mengembalikan 0 secara aman jika input member null atau kosong', () => {
    expect(getCumulativePaidUpToMonth(null as any, 1)).toBe(0);
    expect(getCumulativePaidUpToMonth({} as any, 1)).toBe(0);
    expect(getCumulativePaidUpToMonth({ months: {} } as any, 5)).toBe(0);
  });

  it('getLoanMatrix mengakumulasikan paid_amount kronologis secara berurutan antar bulan pada jadwal pinjaman', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [{ loan_id: 'loan-multi-period' }],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'sched-1',
                      period_number: 1,
                      due_date: '2026-01-15',
                      target_amount: 1000000,
                      paid_amount: 1000000,
                      status: 'paid',
                      loan: {
                        id: 'loan-multi-period',
                        loan_number: 'PINJ-2026-MULTI',
                        tenor: 10,
                        status: 'active',
                        monthly_target: 1000000,
                        member: {
                          id: 'mem-multi',
                          nrp: 'NRP-MULTI',
                          nama: 'Serma Joni',
                        },
                      },
                    },
                    {
                      id: 'sched-2',
                      period_number: 2,
                      due_date: '2026-02-15',
                      target_amount: 1000000,
                      paid_amount: 750000,
                      status: 'partial',
                      loan: {
                        id: 'loan-multi-period',
                        loan_number: 'PINJ-2026-MULTI',
                        tenor: 10,
                        status: 'active',
                        monthly_target: 1000000,
                        member: {
                          id: 'mem-multi',
                          nrp: 'NRP-MULTI',
                          nama: 'Serma Joni',
                        },
                      },
                    },
                    {
                      id: 'sched-3',
                      period_number: 3,
                      due_date: '2026-03-15',
                      target_amount: 1000000,
                      paid_amount: 250000,
                      status: 'partial',
                      loan: {
                        id: 'loan-multi-period',
                        loan_number: 'PINJ-2026-MULTI',
                        tenor: 10,
                        status: 'active',
                        monthly_target: 1000000,
                        member: {
                          id: 'mem-multi',
                          nrp: 'NRP-MULTI',
                          nama: 'Serma Joni',
                        },
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(summary.members.length).toBe(1);

    const member = summary.members[0];
    expect(member.months[1].cumulativePaidAmount).toBe(1000000);
    expect(member.months[2].cumulativePaidAmount).toBe(1750000);
    expect(member.months[3].cumulativePaidAmount).toBe(2000000);

    expect(getCumulativePaidUpToMonth(member, 1)).toBe(1000000);
    expect(getCumulativePaidUpToMonth(member, 2)).toBe(1750000);
    expect(getCumulativePaidUpToMonth(member, 3)).toBe(2000000);
  });
});

describe('loanMatrixService - Multi-Loan Support per Member', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('menghasilkan baris independen per pinjaman aktif untuk anggota yang memiliki multi-pinjaman berjalan', async () => {
    const memberYanto = {
      id: 'mem-yanto',
      nrp: '96316880',
      nama: 'Yanto Santoso',
      tanggal_lahir: '1992-04-05',
    };

    const loan1 = {
      id: 'loan-yanto-1',
      loan_number: 'PINJ-2026-YNT1',
      member_id: 'mem-yanto',
      tenor: 30,
      agreed_tenor_months: 30,
      monthly_target: 333333,
      principal_amount: 10000000,
      status: 'active',
      loan_types: { id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler' },
      member: memberYanto,
    };

    const loan2 = {
      id: 'loan-yanto-2',
      loan_number: 'PINJ-2026-YNT2',
      member_id: 'mem-yanto',
      tenor: 12,
      agreed_tenor_months: 12,
      monthly_target: 166667,
      principal_amount: 2000000,
      status: 'active',
      loan_types: { id: 'lt-2', code: 'KHS', name: 'Pinjaman Khusus' },
      member: memberYanto,
    };

    const mockSchedules = [
      // Loan 1 (Tenor 30 bulan, 333.333/bln)
      {
        id: 'sc-y1-1',
        loan_id: 'loan-yanto-1',
        period_number: 1,
        due_date: '2026-01-10',
        target_amount: 333333,
        paid_amount: 333333,
        status: 'paid',
        loan: loan1,
      },
      {
        id: 'sc-y1-6',
        loan_id: 'loan-yanto-1',
        period_number: 6,
        due_date: '2026-06-10',
        target_amount: 333333,
        paid_amount: 333333,
        status: 'paid',
        loan: loan1,
      },
      {
        id: 'sc-y1-7',
        loan_id: 'loan-yanto-1',
        period_number: 7,
        due_date: '2026-07-10',
        target_amount: 333333,
        paid_amount: 0,
        status: 'unpaid',
        loan: loan1,
      },

      // Loan 2 (Tenor 12 bulan, 166.667/bln)
      {
        id: 'sc-y2-1',
        loan_id: 'loan-yanto-2',
        period_number: 1,
        due_date: '2026-01-15',
        target_amount: 166667,
        paid_amount: 166667,
        status: 'paid',
        loan: loan2,
      },
      {
        id: 'sc-y2-6',
        loan_id: 'loan-yanto-2',
        period_number: 6,
        due_date: '2026-06-15',
        target_amount: 166667,
        paid_amount: 166667,
        status: 'paid',
        loan: loan2,
      },
      {
        id: 'sc-y2-7',
        loan_id: 'loan-yanto-2',
        period_number: 7,
        due_date: '2026-07-15',
        target_amount: 166667,
        paid_amount: 0,
        status: 'unpaid',
        loan: loan2,
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [{ loan_id: 'loan-yanto-1' }, { loan_id: 'loan-yanto-2' }],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockSchedules,
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const result = await getLoanMatrix(2026);

    // Verifikasi result.members.length === 2 (1 Baris per Pinjaman Aktif)
    expect(result.members.length).toBe(2);

    const rowLoan1: LoanMatrixRow | undefined = result.members.find(m => m.loanId === 'loan-yanto-1');
    const rowLoan2: LoanMatrixRow | undefined = result.members.find(m => m.loanId === 'loan-yanto-2');

    expect(rowLoan1).toBeDefined();
    expect(rowLoan2).toBeDefined();

    // Verifikasi Baris 1: Pinjaman 30 bulan
    expect(rowLoan1?.id).toBe('loan-yanto-1');
    expect(rowLoan1?.loanId).toBe('loan-yanto-1');
    expect(rowLoan1?.loanNumber).toBe('PINJ-2026-YNT1');
    expect(rowLoan1?.memberId).toBe('mem-yanto');
    expect(rowLoan1?.nama).toBe('Yanto Santoso');
    expect(rowLoan1?.nrp).toBe('96316880');
    expect(rowLoan1?.tanggal_lahir).toBe('1992-04-05');
    expect(rowLoan1?.loanTypeName).toBe('Pinjaman Reguler');
    expect(rowLoan1?.tenor).toBe(30);
    expect(rowLoan1?.monthlyTarget).toBe(333333);
    expect(rowLoan1?.totalLoans).toBe(2);
    expect(rowLoan1?.months[1].targetAmount).toBe(333333);
    expect(rowLoan1?.months[1].paidAmount).toBe(333333);
    expect(rowLoan1?.months[1].status).toBe('PAID');
    expect(rowLoan1?.months[7].targetAmount).toBe(333333);
    expect(rowLoan1?.months[7].status).toBe('PROJECTED');

    // Verifikasi Baris 2: Pinjaman 12 bulan
    expect(rowLoan2?.id).toBe('loan-yanto-2');
    expect(rowLoan2?.loanId).toBe('loan-yanto-2');
    expect(rowLoan2?.loanNumber).toBe('PINJ-2026-YNT2');
    expect(rowLoan2?.memberId).toBe('mem-yanto');
    expect(rowLoan2?.nama).toBe('Yanto Santoso');
    expect(rowLoan2?.nrp).toBe('96316880');
    expect(rowLoan2?.tanggal_lahir).toBe('1992-04-05');
    expect(rowLoan2?.loanTypeName).toBe('Pinjaman Khusus');
    expect(rowLoan2?.tenor).toBe(12);
    expect(rowLoan2?.monthlyTarget).toBe(166667);
    expect(rowLoan2?.totalLoans).toBe(2);
    expect(rowLoan2?.months[1].targetAmount).toBe(166667);
    expect(rowLoan2?.months[1].paidAmount).toBe(166667);
    expect(rowLoan2?.months[1].status).toBe('PAID');
    expect(rowLoan2?.months[7].targetAmount).toBe(166667);
    expect(rowLoan2?.months[7].status).toBe('PROJECTED');

    // Verifikasi proyeksi bulan depan (Bulan 7 / Juli 2026) mengakumulasikan kedua pinjaman berjalan
    // Rp 333.333 + Rp 166.667 = Rp 500.000
    expect(result.projectedNextMonth).toBe(333333 + 166667);
  });

  it('mengisolasi unpaidMembersCount per anggota unik meskipun kedua pinjaman menunggak di bulan berjalan', async () => {
    const memberYanto = {
      id: 'mem-yanto',
      nrp: '96316880',
      nama: 'Yanto Santoso',
    };

    const mockSchedules = [
      {
        id: 'sc-1',
        loan_id: 'loan-1',
        period_number: 6,
        due_date: '2026-06-10',
        target_amount: 500000,
        paid_amount: 0,
        status: 'unpaid',
        loan: {
          id: 'loan-1',
          loan_number: 'P-1',
          tenor: 12,
          monthly_target: 500000,
          status: 'active',
          member: memberYanto,
        },
      },
      {
        id: 'sc-2',
        loan_id: 'loan-2',
        period_number: 6,
        due_date: '2026-06-10',
        target_amount: 300000,
        paid_amount: 0,
        status: 'unpaid',
        loan: {
          id: 'loan-2',
          loan_number: 'P-2',
          tenor: 6,
          monthly_target: 300000,
          status: 'active',
          member: memberYanto,
        },
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [{ loan_id: 'loan-1' }, { loan_id: 'loan-2' }],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockSchedules,
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const result = await getLoanMatrix(2026);

    // Dua baris pinjaman
    expect(result.members.length).toBe(2);
    // Tetapi hanya 1 anggota unik yang menunggak
    expect(result.unpaidMembersCount).toBe(1);
  });

  it('mendukung 3 atau lebih pinjaman aktif bersamaan per anggota dengan totalLoans dan proyeksi yang terakumulasi sempurna', async () => {
    const memberBudi = {
      id: 'mem-budi',
      nrp: '12345678',
      nama: 'Budi Prasetyo',
      tanggal_lahir: '1987-01-25',
    };

    const loans = [
      {
        id: 'loan-budi-reg',
        loan_number: 'PINJ-REG-01',
        member_id: 'mem-budi',
        tenor: 24,
        monthly_target: 500000,
        status: 'active',
        loan_types: { id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler' },
        member: memberBudi,
      },
      {
        id: 'loan-budi-khs',
        loan_number: 'PINJ-KHS-02',
        member_id: 'mem-budi',
        tenor: 12,
        monthly_target: 300000,
        status: 'active',
        loan_types: { id: 'lt-2', code: 'KHS', name: 'Pinjaman Khusus' },
        member: memberBudi,
      },
      {
        id: 'loan-budi-brg',
        loan_number: 'PINJ-BRG-03',
        member_id: 'mem-budi',
        tenor: 6,
        monthly_target: 200000,
        status: 'active',
        loan_types: { id: 'lt-3', code: 'BRG', name: 'Pinjaman Barang' },
        member: memberBudi,
      },
    ];

    const mockSchedules = loans.map((l, idx) => ({
      id: `sc-budi-${idx + 1}`,
      loan_id: l.id,
      period_number: 7,
      due_date: '2026-07-10',
      target_amount: l.monthly_target,
      paid_amount: 0,
      status: 'unpaid',
      loan: l,
    }));

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: loans.map(l => ({ loan_id: l.id })),
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockSchedules,
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const result = await getLoanMatrix(2026);

    expect(result.members.length).toBe(3);
    result.members.forEach(row => {
      expect(row.memberId).toBe('mem-budi');
      expect(row.totalLoans).toBe(3);
      expect(row.nama).toBe('Budi Prasetyo');
    });

    // Proyeksi bulan depan (Bulan 7 / Juli 2026): 500k + 300k + 200k = 1.000.000
    expect(result.projectedNextMonth).toBe(1000000);
  });
});

describe('loanMatrixService - getLoanInteractiveGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mengembalikan summary pinjaman, kalkulasi sisa saldo, dan mapping periods secara akurat', async () => {
    const mockLoan = {
      id: 'loan-101',
      loan_number: 'PINJ-2026-001',
      principal_amount: 6000000,
      amount: 6000000,
      tenor: 6,
      monthly_target: 1000000,
      disbursed_at: '2026-01-05T00:00:00.000Z',
      status: 'active',
      member: {
        id: 'mem-101',
        nama: 'Kopda Herman',
        nrp: 'NRP-5555'
      }
    };

    const mockSchedules = [
      { id: 'sc-1', loan_id: 'loan-101', period_number: 1, due_date: '2026-01-15', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sc-2', loan_id: 'loan-101', period_number: 2, due_date: '2026-02-15', target_amount: 1000000, paid_amount: 500000, status: 'partial' },
      { id: 'sc-3', loan_id: 'loan-101', period_number: 3, due_date: '2026-03-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
      { id: 'sc-4', loan_id: 'loan-101', period_number: 4, due_date: '2026-06-10', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
      { id: 'sc-5', loan_id: 'loan-101', period_number: 5, due_date: '2026-07-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
      { id: 'sc-6', loan_id: 'loan-101', period_number: 6, due_date: '2026-08-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid' }
    ];

    const mockRepayments = [
      { id: 'rep-1', loan_id: 'loan-101', schedule_id: 'sc-1', amount_paid: 1000000, payment_date: '2026-01-14T10:00:00Z', payment_method: 'transfer', notes: 'Kwitansi 001', receipt_number: 'KW-PINJ/PINJ-2026-001/B1/20260114-A1B' },
      { id: 'rep-2', loan_id: 'loan-101', schedule_id: 'sc-2', amount_paid: 500000, payment_date: '2026-02-14T10:00:00Z', payment_method: 'cash', notes: 'Sebagian', receipt_number: null }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockLoan, error: null })
            })
          })
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null })
            })
          })
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockRepayments, error: null })
            })
          })
        };
      }
      return {};
    });

    const result = await getLoanInteractiveGrid('loan-101');

    expect(result.loanId).toBe('loan-101');
    expect(result.loanNumber).toBe('PINJ-2026-001');
    expect(result.memberName).toBe('Kopda Herman');
    expect(result.memberNrp).toBe('NRP-5555');
    expect(result.principalAmount).toBe(6000000);
    expect(result.totalPaid).toBe(1500000);
    expect(result.sisaPinjaman).toBe(4500000);
    expect(result.isBalanced).toBe(false);
    expect(result.periods).toHaveLength(6);

    // Period 1: PAID
    expect(result.periods[0].periodNumber).toBe(1);
    expect(result.periods[0].status).toBe('PAID');
    expect(result.periods[0].label).toBe('Bulan 1 [Jan-26]');
    expect(result.periods[0].isCurrentMonth).toBe(false);
    expect(result.periods[0].repayments).toHaveLength(1);
    expect(result.periods[0].repayments[0].amountPaid).toBe(1000000);
    expect(result.periods[0].repayments[0].receiptNumber).toBe('KW-PINJ/PINJ-2026-001/B1/20260114-A1B');

    // Period 2: PARTIAL
    expect(result.periods[1].status).toBe('PARTIAL');
    expect(result.periods[1].label).toBe('Bulan 2 [Feb-26]');
    expect(result.periods[1].paidAmount).toBe(500000);

    // Period 3: UNPAID (past month March 2026 vs June 2026)
    expect(result.periods[2].status).toBe('UNPAID');

    // Period 4: UNPAID (current month June 2026, past due date 10 June vs 15 June)
    expect(result.periods[3].isCurrentMonth).toBe(true);
    expect(result.periods[3].status).toBe('UNPAID');

    // Period 5: PROJECTED (future month July 2026)
    expect(result.periods[4].status).toBe('PROJECTED');
    expect(result.periods[4].label).toBe('Bulan 5 [Jul-26]');

    // Period 6: PROJECTED (future month August 2026)
    expect(result.periods[5].status).toBe('PROJECTED');
  });

  it('menangani pinjaman lunas penuh dengan isBalanced true dan sisaPinjaman 0', async () => {
    const mockLoan = {
      id: 'loan-102',
      loan_number: 'PINJ-2026-002',
      principal_amount: 2000000,
      tenor: 2,
      monthly_target: 1000000,
      status: 'completed',
      member: { id: 'm-2', nama: 'Serma Joko', nrp: 'NRP-2222' }
    };

    const mockSchedules = [
      { id: 'sc-1', loan_id: 'loan-102', period_number: 1, due_date: '2026-01-15', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sc-2', loan_id: 'loan-102', period_number: 2, due_date: '2026-02-15', target_amount: 1000000, paid_amount: 1000000, status: 'paid' }
    ];

    const mockRepayments = [
      { id: 'rep-1', loan_id: 'loan-102', schedule_id: 'sc-1', amount_paid: 1000000, payment_date: '2026-01-10', payment_method: 'transfer' },
      { id: 'rep-2', loan_id: 'loan-102', schedule_id: 'sc-2', amount_paid: 1000000, payment_date: '2026-02-10', payment_method: 'transfer' }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockLoan, error: null })
            })
          })
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null })
            })
          })
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockRepayments, error: null })
            })
          })
        };
      }
      return {};
    });

    const result = await getLoanInteractiveGrid('loan-102');
    expect(result.totalPaid).toBe(2000000);
    expect(result.sisaPinjaman).toBe(0);
    expect(result.isBalanced).toBe(true);
    expect(result.periods.every(p => p.status === 'PAID')).toBe(true);
  });
});

describe('loanMatrixService - toggleLoanSchedulePaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('melunasi jadwal pinjaman (paid = true): insert repayment, update schedule, dan update loan completed jika seluruh jadwal lunas', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const updateScheduleMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const updateLoanMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols.includes('loan:loans')) {
              return {
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'sched-1',
                      loan_id: 'loan-1',
                      period_number: 1,
                      target_amount: 1000000,
                      paid_amount: 0,
                      status: 'unpaid',
                      loan: { id: 'loan-1', status: 'active' }
                    },
                    error: null
                  })
                })
              };
            }
            return {
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'sched-1', status: 'paid', paid_amount: 1000000, target_amount: 1000000 }
                ],
                error: null
              })
            };
          }),
          update: updateScheduleMock
        };
      }
      if (table === 'loan_repayments') {
        return {
          insert: insertMock
        };
      }
      if (table === 'loans') {
        return {
          update: updateLoanMock
        };
      }
      return {};
    });

    await toggleLoanSchedulePaid('sched-1', true, {
      amount: 1000000,
      receiptNo: 'KW-123',
      notes: 'Lunas Transfer Bank',
      paymentMethod: 'transfer'
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      loan_id: 'loan-1',
      schedule_id: 'sched-1',
      amount_paid: 1000000,
      payment_method: 'transfer',
      notes: 'Kwitansi: KW-123 - Lunas Transfer Bank',
      receipt_number: 'KW-123'
    }));

    expect(updateScheduleMock).toHaveBeenCalledWith({
      paid_amount: 1000000,
      status: 'paid'
    });

    expect(updateLoanMock).toHaveBeenCalledWith({
      status: 'completed'
    });
  });

  it('membatalkan pelunasan jadwal pinjaman (paid = false): delete repayment, reset schedule, dan kembalikan loan ke active', async () => {
    const deleteRepayMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const updateScheduleMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const updateLoanMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'sched-1',
                  loan_id: 'loan-1',
                  target_amount: 1000000,
                  paid_amount: 1000000,
                  status: 'paid',
                  loan: { id: 'loan-1', status: 'completed' }
                },
                error: null
              })
            })
          }),
          update: updateScheduleMock
        };
      }
      if (table === 'loan_repayments') {
        return {
          delete: deleteRepayMock
        };
      }
      if (table === 'loans') {
        return {
          update: updateLoanMock
        };
      }
      return {};
    });

    await toggleLoanSchedulePaid('sched-1', false);

    expect(deleteRepayMock).toHaveBeenCalled();
    expect(updateScheduleMock).toHaveBeenCalledWith({
      paid_amount: 0,
      status: 'unpaid'
    });
    expect(updateLoanMock).toHaveBeenCalledWith({
      status: 'active'
    });
  });

  it('melunasi sisa kekurangan parsial (paid = true): mengakumulasi paid_amount (277771 + 7 = 277778), status menjadi paid, dan repayment mencatat nominal riil setoran 7', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const updateScheduleMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const updateLoanMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols.includes('loan:loans')) {
              return {
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'sched-partial-1',
                      loan_id: 'loan-1',
                      period_number: 2,
                      target_amount: 277778,
                      paid_amount: 277771,
                      status: 'partial',
                      loan: { id: 'loan-1', status: 'active' }
                    },
                    error: null
                  })
                })
              };
            }
            return {
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'sched-partial-1', status: 'paid', paid_amount: 277778, target_amount: 277778 }
                ],
                error: null
              })
            };
          }),
          update: updateScheduleMock
        };
      }
      if (table === 'loan_repayments') {
        return {
          insert: insertMock
        };
      }
      if (table === 'loans') {
        return {
          update: updateLoanMock
        };
      }
      return {};
    });

    await toggleLoanSchedulePaid('sched-partial-1', true, {
      amount: 7,
      receiptNo: 'KW-SELISIH-02',
      notes: 'Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-2',
      paymentMethod: 'potong_gaji'
    });

    // Verifikasi loan_repayments mencatat nominal riil setoran Rp 7 dan nomor kwitansi
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      loan_id: 'loan-1',
      schedule_id: 'sched-partial-1',
      amount_paid: 7,
      payment_method: 'potong_gaji',
      notes: 'Kwitansi: KW-SELISIH-02 - Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-2',
      receipt_number: 'KW-SELISIH-02'
    }));

    // Verifikasi loan_schedules diakumulasikan ke target penuh 277778 dan berstatus 'paid'
    expect(updateScheduleMock).toHaveBeenCalledWith({
      paid_amount: 277778,
      status: 'paid'
    });

    // Verifikasi update status pinjaman jika seluruh jadwal terpenuhi
    expect(updateLoanMock).toHaveBeenCalledWith({
      status: 'completed'
    });
  });

  it('melunasi jadwal dengan toleransi pembulatan +/- 5 Rupiah atau target floating point (contoh: 238095.23809523694)', async () => {
    const updateScheduleMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'sched-float-42',
                  loan_id: 'loan-42',
                  target_amount: 238095.23809523694,
                  paid_amount: 0,
                  status: 'unpaid'
                },
                error: null
              }),
              mockResolvedValue: {
                data: [{ id: 'sched-float-42', status: 'paid', paid_amount: 238095, target_amount: 238095.23809523694 }],
                error: null
              }
            })
          }),
          update: updateScheduleMock
        };
      }
      if (table === 'loan_repayments') {
        return {
          insert: insertMock
        };
      }
      if (table === 'loans') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        };
      }
      return {};
    });

    await toggleLoanSchedulePaid('sched-float-42', true, {
      amount: 238095,
      receiptNo: 'KW-42',
      paymentMethod: 'potong_gaji'
    });

    // Harus lunas ('paid') dan target dibulatkan rapi ke 238095
    expect(updateScheduleMock).toHaveBeenCalledWith({
      paid_amount: 238095,
      status: 'paid'
    });
  });
});

describe('loanMatrixService - calculateRemainingInstallmentDeficit', () => {
  it('menghitung sisa kekurangan angsuran secara presisi (target - paid)', () => {
    // Skenario pembulatan angsuran (misal 277.778 vs 277.771 -> defisit 7)
    expect(calculateRemainingInstallmentDeficit(277778, 277771)).toBe(7);

    // Skenario floating point (misal 238095.23809523694 -> 238095)
    expect(calculateRemainingInstallmentDeficit(238095.23809523694, 0)).toBe(238095);
    expect(calculateRemainingInstallmentDeficit(238095.23809523694, 238095)).toBe(0);

    // Belum dibayar sama sekali
    expect(calculateRemainingInstallmentDeficit(500000, 0)).toBe(500000);

    // Sudah dibayar sebagian
    expect(calculateRemainingInstallmentDeficit(500000, 200000)).toBe(300000);

    // Sudah lunas pas
    expect(calculateRemainingInstallmentDeficit(500000, 500000)).toBe(0);

    // Pembayaran melebihi target (tidak boleh negatif)
    expect(calculateRemainingInstallmentDeficit(500000, 600000)).toBe(0);

    // Null / undefined / 0 fallback
    expect(calculateRemainingInstallmentDeficit(0, 0)).toBe(0);
    expect(calculateRemainingInstallmentDeficit(undefined as any, null as any)).toBe(0);
  });
});

describe('loanMatrixService - autoReconcileLoanInstallments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengalokasikan saldo FIFO secara berurutan: lunas penuh di periode awal, parsial di periode sisa, nol di periode akhir', async () => {
    const mockSchedules = [
      { id: 'sc-1', loan_id: 'l-1', period_number: 1, target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
      { id: 'sc-2', loan_id: 'l-1', period_number: 2, target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
      { id: 'sc-3', loan_id: 'l-1', period_number: 3, target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
    ];

    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const updateScheduleMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const insertRepayMock = vi.fn().mockResolvedValue({ error: null });
    const updateLoanMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null })
            })
          }),
          update: updateScheduleMock
        };
      }
      if (table === 'loan_repayments') {
        return {
          delete: deleteMock,
          insert: insertRepayMock
        };
      }
      if (table === 'loans') {
        return {
          update: updateLoanMock
        };
      }
      return {};
    });

    const result = await autoReconcileLoanInstallments('l-1', 2500000);

    expect(deleteMock).toHaveBeenCalled();
    expect(result.reconciledCount).toBe(2);
    expect(result.remainingAmount).toBe(0);

    expect(updateScheduleMock).toHaveBeenCalledWith({ paid_amount: 1000000, status: 'paid' });
    expect(updateScheduleMock).toHaveBeenCalledWith({ paid_amount: 500000, status: 'partial' });

    expect(insertRepayMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ schedule_id: 'sc-1', amount_paid: 1000000 }),
        expect.objectContaining({ schedule_id: 'sc-2', amount_paid: 1000000 }),
        expect.objectContaining({ schedule_id: 'sc-3', amount_paid: 500000 }),
      ])
    );

    expect(updateLoanMock).toHaveBeenCalledWith({ status: 'active' });
  });

  it('mengupdate status loan ke completed bila alokasi FIFO melunasi seluruh jadwal', async () => {
    const mockSchedules = [
      { id: 'sc-1', loan_id: 'l-1', period_number: 1, target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
      { id: 'sc-2', loan_id: 'l-1', period_number: 2, target_amount: 1000000, paid_amount: 0, status: 'unpaid' }
    ];

    const updateLoanMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null })
            })
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
        };
      }
      if (table === 'loan_repayments') {
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          insert: vi.fn().mockResolvedValue({ error: null })
        };
      }
      if (table === 'loans') {
        return {
          update: updateLoanMock
        };
      }
      return {};
    });

    const result = await autoReconcileLoanInstallments('l-1', 2000000);
    expect(result.success).toBe(true);
    expect(result.reconciledCount).toBe(2);
    expect(result.remainingAmount).toBe(0);
    expect(updateLoanMock).toHaveBeenCalledWith({ status: 'completed' });
  });

  it('rekonsiliasi otomatis skenario Eko Setiawan: saldo terangsur Rp 8.333.333 mengalokasikan 10 bulan lunas dan 1 bulan parsial', async () => {
    // 12 periode @ 833.333
    const mockSchedules = Array.from({ length: 12 }, (_, i) => ({
      id: `sc-${i + 1}`,
      loan_id: 'loan-eko',
      period_number: i + 1,
      target_amount: 833333,
      paid_amount: 0,
      status: 'unpaid',
    }));

    const updateScheduleMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const insertRepayMock = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null }),
            }),
          }),
          update: updateScheduleMock,
        };
      }
      if (table === 'loan_repayments') {
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          insert: insertRepayMock,
        };
      }
      if (table === 'loans') {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {};
    });

    // Eksekusi dengan nominal terangsur Rp 8.333.333
    const result = await autoReconcileLoanInstallments('loan-eko', 8333333);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Alokasi angsuran berhasil dicocokkan otomatis.');
    // 10 bulan terbayar lunas penuh (10 * 833.333 = 8.333.330)
    expect(result.reconciledCount).toBe(10);
    expect(result.remainingAmount).toBe(0);

    // Bulan 1 s/d 10 diupdate ke paid
    expect(updateScheduleMock).toHaveBeenCalledWith({ paid_amount: 833333, status: 'paid' });
    // Bulan 11 diupdate ke partial (sisa 3 rupiah)
    expect(updateScheduleMock).toHaveBeenCalledWith({ paid_amount: 3, status: 'partial' });
    // Bulan 12 diupdate ke unpaid (0 rupiah)
    expect(updateScheduleMock).toHaveBeenCalledWith({ paid_amount: 0, status: 'unpaid' });

    // Verifikasi catatan pembayaran loan_repayments menggunakan payment_method REKONSILIASI_IMPOR
    expect(insertRepayMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          loan_id: 'loan-eko',
          schedule_id: 'sc-1',
          amount_paid: 833333,
          payment_method: 'REKONSILIASI_IMPOR',
          notes: 'Pelunasan Otomatis Angsuran Bulan ke-1',
        }),
        expect.objectContaining({
          loan_id: 'loan-eko',
          schedule_id: 'sc-11',
          amount_paid: 3,
          payment_method: 'REKONSILIASI_IMPOR',
          notes: 'Pelunasan Parsial Angsuran Bulan ke-11',
        }),
      ])
    );
  });
});

describe('loanMatrixService - checkAllLoanUpToCurrentMonth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('melunasi seluruh jadwal yang jatuh tempo s/d akhir bulan berjalan saat ini', async () => {
    const mockSchedules = [
      { id: 'sc-1', loan_id: 'l-1', period_number: 1, due_date: '2026-01-15', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sc-2', loan_id: 'l-1', period_number: 2, due_date: '2026-02-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
      { id: 'sc-3', loan_id: 'l-1', period_number: 3, due_date: '2026-06-25', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
      { id: 'sc-4', loan_id: 'l-1', period_number: 4, due_date: '2026-07-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid' }
    ];

    const deleteRepayMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const insertRepayMock = vi.fn().mockResolvedValue({ error: null });
    const updateScheduleMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const updateLoanMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === '*') {
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null })
                })
              };
            }
            return {
              eq: vi.fn().mockResolvedValue({
                data: [
                  { status: 'paid', paid_amount: 1000000, target_amount: 1000000 },
                  { status: 'paid', paid_amount: 1000000, target_amount: 1000000 },
                  { status: 'paid', paid_amount: 1000000, target_amount: 1000000 },
                  { status: 'unpaid', paid_amount: 0, target_amount: 1000000 }
                ],
                error: null
              })
            };
          }),
          update: updateScheduleMock
        };
      }
      if (table === 'loan_repayments') {
        return {
          delete: deleteRepayMock,
          insert: insertRepayMock
        };
      }
      if (table === 'loans') {
        return {
          update: updateLoanMock
        };
      }
      return {};
    });

    const res = await checkAllLoanUpToCurrentMonth('l-1');
    expect(res.checkedCount).toBe(2);
    expect(updateScheduleMock).toHaveBeenCalledTimes(2);
    expect(insertRepayMock).toHaveBeenCalledTimes(2);
    expect(updateLoanMock).not.toHaveBeenCalledWith({ status: 'completed' });
  });
});

describe('loanMatrixService - uncheckAllLoanSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mereset seluruh pelunasan pinjaman: menghapus repayments, reset schedules ke 0 unpaid, dan set loan active', async () => {
    const deleteRepayMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const updateScheduleMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const updateLoanMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_repayments') {
        return {
          delete: deleteRepayMock
        };
      }
      if (table === 'loan_schedules') {
        return {
          update: updateScheduleMock
        };
      }
      if (table === 'loans') {
        return {
          update: updateLoanMock
        };
      }
      return {};
    });

    await uncheckAllLoanSchedules('l-1');

    expect(deleteRepayMock).toHaveBeenCalled();
    expect(updateScheduleMock).toHaveBeenCalledWith({
      paid_amount: 0,
      status: 'unpaid'
    });
    expect(updateLoanMock).toHaveBeenCalledWith({
      status: 'active'
    });
  });
});

describe('loanMatrixService - getImportedRepaidBalance & Bulk Actions Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getImportedRepaidBalance', () => {
    it('returns jumlah_terangsur when present and > 0', () => {
      const balance = getImportedRepaidBalance({
        principal_amount: 10000000,
        jumlah_terangsur: 5000000,
      });
      expect(balance).toBe(5000000);
    });

    it('calculates principal - sisa_pinjaman correctly when sisa_pinjaman is provided', () => {
      const balance = getImportedRepaidBalance({
        principal_amount: 10000000,
        sisa_pinjaman: 3000000,
      });
      expect(balance).toBe(7000000);
    });

    it('extracts sisa from notes regex when sisa_pinjaman is absent', () => {
      const balance = getImportedRepaidBalance({
        principal_amount: 5000000,
        notes: 'Impor pinjaman lama. Sisa: Rp 2.000.000',
      });
      expect(balance).toBe(3000000);
    });

    it('returns 0 when loan is null or has no repaid balance', () => {
      expect(getImportedRepaidBalance(null)).toBe(0);
      expect(getImportedRepaidBalance({})).toBe(0);
    });
  });

  describe('bulkCheckAllLoansUpToCurrentMonth', () => {
    it('iterates through all active loans and invokes checkAllLoanUpToCurrentMonth with progress', async () => {
      const mockLoans = [
        { id: 'loan-1', loan_number: 'LP-001', status: 'active', member: { id: 'm-1', nrp: '101', nama: 'Budi' } },
        { id: 'loan-2', loan_number: 'LP-002', status: 'approved', member: { id: 'm-2', nrp: '102', nama: 'Siti' } },
      ];

      const mockSchedules = [
        { id: 'sc-1', loan_id: 'loan-1', period_number: 1, due_date: '2026-01-10', target_amount: 500000, paid_amount: 0, status: 'unpaid' }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const progressSpy = vi.fn();
      const result = await bulkCheckAllLoansUpToCurrentMonth(progressSpy);

      expect(result.totalLoans).toBe(2);
      expect(result.totalSuccess).toBe(2);
      expect(result.totalFailed).toBe(0);
      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(0);
      expect(progressSpy).toHaveBeenCalledTimes(2);
      expect(progressSpy).toHaveBeenLastCalledWith({
        processed: 2,
        total: 2,
        currentMemberName: 'Siti',
        currentLoanNumber: 'LP-002',
      });
    });

    it('inserts repayments with payment_method POTONG_GAJI, receipt_number, and created_by', async () => {
      const mockLoans = [
        { id: 'loan-1', loan_number: 'LP-999', status: 'active', member: { id: 'm-1', nrp: '999', nama: 'Ahmad' } },
      ];
      const mockSchedules = [
        { id: 'sc-1', loan_id: 'loan-1', period_number: 1, due_date: '2026-01-15', target_amount: 300000, paid_amount: 100000, status: 'partial' },
      ];

      const repaymentInsertMock = vi.fn().mockResolvedValue({ error: null });
      const scheduleUpdateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null }),
              }),
            }),
            update: scheduleUpdateMock,
          };
        }
        if (table === 'loan_repayments') {
          return {
            insert: repaymentInsertMock,
          };
        }
        return {};
      });

      (supabase as any).auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-uuid-123' } } }),
      };

      const result = await bulkCheckAllLoansUpToCurrentMonth();

      expect(result.totalSuccess).toBe(1);
      expect(scheduleUpdateMock).toHaveBeenCalledWith({
        paid_amount: 300000,
        status: 'paid',
      });
      expect(repaymentInsertMock).toHaveBeenCalledTimes(1);
      const insertedRows = repaymentInsertMock.mock.calls[0][0];
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0]).toMatchObject({
        loan_id: 'loan-1',
        schedule_id: 'sc-1',
        amount_paid: 200000, // 300000 - 100000
        payment_method: 'POTONG_GAJI',
        created_by: 'admin-uuid-123',
      });
      expect(insertedRows[0].receipt_number).toMatch(/^KW\d{4}-\d{4}$/);
    });

    it('retries repayment insert with fallback schema when extended columns trigger schema error', async () => {
      const mockLoans = [
        { id: 'loan-1', loan_number: 'LP-111', status: 'active', member: { id: 'm-1', nrp: '111', nama: 'Doni' } },
      ];
      const mockSchedules = [
        { id: 'sc-1', loan_id: 'loan-1', period_number: 1, due_date: '2026-02-10', target_amount: 400000, paid_amount: 0, status: 'unpaid' },
      ];

      const repaymentInsertMock = vi.fn()
        .mockResolvedValueOnce({ error: { message: "column 'receipt_number' does not exist", code: '42703' } })
        .mockResolvedValueOnce({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            insert: repaymentInsertMock,
          };
        }
        return {};
      });

      const result = await bulkCheckAllLoansUpToCurrentMonth();

      expect(result.totalSuccess).toBe(1);
      expect(result.totalFailed).toBe(0);
      expect(repaymentInsertMock).toHaveBeenCalledTimes(2);
      // Fallback row should have standard columns without receipt_number or created_by
      const fallbackRows = repaymentInsertMock.mock.calls[1][0];
      expect(fallbackRows[0]).toEqual(expect.objectContaining({
        loan_id: 'loan-1',
        schedule_id: 'sc-1',
        amount_paid: 400000,
        payment_method: 'POTONG_GAJI',
      }));
      expect(fallbackRows[0].receipt_number).toBeUndefined();
    });

    it('isolates errors per loan and continues processing other loans', async () => {
      const mockLoans = [
        { id: 'loan-fail', loan_number: 'LP-ERR', status: 'active', member: { id: 'm-err', nrp: '000', nama: 'Error Member' } },
        { id: 'loan-pass', loan_number: 'LP-OK', status: 'active', member: { id: 'm-ok', nrp: '999', nama: 'OK Member' } },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (val === 'loan-fail') {
                  return {
                    order: vi.fn().mockResolvedValue({ data: null, error: new Error('PostgREST query deadlock') }),
                  };
                }
                return {
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'sc-ok', loan_id: 'loan-pass', period_number: 1, due_date: '2026-01-10', target_amount: 250000, paid_amount: 0, status: 'unpaid' }
                    ],
                    error: null,
                  }),
                };
              }),
            })),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const result = await bulkCheckAllLoansUpToCurrentMonth();

      expect(result.totalLoans).toBe(2);
      expect(result.totalSuccess).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toEqual({
        loanId: 'loan-fail',
        error: 'PostgREST query deadlock',
      });
    });
  });

  describe('bulkCheckAllLoansUpToMonth', () => {
    it('settles December 2026 projected schedules with restrictToTargetYear, ignores other years, records sequential +10ms cash_flow timestamps, and completes fully paid loans', async () => {
      const mockLoans = [
        {
          id: 'loan-2',
          loan_number: 'LP-2026-02',
          status: 'active',
          principal_amount: 1100000,
          member: { id: 'm-2', nrp: '002', nama: 'Anggota Tes 2', status: 'aktif', membership_status: 'ACTIVE' },
        },
        {
          id: 'loan-1',
          loan_number: 'LP-2026-01',
          status: 'active',
          principal_amount: 200000,
          member: { id: 'm-1', nrp: '001', nama: 'anggota tes 1', status: 'aktif', membership_status: 'ACTIVE' },
        },
      ];

      const schedulesByLoan: Record<string, any[]> = {
        'loan-1': [
          { id: 'sc-1-2025', loan_id: 'loan-1', period_number: 1, due_date: '2025-12-20', target_amount: 200000, paid_amount: 0, status: 'unpaid' },
          { id: 'sc-1-dec26', loan_id: 'loan-1', period_number: 2, due_date: '2026-12-20', target_amount: 200000, paid_amount: 0, status: 'unpaid' },
          { id: 'sc-1-jan27', loan_id: 'loan-1', period_number: 3, due_date: '2027-01-20', target_amount: 200000, paid_amount: 0, status: 'unpaid' },
        ],
        'loan-2': [
          { id: 'sc-2-dec26', loan_id: 'loan-2', period_number: 1, due_date: '2026-12-15', target_amount: 1100000, paid_amount: 0, status: 'unpaid' },
        ],
      };

      const scheduleUpdates: Array<{ id: string; payload: any }> = [];
      const loanUpdates: Array<{ id: string; payload: any }> = [];
      const insertedRepayments: any[] = [];
      const insertedCashFlows: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
            update: vi.fn().mockImplementation((payload: any) => ({
              eq: vi.fn().mockImplementation((_col: string, id: string) => {
                loanUpdates.push({ id, payload });
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockImplementation((cols: string) => ({
              eq: vi.fn().mockImplementation((_col: string, loanId: string) => {
                const rows = schedulesByLoan[loanId] || [];
                const effectiveRows =
                  cols === '*'
                    ? rows
                    : rows.map(r => ({
                        ...r,
                        status: scheduleUpdates.some(u => u.id === r.id) ? 'paid' : r.status,
                      }));
                return {
                  order: vi.fn().mockResolvedValue({ data: effectiveRows, error: null }),
                };
              }),
            })),
            update: vi.fn().mockImplementation((payload: any) => ({
              eq: vi.fn().mockImplementation((_col: string, id: string) => {
                scheduleUpdates.push({ id, payload });
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'loan_repayments') {
          return {
            insert: vi.fn().mockImplementation((rows: any[]) => {
              insertedRepayments.push(...rows);
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockImplementation((rows: any[]) => {
              insertedCashFlows.push(...rows);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      });

      const res = await bulkCheckAllLoansUpToMonth({
        targetYear: 2026,
        targetMonth: 12,
        paymentDate: '2026-11-23',
        restrictToTargetYear: true,
      });

      expect(res.totalLoans).toBe(2);
      expect(res.totalSuccess).toBe(2);
      expect(res.totalFailed).toBe(0);
      expect(res.totalInstallmentsPaid).toBe(2);
      expect(res.totalAmountCollected).toBe(1300000);

      // Sorted by NRP ASC: '001' (loan-1) first, then '002' (loan-2)
      expect(scheduleUpdates.map(u => u.id)).toEqual(['sc-1-dec26', 'sc-2-dec26']);

      // Sequential +10ms timestamps on the chosen paymentDate (local 2026-11-23)
      expect(insertedCashFlows).toHaveLength(2);
      expect(insertedCashFlows[0].direction).toBe('in');
      expect(insertedCashFlows[0].category).toBe('angsuran_pinjaman');
      expect(insertedCashFlows[0].amount).toBe(200000);
      expect(insertedCashFlows[1].amount).toBe(1100000);

      const t0 = new Date(insertedCashFlows[0].created_at).getTime();
      const t1 = new Date(insertedCashFlows[1].created_at).getTime();
      expect(t1 - t0).toBe(10);
      expect(insertedRepayments[0].payment_date).toBe(insertedCashFlows[0].created_at);
      expect(insertedRepayments[1].payment_date).toBe(insertedCashFlows[1].created_at);
      expect(insertedRepayments[0].notes).toBe('Centang Massal Angsuran s/d Bulan 12/2026');

      // loan-2 had only sc-2-dec26 so all schedules are now paid -> marked completed
      expect(loanUpdates).toEqual([{ id: 'loan-2', payload: { status: 'completed' } }]);
    });

    it('filters active loans by provided loanIds when specified', async () => {
      const mockLoans = [
        { id: 'loan-a', loan_number: 'LP-A', status: 'active', member: { id: 'm-a', nrp: '001', nama: 'A', status: 'aktif', membership_status: 'ACTIVE' } },
        { id: 'loan-b', loan_number: 'LP-B', status: 'active', member: { id: 'm-b', nrp: '002', nama: 'B', status: 'aktif', membership_status: 'ACTIVE' } },
      ];
      const schedEqSpy = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({ eq: schedEqSpy }),
          };
        }
        return {};
      });

      const res = await bulkCheckAllLoansUpToMonth({
        targetYear: 2026,
        targetMonth: 12,
        loanIds: ['loan-b'],
        restrictToTargetYear: true,
      });

      expect(res.totalLoans).toBe(1);
      expect(schedEqSpy).toHaveBeenCalledWith('loan_id', 'loan-b');
      expect(schedEqSpy).not.toHaveBeenCalledWith('loan_id', 'loan-a');
    });
  });

  describe('bulkAutoReconcileAllLoans', () => {
    it('iterates through all loans and reconciles using getImportedRepaidBalance', async () => {
      const mockLoans = [
        {
          id: 'loan-1',
          loan_number: 'LP-001',
          principal_amount: 10000000,
          jumlah_terangsur: 5000000,
          status: 'active',
          member: { id: 'm-1', nrp: '101', nama: 'Agus' },
        },
      ];

      const mockSchedules = [
        { id: 'sc-1', loan_id: 'loan-1', period_number: 1, target_amount: 2500000, paid_amount: 0, status: 'unpaid' },
        { id: 'sc-2', loan_id: 'loan-1', period_number: 2, target_amount: 2500000, paid_amount: 0, status: 'unpaid' },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const progressSpy = vi.fn();
      const result = await bulkAutoReconcileAllLoans(progressSpy);

      expect(result.totalLoans).toBe(1);
      expect(result.totalSuccess).toBe(1);
      expect(result.totalFailed).toBe(0);
      expect(progressSpy).toHaveBeenCalledWith({
        processed: 1,
        total: 1,
        currentMemberName: 'Agus',
        currentLoanNumber: 'LP-001',
      });
    });
  });

  describe('bulkAutoReconcileLoans (Resilient FIFO Engine)', () => {
    it('successfully reconciles loans with FIFO allocation and calls onProgress(current, total, loanNumber)', async () => {
      const mockLoans = [
        {
          id: 'loan-1',
          loan_number: 'LP-101',
          principal_amount: 6000000,
          jumlah_terangsur: 4000000,
          status: 'active',
          member: { id: 'm-1', nrp: '101', nama: 'Budi' },
        },
        {
          id: 'loan-2',
          loan_number: 'LP-102',
          principal_amount: 5000000,
          sisa_pinjaman: 3000000,
          jumlah_terangsur: null,
          status: 'active',
          member: { id: 'm-2', nrp: '102', nama: 'Citra' },
        },
      ];

      const schedulesMap: Record<string, any[]> = {
        'loan-1': [
          { id: 'sc-1', loan_id: 'loan-1', period_number: 1, target_amount: 2000000, paid_amount: 0, status: 'unpaid' },
          { id: 'sc-2', loan_id: 'loan-1', period_number: 2, target_amount: 2000000, paid_amount: 0, status: 'unpaid' },
          { id: 'sc-3', loan_id: 'loan-1', period_number: 3, target_amount: 2000000, paid_amount: 0, status: 'unpaid' },
        ],
        'loan-2': [
          { id: 'sc-4', loan_id: 'loan-2', period_number: 1, target_amount: 1500000, paid_amount: 0, status: 'unpaid' },
          { id: 'sc-5', loan_id: 'loan-2', period_number: 2, target_amount: 1500000, paid_amount: 0, status: 'unpaid' },
        ],
      };

      const updatedSchedules: any[] = [];
      const insertedRepayments: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => ({
                order: vi.fn().mockResolvedValue({ data: schedulesMap[val] || [], error: null }),
              })),
            }),
            update: vi.fn().mockImplementation((upd) => ({
              eq: vi.fn().mockImplementation((col, id) => {
                updatedSchedules.push({ id, ...upd });
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'loan_repayments') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
            insert: vi.fn().mockImplementation((rows) => {
              insertedRepayments.push(...rows);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      });

      const progressHistory: Array<{ current: number; total: number; loanNumber: string }> = [];
      const result = await bulkAutoReconcileLoans((current, total, loanNumber) => {
        progressHistory.push({ current, total, loanNumber });
      });

      expect(result.totalSuccess).toBe(2);
      expect(result.totalFailed).toBe(0);
      expect(result.errors).toEqual([]);
      expect(progressHistory).toEqual([
        { current: 1, total: 2, loanNumber: 'LP-101' },
        { current: 2, total: 2, loanNumber: 'LP-102' },
      ]);

      // Loan 1 (repaid 4jt): period 1 (2jt) paid, period 2 (2jt) paid, period 3 unpaid
      expect(updatedSchedules).toContainEqual({ id: 'sc-1', paid_amount: 2000000, status: 'paid' });
      expect(updatedSchedules).toContainEqual({ id: 'sc-2', paid_amount: 2000000, status: 'paid' });
      expect(updatedSchedules).toContainEqual({ id: 'sc-3', paid_amount: 0, status: 'unpaid' });

      // Loan 2 (principal 5jt - sisa 3jt = 2jt): period 1 (1.5jt) paid, period 2 (500rb) partial
      expect(updatedSchedules).toContainEqual({ id: 'sc-4', paid_amount: 1500000, status: 'paid' });
      expect(updatedSchedules).toContainEqual({ id: 'sc-5', paid_amount: 500000, status: 'partial' });

      // Verify repayment rows inserted
      expect(insertedRepayments.length).toBe(4);
      expect(insertedRepayments[0].payment_method).toBe('REKONSILIASI_IMPOR');
      expect(insertedRepayments[0].receipt_number).toMatch(/^KW\d{4}-0001$/);
      expect(insertedRepayments[1].receipt_number).toMatch(/^KW\d{4}-0002$/);
      expect(insertedRepayments[2].receipt_number).toMatch(/^KW\d{4}-0003$/);
      expect(insertedRepayments[3].receipt_number).toMatch(/^KW\d{4}-0004$/);
    });

    it('isolates errors per loan and continues processing other loans', async () => {
      const mockLoans = [
        {
          id: 'loan-err',
          loan_number: 'LP-ERR',
          principal_amount: 5000000,
          status: 'active',
        },
        {
          id: 'loan-ok',
          loan_number: 'LP-OK',
          principal_amount: 2000000,
          jumlah_terangsur: 2000000,
          status: 'active',
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => ({
                order: vi.fn().mockImplementation(() => {
                  if (val === 'loan-err') {
                    return Promise.reject(new Error('Schedule query timeout'));
                  }
                  return Promise.resolve({
                    data: [
                      { id: 'sc-ok-1', loan_id: 'loan-ok', period_number: 1, target_amount: 2000000, paid_amount: 0, status: 'unpaid' }
                    ],
                    error: null,
                  });
                }),
              })),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const result = await bulkAutoReconcileLoans();
      expect(result.totalSuccess).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('LP-ERR');
      expect(result.errors[0]).toContain('Schedule query timeout');
    });

    it('throws error when active loans query fails', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection failed' } }),
            }),
          };
        }
        return {};
      });

      await expect(bulkAutoReconcileLoans()).rejects.toThrow('Database connection failed');
    });
  });
});

describe('loanMatrixService - Pelacakan Jadwal Penuh Pinjaman (Full Schedule Tracking)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getLoanMatrixAvailableYears menampilkan seluruh rentang tahun pinjaman (2023-2028) tanpa pembatasan cut-off', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { disbursed_at: '2023-01-10T00:00:00.000Z', created_at: '2023-01-01T00:00:00.000Z' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { due_date: '2028-10-01' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'system_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { value: '2026-11-01' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const years = await getLoanMatrixAvailableYears();
    expect(years).toEqual([2028, 2027, 2026, 2025, 2024, 2023]);
  });

  it('getLoanMatrix melacak seluruh jadwal angsuran tahunan secara utuh tanpa pemotongan cut-off', async () => {
    const loans = [
      {
        id: 'loan-cut-1',
        loan_number: 'PJ-CUT-001',
        member_id: 'mem-cut-1',
        principal_amount: 12000000,
        agreed_tenor_months: 12,
        monthly_target: 1000000,
        status: 'active',
        disbursed_at: '2025-11-01T00:00:00.000Z',
        created_at: '2025-11-01T00:00:00.000Z',
        notes: 'Saldo Awal Pinjaman',
        member: { id: 'mem-cut-1', nrp: '77001122', nama: 'Mayor CutOff' },
        loan_types: { name: 'Pinjaman Reguler' },
      },
    ];

    const schedules = [
      { id: 'sc-9', loan_id: 'loan-cut-1', period_number: 9, due_date: '2026-09-15', target_amount: 1000000, paid_amount: 5000000, status: 'paid', loan: loans[0] },
      { id: 'sc-10', loan_id: 'loan-cut-1', period_number: 10, due_date: '2026-10-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid', loan: loans[0] },
      { id: 'sc-11', loan_id: 'loan-cut-1', period_number: 11, due_date: '2026-11-15', target_amount: 1000000, paid_amount: 1000000, status: 'paid', loan: loans[0] },
      { id: 'sc-12', loan_id: 'loan-cut-1', period_number: 12, due_date: '2026-12-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid', loan: loans[0] },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: loans, error: null }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [{ loan_id: 'loan-cut-1' }], error: null }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: schedules, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'system_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { value: '2026-11-01' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const matrix = await getLoanMatrix(2026);
    expect(matrix.cutoffDate).toBeNull();
    expect(matrix.cutoffYear).toBeNull();
    expect(matrix.cutoffMonth).toBeNull();
    expect(matrix.formattedCutoffDate).toBeNull();
    expect(matrix.unpaidMembersCount).toBe(0);
    expect(matrix.totalCollectedYTD).toBe(6000000);

    const row = matrix.members[0];
    expect(row.openingPaid).toBe(0);
    expect(row.openingRemaining).toBe(12000000);
    expect(row.months[9].status).toBe('PAID');
    expect(row.months[10].status).toBe('UNPAID');
    expect(row.months[11].status).toBe('PAID');
    expect(row.months[12].status).toBe('PROJECTED');
  });

  it('getLoanInteractiveGrid mengembalikan seluruh periode 1..N secara utuh dengan cutoffDate null', async () => {
    const mockLoan = {
      id: 'loan-grid-cut',
      loan_number: 'PJ-GRID-01',
      principal_amount: 6000000,
      amount: 6000000,
      tenor: 6,
      monthly_target: 1000000,
      disbursed_at: '2026-07-01T00:00:00.000Z',
      status: 'active',
      notes: 'Saldo Awal Pinjaman',
      member: { id: 'mem-grid-1', nama: 'Sertu Maju', nrp: '55443322' },
    };

    const mockSchedules = [
      { id: 'sg-1', loan_id: 'loan-grid-cut', period_number: 1, due_date: '2026-09-15', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sg-2', loan_id: 'loan-grid-cut', period_number: 2, due_date: '2026-10-15', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sg-3', loan_id: 'loan-grid-cut', period_number: 3, due_date: '2026-11-15', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sg-4', loan_id: 'loan-grid-cut', period_number: 4, due_date: '2026-12-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockLoan, error: null }),
            }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null }),
            }),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'system_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { setting_value: '2026-11-01' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const grid = await getLoanInteractiveGrid('loan-grid-cut');
    expect(grid.cutoffDate).toBeNull();
    expect(grid.formattedCutoffDate).toBeNull();
    expect(grid.openingPaidBalance).toBe(0);
    expect(grid.openingPaidPeriodsCount).toBe(0);
    expect(grid.openingRemainingBalance).toBe(6000000);
    expect(grid.forwardPaidTotal).toBe(3000000);
    expect(grid.totalPaid).toBe(3000000);
    expect(grid.sisaPinjaman).toBe(3000000);
    expect(grid.periods.map(p => p.periodNumber)).toEqual([1, 2, 3, 4]);
  });

  it('checkAllLoanUpToCurrentMonth & uncheckAllLoanSchedules beroperasi penuh pada seluruh jadwal tenor tanpa pemotongan cut-off', async () => {
    const schedules = [
      { id: 'pre-1', loan_id: 'loan-protect', period_number: 1, due_date: '2026-10-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
      { id: 'post-1', loan_id: 'loan-protect', period_number: 2, due_date: '2026-11-15', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
    ];
    const updatedIds: string[] = [];
    const updatedLoanIds: string[] = [];
    const deletedFilters: Array<{ method: string; value: any }> = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'loan-protect', notes: 'Saldo Awal Pinjaman' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'system_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { value: '2026-11-01' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        const eqResult: any = Promise.resolve({ data: schedules, error: null });
        eqResult.order = vi.fn().mockResolvedValue({ data: schedules, error: null });
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(eqResult),
          }),
          update: vi.fn().mockImplementation((_payload: any) => ({
            in: vi.fn().mockImplementation((_inCol: string, vals: string[]) => {
              updatedIds.push(...vals);
              return Promise.resolve({ error: null });
            }),
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'id') {
                updatedIds.push(val);
                return Promise.resolve({ error: null });
              }
              if (col === 'loan_id') {
                updatedLoanIds.push(val);
              }
              const eqUpdateResult: any = Promise.resolve({ error: null });
              eqUpdateResult.in = vi.fn().mockImplementation((_inCol: string, vals: string[]) => {
                updatedIds.push(...vals);
                return Promise.resolve({ error: null });
              });
              return eqUpdateResult;
            }),
          })),
        };
      }
      if (table === 'loan_repayments') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation((col2: string, vals: string[]) => {
              deletedFilters.push({ method: col2, value: vals });
              return Promise.resolve({ error: null });
            }),
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              const eqDeleteResult: any = Promise.resolve({ error: null }).then((res) => {
                deletedFilters.push({ method: col, value: val });
                return res;
              });
              eqDeleteResult.in = vi.fn().mockImplementation((col2: string, vals: string[]) => {
                deletedFilters.push({ method: col2, value: vals });
                return Promise.resolve({ error: null });
              });
              return eqDeleteResult;
            }),
          }),
        };
      }
      return {};
    });

    await checkAllLoanUpToCurrentMonth('loan-protect');
    expect(updatedIds).toEqual(['pre-1', 'post-1']);

    updatedIds.length = 0;
    updatedLoanIds.length = 0;
    deletedFilters.length = 0;
    await uncheckAllLoanSchedules('loan-protect');
    expect(updatedLoanIds).toEqual(['loan-protect']);
    expect(deletedFilters).toContainEqual({ method: 'loan_id', value: 'loan-protect' });
  });
});

describe('loanMatrixService - YTD Compliance for New Loans Without Due Schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets ytdCompliance / complianceYTD to 0 (not 100) for new loan with only future projected installments and prevents summary KPI inflation', async () => {
    const fajarMember = { id: 'mem-fajar', nrp: '92117229', nama: 'Fajar Ramadhan' };
    const existingLoan = {
      id: 'loan-fajar-old',
      loan_number: 'SALDO-AWAL-92117229-GAJISIPA',
      principal_amount: 1200000,
      tenor: 12,
      monthly_target: 100000,
      status: 'active',
      member: fajarMember,
    };
    const newLoan = {
      id: 'loan-fajar-new',
      loan_number: 'LOAN-1794768578628',
      principal_amount: 1500000,
      tenor: 12,
      monthly_target: 125000,
      disbursed_at: '2026-11-10T00:00:00.000Z',
      status: 'approved',
      member: fajarMember,
    };

    const existingSchedules = Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const isPaid = m <= 10;
      return {
        id: `sched-old-${m}`,
        period_number: m,
        due_date: `2026-${String(m).padStart(2, '0')}-25`,
        target_amount: 100000,
        paid_amount: isPaid ? 100000 : 0,
        status: isPaid ? 'paid' : 'unpaid',
        loan: existingLoan,
      };
    });

    const newLoanSchedules = [
      {
        id: 'sched-new-1',
        period_number: 1,
        due_date: '2026-12-25',
        target_amount: 125000,
        paid_amount: 0,
        status: 'unpaid',
        loan: newLoan,
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: existingLoan.id }, { id: newLoan.id }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [{ loan_id: existingLoan.id }, { loan_id: newLoan.id }],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [...existingSchedules, ...newLoanSchedules],
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(summary.members).toHaveLength(2);

    const oldRow = summary.members.find(m => m.loanNumber === 'SALDO-AWAL-92117229-GAJISIPA');
    expect(oldRow).toBeDefined();
    expect(oldRow?.complianceYTD).toBe(91);
    expect(oldRow?.ytdCompliance).toBe(91);
    expect(oldRow?.hasDueSchedulesYTD).toBe(true);
    expect(oldRow?.dueInstallmentsYTD).toBe(11);
    expect(oldRow?.paidInstallmentsYTD).toBe(10);

    const newRow = summary.members.find(m => m.loanNumber === 'LOAN-1794768578628');
    expect(newRow).toBeDefined();
    expect(newRow?.complianceYTD).toBe(0);
    expect(newRow?.ytdCompliance).toBe(0);
    expect(newRow?.hasDueSchedulesYTD).toBe(false);
    expect(newRow?.dueInstallmentsYTD).toBe(0);
    expect(newRow?.paidInstallmentsYTD).toBe(0);
    expect(newRow?.firstInstallmentLabel).toBe('Des 2026');
    expect(newRow?.months[12].status).toBe('PROJECTED');

    // Summary KPI only reflects the 10 paid out of 11 due (approx 90.9%), not pulled up to 100% by the new loan
    expect(summary.complianceYTD).toBeCloseTo((1000000 / 1100000) * 100, 2);
  });

  it('returns summary complianceYTD of 0 when only new loans without due schedules exist', async () => {
    const newLoan = {
      id: 'loan-only-future',
      loan_number: 'LOAN-FUTURE-001',
      principal_amount: 1500000,
      tenor: 12,
      monthly_target: 125000,
      status: 'approved',
      member: { id: 'mem-future', nrp: '99900011', nama: 'Anggota Baru' },
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: newLoan.id }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [{ loan_id: newLoan.id }],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'sched-f-1',
                      period_number: 1,
                      due_date: '2026-12-25',
                      target_amount: 125000,
                      paid_amount: 0,
                      status: 'unpaid',
                      loan: newLoan,
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(summary.members).toHaveLength(1);
    expect(summary.members[0].complianceYTD).toBe(0);
    expect(summary.members[0].hasDueSchedulesYTD).toBe(false);
    expect(summary.complianceYTD).toBe(0);
  });
});

describe('loanMatrixService - SUSPENDED (Nonaktif Sementara)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getLoanMatrix tetap menampilkan pinjaman anggota SUSPENDED dengan sel FROZEN dan mengecualikan dari menunggak & proyeksi bulan depan', async () => {
    const suspendedLoan = {
      id: 'loan-susp-1',
      loan_number: 'PJ-SUSP-01',
      member_id: 'mem-susp-1',
      principal_amount: 1500000,
      tenor: 3,
      monthly_target: 500000,
      status: 'active',
      member: {
        id: 'mem-susp-1',
        nrp: '88001122',
        nama: 'Serda Beku',
        status: 'nonaktif',
        membership_status: 'SUSPENDED',
        suspended_at: '2026-11-01T00:00:00.000Z',
        suspension_reason: 'Tugas Khusus',
      },
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ id: suspendedLoan.id }], error: null }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [{ loan_id: suspendedLoan.id }], error: null }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'sc-10', period_number: 1, due_date: '2026-10-15', target_amount: 500000, paid_amount: 500000, status: 'paid', loan: suspendedLoan },
                    { id: 'sc-11', period_number: 2, due_date: '2026-11-15', target_amount: 500000, paid_amount: 0, status: 'unpaid', loan: suspendedLoan },
                    { id: 'sc-12', period_number: 3, due_date: '2026-12-15', target_amount: 500000, paid_amount: 0, status: 'unpaid', loan: suspendedLoan },
                  ],
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(summary.members).toHaveLength(1);
    const row = summary.members[0];
    expect(row.membershipStatus).toBe('SUSPENDED');
    expect(row.months[10].status).toBe('PAID');
    expect(row.months[11].status).toBe('FROZEN');
    expect(row.months[12].status).toBe('FROZEN');
    expect(summary.unpaidMembersCount).toBe(0);
    expect(summary.projectedNextMonth).toBe(0);
    expect(row.complianceYTD).toBe(100);
  });

  it('bulkCheckAllLoansUpToCurrentMonth melewati pinjaman milik anggota SUSPENDED', async () => {
    const schedEqSpy = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'loan-act', loan_number: 'L-ACT', status: 'active', member: { id: 'm-act', nrp: '1', nama: 'Aktif', status: 'aktif', membership_status: 'ACTIVE' } },
                { id: 'loan-susp', loan_number: 'L-SUSP', status: 'active', member: { id: 'm-susp', nrp: '2', nama: 'Beku', status: 'nonaktif', membership_status: 'SUSPENDED' } },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({ eq: schedEqSpy }),
        };
      }
      return {};
    });

    const res = await bulkCheckAllLoansUpToCurrentMonth();
    expect(schedEqSpy).toHaveBeenCalledWith('loan_id', 'loan-act');
    expect(schedEqSpy).not.toHaveBeenCalledWith('loan_id', 'loan-susp');
    expect(res.totalSuccess).toBe(1);
  });

  it('menghitung ringkasan All-Time (totalPaidAllTime, paidInstallmentsCount, totalInstallmentsCount, repaymentProgressPct) lintas tahun secara konsisten', async () => {
    const loanObj = {
      id: 'loan-dedi',
      loan_number: 'LOAN-DEDI-01',
      member_id: 'm-dedi',
      principal_amount: 1000000,
      tenor: 8,
      agreed_tenor_months: 8,
      monthly_target: 125000,
      status: 'active',
      member: {
        id: 'm-dedi',
        nrp: '998877',
        nama: 'Dedi Kurnia',
        status: 'aktif',
        membership_status: 'ACTIVE',
      },
      loan_types: { id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler' },
    };

    const allSchedules = [
      { id: 's1', loan_id: 'loan-dedi', period_number: 1, due_date: '2026-12-01', target_amount: 125000, paid_amount: 125000, status: 'paid', loan: loanObj },
      { id: 's2', loan_id: 'loan-dedi', period_number: 2, due_date: '2027-01-01', target_amount: 125000, paid_amount: 125000, status: 'paid', loan: loanObj },
      { id: 's3', loan_id: 'loan-dedi', period_number: 3, due_date: '2027-02-01', target_amount: 125000, paid_amount: 125000, status: 'paid', loan: loanObj },
      { id: 's4', loan_id: 'loan-dedi', period_number: 4, due_date: '2027-03-01', target_amount: 125000, paid_amount: 0, status: 'unpaid', loan: loanObj },
      { id: 's5', loan_id: 'loan-dedi', period_number: 5, due_date: '2027-04-01', target_amount: 125000, paid_amount: 0, status: 'unpaid', loan: loanObj },
      { id: 's6', loan_id: 'loan-dedi', period_number: 6, due_date: '2027-05-01', target_amount: 125000, paid_amount: 0, status: 'unpaid', loan: loanObj },
      { id: 's7', loan_id: 'loan-dedi', period_number: 7, due_date: '2027-06-01', target_amount: 125000, paid_amount: 0, status: 'unpaid', loan: loanObj },
      { id: 's8', loan_id: 'loan-dedi', period_number: 8, due_date: '2027-07-01', target_amount: 125000, paid_amount: 0, status: 'unpaid', loan: loanObj },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ id: 'loan-dedi' }], error: null }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [{ loan_id: 'loan-dedi' }], error: null }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: allSchedules, error: null }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary2026 = await getLoanMatrix(2026);
    expect(summary2026.members).toHaveLength(1);
    const row2026 = summary2026.members[0];
    expect(row2026.totalPaidAllTime).toBe(375000);
    expect(row2026.paidInstallmentsCount).toBe(3);
    expect(row2026.totalInstallmentsCount).toBe(8);
    expect(row2026.remainingPrincipalAllTime).toBe(625000);
    expect(row2026.repaymentProgressPct).toBe(38);

    const summary2027 = await getLoanMatrix(2027);
    expect(summary2027.members).toHaveLength(1);
    const row2027 = summary2027.members[0];
    expect(row2027.totalPaidAllTime).toBe(375000);
    expect(row2027.paidInstallmentsCount).toBe(3);
    expect(row2027.totalInstallmentsCount).toBe(8);
    expect(row2027.remainingPrincipalAllTime).toBe(625000);
    expect(row2027.repaymentProgressPct).toBe(38);
  });

  it('toggleLoanSchedulePaid records principal_portion & margin_portion and cash_flow inflow for GOODS_MARKUP loan installments', async () => {
    const insertRepayMock = vi.fn().mockResolvedValue({ error: null });
    const insertCashFlowMock = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols.includes('loan:loans')) {
              return {
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'sched-brg-1',
                      loan_id: 'loan-brg-1',
                      period_number: 1,
                      target_amount: 460000,
                      principal_portion: 400000,
                      margin_portion: 60000,
                      paid_amount: 0,
                      status: 'unpaid',
                      loan: {
                        id: 'loan-brg-1',
                        loan_number: 'LOAN-BRG-01',
                        status: 'active',
                        principal_amount: 2300000,
                        amount: 2300000,
                        cost_price: 2000000,
                        markup_amount: 300000,
                        item_description: 'Kulkas 2 Pintu',
                        member: { nrp: '88010001', nama: 'Budi Santoso' },
                      },
                    },
                    error: null,
                  }),
                }),
              };
            }
            return {
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'sched-brg-1', status: 'paid', paid_amount: 460000, target_amount: 460000 },
                  { id: 'sched-brg-2', status: 'unpaid', paid_amount: 0, target_amount: 460000 },
                ],
                error: null,
              }),
            };
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return { insert: insertRepayMock };
      }
      if (table === 'cash_flow') {
        return { insert: insertCashFlowMock };
      }
      return {};
    });

    await toggleLoanSchedulePaid('sched-brg-1', true, {
      amount: 460000,
      paymentMethod: 'potong_gaji',
      receiptNo: 'KW-BRG-01',
    });

    expect(insertRepayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        loan_id: 'loan-brg-1',
        schedule_id: 'sched-brg-1',
        amount_paid: 460000,
        principal_portion: 400000,
        margin_portion: 60000,
      })
    );
    expect(insertCashFlowMock).toHaveBeenCalledTimes(1);
    const cfRow = insertCashFlowMock.mock.calls[0][0][0];
    expect(cfRow).toMatchObject({
      direction: 'in',
      amount: 460000,
      category: 'angsuran_pinjaman',
      reference_id: 'sched-brg-1',
    });
    expect(cfRow.description).toContain('Pokok: Rp 400.000');
    expect(cfRow.description).toContain('Margin: Rp 60.000');
  });

  it('getLoanMatrix(year, { includeLoanSearch }) includes matching completed/paid_off loans while default getLoanMatrix excludes them', async () => {
    const completedLoan = {
      id: 'loan-1795083121561',
      loan_number: 'LOAN-1795083121561',
      member_id: 'mem-surya',
      principal_amount: 2100000,
      amount: 2100000,
      cost_price: 2000000,
      markup_amount: 100000,
      item_description: 'TV 43 Inch',
      tenor: 1,
      agreed_tenor_months: 1,
      monthly_target: 2100000,
      disbursed_at: '2026-10-19',
      status: 'completed',
      member: { id: 'mem-surya', nrp: '87010011', nama: 'Surya Pratama', tanggal_lahir: '1985-05-20' },
      loan_types: { id: 'lt-brg', code: 'PEMBIAYAAN_BARANG', name: 'Pembiayaan Barang', financing_scheme: 'GOODS_MARKUP' },
    };

    const schedulesForCompleted = [
      {
        id: 'sg-1795083121561',
        loan_id: 'loan-1795083121561',
        period_number: 1,
        due_date: '2026-11-19',
        target_amount: 2100000,
        paid_amount: 2100000,
        status: 'paid',
        loan: completedLoan,
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols.includes('loan_number')) {
              return {
                ilike: vi.fn().mockResolvedValue({
                  data: [{ id: 'loan-1795083121561', loan_number: 'LOAN-1795083121561', status: 'completed' }],
                  error: null,
                }),
              };
            }
            return {
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [{ loan_id: 'loan-1795083121561' }],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: schedulesForCompleted,
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const defaultMatrix = await getLoanMatrix(2026);
    expect(defaultMatrix.members).toHaveLength(0);

    const searchedMatrix = await getLoanMatrix(2026, {
      includeLoanSearch: 'LOAN-1795083121561',
    });
    expect(searchedMatrix.members).toHaveLength(1);
    expect(searchedMatrix.members[0]).toMatchObject({
      loanId: 'loan-1795083121561',
      loanNumber: 'LOAN-1795083121561',
      isLoanActive: false,
      status: 'completed',
      complianceYTD: 100,
      totalPaidAllTime: 2100000,
      repaymentProgressPct: 100,
    });
  });

  it('synthesizes monthly projections in getLoanMatrix for active/berjalan loans with empty loan_schedules', async () => {
    vi.setSystemTime(new Date('2026-11-22T15:10:00.000+07:00'));

    const activeLoansWithoutSchedules = [
      {
        id: 'loan-tes-2',
        loan_number: 'LOAN-1795334228834',
        member_id: 'mem-tes-2',
        principal_amount: 3300000,
        amount: 3300000,
        tenor: 3,
        agreed_tenor_months: 3,
        monthly_target: 1100000,
        planned_installment_amount: 1100000,
        disbursed_at: '2026-11-22',
        created_at: '2026-11-22T08:00:00.000Z',
        status: 'berjalan',
        loan_types: { id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler' },
        member: {
          id: 'mem-tes-2',
          nrp: '200002',
          nama: 'Anggota Tes 2',
          status: 'aktif',
          membership_status: 'ACTIVE',
        },
      },
      {
        id: 'loan-tes-1',
        loan_number: 'LOAN-1795333396946',
        member_id: 'mem-tes-1',
        principal_amount: 2200000,
        amount: 2200000,
        tenor: 11,
        agreed_tenor_months: 11,
        monthly_target: 200000,
        planned_installment_amount: 200000,
        disbursed_at: '2026-11-22',
        created_at: '2026-11-22T07:00:00.000Z',
        status: 'active',
        loan_types: { id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler' },
        member: {
          id: 'mem-tes-1',
          nrp: '200001',
          nama: 'anggota tes 1',
          status: 'aktif',
          membership_status: 'ACTIVE',
        },
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'id') {
              return {
                in: vi.fn().mockResolvedValue({
                  data: activeLoansWithoutSchedules.map((l) => ({ id: l.id })),
                  error: null,
                }),
              };
            }
            return {
              in: vi.fn().mockResolvedValue({
                data: activeLoansWithoutSchedules,
                error: null,
              }),
            };
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(summary.members).toHaveLength(2);
    expect(summary.projectedNextMonth).toBe(1300000);

    const rowTes2 = summary.members.find((m) => m.loanNumber === 'LOAN-1795334228834');
    expect(rowTes2).toBeDefined();
    expect(rowTes2?.isLoanActive).toBe(true);
    expect(rowTes2?.months[12].status).toBe('PROJECTED');
    expect(rowTes2?.months[12].targetAmount).toBe(1100000);
    expect(rowTes2?.totalInstallmentsCount).toBe(3);

    const rowTes1 = summary.members.find((m) => m.loanNumber === 'LOAN-1795333396946');
    expect(rowTes1).toBeDefined();
    expect(rowTes1?.isLoanActive).toBe(true);
    expect(rowTes1?.months[12].status).toBe('PROJECTED');
    expect(rowTes1?.months[12].targetAmount).toBe(200000);
    expect(rowTes1?.totalInstallmentsCount).toBe(11);
  });

  it('falls back safely to enum-safe statuses when Postgres rejects extended status in loan_status enum', async () => {
    vi.setSystemTime(new Date('2026-11-22T15:10:00.000+07:00'));

    const activeLoan = {
      id: 'loan-enum-safe',
      loan_number: 'LOAN-ENUM-001',
      member_id: 'mem-enum-1',
      principal_amount: 1200000,
      amount: 1200000,
      tenor: 4,
      agreed_tenor_months: 4,
      monthly_target: 300000,
      disbursed_at: '2026-11-22',
      status: 'active',
      member: { id: 'mem-enum-1', nrp: '300001', nama: 'Anggota Enum', status: 'aktif', membership_status: 'ACTIVE' },
    };

    const statusInSpy = vi.fn().mockImplementation((_col: string, statuses: string[]) => {
      if (statuses.includes('berjalan')) {
        return Promise.resolve({
          data: null,
          error: { code: '22P02', message: 'invalid input value for enum loan_status: "berjalan"' },
        });
      }
      return Promise.resolve({
        data: [{ id: activeLoan.id }],
        error: null,
      });
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'id') {
              return { in: statusInSpy };
            }
            return {
              in: vi.fn().mockResolvedValue({ data: [activeLoan], error: null }),
            };
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const summary = await getLoanMatrix(2026);
    expect(statusInSpy).toHaveBeenCalledTimes(2);
    expect(summary.members).toHaveLength(1);
    expect(summary.members[0].loanNumber).toBe('LOAN-ENUM-001');
    expect(summary.members[0].months[12].targetAmount).toBe(300000);
    expect(summary.members[0].months[12].status).toBe('PROJECTED');
  });
});

describe('loanMatrixService - Sinkronisasi Realisasi Angsuran antara getLoanMatrix dan getLoanInteractiveGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T02:15:00.000+07:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('membaca pelunasan Bulan 1 [Des-26] untuk Anggota Tes 2 (LOAN-1795334228834) secara konsisten di getLoanMatrix dan getLoanInteractiveGrid', async () => {
    const loanObj = {
      id: 'loan-tes-2',
      loan_number: 'LOAN-1795334228834',
      member_id: 'mem-tes-2',
      principal_amount: 3300000,
      amount: 3300000,
      tenor: 3,
      agreed_tenor_months: 3,
      monthly_target: 1100000,
      planned_installment_amount: 1100000,
      disbursed_at: '2026-11-22',
      status: 'active',
      loan_types: { id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler' },
      member: {
        id: 'mem-tes-2',
        nrp: '200002',
        nama: 'Anggota Tes 2',
        status: 'aktif',
        membership_status: 'ACTIVE',
      },
    };

    const schedules = [
      { id: 'sc-tes2-1', loan_id: 'loan-tes-2', period_number: 1, due_date: '2026-12-23', target_amount: 1100000, paid_amount: 1100000, status: 'paid', loan: loanObj },
      { id: 'sc-tes2-2', loan_id: 'loan-tes-2', period_number: 2, due_date: '2027-01-23', target_amount: 1100000, paid_amount: 0, status: 'unpaid', loan: loanObj },
      { id: 'sc-tes2-3', loan_id: 'loan-tes-2', period_number: 3, due_date: '2027-02-23', target_amount: 1100000, paid_amount: 0, status: 'unpaid', loan: loanObj },
    ];

    const repayments = [
      { id: 'rep-tes2-1', loan_id: 'loan-tes-2', schedule_id: 'sc-tes2-1', amount_paid: 1100000, payment_date: '2026-11-23T01:00:00Z', payment_method: 'potong_gaji' },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'id') {
              return { in: vi.fn().mockResolvedValue({ data: [{ id: 'loan-tes-2' }], error: null }) };
            }
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: loanObj, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [{ loan_id: 'loan-tes-2' }], error: null }),
                }),
              };
            }
            if (cols === '*') {
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: schedules, error: null }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: schedules, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: repayments, error: null }),
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: repayments, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const matrix = await getLoanMatrix(2026);
    const grid = await getLoanInteractiveGrid('loan-tes-2');

    expect(matrix.members).toHaveLength(1);
    const row = matrix.members[0];
    expect(row.months[12].status).toBe('PAID');
    expect(row.months[12].paidAmount).toBe(1100000);
    expect(row.months[12].cumulativePaidAmount).toBe(1100000);
    expect(row.months[12].remainingBalance).toBe(2200000);
    expect(row.totalPaidAllTime).toBe(1100000);
    expect(row.paidInstallmentsCount).toBe(1);
    expect(row.totalInstallmentsCount).toBe(3);
    expect(row.complianceYTD).toBe(100);
    expect(matrix.totalCollectedYTD).toBe(1100000);

    expect(grid.totalPaid).toBe(1100000);
    expect(grid.sisaPinjaman).toBe(2200000);
    expect(grid.periods[0].status).toBe('PAID');
  });

  it('tetap membaca status Lunas dan nominal terbayar saat status lunas/is_paid atau hanya tercatat di loan_repayments', async () => {
    const loanObj = {
      id: 'loan-sync-2',
      loan_number: 'LOAN-SYNC-002',
      member_id: 'mem-sync-2',
      principal_amount: 3300000,
      amount: 3300000,
      tenor: 3,
      agreed_tenor_months: 3,
      monthly_target: 1100000,
      status: 'active',
      member: { id: 'mem-sync-2', nrp: '200099', nama: 'Anggota Sync', status: 'aktif', membership_status: 'ACTIVE' },
    };

    const schedules = [
      { id: 'sc-s-1', loan_id: 'loan-sync-2', period_number: 1, due_date: '2026-12-23', target_amount: 1100000, paid_amount: 0, status: 'unpaid', loan: loanObj },
      { id: 'sc-s-2', loan_id: 'loan-sync-2', period_number: 2, due_date: '2027-01-23', target_amount: 1100000, paid_amount: 0, status: 'lunas', loan: loanObj },
      { id: 'sc-s-3', loan_id: 'loan-sync-2', period_number: 3, due_date: '2027-02-23', target_amount: 1100000, paid_amount: 0, status: 'unpaid', loan: loanObj },
    ];

    const repayments = [
      { id: 'rep-s-1', loan_id: 'loan-sync-2', schedule_id: 'sc-s-1', amount_paid: 1100000, payment_date: '2026-11-23T01:00:00Z', payment_method: 'transfer' },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ id: 'loan-sync-2' }], error: null }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [{ loan_id: 'loan-sync-2' }], error: null }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: schedules, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: repayments, error: null }),
          }),
        };
      }
      return {};
    });

    const matrix = await getLoanMatrix(2026);
    const row = matrix.members[0];
    expect(row.months[12].status).toBe('PAID');
    expect(row.months[12].paidAmount).toBe(1100000);
    expect(row.months[12].remainingBalance).toBe(2200000);
    expect(row.remainingPrincipalAllTime).toBe(1100000);
    expect(row.totalPaidAllTime).toBe(2200000);
    expect(row.paidInstallmentsCount).toBe(2);
    expect(row.totalInstallmentsCount).toBe(3);
  });

  it('mengalokasikan loan_repayments tanpa schedule_id secara FIFO ke jadwal 2026-12-22 untuk Anggota Tes 2 dan anggota tes 1 tanpa double-counting', async () => {
    const loanTes2 = {
      id: 'loan-tes-2',
      loan_number: 'LOAN-1795334228834',
      member_id: 'mem-tes-2',
      principal_amount: 3300000,
      amount: 3300000,
      tenor: 3,
      agreed_tenor_months: 3,
      monthly_target: 1100000,
      status: 'active',
      member: { id: 'mem-tes-2', nrp: '200002', nama: 'Anggota Tes 2', status: 'aktif', membership_status: 'ACTIVE' },
    };
    const loanTes1 = {
      id: 'loan-tes-1',
      loan_number: 'LOAN-1795333396946',
      member_id: 'mem-tes-1',
      principal_amount: 2200000,
      amount: 2200000,
      tenor: 11,
      agreed_tenor_months: 11,
      monthly_target: 200000,
      status: 'active',
      member: { id: 'mem-tes-1', nrp: '200001', nama: 'anggota tes 1', status: 'aktif', membership_status: 'ACTIVE' },
    };

    const schedules = [
      { id: 'sc-t2-1', loan_id: 'loan-tes-2', period_number: 1, due_date: '2026-12-22', target_amount: 1100000, paid_amount: 0, status: 'unpaid', loan: loanTes2 },
      { id: 'sc-t2-2', loan_id: 'loan-tes-2', period_number: 2, due_date: '2027-01-22', target_amount: 1100000, paid_amount: 0, status: 'unpaid', loan: loanTes2 },
      { id: 'sc-t2-3', loan_id: 'loan-tes-2', period_number: 3, due_date: '2027-02-22', target_amount: 1100000, paid_amount: 0, status: 'unpaid', loan: loanTes2 },
      { id: 'sc-t1-1', loan_id: 'loan-tes-1', period_number: 1, due_date: '2026-12-22', target_amount: 200000, paid_amount: 0, status: 'unpaid', loan: loanTes1 },
      ...Array.from({ length: 10 }, (_, idx) => ({
        id: `sc-t1-${idx + 2}`,
        loan_id: 'loan-tes-1',
        period_number: idx + 2,
        due_date: `2027-${String(idx + 1).padStart(2, '0')}-22`,
        target_amount: 200000,
        paid_amount: 0,
        status: 'unpaid',
        loan: loanTes1,
      })),
    ];

    const repayments = [
      { id: 'rep-t2-unlinked', loan_id: 'loan-tes-2', schedule_id: null, amount_paid: 1100000, payment_date: '2026-11-23T01:00:00Z', payment_method: 'transfer' },
      { id: 'rep-t1-unlinked', loan_id: 'loan-tes-1', schedule_id: null, amount_paid: 200000, payment_date: '2026-11-23T01:00:00Z', payment_method: 'transfer' },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'id') {
              return { in: vi.fn().mockResolvedValue({ data: [{ id: 'loan-tes-2' }, { id: 'loan-tes-1' }], error: null }) };
            }
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: loanTes2, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [{ loan_id: 'loan-tes-2' }, { loan_id: 'loan-tes-1' }], error: null }),
                }),
              };
            }
            if (cols === '*') {
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: schedules.filter(s => s.loan_id === 'loan-tes-2'), error: null }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: schedules, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: repayments, error: null }),
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: repayments.filter(r => r.loan_id === 'loan-tes-2'), error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const matrix = await getLoanMatrix(2026);
    expect(matrix.totalCollectedYTD).toBe(1300000);
    expect(matrix.complianceYTD).toBe(100);

    const row2 = matrix.members.find(m => m.loanNumber === 'LOAN-1795334228834')!;
    expect(row2.months[12].status).toBe('PAID');
    expect(row2.months[12].paidAmount).toBe(1100000);
    expect(row2.paidInstallmentsCount).toBe(1);
    expect(row2.totalInstallmentsCount).toBe(3);
    expect(row2.complianceYTD).toBe(100);
    expect(row2.totalPaidAllTime).toBe(1100000);

    const row1 = matrix.members.find(m => m.loanNumber === 'LOAN-1795333396946')!;
    expect(row1.months[12].status).toBe('PAID');
    expect(row1.months[12].paidAmount).toBe(200000);
    expect(row1.paidInstallmentsCount).toBe(1);
    expect(row1.totalInstallmentsCount).toBe(11);
    expect(row1.complianceYTD).toBe(100);
    expect(row1.totalPaidAllTime).toBe(200000);

    const grid2 = await getLoanInteractiveGrid('loan-tes-2');
    expect(grid2.totalPaid).toBe(1100000);
    expect(grid2.periods[0].status).toBe('PAID');
    expect(grid2.periods[0].paidAmount).toBe(1100000);
    expect(grid2.periods[1].status).toBe('PROJECTED');
  });

  it('tidak melakukan double-counting ketika schedule_id sudah terisi di loan_repayments', async () => {
    const loanObj = {
      id: 'loan-no-dbl',
      loan_number: 'LOAN-NO-DBL',
      member_id: 'mem-no-dbl',
      principal_amount: 3300000,
      amount: 3300000,
      tenor: 3,
      agreed_tenor_months: 3,
      monthly_target: 1100000,
      status: 'active',
      member: { id: 'mem-no-dbl', nrp: '200088', nama: 'Anggota No Double', status: 'aktif', membership_status: 'ACTIVE' },
    };

    const schedules = [
      { id: 'sc-nd-1', loan_id: 'loan-no-dbl', period_number: 1, due_date: '2026-12-22', target_amount: 1100000, paid_amount: 1100000, status: 'paid', loan: loanObj },
      { id: 'sc-nd-2', loan_id: 'loan-no-dbl', period_number: 2, due_date: '2027-01-22', target_amount: 1100000, paid_amount: 0, status: 'unpaid', loan: loanObj },
      { id: 'sc-nd-3', loan_id: 'loan-no-dbl', period_number: 3, due_date: '2027-02-22', target_amount: 1100000, paid_amount: 0, status: 'unpaid', loan: loanObj },
    ];

    const repayments = [
      { id: 'rep-nd-1', loan_id: 'loan-no-dbl', schedule_id: 'sc-nd-1', amount_paid: 1100000, payment_date: '2026-11-23T01:00:00Z', payment_method: 'transfer' },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ id: 'loan-no-dbl' }], error: null }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [{ loan_id: 'loan-no-dbl' }], error: null }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: schedules, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: repayments, error: null }),
          }),
        };
      }
      return {};
    });

    const matrix = await getLoanMatrix(2026);
    const row = matrix.members[0];
    expect(row.totalPaidAllTime).toBe(1100000);
    expect(row.paidInstallmentsCount).toBe(1);
    expect(row.months[12].paidAmount).toBe(1100000);
  });

  it('excludes paid_off / zero-remaining old loan from default getLoanMatrix while keeping new top-up loan with topupSettlementAmount', async () => {
    const oldSettledLoan = {
      id: 'loan-old-settled',
      loan_number: 'LOAN-1795333396946',
      member_id: 'mem-tes-1',
      principal_amount: 2200000,
      amount: 2200000,
      tenor: 11,
      agreed_tenor_months: 11,
      monthly_target: 200000,
      sisa_pinjaman: 0,
      status: 'paid_off',
      notes: '[LUNAS KOMPENSASI]',
      member: { id: 'mem-tes-1', nrp: '100001', nama: 'anggota tes 1', status: 'aktif', membership_status: 'ACTIVE' },
    };

    const newTopupLoan = {
      id: 'loan-new-topup',
      loan_number: 'LOAN-1795422216507',
      member_id: 'mem-tes-1',
      principal_amount: 5000000,
      amount: 5000000,
      tenor: 10,
      agreed_tenor_months: 10,
      monthly_target: 500000,
      sisa_pinjaman: 5000000,
      topup_settlement_amount: 2000000,
      refinanced_loan_id: 'loan-old-settled',
      status: 'active',
      notes: '[KOMPENSASI PELUNASAN SEJENIS]',
      member: { id: 'mem-tes-1', nrp: '100001', nama: 'anggota tes 1', status: 'aktif', membership_status: 'ACTIVE' },
    };

    const schedules = [
      { id: 'sc-old-1', loan_id: 'loan-old-settled', period_number: 1, due_date: '2026-12-15', target_amount: 200000, paid_amount: 200000, status: 'paid', loan: oldSettledLoan },
      { id: 'sc-new-1', loan_id: 'loan-new-topup', period_number: 1, due_date: '2026-12-23', target_amount: 500000, paid_amount: 0, status: 'unpaid', loan: newTopupLoan },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ id: 'loan-new-topup' }], error: null }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [{ loan_id: 'loan-old-settled' }, { loan_id: 'loan-new-topup' }],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: schedules, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    const matrix = await getLoanMatrix(2026);
    expect(matrix.members).toHaveLength(1);
    expect(matrix.members[0].loanNumber).toBe('LOAN-1795422216507');
    expect(matrix.members[0].topupSettlementAmount).toBe(2000000);
    expect(matrix.members[0].notes).toBe('[KOMPENSASI PELUNASAN SEJENIS]');
  });

  it('includes mismarked paid_off/completed loan in getLoanMatrix when unpaid schedules or sisa_pinjaman > 0 exist and auto-corrects to active', async () => {
    const mismarkedActiveLoan = {
      id: 'loan-yuswan-mismarked',
      loan_number: 'SALDO-AWAL-83010313',
      member_id: 'mem-yuswan',
      principal_amount: 64750000,
      amount: 64750000,
      tenor: 74,
      agreed_tenor_months: 74,
      monthly_target: 875000,
      sisa_pinjaman: 55125000,
      status: 'paid_off',
      notes: 'Saldo Awal Pinjaman',
      member: { id: 'mem-yuswan', nrp: '83010313', nama: 'YUSWAN EFENDI', status: 'aktif', membership_status: 'ACTIVE' },
    };

    const schedules = [
      { id: 'sc-y-1', loan_id: 'loan-yuswan-mismarked', period_number: 1, due_date: '2026-01-01', target_amount: 875000, paid_amount: 875000, status: 'paid', loan: mismarkedActiveLoan },
      { id: 'sc-y-2', loan_id: 'loan-yuswan-mismarked', period_number: 12, due_date: '2026-12-01', target_amount: 875000, paid_amount: 0, status: 'unpaid', loan: mismarkedActiveLoan },
    ];

    const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          update: updateMock,
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({
                    data: [{ loan_id: 'loan-yuswan-mismarked' }],
                    error: null,
                  }),
                }),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: schedules, error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    const matrix = await getLoanMatrix(2026);
    expect(matrix.members).toHaveLength(1);
    expect(matrix.members[0].nrp).toBe('83010313');
    expect(matrix.members[0].nama).toBe('YUSWAN EFENDI');
    expect(matrix.members[0].isLoanActive).toBe(true);
    expect(matrix.members[0].status).toBe('active');
    expect(updateMock).toHaveBeenCalledWith({ status: 'active', sisa_pinjaman: 55125000 });
    expect(updateEqMock).toHaveBeenCalledWith('id', 'loan-yuswan-mismarked');
  });
});




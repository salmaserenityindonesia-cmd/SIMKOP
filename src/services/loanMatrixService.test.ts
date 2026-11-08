import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLoanMatrixAvailableYears,
  getLoanMatrix,
  MonthLoanCell,
  LoanMatrixMonth,
  LoanMatrixMember,
  getCumulativePaidUpToMonth,
  getLoanInteractiveGrid,
  toggleLoanSchedulePaid,
  calculateRemainingInstallmentDeficit,
  autoReconcileLoanInstallments,
  checkAllLoanUpToCurrentMonth,
  uncheckAllLoanSchedules
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
      { id: 'rep-1', loan_id: 'loan-101', schedule_id: 'sc-1', amount_paid: 1000000, payment_date: '2026-01-14T10:00:00Z', payment_method: 'transfer', notes: 'Kwitansi 001' },
      { id: 'rep-2', loan_id: 'loan-101', schedule_id: 'sc-2', amount_paid: 500000, payment_date: '2026-02-14T10:00:00Z', payment_method: 'cash', notes: 'Sebagian' }
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
      notes: 'Kwitansi: KW-123 - Lunas Transfer Bank'
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

    // Verifikasi loan_repayments mencatat nominal riil setoran Rp 7
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      loan_id: 'loan-1',
      schedule_id: 'sched-partial-1',
      amount_paid: 7,
      payment_method: 'potong_gaji',
      notes: 'Kwitansi: KW-SELISIH-02 - Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-2'
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
});

describe('loanMatrixService - calculateRemainingInstallmentDeficit', () => {
  it('menghitung sisa kekurangan angsuran secara presisi (target - paid)', () => {
    // Skenario pembulatan angsuran (misal 277.778 vs 277.771 -> defisit 7)
    expect(calculateRemainingInstallmentDeficit(277778, 277771)).toBe(7);

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


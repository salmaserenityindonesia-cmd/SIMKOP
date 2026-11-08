import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLoanMatrixAvailableYears, getLoanMatrix, MonthLoanCell, LoanMatrixMonth } from './loanMatrixService';
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

    // Month 2 partial
    const febCell: MonthLoanCell = member.months[2];
    expect(febCell).toBeDefined();
    expect(febCell.month).toBe(2);
    expect(febCell.year).toBe(2026);
    expect(febCell.dueDate).toBe('2026-02-15');
    expect(febCell.status).toBe('PARTIAL');
    expect(febCell.targetAmount).toBe(1000000);
    expect(febCell.paidAmount).toBe(500000);

    // Month 12 unpopulated should have default initialization with year and status NONE
    const decCell: MonthLoanCell = member.months[12];
    expect(decCell).toBeDefined();
    expect(decCell.month).toBe(12);
    expect(decCell.year).toBe(2026);
    expect(decCell.status).toBe('NONE');
    expect(decCell.targetAmount).toBe(0);
    expect(decCell.paidAmount).toBe(0);
  });
});

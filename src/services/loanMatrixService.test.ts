import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLoanMatrixAvailableYears } from './loanMatrixService';
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

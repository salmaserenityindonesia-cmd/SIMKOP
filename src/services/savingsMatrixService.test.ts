import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  bulkCheckAllUpToCurrentMonth,
  bulkAutoReconcileAllMembers,
  reconcileSingleMemberDeposit,
  generateMonthGrid,
  generateMemberTimeline,
  matchAutomaticFifo,
  calculateFifoAllocation,
  isMonthBeforeJoin,
  isMonthBeforeCutOff,
  calculateTotalChecked,
  resolveDepositTypeCode,
  MONTH_NAMES,
  saveMonthDepositWithEvidence,
  cancelMonthDepositWithReason,
  getMonthAuditHistory,
  getSavingsDiscrepancyBreakdown,
  CheckMonthPayload,
  MonthAuditHistoryItem
} from './savingsMatrixService';
import { supabase } from '../lib/supabaseClient';
import * as savingsRateService from './savingsRateService';
import { SavingsRateTier } from './savingsRateService';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } })
    }
  }
}));

describe('savingsMatrixService - Helper Functions', () => {
  const mockTiers: SavingsRateTier[] = [
    {
      id: 'tier-wajib-1',
      deposit_type_code: 'WAJIB',
      start_year: 2024,
      start_month: 1,
      end_year: 2025,
      end_month: 10,
      monthly_rate: 150000
    },
    {
      id: 'tier-wajib-2',
      deposit_type_code: 'WAJIB',
      start_year: 2025,
      start_month: 11,
      end_year: null,
      end_month: null,
      monthly_rate: 200000
    },
    {
      id: 'tier-belanja-1',
      deposit_type_code: 'BELANJA',
      start_year: 2024,
      start_month: 1,
      end_year: null,
      end_month: null,
      monthly_rate: 25000
    },
    {
      id: 'tier-lebaran-1',
      deposit_type_code: 'LEBARAN',
      start_year: 2024,
      start_month: 1,
      end_year: null,
      end_month: null,
      monthly_rate: 50000
    }
  ];

  it('isMonthBeforeJoin returns true for months before join date and false otherwise', () => {
    expect(isMonthBeforeJoin(2024, 1, '2024-03-15')).toBe(true);
    expect(isMonthBeforeJoin(2024, 2, '2024-03-15')).toBe(true);
    expect(isMonthBeforeJoin(2024, 3, '2024-03-15')).toBe(false);
    expect(isMonthBeforeJoin(2024, 5, '2024-03-15')).toBe(false);
    expect(isMonthBeforeJoin(2024, 1, null)).toBe(false);
    expect(isMonthBeforeJoin(2024, 1, undefined)).toBe(false);
  });

  it('generateMonthGrid generates 12 months per year in chronological order', () => {
    const grid = generateMonthGrid(2024, 2025);
    expect(grid).toHaveLength(24);
    expect(grid[0]).toEqual({
      year: 2024,
      month: 1,
      label: 'Jan-24',
      key: '2024-01'
    });
    expect(grid[23]).toEqual({
      year: 2025,
      month: 12,
      label: 'Des-25',
      key: '2025-12'
    });
  });

  it('generateMonthGrid supports descending order from newest to oldest', () => {
    const descGrid = generateMonthGrid(2024, 2025, 'desc');
    expect(descGrid).toHaveLength(24);
    expect(descGrid[0]).toEqual({
      year: 2025,
      month: 12,
      label: 'Des-25',
      key: '2025-12'
    });
    expect(descGrid[23]).toEqual({
      year: 2024,
      month: 1,
      label: 'Jan-24',
      key: '2024-01'
    });
  });

  it('calculateTotalChecked calculates total rate for selected keys correctly', () => {
    const keys = ['2024-01', '2024-02', '2025-11'];
    // 2024-01 = 150000, 2024-02 = 150000, 2025-11 = 200000 => total 500000
    const total = calculateTotalChecked(keys, 'WAJIB', mockTiers);
    expect(total).toBe(500000);
  });

  it('matchAutomaticFifo accurately allocates balance according to tiered rates', () => {
    const grid = generateMonthGrid(2024, 2025);

    // Saldo 450.000 untuk Simpanan Wajib (Jan-Mar 2024 = 3 x 150.000)
    const matched3 = matchAutomaticFifo(450000, grid, 'WAJIB', mockTiers, '2024-01-01');
    expect(matched3).toEqual(['2024-01', '2024-02', '2024-03']);

    // Saldo 0 atau negatif mengembalikan array kosong
    expect(matchAutomaticFifo(0, grid, 'WAJIB', mockTiers)).toEqual([]);
    expect(matchAutomaticFifo(-10000, grid, 'WAJIB', mockTiers)).toEqual([]);

    // Saldo tidak mencukupi untuk bulan penuh berikutnya dialokasikan ke bulan berikutnya sebagai parsial
    const partialMatch = matchAutomaticFifo(200000, grid, 'WAJIB', mockTiers, '2024-01-01');
    expect(partialMatch).toEqual(['2024-01', '2024-02']); // 150.000 (Jan full) + 50.000 (Feb partial)

    // Jika includePartial diset false, hanya mengembalikan bulan penuh
    const fullOnly = matchAutomaticFifo(200000, grid, 'WAJIB', mockTiers, '2024-01-01', { includePartial: false });
    expect(fullOnly).toEqual(['2024-01']);
  });

  it('calculateFifoAllocation allocates remainder balance to next month as partial transaction', () => {
    const grid = generateMonthGrid(2022, 2026);
    // Kasus Agus Susanto: join Ags 2022, target Rp 10.200.000
    // 15 bulan @ 200.000 (Ags 22 - Okt 23) + 34 bulan @ 210.000 (Nov 23 - Ags 26) = 10.140.000
    // Sisa 60.000 dialokasikan ke Sep 2026 sebagai parsial
    const agusTiers: SavingsRateTier[] = [
      {
        id: 'tier-1',
        deposit_type_code: 'WAJIB',
        start_year: 2022,
        start_month: 8,
        end_year: 2023,
        end_month: 10,
        monthly_rate: 200000
      },
      {
        id: 'tier-2',
        deposit_type_code: 'WAJIB',
        start_year: 2023,
        start_month: 11,
        end_year: null,
        end_month: null,
        monthly_rate: 210000
      }
    ];

    const result = calculateFifoAllocation(
      10200000,
      grid,
      'WAJIB',
      agusTiers,
      '2022-08-01',
      'md-agus'
    );

    expect(result.totalAllocated).toBe(10200000);
    expect(result.remainingBalance).toBe(0);
    expect(result.matchedKeys).toHaveLength(50); // 15 + 34 + 1
    expect(result.matchedKeys[result.matchedKeys.length - 1]).toBe('2026-09');

    expect(result.partialTransaction).toBeDefined();
    expect(result.partialTransaction).toEqual({
      member_deposit_id: 'md-agus',
      transaction_type: 'deposit',
      amount: 60000,
      for_month: 9,
      for_year: 2026,
      description: 'Rekonsiliasi Otomatis (Setoran Parsial)',
      key: '2026-09',
      applicableRate: 210000,
      isPartial: true
    });
  });

  it('calculateFifoAllocation correctly covers 10.410.000 balance for Agus Susanto: September 2026 full (210k), October 2026 partial (60k), Nov-Dec unbilled', () => {
    const grid = generateMonthGrid(2022, 2026);
    // Kasus Agus Susanto setelah saldo naik dari 10.200.000 menjadi 10.410.000:
    // 15 bulan @ 200.000 (Ags 2022 - Okt 2023) = 3.000.000
    // 35 bulan @ 210.000 (Nov 2023 - Sep 2026) = 7.350.000 (Lunas Hijau s/d Sep 2026)
    // Sisa 60.000 dialokasikan ke Oktober 2026 sebagai Setoran Parsial (Amber)
    // November & Desember 2026 tidak teralokasi (Unbilled)
    const agusTiers: SavingsRateTier[] = [
      {
        id: 'tier-1',
        deposit_type_code: 'WAJIB',
        start_year: 2022,
        start_month: 8,
        end_year: 2023,
        end_month: 10,
        monthly_rate: 200000
      },
      {
        id: 'tier-2',
        deposit_type_code: 'WAJIB',
        start_year: 2023,
        start_month: 11,
        end_year: null,
        end_month: null,
        monthly_rate: 210000
      }
    ];

    const result = calculateFifoAllocation(
      10410000,
      grid,
      'WAJIB',
      agusTiers,
      '2022-08-01',
      'md-agus'
    );

    expect(result.totalAllocated).toBe(10410000);
    expect(result.remainingBalance).toBe(0);
    // 15 bulan @ 200k + 35 bulan @ 210k + 1 bulan parsial @ 60k = 51 bulan
    expect(result.matchedKeys).toHaveLength(51);
    expect(result.matchedKeys[result.matchedKeys.length - 1]).toBe('2026-10');

    // September 2026 harus lunas penuh (210.000, hijau)
    const sepTx = result.allocatedTransactions.find((tx) => tx.key === '2026-09');
    expect(sepTx).toBeDefined();
    expect(sepTx?.amount).toBe(210000);
    expect(sepTx?.isPartial).toBe(false);

    // Oktober 2026 harus parsial (60.000, amber)
    const octTx = result.allocatedTransactions.find((tx) => tx.key === '2026-10');
    expect(octTx).toBeDefined();
    expect(octTx?.amount).toBe(60000);
    expect(octTx?.isPartial).toBe(true);
    expect(result.partialTransaction).toEqual(octTx);

    // November & Desember 2026 tidak boleh ada transaksi (unbilled)
    const novTx = result.allocatedTransactions.find((tx) => tx.key === '2026-11');
    const decTx = result.allocatedTransactions.find((tx) => tx.key === '2026-12');
    expect(novTx).toBeUndefined();
    expect(decTx).toBeUndefined();
  });

  it('resolveDepositTypeCode identifies correct deposit codes', () => {
    expect(resolveDepositTypeCode({ code: 'WAJIB', name: 'Simpanan Wajib' })).toBe('WAJIB');
    expect(resolveDepositTypeCode({ code: 'SW', name: 'Simpanan Wajib' })).toBe('WAJIB');
    expect(resolveDepositTypeCode([{ code: 'BELANJA', name: 'Simpanan Belanja' }])).toBe('BELANJA');
    expect(resolveDepositTypeCode({ code: 'SL', name: 'Simpanan Hari Raya' })).toBe('LEBARAN');
    expect(resolveDepositTypeCode({ code: 'LEBARAN', name: 'Simpanan Hari Raya' })).toBe('LEBARAN');
    expect(resolveDepositTypeCode({ code: 'OTHER', name: 'Lain-lain' })).toBe(null);
    expect(resolveDepositTypeCode(null)).toBe(null);
  });
});

describe('savingsMatrixService - bulkAutoReconcileAllMembers', () => {
  const mockTiers: SavingsRateTier[] = [
    {
      id: 'tier-wajib-1',
      deposit_type_code: 'WAJIB',
      start_year: 2024,
      start_month: 1,
      end_year: 2025,
      end_month: 10,
      monthly_rate: 150000
    },
    {
      id: 'tier-wajib-2',
      deposit_type_code: 'WAJIB',
      start_year: 2025,
      start_month: 11,
      end_year: null,
      end_month: null,
      monthly_rate: 200000
    },
    {
      id: 'tier-belanja-1',
      deposit_type_code: 'BELANJA',
      start_year: 2024,
      start_month: 1,
      end_year: null,
      end_month: null,
      monthly_rate: 25000
    },
    {
      id: 'tier-lebaran-1',
      deposit_type_code: 'LEBARAN',
      start_year: 2024,
      start_month: 1,
      end_year: null,
      end_month: null,
      monthly_rate: 50000
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(savingsRateService, 'getRateTiers').mockResolvedValue(mockTiers);
  });

  it('rekonsiliasi anggota aktif dengan saldo migrasi sesuai tarif berjenjang (Simpanan Wajib)', async () => {
    const mockMembers = [
      {
        id: 'member-1',
        nrp: '001',
        nama: 'Ahmad Subarjo',
        status: 'aktif',
        membership_status: 'ACTIVE',
        created_at: '2024-01-01T00:00:00Z',
        tgl_awal_anggota: '2024-01-01'
      }
    ];

    const mockMemberDeposits = [
      {
        id: 'md-1',
        member_id: 'member-1',
        deposit_type_id: 'dt-wajib',
        deposit_types: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: [
          {
            id: 'tx-migra-1',
            amount: 450000,
            transaction_type: 'deposit',
            for_month: 1,
            for_year: 2024,
            description: 'Migrasi Saldo Awal (As-Is)',
            created_at: '2024-01-01T00:00:00Z'
          }
        ]
      }
    ];

    const insertedTxs: any[] = [];
    const deletedIds: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockMembers,
              error: null
            })
          })
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: mockMemberDeposits,
              error: null
            })
          })
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation((col: string, ids: string[]) => {
              deletedIds.push(...ids);
              return Promise.resolve({ data: null, error: null });
            })
          }),
          insert: vi.fn().mockImplementation((rows: any[]) => {
            insertedTxs.push(...rows);
            return Promise.resolve({ data: rows, error: null });
          })
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null })
      };
    });

    const result = await bulkAutoReconcileAllMembers('WAJIB');

    expect(result.success).toBe(true);
    expect(result.totalMembers).toBe(1);
    expect(result.totalSuccess).toBe(1);
    expect(result.totalFailed).toBe(0);

    // 450.000 / 150.000 = 3 bulan (Jan, Feb, Mar 2024)
    expect(insertedTxs).toHaveLength(3);
    expect(insertedTxs[0]).toMatchObject({
      member_deposit_id: 'md-1',
      amount: 150000,
      for_month: 1,
      for_year: 2024,
      transaction_type: 'deposit',
      description: 'Setoran Matriks WAJIB Jan 2024'
    });
    expect(insertedTxs[1]).toMatchObject({
      member_deposit_id: 'md-1',
      amount: 150000,
      for_month: 2,
      for_year: 2024,
      description: 'Setoran Matriks WAJIB Feb 2024'
    });
    expect(insertedTxs[2]).toMatchObject({
      member_deposit_id: 'md-1',
      amount: 150000,
      for_month: 3,
      for_year: 2024,
      description: 'Setoran Matriks WAJIB Mar 2024'
    });

    // Mutasi migrasi tidak pernah dihapus
    expect(deletedIds).not.toContain('tx-migra-1');
  });

  it('memanggil callback onProgress secara bertahap untuk setiap anggota yang diproses', async () => {
    const mockMembers = [
      { id: 'm-1', nrp: '001', nama: 'Member One', status: 'aktif', created_at: '2024-01-01' },
      { id: 'm-2', nrp: '002', nama: 'Member Two', status: 'aktif', created_at: '2024-01-01' },
      { id: 'm-3', nrp: '003', nama: 'Member Three', status: 'aktif', created_at: '2024-01-01' }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockMembers,
              error: null
            })
          })
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null })
      };
    });

    const progressReports: any[] = [];
    const onProgress = vi.fn((p) => progressReports.push({ ...p }));

    const result = await bulkAutoReconcileAllMembers('WAJIB', onProgress, { batchSize: 2 });

    expect(result.success).toBe(true);
    expect(result.totalMembers).toBe(3);
    expect(onProgress).toHaveBeenCalledTimes(3);

    expect(progressReports[0]).toEqual({ processed: 1, total: 3, currentMemberName: 'Member One' });
    expect(progressReports[1]).toEqual({ processed: 2, total: 3, currentMemberName: 'Member Two' });
    expect(progressReports[2]).toEqual({ processed: 3, total: 3, currentMemberName: 'Member Three' });
  });

  it('penanganan anggota dengan saldo 0 (tidak membuat mutasi baru)', async () => {
    const mockMembers = [
      { id: 'm-zero', nrp: '000', nama: 'Saldo Nol', status: 'aktif', created_at: '2024-01-01' }
    ];

    const mockMemberDeposits = [
      {
        id: 'md-zero',
        member_id: 'm-zero',
        deposit_types: { code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: []
      }
    ];

    const insertMock = vi.fn().mockResolvedValue({ data: [], error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null })
          })
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null })
          })
        };
      }
      if (table === 'deposit_transactions') {
        return {
          insert: insertMock,
          delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: null, error: null }) })
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await bulkAutoReconcileAllMembers('WAJIB');

    expect(result.success).toBe(true);
    expect(result.totalSuccess).toBe(1);
    expect(result.totalFailed).toBe(0);
    // Tidak ada panggilan insert mutasi karena saldo 0
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('mode depositTypeCode: ALL mengeksekusi Wajib, Belanja, dan Lebaran', async () => {
    const mockMembers = [
      { id: 'm-all', nrp: '007', nama: 'James Member', status: 'aktif', created_at: '2024-01-01' }
    ];

    const mockMemberDeposits = [
      {
        id: 'md-wajib',
        member_id: 'm-all',
        deposit_types: { code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: [
          { id: 't-w', amount: 300000, transaction_type: 'deposit', description: 'Migrasi Saldo Awal (As-Is)' }
        ]
      },
      {
        id: 'md-belanja',
        member_id: 'm-all',
        deposit_types: { code: 'BELANJA', name: 'Simpanan Belanja' },
        deposit_transactions: [
          { id: 't-b', amount: 50000, transaction_type: 'deposit', description: 'Migrasi Saldo Awal (As-Is)' }
        ]
      },
      {
        id: 'md-lebaran',
        member_id: 'm-all',
        deposit_types: { code: 'LEBARAN', name: 'Simpanan Hari Raya' },
        deposit_transactions: [
          { id: 't-l', amount: 100000, transaction_type: 'deposit', description: 'Migrasi Saldo Awal (As-Is)' }
        ]
      }
    ];

    const insertedTxs: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null })
          })
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null })
          })
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: null, error: null }) }),
          insert: vi.fn().mockImplementation((rows: any[]) => {
            insertedTxs.push(...rows);
            return Promise.resolve({ data: rows, error: null });
          })
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await bulkAutoReconcileAllMembers('ALL');

    expect(result.success).toBe(true);
    expect(result.totalSuccess).toBe(1);

    // WAJIB: 300.000 / 150.000 = 2 txs
    // BELANJA: 50.000 / 25.000 = 2 txs
    // LEBARAN: 100.000 / 50.000 = 2 txs
    // Total = 6 txs
    expect(insertedTxs).toHaveLength(6);
    expect(insertedTxs.filter(t => t.description.includes('WAJIB'))).toHaveLength(2);
    expect(insertedTxs.filter(t => t.description.includes('BELANJA'))).toHaveLength(2);
    expect(insertedTxs.filter(t => t.description.includes('LEBARAN'))).toHaveLength(2);
  });

  it('penanganan error pada salah satu query Supabase tanpa menghentikan total eksekusi', async () => {
    const mockMembers = [
      { id: 'm-fail', nrp: '001', nama: 'Member Gagal', status: 'aktif', created_at: '2024-01-01' },
      { id: 'm-success', nrp: '002', nama: 'Member Sukses', status: 'aktif', created_at: '2024-01-01' }
    ];

    const mockMemberDeposits = [
      {
        id: 'md-fail',
        member_id: 'm-fail',
        deposit_types: { code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: [
          { id: 't-1', amount: 150000, transaction_type: 'deposit', description: 'Migrasi Saldo Awal' }
        ]
      },
      {
        id: 'md-success',
        member_id: 'm-success',
        deposit_types: { code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: [
          { id: 't-2', amount: 150000, transaction_type: 'deposit', description: 'Migrasi Saldo Awal' }
        ]
      }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null })
          })
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null })
          })
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: null, error: null }) }),
          insert: vi.fn().mockImplementation((rows: any[]) => {
            if (rows[0]?.member_deposit_id === 'md-fail') {
              return Promise.resolve({ data: null, error: new Error('Postgres connection failure') });
            }
            return Promise.resolve({ data: rows, error: null });
          })
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await bulkAutoReconcileAllMembers('WAJIB');

    expect(result.success).toBe(false);
    expect(result.totalMembers).toBe(2);
    expect(result.totalSuccess).toBe(1);
    expect(result.totalFailed).toBe(1);
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].memberId).toBe('m-fail');
    expect(result.errors![0].memberName).toBe('Member Gagal');
    expect(result.errors![0].error).toContain('Postgres connection failure');
  });

  it('menghapus transaksi matriks rutin lama tetapi mempertahankan mutasi saldo awal migrasi', async () => {
    const mockMembers = [
      { id: 'm-clean', nrp: '010', nama: 'Member Clean', status: 'aktif', created_at: '2024-01-01' }
    ];

    const mockMemberDeposits = [
      {
        id: 'md-clean',
        member_id: 'm-clean',
        deposit_types: { code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: [
          {
            id: 'migra-tx-safe',
            amount: 300000,
            transaction_type: 'deposit',
            for_month: 1,
            for_year: 2024,
            description: 'Migrasi Saldo Awal (As-Is)'
          },
          {
            id: 'matrix-old-1',
            amount: 150000,
            transaction_type: 'deposit',
            for_month: 1,
            for_year: 2024,
            description: 'Setoran Matriks WAJIB Jan 2024'
          },
          {
            id: 'matrix-old-2',
            amount: 150000,
            transaction_type: 'deposit',
            for_month: 2,
            for_year: 2024,
            description: 'Setoran Matriks WAJIB Feb 2024'
          }
        ]
      }
    ];

    let deletedIds: string[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null })
          })
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null })
          })
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation((col: string, ids: string[]) => {
              deletedIds = ids;
              return Promise.resolve({ data: null, error: null });
            })
          }),
          insert: vi.fn().mockResolvedValue({ data: [], error: null })
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await bulkAutoReconcileAllMembers('WAJIB');

    expect(result.success).toBe(true);
    expect(deletedIds).toEqual(['matrix-old-1', 'matrix-old-2']);
    expect(deletedIds).not.toContain('migra-tx-safe');
  });

  it('mengembalikan status sukses dengan total 0 jika tidak ada anggota aktif', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await bulkAutoReconcileAllMembers('WAJIB');
    expect(result).toEqual({
      success: true,
      totalMembers: 0,
      totalSuccess: 0,
      totalFailed: 0,
      errors: []
    });
  });

  it('mendukung opsi "Semua Jenis Simpanan" dan memproses ketiga jenis simpanan', async () => {
    const mockMembers = [
      { id: 'm-semua', nrp: '009', nama: 'Member Semua', status: 'aktif', created_at: '2024-01-01' }
    ];

    const mockMemberDeposits = [
      {
        id: 'md-wajib',
        member_id: 'm-semua',
        deposit_types: { code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: [
          { id: 'tx-w', amount: 150000, transaction_type: 'deposit', description: 'Migrasi Saldo Awal (As-Is)' }
        ]
      },
      {
        id: 'md-belanja',
        member_id: 'm-semua',
        deposit_types: { code: 'BELANJA', name: 'Simpanan Belanja' },
        deposit_transactions: [
          { id: 'tx-b', amount: 25000, transaction_type: 'deposit', description: 'Migrasi Saldo Awal (As-Is)' }
        ]
      },
      {
        id: 'md-lebaran',
        member_id: 'm-semua',
        deposit_types: { code: 'LEBARAN', name: 'Simpanan Hari Raya' },
        deposit_transactions: [
          { id: 'tx-l', amount: 50000, transaction_type: 'deposit', description: 'Migrasi Saldo Awal (As-Is)' }
        ]
      }
    ];

    const insertedTxs: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null })
          })
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { id: 'dt-w', code: 'WAJIB', name: 'Simpanan Wajib' },
              { id: 'dt-b', code: 'BELANJA', name: 'Simpanan Belanja' },
              { id: 'dt-l', code: 'LEBARAN', name: 'Simpanan Hari Raya' }
            ],
            error: null
          })
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null })
          })
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: null, error: null }) }),
          insert: vi.fn().mockImplementation((rows: any[]) => {
            insertedTxs.push(...rows);
            return Promise.resolve({ data: rows, error: null });
          })
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await bulkAutoReconcileAllMembers('Semua Jenis Simpanan');

    expect(result.success).toBe(true);
    expect(result.totalMembers).toBe(1);
    expect(result.totalSuccess).toBe(1);
    expect(result.totalFailed).toBe(0);
    expect(insertedTxs).toHaveLength(3);
    expect(insertedTxs.some(t => t.description.includes('WAJIB'))).toBe(true);
    expect(insertedTxs.some(t => t.description.includes('BELANJA'))).toBe(true);
    expect(insertedTxs.some(t => t.description.includes('LEBARAN'))).toBe(true);
  });

  it('menghapus saldo gelondongan awal migrasi (for_month IS NULL atau deskripsi Saldo Awal Migrasi Sistem) saat rekonsiliasi bulanan dieksekusi', async () => {
    const mockMembers = [
      { id: 'm-yanto', nrp: '001', nama: 'Yanto Santoso', status: 'aktif', created_at: '2025-02-04' }
    ];

    const mockMemberDeposits = [
      {
        id: 'md-yanto-wajib',
        member_id: 'm-yanto',
        deposit_types: { code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: [
          {
            id: 'bulk-migra-tx',
            amount: 4000000,
            transaction_type: 'deposit',
            for_month: null,
            for_year: null,
            description: 'Saldo Awal Migrasi Sistem'
          }
        ]
      }
    ];

    const deletedIds: string[] = [];
    const deleteEqCalls: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null })
          })
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }],
            error: null
          })
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null })
          })
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation((col: string, ids: string[]) => {
              deletedIds.push(...ids);
              return Promise.resolve({ data: null, error: null });
            }),
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              deleteEqCalls.push({ col, val });
              return {
                is: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockResolvedValue({ data: null, error: null })
                })
              };
            })
          }),
          insert: vi.fn().mockResolvedValue({ data: [], error: null })
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await bulkAutoReconcileAllMembers('WAJIB');

    expect(result.success).toBe(true);
    expect(deletedIds).toContain('bulk-migra-tx');
    expect(deleteEqCalls.some(c => c.col === 'member_deposit_id' && c.val === 'md-yanto-wajib')).toBe(true);
  });
});

describe('savingsMatrixService - reconcileSingleMemberDeposit', () => {
  const mockTiers: SavingsRateTier[] = [
    {
      id: 'tier-w-1',
      deposit_type_code: 'WAJIB',
      start_year: 2024,
      start_month: 1,
      end_year: 2025,
      end_month: 10,
      monthly_rate: 150000
    },
    {
      id: 'tier-w-2',
      deposit_type_code: 'WAJIB',
      start_year: 2025,
      start_month: 11,
      end_year: null,
      end_month: null,
      monthly_rate: 200000
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(savingsRateService, 'getRateTiers').mockResolvedValue(mockTiers);
  });

  it('rekonsiliasi saldo individual untuk satu jenis simpanan (WAJIB)', async () => {
    const mockDeposits = [
      {
        id: 'md-single-1',
        member_id: 'member-single',
        deposit_type_id: 'dt-wajib',
        deposit_types: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: [
          {
            id: 'tx-migra-single',
            amount: 300000,
            transaction_type: 'deposit',
            for_month: null,
            for_year: null,
            description: 'Saldo Awal Migrasi Sistem'
          }
        ]
      }
    ];

    const inserted: any[] = [];
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockDeposits, error: null })
          })
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }],
            error: null
          })
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: null, error: null }),
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                ilike: vi.fn().mockResolvedValue({ data: null, error: null })
              }),
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    neq: vi.fn().mockResolvedValue({ data: null, error: null })
                  })
                })
              })
            })
          }),
          insert: vi.fn().mockImplementation((rows: any[]) => {
            inserted.push(...rows);
            return Promise.resolve({ data: rows, error: null });
          })
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const res = await reconcileSingleMemberDeposit('member-single', 'WAJIB', {
      rateTiers: mockTiers,
      joinDate: '2024-01-01'
    });

    expect(res.success).toBe(true);
    expect(res.matchedKeys).toEqual(['2024-01', '2024-02']);
    expect(res.insertedCount).toBe(2);
    expect(inserted).toHaveLength(2);
    expect(inserted[0].amount).toBe(150000);
    expect(inserted[1].amount).toBe(150000);
  });

  it('rekonsiliasi berhasil membaca baseline dari "Saldo Simpanan Belum Teralokasi" setelah uncheck all', async () => {
    const mockDeposits = [
      {
        id: 'md-single-unallocated',
        member_id: 'member-agus',
        deposit_type_id: 'dt-wajib',
        deposit_types: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
        deposit_transactions: [
          {
            id: 'tx-unallocated',
            amount: 10200000,
            transaction_type: 'deposit',
            for_month: null,
            for_year: null,
            description: 'Saldo Simpanan Belum Teralokasi'
          }
        ]
      }
    ];

    const inserted: any[] = [];
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockDeposits, error: null })
          })
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }],
            error: null
          })
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: null, error: null }),
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({ data: null, error: null }),
              is: vi.fn().mockReturnValue({
                ilike: vi.fn().mockResolvedValue({ data: null, error: null })
              }),
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    neq: vi.fn().mockResolvedValue({ data: null, error: null })
                  })
                })
              })
            })
          }),
          insert: vi.fn().mockImplementation((rows: any[]) => {
            inserted.push(...rows);
            return Promise.resolve({ data: rows, error: null });
          })
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const res = await reconcileSingleMemberDeposit('member-agus', 'WAJIB', {
      rateTiers: [
        {
          id: 'tier-2022',
          deposit_type_code: 'WAJIB',
          start_year: 2022,
          start_month: 1,
          end_year: 2023,
          end_month: 10,
          monthly_rate: 200000
        },
        {
          id: 'tier-2023',
          deposit_type_code: 'WAJIB',
          start_year: 2023,
          start_month: 11,
          end_year: null,
          end_month: null,
          monthly_rate: 210000
        }
      ],
      joinDate: '2022-08-01',
      startYear: 2022,
      endYear: 2026
    });

    expect(res.success).toBe(true);
    expect(res.totalAllocated).toBe(10200000);
    // 15 bulan @ 200k + 34 bulan @ 210k + 1 bulan parsial @ 60k = 50 bulan
    expect(res.matchedKeys.length).toBe(50);
    expect(res.matchedKeys[0]).toBe('2022-08');
    expect(res.matchedKeys[14]).toBe('2023-10');
    expect(res.matchedKeys[15]).toBe('2023-11');
    expect(res.matchedKeys[48]).toBe('2026-08');
    expect(res.matchedKeys[49]).toBe('2026-09');

    // Cek alokasi parsial bulan terakhir (Sep 2026)
    const partialTx = res.allocatedTransactions?.find(t => t.key === '2026-09');
    expect(partialTx?.isPartial).toBe(true);
    expect(partialTx?.amount).toBe(60000);
  });

  describe('bulkCheckAllUpToCurrentMonth', () => {
    it('returns 0 success and 0 failed if there are no active members', async () => {
      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await bulkCheckAllUpToCurrentMonth('WAJIB');
      expect(res).toEqual({ totalSuccess: 0, totalFailed: 0 });
    });

    it('processes active members, inserts transactions and reports progress', async () => {
      const insertedRows: any[] = [];
      const progressUpdates: any[] = [];

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'mem-1', nrp: '101', nama: 'Budi Test', created_at: '2026-09-01', status: 'aktif' }
                  ],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }
              ],
              error: null
            })
          };
        }
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'tier-1',
                      deposit_type_code: 'WAJIB',
                      start_year: 2024,
                      start_month: 1,
                      end_year: null,
                      end_month: null,
                      monthly_rate: 200000
                    }
                  ],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'dep-acc-1' },
                    error: null
                  })
                })
              })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ error: null }),
                is: vi.fn().mockResolvedValue({ error: null })
              })
            }),
            insert: vi.fn().mockImplementation((rows: any[]) => {
              insertedRows.push(...rows);
              return Promise.resolve({ error: null });
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await bulkCheckAllUpToCurrentMonth('WAJIB', (p) => {
        progressUpdates.push(p);
      });

      expect(res.totalSuccess).toBe(1);
      expect(res.totalFailed).toBe(0);
      expect(progressUpdates.length).toBe(1);
      expect(progressUpdates[0].currentMemberName).toBe('Budi Test');
      expect(insertedRows.length).toBeGreaterThan(0);
      expect(insertedRows[0].member_deposit_id).toBe('dep-acc-1');
      expect(insertedRows[0].transaction_type).toBe('deposit');
      expect(insertedRows[0].description).toContain('Centang Setoran Rutin Matriks');
    });

    it('provisions missing member_deposits account without account_number and completes bulk check', async () => {
      let createdDepositPayload: any = null;

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              expect(cols).not.toContain('tgl_awal_anggota');
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'mem-new', nrp: '102', nama: 'Siti Baru', created_at: '2026-10-01', status: 'aktif' }
                    ],
                    error: null
                  })
                })
              };
            })
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }
              ],
              error: null
            })
          };
        }
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                })
              })
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              createdDepositPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'created-dep-1' }, error: null }),
                  single: vi.fn().mockResolvedValue({ data: { id: 'created-dep-1' }, error: null })
                })
              };
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ error: null }),
                is: vi.fn().mockResolvedValue({ error: null })
              })
            }),
            insert: vi.fn().mockResolvedValue({ error: null })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await bulkCheckAllUpToCurrentMonth('WAJIB');
      expect(res.totalSuccess).toBe(1);
      expect(res.totalFailed).toBe(0);
      expect(createdDepositPayload).not.toBeNull();
      expect(createdDepositPayload.member_id).toBe('mem-new');
      expect(createdDepositPayload.deposit_type_id).toBe('dt-wajib');
      expect(createdDepositPayload).not.toHaveProperty('account_number');
    });

    it('isolates errors per deposit type and continues processing successfully', async () => {
      let insertCount = 0;

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'mem-partial', nrp: '103', nama: 'Rudi', created_at: '2026-10-01', status: 'aktif' }
                  ],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
                { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' }
              ],
              error: null
            })
          };
        }
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string, val: string) => {
                  if (val === 'dt-wajib') {
                    return { maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'dep-wajib' }, error: null }) };
                  }
                  // Simulate failure on Belanja
                  return { maybeSingle: vi.fn().mockRejectedValue(new Error('Belanja account error')) };
                })
              })
            }))
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ error: null }),
                is: vi.fn().mockResolvedValue({ error: null })
              })
            }),
            insert: vi.fn().mockImplementation(() => {
              insertCount++;
              return Promise.resolve({ error: null });
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await bulkCheckAllUpToCurrentMonth('ALL');
      expect(res.totalSuccess).toBe(1);
      expect(res.totalFailed).toBe(0);
      expect(insertCount).toBeGreaterThan(0);
    });
  });
});

describe('savingsMatrixService - Evidence Documentation & Audit Trail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveMonthDepositWithEvidence', () => {
    it('throws error when required fields are missing', async () => {
      await expect(
        saveMonthDepositWithEvidence({
          memberDepositId: '',
          month: 1,
          year: 2026,
          amount: 200000
        })
      ).rejects.toThrow('memberDepositId, month, dan year wajib diisi');

      await expect(
        saveMonthDepositWithEvidence({
          memberDepositId: 'md-1',
          month: 0,
          year: 2026,
          amount: 200000
        })
      ).rejects.toThrow('memberDepositId, month, dan year wajib diisi');

      await expect(
        saveMonthDepositWithEvidence({
          memberDepositId: 'md-1',
          month: 5,
          year: 0,
          amount: 200000
        })
      ).rejects.toThrow('memberDepositId, month, dan year wajib diisi');
    });

    it('cleans existing transaction and inserts new one with complete evidence metadata', async () => {
      let deletedYear: number | null = null;
      let deletedMonth: number | null = null;
      let insertedPayload: any = null;

      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: {
          user: {
            id: 'admin-user-uuid',
            email: 'admin@simkop.id',
            user_metadata: { nama: 'Super Admin' }
          } as any
        },
        error: null
      });

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col1, val1) => ({
                eq: vi.fn().mockImplementation((col2, val2) => {
                  deletedYear = val2;
                  return {
                    eq: vi.fn().mockImplementation((col3, val3) => {
                      deletedMonth = val3;
                      return Promise.resolve({ error: null });
                    })
                  };
                })
              }))
            }),
            insert: vi.fn().mockImplementation((row: any) => {
              insertedPayload = row;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'tx-new-123', ...row },
                    error: null
                  })
                })
              };
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const payload: CheckMonthPayload = {
        memberDepositId: 'md-agus',
        month: 5,
        year: 2026,
        amount: 200000,
        referenceNo: 'KW-2026/05/001',
        paymentMethod: 'transfer',
        notes: 'Bukti transfer BCA via m-Banking',
        description: 'Setoran Matriks Mei 2026'
      };

      const result = await saveMonthDepositWithEvidence(payload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.id).toBe('tx-new-123');
      expect(deletedYear).toBe(2026);
      expect(deletedMonth).toBe(5);

      expect(insertedPayload).toMatchObject({
        member_deposit_id: 'md-agus',
        amount: 200000,
        transaction_type: 'deposit',
        for_month: 5,
        for_year: 2026,
        reference_no: 'KW-2026/05/001',
        payment_method: 'transfer',
        notes: 'Bukti transfer BCA via m-Banking',
        description: 'Setoran Matriks Mei 2026',
        created_by: 'admin-user-uuid'
      });
    });

    it('uses sensible defaults for optional fields and handles unauthenticated session', async () => {
      let insertedPayload: any = null;

      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: { user: null },
        error: null
      });

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null })
                })
              })
            }),
            insert: vi.fn().mockImplementation((row: any) => {
              insertedPayload = row;
              return Promise.resolve({ data: row, error: null });
            })
          };
        }
        return {};
      });

      const result = await saveMonthDepositWithEvidence({
        memberDepositId: 'md-defaults',
        month: 2,
        year: 2026,
        amount: 150000
      });

      expect(result.success).toBe(true);
      expect(insertedPayload).toMatchObject({
        member_deposit_id: 'md-defaults',
        amount: 150000,
        transaction_type: 'deposit',
        for_month: 2,
        for_year: 2026,
        payment_method: 'tunai',
        reference_no: null,
        notes: null,
        created_by: null
      });
      expect(insertedPayload.description).toContain('Setoran Matriks Bulan Feb 2026');
    });
  });

  describe('cancelMonthDepositWithReason', () => {
    it('throws error when validation fails', async () => {
      await expect(
        cancelMonthDepositWithReason('', 2026, 5, 'Salah centang')
      ).rejects.toThrow('memberDepositId, year, dan month wajib diisi');

      await expect(
        cancelMonthDepositWithReason('md-1', 0, 5, 'Salah centang')
      ).rejects.toThrow('memberDepositId, year, dan month wajib diisi');

      await expect(
        cancelMonthDepositWithReason('md-1', 2026, 0, 'Salah centang')
      ).rejects.toThrow('memberDepositId, year, dan month wajib diisi');

      await expect(
        cancelMonthDepositWithReason('md-1', 2026, 5, '')
      ).rejects.toThrow('Alasan pembatalan wajib diisi');

      await expect(
        cancelMonthDepositWithReason('md-1', 2026, 5, '   ')
      ).rejects.toThrow('Alasan pembatalan wajib diisi');
    });

    it('captures existing transaction, logs explicit DELETE audit trail, and deletes row', async () => {
      const existingTx = {
        id: 'tx-to-delete-1',
        member_deposit_id: 'md-test',
        amount: 200000,
        for_month: 6,
        for_year: 2026,
        reference_no: 'KW-006',
        description: 'Setoran Matriks Jun 2026'
      };

      let auditPayload: any = null;
      let deleteCalled = false;

      vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
        data: {
          user: {
            id: 'admin-canceller',
            email: 'admin@simkop.id',
            user_metadata: { nama: 'Pengelola Audit' }
          } as any
        },
        error: null
      });

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [existingTx], error: null })
                })
              })
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockImplementation(() => {
                    deleteCalled = true;
                    return Promise.resolve({ error: null });
                  })
                })
              })
            })
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockImplementation((payload: any) => {
              auditPayload = payload;
              return Promise.resolve({ data: payload, error: null });
            })
          };
        }
        return {};
      });

      const res = await cancelMonthDepositWithReason(
        'md-test',
        2026,
        6,
        'Koreksi pembukuan: anggota belum melunasi iuran ini'
      );

      expect(res.success).toBe(true);
      expect(res.cancelledCount).toBe(1);
      expect(deleteCalled).toBe(true);

      expect(auditPayload).toMatchObject({
        table_name: 'deposit_transactions',
        action: 'DELETE',
        record_id: 'tx-to-delete-1',
        entity_name: 'deposit_transactions',
        entity_id: 'md-test',
        old_data: existingTx,
        performed_by: 'admin-canceller',
        performer_name: 'Pengelola Audit',
        notes: 'Koreksi pembukuan: anggota belum melunasi iuran ini'
      });
      expect(auditPayload.created_at).toBeDefined();
    });
  });

  describe('getMonthAuditHistory', () => {
    it('returns empty array when arguments are missing', async () => {
      expect(await getMonthAuditHistory('', 2026, 5)).toEqual([]);
      expect(await getMonthAuditHistory('md-1', 0, 5)).toEqual([]);
      expect(await getMonthAuditHistory('md-1', 2026, 0)).toEqual([]);
    });

    it('aggregates active transactions and audit logs in descending chronological order', async () => {
      const activeTx = {
        id: 'tx-active-1',
        member_deposit_id: 'md-history',
        amount: 200000,
        for_month: 7,
        for_year: 2026,
        reference_no: 'KW-2026/07/99',
        payment_method: 'potong_gaji',
        notes: 'Pencatatan setoran via payroll',
        created_by: 'user-pengelola-1',
        created_at: '2026-07-10T14:00:00Z'
      };

      const auditLog1 = {
        id: 'log-delete-1',
        table_name: 'deposit_transactions',
        action: 'DELETE',
        entity_id: 'md-history',
        old_data: {
          id: 'tx-old-cancelled',
          member_deposit_id: 'md-history',
          amount: 200000,
          for_month: 7,
          for_year: 2026,
          reference_no: 'KW-OLD-01',
          payment_method: 'tunai'
        },
        performed_by: 'user-pengelola-2',
        performer_name: 'Bambang Audit',
        notes: 'Batal karena dobel input manual',
        created_at: '2026-07-08T10:00:00Z'
      };

      // Unrelated audit log (different month)
      const auditLogUnrelated = {
        id: 'log-unrelated',
        table_name: 'deposit_transactions',
        action: 'DELETE',
        entity_id: 'md-history',
        old_data: {
          for_month: 8,
          for_year: 2026
        },
        created_at: '2026-08-01T10:00:00Z'
      };

      vi.mocked(supabase.from).mockImplementation((table: string): any => {
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [activeTx], error: null })
                })
              })
            })
          };
        }
        if (table === 'audit_logs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [auditLogUnrelated, auditLog1],
                    error: null
                  })
                })
              })
            })
          };
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'user-pengelola-1', nama: 'Siti Bendahara' }],
                error: null
              })
            })
          };
        }
        return {};
      });

      const history = await getMonthAuditHistory('md-history', 2026, 7);

      expect(history).toHaveLength(2);

      // Latest first (2026-07-10 > 2026-07-08)
      expect(history[0]).toEqual({
        id: 'tx-active-1',
        action: 'CREATE',
        amount: 200000,
        forMonth: 7,
        forYear: 2026,
        referenceNo: 'KW-2026/07/99',
        paymentMethod: 'potong_gaji',
        notes: 'Pencatatan setoran via payroll',
        performerName: 'Siti Bendahara',
        performerId: 'user-pengelola-1',
        createdAt: '2026-07-10T14:00:00Z'
      });

      expect(history[1]).toEqual({
        id: 'log-delete-1',
        action: 'DELETE',
        amount: 200000,
        forMonth: 7,
        forYear: 2026,
        referenceNo: 'KW-OLD-01',
        paymentMethod: 'tunai',
        notes: 'Batal karena dobel input manual',
        performerName: 'Bambang Audit',
        performerId: 'user-pengelola-2',
        createdAt: '2026-07-08T10:00:00Z'
      });
    });

    it('deduplicates duplicate cancellation logs between trigger default and user custom reason', async () => {
      // Skenario:
      // Log 1: Dihasilkan oleh trigger database dengan OLD.description "Rekonsiliasi Otomatis (Setoran Parsial)"
      // Log 2: Dihasilkan oleh modal frontend dengan alasan kustom admin "tidak jadi bayar"
      // Keduanya terjadi dalam selisih beberapa milidetik pada transaksi yang sama
      const duplicateLogs = [
        {
          id: 'log-user-reason',
          table_name: 'deposit_transactions',
          action: 'DELETE',
          entity_id: 'md-dup',
          old_data: { for_year: 2026, for_month: 9, amount: 200000, reference_no: 'KW-01' },
          performed_by: 'admin-1',
          performer_name: 'Admin Utama',
          notes: 'tidak jadi bayar',
          created_at: '2026-09-15T10:00:02Z'
        },
        {
          id: 'log-trigger-default',
          table_name: 'deposit_transactions',
          action: 'DELETE',
          entity_id: 'md-dup',
          old_data: { for_year: 2026, for_month: 9, amount: 200000, reference_no: 'KW-01', description: 'Rekonsiliasi Otomatis (Setoran Parsial)' },
          performed_by: 'admin-1',
          performer_name: 'Admin Utama',
          notes: 'Rekonsiliasi Otomatis (Setoran Parsial)',
          created_at: '2026-09-15T10:00:01Z'
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [] })
                })
              })
            })
          };
        }
        if (table === 'audit_logs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: duplicateLogs })
                })
              })
            })
          };
        }
        return {};
      });

      const history = await getMonthAuditHistory('md-dup', 2026, 9);

      // Hanya boleh ada 1 log, yaitu yang memuat alasan kustom admin ("tidak jadi bayar")
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('log-user-reason');
      expect(history[0].notes).toBe('tidak jadi bayar');
    });

    it('prioritizes manual admin cancellation reason ("salah input lagi") over default description ("Setoran Matriks WAJIB Ags 2026")', async () => {
      const duplicateLogs = [
        {
          id: 'log-trigger-default-matriks',
          table_name: 'deposit_transactions',
          action: 'DELETE',
          entity_id: 'md-matrix-test',
          old_data: { for_year: 2026, for_month: 8, amount: 200000, reference_no: 'KW-02', description: 'Setoran Matriks WAJIB Ags 2026' },
          performed_by: 'admin-1',
          performer_name: 'Admin Utama',
          notes: 'Setoran Matriks WAJIB Ags 2026',
          created_at: '2026-08-15T10:00:02Z'
        },
        {
          id: 'log-user-custom-reason',
          table_name: 'deposit_transactions',
          action: 'DELETE',
          entity_id: 'md-matrix-test',
          old_data: { for_year: 2026, for_month: 8, amount: 200000, reference_no: 'KW-02' },
          performed_by: 'admin-1',
          performer_name: 'Admin Utama',
          notes: 'salah input lagi',
          created_at: '2026-08-15T10:00:01Z'
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [] })
                })
              })
            })
          };
        }
        if (table === 'audit_logs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: duplicateLogs })
                })
              })
            })
          };
        }
        return {};
      });

      const history = await getMonthAuditHistory('md-matrix-test', 2026, 8);

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('log-user-custom-reason');
      expect(history[0].notes).toBe('salah input lagi');
    });
  });

  describe('getSavingsDiscrepancyBreakdown', () => {
    it('returns empty breakdown when both memberDepositId and memberId are empty', async () => {
      const res = await getSavingsDiscrepancyBreakdown('', 'BELANJA', '');
      expect(res.withdrawals).toEqual([]);
      expect(res.totalSpent).toBe(0);
    });

    it('fetches withdrawal and pos_spend transactions, enriches cashier name, and identifies POS sales', async () => {
      const mockWithdrawals = [
        {
          id: 'tx-pos-1',
          created_at: '2026-11-01T10:00:00Z',
          transaction_date: '2026-11-01T10:00:00Z',
          amount: 41000,
          reference_no: 'INV-20261101-001',
          description: 'Belanja Kasir POS (INV-20261101-001)',
          payment_method: 'potong_simpanan_belanja',
          created_by: 'user-cashier-1',
          notes: 'Belanja sembako'
        },
        {
          id: 'tx-wd-1',
          created_at: '2026-10-15T08:30:00Z',
          transaction_date: '2026-10-15T08:30:00Z',
          amount: 50000,
          reference_no: 'WD-001',
          description: 'Penarikan simpanan tunai',
          payment_method: 'cash',
          created_by: 'user-cashier-2',
          notes: 'Penarikan langsung di teller'
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockWithdrawals, error: null })
                })
              })
            })
          };
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'user-cashier-1', nama: 'Siti Rahma' },
                  { id: 'user-cashier-2', nama: 'Budi Teller' }
                ],
                error: null
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await getSavingsDiscrepancyBreakdown('md-belanja-yanto', 'BELANJA');

      expect(res.totalSpent).toBe(91000);
      expect(res.withdrawals).toHaveLength(2);

      // Verify POS transaction
      expect(res.withdrawals[0].id).toBe('tx-pos-1');
      expect(res.withdrawals[0].amount).toBe(41000);
      expect(res.withdrawals[0].is_pos_sale).toBe(true);
      expect(res.withdrawals[0].cashier_name).toBe('Siti Rahma');
      expect(res.withdrawals[0].reference_no).toBe('INV-20261101-001');

      // Verify non-POS withdrawal
      expect(res.withdrawals[1].id).toBe('tx-wd-1');
      expect(res.withdrawals[1].amount).toBe(50000);
      expect(res.withdrawals[1].is_pos_sale).toBe(false);
      expect(res.withdrawals[1].cashier_name).toBe('Budi Teller');
    });

    it('resolves memberDepositId from memberId and depositTypeCode if memberDepositId is empty', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              ilike: vi.fn().mockResolvedValue({ data: [{ id: 'dt-belanja', code: 'BELANJA' }] })
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'md-auto-resolved' } })
                })
              })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'tx-1',
                        amount: 41000,
                        description: 'Belanja POS',
                        created_at: '2026-11-01T10:00:00Z'
                      }
                    ],
                    error: null
                  })
                })
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await getSavingsDiscrepancyBreakdown('', 'BELANJA', 'member-yanto-123');
      expect(res.totalSpent).toBe(41000);
      expect(res.withdrawals).toHaveLength(1);
    });

    it('throws error when query to deposit_transactions fails', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Connection Error') })
                })
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      await expect(getSavingsDiscrepancyBreakdown('md-1', 'BELANJA')).rejects.toThrow('DB Connection Error');
    });

    it('falls back to sales table when deposit_transactions has 0 transactions for member', async () => {
      const mockSales = [
        {
          id: 'sale-yanto-1',
          invoice_number: 'INV-20261101-001',
          created_at: '2026-11-01T09:00:00Z',
          paid_deposit: 41000,
          total_amount: 55000,
          payment_scheme: 'split',
          cashier_id: 'cashier-kasir-1'
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'md-belanja-yanto', member_id: 'member-yanto-uuid' } }),
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'md-belanja-yanto', member_id: 'member-yanto-uuid' } })
                })
              })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null })
                }),
                or: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockSales, error: null })
                })
              })
            })
          };
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'cashier-kasir-1', nama: 'Kasir Utama Toko' }],
                error: null
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Calling with new signature (memberId, memberDepositId, depositTypeCode)
      const res = await getSavingsDiscrepancyBreakdown('member-yanto-uuid', 'md-belanja-yanto', 'BELANJA');

      expect(res.totalSpent).toBe(41000);
      expect(res.withdrawals).toHaveLength(1);
      expect(res.withdrawals[0].id).toBe('sale-yanto-1');
      expect(res.withdrawals[0].reference_no).toBe('INV-20261101-001');
      expect(res.withdrawals[0].description).toBe('Belanja Kasir POS (Struk INV-20261101-001)');
      expect(res.withdrawals[0].payment_method).toBe('potong_simpanan_belanja');
      expect(res.withdrawals[0].cashier_name).toBe('Kasir Utama Toko');
      expect(res.withdrawals[0].source).toBe('sales_pos');
    });
  });

  describe('Cut-Off Saldo Awal Utuh & Forward-Only Allocation', () => {
    it('isMonthBeforeCutOff hanya mengembalikan true untuk bulan sebelum bulan pengesahan saldo awal', () => {
      expect(isMonthBeforeCutOff(2026, 10, '2026-11-13')).toBe(true);
      expect(isMonthBeforeCutOff(2026, 1, '2026-11-13')).toBe(true);
      expect(isMonthBeforeCutOff(2026, 11, '2026-11-13')).toBe(false);
      expect(isMonthBeforeCutOff(2026, 12, '2026-11-13')).toBe(false);
      expect(isMonthBeforeCutOff(2026, 5, null)).toBe(false);
    });

    it('calculateFifoAllocation dan matchAutomaticFifo hanya mengalokasikan ke bulan mulai/setelah cut-off', () => {
      const months = generateMonthGrid(2026, 2026);
      const tiers: SavingsRateTier[] = [
        {
          id: 't-2026',
          deposit_type_code: 'WAJIB',
          start_year: 2026,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 200000
        }
      ];

      const allocatedKeys = matchAutomaticFifo(400000, months, 'WAJIB', tiers, '2022-01-01', {
        initialSavingsCutOffDate: '2026-11-13'
      });

      expect(allocatedKeys).toEqual(['2026-11', '2026-12']);
    });

    it('reconcileSingleMemberDeposit mempertahankan Saldo Awal Simpanan dan hanya mendistribusikan setoran baru pasca cut-off', async () => {
      const tiers: SavingsRateTier[] = [
        {
          id: 't-2026',
          deposit_type_code: 'WAJIB',
          start_year: 2026,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 200000
        }
      ];

      const deletedIds: string[] = [];
      const insertedRows: any[] = [];

      const memberDepositsMock = [
        {
          id: 'md-wajib-cut',
          member_id: 'm-cut-1',
          deposit_type_id: 'dt-wajib',
          deposit_types: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
          deposit_transactions: [
            {
              id: 'tx-opening-utuh',
              amount: 10200000,
              transaction_type: 'deposit',
              for_month: null,
              for_year: null,
              description: 'Saldo Awal Simpanan (Aktif sejak 2026-11-13)'
            },
            {
              id: 'tx-new-post',
              amount: 200000,
              transaction_type: 'deposit',
              for_month: 11,
              for_year: 2026,
              description: 'Setoran Matriks WAJIB Nov 2026'
            }
          ]
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'system_settings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { key: 'initial_savings_effective_date', value: '2026-11-13' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }],
              error: null
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: memberDepositsMock, error: null })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation(async (_col: string, ids: string[]) => {
                deletedIds.push(...ids);
                return { error: null };
              })
            }),
            insert: vi.fn().mockImplementation(async (rows: any[]) => {
              insertedRows.push(...rows);
              return { error: null };
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await reconcileSingleMemberDeposit('m-cut-1', 'WAJIB', {
        rateTiers: tiers,
        joinDate: '2020-01-01',
        startYear: 2026,
        endYear: 2026,
        initialSavingsCutOffDate: '2026-11-13'
      });

      // Saldo Awal Simpanan tidak pernah dihapus atau dipecah
      expect(deletedIds).not.toContain('tx-opening-utuh');
      expect(deletedIds).toContain('tx-new-post');
      // Hanya setoran baru Rp 200.000 pasca cut-off yang didistribusikan ke 2026-11
      expect(res.matchedKeys).toEqual(['2026-11']);
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0].amount).toBe(200000);
      expect(insertedRows[0].for_year).toBe(2026);
      expect(insertedRows[0].for_month).toBe(11);
    });

    it('generateMemberTimeline starts directly at cut-off period for Taufik Santoso (10 Okt 2026) without pre-cut-off months', () => {
      const timeline = generateMemberTimeline('2026-10-10', '2025-12-01', 2026);
      expect(timeline).toEqual([
        { year: 2026, month: 10, label: 'Okt-26', key: '2026-10' },
        { year: 2026, month: 11, label: 'Nov-26', key: '2026-11' },
        { year: 2026, month: 12, label: 'Des-26', key: '2026-12' }
      ]);
      expect(timeline.some(m => m.key === '2025-12' || m.key === '2026-09')).toBe(false);
    });

    it('generateMemberTimeline falls back to joinDate when effectiveDate is null', () => {
      const timeline = generateMemberTimeline(null, '2025-11-15', 2026);
      expect(timeline[0]).toEqual({ year: 2025, month: 11, label: 'Nov-25', key: '2025-11' });
      expect(timeline).toHaveLength(14); // Nov-25, Des-25 + 12 bulan 2026
    });
  });
});

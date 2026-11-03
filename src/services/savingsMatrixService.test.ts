import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  bulkAutoReconcileAllMembers,
  reconcileSingleMemberDeposit,
  generateMonthGrid,
  matchAutomaticFifo,
  calculateFifoAllocation,
  isMonthBeforeJoin,
  calculateTotalChecked,
  resolveDepositTypeCode,
  MONTH_NAMES
} from './savingsMatrixService';
import { supabase } from '../lib/supabaseClient';
import * as savingsRateService from './savingsRateService';
import { SavingsRateTier } from './savingsRateService';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn()
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
});

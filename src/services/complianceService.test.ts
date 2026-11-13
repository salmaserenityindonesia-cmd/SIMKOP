import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSavingsComplianceAvailableYears,
  getComplianceMatrixData,
  getRolling12Months,
  getRolling12MonthRange,
  PriorBalanceSummary,
  MonthPeriod,
  matchDepositType,
  importSavingsMatrixLedger,
  fetchAllPaged,
  DepositTypeItem,
  SavingsSubItem,
  MonthSavingsCell,
  MemberNetSavings,
  parseCutoffDateInfo,
} from './complianceService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('complianceService - getSavingsComplianceAvailableYears', () => {
  const fixedRefDate = new Date(2026, 5, 15); // June 15, 2026 (currentYear: 2026, currentMonth: 5)

  const mockDepositTypes: DepositTypeItem[] = [
    { id: 'dt-pokok', name: 'Simpanan Pokok', code: 'POKOK', default_amount: 100000 },
    { id: 'dt-wajib', name: 'Simpanan Wajib', code: 'WAJIB', default_amount: 25000 },
    { id: 'dt-lebaran', name: 'Simpanan Hari Raya', code: 'LEBARAN', default_amount: 50000 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupSupabaseMock = ({
    depositTypes = mockDepositTypes,
    depositTypesError = null,
    members = [],
    membersError = null,
    transactions = [],
    transactionsError = null,
  }: {
    depositTypes?: any[] | null;
    depositTypesError?: any;
    members?: any[] | null;
    membersError?: any;
    transactions?: any[] | null;
    transactionsError?: any;
  }) => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: depositTypes,
            error: depositTypesError,
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: members,
              error: membersError,
            }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockResolvedValue({
            data: transactions,
            error: transactionsError,
          }),
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
  };

  it('Kasus 1: Seluruh kewajiban lunas & simpanan lebaran bersaldo 0 -> mengembalikan [2026]', async () => {
    const members = [
      { id: 'm-1', nama: 'Budi Santoso', nrp: '001', status: 'aktif', created_at: '2024-01-10T00:00:00Z' },
    ];

    // Build all required transactions:
    // 1. Pokok: 100,000 paid
    const txs: any[] = [
      {
        amount: 100000,
        transaction_type: 'deposit',
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-pokok' },
        created_at: '2024-01-10T00:00:00Z',
      },
      // 2. Lebaran: deposited 500,000 and withdrawn 500,000 (net = 0)
      {
        amount: 500000,
        transaction_type: 'deposit',
        for_year: 2024,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-lebaran' },
        created_at: '2024-04-01T00:00:00Z',
      },
      {
        amount: 500000,
        transaction_type: 'withdrawal',
        for_year: 2024,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-lebaran' },
        created_at: '2024-04-10T00:00:00Z',
      },
    ];

    // 3. Wajib: All months paid from Jan 2024 to June 2026
    // 2024: months 1 to 12
    for (let m = 1; m <= 12; m++) {
      txs.push({
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2024,
        for_month: m,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-wajib' },
      });
    }
    // 2025: months 1 to 12
    for (let m = 1; m <= 12; m++) {
      txs.push({
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: m,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-wajib' },
      });
    }
    // 2026: months 1 to 6 (currentMonth is 5 = June)
    for (let m = 1; m <= 6; m++) {
      txs.push({
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2026,
        for_month: m,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-wajib' },
      });
    }

    setupSupabaseMock({ members, transactions: txs });

    const years = await getSavingsComplianceAvailableYears(fixedRefDate);
    expect(years).toEqual([2026]);
  });

  it('Kasus 2: Ada anggota aktif yang belum melunasi simpanan pokok sejak pendaftaran tahun 2023 -> mengembalikan [2026, 2025, 2024, 2023]', async () => {
    const members = [
      { id: 'm-1', nama: 'Siti Aminah', nrp: '002', status: 'aktif', created_at: '2023-02-15T00:00:00Z' },
    ];

    // Simpanan pokok underpaid (only 50,000 out of 100,000)
    const txs: any[] = [
      {
        amount: 50000,
        transaction_type: 'deposit',
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-pokok' },
        created_at: '2023-02-15T00:00:00Z',
      },
    ];

    setupSupabaseMock({ members, transactions: txs });

    const years = await getSavingsComplianceAvailableYears(fixedRefDate);
    expect(years).toEqual([2026, 2025, 2024, 2023]);
  });

  it('Kasus 3: Simpanan lebaran tahun 2024 masih memiliki sisa saldo (belum ditarik habis) -> mengembalikan [2026, 2025, 2024]', async () => {
    const members = [
      { id: 'm-1', nama: 'Agus Pratama', nrp: '003', status: 'aktif', created_at: '2024-01-01T00:00:00Z' },
    ];

    const txs: any[] = [
      // Pokok lunas
      {
        amount: 100000,
        transaction_type: 'deposit',
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-pokok' },
        created_at: '2024-01-01T00:00:00Z',
      },
      // Lebaran 2024 net balance = 1,000,000 - 400,000 = 600,000 (> 0)
      {
        amount: 1000000,
        transaction_type: 'deposit',
        for_year: 2024,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-lebaran' },
        created_at: '2024-03-20T00:00:00Z',
      },
      {
        amount: 400000,
        transaction_type: 'withdrawal',
        for_year: 2024,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-lebaran' },
        created_at: '2024-04-10T00:00:00Z',
      },
    ];

    // Pay all wajib so only lebaran 2024 triggers the year range
    for (let m = 1; m <= 12; m++) {
      txs.push({
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2024,
        for_month: m,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-wajib' },
      });
      txs.push({
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: m,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-wajib' },
      });
    }
    for (let m = 1; m <= 6; m++) {
      txs.push({
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2026,
        for_month: m,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-wajib' },
      });
    }

    setupSupabaseMock({ members, transactions: txs });

    const years = await getSavingsComplianceAvailableYears(fixedRefDate);
    expect(years).toEqual([2026, 2025, 2024]);
  });

  it('Kasus 4: Ada tunggakan simpanan wajib tahun 2025 oleh anggota aktif -> mengembalikan [2026, 2025]', async () => {
    const members = [
      { id: 'm-1', nama: 'Dedi Kurniawan', nrp: '004', status: 'aktif', created_at: '2025-01-01T00:00:00Z' },
    ];

    const txs: any[] = [
      // Pokok lunas
      {
        amount: 100000,
        transaction_type: 'deposit',
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-pokok' },
        created_at: '2025-01-01T00:00:00Z',
      },
      // Lebaran balance 0
      {
        amount: 50000,
        transaction_type: 'deposit',
        for_year: 2025,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-lebaran' },
      },
      {
        amount: 50000,
        transaction_type: 'withdrawal',
        for_year: 2025,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-lebaran' },
      },
    ];

    // Wajib: Only paid up to month 6 in 2025 (months 7-12 are unpaid arrears in 2025)
    for (let m = 1; m <= 6; m++) {
      txs.push({
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: m,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-wajib' },
      });
    }

    setupSupabaseMock({ members, transactions: txs });

    const years = await getSavingsComplianceAvailableYears(fixedRefDate);
    expect(years).toEqual([2026, 2025]);
  });

  it('Kasus 5: Semua kewajiban tahun lampau selesai dan simpanan lebaran dicairkan tuntas -> batas awal bergeser maju ke tahun berjalan [2026]', async () => {
    const members = [
      { id: 'm-1', nama: 'Eko Wahyudi', nrp: '005', status: 'aktif', created_at: '2023-01-01T00:00:00Z' },
    ];

    const txs: any[] = [
      // Pokok lunas
      {
        amount: 100000,
        transaction_type: 'deposit',
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-pokok' },
        created_at: '2023-01-01T00:00:00Z',
      },
      // Lebaran 2023, 2024, 2025 fully settled (withdrawn)
      {
        amount: 1000000,
        transaction_type: 'deposit',
        for_year: 2024,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-lebaran' },
      },
      {
        amount: 1000000,
        transaction_type: 'withdrawal',
        for_year: 2024,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-lebaran' },
      },
    ];

    // All wajib months paid for 2023, 2024, 2025, 2026(up to current month 6)
    [2023, 2024, 2025].forEach((yr) => {
      for (let m = 1; m <= 12; m++) {
        txs.push({
          amount: 25000,
          transaction_type: 'deposit',
          for_year: yr,
          for_month: m,
          member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-wajib' },
        });
      }
    });
    for (let m = 1; m <= 6; m++) {
      txs.push({
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2026,
        for_month: m,
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-wajib' },
      });
    }

    setupSupabaseMock({ members, transactions: txs });

    const years = await getSavingsComplianceAvailableYears(fixedRefDate);
    // Oldest year shifts forward directly to currentYear [2026]
    expect(years).toEqual([2026]);
  });

  describe('Kasus 6: Graceful fallback mengembalikan [currentYear] saat terjadi error jaringan/kueri database', () => {
    it('mengembalikan [currentYear] saat kueri deposit_types error', async () => {
      setupSupabaseMock({
        depositTypesError: { message: 'Database query timeout' },
      });

      const years = await getSavingsComplianceAvailableYears(fixedRefDate);
      expect(years).toEqual([2026]);
    });

    it('mengembalikan [currentYear] saat kueri anggota error', async () => {
      setupSupabaseMock({
        membersError: { message: 'Connection refused' },
      });

      const years = await getSavingsComplianceAvailableYears(fixedRefDate);
      expect(years).toEqual([2026]);
    });

    it('mengembalikan [currentYear] saat kueri deposit_transactions error', async () => {
      setupSupabaseMock({
        members: [{ id: 'm-1', nama: 'Test', status: 'aktif' }],
        transactionsError: { message: 'Table locked' },
      });

      const years = await getSavingsComplianceAvailableYears(fixedRefDate);
      expect(years).toEqual([2026]);
    });

    it('mengembalikan [currentYear] saat tidak ada anggota aktif', async () => {
      setupSupabaseMock({
        members: [],
      });

      const years = await getSavingsComplianceAvailableYears(fixedRefDate);
      expect(years).toEqual([2026]);
    });

    it('mengembalikan [currentYear] saat terjadi exception runtime', async () => {
      (supabase.from as any).mockImplementation(() => {
        throw new Error('Fatal network crash');
      });

      const years = await getSavingsComplianceAvailableYears(fixedRefDate);
      expect(years).toEqual([2026]);
    });
  });

  it('Kasus 7: Mengunci batas paling awal dropdown tahun ke cutoffYear ketika initial_savings_effective_date ditetapkan', async () => {
    const members = [
      { id: 'm-1', nama: 'Siti Aminah', nrp: '002', status: 'aktif', created_at: '2023-02-15T00:00:00Z' },
    ];
    const txs: any[] = [
      {
        amount: 50000,
        transaction_type: 'deposit',
        member_deposits: { member_id: 'm-1', deposit_type_id: 'dt-pokok' },
        created_at: '2023-02-15T00:00:00Z',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_types') {
        return { select: vi.fn().mockResolvedValue({ data: mockDepositTypes, error: null }) };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: members, error: null }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return { select: vi.fn().mockResolvedValue({ data: txs, error: null }) };
      }
      if (table === 'system_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { key: 'initial_savings_effective_date', value: '2026-10-10' },
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const years = await getSavingsComplianceAvailableYears(fixedRefDate);
    expect(years).toEqual([2026]);
  });

  describe('matchDepositType helper tests', () => {
    it('mencocokkan tipe simpanan berdasarkan code SP/POKOK, SW/WAJIB, SL/LEBARAN', () => {
      const types = [
        { id: '1', name: 'Simpanan Pokok', code: 'SP' },
        { id: '2', name: 'Simpanan Wajib', code: 'SW' },
        { id: '3', name: 'Simpanan Lebaran', code: 'SL' },
      ];

      expect(matchDepositType(types, ['POKOK', 'SP'], ['pokok'])?.id).toBe('1');
      expect(matchDepositType(types, ['WAJIB', 'SW'], ['wajib'])?.id).toBe('2');
      expect(matchDepositType(types, ['LEBARAN', 'SL'], ['lebaran'])?.id).toBe('3');
    });

    it('mencocokkan tipe simpanan berdasarkan fallback nama jika code berbeda', () => {
      const types = [
        { id: '1', name: 'Simpanan Pokok Anggota', code: 'OTHER_1' },
        { id: '2', name: 'Simpanan Wajib Bulanan', code: 'OTHER_2' },
        { id: '3', name: 'Simpanan Hari Raya Idul Fitri', code: 'OTHER_3' },
      ];

      expect(matchDepositType(types, ['POKOK', 'SP'], ['pokok'])?.id).toBe('1');
      expect(matchDepositType(types, ['WAJIB', 'SW'], ['wajib'])?.id).toBe('2');
      expect(matchDepositType(types, ['LEBARAN', 'SL'], ['lebaran', 'hari raya'])?.id).toBe('3');
    });

    it('mengembalikan undefined jika tipe simpanan tidak ditemukan', () => {
      const types = [{ id: '99', name: 'Simpanan Sukarela', code: 'SS' }];
      expect(matchDepositType(types, ['POKOK', 'SP'], ['pokok'])).toBeUndefined();
    });
  });

  describe('getComplianceMatrixData - Architecture & Active Member Retention', () => {
    const mockDTypes = [
      { id: 'dt-pokok', name: 'Simpanan Pokok', code: 'SP', default_amount: 100000 },
      { id: 'dt-wajib', name: 'Simpanan Wajib', code: 'SW', default_amount: 25000 },
      { id: 'dt-belanja', name: 'Simpanan Belanja', code: 'SB', default_amount: 50000 },
      { id: 'dt-lebaran', name: 'Simpanan Hari Raya', code: 'SL', default_amount: 50000 },
    ];

    it('mengambil master anggota dari tabel public.anggota (BUKAN members) dan menyertakan ke-4 anggota aktif di 2026', async () => {
      const mockMembers = [
        { id: 'm-1', nrp: 'NRP001', nama: 'Yanto Santoso', membership_status: 'ACTIVE', tgl_awal_anggota: '2023-01-01', created_at: '2023-01-01T00:00:00Z' },
        { id: 'm-2', nrp: 'NRP002', nama: 'Agus Susanto', membership_status: 'ACTIVE', tgl_awal_anggota: '2024-05-10', created_at: '2024-05-10T00:00:00Z' },
        { id: 'm-3', nrp: 'NRP003', nama: 'Mulyono Santoso', membership_status: 'ACTIVE', tgl_awal_anggota: '2025-02-15', created_at: '2025-02-15T00:00:00Z' },
        { id: 'm-4', nrp: 'NRP004', nama: 'Joko Arifin', membership_status: 'ACTIVE', tgl_awal_anggota: '2025-10-01', created_at: '2025-10-01T00:00:00Z' },
        { id: 'm-5', nrp: 'NRP005', nama: 'Budi Resigned', membership_status: 'RESIGNED', tgl_awal_anggota: '2023-01-01', created_at: '2023-01-01T00:00:00Z' },
      ];

      const fromCalls: string[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        fromCalls.push(table);
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
              eq: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          // Transaksi kosong di 2026 untuk menguji LEFT JOIN non-eliminasi
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await getComplianceMatrixData(2026);

      // Pastikan tabel anggota dipanggil dan members TIDAK dipanggil
      expect(fromCalls).toContain('anggota');
      expect(fromCalls).not.toContain('members');

      // Pastikan ada tepat 4 anggota aktif (Budi Resigned tereksklusi)
      expect(result.rows).toHaveLength(4);
      const names = result.rows.map(r => r.nama);
      expect(names).toContain('Yanto Santoso');
      expect(names).toContain('Agus Susanto');
      expect(names).toContain('Mulyono Santoso');
      expect(names).toContain('Joko Arifin');
      expect(names).not.toContain('Budi Resigned');

      // Seluruh 4 anggota memiliki 12 bulan array terdefinisi
      result.rows.forEach(row => {
        expect(row.months).toHaveLength(12);
      });
    });

    it('tidak mengeliminasi anggota yang belum memiliki transaksi di tahun tersebut', async () => {
      const mockMembers = [
        { id: 'm-1', nrp: 'NRP001', nama: 'Yanto Santoso', membership_status: 'ACTIVE', created_at: '2023-01-01T00:00:00Z' },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2026);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].nama).toBe('Yanto Santoso');
    });

    it('menampilkan seluruh anggota aktif ketika tidak ada tunggakan sama sekali (kepatuhan 100%) dengan query ter-chain', async () => {
      const mockMembers = [
        { id: 'm-1', nrp: 'NRP001', nama: 'Yanto Santoso', status: 'aktif', membership_status: 'ACTIVE', created_at: '2023-01-01T00:00:00Z' },
        { id: 'm-2', nrp: 'NRP002', nama: 'Agus Susanto', status: 'aktif', membership_status: 'ACTIVE', created_at: '2024-05-10T00:00:00Z' },
        { id: 'm-3', nrp: 'NRP003', nama: 'Mulyono Santoso', status: 'aktif', membership_status: 'ACTIVE', created_at: '2025-02-15T00:00:00Z' },
        { id: 'm-4', nrp: 'NRP004', nama: 'Joko Arifin', status: 'aktif', membership_status: 'ACTIVE', created_at: '2025-10-01T00:00:00Z' },
      ];

      // Simulasi seluruh anggota sudah lunas simpanan wajib, belanja, dan lebaran untuk seluruh bulan yang jatuh tempo
      const paidTxs: any[] = [];
      mockMembers.forEach((m) => {
        // Pokok lunas
        paidTxs.push({
          amount: 100000,
          transaction_type: 'deposit',
          member_deposits: { member_id: m.id, deposit_type_id: 'dt-pokok' },
          created_at: '2025-01-01T00:00:00Z',
        });
        // Wajib, Belanja, Lebaran lunas 12 bulan di 2026
        for (let mo = 1; mo <= 12; mo++) {
          paidTxs.push({
            amount: 25000,
            transaction_type: 'deposit',
            for_year: 2026,
            for_month: mo,
            member_deposits: { member_id: m.id, deposit_type_id: 'dt-wajib' },
          });
          paidTxs.push({
            amount: 50000,
            transaction_type: 'deposit',
            for_year: 2026,
            for_month: mo,
            member_deposits: { member_id: m.id, deposit_type_id: 'dt-belanja' },
          });
          paidTxs.push({
            amount: 50000,
            transaction_type: 'deposit',
            for_year: 2026,
            for_month: mo,
            member_deposits: { member_id: m.id, deposit_type_id: 'dt-lebaran' },
          });
        }
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
        }
        if (table === 'anggota') {
          const chainObj: any = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          };
          return {
            select: vi.fn().mockReturnValue(chainObj),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue(Promise.resolve({ data: paidTxs, error: null })),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2026);

      // Seluruh 4 anggota tetap tampil meskipun tidak ada yang menunggak
      expect(result.rows).toHaveLength(4);
      expect(result.rows.map((r) => r.nama)).toEqual([
        'Yanto Santoso',
        'Agus Susanto',
        'Mulyono Santoso',
        'Joko Arifin',
      ]);
      // Semua anggota memiliki kepatuhan 100%
      result.rows.forEach((row) => {
        expect(row.compliance).toBe(100);
        expect(row.pokokLunas).toBe(true);
      });
    });

    it('menghitung running balance kronologis secara tepat dan mencegah akumulasi ganda saldo migrasi gelondongan (Yanto Santoso Feb 2025: 200k/total 200k, Mar: 200k/total 400k)', async () => {
      const mockMembers = [
        {
          id: 'm-yanto',
          nrp: 'NRP-YANTO',
          nama: 'Yanto Santoso',
          status: 'aktif',
          membership_status: 'ACTIVE',
          tgl_awal_anggota: '2025-02-04',
          created_at: '2025-02-04T00:00:00Z',
        },
      ];

      // Simulasi Yanto Santoso:
      // Saldo awal migrasi Rp 4.000.000 (gelondongan) masih ada di database,
      // DAN rincian bulanan 20 bulan @ Rp 200.000 (Feb 2025 s/d Sep 2026) sudah dibentuk
      const yantoTxs: any[] = [
        {
          id: 'tx-bulk-migration',
          amount: 4000000,
          transaction_type: 'deposit',
          for_year: null,
          for_month: null,
          description: 'Saldo Awal Migrasi Sistem',
          created_at: '2025-02-04T00:00:00Z',
          member_deposits: { member_id: 'm-yanto', deposit_type_id: 'dt-wajib' },
        },
      ];

      // Tambahkan 20 baris mutasi bulanan @ Rp 200.000
      // 2025: Feb (2) s/d Des (12) = 11 bulan
      for (let mo = 2; mo <= 12; mo++) {
        yantoTxs.push({
          id: `tx-matrix-2025-${mo}`,
          amount: 200000,
          transaction_type: 'deposit',
          for_year: 2025,
          for_month: mo,
          description: `Setoran Matriks WAJIB ${mo} 2025`,
          member_deposits: { member_id: 'm-yanto', deposit_type_id: 'dt-wajib' },
        });
      }
      // 2026: Jan (1) s/d Sep (9) = 9 bulan
      for (let mo = 1; mo <= 9; mo++) {
        yantoTxs.push({
          id: `tx-matrix-2026-${mo}`,
          amount: 200000,
          transaction_type: 'deposit',
          for_year: 2026,
          for_month: mo,
          description: `Setoran Matriks WAJIB ${mo} 2026`,
          member_deposits: { member_id: 'm-yanto', deposit_type_id: 'dt-wajib' },
        });
      }

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
        }
        if (table === 'anggota') {
          const chainObj: any = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          };
          return { select: vi.fn().mockReturnValue(chainObj) };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue(Promise.resolve({ data: yantoTxs, error: null })),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2025);
      expect(result.rows).toHaveLength(1);
      const yantoRow = result.rows[0];
      expect(yantoRow.nama).toBe('Yanto Santoso');

      // Bulan Januari 2025: sebelum bergabung (null)
      expect(yantoRow.months[0]).toBeNull();

      // Bulan Februari 2025 (bulan pertama bergabung):
      // Wajib: 200.000, bal_w: 200.000 (BUKAN 4.200.000!)
      const febData = yantoRow.months[1];
      expect(febData).not.toBeNull();
      expect(febData?.w).toBe(200000);
      expect(febData?.bal_w).toBe(200000);

      // Bulan Maret 2025:
      // Wajib: 200.000, bal_w: 400.000
      const marData = yantoRow.months[2];
      expect(marData).not.toBeNull();
      expect(marData?.w).toBe(200000);
      expect(marData?.bal_w).toBe(400000);

      // Bulan April 2025:
      // Wajib: 200.000, bal_w: 600.000
      const aprData = yantoRow.months[3];
      expect(aprData).not.toBeNull();
      expect(aprData?.w).toBe(200000);
      expect(aprData?.bal_w).toBe(600000);
    });
  });

  describe('granular month cell structure (wajib, belanja, lebaran)', () => {
    const mockDTypes = [
      { id: 'dt-pokok', name: 'Simpanan Pokok', code: 'POKOK', default_amount: 100000 },
      { id: 'dt-wajib', name: 'Simpanan Wajib', code: 'WAJIB', default_amount: 30000 },
      { id: 'dt-belanja', name: 'Simpanan Belanja', code: 'BELANJA', default_amount: 60000 },
      { id: 'dt-lebaran', name: 'Simpanan Hari Raya', code: 'LEBARAN', default_amount: 50000 },
    ];

    const mockMembers = [
      {
        id: 'm-member-1',
        nama: 'Agus Sutrisno',
        nrp: '78910',
        status: 'aktif',
        created_at: '2025-01-01T00:00:00Z',
        tgl_awal_anggota: '2025-01-01',
      },
    ];

    it('memetakan status paid dan unpaid dengan nominal tepat untuk setiap sub-item', async () => {
      // Month 0 (Jan): Lunas semua (wajib: 30000, belanja: 60000, lebaran: 50000)
      // Month 1 (Feb): Hanya bayar wajib (30000), belanja dan lebaran unpaid
      // Month 2 (Mar): Tidak bayar sama sekali (semua unpaid)
      const transactions = [
        // Jan - all 3
        {
          id: 'tx-1',
          amount: 30000,
          transaction_type: 'deposit',
          for_year: 2025,
          for_month: 1,
          member_deposits: { member_id: 'm-member-1', deposit_type_id: 'dt-wajib' },
        },
        {
          id: 'tx-2',
          amount: 60000,
          transaction_type: 'deposit',
          for_year: 2025,
          for_month: 1,
          member_deposits: { member_id: 'm-member-1', deposit_type_id: 'dt-belanja' },
        },
        {
          id: 'tx-3',
          amount: 50000,
          transaction_type: 'deposit',
          for_year: 2025,
          for_month: 1,
          member_deposits: { member_id: 'm-member-1', deposit_type_id: 'dt-lebaran' },
        },
        // Feb - only wajib
        {
          id: 'tx-4',
          amount: 30000,
          transaction_type: 'deposit',
          for_year: 2025,
          for_month: 2,
          member_deposits: { member_id: 'm-member-1', deposit_type_id: 'dt-wajib' },
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
        }
        if (table === 'anggota') {
          const chainObj: any = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          };
          return { select: vi.fn().mockReturnValue(chainObj) };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue(Promise.resolve({ data: transactions, error: null })),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2025);
      expect(result.rows).toHaveLength(1);
      const memberRow = result.rows[0];

      // Targets returned correctly
      expect(result.targets.wajib).toBe(30000);
      expect(result.targets.belanja).toBe(60000);
      expect(result.targets.lebaran).toBe(50000);

      // Month 0 (Jan): all paid
      const janData = memberRow.months[0];
      expect(janData).not.toBeNull();
      expect(janData?.wajib).toEqual({ status: 'paid', amount: 30000 });
      expect(janData?.belanja).toEqual({ status: 'paid', amount: 60000 });
      expect(janData?.lebaran).toEqual({ status: 'paid', amount: 50000 });
      // Backward compatibility fields
      expect(janData?.w).toBe(30000);
      expect(janData?.b).toBe(60000);
      expect(janData?.l).toBe(50000);

      // Month 1 (Feb): wajib paid, belanja unpaid, lebaran unpaid
      const febData = memberRow.months[1];
      expect(febData).not.toBeNull();
      expect(febData?.wajib).toEqual({ status: 'paid', amount: 30000 });
      expect(febData?.belanja).toEqual({ status: 'unpaid', amount: 60000 });
      expect(febData?.lebaran).toEqual({ status: 'unpaid', amount: 50000 });
      expect(febData?.w).toBe(30000);
      expect(febData?.b).toBe(0);
      expect(febData?.l).toBe(0);

      // Month 2 (Mar): all unpaid with target amounts
      const marData = memberRow.months[2];
      expect(marData).not.toBeNull();
      expect(marData?.wajib).toEqual({ status: 'unpaid', amount: 30000 });
      expect(marData?.belanja).toEqual({ status: 'unpaid', amount: 60000 });
      expect(marData?.lebaran).toEqual({ status: 'unpaid', amount: 50000 });
      expect(marData?.w).toBe(0);
      expect(marData?.b).toBe(0);
      expect(marData?.l).toBe(0);
    });

    it('Hendra Gunawan (2024): mutasi WAJIB 200.000 dari Mei s/d Des 2024 berstatus paid dengan amount 200000', async () => {
      const mockDTypes2024 = [
        { id: 'dt-pokok', name: 'Simpanan Pokok', code: 'POKOK', default_amount: 100000 },
        { id: 'dt-wajib', name: 'Simpanan Wajib', code: 'WAJIB', default_amount: 150000 },
        { id: 'dt-belanja', name: 'Simpanan Belanja', code: 'BELANJA', default_amount: 50000 },
        { id: 'dt-lebaran', name: 'Simpanan Lebaran', code: 'LEBARAN', default_amount: 50000 },
      ];

      const hendraMember = [
        {
          id: 'm-hendra',
          nama: 'Hendra Gunawan',
          nrp: 'NRP-HENDRA',
          status: 'aktif',
          membership_status: 'ACTIVE',
          tgl_awal_anggota: '2024-05-01',
          created_at: '2024-05-01T00:00:00Z',
        },
      ];

      // Mutasi Hendra Gunawan di deposit_transactions:
      // Dari Mei (5) s/d Des (12) 2024 dengan nominal Rp 200.000
      const hendraTxs: any[] = [];
      for (let mo = 5; mo <= 12; mo++) {
        hendraTxs.push({
          id: `tx-hendra-${mo}`,
          amount: 200000,
          transaction_type: 'deposit',
          for_year: 2024,
          for_month: mo,
          description: `Setoran Matriks WAJIB ${mo} 2024`,
          member_deposits: { member_id: 'm-hendra', deposit_type_id: 'dt-wajib' },
        });
      }

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes2024, error: null }) };
        }
        if (table === 'anggota') {
          const chainObj: any = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: hendraMember, error: null }),
          };
          return { select: vi.fn().mockReturnValue(chainObj) };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue(Promise.resolve({ data: hendraTxs, error: null })),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2024);
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.nama).toBe('Hendra Gunawan');

      // Bulan Jan - Apr (sebelum bergabung dan tidak ada transaksi): null
      expect(row.months[0]).toBeNull();
      expect(row.months[1]).toBeNull();
      expect(row.months[2]).toBeNull();
      expect(row.months[3]).toBeNull();

      // Bulan Mei s/d Des 2024: status paid dan amount 200000
      for (let mIdx = 4; mIdx <= 11; mIdx++) {
        const cell = row.months[mIdx];
        expect(cell).not.toBeNull();
        expect(cell?.wajib?.status).toBe('paid');
        expect(cell?.wajib?.amount).toBe(200000);
        expect(cell?.w).toBe(200000);
      }

      // Compliance dihitung positif
      expect(row.compliance).toBeGreaterThan(0);
    });

    it('Agus Susanto (2026): September berstatus partial 60.000, Oktober dan November berstatus unbilled', async () => {
      const agusMember = [
        {
          id: 'm-agus-1',
          nama: 'Agus Susanto',
          nrp: 'NRP-AGUS-1',
          status: 'aktif',
          created_at: '2022-08-01T00:00:00Z',
          tgl_awal_anggota: '2022-08-01',
        },
      ];

      const agusTiers = [
        {
          id: 't-1',
          deposit_type_code: 'WAJIB',
          start_year: 2022,
          start_month: 8,
          end_year: 2023,
          end_month: 10,
          monthly_rate: 200000,
        },
        {
          id: 't-2',
          deposit_type_code: 'WAJIB',
          start_year: 2023,
          start_month: 11,
          end_year: null,
          end_month: null,
          monthly_rate: 210000,
        },
      ];

      // Jan s/d Ags 2026 (8 bulan @ 210.000) + Sep 2026 (1 bulan @ 60.000)
      const transactions: any[] = [];
      for (let mo = 1; mo <= 8; mo++) {
        transactions.push({
          id: `tx-agus-${mo}`,
          amount: 210000,
          transaction_type: 'deposit',
          for_year: 2026,
          for_month: mo,
          member_deposits: { member_id: 'm-agus-1', deposit_type_id: 'dt-wajib' },
        });
      }
      transactions.push({
        id: 'tx-agus-sep',
        amount: 60000,
        transaction_type: 'deposit',
        for_year: 2026,
        for_month: 9,
        member_deposits: { member_id: 'm-agus-1', deposit_type_id: 'dt-wajib' },
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
        }
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: agusTiers, error: null }),
              }),
            }),
          };
        }
        if (table === 'anggota') {
          const chainObj: any = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: agusMember, error: null }),
          };
          return { select: vi.fn().mockReturnValue(chainObj) };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue(Promise.resolve({ data: transactions, error: null })),
          };
        }
        if (table === 'view_member_net_savings') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                {
                  member_id: 'm-agus-1',
                  deposit_type_code: 'WAJIB',
                  deposit_type_name: 'Simpanan Wajib',
                  net_cash_balance: 10200000,
                },
              ],
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2026);
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];

      // Kas riil tepat Rp 10.200.000
      expect(row.netSavings?.wajib).toBe(10200000);

      // Bulan Jan s/d Ags (index 0 - 7): lunas 210.000
      for (let i = 0; i < 8; i++) {
        expect(row.months[i]?.wajib?.status).toBe('paid');
        expect(row.months[i]?.wajib?.amount).toBe(210000);
      }

      // Bulan September (index 8): parsial 60.000 dari kewajiban 210.000
      expect(row.months[8]?.wajib?.status).toBe('partial');
      expect(row.months[8]?.wajib?.amount).toBe(60000);
      expect(row.months[8]?.wajib?.targetAmount).toBe(210000);

      // Bulan Oktober (index 9) dan November (index 10): pasca-alokasi unbilled (strip '-')
      expect(row.months[9]?.wajib?.status).toBe('unbilled');
      expect(row.months[10]?.wajib?.status).toBe('unbilled');
    });

    it('Agus Susanto (2026) dengan saldo 10.410.000: September lunas (paid 210.000), Oktober partial 60.000, November dan Desember unbilled', async () => {
      const agusMember = [
        {
          id: 'm-agus-1',
          nama: 'Agus Susanto',
          nrp: 'NRP-AGUS-1',
          status: 'aktif',
          created_at: '2022-08-01T00:00:00Z',
          tgl_awal_anggota: '2022-08-01',
        },
      ];

      const agusTiers = [
        {
          id: 't-1',
          deposit_type_code: 'WAJIB',
          start_year: 2022,
          start_month: 8,
          end_year: 2023,
          end_month: 10,
          monthly_rate: 200000,
        },
        {
          id: 't-2',
          deposit_type_code: 'WAJIB',
          start_year: 2023,
          start_month: 11,
          end_year: null,
          end_month: null,
          monthly_rate: 210000,
        },
      ];

      // Jan s/d Sep 2026 (9 bulan @ 210.000) + Okt 2026 (1 bulan @ 60.000)
      const transactions: any[] = [];
      for (let mo = 1; mo <= 9; mo++) {
        transactions.push({
          id: `tx-agus-2026-${mo}`,
          amount: 210000,
          transaction_type: 'deposit',
          for_year: 2026,
          for_month: mo,
          member_deposits: { member_id: 'm-agus-1', deposit_type_id: 'dt-wajib' },
        });
      }
      transactions.push({
        id: 'tx-agus-2026-oct',
        amount: 60000,
        transaction_type: 'deposit',
        for_year: 2026,
        for_month: 10,
        member_deposits: { member_id: 'm-agus-1', deposit_type_id: 'dt-wajib' },
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
        }
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: agusTiers, error: null }),
              }),
            }),
          };
        }
        if (table === 'anggota') {
          const chainObj: any = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: agusMember, error: null }),
          };
          return { select: vi.fn().mockReturnValue(chainObj) };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue(Promise.resolve({ data: transactions, error: null })),
          };
        }
        if (table === 'view_member_net_savings') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                {
                  member_id: 'm-agus-1',
                  deposit_type_code: 'WAJIB',
                  deposit_type_name: 'Simpanan Wajib',
                  net_cash_balance: 10410000,
                },
              ],
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2026);
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];

      // Kas riil tepat Rp 10.410.000
      expect(row.netSavings?.wajib).toBe(10410000);

      // Bulan Jan s/d Sep (index 0 - 8): lunas 210.000 (status: paid)
      for (let i = 0; i <= 8; i++) {
        expect(row.months[i]?.wajib?.status).toBe('paid');
        expect(row.months[i]?.wajib?.amount).toBe(210000);
      }

      // Bulan Oktober (index 9): parsial 60.000 dari kewajiban 210.000
      expect(row.months[9]?.wajib?.status).toBe('partial');
      expect(row.months[9]?.wajib?.amount).toBe(60000);
      expect(row.months[9]?.wajib?.targetAmount).toBe(210000);

      // Bulan November (index 10): pasca-alokasi unbilled (strip '-')
      expect(row.months[10]?.wajib?.status).toBe('unbilled');
    });
  });
});

describe('complianceService - importSavingsMatrixLedger', () => {
  const mockTypes = [
    { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
    { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' },
    { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Hari Raya' },
  ];

  const createDeleteChain = (onDelete?: (record: any) => void) => {
    const callRecord: any = {};
    const chain: any = {
      eq: vi.fn().mockImplementation((col: string, val: any) => {
        callRecord.eqCol = col;
        callRecord.eqVal = val;
        return chain;
      }),
      or: vi.fn().mockImplementation((val: string) => {
        callRecord.orVal = val;
        return chain;
      }),
      ilike: vi.fn().mockImplementation((col: string, val: any) => {
        callRecord.ilikeCol = col;
        callRecord.ilikeVal = val;
        return chain;
      }),
      is: vi.fn().mockImplementation((col: string, val: any) => {
        callRecord.isCol = col;
        callRecord.isVal = val;
        return chain;
      }),
      in: vi.fn().mockImplementation((col: string, ids: string[]) => {
        callRecord.inCol = col;
        callRecord.inVal = ids;
        return chain;
      }),
      then: (resolve: any) => {
        if (onDelete) onDelete({ ...callRecord });
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return chain;
  };

  it('harus mengembalikan sukses langsung jika daftar mutasi kosong', async () => {
    const res = await importSavingsMatrixLedger('WAJIB', []);
    expect(res.success).toBe(true);
    expect(res.totalMembers).toBe(0);
    expect(res.totalTransactions).toBe(0);
  });

  it('harus berhasil mengimpor mutasi simpanan, membersihkan transaksi lama, dan menyimpan data baru', async () => {
    const mockMembers = [
      { id: 'm-1', nrp: '1001', nama: 'Budi Santoso' },
      { id: 'm-2', nrp: '1002', nama: 'Siti Aminah' },
    ];

    const mockDeposits = [
      { id: 'md-1', member_id: 'm-1', deposit_type_id: 'dt-wajib' },
      { id: 'md-2', member_id: 'm-2', deposit_type_id: 'dt-wajib' },
    ];

    const mockExistingTxs = [
      { id: 'tx-old-1', member_deposit_id: 'md-1', description: 'Rekonsiliasi Otomatis Jan 2024', for_month: 1 },
      { id: 'tx-old-2', member_deposit_id: 'md-2', description: 'Saldo Awal Migrasi', for_month: null },
      { id: 'tx-keep', member_deposit_id: 'md-1', description: 'Setoran Kasir POS', for_month: 2 },
    ];

    const deleteCalls: Array<{ eqVal?: any; ilikeVal?: any; isVal?: any }> = [];
    const insertedTxs: any[][] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({ data: mockTypes, error: null }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockDeposits, error: null }),
            }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockExistingTxs, error: null }),
          }),
          delete: vi.fn().mockImplementation(() => createDeleteChain((rec) => deleteCalls.push(rec))),
          insert: vi.fn().mockImplementation((batch: any[]) => {
            insertedTxs.push(batch);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

      const mutations = [
        { nrp: '1001', year: 2024, month: 1, amount: 150000 },
        { nrp: '1001', year: 2024, month: 2, amount: 150000 },
        { nrp: '1002', year: 2024, month: 1, amount: 150000 },
        { nrp: '1002', year: 2024, month: 2, amount: 150000 },
      ];

      const result = await importSavingsMatrixLedger('WAJIB', mutations);

      expect(result.success).toBe(true);
      expect(result.totalMembers).toBe(2);
      expect(result.totalTransactions).toBe(4);
      expect(result.totalSuccess).toBe(2);
      expect(result.totalFailed).toBe(0);

      // Verifikasi pembersihan transaksi lama secara ketat berbasis ID rekening (Strict Clean Overwrite)
      expect(deleteCalls.length).toBe(2);
      expect(deleteCalls.some(c => c.eqVal === 'md-1')).toBe(true);
      expect(deleteCalls.some(c => c.eqVal === 'md-2')).toBe(true);

      // Verifikasi mutasi baru tersimpan dengan deskripsi benar
      expect(insertedTxs.flat()).toHaveLength(4);
      expect(insertedTxs[0][0]).toMatchObject({
        member_deposit_id: 'md-1',
        amount: 150000,
        for_month: 1,
        for_year: 2024,
        description: 'Import Matriks Buku Besar Excel',
      });
    });

    it('membersihkan seluruh mutasi lama (Candra Wijaya NRP 86123249) secara tuntas berbasis ID akun tanpa filter deskripsi', async () => {
      const candraMember = [{ id: 'm-candra', nrp: '86123249', nama: 'Candra Wijaya' }];
      const candraDeposit = [{ id: 'md-candra-sw', member_id: 'm-candra', deposit_type_id: 'dt-wajib' }];

      const deletedDepositIds: string[] = [];
      const insertedTxs: any[][] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockTypes, error: null }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: candraMember, error: null }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: candraDeposit, error: null }),
              }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  // Mutasi lama centang manual ('Setoran Rutin Bulanan') & deskripsi NULL
                  { id: 'tx-old-1', member_deposit_id: 'md-candra-sw', description: 'Setoran Rutin Bulanan', amount: 200000 },
                  { id: 'tx-old-2', member_deposit_id: 'md-candra-sw', description: null, amount: 200000 },
                ],
                error: null,
              }),
            }),
            delete: vi.fn().mockImplementation(() =>
              createDeleteChain((rec) => {
                if (rec.eqVal) deletedDepositIds.push(rec.eqVal);
              })
            ),
            insert: vi.fn().mockImplementation((batch: any[]) => {
              insertedTxs.push(batch);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Impor mutasi baru matriks dari Excel (misal 3 bulan @ 200.000)
      const candraMutations = [
        { nrp: '86123249', year: 2026, month: 1, amount: 200000 },
        { nrp: '86123249', year: 2026, month: 2, amount: 200000 },
        { nrp: '86123249', year: 2026, month: 3, amount: 200000 },
      ];

      const result = await importSavingsMatrixLedger('WAJIB', candraMutations);

      expect(result.success).toBe(true);
      expect(result.totalMembers).toBe(1);
      expect(result.totalTransactions).toBe(3);

      // Verifikasi: Akun deposit Candra Wijaya dipurge secara tegas dan bersih berbasis eq('member_deposit_id', 'md-candra-sw')
      expect(deletedDepositIds).toEqual(['md-candra-sw']);

      // Verifikasi: Mutasi baru disisipkan bersih tanpa duplikasi saldo
      const flattenedInserted = insertedTxs.flat();
      expect(flattenedInserted).toHaveLength(3);
      const totalNewAmount = flattenedInserted.reduce((sum, tx) => sum + tx.amount, 0);
      expect(totalNewAmount).toBe(600000); // 3 x 200.000 = 600.000, tidak berlipat ganda
    });

    it('harus secara otomatis membuat akun member_deposits jika belum ada untuk anggota', async () => {
      const mockMembers = [{ id: 'm-new', nrp: '9999', nama: 'Anggota Baru' }];
      const createdDeposits: any[] = [];
      const insertedTxs: any[][] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockTypes, error: null }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }), // belum ada
              }),
            }),
            insert: vi.fn().mockImplementation((rows: any[]) => {
              const inserted = rows.map((r, i) => ({ id: `md-new-${i + 1}`, ...r }));
              createdDeposits.push(...inserted);
              return {
                select: vi.fn().mockResolvedValue({ data: inserted, error: null }),
              };
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            delete: vi.fn().mockImplementation(() => createDeleteChain()),
            insert: vi.fn().mockImplementation((batch: any[]) => {
              insertedTxs.push(batch);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const mutations = [
        { nrp: '9999', year: 2024, month: 5, amount: 200000 },
      ];

      const result = await importSavingsMatrixLedger('WAJIB', mutations);

      expect(result.success).toBe(true);
      expect(result.totalMembers).toBe(1);
      expect(result.totalTransactions).toBe(1);
      expect(createdDeposits).toHaveLength(1);
      expect(createdDeposits[0]).toMatchObject({
        member_id: 'm-new',
        deposit_type_id: 'dt-wajib',
        is_terminated: false,
      });
      expect(insertedTxs[0][0].member_deposit_id).toBe('md-new-1');
    });

    it('harus membagi chunking batch insert per 100 baris untuk volume transaksi besar', async () => {
      const mockMembers = [{ id: 'm-1', nrp: '1001', nama: 'Budi' }];
      const mockDeposits = [{ id: 'md-1', member_id: 'm-1', deposit_type_id: 'dt-wajib' }];
      const batchCalls: any[][] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockTypes, error: null }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: mockDeposits, error: null }),
              }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            delete: vi.fn().mockImplementation(() => createDeleteChain()),
            insert: vi.fn().mockImplementation((batch: any[]) => {
              batchCalls.push(batch);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Buat 150 transaksi
      const mutations = [];
      for (let i = 1; i <= 150; i++) {
        mutations.push({
          nrp: '1001',
          year: 2020 + Math.floor(i / 12),
          month: (i % 12) + 1,
          amount: 100000,
        });
      }

      const result = await importSavingsMatrixLedger('WAJIB', mutations);

      expect(result.success).toBe(true);
      expect(result.totalTransactions).toBe(150);
      expect(batchCalls).toHaveLength(2); // 100 + 50
      expect(batchCalls[0]).toHaveLength(100);
      expect(batchCalls[1]).toHaveLength(50);
    });

    it('harus mengisolasi kegagalan per anggota dengan try-catch tanpa menghentikan anggota lain', async () => {
      const mockMembers = [
        { id: 'm-fail', nrp: '1001', nama: 'Oki Sanjaya' },
        { id: 'm-ok', nrp: '1002', nama: 'Prabowo Hadi' },
      ];
      const mockDeposits = [
        { id: 'md-fail', member_id: 'm-fail', deposit_type_id: 'dt-belanja' },
        { id: 'md-ok', member_id: 'm-ok', deposit_type_id: 'dt-belanja' },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockTypes, error: null }) };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: mockDeposits, error: null }),
              }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockImplementation(() => createDeleteChain()),
            insert: vi.fn().mockImplementation((batch: any[]) => {
              if (batch[0]?.member_deposit_id === 'md-fail') {
                return Promise.resolve({ error: new Error('PostgREST payload constraint error') });
              }
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const mutations = [
        { nrp: '1001', year: 2024, month: 1, amount: 50000 },
        { nrp: '1002', year: 2024, month: 1, amount: 50000 },
      ];

      const progressLogs: any[] = [];
      const result = await importSavingsMatrixLedger('BELANJA', mutations, (p) => progressLogs.push(p));

      // Partial success: 1 berhasil, 1 gagal
      expect(result.success).toBe(true);
      expect(result.totalMembers).toBe(2);
      expect(result.totalSuccess).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.totalTransactions).toBe(1);
      expect(result.errorList).toHaveLength(1);
      expect(result.errorList[0]).toContain('Oki Sanjaya');

      // Verifikasi progress callback memuat memberIndex dan totalMembers
      expect(progressLogs.length).toBeGreaterThanOrEqual(2);
      expect(progressLogs.some(p => p.message && p.message.includes('Memproses anggota'))).toBe(true);
    });

    it('harus mampu memproses 29 anggota dengan 1.112 transaksi tanpa terputus pada kuota 1000 (Setyawan Pratama dkk)', async () => {
      // Buat 29 anggota (NRP 1001 s/d 1029)
      const mock29Members = Array.from({ length: 29 }, (_, i) => ({
        id: `m-${i + 1}`,
        nrp: `NRP-${1000 + i + 1}`,
        nama: i === 24 ? 'Setyawan Pratama' : i === 25 ? 'Taufik Santoso' : i === 26 ? 'Wahyu Wibowo' : `Anggota ${i + 1}`,
      }));

      const mock29Deposits = mock29Members.map((m, i) => ({
        id: `md-${i + 1}`,
        member_id: m.id,
        deposit_type_id: 'dt-wajib',
      }));

      // Buat 1.112 transaksi terbagi di 29 anggota
      const mutations: any[] = [];
      let txCount = 0;
      for (let mIdx = 0; mIdx < 29; mIdx++) {
        // Anggota 0-23 masing-masing ~40 mutasi (960 total), anggota 24-28 sisa mutasi (152 total) -> total 1.112
        const countForMember = mIdx < 24 ? 40 : (mIdx === 28 ? 32 : 30);
        for (let j = 0; j < countForMember; j++) {
          txCount++;
          mutations.push({
            nrp: mock29Members[mIdx].nrp,
            year: 2021 + Math.floor(j / 12),
            month: (j % 12) + 1,
            amount: 200000,
          });
        }
      }
      expect(mutations.length).toBe(1112);

      const batchInsertSizes: number[] = [];
      const deletedMemberDepositIds: string[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockTypes, error: null }) };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mock29Members, error: null }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: mock29Deposits, error: null }),
              }),
            }),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'md-upserted' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockImplementation(() =>
              createDeleteChain((rec) => {
                if (rec.eqVal) deletedMemberDepositIds.push(rec.eqVal);
              })
            ),
            insert: vi.fn().mockImplementation((batch: any[]) => {
              batchInsertSizes.push(batch.length);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await importSavingsMatrixLedger('WAJIB', mutations);

      expect(result.success).toBe(true);
      expect(result.totalMembers).toBe(29);
      expect(result.totalTransactions).toBe(1112);
      expect(result.totalSuccess).toBe(29);
      expect(result.totalFailed).toBe(0);

      // Verifikasi seluruh batch insert berukuran <= 100 baris
      expect(batchInsertSizes.length).toBeGreaterThan(0);
      batchInsertSizes.forEach((size) => {
        expect(size).toBeLessThanOrEqual(100);
      });
      const totalInsertedRows = batchInsertSizes.reduce((a, b) => a + b, 0);
      expect(totalInsertedRows).toBe(1112);

      // Verifikasi pembersihan ketat seluruh akun simpanan anggota (Strict Clean Overwrite)
      expect(deletedMemberDepositIds.length).toBe(29);
      expect(deletedMemberDepositIds).toContain('md-1');
      expect(deletedMemberDepositIds).toContain('md-29');
    });

    it('fetchAllPaged harus mengambil seluruh data multi-halaman melewati batas 1.000 PostgREST', async () => {
      // Simulasikan tabel deposit_transactions dengan 1.112 baris
      const fake1112Rows = Array.from({ length: 1112 }, (_, i) => ({ id: `row-${i + 1}` }));
      const requestedRanges: Array<{ from: number; to: number }> = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockImplementation((from: number, to: number) => {
                requestedRanges.push({ from, to });
                const slice = fake1112Rows.slice(from, to + 1);
                return Promise.resolve({ data: slice, error: null });
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const { data, error } = await fetchAllPaged('deposit_transactions', 'id');

      expect(error).toBeNull();
      expect(data).toHaveLength(1112);
      expect(requestedRanges).toEqual([
        { from: 0, to: 999 },
        { from: 1000, to: 1999 },
      ]);
    });

    it('harus menangani kasus error jika tipe simpanan tidak ditemukan', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const mutations = [{ nrp: '1001', year: 2024, month: 1, amount: 150000 }];
      const result = await importSavingsMatrixLedger('WAJIB', mutations);

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Gagal memuat tipe simpanan');
    });
  });

  describe('getComplianceMatrixData - Net Savings Aggregation (real cash position)', () => {
    const mockDTypes = [
      { id: 'dt-pokok', name: 'Simpanan Pokok', code: 'POKOK', default_amount: 100000 },
      { id: 'dt-wajib', name: 'Simpanan Wajib', code: 'WAJIB', default_amount: 25000 },
      { id: 'dt-belanja', name: 'Simpanan Belanja', code: 'BELANJA', default_amount: 50000 },
      { id: 'dt-lebaran', name: 'Simpanan Hari Raya', code: 'LEBARAN', default_amount: 50000 },
    ];

    it('mengembalikan properti netSavings pada setiap baris anggota langsung dari view_member_net_savings', async () => {
      const mockMembers = [
        {
          id: 'm-net-1',
          nrp: 'NRP-NET-1',
          nama: 'Kapten Haryanto',
          status: 'aktif',
          membership_status: 'ACTIVE',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const mockViewRows = [
        { member_id: 'm-net-1', deposit_type_code: 'WAJIB', deposit_type_name: 'Simpanan Wajib', net_cash_balance: 300000 },
        { member_id: 'm-net-1', deposit_type_code: 'BELANJA', deposit_type_name: 'Simpanan Belanja', net_cash_balance: 150000 },
        { member_id: 'm-net-1', deposit_type_code: 'LEBARAN', deposit_type_name: 'Simpanan Hari Raya', net_cash_balance: 100000 },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
        }
        if (table === 'anggota') {
          const chainObj: any = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          };
          return { select: vi.fn().mockReturnValue(chainObj) };
        }
        if (table === 'view_member_net_savings') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockViewRows, error: null }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2026);
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.nama).toBe('Kapten Haryanto');
      expect(row.netSavings).toBeDefined();
      expect(row.netSavings).toEqual({
        wajib: 300000,
        belanja: 150000,
        lebaran: 100000,
        total: 550000,
      });
    });

    it('menghitung fallback netSavings secara tepat saat view tidak tersedia jika anggota memiliki setoran dan penarikan belanja', async () => {
      const mockMembers = [
        {
          id: 'm-net-2',
          nrp: 'NRP-NET-2',
          nama: 'Sertu Bambang',
          status: 'aktif',
          membership_status: 'ACTIVE',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      // Skenario transaksi:
      // - Wajib: setoran 250.000
      // - Belanja: setoran 500.000, penarikan (dipakai belanja POS) 200.000 -> netto: 300.000
      // - Lebaran: setoran 300.000, penarikan 100.000 -> netto: 200.000
      // - Total kas riil = 250.000 + 300.000 + 200.000 = 750.000
      const transactions = [
        {
          id: 'tx-w-1',
          amount: 250000,
          transaction_type: 'deposit',
          for_year: 2025,
          for_month: 1,
          member_deposits: { member_id: 'm-net-2', deposit_type_id: 'dt-wajib' },
        },
        {
          id: 'tx-b-dep',
          amount: 500000,
          transaction_type: 'deposit',
          for_year: 2025,
          for_month: 1,
          member_deposits: { member_id: 'm-net-2', deposit_type_id: 'dt-belanja' },
        },
        {
          id: 'tx-b-wd',
          amount: 200000,
          transaction_type: 'withdrawal',
          for_year: 2025,
          for_month: 2,
          description: 'Belanja di POS Kasir',
          member_deposits: { member_id: 'm-net-2', deposit_type_id: 'dt-belanja' },
        },
        {
          id: 'tx-l-dep',
          amount: 300000,
          transaction_type: 'deposit',
          for_year: 2025,
          for_month: 3,
          member_deposits: { member_id: 'm-net-2', deposit_type_id: 'dt-lebaran' },
        },
        {
          id: 'tx-l-wd',
          amount: 100000,
          transaction_type: 'withdrawal',
          for_year: 2025,
          for_month: 4,
          description: 'Pencairan Simpanan Lebaran',
          member_deposits: { member_id: 'm-net-2', deposit_type_id: 'dt-lebaran' },
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
        }
        if (table === 'anggota') {
          const chainObj: any = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          };
          return { select: vi.fn().mockReturnValue(chainObj) };
        }
        if (table === 'view_member_net_savings') {
          // Simulasi view tidak tersedia / kosong sehingga memaksa fallback transaksi
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue(Promise.resolve({ data: transactions, error: null })),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2026);
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.nama).toBe('Sertu Bambang');
      expect(row.netSavings).toBeDefined();
      expect(row.netSavings?.wajib).toBe(250000);
      expect(row.netSavings?.belanja).toBe(300000);
      expect(row.netSavings?.lebaran).toBe(200000);
      expect(row.netSavings?.total).toBe(750000);
    });

    it('mengembalikan netSavings 0 untuk anggota baru tanpa transaksi sama sekali', async () => {
      const mockMembers = [
        {
          id: 'm-new-zero',
          nrp: 'NRP-ZERO',
          nama: 'Prada Baru',
          status: 'aktif',
          membership_status: 'ACTIVE',
          created_at: '2026-01-01T00:00:00Z',
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
        }
        if (table === 'anggota') {
          const chainObj: any = {
            eq: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          };
          return { select: vi.fn().mockReturnValue(chainObj) };
        }
        if (table === 'view_member_net_savings') {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getComplianceMatrixData(2026);
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.netSavings).toEqual({
        wajib: 0,
        belanja: 0,
        lebaran: 0,
        total: 0,
      });
    });
  });

describe('Phase 73: getRolling12Months', () => {
  it('Kasus 1: Batas lintas tahun (referensi Nov 2026 -> mengembalikan 12 bulan mulai dari Des-25 hingga Nov-26)', () => {
    const periods = getRolling12Months(2026, 11);
    expect(periods).toHaveLength(12);

    // Bulan pertama (11 bulan sebelumnya): Des-25
    expect(periods[0]).toEqual({
      year: 2025,
      month: 12,
      label: 'Des-25',
      periodIndex: 2025 * 12 + 12,
    });

    // Bulan terakhir (bulan referensi): Nov-26
    expect(periods[11]).toEqual({
      year: 2026,
      month: 11,
      label: 'Nov-26',
      periodIndex: 2026 * 12 + 11,
    });

    // Label urutan yang tepat
    const labels = periods.map((p) => p.label);
    expect(labels).toEqual([
      'Des-25', 'Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'Mei-26',
      'Jun-26', 'Jul-26', 'Ags-26', 'Sep-26', 'Okt-26', 'Nov-26',
    ]);
  });

  it('Kasus 2: Bulan Januari (referensi Jan 2026 -> mengembalikan Feb-25 hingga Jan-26)', () => {
    const periods = getRolling12Months(2026, 1);
    expect(periods).toHaveLength(12);

    // Bulan pertama: Feb-25
    expect(periods[0]).toEqual({
      year: 2025,
      month: 2,
      label: 'Feb-25',
      periodIndex: 2025 * 12 + 2,
    });

    // Bulan terakhir: Jan-26
    expect(periods[11]).toEqual({
      year: 2026,
      month: 1,
      label: 'Jan-26',
      periodIndex: 2026 * 12 + 1,
    });

    const labels = periods.map((p) => p.label);
    expect(labels).toEqual([
      'Feb-25', 'Mar-25', 'Apr-25', 'Mei-25', 'Jun-25', 'Jul-25',
      'Ags-25', 'Sep-25', 'Okt-25', 'Nov-25', 'Des-25', 'Jan-26',
    ]);
  });

  it('Kasus 3: Memastikan panjang tepat 12 elemen dan setiap objek memiliki year, month, label, periodIndex yang monotonik naik', () => {
    const testCases = [
      { year: 2024, month: 6 },
      { year: 2025, month: 12 },
      { year: 2027, month: 3 },
    ];

    for (const tc of testCases) {
      const periods = getRolling12Months(tc.year, tc.month);
      expect(periods).toHaveLength(12);

      for (let i = 0; i < 12; i++) {
        const p = periods[i];
        expect(typeof p.year).toBe('number');
        expect(typeof p.month).toBe('number');
        expect(p.month).toBeGreaterThanOrEqual(1);
        expect(p.month).toBeLessThanOrEqual(12);
        expect(typeof p.label).toBe('string');
        expect(p.periodIndex).toBe(p.year * 12 + p.month);

        if (i > 0) {
          expect(p.periodIndex).toBe(periods[i - 1].periodIndex + 1);
        }
      }
    }
  });
});

describe('Phase 73: getComplianceMatrixData - Rolling Window & Opening Balance Ledger', () => {
  const mockDTypes = [
    { id: 'dt-pokok', name: 'Simpanan Pokok', code: 'POKOK', default_amount: 100000 },
    { id: 'dt-wajib', name: 'Simpanan Wajib', code: 'WAJIB', default_amount: 25000 },
    { id: 'dt-belanja', name: 'Simpanan Belanja', code: 'BELANJA', default_amount: 50000 },
    { id: 'dt-lebaran', name: 'Simpanan Hari Raya', code: 'LEBARAN', default_amount: 50000 },
  ];

  it('Kasus transaksi sebelum periode 12 bulan bergulir: pastikan masuk ke openingBalance dan digulung ke kolom pertama', async () => {
    const mockMembers = [
      {
        id: 'm-rolling-carry',
        nrp: 'NRP-ROLL-1',
        nama: 'Mayor Wahyudi',
        status: 'aktif',
        membership_status: 'ACTIVE',
        created_at: '2024-01-01T00:00:00Z',
      },
    ];

    // Jendela rolling dengan refMonth = 11 (Nov 2026):
    // Window: Des 2025 (idx 0) s/d Nov 2026 (idx 11).
    // windowStartIndex = 2025 * 12 + 12 = 24312.
    // Transaksi sebelum Des 2025 (Mei 2025 & Ags 2025):
    // Wajib: +500.000, Belanja: +200.000, Lebaran: +100.000, Belanja withdrawal: -50.000.
    // Net Opening Balance expected: W = 500.000, B = 150.000, L = 100.000. Total = 750.000.
    // Di bulan pertama jendela (Des 2025): setoran rutin W: 25.000, B: 50.000, L: 50.000.
    const transactions = [
      // Pokok (lunas)
      {
        id: 'tx-pokok-1',
        amount: 100000,
        transaction_type: 'deposit',
        member_deposits: { member_id: 'm-rolling-carry', deposit_type_id: 'dt-pokok' },
      },
      // Pre-window transactions (Mei 2025)
      {
        id: 'tx-pre-w',
        amount: 500000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: 5,
        member_deposits: { member_id: 'm-rolling-carry', deposit_type_id: 'dt-wajib' },
      },
      {
        id: 'tx-pre-b',
        amount: 200000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: 5,
        member_deposits: { member_id: 'm-rolling-carry', deposit_type_id: 'dt-belanja' },
      },
      {
        id: 'tx-pre-l',
        amount: 100000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: 5,
        member_deposits: { member_id: 'm-rolling-carry', deposit_type_id: 'dt-lebaran' },
      },
      // Pre-window withdrawal (Ags 2025)
      {
        id: 'tx-pre-b-wd',
        amount: 50000,
        transaction_type: 'withdrawal',
        for_year: 2025,
        for_month: 8,
        member_deposits: { member_id: 'm-rolling-carry', deposit_type_id: 'dt-belanja' },
      },
      // Window month 0 (Desember 2025): for_year 2025, for_month 12
      {
        id: 'tx-win0-w',
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: 12,
        member_deposits: { member_id: 'm-rolling-carry', deposit_type_id: 'dt-wajib' },
      },
      {
        id: 'tx-win0-b',
        amount: 50000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: 12,
        member_deposits: { member_id: 'm-rolling-carry', deposit_type_id: 'dt-belanja' },
      },
      {
        id: 'tx-win0-l',
        amount: 50000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: 12,
        member_deposits: { member_id: 'm-rolling-carry', deposit_type_id: 'dt-lebaran' },
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_types') {
        return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
      }
      if (table === 'anggota') {
        const chainObj: any = {
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
        };
        return { select: vi.fn().mockReturnValue(chainObj) };
      }
      if (table === 'view_member_net_savings') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue(Promise.resolve({ data: transactions, error: null })),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await getComplianceMatrixData('rolling', undefined, 11);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    // Validasi Opening Balance pra-jendela
    expect(row.openingBalance).toEqual({
      w: 500000,
      b: 150000,
      l: 100000,
    });

    // Validasi kolom 0 (Des 2025)
    expect(row.months[0]).not.toBeNull();
    expect(row.months[0]?.isOpeningBalanceMonth).toBe(true);
    expect(row.months[0]?.w).toBe(25000);
    expect(row.months[0]?.b).toBe(50000);
    expect(row.months[0]?.l).toBe(50000);

    // Running cumulative balance di kolom 0 harus memuat saldo bawaan + setoran bulan ini
    expect(row.months[0]?.bal_w).toBe(525000); // 500k + 25k
    expect(row.months[0]?.bal_b).toBe(200000); // 150k + 50k
    expect(row.months[0]?.bal_l).toBe(150000); // 100k + 50k
    expect(row.months[0]?.cum_w).toBe(525000);
    expect(row.months[0]?.cum_b).toBe(200000);
    expect(row.months[0]?.cum_l).toBe(150000);
  });

  it('Kasus akumulasi berantai: pastikan bal_w / bal_b / bal_l pada kolom bulan ke-11 seimbang dengan total mutasi kas riil anggota', async () => {
    const mockMembers = [
      {
        id: 'm-chain',
        nrp: 'NRP-CHAIN-1',
        nama: 'Lettu Hendro',
        status: 'aktif',
        membership_status: 'ACTIVE',
        created_at: '2023-01-01T00:00:00Z',
      },
    ];

    // Window: Des 2025 (idx 0) s/d Nov 2026 (idx 11).
    // Pre-window (2024):
    // Wajib: 100.000, Belanja: 100.000, Lebaran: 100.000.
    // Dalam jendela 12 bulan (bulan 0 s/d 11):
    // Setiap bulan: Wajib +25.000, Belanja +50.000, Lebaran +50.000.
    // Bulan 6 (Jun 2026): Belanja withdrawal -100.000.
    // Total mutasi riil:
    // Wajib: 100k + 12 * 25k = 400.000
    // Belanja: 100k + 12 * 50k - 100k = 600.000
    // Lebaran: 100k + 12 * 50k = 700.000
    // Total: 1.700.000
    const periods = getRolling12Months(2026, 11);
    const txList: any[] = [
      // Pokok (lunas)
      {
        id: 'tx-pokok-ch',
        amount: 100000,
        transaction_type: 'deposit',
        member_deposits: { member_id: 'm-chain', deposit_type_id: 'dt-pokok' },
      },
      // Pre-window 2024
      {
        id: 'tx-pre-w-ch',
        amount: 100000,
        transaction_type: 'deposit',
        for_year: 2024,
        for_month: 6,
        member_deposits: { member_id: 'm-chain', deposit_type_id: 'dt-wajib' },
      },
      {
        id: 'tx-pre-b-ch',
        amount: 100000,
        transaction_type: 'deposit',
        for_year: 2024,
        for_month: 6,
        member_deposits: { member_id: 'm-chain', deposit_type_id: 'dt-belanja' },
      },
      {
        id: 'tx-pre-l-ch',
        amount: 100000,
        transaction_type: 'deposit',
        for_year: 2024,
        for_month: 6,
        member_deposits: { member_id: 'm-chain', deposit_type_id: 'dt-lebaran' },
      },
    ];

    // Tambahkan transaksi untuk setiap bulan di jendela bergulir
    periods.forEach((p, idx) => {
      txList.push({
        id: `tx-win-w-${idx}`,
        amount: 25000,
        transaction_type: 'deposit',
        for_year: p.year,
        for_month: p.month,
        member_deposits: { member_id: 'm-chain', deposit_type_id: 'dt-wajib' },
      });
      txList.push({
        id: `tx-win-b-${idx}`,
        amount: 50000,
        transaction_type: 'deposit',
        for_year: p.year,
        for_month: p.month,
        member_deposits: { member_id: 'm-chain', deposit_type_id: 'dt-belanja' },
      });
      txList.push({
        id: `tx-win-l-${idx}`,
        amount: 50000,
        transaction_type: 'deposit',
        for_year: p.year,
        for_month: p.month,
        member_deposits: { member_id: 'm-chain', deposit_type_id: 'dt-lebaran' },
      });

      // Bulan ke-6 (Jun 2026): penarikan belanja 100k
      if (idx === 6) {
        txList.push({
          id: 'tx-win-b-wd-6',
          amount: 100000,
          transaction_type: 'withdrawal',
          for_year: p.year,
          for_month: p.month,
          member_deposits: { member_id: 'm-chain', deposit_type_id: 'dt-belanja' },
        });
      }
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_types') {
        return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
      }
      if (table === 'anggota') {
        const chainObj: any = {
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
        };
        return { select: vi.fn().mockReturnValue(chainObj) };
      }
      if (table === 'view_member_net_savings') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue(Promise.resolve({ data: txList, error: null })),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await getComplianceMatrixData('rolling', undefined, 11);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    // Pastikan saldo awal pra-jendela benar
    expect(row.openingBalance).toEqual({ w: 100000, b: 100000, l: 100000 });

    // Periksa saldo bulan terakhir (idx 11, Nov 2026)
    const lastMonthCell = row.months[11];
    expect(lastMonthCell).not.toBeNull();
    expect(lastMonthCell?.bal_w).toBe(400000);
    expect(lastMonthCell?.bal_b).toBe(600000);
    expect(lastMonthCell?.bal_l).toBe(700000);
    expect(lastMonthCell?.cum_w).toBe(400000);
    expect(lastMonthCell?.cum_b).toBe(600000);
    expect(lastMonthCell?.cum_l).toBe(700000);

    // Total kas riil pada netSavings harus match persis dengan bal_w + bal_b + bal_l di bulan ke-11
    expect(row.netSavings?.wajib).toBe(400000);
    expect(row.netSavings?.belanja).toBe(600000);
    expect(row.netSavings?.lebaran).toBe(700000);
    expect(row.netSavings?.total).toBe(1700000);
    expect(lastMonthCell!.bal_w + lastMonthCell!.bal_b + lastMonthCell!.bal_l).toBe(row.netSavings?.total);
  });
});

describe('Phase 74: Cross-Year Rolling Window & Prior Balance Summary Engine', () => {
  const mockDTypes = [
    { id: 'dt-pokok', name: 'Simpanan Pokok', code: 'POKOK', default_amount: 100000 },
    { id: 'dt-wajib', name: 'Simpanan Wajib', code: 'WAJIB', default_amount: 25000 },
    { id: 'dt-belanja', name: 'Simpanan Belanja', code: 'BELANJA', default_amount: 50000 },
    { id: 'dt-lebaran', name: 'Simpanan Hari Raya', code: 'LEBARAN', default_amount: 50000 },
  ];

  it('getRolling12MonthRange(2026, 10) menghasilkan tepat 12 bulan dari Nov-25 hingga Okt-26', () => {
    const periods = getRolling12MonthRange(2026, 10);
    expect(periods).toHaveLength(12);

    // Bulan pertama: Nov 2025
    expect(periods[0].year).toBe(2025);
    expect(periods[0].month).toBe(11);
    expect(periods[0].label).toBe('Nov-25');
    expect(periods[0].periodIndex).toBe(2025 * 12 + 11);

    // Bulan terakhir: Okt 2026
    expect(periods[11].year).toBe(2026);
    expect(periods[11].month).toBe(10);
    expect(periods[11].label).toBe('Okt-26');
    expect(periods[11].periodIndex).toBe(2026 * 12 + 10);

    // 12 label periode berurutan
    const expectedLabels = [
      'Nov-25', 'Des-25', 'Jan-26', 'Feb-26', 'Mar-26', 'Apr-26',
      'Mei-26', 'Jun-26', 'Jul-26', 'Ags-26', 'Sep-26', 'Okt-26',
    ];
    expect(periods.map(p => p.label)).toEqual(expectedLabels);

    // Pastikan getRolling12Months kompatibel / mendelegasikan ke getRolling12MonthRange
    const delegated = getRolling12Months(2026, 10);
    expect(delegated).toEqual(periods);
  });

  it('menghitung priorSummary untuk transaksi sebelum Nov-25 dan menyeimbangkan saldo kas riil anggota secara presisi', async () => {
    const mockMembers = [
      {
        id: 'm-p74-1',
        nrp: 'NRP-P74-01',
        nama: 'Hartono Pra-Jendela',
        membership_status: 'ACTIVE',
        status: 'aktif',
        created_at: '2023-01-01T00:00:00Z',
      },
    ];

    const periods = getRolling12MonthRange(2026, 10); // Nov-25 s/d Okt-26
    const cutoffIndex = periods[0].periodIndex; // 2025 * 12 + 11

    const txList: any[] = [
      // 1. Simpanan Pokok Lunas
      {
        id: 'tx-sp',
        amount: 100000,
        transaction_type: 'deposit',
        for_year: 2023,
        for_month: 1,
        member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-pokok' },
      },
      // 2. Transaksi Pra-Jendela (sebelum Nov-25):
      // 2024: Setoran Wajib 500.000, Belanja 300.000, Lebaran 200.000
      {
        id: 'tx-pre-w1',
        amount: 500000,
        transaction_type: 'deposit',
        for_year: 2024,
        for_month: 6,
        member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-wajib' },
      },
      {
        id: 'tx-pre-b1',
        amount: 300000,
        transaction_type: 'deposit',
        for_year: 2024,
        for_month: 6,
        member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-belanja' },
      },
      {
        id: 'tx-pre-b-wd',
        amount: 50000,
        transaction_type: 'withdrawal',
        for_year: 2024,
        for_month: 7,
        member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-belanja' },
      },
      {
        id: 'tx-pre-l1',
        amount: 200000,
        transaction_type: 'deposit',
        for_year: 2024,
        for_month: 6,
        member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-lebaran' },
      },
      // Okt-25 (periode index 2025 * 12 + 10 < cutoffIndex): Setoran Wajib 100.000
      {
        id: 'tx-pre-w2',
        amount: 100000,
        transaction_type: 'deposit',
        for_year: 2025,
        for_month: 10,
        member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-wajib' },
      },
    ];

    // 3. Transaksi rutin dalam jendela 12 bulan (Nov-25 s/d Okt-26):
    // Setiap bulan: W 25.000, B 50.000, L 50.000
    periods.forEach((p, idx) => {
      txList.push({
        id: `tx-win-w-${idx}`,
        amount: 25000,
        transaction_type: 'deposit',
        for_year: p.year,
        for_month: p.month,
        member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-wajib' },
      });
      txList.push({
        id: `tx-win-b-${idx}`,
        amount: 50000,
        transaction_type: 'deposit',
        for_year: p.year,
        for_month: p.month,
        member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-belanja' },
      });
      txList.push({
        id: `tx-win-l-${idx}`,
        amount: 50000,
        transaction_type: 'deposit',
        for_year: p.year,
        for_month: p.month,
        member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-lebaran' },
      });
    });

    // Tambah satu penarikan lebaran 100.000 di Mar-26 (idx 4)
    txList.push({
      id: 'tx-win-l-wd',
      amount: 100000,
      transaction_type: 'withdrawal',
      for_year: 2026,
      for_month: 3,
      member_deposits: { member_id: 'm-p74-1', deposit_type_id: 'dt-lebaran' },
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_types') {
        return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
      }
      if (table === 'anggota') {
        const chainObj: any = {
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
        };
        return { select: vi.fn().mockReturnValue(chainObj) };
      }
      if (table === 'view_member_net_savings') {
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue(Promise.resolve({ data: txList, error: null })),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await getComplianceMatrixData('rolling', undefined, 10);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    // Verifikasi priorSummary terisi tepat dengan akumulasi pra-jendela:
    // Wajib: 500.000 + 100.000 = 600.000
    // Belanja: 300.000 - 50.000 = 250.000
    // Lebaran: 200.000
    // Total: 1.050.000
    expect(row.priorSummary).toBeDefined();
    expect(row.priorSummary).toEqual({
      wajib: 600000,
      belanja: 250000,
      lebaran: 200000,
      total: 1050000,
    });
    expect(row.openingBalance).toEqual({
      w: 600000,
      b: 250000,
      l: 200000,
    });

    // Verifikasi kolom bulan pertama (Nov-25, idx 0):
    // Saldo bawaan + mutasi Nov-25
    const firstMonth = row.months[0];
    expect(firstMonth).not.toBeNull();
    expect(firstMonth?.bal_w).toBe(600000 + 25000); // 625.000
    expect(firstMonth?.bal_b).toBe(250000 + 50000); // 300.000
    expect(firstMonth?.bal_l).toBe(200000 + 50000); // 250.000

    // Verifikasi kolom bulan terakhir (Okt-26, idx 11):
    // bal_w = 600.000 + 12 * 25.000 = 900.000
    // bal_b = 250.000 + 12 * 50.000 = 850.000
    // bal_l = 200.000 + 12 * 50.000 - 100.000 = 700.000
    const lastMonth = row.months[11];
    expect(lastMonth).not.toBeNull();
    expect(lastMonth?.bal_w).toBe(900000);
    expect(lastMonth?.bal_b).toBe(850000);
    expect(lastMonth?.bal_l).toBe(700000);

    // Verifikasi rekonsiliasi kas riil: Saldo Awal (priorSummary) + mutasi 12 bulan = netSavings.total
    const expectedTotalCash = 900000 + 850000 + 700000; // 2.450.000
    expect(row.netSavings?.wajib).toBe(900000);
    expect(row.netSavings?.belanja).toBe(850000);
    expect(row.netSavings?.lebaran).toBe(700000);
    expect(row.netSavings?.total).toBe(expectedTotalCash);

    // Keseimbangan absolut: Saldo akhir kolom 11 seimbang sempurna dengan saldo kas riil
    expect(lastMonth!.bal_w + lastMonth!.bal_b + lastMonth!.bal_l).toBe(row.netSavings?.total);
    expect(row.priorSummary!.total + (12 * 25000 + 12 * 50000 + 12 * 50000 - 100000)).toBe(row.netSavings?.total);
  });

  it('otomatis mendeteksi bulan transaksi setoran terakhir (Okt 2026) ketika refMonth tidak dispesifikasikan dalam mode rolling', async () => {
    const mockMembers = [
      {
        id: 'm-auto-1',
        nrp: 'NRP-AUTO-01',
        nama: 'Bambang Auto-Detect',
        membership_status: 'ACTIVE',
        status: 'aktif',
        created_at: '2023-01-01T00:00:00Z',
      },
    ];

    const txList = [
      {
        id: 'tx-last-oct',
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2026,
        for_month: 10,
        member_deposits: { member_id: 'm-auto-1', deposit_type_id: 'dt-wajib' },
      },
      {
        id: 'tx-sep',
        amount: 25000,
        transaction_type: 'deposit',
        for_year: 2026,
        for_month: 9,
        member_deposits: { member_id: 'm-auto-1', deposit_type_id: 'dt-wajib' },
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_types') {
        return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
      }
      if (table === 'anggota') {
        const chainObj: any = {
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
        };
        return { select: vi.fn().mockReturnValue(chainObj) };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue(Promise.resolve({ data: txList, error: null })),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    // Panggil mode 'rolling' tanpa refMonth
    const result = await getComplianceMatrixData('rolling');
    expect(result.periods).toBeDefined();
    expect(result.periods).toHaveLength(12);

    // Otomatis berujung di Okt-26 dan berawal di Nov-25
    expect(result.periods![0].label).toBe('Nov-25');
    expect(result.periods![11].label).toBe('Okt-26');
    expect(result.cutoffIndex).toBe(2025 * 12 + 11);
  });

  it('parseCutoffDateInfo mem-parsing tanggal YYYY-MM-DD menjadi metadata cut-off', () => {
    const info = parseCutoffDateInfo('2026-11-13');
    expect(info).not.toBeNull();
    expect(info?.year).toBe(2026);
    expect(info?.month).toBe(11);
    expect(info?.day).toBe(13);
    expect(info?.periodIndex).toBe(2026 * 12 + 11);
    expect(info?.formattedDate).toBe('13 Nov 2026');
  });

  it('membukukan Saldo Awal Simpanan secara utuh tanpa mengurai mundur & menandai bulan pra-cut-off sebagai covered_by_opening', async () => {
    const mockMembers = [
      {
        id: 'm-cutoff-svc-1',
        nrp: 'NRP-CUT-01',
        nama: 'Briptu Tegar',
        membership_status: 'ACTIVE',
        status: 'aktif',
        created_at: '2020-01-01T00:00:00Z',
      },
    ];

    const txList = [
      {
        id: 'tx-sa-pokok',
        amount: 100000,
        transaction_type: 'deposit',
        for_year: null,
        for_month: null,
        description: 'Saldo Awal Simpanan (Aktif sejak 2026-11-13)',
        member_deposits: { member_id: 'm-cutoff-svc-1', deposit_type_id: 'dt-pokok' },
      },
      {
        id: 'tx-sa-wajib',
        amount: 10200000,
        transaction_type: 'deposit',
        for_year: null,
        for_month: null,
        description: 'Saldo Awal Simpanan (Aktif sejak 2026-11-13)',
        member_deposits: { member_id: 'm-cutoff-svc-1', deposit_type_id: 'dt-wajib' },
      },
      {
        id: 'tx-post-nov-wajib',
        amount: 200000,
        transaction_type: 'deposit',
        for_year: 2026,
        for_month: 11,
        description: 'Setoran Matriks WAJIB Nov 2026',
        member_deposits: { member_id: 'm-cutoff-svc-1', deposit_type_id: 'dt-wajib' },
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'system_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { key: 'initial_savings_effective_date', value: '2026-11-13' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'deposit_types') {
        return { select: vi.fn().mockResolvedValue({ data: mockDTypes, error: null }) };
      }
      if (table === 'anggota') {
        const chainObj: any = {
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
        };
        return { select: vi.fn().mockReturnValue(chainObj) };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue(Promise.resolve({ data: txList, error: null })),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const result = await getComplianceMatrixData(2026);
    expect(result.cutoffDate).toBe('2026-11-13');
    expect(result.cutoffYear).toBe(2026);
    expect(result.cutoffMonth).toBe(11);
    expect(result.cutoffPeriodIndex).toBe(2026 * 12 + 11);

    const row = result.rows.find((r) => r.member_id === 'm-cutoff-svc-1')!;
    expect(row).toBeDefined();
    expect(row.cutoffYear).toBe(2026);
    expect(row.cutoffMonth).toBe(11);
    // Saldo Awal Simpanan Wajib Rp 10.200.000 utuh pada priorSummary & pokokBalance Rp 100.000
    expect(row.priorSummary?.wajib).toBe(10200000);
    expect(row.pokokBalance).toBe(100000);

    // Bulan sebelum cut-off (Jan-Okt 2026 -> index 0..9) harus berstatus 'covered_by_opening' tanpa diurai atau ditandai unpaid
    for (let mIdx = 0; mIdx < 10; mIdx++) {
      expect(row.months[mIdx]?.w).toBe(0);
      expect(row.months[mIdx]?.isBeforeCutoff).toBe(true);
      expect(row.months[mIdx]?.wajib?.status).toBe('covered_by_opening');
      expect(row.months[mIdx]?.belanja?.status).toBe('covered_by_opening');
      expect(row.months[mIdx]?.lebaran?.status).toBe('covered_by_opening');
    }

    // Bulan pasca cut-off (Nov 2026 -> index 10) menampilkan setoran baru + running cumulative dimulai dari Saldo Awal utuh
    expect(row.months[10]?.w).toBe(200000);
    expect(row.months[10]?.wajib?.status).toBe('paid');
    expect(row.months[10]?.bal_w).toBe(10400000);
    expect(row.netSavings?.wajib).toBe(10400000);
  });
});


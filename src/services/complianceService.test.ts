import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSavingsComplianceAvailableYears,
  getComplianceMatrixData,
  matchDepositType,
  DepositTypeItem,
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
  });
});

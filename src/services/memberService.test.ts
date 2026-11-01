import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMembersComprehensiveReport, MemberComprehensiveExportRow } from './memberService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('memberService - getMembersComprehensiveReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when memberIds is empty array', async () => {
    const result = await getMembersComprehensiveReport([]);
    expect(result).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('should return empty array when no members found in database', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    (supabase.from as any) = mockFrom;

    const result = await getMembersComprehensiveReport();
    expect(result).toEqual([]);
  });

  it('should throw an error when member query fails', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection error' },
        }),
      }),
    });
    (supabase.from as any) = mockFrom;

    await expect(getMembersComprehensiveReport()).rejects.toThrow(
      'Gagal memuat data anggota: Database connection error'
    );
  });

  it('should return 14 fields with accurate deposit & loan aggregations', async () => {
    const mockMembers = [
      {
        id: 'member-1',
        nrp: '123456',
        nama: 'Kopda Ahmad',
        pangkat: 'Kopda',
        bank_account_number: '0011223344',
        membership_status: 'ACTIVE',
        created_at: '2023-01-15T10:00:00.000Z',
        status: 'aktif',
      },
      {
        id: 'member-2',
        nrp: '654321',
        nama: 'Sertu Budi',
        pangkat: 'Sertu',
        bank_account_number: '5566778899',
        membership_status: 'READY_TO_RESIGN',
        created_at: '2022-05-20T08:30:00.000Z',
        status: 'aktif',
      },
    ];

    const mockDeposits = [
      // member-1: Pokok 100k, Wajib 200k - 50k = 150k, Belanja 50k, Lebaran 75k
      {
        member_id: 'member-1',
        deposit_types: { name: 'Simpanan Pokok' },
        deposit_transactions: [{ amount: 100000, transaction_type: 'deposit' }],
      },
      {
        member_id: 'member-1',
        deposit_types: { name: 'Simpanan Wajib Bulanan' },
        deposit_transactions: [
          { amount: 200000, transaction_type: 'deposit' },
          { amount: 50000, transaction_type: 'withdrawal' },
        ],
      },
      {
        member_id: 'member-1',
        deposit_types: { name: 'Simpanan Belanja Sukarela' },
        deposit_transactions: [{ amount: 50000, transaction_type: 'deposit' }],
      },
      {
        member_id: 'member-1',
        deposit_types: { name: 'Simpanan Hari Raya' },
        deposit_transactions: [{ amount: 75000, transaction_type: 'deposit' }],
      },
    ];

    const mockLoans = [
      // member-1 has active loan with schedules
      {
        id: 'loan-1',
        member_id: 'member-1',
        amount: 5000000,
        principal_amount: 5000000,
        tenor: 10,
        agreed_tenor_months: 10,
        disbursed_at: '2024-02-01T00:00:00.000Z',
        created_at: '2024-02-01T00:00:00.000Z',
        status: 'active',
        loan_schedules: [
          { id: 's1', target_amount: 500000, paid_amount: 500000, status: 'paid' },
          { id: 's2', target_amount: 500000, paid_amount: 200000, status: 'partial' },
          { id: 's3', target_amount: 500000, paid_amount: 0, status: 'unpaid' },
        ],
        loan_repayments: [],
      },
      // member-2 has approved loan with repayments only (no schedules)
      {
        id: 'loan-2',
        member_id: 'member-2',
        amount: 2000000,
        principal_amount: 2000000,
        tenor: 5,
        agreed_tenor_months: 5,
        disbursed_at: '2024-03-10T00:00:00.000Z',
        created_at: '2024-03-10T00:00:00.000Z',
        status: 'approved',
        loan_schedules: [],
        loan_repayments: [{ amount_paid: 800000 }],
      },
    ];

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockDeposits, error: null }),
          }),
        };
      }
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const report = await getMembersComprehensiveReport();

    expect(report).toHaveLength(2);

    // Verify 14 exact fields for member-1
    const m1 = report[0];
    expect(m1).toEqual<MemberComprehensiveExportRow>({
      nrp: '123456',
      nama: 'Kopda Ahmad',
      pangkat: 'Kopda',
      bank_account_number: '0011223344',
      membership_status: 'ACTIVE',
      tgl_awal_anggota: '2023-01-15',
      jumlah_simpanan_pokok: 100000,
      jumlah_simpanan_wajib: 150000,
      jumlah_simpanan_belanja: 50000,
      jumlah_simpanan_lebaran: 75000,
      jumlah_pinjaman: 5000000,
      tgl_awal_pinjaman: '2024-02-01',
      tenor: 10,
      // sisa = (500000-200000) + (500000-0) = 300000 + 500000 = 800000
      sisa_pinjaman: 800000,
    });

    // Verify member-2 with repayment calculation and 0 deposits
    const m2 = report[1];
    expect(m2).toEqual<MemberComprehensiveExportRow>({
      nrp: '654321',
      nama: 'Sertu Budi',
      pangkat: 'Sertu',
      bank_account_number: '5566778899',
      membership_status: 'READY_TO_RESIGN',
      tgl_awal_anggota: '2022-05-20',
      jumlah_simpanan_pokok: 0,
      jumlah_simpanan_wajib: 0,
      jumlah_simpanan_belanja: 0,
      jumlah_simpanan_lebaran: 0,
      jumlah_pinjaman: 2000000,
      tgl_awal_pinjaman: '2024-03-10',
      tenor: 5,
      // sisa = 2000000 - 800000 = 1200000
      sisa_pinjaman: 1200000,
    });
  });

  it('should safely handle members without any deposit or loan history', async () => {
    const mockMembers = [
      {
        id: 'member-clean',
        nrp: '999999',
        nama: 'Praka Charlie',
        pangkat: 'Praka',
        bank_account_number: null,
        membership_status: null,
        created_at: '2025-06-01',
        status: 'aktif',
      },
    ];

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const report = await getMembersComprehensiveReport();
    expect(report).toHaveLength(1);

    const m = report[0];
    expect(m.nrp).toBe('999999');
    expect(m.nama).toBe('Praka Charlie');
    expect(m.pangkat).toBe('Praka');
    expect(m.bank_account_number).toBe('');
    expect(m.membership_status).toBe('aktif');
    expect(m.tgl_awal_anggota).toBe('2025-06-01');
    expect(m.jumlah_simpanan_pokok).toBe(0);
    expect(m.jumlah_simpanan_wajib).toBe(0);
    expect(m.jumlah_simpanan_belanja).toBe(0);
    expect(m.jumlah_simpanan_lebaran).toBe(0);
    expect(m.jumlah_pinjaman).toBe(0);
    expect(m.tgl_awal_pinjaman).toBe('');
    expect(m.tenor).toBe(0);
    expect(m.sisa_pinjaman).toBe(0);
  });

  it('should filter by memberIds when provided', async () => {
    const mockInMember = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [{ id: 'm-selected', nrp: '111', nama: 'Selected Member', created_at: '2024-01-01' }],
        error: null,
      }),
    });

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            in: mockInMember,
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const report = await getMembersComprehensiveReport(['m-selected']);
    expect(mockInMember).toHaveBeenCalledWith('id', ['m-selected']);
    expect(report).toHaveLength(1);
    expect(report[0].nrp).toBe('111');
  });
});

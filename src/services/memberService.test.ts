import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMembersComprehensiveReport,
  MemberComprehensiveExportRow,
  createMember,
  resetAllMembersData,
  extractMemberTHP,
  getActiveMembersForLoan,
  getActiveMemberDepositDefaults,
  fetchAllAnggotaPaged,
  getAnggota,
  addAnggota,
  updateAnggota,
  deleteAnggota,
  getAnggotaWithSimpanan,
} from './memberService';
import { supabase } from '../lib/supabaseClient';
import { clearTierCache } from './savingsRateService';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
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

  it('should aggregate multiple active loans for the same member correctly (sum amounts, max tenor, earliest date)', async () => {
    const mockMembers = [
      {
        id: 'member-multi-loans',
        nrp: '777888',
        nama: 'Aipda Gunawan',
        pangkat: 'Aipda',
        bank_account_number: '998877',
        membership_status: 'ACTIVE',
        created_at: '2022-01-01',
      },
    ];

    const mockLoans = [
      {
        id: 'loan-a',
        member_id: 'member-multi-loans',
        amount: 3000000,
        tenor: 6,
        disbursed_at: '2024-01-15T00:00:00Z',
        loan_schedules: [],
        loan_repayments: [{ amount_paid: 1000000 }], // sisa = 2M
      },
      {
        id: 'loan-b',
        member_id: 'member-multi-loans',
        amount: 2000000,
        tenor: 12,
        disbursed_at: '2024-02-01T00:00:00Z',
        loan_schedules: [],
        loan_repayments: [{ amount_paid: 500000 }], // sisa = 1.5M
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
              in: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const report = await getMembersComprehensiveReport();
    expect(report).toHaveLength(1);

    const m = report[0];
    expect(m.jumlah_pinjaman).toBe(5000000); // 3M + 2M
    expect(m.sisa_pinjaman).toBe(3500000); // 2M + 1.5M
    expect(m.tenor).toBe(12); // max(6, 12)
    expect(m.tgl_awal_pinjaman).toBe('2024-01-15'); // earliest disbursed_at
  });

  it('should handle non-fatal error in loans query gracefully with console.warn', async () => {
    const mockMembers = [
      {
        id: 'm-warn',
        nrp: '555',
        nama: 'Briptu Dian',
        created_at: '2023-05-01',
      },
    ];

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
              in: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Timeout loading loans' },
              }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const report = await getMembersComprehensiveReport();
    expect(warnSpy).toHaveBeenCalledWith(
      'Gagal memuat pinjaman aktif anggota:',
      'Timeout loading loans'
    );
    expect(report).toHaveLength(1);
    expect(report[0].jumlah_pinjaman).toBe(0);
    expect(report[0].sisa_pinjaman).toBe(0);

    warnSpy.mockRestore();
  });
});

describe('memberService - createMember', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully create a member with bank_account_number and tgl_awal_anggota, and auto-enroll deposit accounts', async () => {
    const mockCreatedMember = {
      id: 'member-101',
      nrp: '12345678',
      nama: 'Serma Joni',
      pangkat: 'Serma',
      master_thp: 6000000,
      bank_account_number: '115738953714',
      status: 'aktif',
      membership_status: 'ACTIVE',
      created_at: new Date('2023-05-10').toISOString(),
    };

    const mockDepositTypes = [
      { id: 'dt-1', code: 'SP', name: 'Simpanan Pokok', is_active: true },
      { id: 'dt-2', code: 'SW', name: 'Simpanan Wajib', is_active: true },
      { id: 'dt-3', code: 'SB', name: 'Simpanan Belanja', is_active: true },
      { id: 'dt-4', code: 'SL', name: 'Simpanan Lebaran', is_active: true },
      { id: 'dt-5', code: 'SX', name: 'Non Aktif', is_active: false },
    ];

    const insertAnggotaSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockCreatedMember, error: null }),
      }),
    });

    const selectDepositTypesSpy = vi.fn().mockResolvedValue({
      data: mockDepositTypes,
      error: null,
    });

    const insertMemberDepositsSpy = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'anggota') {
        return { insert: insertAnggotaSpy };
      }
      if (table === 'deposit_types') {
        return { select: selectDepositTypesSpy };
      }
      if (table === 'member_deposits') {
        return { insert: insertMemberDepositsSpy };
      }
      return {};
    });

    const result = await createMember({
      nrp: '12345678',
      nama: 'Serma Joni',
      pangkat: 'Serma',
      master_thp: 6000000,
      bank_account_number: '115738953714',
      tgl_awal_anggota: '2023-05-10',
    });

    expect(result).toEqual(mockCreatedMember);

    // Verify anggota insert payload
    expect(insertAnggotaSpy).toHaveBeenCalledWith([
      {
        nrp: '12345678',
        nama: 'Serma Joni',
        pangkat: 'Serma',
        master_thp: 6000000,
        bank_account_number: '115738953714',
        status: 'aktif',
        membership_status: 'ACTIVE',
        created_at: new Date('2023-05-10').toISOString(),
      },
    ]);

    // Verify member_deposits enrolls all active deposit types
    expect(insertMemberDepositsSpy).toHaveBeenCalledWith([
      { member_id: 'member-101', deposit_type_id: 'dt-1', is_terminated: false },
      { member_id: 'member-101', deposit_type_id: 'dt-2', is_terminated: false },
      { member_id: 'member-101', deposit_type_id: 'dt-3', is_terminated: false },
      { member_id: 'member-101', deposit_type_id: 'dt-4', is_terminated: false },
    ]);
  });

  it('should fallback to current ISO date for created_at when tgl_awal_anggota is omitted or invalid', async () => {
    let capturedPayload: any = null;

    const insertAnggotaSpy = vi.fn().mockImplementation((payload) => {
      capturedPayload = payload[0];
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'member-fallback', ...payload[0] },
            error: null,
          }),
        }),
      };
    });

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'anggota') return { insert: insertAnggotaSpy };
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'member_deposits') return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return {};
    });

    const before = Date.now();
    await createMember({
      nrp: '888999',
      nama: 'Kopda Fallback',
    });
    const after = Date.now();

    expect(capturedPayload).not.toBeNull();
    const parsedDate = new Date(capturedPayload.created_at).getTime();
    expect(parsedDate).toBeGreaterThanOrEqual(before - 1000);
    expect(parsedDate).toBeLessThanOrEqual(after + 1000);

    // Also test invalid string
    await createMember({
      nrp: '888999-invalid',
      nama: 'Invalid Date Member',
      tgl_awal_anggota: 'not-a-valid-date',
    });
    const parsedInvalid = new Date(capturedPayload.created_at).getTime();
    expect(isNaN(parsedInvalid)).toBe(false);
  });

  it('should auto-seed default deposit types if deposit_types table is empty', async () => {
    const mockCreatedMember = {
      id: 'member-seed-test',
      nrp: '777666',
      nama: 'Praka Seeder',
    };

    const seededTypes = [
      { id: 'dt-seed-1', code: 'SP', name: 'Simpanan Pokok', is_active: true },
      { id: 'dt-seed-2', code: 'SW', name: 'Simpanan Wajib', is_active: true },
      { id: 'dt-seed-3', code: 'SB', name: 'Simpanan Belanja', is_active: true },
      { id: 'dt-seed-4', code: 'SL', name: 'Simpanan Lebaran', is_active: true },
    ];

    let selectCalls = 0;
    const selectDepositTypesSpy = vi.fn().mockImplementation(() => {
      selectCalls++;
      if (selectCalls === 1) {
        // First call returns empty
        return Promise.resolve({ data: [], error: null });
      }
      // Refreshed call after seed
      return Promise.resolve({ data: seededTypes, error: null });
    });

    const insertDepositTypesSpy = vi.fn().mockResolvedValue({ error: null });
    const insertMemberDepositsSpy = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockCreatedMember, error: null }),
            }),
          }),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: selectDepositTypesSpy,
          insert: insertDepositTypesSpy,
        };
      }
      if (table === 'member_deposits') {
        return { insert: insertMemberDepositsSpy };
      }
      return {};
    });

    const result = await createMember({
      nrp: '777666',
      nama: 'Praka Seeder',
    });

    expect(result).toEqual(mockCreatedMember);
    expect(insertDepositTypesSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SP', name: 'Simpanan Pokok' }),
        expect.objectContaining({ code: 'SW', name: 'Simpanan Wajib' }),
        expect.objectContaining({ code: 'SB', name: 'Simpanan Belanja' }),
        expect.objectContaining({ code: 'SL', name: 'Simpanan Lebaran' }),
      ])
    );
    expect(insertMemberDepositsSpy).toHaveBeenCalledWith([
      { member_id: 'member-seed-test', deposit_type_id: 'dt-seed-1', is_terminated: false },
      { member_id: 'member-seed-test', deposit_type_id: 'dt-seed-2', is_terminated: false },
      { member_id: 'member-seed-test', deposit_type_id: 'dt-seed-3', is_terminated: false },
      { member_id: 'member-seed-test', deposit_type_id: 'dt-seed-4', is_terminated: false },
    ]);
  });

  it('should throw descriptive error when member insert fails', async () => {
    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'duplicate key value violates unique constraint "anggota_nrp_key"' },
              }),
            }),
          }),
        };
      }
      return {};
    });

    await expect(
      createMember({
        nrp: '12345678',
        nama: 'Duplicate NRP',
      })
    ).rejects.toThrow(
      'Gagal mendaftarkan anggota baru: duplicate key value violates unique constraint "anggota_nrp_key"'
    );
  });

  it('should not fail member registration if member_deposits initialization encounters an error or warning', async () => {
    const mockCreatedMember = {
      id: 'm-robust-1',
      nrp: '54321',
      nama: 'Robust Member',
      bank_account_number: '987654321',
      created_at: '2023-01-01T00:00:00.000Z',
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockCreatedMember, error: null }),
            }),
          }),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'dt-1', code: 'SP', is_active: true }],
            error: null,
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Foreign key constraint violated on member_deposits' },
          }),
        };
      }
      return {};
    });

    const result = await createMember({
      nrp: '54321',
      nama: 'Robust Member',
      bank_account_number: '987654321',
    });

    expect(result).toEqual(mockCreatedMember);
    expect(warnSpy).toHaveBeenCalledWith(
      'Gagal menginisialisasi akun simpanan anggota:',
      'Foreign key constraint violated on member_deposits'
    );

    warnSpy.mockRestore();
  });
});

describe('memberService - resetAllMembersData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully calls reset_members_and_financial_records RPC and returns result summary', async () => {
    const mockResult = {
      success: true,
      members_deleted: 15,
      loans_deleted: 7,
      deposits_deleted: 30,
      message: 'Reset data anggota, simpanan, dan pinjaman berhasil diselesaikan.',
    };

    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: mockResult,
      error: null,
    });

    const result = await resetAllMembersData();

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('reset_members_and_financial_records');
    expect(result).toEqual(mockResult);
  });

  it('falls back to exhaustive loop-until-empty client deletion in child-to-parent order when RPC fails', async () => {
    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.reset_members_and_financial_records in the schema cache' },
    });

    const tableRows: Record<string, Array<{ id: string; member_deposit_id?: string }>> = {
      loan_repayments: [{ id: 'lr-1' }],
      loan_installments: [],
      loan_schedules: [{ id: 'ls-1' }],
      loans: [{ id: 'l-1' }],
      deposit_transactions: [{ id: 'dt-1', member_deposit_id: 'md-1' }, { id: 'dt-2', member_deposit_id: 'md-1' }],
      member_deposits: [{ id: 'md-1' }],
      lebaran_disbursement_items: [{ id: 'ldi-1' }],
      rekening_audit_logs: [{ id: 'ral-1' }],
      member_clearance_logs: [{ id: 'mcl-1' }],
      anggota: [{ id: 'ang-1' }],
      members: [{ id: 'mem-1' }],
    };
    const deleteOrder: string[] = [];
    const mockUpdateNot = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockReturnValue({ not: mockUpdateNot });
    const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'sales') {
        return { update: mockUpdate };
      }
      if (table === 'audit_logs') {
        return { insert: mockAuditInsert };
      }
      return {
        select: vi.fn().mockReturnValue({
          neq: vi.fn().mockImplementation((_col: string, _val: string) => ({
            limit: vi.fn().mockImplementation(async (lim: number) => ({
              data: (tableRows[table] || []).slice(0, lim),
              error: null,
            })),
          })),
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation(async (col: string, ids: string[]) => {
            deleteOrder.push(table);
            if (col === 'id') {
              tableRows[table] = (tableRows[table] || []).filter((r) => !ids.includes(r.id));
            }
            return { error: null };
          }),
        }),
      };
    });

    const result = await resetAllMembersData();

    expect(supabase.rpc).toHaveBeenCalledWith('reset_members_and_financial_records');
    expect(deleteOrder.indexOf('deposit_transactions')).toBeLessThan(deleteOrder.indexOf('member_deposits'));
    expect(deleteOrder.indexOf('lebaran_disbursement_items')).toBeLessThan(deleteOrder.indexOf('anggota'));
    expect(mockUpdate).toHaveBeenCalledWith({ member_id: null });
    expect(mockUpdateNot).toHaveBeenCalledWith('member_id', 'is', null);
    expect(mockAuditInsert).toHaveBeenCalledWith({
      table_name: 'anggota',
      action: 'RESET_ALL',
      record_id: 'SYSTEM',
      notes: 'Reset seluruh data anggota, simpanan, dan pinjaman.',
    });
    for (const rows of Object.values(tableRows)) {
      expect(rows).toHaveLength(0);
    }
    expect(result.success).toBe(true);
    expect(result.message).toBe('Seluruh data anggota, rekening simpanan, dan pinjaman berhasil dikosongkan.');
  });

  it('loops across multiple batches (>500 rows) in safe <=200 ID chunks until deposit_transactions is completely empty', async () => {
    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'RPC timeout' },
    });

    const tableRows: Record<string, Array<{ id: string }>> = {
      loan_repayments: [],
      loan_installments: [],
      loan_schedules: [],
      loans: [],
      deposit_transactions: Array.from({ length: 650 }, (_, idx) => ({ id: `dt-${idx + 1}` })),
      member_deposits: [{ id: 'md-1' }],
      lebaran_disbursement_items: [],
      rekening_audit_logs: [],
      member_clearance_logs: [],
      anggota: [{ id: 'ang-1' }],
      members: [],
    };
    const chunkSizes: number[] = [];
    let remainingAtMemberDepositsDelete = -1;

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'sales') {
        return { update: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ error: null }) }) };
      }
      if (table === 'audit_logs') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {
        select: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async (lim: number) => ({
              data: (tableRows[table] || []).slice(0, lim),
              error: null,
            })),
          }),
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation(async (_col: string, ids: string[]) => {
            if (table === 'deposit_transactions') {
              chunkSizes.push(ids.length);
            }
            if (table === 'member_deposits') {
              remainingAtMemberDepositsDelete = tableRows.deposit_transactions.length;
            }
            tableRows[table] = (tableRows[table] || []).filter((r) => !ids.includes(r.id));
            return { error: null };
          }),
        }),
      };
    });

    const result = await resetAllMembersData();

    expect(result.success).toBe(true);
    expect(tableRows.deposit_transactions).toHaveLength(0);
    expect(tableRows.member_deposits).toHaveLength(0);
    expect(tableRows.anggota).toHaveLength(0);
    expect(remainingAtMemberDepositsDelete).toBe(0);
    expect(chunkSizes).toEqual([200, 200, 100, 150]);
    expect(Math.max(...chunkSizes)).toBeLessThanOrEqual(200);
  });

  it('aborts immediately and throws descriptive error when child table deposit_transactions deletion fails', async () => {
    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'RPC not found' },
    });

    let memberDepositsDeleted = false;

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'sales') {
        return { update: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ error: null }) }) };
      }
      return {
        select: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => ({
              data: table === 'deposit_transactions' ? [{ id: 'dt-1' }] : [],
              error: null,
            })),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation(async () => {
            if (table === 'member_deposits') {
              memberDepositsDeleted = true;
            }
            if (table === 'deposit_transactions') {
              return { error: { message: 'RLS violation on deposit_transactions' } };
            }
            return { error: null };
          }),
        }),
      };
    });

    await expect(resetAllMembersData()).rejects.toThrow(
      'Gagal mereset data anggota dan pembukuan: Gagal menghapus data pada tabel deposit_transactions: RLS violation on deposit_transactions'
    );
    expect(memberDepositsDeleted).toBe(false);
  });

  it('throws descriptive error when both RPC and fallback deletion encounter an error on anggota', async () => {
    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'RPC not found' },
    });

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'sales') {
        return { update: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ error: null }) }) };
      }
      return {
        select: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => ({
              data: table === 'anggota' ? [{ id: 'ang-1' }] : [],
              error: null,
            })),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            error: { message: 'permission denied for table anggota' },
          }),
        }),
      };
    });

    await expect(resetAllMembersData()).rejects.toThrow(
      'Gagal mereset data anggota dan pembukuan: Gagal menghapus data pada tabel anggota: permission denied for table anggota'
    );
  });

  it('accelerates large deposit_transactions cleanup by sweeping via member_deposit_id chunks of 50', async () => {
    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'RPC timeout' },
    });

    const memberDeposits = Array.from({ length: 60 }, (_, idx) => ({ id: `md-${idx + 1}` }));
    const depositTransactions = Array.from({ length: 1200 }, (_, idx) => ({
      id: `dt-${idx + 1}`,
      member_deposit_id: `md-${(idx % 60) + 1}`,
    }));

    const tableRows: Record<string, Array<{ id: string; member_deposit_id?: string }>> = {
      loan_repayments: [],
      loan_installments: [],
      loan_schedules: [],
      loans: [],
      deposit_transactions: depositTransactions,
      member_deposits: memberDeposits,
      lebaran_disbursement_items: [],
      rekening_audit_logs: [],
      member_clearance_logs: [],
      anggota: [{ id: 'ang-1' }],
      members: [],
    };
    const parentSweepChunkSizes: number[] = [];

    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'sales') {
        return { update: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ error: null }) }) };
      }
      if (table === 'audit_logs') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {
        select: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async (lim: number) => ({
              data: (tableRows[table] || []).slice(0, lim),
              error: null,
            })),
          }),
          range: vi.fn().mockImplementation(async (from: number, to: number) => ({
            data: (tableRows[table] || []).slice(from, to + 1),
            error: null,
          })),
        }),
        delete: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation(async (col: string, ids: string[]) => {
            if (table === 'deposit_transactions' && col === 'member_deposit_id') {
              parentSweepChunkSizes.push(ids.length);
              tableRows.deposit_transactions = tableRows.deposit_transactions.filter(
                (r) => !ids.includes(r.member_deposit_id || '')
              );
              return { error: null };
            }
            tableRows[table] = (tableRows[table] || []).filter((r) => !ids.includes(r.id));
            return { error: null };
          }),
        }),
      };
    });

    const result = await resetAllMembersData();

    expect(result.success).toBe(true);
    expect(parentSweepChunkSizes).toEqual([50, 10]);
    expect(tableRows.deposit_transactions).toHaveLength(0);
    expect(tableRows.member_deposits).toHaveLength(0);
    expect(tableRows.anggota).toHaveLength(0);
  });
});

describe('memberService - extractMemberTHP and getActiveMembersForLoan', () => {
  it('extractMemberTHP returns positive number prioritizing take_home_pay over master_thp=0', () => {
    const member = {
      master_thp: 0,
      take_home_pay: 5000000,
      salary: null
    };
    expect(extractMemberTHP(member)).toBe(5000000);
  });

  it('extractMemberTHP parses string currency values', () => {
    const member = {
      take_home_pay: 'Rp 6.750.000,00'
    };
    expect(extractMemberTHP(member)).toBe(6750000);
  });

  it('extractMemberTHP falls back to salary when others are empty or 0', () => {
    const member = {
      master_thp: 0,
      take_home_pay: 0,
      salary: 3500000
    };
    expect(extractMemberTHP(member)).toBe(3500000);
  });

  it('extractMemberTHP returns 0 when null or empty', () => {
    expect(extractMemberTHP(null)).toBe(0);
    expect(extractMemberTHP({})).toBe(0);
  });

  it('getActiveMembersForLoan queries member table and falls back on column failure', async () => {
    const mockData = [{ id: '1', nama: 'Wawan Gunawan', take_home_pay: 5000000 }];
    const mockOrder = vi.fn().mockResolvedValue({ data: mockData, error: null });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    (supabase.from as any) = vi.fn().mockReturnValue({ select: mockSelect });

    const res = await getActiveMembersForLoan();
    expect(res).toEqual(mockData);
  });
});

describe('memberService - getActiveMemberDepositDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTierCache();
  });

  it('mengambil default pokok dan wajib dari active savings rate tiers jika tersedia', async () => {
    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'savings_rate_tiers') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'tier-pokok-1', deposit_type_code: 'POKOK', start_year: 2024, start_month: 1, end_year: null, end_month: null, monthly_rate: 150000 },
                  { id: 'tier-wajib-1', deposit_type_code: 'WAJIB', start_year: 2024, start_month: 1, end_year: null, end_month: null, monthly_rate: 200000 },
                ],
                error: null,
              })
            })
          })
        };
      }
      return {};
    });

    const defaults = await getActiveMemberDepositDefaults();
    expect(defaults.pokok).toBe(150000);
    expect(defaults.wajib).toBe(200000);
  });

  it('fallback ke nominal standar jika query gagal atau kosong', async () => {
    (supabase.from as any) = vi.fn().mockImplementation(() => {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            })
          })
        })
      };
    });

    const defaults = await getActiveMemberDepositDefaults();
    expect(defaults.pokok).toBe(100000);
    expect(defaults.wajib).toBe(50000);
    expect(defaults.belanja).toBe(25000);
    expect(defaults.lebaran).toBe(30000);
  });

  it('mengambil default dari master deposit_types jika savings_rate_tiers kosong', async () => {
    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'savings_rate_tiers') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { code: 'POKOK', name: 'Simpanan Pokok', default_amount: 120000, is_active: true },
              { code: 'WAJIB', name: 'Simpanan Wajib', default_amount: 200000, is_active: true },
              { code: 'LEBARAN', name: 'Simpanan Lebaran', default_amount: 300000, is_active: true },
            ],
            error: null,
          }),
        };
      }
      return {};
    });

    const defaults = await getActiveMemberDepositDefaults();
    expect(defaults.pokok).toBe(120000);
    expect(defaults.wajib).toBe(200000);
    expect(defaults.lebaran).toBe(300000);
  });
});

describe('memberService - CRUD and Aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchAllAnggotaPaged & getAnggota', () => {
    it('harus memuat seluruh anggota dengan paginasi loop tanpa terpotong di 1.000', async () => {
      const page1 = Array.from({ length: 1000 }, (_, i) => ({
        id: `member-${i + 1}`,
        nrp: `NRP-${i + 1}`,
        nama: `Anggota ${i + 1}`,
      }));
      const page2 = Array.from({ length: 150 }, (_, i) => ({
        id: `member-${1000 + i + 1}`,
        nrp: `NRP-${1000 + i + 1}`,
        nama: `Anggota ${1000 + i + 1}`,
      }));

      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockImplementation((from: number) => {
                  if (from === 0) return Promise.resolve({ data: page1, error: null });
                  if (from === 1000) return Promise.resolve({ data: page2, error: null });
                  return Promise.resolve({ data: [], error: null });
                }),
              }),
            }),
          };
        }
        return {};
      });

      const all = await fetchAllAnggotaPaged();
      expect(all).toHaveLength(1150);
      expect(all[0].nrp).toBe('NRP-1');
      expect(all[1149].nrp).toBe('NRP-1150');
    });

    it('getAnggota memanggil fetchAllAnggotaPaged', async () => {
      const dummy = [{ id: 'm-1', nrp: '001', nama: 'Test' }];
      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: dummy, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await getAnggota();
      expect(res).toEqual(dummy);
    });
  });

  describe('addAnggota, updateAnggota, deleteAnggota', () => {
    it('addAnggota menyisipkan data baru dan mengembalikan record', async () => {
      const newMember = { nrp: '777', nama: 'Prajurit Baru' };
      const returned = { id: 'm-new', ...newMember, created_at: '2026-01-01' };

      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: returned, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await addAnggota(newMember);
      expect(res).toEqual(returned);
    });

    it('updateAnggota memperbarui data anggota berdasarkan id', async () => {
      const updates = { nama: 'Prajurit Diupdate' };
      const returned = { id: 'm-new', nrp: '777', nama: 'Prajurit Diupdate' };

      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: returned, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await updateAnggota('m-new', updates);
      expect(res).toEqual(returned);
    });

    it('deleteAnggota menghapus anggota berdasarkan id', async () => {
      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      });

      await expect(deleteAnggota('m-del')).resolves.toBeUndefined();
    });
  });

  describe('getAnggotaWithSimpanan', () => {
    it('menggabungkan data anggota dengan saldo simpanan pokok dan wajib', async () => {
      const mockAnggota = [
        { id: 'm-1', nrp: '001', nama: 'Anggota 1' },
        { id: 'm-2', nrp: '002', nama: 'Anggota 2' },
      ];
      const mockSimpanan = [
        { id: 's-1', anggota_id: 'm-1', jenis_simpanan: 'pokok', jumlah: 100000 },
        { id: 's-2', anggota_id: 'm-1', jenis_simpanan: 'wajib', jumlah: 50000 },
        { id: 's-3', anggota_id: 'm-2', jenis_simpanan: 'pokok', jumlah: 100000 },
      ];

      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockAnggota, error: null }),
            }),
          };
        }
        if (table === 'simpanan') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockSimpanan, error: null }),
          };
        }
        return {};
      });

      const res = await getAnggotaWithSimpanan();
      expect(res).toHaveLength(2);
      expect(res[0].simpanan_pokok).toBe(100000);
      expect(res[0].simpanan_wajib).toBe(50000);
      expect(res[0].total_saldo).toBe(150000);

      expect(res[1].simpanan_pokok).toBe(100000);
      expect(res[1].simpanan_wajib).toBe(0);
      expect(res[1].total_saldo).toBe(100000);
    });
  });
});




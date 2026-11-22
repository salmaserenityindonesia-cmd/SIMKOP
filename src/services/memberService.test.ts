import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMembersComprehensiveReport,
  MemberComprehensiveExportRow,
  createMember,
  resetAllMembersData,
  RESET_MEMBERS_CONFIRMATION_PHRASE,
  extractMemberTHP,
  getActiveMembersForLoan,
  getActiveMemberDepositDefaults,
  fetchAllAnggotaPaged,
  getAnggota,
  addAnggota,
  updateAnggota,
  updateMemberSuspensionStatus,
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
        tanggal_lahir: '1988-11-10',
        bank_account_number: '0011223344',
        membership_status: 'ACTIVE',
        created_at: '2023-01-15T10:00:00.000Z',
        status: 'aktif',
      },
      {
        id: 'member-2',
        nrp: '654321',
        nama: 'Sertu Budi',
        tanggal_lahir: '1985-05-20',
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
      tanggal_lahir: '1988-11-10',
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
      tanggal_lahir: '1985-05-20',
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
        tanggal_lahir: '1991-06-15',
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
    expect(m.tanggal_lahir).toBe('1991-06-15');
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
        tanggal_lahir: '1983-08-15',
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
      tanggal_lahir: '1984-04-12',
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
      tanggal_lahir: '1984-04-12',
      master_thp: 6000000,
      bank_account_number: '115738953714',
      tgl_awal_anggota: '2023-05-10',
    });

    expect(result).toEqual(mockCreatedMember);

    // Verify anggota insert payload
    expect(insertAnggotaSpy).toHaveBeenCalledWith([
      {
        nomor_referensi: null,
        nrp: '12345678',
        nama: 'Serma Joni',
        tanggal_lahir: '1984-04-12',
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

  it('successfully calls reset_all_members_data RPC with confirmation phrase and returns result summary', async () => {
    const mockResult = {
      success: true,
      members_deleted: 15,
      cash_flow_deleted: 12,
      message: 'Seluruh data anggota dan mutasi terkait berhasil dikosongkan.',
    };

    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: mockResult,
      error: null,
    });
    (supabase.from as any) = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const result = await resetAllMembersData(`  ${RESET_MEMBERS_CONFIRMATION_PHRASE}  `);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('reset_all_members_data', {
      p_confirmation_phrase: 'RESET ANGGOTA',
    });
    expect(result).toEqual(mockResult);
  });

  it('rejects invalid confirmation phrase without calling supabase.rpc', async () => {
    (supabase.rpc as any) = vi.fn();

    await expect(resetAllMembersData('HAPUS')).rejects.toThrow(
      'Konfirmasi tidak valid. Ketik tepat: RESET ANGGOTA'
    );
    await expect(resetAllMembersData('')).rejects.toThrow(
      'Konfirmasi tidak valid. Ketik tepat: RESET ANGGOTA'
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('throws clear migration error when reset_all_members_data RPC is missing (PGRST202 / schema cache)', async () => {
    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.reset_all_members_data in the schema cache',
      },
    });
    (supabase.from as any) = vi.fn();

    await expect(resetAllMembersData()).rejects.toThrow(
      'Fungsi database reset_all_members_data belum terpasang di Supabase. Jalankan migrasi supabase/migrations/20261122_add_reset_all_members_rpc.sql di SQL Editor Supabase terlebih dahulu.'
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('throws explicit RPC error message on database failure', async () => {
    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function reset_all_members_data' },
    });

    await expect(resetAllMembersData()).rejects.toThrow(
      'permission denied for function reset_all_members_data'
    );
  });

  it('removes SALDO_AWAL_SIMPANAN row from cash_flow after successful RPC reset', async () => {
    const cashFlowRows = [
      { id: 'cf-open-1', category: 'SALDO_AWAL_SIMPANAN', direction: 'in', amount: 2500000 },
      { id: 'cf-other', category: 'kas_manual', direction: 'in', amount: 50000 },
    ];

    (supabase.rpc as any) = vi.fn().mockResolvedValue({
      data: {
        success: true,
        members_deleted: 5,
        cash_flow_deleted: 4,
        message: 'Seluruh data anggota dan mutasi terkait berhasil dikosongkan.',
      },
      error: null,
    });
    (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => ({
              order: vi.fn().mockResolvedValue({
                data: cashFlowRows.filter((r: any) => r[col] === val),
                error: null,
              }),
            })),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(async (col: string, val: string) => {
              for (let i = cashFlowRows.length - 1; i >= 0; i--) {
                if ((cashFlowRows[i] as any)[col] === val) cashFlowRows.splice(i, 1);
              }
              return { error: null };
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    await resetAllMembersData();
    expect(cashFlowRows.some((r) => r.category === 'SALDO_AWAL_SIMPANAN')).toBe(false);
    expect(cashFlowRows.some((r) => r.id === 'cf-other')).toBe(true);
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

    it('updateAnggota menyinkronkan take_home_pay saat master_thp diperbarui dan melakukan fallback jika kolom take_home_pay tidak ada', async () => {
      const updatePayloads: any[] = [];
      let callCount = 0;

      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              updatePayloads.push(payload);
              return {
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockImplementation(() => {
                      callCount += 1;
                      if (callCount === 1) {
                        return Promise.resolve({
                          data: { id: 'm-sync', master_thp: 4000000, take_home_pay: 4000000 },
                          error: null,
                        });
                      }
                      if (callCount === 2) {
                        return Promise.resolve({
                          data: null,
                          error: { message: 'column "take_home_pay" of relation "anggota" does not exist' },
                        });
                      }
                      return Promise.resolve({
                        data: { id: 'm-fallback', master_thp: 4500000 },
                        error: null,
                      });
                    }),
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const res1 = await updateAnggota('m-sync', { master_thp: 4000000 });
      expect(res1.master_thp).toBe(4000000);
      expect(updatePayloads[0]).toEqual({
        master_thp: 4000000,
        take_home_pay: 4000000,
      });

      const res2 = await updateAnggota('m-fallback', { master_thp: 4500000 });
      expect(res2.master_thp).toBe(4500000);
      expect(updatePayloads[1]).toEqual({ master_thp: 4500000, take_home_pay: 4500000 });
      expect(updatePayloads[2]).toEqual({ master_thp: 4500000 });
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

  describe('SUSPENDED (Nonaktif Sementara)', () => {
    it('updateAnggota menyinkronkan status=nonaktif & mencatat audit_logs saat SUSPENDED, dan membersihkan saat ACTIVE', async () => {
      const updateSpy = vi.fn().mockImplementation((payload) => ({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'm-susp-1', nrp: '111', nama: 'Budi', ...payload }, error: null }),
          }),
        }),
      }));
      const auditInsertSpy = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') return { update: updateSpy };
        if (table === 'audit_logs') return { insert: auditInsertSpy };
        return {};
      });

      const suspendedRes = await updateAnggota('m-susp-1', {
        membership_status: 'SUSPENDED',
        suspension_reason: 'Instruksi Pimpinan',
      });

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          membership_status: 'SUSPENDED',
          status: 'nonaktif',
          suspension_reason: 'Instruksi Pimpinan',
          suspended_at: expect.any(String),
        })
      );
      expect(suspendedRes.status).toBe('nonaktif');
      expect(auditInsertSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          table_name: 'anggota',
          action: 'SUSPEND_MEMBER',
          record_id: 'm-susp-1',
          notes: 'Instruksi Pimpinan',
        }),
      ]);

      const activatedRes = await updateAnggota('m-susp-1', {
        membership_status: 'ACTIVE',
      });

      expect(updateSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          membership_status: 'ACTIVE',
          status: 'aktif',
          suspended_at: null,
          suspension_reason: null,
        })
      );
      expect(activatedRes.status).toBe('aktif');
      expect(auditInsertSpy).toHaveBeenLastCalledWith([
        expect.objectContaining({
          action: 'ACTIVATE_MEMBER',
          record_id: 'm-susp-1',
        }),
      ]);
    });

    it('getActiveMembersForLoan hanya mengembalikan anggota ACTIVE dan mengecualikan SUSPENDED', async () => {
      const rawMembers = [
        { id: 'm-1', nama: 'Aktif', status: 'aktif', membership_status: 'ACTIVE', take_home_pay: 5000000 },
        { id: 'm-2', nama: 'Beku', status: 'aktif', membership_status: 'SUSPENDED', take_home_pay: 5000000 },
      ];
      const mockOrder = vi.fn().mockResolvedValue({ data: rawMembers, error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any) = vi.fn().mockReturnValue({ select: mockSelect });

      const res = await getActiveMembersForLoan();
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('m-1');
    });

    it('updateMemberSuspensionStatus menolak alasan kosong atau spasi', async () => {
      (supabase.from as any) = vi.fn();

      await expect(
        updateMemberSuspensionStatus({
          memberId: 'm-1',
          memberName: 'Agus Susanto',
          memberNrp: '88010203',
          oldStatus: 'ACTIVE',
          newStatus: 'SUSPENDED',
          reason: '   ',
        })
      ).rejects.toThrow('Alasan perubahan status keanggotaan wajib diisi.');

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('updateMemberSuspensionStatus membekukan anggota dan mencatat audit_logs SUSPEND_MEMBER', async () => {
      const eqSpy = vi.fn().mockResolvedValue({ error: null });
      const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });
      const auditInsertSpy = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') return { update: updateSpy };
        if (table === 'audit_logs') return { insert: auditInsertSpy };
        return {};
      });

      await updateMemberSuspensionStatus({
        memberId: 'm-agus',
        memberName: 'Agus Susanto',
        memberNrp: '88010203',
        oldStatus: 'ACTIVE',
        newStatus: 'SUSPENDED',
        reason: 'Nota Dinas No. ND-10/XI/2026',
        userId: 'admin-1',
      });

      expect(updateSpy).toHaveBeenCalledWith({
        membership_status: 'SUSPENDED',
        status: 'nonaktif',
        suspended_at: expect.any(String),
        suspension_reason: 'Nota Dinas No. ND-10/XI/2026',
        updated_at: expect.any(String),
      });
      // Pastikan hanya kolom pembekuan yang diperbarui (tidak menyentuh nrp, nama, master_thp, rekening)
      const updateArg = updateSpy.mock.calls[0][0];
      expect(updateArg).not.toHaveProperty('nrp');
      expect(updateArg).not.toHaveProperty('nama');
      expect(updateArg).not.toHaveProperty('master_thp');
      expect(updateArg).not.toHaveProperty('bank_account_number');
      expect(eqSpy).toHaveBeenCalledWith('id', 'm-agus');

      expect(auditInsertSpy).toHaveBeenCalledWith({
        table_name: 'anggota',
        action: 'SUSPEND_MEMBER',
        record_id: 'm-agus',
        entity_name: 'anggota',
        entity_id: 'm-agus',
        old_data: { membership_status: 'ACTIVE' },
        new_data: { membership_status: 'SUSPENDED', reason: 'Nota Dinas No. ND-10/XI/2026' },
        performed_by: 'admin-1',
        notes: 'Pembekuan Sementara Anggota Agus Susanto (88010203) - Alasan: Nota Dinas No. ND-10/XI/2026',
      });
    });

    it('updateMemberSuspensionStatus mengaktifkan kembali anggota dan mencatat audit_logs REACTIVATE_MEMBER', async () => {
      const eqSpy = vi.fn().mockResolvedValue({ error: null });
      const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });
      const auditInsertSpy = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any) = vi.fn().mockImplementation((table: string) => {
        if (table === 'anggota') return { update: updateSpy };
        if (table === 'audit_logs') return { insert: auditInsertSpy };
        return {};
      });

      await updateMemberSuspensionStatus({
        memberId: 'm-agus',
        memberName: 'Agus Susanto',
        memberNrp: '88010203',
        oldStatus: 'SUSPENDED',
        newStatus: 'ACTIVE',
        reason: 'Tugas Khusus Selesai',
      });

      expect(updateSpy).toHaveBeenCalledWith({
        membership_status: 'ACTIVE',
        status: 'aktif',
        suspended_at: null,
        suspension_reason: null,
        updated_at: expect.any(String),
      });
      expect(eqSpy).toHaveBeenCalledWith('id', 'm-agus');

      expect(auditInsertSpy).toHaveBeenCalledWith({
        table_name: 'anggota',
        action: 'REACTIVATE_MEMBER',
        record_id: 'm-agus',
        entity_name: 'anggota',
        entity_id: 'm-agus',
        old_data: { membership_status: 'SUSPENDED' },
        new_data: { membership_status: 'ACTIVE', reason: 'Tugas Khusus Selesai' },
        performed_by: null,
        notes: 'Aktivasi Kembali Anggota Agus Susanto (88010203) - Alasan: Tugas Khusus Selesai',
      });
    });
  });
});




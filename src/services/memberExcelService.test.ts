import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { calculateExcelDatedifMonths, parseMemberUpload, executeMigration, MemberParseResult } from './memberExcelService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe('calculateExcelDatedifMonths (Excel DATEDIF "m")', () => {
  it('should return 10 months for 2025-12-08 to 2026-11-01 (day has not reached 8)', () => {
    const start = new Date('2025-12-08');
    const end = new Date('2026-11-01');
    expect(calculateExcelDatedifMonths(start, end)).toBe(10);
  });

  it('should return 11 months for 2025-12-08 to 2026-11-08 (day has reached 8)', () => {
    const start = new Date('2025-12-08');
    const end = new Date('2026-11-08');
    expect(calculateExcelDatedifMonths(start, end)).toBe(11);
  });

  it('should return 11 months for 2025-12-08 to 2026-11-20 (day past 8)', () => {
    const start = new Date('2025-12-08');
    const end = new Date('2026-11-20');
    expect(calculateExcelDatedifMonths(start, end)).toBe(11);
  });

  it('should support string date inputs', () => {
    expect(calculateExcelDatedifMonths('2025-12-08', '2026-11-01')).toBe(10);
  });

  it('should fallback to 1 month if start date is in the future or invalid', () => {
    expect(calculateExcelDatedifMonths('invalid-date', '2026-11-01')).toBe(1);
    expect(calculateExcelDatedifMonths('2027-01-01', '2026-11-01')).toBe(1);
  });

  it('should return 1 month when difference is 0 months', () => {
    expect(calculateExcelDatedifMonths('2026-11-01', '2026-11-05')).toBe(1);
  });
});

describe('memberExcelService - As-Is Pure Mapping', () => {
  async function createMockExcelFile(headers: string[], rows: any[][]): Promise<File> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Template Migrasi Anggota');

    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    return new File([blob], 'template_migrasi_anggota_v2.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  const standardHeaders = [
    'nrp',
    'nama',
    'pangkat',
    'bank_account_number',
    'membership_status',
    'tgl_awal_anggota',
    'jumlah_simpanan_pokok',
    'jumlah_simpanan_wajib',
    'jumlah_simpanan_belanja',
    'jumlah_simpanan_lebaran',
    'jumlah_pinjaman',
    'tgl_awal_pinjaman',
    'tenor',
    'sisa_pinjaman',
  ];

  it('should parse raw as-is data: preserving full amounts without division and raw tgl_awal_pinjaman', async () => {
    const dataRows = [
      // Joko Ramadhan: raw integer 10 in tgl_awal_pinjaman
      ['11111', 'Joko Ramadhan', 'Bripka', '111222', 'ACTIVE', '2023-01-01', 100000, 2000000, 0, 0, 10000000, 10, 20, 5000000],
      // Asep Saputra: raw string '33' in tgl_awal_pinjaman
      ['22222', 'Asep Saputra', 'Aiptu', '333444', 'ACTIVE', '2022-06-01', 100000, 6600000, 500000, 250000, 20000000, '33', 36, 8000000],
      // Putut Ardian: standard date
      ['33333', 'Putut Ardian', 'Briptu', '555666', 'ACTIVE', '2023-01-01', 100000, 1200000, 600000, 300000, 5000000, '2023-06-01', 12, 2000000],
    ];

    const file = await createMockExcelFile(standardHeaders, dataRows);
    const result = await parseMemberUpload(file);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);

    // Joko Ramadhan verification
    const joko = result.rows.find((r) => r.nama === 'Joko Ramadhan')!;
    expect(joko).toBeDefined();
    expect(joko.jumlah_simpanan_wajib).toBe(2000000);
    expect(joko.wajib_per_bulan).toBe(2000000); // Murni as-is tanpa pembagian
    expect(joko.n_bulan_simpanan).toBe(1);
    expect(joko.tgl_awal_pinjaman).toBe('10'); // Nilai murni Excel tidak null

    // Asep Saputra verification
    const asep = result.rows.find((r) => r.nama === 'Asep Saputra')!;
    expect(asep).toBeDefined();
    expect(asep.jumlah_simpanan_wajib).toBe(6600000);
    expect(asep.wajib_per_bulan).toBe(6600000); // Murni as-is tanpa pembagian
    expect(asep.n_bulan_simpanan).toBe(1);
    expect(asep.tgl_awal_pinjaman).toBe('33'); // Nilai murni Excel tidak null

    // Putut Ardian verification
    const putut = result.rows.find((r) => r.nama === 'Putut Ardian')!;
    expect(putut).toBeDefined();
    expect(putut.jumlah_simpanan_wajib).toBe(1200000);
    expect(putut.wajib_per_bulan).toBe(1200000);
    expect(putut.n_bulan_simpanan).toBe(1);
    expect(putut.tgl_awal_pinjaman).toBe('2023-06-01');
  });

  it('should guarantee n_bulan_simpanan is always 1 and wajib_per_bulan matches jumlah_simpanan_wajib intact even with long tenure', async () => {
    const dataRows = [
      // Member joined in 2015 (11+ years ago) with large wajib balance
      ['99999', 'Veteran Anggota', 'AKP', '999888', 'ACTIVE', '2015-01-01', 500000, 24000000, 1200000, 3000000, 0, null, 0, 0],
    ];

    const file = await createMockExcelFile(standardHeaders, dataRows);
    const result = await parseMemberUpload(file);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);

    const veteran = result.rows[0];
    // Pastikan tidak ada pembagian dengan puluhan bulan tenure: saldo wajib utuh 24jt
    expect(veteran.jumlah_simpanan_wajib).toBe(24000000);
    expect(veteran.wajib_per_bulan).toBe(24000000);
    expect(veteran.jumlah_simpanan_belanja).toBe(1200000);
    expect(veteran.belanja_per_bulan).toBe(1200000);
    expect(veteran.jumlah_simpanan_lebaran).toBe(3000000);
    expect(veteran.lebaran_per_bulan).toBe(3000000);
    expect(veteran.n_bulan_simpanan).toBe(1); // Murni saldo awal 1 mutasi
  });

  it('should preserve non-date string or numeric loan date representations ("10", "33", 42) without cancelling to null', async () => {
    const dataRows = [
      ['44444', 'Samsul Arifin', 'Bripka', '444111', 'ACTIVE', '2023-01-01', 100000, 1000000, 0, 0, 5000000, 42, 10, 2000000],
      ['55555', 'Budi Santoso', 'Bripda', '555222', 'ACTIVE', '2023-01-01', 100000, 1000000, 0, 0, 5000000, ' 15 ', 10, 2000000],
      ['66666', 'Candra Wijaya', 'Briptu', '666333', 'ACTIVE', '2023-01-01', 100000, 1000000, 0, 0, 5000000, '', 10, 2000000],
    ];

    const file = await createMockExcelFile(standardHeaders, dataRows);
    const result = await parseMemberUpload(file);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);

    // Number 42 converted to string '42'
    expect(result.rows[0].tgl_awal_pinjaman).toBe('42');
    // Trimmed string ' 15 ' preserved as '15'
    expect(result.rows[1].tgl_awal_pinjaman).toBe('15');
    // Empty string converted to null
    expect(result.rows[2].tgl_awal_pinjaman).toBeNull();
  });

  describe('executeMigration', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should insert single migration transaction for routine deposits and safely handle non-date loan tgl', async () => {
      const insertedTxMap: any[] = [];
      const insertedLoanMap: any[] = [];

      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-pokok', name: 'Simpanan Pokok' },
                { id: 'dt-wajib', name: 'Simpanan Wajib' },
                { id: 'dt-belanja', name: 'Simpanan Belanja' },
                { id: 'dt-lebaran', name: 'Simpanan Hari Raya / Lebaran' },
              ],
              error: null,
            }),
          };
        }
        if (table === 'loan_types') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'lt-default', name: 'Pinjaman Reguler' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'anggota') {
          return {
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'member-joko-id' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'md-wajib-id' }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              insertedTxMap.push(...(Array.isArray(payload) ? payload : [payload]));
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'loans') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              insertedLoanMap.push(payload);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'loan-123' }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'sch-1', paid_amount: 1000000, due_date: '2026-11-01' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      });

      const parseResult: MemberParseResult = {
        rows: [
          {
            nrp: '11111',
            nama: 'Joko Ramadhan',
            pangkat: 'Bripka',
            bank_account_number: '111222',
            membership_status: 'ACTIVE',
            tgl_awal_anggota: '2023-01-01',
            jumlah_simpanan_pokok: 0,
            jumlah_simpanan_wajib: 2000000,
            jumlah_simpanan_belanja: 0,
            jumlah_simpanan_lebaran: 0,
            jumlah_pinjaman: 10000000,
            tgl_awal_pinjaman: '10',
            tenor: 20,
            sisa_pinjaman: 5000000,
            n_bulan_simpanan: 1,
            wajib_per_bulan: 2000000,
            belanja_per_bulan: 0,
            lebaran_per_bulan: 0,
            n_bulan_pinjaman: 1,
            sudah_diangsur: 5000000,
            angsuran_lampau_per_bulan: 5000000,
          },
        ],
        errors: [],
      };

      await executeMigration(parseResult);

      // Verify transaction inserted as a single lump sum mutation
      expect(insertedTxMap).toHaveLength(1);
      expect(insertedTxMap[0]).toMatchObject({
        member_deposit_id: 'md-wajib-id',
        amount: 2000000,
        transaction_type: 'deposit',
        description: 'Migrasi Saldo Awal (As-Is)',
      });

      // Verify loan creation safely handles raw '10' without crash
      expect(insertedLoanMap).toHaveLength(1);
      expect(insertedLoanMap[0].principal_amount).toBe(10000000);
      expect(insertedLoanMap[0].notes).toContain('10');
      // disbursed_at should be a valid ISO timestamp
      expect(new Date(insertedLoanMap[0].disbursed_at).getTime()).not.toBeNaN();
    });

    it('should create individual migration transactions for all positive deposit types and format standard loan notes', async () => {
      const insertedTxMap: any[] = [];
      const insertedLoanMap: any[] = [];

      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-pokok', name: 'Simpanan Pokok' },
                { id: 'dt-wajib', name: 'Simpanan Wajib' },
                { id: 'dt-belanja', name: 'Simpanan Belanja' },
                { id: 'dt-lebaran', name: 'Simpanan Hari Raya / Lebaran' },
              ],
              error: null,
            }),
          };
        }
        if (table === 'loan_types') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'lt-default', name: 'Pinjaman Reguler' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'anggota') {
          return {
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'member-complete-id' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col, val) => ({
                eq: vi.fn().mockImplementation((col2, val2) => ({
                  single: vi.fn().mockResolvedValue({ data: { id: `md-${val2}` }, error: null }),
                })),
              })),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              insertedTxMap.push(...(Array.isArray(payload) ? payload : [payload]));
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'loans') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              insertedLoanMap.push(payload);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'loan-standard-id' }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'sch-1', paid_amount: 500000, due_date: '2023-07-01' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      });

      const parseResult: MemberParseResult = {
        rows: [
          {
            nrp: '77777',
            nama: 'Agus Salim',
            pangkat: 'Ipda',
            bank_account_number: '777888',
            membership_status: 'ACTIVE',
            tgl_awal_anggota: '2022-01-01',
            jumlah_simpanan_pokok: 100000,
            jumlah_simpanan_wajib: 5000000,
            jumlah_simpanan_belanja: 1500000,
            jumlah_simpanan_lebaran: 800000,
            jumlah_pinjaman: 12000000,
            tgl_awal_pinjaman: '2023-01-15',
            tenor: 24,
            sisa_pinjaman: 6000000,
            n_bulan_simpanan: 1,
            wajib_per_bulan: 5000000,
            belanja_per_bulan: 1500000,
            lebaran_per_bulan: 800000,
            n_bulan_pinjaman: 1,
            sudah_diangsur: 6000000,
            angsuran_lampau_per_bulan: 6000000,
          },
        ],
        errors: [],
      };

      await executeMigration(parseResult);

      // Verify all 4 deposits are recorded as single lump sum transactions
      expect(insertedTxMap).toHaveLength(4);
      expect(insertedTxMap.find((tx) => tx.member_deposit_id === 'md-dt-pokok')?.amount).toBe(100000);
      expect(insertedTxMap.find((tx) => tx.member_deposit_id === 'md-dt-wajib')?.amount).toBe(5000000);
      expect(insertedTxMap.find((tx) => tx.member_deposit_id === 'md-dt-belanja')?.amount).toBe(1500000);
      expect(insertedTxMap.find((tx) => tx.member_deposit_id === 'md-dt-lebaran')?.amount).toBe(800000);

      // Verify loan notes for valid date format
      expect(insertedLoanMap).toHaveLength(1);
      expect(insertedLoanMap[0].notes).toBe('Migrasi Histori Pinjaman');
    });
  });
});



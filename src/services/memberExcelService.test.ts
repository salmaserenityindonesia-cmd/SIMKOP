import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { calculateExcelDatedifMonths, parseMemberUpload, executeMigration, MemberParseResult, parseAmount, parseNumber } from './memberExcelService';
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

describe('parseAmount & parseNumber', () => {
  it('should handle pure numbers correctly', () => {
    expect(parseAmount(1000000)).toBe(1000000);
    expect(parseAmount(0)).toBe(0);
    expect(parseAmount(-500)).toBe(0); // non-negative
    expect(parseAmount(NaN)).toBe(0);
  });

  it('should handle Indonesian thousand dot format', () => {
    expect(parseAmount('2.000.000')).toBe(2000000);
    expect(parseAmount('50.000')).toBe(50000);
    expect(parseAmount('Rp 2.000.000')).toBe(2000000);
    expect(parseAmount('Rp. 50.000')).toBe(50000);
  });

  it('should handle Indonesian decimal comma and combined format', () => {
    expect(parseAmount('2.000.000,00')).toBe(2000000);
    expect(parseAmount('50000,50')).toBe(50000.5);
    expect(parseAmount('Rp 1.500.000,75')).toBe(1500000.75);
  });

  it('should handle US thousand comma format', () => {
    expect(parseAmount('2,000,000')).toBe(2000000);
    expect(parseAmount('1,500,000.00')).toBe(1500000);
  });

  it('should handle null, undefined, empty, and non-numeric strings', () => {
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('   ')).toBe(0);
    expect(parseAmount('invalid')).toBe(0);
  });

  it('should handle varied inputs including pure numbers, dots, Rp prefix "Rp 6.600.000", commas, and empty/null/undefined/spaces', () => {
    // Pure numbers
    expect(parseAmount(2000000)).toBe(2000000);
    expect(parseAmount(6600000)).toBe(6600000);
    expect(parseAmount(0)).toBe(0);

    // String with Indonesian dot thousands
    expect(parseAmount('2.000.000')).toBe(2000000);
    expect(parseAmount('6.600.000')).toBe(6600000);

    // String with Rp prefix
    expect(parseAmount('Rp 6.600.000')).toBe(6600000);
    expect(parseAmount('Rp 2.000.000')).toBe(2000000);
    expect(parseAmount('Rp. 6.600.000')).toBe(6600000);

    // String with comma
    expect(parseAmount('6.600.000,00')).toBe(6600000);
    expect(parseAmount('2,000,000')).toBe(2000000);
    expect(parseAmount('50000,50')).toBe(50000.5);

    // Null, undefined, spaces, empty string
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('   ')).toBe(0);
  });

  it('parseNumber should behave identically to parseAmount', () => {
    expect(parseNumber('2.500.000')).toBe(2500000);
    expect(parseNumber(1200000)).toBe(1200000);
    expect(parseNumber('Rp 6.600.000')).toBe(6600000);
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

  it('should parse string formatted currency and tenor in excel cells gracefully', async () => {
    const dataRows = [
      ['88888', 'Bambang Format', 'Aipda', '888777', 'ACTIVE', '2023-01-01', 'Rp 100.000', '2.500.000', '1.000.000', '500.000', 'Rp 15.000.000', '2023-05-01', '24 bulan', '5.000.000'],
    ];

    const file = await createMockExcelFile(standardHeaders, dataRows);
    const result = await parseMemberUpload(file);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    expect(row.jumlah_simpanan_pokok).toBe(100000);
    expect(row.jumlah_simpanan_wajib).toBe(2500000);
    expect(row.wajib_per_bulan).toBe(2500000);
    expect(row.jumlah_simpanan_belanja).toBe(1000000);
    expect(row.jumlah_simpanan_lebaran).toBe(500000);
    expect(row.jumlah_pinjaman).toBe(15000000);
    expect(row.tenor).toBe(24);
    expect(row.sisa_pinjaman).toBe(5000000);
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
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                const sub: any = {
                  eq: vi.fn().mockImplementation((col2: string, val2: string) => ({
                    single: vi.fn().mockResolvedValue({ data: { id: 'md-wajib-id' }, error: null }),
                  })),
                  then: (resolve: any) => resolve({ data: [{ id: 'md-wajib-id' }], error: null }),
                };
                return sub;
              }),
            })),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedTxMap.push(...(Array.isArray(payload) ? payload : [payload]));
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
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
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
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
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
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
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                const sub: any = {
                  eq: vi.fn().mockImplementation((col2: string, val2: string) => ({
                    single: vi.fn().mockResolvedValue({ data: { id: `md-${val2}` }, error: null }),
                  })),
                  then: (resolve: any) => resolve({ data: [{ id: 'md-dt-pokok' }, { id: 'md-dt-wajib' }, { id: 'md-dt-belanja' }, { id: 'md-dt-lebaran' }], error: null }),
                };
                return sub;
              }),
            })),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedTxMap.push(...(Array.isArray(payload) ? payload : [payload]));
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
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
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
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
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
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
      expect(insertedLoanMap[0].notes).toBe('Migrasi Pinjaman Awal (Sisa: Rp 6000000)');
    });

    it('should execute idempotent overwrite: cleaning old migration transactions and loans before inserting new records', async () => {
      const deletedTxsFilter: any[] = [];
      const deletedLoansFilter: any[] = [];
      const deletedSchedsFilter: any[] = [];
      const deletedRepaysFilter: any[] = [];
      const newlyInsertedTxs: any[] = [];
      const newlyInsertedLoans: any[] = [];

      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-pokok', name: 'Simpanan Pokok' },
                { id: 'dt-wajib', name: 'Simpanan Wajib' },
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
                single: vi.fn().mockResolvedValue({ data: { id: 'member-reimport-id' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                const sub: any = {
                  eq: vi.fn().mockImplementation((col2: string, val2: string) => ({
                    single: vi.fn().mockResolvedValue({ data: { id: `md-${val2}` }, error: null }),
                  })),
                  // When queried for all existing deposits for member
                  then: (resolve: any) => resolve({
                    data: [{ id: 'md-pokok-old' }, { id: 'md-wajib-old' }],
                    error: null,
                  }),
                };
                return sub;
              }),
            })),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((field: string, values: any[]) => {
                deletedTxsFilter.push({ field, values });
                return {
                  in: vi.fn().mockImplementation((descField: string, descValues: any[]) => {
                    deletedTxsFilter.push({ field: descField, values: descValues });
                    return Promise.resolve({ error: null });
                  }),
                };
              }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              newlyInsertedTxs.push(...(Array.isArray(payload) ? payload : [payload]));
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'old-mig-loan-99',
                    loan_number: 'LOAN-MIG-12345',
                    notes: 'Migrasi Histori Pinjaman',
                    status: 'active',
                  },
                ],
                error: null,
              }),
            }),
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((field: string, values: any[]) => {
                deletedLoansFilter.push({ field, values });
                return Promise.resolve({ error: null });
              }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              newlyInsertedLoans.push(payload);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'loan-reimport-id' }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((field: string, values: any[]) => {
                deletedSchedsFilter.push({ field, values });
                return Promise.resolve({ error: null });
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'sch-new', paid_amount: 1000000, due_date: '2026-12-01' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((field: string, values: any[]) => {
                deletedRepaysFilter.push({ field, values });
                return Promise.resolve({ error: null });
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      });

      const reimportResult: MemberParseResult = {
        rows: [
          {
            nrp: '99999',
            nama: 'Re-import Member',
            pangkat: 'Bripka',
            bank_account_number: '999111',
            membership_status: 'ACTIVE',
            tgl_awal_anggota: '2023-01-01',
            jumlah_simpanan_pokok: 100000,
            jumlah_simpanan_wajib: 3500000, // Nilai baru revisi
            jumlah_simpanan_belanja: 0,
            jumlah_simpanan_lebaran: 0,
            jumlah_pinjaman: 8000000, // Nilai pinjaman baru
            tgl_awal_pinjaman: '2023-05-01',
            tenor: 10,
            sisa_pinjaman: 4000000,
            n_bulan_simpanan: 1,
            wajib_per_bulan: 3500000,
            belanja_per_bulan: 0,
            lebaran_per_bulan: 0,
            n_bulan_pinjaman: 1,
            sudah_diangsur: 4000000,
            angsuran_lampau_per_bulan: 4000000,
          },
        ],
        errors: [],
      };

      await executeMigration(reimportResult);

      // Verify that old migration transactions were cleared first
      expect(deletedTxsFilter).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'member_deposit_id',
            values: ['md-pokok-old', 'md-wajib-old'],
          }),
          expect.objectContaining({
            field: 'description',
            values: expect.arrayContaining([
              'Migrasi Saldo Awal (As-Is)',
              'Migrasi Saldo Awal',
              'One-Time Principal Deposit Migration',
              'Historical Balance Migration',
            ]),
          }),
        ])
      );

      // Verify that old migration loan, schedules, and repayments were cleared first
      expect(deletedRepaysFilter).toEqual([{ field: 'loan_id', values: ['old-mig-loan-99'] }]);
      expect(deletedSchedsFilter).toEqual([{ field: 'loan_id', values: ['old-mig-loan-99'] }]);
      expect(deletedLoansFilter).toEqual([{ field: 'id', values: ['old-mig-loan-99'] }]);

      // Verify new transactions inserted with pure revised excel amounts
      expect(newlyInsertedTxs).toHaveLength(2); // pokok & wajib
      expect(newlyInsertedTxs.find((tx) => tx.description === 'One-Time Principal Deposit Migration')?.amount).toBe(100000);
      expect(newlyInsertedTxs.find((tx) => tx.description === 'Migrasi Saldo Awal (As-Is)')?.amount).toBe(3500000);

      // Verify new loan was created with revised amount
      expect(newlyInsertedLoans).toHaveLength(1);
      expect(newlyInsertedLoans[0].principal_amount).toBe(8000000);
    });

    it('should guarantee chronological sequence where old deposit mutations and loans are deleted before any new records are inserted', async () => {
      const callTimeline: string[] = [];
      const deletedTxDescriptions: string[][] = [];
      const deletedTxDepositIds: string[][] = [];
      const deletedLoanIds: string[][] = [];

      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-pokok', name: 'Simpanan Pokok' },
                { id: 'dt-wajib', name: 'Simpanan Wajib' },
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
                single: vi.fn().mockResolvedValue({ data: { id: 'member-seq-check' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                const sub: any = {
                  eq: vi.fn().mockImplementation((col2: string, val2: string) => ({
                    single: vi.fn().mockResolvedValue({ data: { id: `md-${val2}-seq` }, error: null }),
                  })),
                  then: (resolve: any) => resolve({
                    data: [{ id: 'md-pokok-seq' }, { id: 'md-wajib-seq' }],
                    error: null,
                  }),
                };
                return sub;
              }),
            })),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockImplementation(() => {
              callTimeline.push('deposit_transactions.delete');
              return {
                in: vi.fn().mockImplementation((field: string, values: any[]) => {
                  if (field === 'member_deposit_id') deletedTxDepositIds.push(values);
                  return {
                    in: vi.fn().mockImplementation((descField: string, descValues: any[]) => {
                      if (descField === 'description') deletedTxDescriptions.push(descValues);
                      return Promise.resolve({ error: null });
                    }),
                  };
                }),
              };
            }),
            insert: vi.fn().mockImplementation(() => {
              callTimeline.push('deposit_transactions.insert');
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'old-loan-to-delete',
                    loan_number: 'LOAN-MIG-OLD',
                    notes: 'Migrasi Histori Pinjaman',
                    status: 'active',
                  },
                ],
                error: null,
              }),
            }),
            delete: vi.fn().mockImplementation(() => {
              callTimeline.push('loans.delete');
              return {
                in: vi.fn().mockImplementation((field: string, values: any[]) => {
                  if (field === 'id') deletedLoanIds.push(values);
                  return Promise.resolve({ error: null });
                }),
              };
            }),
            insert: vi.fn().mockImplementation(() => {
              callTimeline.push('loans.insert');
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'new-loan-id' }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            delete: vi.fn().mockImplementation(() => {
              callTimeline.push('loan_schedules.delete');
              return {
                in: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'sch-seq', paid_amount: 500000, due_date: '2026-12-01' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            delete: vi.fn().mockImplementation(() => {
              callTimeline.push('loan_repayments.delete');
              return {
                in: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
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
            nrp: '12345',
            nama: 'Sequence Test Member',
            pangkat: 'Brigadir',
            bank_account_number: '123999',
            membership_status: 'ACTIVE',
            tgl_awal_anggota: '2024-01-01',
            jumlah_simpanan_pokok: 100000,
            jumlah_simpanan_wajib: 2000000,
            jumlah_simpanan_belanja: 0,
            jumlah_simpanan_lebaran: 0,
            jumlah_pinjaman: 5000000,
            tgl_awal_pinjaman: '2024-02-01',
            tenor: 10,
            sisa_pinjaman: 2500000,
            n_bulan_simpanan: 1,
            wajib_per_bulan: 2000000,
            belanja_per_bulan: 0,
            lebaran_per_bulan: 0,
            n_bulan_pinjaman: 1,
            sudah_diangsur: 2500000,
            angsuran_lampau_per_bulan: 2500000,
          },
        ],
        errors: [],
      };

      await executeMigration(parseResult);

      // Verify deletion occurred BEFORE insertion
      const delTxIdx = callTimeline.indexOf('deposit_transactions.delete');
      const insTxIdx = callTimeline.indexOf('deposit_transactions.insert');
      expect(delTxIdx).toBeGreaterThanOrEqual(0);
      expect(insTxIdx).toBeGreaterThanOrEqual(0);
      expect(delTxIdx).toBeLessThan(insTxIdx);

      const delRepayIdx = callTimeline.indexOf('loan_repayments.delete');
      const delSchedIdx = callTimeline.indexOf('loan_schedules.delete');
      const delLoanIdx = callTimeline.indexOf('loans.delete');
      const insLoanIdx = callTimeline.indexOf('loans.insert');
      expect(delRepayIdx).toBeGreaterThanOrEqual(0);
      expect(delSchedIdx).toBeGreaterThanOrEqual(0);
      expect(delLoanIdx).toBeGreaterThanOrEqual(0);
      expect(insLoanIdx).toBeGreaterThanOrEqual(0);

      // Deletions happen in FK safety order: repayments -> schedules -> loans, then new loan insert
      expect(delRepayIdx).toBeLessThan(delSchedIdx);
      expect(delSchedIdx).toBeLessThan(delLoanIdx);
      expect(delLoanIdx).toBeLessThan(insLoanIdx);

      // Verify target filters for deletions
      expect(deletedTxDepositIds[0]).toEqual(['md-pokok-seq', 'md-wajib-seq']);
      expect(deletedTxDescriptions[0]).toEqual(
        expect.arrayContaining([
          'Saldo Awal Migrasi Sistem',
          'Migrasi Saldo Awal (As-Is)',
          'Migrasi Saldo Awal',
          'One-Time Principal Deposit Migration',
          'Historical Balance Migration',
        ])
      );
      expect(deletedLoanIds[0]).toEqual(['old-loan-to-delete']);
    });

    it('should call delQuery.or with comprehensive migration patterns when or method is supported by Supabase query builder (Exact Overwrite)', async () => {
      let orPatternCalled = '';
      let memberDepositIdPassed: any[] = [];
      const insertedTransactions: any[] = [];

      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-pokok-joko', name: 'Simpanan Pokok' },
                { id: 'dt-wajib-joko', name: 'Simpanan Wajib' },
                { id: 'dt-belanja-joko', name: 'Simpanan Belanja' },
                { id: 'dt-lebaran-joko', name: 'Simpanan Lebaran' },
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
                  data: [{ id: 'lt-default-joko', name: 'Pinjaman Reguler' }],
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
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                const sub: any = {
                  eq: vi.fn().mockImplementation((col2: string, val2: string) => ({
                    single: vi.fn().mockResolvedValue({ data: { id: `md-${val2}` }, error: null }),
                  })),
                  then: (resolve: any) => resolve({
                    data: [
                      { id: 'md-dt-pokok-joko' },
                      { id: 'md-dt-wajib-joko' },
                      { id: 'md-dt-belanja-joko' },
                      { id: 'md-dt-lebaran-joko' },
                    ],
                    error: null,
                  }),
                };
                return sub;
              }),
            })),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockImplementation(() => ({
              in: vi.fn().mockImplementation((col: string, values: any[]) => {
                if (col === 'member_deposit_id') {
                  memberDepositIdPassed = values;
                }
                return {
                  or: vi.fn().mockImplementation((pattern: string) => {
                    orPatternCalled = pattern;
                    return Promise.resolve({ error: null });
                  }),
                };
              }),
            })),
            insert: vi.fn().mockImplementation((records) => {
              insertedTransactions.push(...(Array.isArray(records) ? records : [records]));
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      });

      const parseResult: MemberParseResult = {
        rows: [
          {
            nrp: '19850101',
            nama: 'Joko Ramadhan',
            pangkat: 'Bripda',
            bank_account_number: '1985010199',
            membership_status: 'ACTIVE',
            tgl_awal_anggota: '2023-01-01',
            jumlah_simpanan_pokok: 10000,
            jumlah_simpanan_wajib: 2000000,
            jumlah_simpanan_belanja: 500000,
            jumlah_simpanan_lebaran: 300000,
            jumlah_pinjaman: 0,
            tgl_awal_pinjaman: '',
            tenor: 0,
            sisa_pinjaman: 0,
            n_bulan_simpanan: 1,
            wajib_per_bulan: 2000000,
            belanja_per_bulan: 500000,
            lebaran_per_bulan: 300000,
            n_bulan_pinjaman: 0,
            sudah_diangsur: 0,
            angsuran_lampau_per_bulan: 0,
          },
        ],
        errors: [],
      };

      await executeMigration(parseResult);

      // Verify that .or() was invoked with the complete ilike filter pattern
      expect(orPatternCalled).toBe(
        'description.ilike.%migrasi%,description.ilike.%saldo awal%,description.ilike.%migration%,description.ilike.%historical%'
      );
      expect(memberDepositIdPassed).toEqual([
        'md-dt-pokok-joko',
        'md-dt-wajib-joko',
        'md-dt-belanja-joko',
        'md-dt-lebaran-joko',
      ]);

      // Verify that exact single values are written without accumulation
      expect(insertedTransactions).toHaveLength(4);
      const pokokTx = insertedTransactions.find((tx) => tx.member_deposit_id === 'md-dt-pokok-joko');
      const wajibTx = insertedTransactions.find((tx) => tx.member_deposit_id === 'md-dt-wajib-joko');
      const belanjaTx = insertedTransactions.find((tx) => tx.member_deposit_id === 'md-dt-belanja-joko');
      const lebaranTx = insertedTransactions.find((tx) => tx.member_deposit_id === 'md-dt-lebaran-joko');

      expect(pokokTx?.amount).toBe(10000);
      expect(pokokTx?.description).toBe('One-Time Principal Deposit Migration');

      expect(wajibTx?.amount).toBe(2000000);
      expect(wajibTx?.description).toBe('Migrasi Saldo Awal (As-Is)');

      expect(belanjaTx?.amount).toBe(500000);
      expect(belanjaTx?.description).toBe('Migrasi Saldo Awal (As-Is)');

      expect(lebaranTx?.amount).toBe(300000);
      expect(lebaranTx?.description).toBe('Migrasi Saldo Awal (As-Is)');

      const totalNominal = [pokokTx, wajibTx, belanjaTx, lebaranTx].reduce((sum, tx) => sum + (tx?.amount || 0), 0);
      expect(totalNominal).toBe(2810000);
    });

    it('should send bank_account_number in member upsert, create loan with PINJ-MIGRASI-{nrp}, active status, and matching schedules and repayments', async () => {
      let upsertedMemberPayload: any = null;
      let insertedLoanPayload: any = null;
      let insertedSchedulesPayload: any[] = [];
      let insertedRepaymentsPayload: any[] = [];

      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-pokok', name: 'Simpanan Pokok' },
                { id: 'dt-wajib', name: 'Simpanan Wajib' },
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
                  data: [{ id: 'lt-pinj-reg', name: 'Pinjaman Reguler' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'anggota') {
          return {
            upsert: vi.fn().mockImplementation((payload) => {
              upsertedMemberPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'member-full-flow-id' }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: 'md-id' }, error: null }),
                then: (resolve: any) => resolve({ data: [], error: null }),
              })),
            })),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedLoanPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'new-migrated-loan-id' }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedSchedulesPayload = payload;
              // Return simulated inserted schedules with generated IDs
              const returnedData = payload.map((s: any, idx: number) => ({
                ...s,
                id: `schedule-uuid-${idx + 1}`,
              }));
              return {
                select: vi.fn().mockResolvedValue({
                  data: returnedData,
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedRepaymentsPayload = payload;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      });

      const parseResult: MemberParseResult = {
        rows: [
          {
            nrp: '12345678',
            nama: 'Budi Santoso',
            pangkat: 'Aipda',
            bank_account_number: '0123456789',
            membership_status: 'ACTIVE',
            tgl_awal_anggota: '2023-01-01',
            jumlah_simpanan_pokok: 0,
            jumlah_simpanan_wajib: 0,
            jumlah_simpanan_belanja: 0,
            jumlah_simpanan_lebaran: 0,
            jumlah_pinjaman: 12000000,
            tgl_awal_pinjaman: '2023-06-15',
            tenor: 12,
            sisa_pinjaman: 4000000,
            n_bulan_simpanan: 1,
            wajib_per_bulan: 0,
            belanja_per_bulan: 0,
            lebaran_per_bulan: 0,
            n_bulan_pinjaman: 1,
            sudah_diangsur: 8000000,
            angsuran_lampau_per_bulan: 1000000,
          },
        ],
        errors: [],
      };

      await executeMigration(parseResult);

      // 1. Verify bank_account_number in anggota upsert
      expect(upsertedMemberPayload).toBeDefined();
      expect(upsertedMemberPayload.nrp).toBe('12345678');
      expect(upsertedMemberPayload.bank_account_number).toBe('0123456789');

      // 2. Verify loan creation with PINJ-MIGRASI-{nrp} and active status
      expect(insertedLoanPayload).toBeDefined();
      expect(insertedLoanPayload.loan_number).toBe('PINJ-MIGRASI-12345678');
      expect(insertedLoanPayload.member_id).toBe('member-full-flow-id');
      expect(insertedLoanPayload.loan_type_id).toBe('lt-pinj-reg');
      expect(insertedLoanPayload.principal_amount).toBe(12000000);
      expect(insertedLoanPayload.agreed_tenor_months).toBe(12);
      expect(insertedLoanPayload.status).toBe('active'); // sisa_pinjaman > 0

      // 3. Verify schedules inserted
      expect(insertedSchedulesPayload).toHaveLength(12);
      const paidScheds = insertedSchedulesPayload.filter((s) => s.status === 'paid');
      const unpaidScheds = insertedSchedulesPayload.filter((s) => s.status === 'unpaid');
      expect(paidScheds).toHaveLength(8); // 8 million paid out of 12 million
      expect(unpaidScheds).toHaveLength(4); // 4 million remaining

      // 4. Verify loan repayments generated for paid schedules
      expect(insertedRepaymentsPayload).toHaveLength(8);
      for (const rep of insertedRepaymentsPayload) {
        expect(rep.loan_id).toBe('new-migrated-loan-id');
        expect(rep.payment_method).toBe('migration');
        expect(rep.notes).toBe('Migrasi Angsuran Lampau');
        expect(rep.amount_paid).toBe(1000000);
        expect(rep.schedule_id).toBeDefined();
      }
    });

    it('should set loan status to completed when sisa_pinjaman is 0 and generate repayments for all schedules', async () => {
      let insertedLoanPayload: any = null;
      let insertedSchedulesPayload: any[] = [];
      let insertedRepaymentsPayload: any[] = [];

      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'loan_types') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'lt-pinj-reg', name: 'Pinjaman Reguler' }],
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
                single: vi.fn().mockResolvedValue({ data: { id: 'member-fully-paid-id' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
                then: (resolve: any) => resolve({ data: [], error: null }),
              })),
            })),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedLoanPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'completed-loan-id' }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedSchedulesPayload = payload;
              return {
                select: vi.fn().mockResolvedValue({
                  data: payload.map((s: any, idx: number) => ({ ...s, id: `sch-comp-${idx}` })),
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedRepaymentsPayload = payload;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
        };
      });

      const parseResult: MemberParseResult = {
        rows: [
          {
            nrp: '87654321',
            nama: 'Siti Aminah',
            pangkat: 'Bripda',
            bank_account_number: '9876543210',
            membership_status: 'ACTIVE',
            tgl_awal_anggota: '2023-01-01',
            jumlah_simpanan_pokok: 0,
            jumlah_simpanan_wajib: 0,
            jumlah_simpanan_belanja: 0,
            jumlah_simpanan_lebaran: 0,
            jumlah_pinjaman: 6000000,
            tgl_awal_pinjaman: '2023-01-10',
            tenor: 6,
            sisa_pinjaman: 0, // Fully paid!
            n_bulan_simpanan: 1,
            wajib_per_bulan: 0,
            belanja_per_bulan: 0,
            lebaran_per_bulan: 0,
            n_bulan_pinjaman: 1,
            sudah_diangsur: 6000000,
            angsuran_lampau_per_bulan: 1000000,
          },
        ],
        errors: [],
      };

      await executeMigration(parseResult);

      // Verify status is completed
      expect(insertedLoanPayload.status).toBe('completed');
      expect(insertedLoanPayload.loan_number).toBe('PINJ-MIGRASI-87654321');

      // Verify all schedules are paid
      expect(insertedSchedulesPayload).toHaveLength(6);
      expect(insertedSchedulesPayload.every((s) => s.status === 'paid')).toBe(true);

      // Verify repayments created for all 6 schedules
      expect(insertedRepaymentsPayload).toHaveLength(6);
    });
  });
});



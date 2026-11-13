import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import {
  INITIAL_LOANS_HEADERS,
  buildInitialLoansTemplateWorkbook,
  parseInitialLoansExcel,
} from './initialLoansParser';
import { syncInitialLoanBalances } from '../services/loanService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('initialLoansParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds an 8-column template workbook populated with active members and reference loan types sheet', async () => {
    const workbook = await buildInitialLoansTemplateWorkbook(
      [
        { nrp: '12345678', nama: 'Budi Santoso', status: 'aktif', membership_status: 'ACTIVE' },
        { nrp: '99999999', nama: 'Non Aktif', status: 'resign', membership_status: 'RESIGNED' },
      ],
      [
        { id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler', max_duration_months: 12, is_active: true },
        { id: 'lt-2', code: 'DAR', name: 'Pinjaman Darurat', max_duration_months: 6, is_active: true },
      ]
    );

    const sheet1 = workbook.getWorksheet('Saldo Awal Pinjaman');
    expect(sheet1).toBeDefined();

    const headerValues: string[] = [];
    sheet1!.getRow(1).eachCell((cell) => {
      headerValues.push(String(cell.value));
    });
    expect(headerValues).toEqual([...INITIAL_LOANS_HEADERS]);

    expect(sheet1!.rowCount).toBe(2);
    const row2 = sheet1!.getRow(2);
    expect(row2.getCell(1).value).toBe('12345678');
    expect(row2.getCell(2).value).toBe('Budi Santoso');
    expect(row2.getCell(3).value).toBe('');
    expect(row2.getCell(4).value).toBe(0);
    expect(row2.getCell(3).dataValidation?.type).toBe('list');

    const sheet2 = workbook.getWorksheet('Referensi Jenis Pinjaman');
    expect(sheet2).toBeDefined();
    expect(sheet2!.rowCount).toBe(3);
    expect(sheet2!.getRow(2).getCell(1).value).toBe('REG');
    expect(sheet2!.getRow(2).getCell(2).value).toBe('Pinjaman Reguler');
    expect(sheet2!.getRow(2).getCell(3).value).toBe(12);
  });

  it('parses uploaded Excel rows with jumlah_pinjaman > 0, matches loan_types case-insensitively, and computes sisa_pinjaman', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Saldo Awal Pinjaman');
    ws.addRow([...INITIAL_LOANS_HEADERS]);
    ws.addRow(['12345678', 'Budi Santoso', 'reg', 12000000, '2025-10-01', 1000000, 12, 3000000]);
    ws.addRow(['87654321', 'Siti Aminah', 'Pinjaman Darurat', '6.000.000', '2026-01-15', '1.000.000', 6, 1500000]);
    ws.addRow(['11112222', 'Tanpa Pinjaman', 'REG', 0, '', 0, 0, 0]);
    ws.addRow(['33334444', 'Jenis Salah', 'TIDAK_ADA', 5000000, '2026-02-01', 500000, 10, 0]);

    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseInitialLoansExcel(buffer as ArrayBuffer, [
      { id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler', max_duration_months: 12 },
      { id: 'lt-2', code: 'DAR', name: 'Pinjaman Darurat', max_duration_months: 6 },
    ]);

    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({
      nrp: '12345678',
      nama: 'Budi Santoso',
      jenis_pinjaman: 'reg',
      loan_type_id: 'lt-1',
      loan_type_name: 'Pinjaman Reguler',
      jumlah_pinjaman: 12000000,
      tgl_awal_pinjaman: '2025-10-01',
      nilai_angsuran: 1000000,
      tenor: 12,
      total_terangsur: 3000000,
      sisa_pinjaman: 9000000,
      isValid: true,
      errorMessage: undefined,
    });
    expect(parsed[1]).toMatchObject({
      nrp: '87654321',
      loan_type_id: 'lt-2',
      loan_type_name: 'Pinjaman Darurat',
      jumlah_pinjaman: 6000000,
      total_terangsur: 1500000,
      sisa_pinjaman: 4500000,
      isValid: true,
    });
    expect(parsed[2]).toMatchObject({
      nrp: '33334444',
      loan_type_id: null,
      isValid: false,
    });
    expect(parsed[2].errorMessage).toContain('tidak terdaftar di Master Produk');
  });

  it('validates NRP existence and normalized Name against registeredMembers', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Saldo Awal Pinjaman');
    ws.addRow([...INITIAL_LOANS_HEADERS]);
    ws.addRow(['12345678', '  budi   SANTOSO ', 'REG', 5000000, '2026-01-01', 500000, 10, 0]);
    ws.addRow(['99999999', 'Belum Terdaftar', 'REG', 5000000, '2026-01-01', 500000, 10, 0]);
    ws.addRow(['87654321', 'Nama Berbeda', 'REG', 5000000, '2026-01-01', 500000, 10, 0]);

    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseInitialLoansExcel(
      buffer as ArrayBuffer,
      [{ id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler', max_duration_months: 12 }],
      [
        { nrp: '12345678', nama: 'Budi Santoso' },
        { nrp: '87654321', nama: 'Siti Aminah' },
      ]
    );

    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({
      nrp: '12345678',
      isValid: true,
      errorMessage: undefined,
    });
    expect(parsed[1]).toMatchObject({
      nrp: '99999999',
      isValid: false,
      errorMessage:
        'NRP 99999999 (Belum Terdaftar) belum terdaftar di sistem. Silakan isi/impor data anggotanya terlebih dahulu!',
    });
    expect(parsed[2]).toMatchObject({
      nrp: '87654321',
      isValid: false,
      errorMessage:
        "Nama tidak cocok! Di Excel tertulis 'Nama Berbeda', sedangkan di sistem untuk NRP 87654321 terdaftar atas nama 'Siti Aminah'.",
    });
  });

  it('throws an error when required columns are missing', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Sheet1');
    ws.addRow(['nrp', 'nama', 'jumlah_pinjaman']);
    ws.addRow(['12345678', 'Budi', 1000000]);

    const buffer = await workbook.xlsx.writeBuffer();
    await expect(parseInitialLoansExcel(buffer as ArrayBuffer, [])).rejects.toThrow(
      /Header kolom tidak sesuai template Saldo Awal Pinjaman\. Kolom yang kurang: jenis_pinjaman, tgl_awal_pinjaman, nilai_angsuran, tenor, total_terangsur/
    );
  });

  it('rejects Member Import or Initial Savings templates when uploaded to Initial Loans', async () => {
    const memberWb = new ExcelJS.Workbook();
    const memberWs = memberWb.addWorksheet('Template Import Anggota');
    memberWs.addRow(['nrp', 'nama', 'pangkat', 'bank_account_number', 'membership_status', 'tgl_awal_anggota']);
    memberWs.addRow(['95168420', 'Budi Santoso', 'Aipda', '367800973556', 'ACTIVE', '2026-11-13']);
    const memberBuf = await memberWb.xlsx.writeBuffer();

    await expect(parseInitialLoansExcel(memberBuf as ArrayBuffer, [])).rejects.toThrow(
      /File tidak sesuai! Pastikan Anda mengunggah file dari "Unduh Template Saldo Awal Pinjaman \(\.xlsx\)" pada menu ini\./
    );

    const savingsWb = new ExcelJS.Workbook();
    const savingsWs = savingsWb.addWorksheet('Saldo Awal Simpanan');
    savingsWs.addRow(['nrp', 'nama', 'jumlah_simpanan_pokok', 'jumlah_simpanan_wajib', 'jumlah_simpanan_belanja', 'jumlah_simpanan_lebaran']);
    savingsWs.addRow(['95168420', 'Budi Santoso', 100000, 500000, 0, 0]);
    const savingsBuf = await savingsWb.xlsx.writeBuffer();

    await expect(parseInitialLoansExcel(savingsBuf as ArrayBuffer, [])).rejects.toThrow(
      /File tidak sesuai! Pastikan Anda mengunggah file dari "Unduh Template Saldo Awal Pinjaman \(\.xlsx\)" pada menu ini\./
    );
  });
});

describe('syncInitialLoanBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws an error if effectiveDate is missing or invalid', async () => {
    await expect(
      syncInitialLoanBalances(
        [
          {
            nrp: '12345678',
            nama: 'Budi',
            jenis_pinjaman: 'REG',
            loan_type_id: 'lt-1',
            loan_type_name: 'Pinjaman Reguler',
            jumlah_pinjaman: 6000000,
            tgl_awal_pinjaman: '2026-01-01',
            nilai_angsuran: 1000000,
            tenor: 6,
            total_terangsur: 2000000,
            sisa_pinjaman: 4000000,
            isValid: true,
          },
        ],
        ''
      )
    ).rejects.toThrow(/Tanggal aktif saldo awal pinjaman wajib diisi/);
  });

  it('performs clean overwrite, inserts loans, FIFO loan_schedules, SALDO_AWAL loan_repayments, and logs metadata', async () => {
    const deletedRepayLoanIds: string[][] = [];
    const deletedSchedLoanIds: string[][] = [];
    const deletedLoanIds: string[][] = [];
    const insertedLoans: any[] = [];
    const insertedSchedules: any[] = [];
    const insertedRepayments: any[] = [];
    const upsertedSettings: any[] = [];
    const insertedAuditLogs: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'm-1', nrp: '12345678', nama: 'Budi Santoso' }],
            error: null,
          }),
        };
      }
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'old-loan-1',
                  loan_number: 'SALDO-AWAL-12345678-REG',
                  loan_type_id: 'lt-1',
                  notes: 'Saldo Awal Pinjaman (Aktif sejak 2026-01-01)',
                },
              ],
              error: null,
            }),
          }),
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation((_col: string, ids: string[]) => {
              deletedLoanIds.push(ids);
              return Promise.resolve({ error: null });
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            insertedLoans.push(payload);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'new-loan-1' },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation((_col: string, ids: string[]) => {
              deletedSchedLoanIds.push(ids);
              return Promise.resolve({ error: null });
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            insertedSchedules.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation((_col: string, ids: string[]) => {
              deletedRepayLoanIds.push(ids);
              return Promise.resolve({ error: null });
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            insertedRepayments.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === 'system_settings') {
        return {
          upsert: vi.fn().mockImplementation((payload: any) => {
            upsertedSettings.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === 'audit_logs') {
        return {
          insert: vi.fn().mockImplementation((payload: any) => {
            insertedAuditLogs.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {};
    });

    const result = await syncInitialLoanBalances(
      [
        {
          nrp: '12345678',
          nama: 'Budi Santoso',
          jenis_pinjaman: 'REG',
          loan_type_id: 'lt-1',
          loan_type_name: 'Pinjaman Reguler',
          jumlah_pinjaman: 4000000,
          tgl_awal_pinjaman: '2026-01-10',
          nilai_angsuran: 1000000,
          tenor: 4,
          total_terangsur: 1500000,
          sisa_pinjaman: 2500000,
          isValid: true,
        },
      ],
      '2026-03-01'
    );

    expect(result).toEqual({
      insertedCount: 1,
      skippedCount: 0,
      skippedNrps: [],
      effectiveDate: '2026-03-01',
    });

    expect(deletedRepayLoanIds).toEqual([['old-loan-1']]);
    expect(deletedSchedLoanIds).toEqual([['old-loan-1']]);
    expect(deletedLoanIds).toEqual([['old-loan-1']]);

    expect(insertedLoans[0]).toMatchObject({
      loan_number: 'SALDO-AWAL-12345678-REG',
      member_id: 'm-1',
      loan_type_id: 'lt-1',
      principal_amount: 4000000,
      agreed_tenor_months: 4,
      planned_installment_amount: 1000000,
      disbursed_at: '2026-01-10',
      status: 'active',
      notes: 'Saldo Awal Pinjaman (Aktif sejak 2026-03-01)',
    });

    // FIFO allocation of 1,500,000 across 4 periods of 1,000,000
    expect(insertedSchedules[0]).toHaveLength(4);
    expect(insertedSchedules[0][0]).toMatchObject({ period_number: 1, status: 'paid', paid_amount: 1000000 });
    expect(insertedSchedules[0][1]).toMatchObject({ period_number: 2, status: 'partial', paid_amount: 500000 });
    expect(insertedSchedules[0][2]).toMatchObject({ period_number: 3, status: 'unpaid', paid_amount: 0 });
    expect(insertedSchedules[0][3]).toMatchObject({ period_number: 4, status: 'unpaid', paid_amount: 0 });

    expect(insertedRepayments[0]).toMatchObject({
      loan_id: 'new-loan-1',
      payment_method: 'SALDO_AWAL',
      amount_paid: 1500000,
    });

    expect(upsertedSettings[0]).toMatchObject({
      key: 'initial_loans_effective_date',
      value: '2026-03-01',
    });

    expect(insertedAuditLogs[0]).toMatchObject({
      table_name: 'loans',
      action: 'UPLOAD_INITIAL_LOANS',
      record_id: '2026-03-01',
    });
  });

  it('throws an error when a row with jumlah_pinjaman > 0 has an unregistered NRP or mismatched Name', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'm-1', nrp: '12345678', nama: 'Budi Santoso' }],
            error: null,
          }),
        };
      }
      return {};
    });

    await expect(
      syncInitialLoanBalances(
        [
          {
            nrp: '00000000',
            nama: 'Tidak Ada',
            jenis_pinjaman: 'REG',
            loan_type_id: 'lt-1',
            loan_type_name: 'Pinjaman Reguler',
            jumlah_pinjaman: 1000000,
            tgl_awal_pinjaman: '2026-01-10',
            nilai_angsuran: 500000,
            tenor: 2,
            total_terangsur: 0,
            sisa_pinjaman: 1000000,
            isValid: true,
          },
        ],
        '2026-03-01'
      )
    ).rejects.toThrow(
      /NRP 00000000 \(Tidak Ada\) belum terdaftar di sistem\. Silakan isi\/impor data anggotanya terlebih dahulu!/
    );

    await expect(
      syncInitialLoanBalances(
        [
          {
            nrp: '12345678',
            nama: 'Orang Lain',
            jenis_pinjaman: 'REG',
            loan_type_id: 'lt-1',
            loan_type_name: 'Pinjaman Reguler',
            jumlah_pinjaman: 1000000,
            tgl_awal_pinjaman: '2026-01-10',
            nilai_angsuran: 500000,
            tenor: 2,
            total_terangsur: 0,
            sisa_pinjaman: 1000000,
            isValid: true,
          },
        ],
        '2026-03-01'
      )
    ).rejects.toThrow(
      /Nama tidak cocok! Di Excel tertulis 'Orang Lain', sedangkan di sistem untuk NRP 12345678 terdaftar atas nama 'Budi Santoso'\./
    );
  });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import {
  INITIAL_SAVINGS_HEADERS,
  buildInitialSavingsTemplateWorkbook,
  parseInitialSavingsExcel,
} from './initialSavingsParser';
import { syncInitialSavingsBalances } from '../services/memberService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('initialSavingsParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a 6-column template workbook populated with active members and 0 defaults', async () => {
    const workbook = await buildInitialSavingsTemplateWorkbook([
      { nrp: '12345678', nama: 'Budi Santoso', status: 'aktif', membership_status: 'ACTIVE' },
      { nrp: '99999999', nama: 'Non Aktif', status: 'resign', membership_status: 'RESIGNED' },
    ]);

    const worksheet = workbook.getWorksheet('Saldo Awal Simpanan');
    expect(worksheet).toBeDefined();

    const headerValues: string[] = [];
    worksheet!.getRow(1).eachCell((cell) => {
      headerValues.push(String(cell.value));
    });
    expect(headerValues).toEqual([...INITIAL_SAVINGS_HEADERS]);

    expect(worksheet!.rowCount).toBe(2);
    const row2 = worksheet!.getRow(2);
    expect(row2.getCell(1).value).toBe('12345678');
    expect(row2.getCell(2).value).toBe('Budi Santoso');
    expect(row2.getCell(3).value).toBe(0);
    expect(row2.getCell(4).value).toBe(0);
    expect(row2.getCell(5).value).toBe(0);
    expect(row2.getCell(6).value).toBe(0);
  });

  it('parses uploaded Excel rows with pure as-is numbers', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Saldo Awal Simpanan');
    ws.addRow([...INITIAL_SAVINGS_HEADERS]);
    ws.addRow(['12345678', 'Budi Santoso', 100000, 1500000, 250000, 300000]);
    ws.addRow(['87654321', 'Siti Aminah', null, '750.000', '', 120000]);

    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseInitialSavingsExcel(buffer as ArrayBuffer);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      nrp: '12345678',
      nama: 'Budi Santoso',
      jumlah_simpanan_pokok: 100000,
      jumlah_simpanan_wajib: 1500000,
      jumlah_simpanan_belanja: 250000,
      jumlah_simpanan_lebaran: 300000,
    });
    expect(parsed[1]).toEqual({
      nrp: '87654321',
      nama: 'Siti Aminah',
      jumlah_simpanan_pokok: 0,
      jumlah_simpanan_wajib: 750000,
      jumlah_simpanan_belanja: 0,
      jumlah_simpanan_lebaran: 120000,
    });
  });

  it('throws an error when required columns are missing', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Sheet1');
    ws.addRow(['nrp', 'nama', 'jumlah_simpanan_pokok']);
    ws.addRow(['12345678', 'Budi', 100000]);

    const buffer = await workbook.xlsx.writeBuffer();
    await expect(parseInitialSavingsExcel(buffer as ArrayBuffer)).rejects.toThrow(
      /Format kolom Excel tidak valid/
    );
  });
});

describe('syncInitialSavingsBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws an error if effectiveDate is missing or invalid', async () => {
    await expect(
      syncInitialSavingsBalances(
        [
          {
            nrp: '12345678',
            nama: 'Budi',
            jumlah_simpanan_pokok: 100000,
            jumlah_simpanan_wajib: 500000,
            jumlah_simpanan_belanja: 0,
            jumlah_simpanan_lebaran: 0,
          },
        ],
        ''
      )
    ).rejects.toThrow(/Tanggal aktif saldo awal wajib diisi/);
  });

  it('performs clean overwrite, inserts non-zero initial deposits with effectiveDate, and logs metadata', async () => {
    const insertedTransactions: any[] = [];
    const deletedAccountIds: string[] = [];
    const upsertedSettings: any[] = [];
    const insertedAuditLogs: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'm-1', nrp: '12345678' }],
            error: null,
          }),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { id: 'dt-pokok', code: 'POKOK', name: 'Simpanan Pokok' },
              { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
              { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' },
              { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Lebaran' },
            ],
            error: null,
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'md-pokok', deposit_type_id: 'dt-pokok' },
                { id: 'md-wajib', deposit_type_id: 'dt-wajib' },
                { id: 'md-belanja', deposit_type_id: 'dt-belanja' },
                { id: 'md-lebaran', deposit_type_id: 'dt-lebaran' },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => {
              deletedAccountIds.push(val);
              return {
                or: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            insertedTransactions.push(payload);
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

    const result = await syncInitialSavingsBalances(
      [
        {
          nrp: '12345678',
          nama: 'Budi Santoso',
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 500000,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 200000,
        },
        {
          nrp: '00000000',
          nama: 'Tidak Ada',
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 0,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
        },
      ],
      '2026-01-01'
    );

    expect(result).toEqual({
      updatedCount: 1,
      skippedNrps: ['00000000'],
      effectiveDate: '2026-01-01',
    });

    // All 4 deposit accounts cleaned before inserting
    expect(deletedAccountIds).toEqual(['md-pokok', 'md-wajib', 'md-belanja', 'md-lebaran']);

    // Only > 0 amounts inserted (pokok, wajib, lebaran)
    expect(insertedTransactions).toHaveLength(3);
    expect(insertedTransactions[0]).toMatchObject({
      member_deposit_id: 'md-pokok',
      transaction_type: 'deposit',
      amount: 100000,
      description: 'Saldo Awal Simpanan (Aktif sejak 2026-01-01)',
      created_at: new Date('2026-01-01T00:00:00').toISOString(),
    });

    expect(upsertedSettings[0]).toMatchObject({
      key: 'initial_savings_effective_date',
      value: '2026-01-01',
    });

    expect(insertedAuditLogs[0]).toMatchObject({
      table_name: 'deposit_transactions',
      action: 'UPLOAD_INITIAL_SAVINGS',
      record_id: '2026-01-01',
    });
  });
});


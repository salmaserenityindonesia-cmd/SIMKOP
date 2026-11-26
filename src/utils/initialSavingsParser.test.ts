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

  it('builds a 7-column template workbook populated with active members and 0 defaults', async () => {
    const workbook = await buildInitialSavingsTemplateWorkbook([
      { nomor_referensi: '0042', nrp: '12345678', nama: 'Budi Santoso', status: 'aktif', membership_status: 'ACTIVE' },
      { nomor_referensi: '0099', nrp: '99999999', nama: 'Non Aktif', status: 'resign', membership_status: 'RESIGNED' },
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
    expect(row2.getCell(1).value).toBe('0042');
    expect(row2.getCell(2).value).toBe('12345678');
    expect(row2.getCell(3).value).toBe('Budi Santoso');
    expect(row2.getCell(4).value).toBe(0);
    expect(row2.getCell(5).value).toBe(0);
    expect(row2.getCell(6).value).toBe(0);
    expect(row2.getCell(7).value).toBe(0);
    expect(worksheet!.getColumn('nomor_referensi').numFmt).toBe('@');
    expect(worksheet!.getColumn('nrp').numFmt).toBe('@');
  });

  it('parses uploaded Excel rows with pure as-is numbers (7-column and legacy 6-column)', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Saldo Awal Simpanan');
    ws.addRow([...INITIAL_SAVINGS_HEADERS]);
    ws.addRow(['0042', '12345678', 'Budi Santoso', 100000, 1500000, 250000, 300000]);
    ws.addRow(['', '87654321', 'Siti Aminah', null, '750.000', '', 120000]);

    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseInitialSavingsExcel(buffer as ArrayBuffer);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      nomor_referensi: '0042',
      nrp: '12345678',
      nama: 'Budi Santoso',
      jumlah_simpanan_pokok: 100000,
      jumlah_simpanan_wajib: 1500000,
      jumlah_simpanan_belanja: 250000,
      jumlah_simpanan_lebaran: 300000,
      isValid: true,
      errorMessage: undefined,
    });
    expect(parsed[1]).toEqual({
      nomor_referensi: '',
      nrp: '87654321',
      nama: 'Siti Aminah',
      jumlah_simpanan_pokok: 0,
      jumlah_simpanan_wajib: 750000,
      jumlah_simpanan_belanja: 0,
      jumlah_simpanan_lebaran: 120000,
      isValid: true,
      errorMessage: undefined,
    });

    // Legacy 6-column file without nomor_referensi
    const legacyWb = new ExcelJS.Workbook();
    const legacyWs = legacyWb.addWorksheet('Saldo Awal Simpanan');
    legacyWs.addRow(['nrp', 'nama', 'jumlah_simpanan_pokok', 'jumlah_simpanan_wajib', 'jumlah_simpanan_belanja', 'jumlah_simpanan_lebaran']);
    legacyWs.addRow(['12345678', 'Budi Santoso', 100000, 200000, 0, 0]);
    const legacyBuf = await legacyWb.xlsx.writeBuffer();
    const legacyParsed = await parseInitialSavingsExcel(legacyBuf as ArrayBuffer);
    expect(legacyParsed[0]).toMatchObject({
      nomor_referensi: '',
      nrp: '12345678',
      nama: 'Budi Santoso',
      jumlah_simpanan_pokok: 100000,
      jumlah_simpanan_wajib: 200000,
    });
  });

  it('validates NRP existence and normalized Name against registeredMembers', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Saldo Awal Simpanan');
    ws.addRow([...INITIAL_SAVINGS_HEADERS]);
    ws.addRow(['0001', '12345678', '  budi   SANTOSO ', 100000, 500000, 0, 0]);
    ws.addRow(['0002', '99999999', 'Belum Terdaftar', 100000, 0, 0, 0]);
    ws.addRow(['0003', '87654321', 'Nama Berbeda', 0, 200000, 0, 0]);

    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseInitialSavingsExcel(buffer as ArrayBuffer, [
      { nrp: '12345678', nama: 'Budi Santoso' },
      { nrp: '87654321', nama: 'Siti Aminah' },
    ]);

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
    ws.addRow(['nrp', 'nama', 'jumlah_simpanan_pokok']);
    ws.addRow(['12345678', 'Budi', 100000]);

    const buffer = await workbook.xlsx.writeBuffer();
    await expect(parseInitialSavingsExcel(buffer as ArrayBuffer)).rejects.toThrow(
      /Header kolom tidak sesuai template Saldo Awal Simpanan\. Kolom yang kurang: jumlah_simpanan_wajib, jumlah_simpanan_belanja, jumlah_simpanan_lebaran/
    );
  });

  it('rejects Member Import or Initial Loans templates when uploaded to Initial Savings', async () => {
    const memberWb = new ExcelJS.Workbook();
    const memberWs = memberWb.addWorksheet('Template Import Anggota');
    memberWs.addRow(['nrp', 'nama', 'tanggal_lahir', 'bank_account_number', 'membership_status', 'tgl_awal_anggota']);
    memberWs.addRow(['95168420', 'Budi Santoso', 'Aipda', '367800973556', 'ACTIVE', '2026-11-13']);
    const memberBuf = await memberWb.xlsx.writeBuffer();

    await expect(parseInitialSavingsExcel(memberBuf as ArrayBuffer)).rejects.toThrow(
      /File tidak sesuai! Pastikan Anda mengunggah file dari "Unduh Template Saldo Awal \(\.xlsx\)" pada menu ini\./
    );

    const loanWb = new ExcelJS.Workbook();
    const loanWs = loanWb.addWorksheet('Saldo Awal Pinjaman');
    loanWs.addRow(['nrp', 'nama', 'jenis_pinjaman', 'jumlah_pinjaman', 'tgl_awal_pinjaman', 'nilai_angsuran', 'tenor', 'total_terangsur']);
    loanWs.addRow(['95168420', 'Budi Santoso', 'REG', 5000000, '2026-01-01', 500000, 10, 0]);
    const loanBuf = await loanWb.xlsx.writeBuffer();

    await expect(parseInitialSavingsExcel(loanBuf as ArrayBuffer)).rejects.toThrow(
      /File tidak sesuai! Pastikan Anda mengunggah file dari "Unduh Template Saldo Awal \(\.xlsx\)" pada menu ini\./
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
            data: [{ id: 'm-1', nrp: '12345678', nama: 'Budi Santoso' }],
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
      ],
      '2026-01-01'
    );

    expect(result).toEqual({
      updatedCount: 1,
      skippedNrps: [],
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
      for_year: 2025,
      for_month: 12,
      description: 'Saldo Awal Cut-Off (s/d Des 2025)',
      created_at: '2026-01-01T00:00:00.000Z',
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

  it('throws an error when a row with balance > 0 has an unregistered NRP or mismatched Name', async () => {
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
      syncInitialSavingsBalances(
        [
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
      )
    ).rejects.toThrow(
      /NRP 00000000 \(Tidak Ada\) belum terdaftar di sistem\. Silakan isi\/impor data anggotanya terlebih dahulu!/
    );

    await expect(
      syncInitialSavingsBalances(
        [
          {
            nrp: '12345678',
            nama: 'Orang Lain',
            jumlah_simpanan_pokok: 100000,
            jumlah_simpanan_wajib: 0,
            jumlah_simpanan_belanja: 0,
            jumlah_simpanan_lebaran: 0,
          },
        ],
        '2026-01-01'
      )
    ).rejects.toThrow(
      /Nama tidak cocok! Di Excel tertulis 'Orang Lain', sedangkan di sistem untuk NRP 12345678 terdaftar atas nama 'Budi Santoso'\./
    );
  });

  it('syncs member_deposits.balance, runs .or() cleanup on PostgREST-like builders, and idempotently inserts/updates SALDO_AWAL_SIMPANAN in cash_flow', async () => {
    const balanceUpdates: Array<{ id: string; balance: number }> = [];
    const cashFlowRows: any[] = [];
    const txStore: any[] = [];
    const orCalls: string[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'm-1', nrp: '12345678', nama: 'Budi Santoso' }],
            error: null,
          }),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { id: 'dt-pokok', code: 'SP', name: 'Simpanan Pokok' },
              { id: 'dt-wajib', code: 'SW', name: 'Simpanan Wajib' },
              { id: 'dt-belanja', code: 'SB', name: 'Simpanan Belanja' },
              { id: 'dt-lebaran', code: 'SL', name: 'Simpanan Lebaran' },
            ],
            error: null,
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols.includes('balance')) {
              return Promise.resolve({ data: [], error: null });
            }
            return {
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-pokok', deposit_type_id: 'dt-pokok' },
                  { id: 'md-wajib', deposit_type_id: 'dt-wajib' },
                  { id: 'md-belanja', deposit_type_id: 'dt-belanja' },
                  { id: 'md-lebaran', deposit_type_id: 'dt-lebaran' },
                ],
                error: null,
              }),
            };
          }),
          update: vi.fn().mockImplementation((payload: any) => ({
            eq: vi.fn().mockImplementation((_col: string, id: string) => {
              balanceUpdates.push({ id, balance: payload.balance });
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, id: string) =>
              Promise.resolve({ data: txStore.filter((t) => t.member_deposit_id === id), error: null })
            ),
            then: (resolve: any) => resolve({ data: [...txStore], error: null }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, id: string) => ({
              then: (resolve: any) => resolve({ error: null }),
              or: vi.fn().mockImplementation((filter: string) => {
                orCalls.push(filter);
                for (let idx = txStore.length - 1; idx >= 0; idx--) {
                  if (txStore[idx].member_deposit_id === id) txStore.splice(idx, 1);
                }
                return Promise.resolve({ error: null });
              }),
            })),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            const rows = Array.isArray(payload) ? payload : [payload];
            txStore.push(...rows);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(() => Promise.resolve({ data: [...cashFlowRows], error: null })),
          }),
          insert: vi.fn().mockImplementation((payload: any) => {
            cashFlowRows.push({ id: `cf-${cashFlowRows.length + 1}`, ...payload });
            return Promise.resolve({ error: null });
          }),
          update: vi.fn().mockImplementation((payload: any) => ({
            eq: vi.fn().mockImplementation((_col: string, id: string) => {
              const target = cashFlowRows.find((r) => r.id === id);
              if (target) Object.assign(target, payload);
              return Promise.resolve({ error: null });
            }),
          })),
          delete: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              for (let idx = cashFlowRows.length - 1; idx >= 0; idx--) {
                if (cashFlowRows[idx][col] === val) cashFlowRows.splice(idx, 1);
              }
              return Promise.resolve({ error: null });
            }),
            in: vi.fn().mockImplementation((col: string, vals: string[]) => {
              for (let idx = cashFlowRows.length - 1; idx >= 0; idx--) {
                if (vals.includes(cashFlowRows[idx][col])) cashFlowRows.splice(idx, 1);
              }
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      if (table === 'system_settings') {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'audit_logs') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });

    // Impor pertama: 100.000 + 500.000 + 50.000 + 200.000 = 850.000
    await syncInitialSavingsBalances(
      [
        {
          nrp: '12345678',
          nama: 'Budi Santoso',
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 500000,
          jumlah_simpanan_belanja: 50000,
          jumlah_simpanan_lebaran: 200000,
        },
      ],
      '2026-03-01'
    );

    expect(orCalls).toHaveLength(4);
    for (const filterStr of orCalls) {
      expect(filterStr).toContain('description.ilike.%saldo awal%');
      expect(filterStr).toContain('description.ilike.%migrasi%');
      expect(filterStr).toContain('description.ilike.%cut-off%');
      expect(filterStr).toContain('and(for_year.eq.2026,for_month.lte.2)');
    }
    expect(txStore).toHaveLength(4);
    expect(txStore[0]).toMatchObject({
      for_year: 2026,
      for_month: 2,
      description: 'Saldo Awal Cut-Off (s/d Feb 2026)',
      created_at: '2026-03-01T00:00:00.000Z',
    });
    expect(balanceUpdates).toEqual([
      { id: 'md-pokok', balance: 100000 },
      { id: 'md-wajib', balance: 500000 },
      { id: 'md-belanja', balance: 50000 },
      { id: 'md-lebaran', balance: 200000 },
    ]);
    expect(cashFlowRows).toHaveLength(1);
    expect(cashFlowRows[0]).toMatchObject({
      direction: 'in',
      category: 'SALDO_AWAL_SIMPANAN',
      amount: 850000,
      created_at: '2026-03-01T00:00:00.000Z',
    });

    // Impor ulang dengan perubahan nominal naik: total menjadi 1.000.000 (tidak boleh duplikat baris cash_flow)
    await syncInitialSavingsBalances(
      [
        {
          nrp: '12345678',
          nama: 'Budi Santoso',
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 650000,
          jumlah_simpanan_belanja: 50000,
          jumlah_simpanan_lebaran: 200000,
        },
      ],
      '2026-03-01'
    );

    expect(cashFlowRows).toHaveLength(1);
    expect(cashFlowRows[0].amount).toBe(1000000);

    // Impor ulang dengan perubahan nominal turun: total menjadi 600.000 (tidak boleh duplikat baris cash_flow)
    await syncInitialSavingsBalances(
      [
        {
          nrp: '12345678',
          nama: 'Budi Santoso',
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 300000,
          jumlah_simpanan_belanja: 50000,
          jumlah_simpanan_lebaran: 150000,
        },
      ],
      '2026-03-01'
    );

    expect(cashFlowRows).toHaveLength(1);
    expect(cashFlowRows[0].amount).toBe(600000);

    // Overwrite semua saldo menjadi 0 -> baris SALDO_AWAL_SIMPANAN dihapus dari cash_flow
    await syncInitialSavingsBalances(
      [
        {
          nrp: '12345678',
          nama: 'Budi Santoso',
          jumlah_simpanan_pokok: 0,
          jumlah_simpanan_wajib: 0,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
        },
      ],
      '2026-03-01'
    );

    expect(cashFlowRows).toHaveLength(0);
  });

  it('invokes onProgress callback sequentially from 1 to total with member name', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { id: 'mem-1', nrp: '111', nama: 'Anggota Satu' },
              { id: 'mem-2', nrp: '222', nama: 'Anggota Dua' },
            ],
            error: null,
          }),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { id: 'dt-pokok', code: 'SP', name: 'Simpanan Pokok' },
              { id: 'dt-wajib', code: 'SW', name: 'Simpanan Wajib' },
              { id: 'dt-belanja', code: 'SB', name: 'Simpanan Belanja' },
              { id: 'dt-lebaran', code: 'SL', name: 'Simpanan Lebaran' },
            ],
            error: null,
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'md-1', deposit_type_id: 'dt-pokok' }],
              error: null,
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'md-new' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        };
      }
      if (table === 'system_settings') return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === 'audit_logs') return { insert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const progressUpdates: Array<{ current: number; total: number; memberName?: string }> = [];
    await syncInitialSavingsBalances(
      [
        {
          nrp: '111',
          nama: 'Anggota Satu',
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 0,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
        },
        {
          nrp: '222',
          nama: 'Anggota Dua',
          jumlah_simpanan_pokok: 100000,
          jumlah_simpanan_wajib: 0,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
        },
      ],
      '2026-03-01',
      (current, total, memberName) => {
        progressUpdates.push({ current, total, memberName });
      }
    );

    expect(progressUpdates[0]).toEqual({ current: 1, total: 2, memberName: 'Anggota Satu' });
    expect(progressUpdates[1]).toEqual({ current: 2, total: 2, memberName: 'Anggota Dua' });
    expect(progressUpdates[progressUpdates.length - 1]).toEqual({
      current: 2,
      total: 2,
      memberName: 'Anggota Dua',
    });
  });
});


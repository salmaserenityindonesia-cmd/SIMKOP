import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import {
  fetchMembersSalaryAndAccounts,
  confirmSalaryReconciliation,
  applySalaryReconciliation,
  parseSalaryReconciliationFile,
  buildSalaryReconciliationWorkbook,
  downloadSalaryReconciliationTemplate,
  cleanNumber,
  resolveMemberSalary,
  MemberSalaryAccountItem,
  SalaryImportProgress,
} from './salaryImportService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
    },
  };
});

describe('salaryImportService - Paged Fetching & Reconciliation Confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchMembersSalaryAndAccounts', () => {
    it('memuat seluruh anggota dengan paginasi loop (>1.000 anggota) tanpa terpotong di 1.000', async () => {
      // Mock page 1 (1.000 anggota) dan page 2 (300 anggota)
      const page1 = Array.from({ length: 1000 }, (_, i) => ({
        id: `mem-${i + 1}`,
        nrp: `NRP-${i + 1}`,
        nama: `Anggota ${i + 1}`,
        tanggal_lahir: '1984-04-12',
        bank_account_number: `ACC-${i + 1}`,
        take_home_pay: 5000000 + i * 1000,
        master_thp: 5000000 + i * 1000,
        status: 'aktif',
        membership_status: 'ACTIVE',
      }));

      const page2 = Array.from({ length: 300 }, (_, i) => ({
        id: `mem-${1000 + i + 1}`,
        nrp: `NRP-${1000 + i + 1}`,
        nama: `Anggota ${1000 + i + 1}`,
        tanggal_lahir: '1981-09-18',
        bank_account_number: `ACC-${1000 + i + 1}`,
        take_home_pay: 6000000,
        master_thp: 6000000,
        status: 'aktif',
        membership_status: 'ACTIVE',
      }));

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockImplementation((from: number, to: number) => {
                  if (from === 0) {
                    return Promise.resolve({ data: page1, error: null });
                  }
                  if (from === 1000) {
                    return Promise.resolve({ data: page2, error: null });
                  }
                  return Promise.resolve({ data: [], error: null });
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await fetchMembersSalaryAndAccounts();
      expect(result).toHaveLength(1300);
      expect(result[0].nrp).toBe('NRP-1');
      expect(result[1299].nrp).toBe('NRP-1300');
    });

    it('memuat data dalam 1 batch jika jumlah data kurang dari 1.000', async () => {
      const sampleData: MemberSalaryAccountItem[] = [
        {
          id: 'mem-1',
          nrp: '111111',
          nama: 'Budi Santoso',
          tanggal_lahir: '1987-01-25',
          bank_account_number: '1234567890',
          take_home_pay: 4500000,
          master_thp: 4500000,
          status: 'aktif',
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: sampleData, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await fetchMembersSalaryAndAccounts();
      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe('Budi Santoso');
    });

    it('mengembalikan array kosong jika tabel kosong', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await fetchMembersSalaryAndAccounts();
      expect(result).toEqual([]);
    });

    it('menangani fallback error (tabel belum ada 42P01 / network) dengan mengembalikan array kosong', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: '42P01', message: 'relation "anggota" does not exist' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await fetchMembersSalaryAndAccounts();
      expect(result).toEqual([]);
    });

    it('melempar error jika terjadi database error fatal non-fallback', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: '23505', message: 'Unique violation' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(fetchMembersSalaryAndAccounts()).rejects.toThrow(
        /Gagal mengambil data gaji dan rekening anggota/
      );
    });
  });

  describe('confirmSalaryReconciliation', () => {
    it('memanggil rpc batch_update_salary_reconciliation dengan payload dan user id admin', async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: 'admin-uuid-123' } },
      });
      (supabase.rpc as any).mockResolvedValue({ error: null });

      const payload = [
        {
          nrp: '123456',
          take_home_pay: 5000000,
          final_account_number: '987654321',
        },
      ];

      const success = await confirmSalaryReconciliation(payload);
      expect(success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('batch_update_salary_reconciliation', {
        payload,
        admin_id: 'admin-uuid-123',
      });
    });

    it('melempar error jika rpc mengembalikan error', async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: null },
      });
      (supabase.rpc as any).mockResolvedValue({
        error: new Error('RPC execution failed'),
      });

      await expect(confirmSalaryReconciliation([])).rejects.toThrow('RPC execution failed');
    });
  });

  describe('cleanNumber', () => {
    it('mengembalikan angka langsung jika input sudah bertipe number', () => {
      expect(cleanNumber(5000000)).toBe(5000000);
      expect(cleanNumber(0)).toBe(0);
      expect(cleanNumber(NaN)).toBe(0);
    });

    it('membersihkan format rupiah dan karakter non-numerik', () => {
      expect(cleanNumber('Rp 5.000.000')).toBe(5000000);
      expect(cleanNumber('5.000.000')).toBe(5000000);
      expect(cleanNumber('Rp 5.000.000,00')).toBe(5000000);
      expect(cleanNumber('5.000.000.00')).toBe(5000000);
    });

    it('mengembalikan 0 untuk nilai falsy atau kosong', () => {
      expect(cleanNumber(null)).toBe(0);
      expect(cleanNumber(undefined)).toBe(0);
      expect(cleanNumber('')).toBe(0);
      expect(cleanNumber('-')).toBe(0);
    });
  });

  describe('applySalaryReconciliation', () => {
    it('mengupdate take_home_pay, master_thp, salary, dan bank_account_number ke tabel anggota', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { update: mockUpdate };
        }
        return {};
      });

      const previewRows = [
        {
          nrp: '12345',
          thp: 'Rp 5.000.000',
          rekening_baru: '987654321',
        },
        {
          nrp: '67890',
          take_home_pay: 4500000,
          bank_account_number: '123456789',
        },
      ];

      const success = await applySalaryReconciliation(previewRows);
      expect(success).toBe(true);

      expect(supabase.from).toHaveBeenCalledWith('anggota');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          take_home_pay: 5000000,
          master_thp: 5000000,
          salary: 5000000,
          bank_account_number: '987654321',
        })
      );
      // Memastikan updated_at tidak disertakan agar tidak memicu schema cache error
      expect(mockUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.anything(),
        })
      );
      expect(mockEq).toHaveBeenCalledWith('nrp', '12345');
      expect(mockEq).toHaveBeenCalledWith('nrp', '67890');
    });

    it('melanjutkan proses baris anggota lain saat salah satu NRP gagal dan melaporkan semua NRP yang gagal', async () => {
      const mockEq = vi.fn().mockImplementation((col: string, val: string) => {
        if (val === '11111') {
          return Promise.resolve({
            error: { message: "Could not find the 'updated_at' column of 'anggota' in the schema cache" },
          });
        }
        return Promise.resolve({ error: null });
      });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { update: mockUpdate };
        }
        return {};
      });

      const previewRows = [
        { nrp: '11111', thp: 5000000 },
        { nrp: '22222', thp: 6000000 },
      ];

      await expect(applySalaryReconciliation(previewRows)).rejects.toThrow(
        /Gagal update NRP 11111/
      );
      // Pastikan NRP 22222 tetap dieksekusi meskipun baris pertama gagal
      expect(mockEq).toHaveBeenCalledWith('nrp', '22222');
    });

    it('melakukan retry tanpa kolom salary jika kolom salary tidak ada di skema database', async () => {
      let callCount = 0;
      const mockEq = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            error: { message: 'column "salary" of relation "anggota" does not exist' },
          });
        }
        return Promise.resolve({ error: null });
      });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { update: mockUpdate };
        }
        return {};
      });

      const previewRows = [
        {
          nrp: '99999',
          thp: 7500000,
          rekening_baru: '555666777',
        },
      ];

      const success = await applySalaryReconciliation(previewRows);
      expect(success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      // Panggilan kedua tidak menyertakan salary
      expect(mockUpdate).toHaveBeenLastCalledWith(
        expect.not.objectContaining({
          salary: expect.anything(),
        })
      );
    });

    it('melempar error jika database gagal mengupdate baris anggota', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        error: { message: 'Network connection lost' },
      });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { update: mockUpdate };
        }
        return {};
      });

      const previewRows = [
        {
          nrp: '11111',
          thp: 5000000,
        },
      ];

      await expect(applySalaryReconciliation(previewRows)).rejects.toThrow(
        /Gagal update NRP 11111: Network connection lost/
      );
    });

    it('mengupdate gaji_pokok dan angsuran_lain_lain ke tabel anggota serta mendukung fallback jika kolom angsuran_lain_lain belum ada', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { update: mockUpdate };
        }
        return {};
      });

      const previewRows = [
        {
          nrp: '95168420',
          gaji_pokok: 6000000,
          angsuran_lain_lain: 'Rp 1.000.000',
          rekening_baru: '1122334455',
        },
      ];

      const success = await applySalaryReconciliation(previewRows);
      expect(success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          master_thp: 6000000,
          take_home_pay: 6000000,
          salary: 6000000,
          angsuran_lain_lain: 1000000,
          bank_account_number: '1122334455',
        })
      );
      expect(mockEq).toHaveBeenCalledWith('nrp', '95168420');
    });

    it('melakukan retry tanpa angsuran_lain_lain jika kolom belum ada di database', async () => {
      let callCount = 0;
      const mockEq = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            error: { message: 'column "angsuran_lain_lain" of relation "anggota" does not exist' },
          });
        }
        return Promise.resolve({ error: null });
      });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { update: mockUpdate };
        }
        return {};
      });

      const success = await applySalaryReconciliation([
        { nrp: '95168420', gaji_pokok: 6000000, angsuran_lain_lain: 1000000 },
      ]);
      expect(success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdate).toHaveBeenLastCalledWith(
        expect.not.objectContaining({
          angsuran_lain_lain: expect.anything(),
        })
      );
    });

    it('mencatat log pembaruan bulanan IMPORT_GAJI_BULANAN ke public.audit_logs setelah berhasil update anggota', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: 'admin-123' } },
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { update: mockUpdate };
        }
        if (table === 'audit_logs') {
          return { insert: mockAuditInsert };
        }
        return {};
      });

      const success = await applySalaryReconciliation([
        { nrp: '95168420', gaji_pokok: 6500000, angsuran_lain_lain: 750000 },
        { nrp: '11223344', gaji_pokok: 5000000, angsuran_lain_lain: 0 },
      ]);

      expect(success).toBe(true);
      expect(mockAuditInsert).toHaveBeenCalledTimes(1);
      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          table_name: 'anggota',
          action: 'IMPORT_GAJI_BULANAN',
          record_id: 'BATCH',
          performed_by: 'admin-123',
          new_data: expect.objectContaining({
            updated_count: 2,
            total_rows: 2,
          }),
        })
      );
    });
  });

  describe('buildSalaryReconciliationWorkbook & downloadSalaryReconciliationTemplate', () => {
    it('menghasilkan workbook 5 kolom baku (NRP, Nama Lengkap, Nomor Rekening, Gaji Pokok, Angsuran Lain-lain) dengan format sel yang benar', () => {
      const workbook = buildSalaryReconciliationWorkbook([
        {
          id: 'm-1',
          nrp: '0095168420',
          nama: 'Agus Susanto',
          bank_account_number: '0011223344',
          master_thp: 6000000,
          take_home_pay: 5500000,
          angsuran_lain_lain: 1000000,
        },
        {
          id: 'm-2',
          nrp: '88776655',
          nama: 'Budi Hartono',
          bank_account_number: null,
          master_thp: null,
          take_home_pay: 4800000,
          angsuran_lain_lain: null,
        },
      ]);

      const ws = workbook.getWorksheet('Template Rekonsiliasi');
      expect(ws).toBeDefined();
      expect(ws!.getRow(1).values).toEqual([
        undefined,
        'NRP',
        'Nama Lengkap',
        'Nomor Rekening',
        'Gaji Pokok',
        'Angsuran Lain-lain',
      ]);

      const row2 = ws!.getRow(2);
      expect(row2.getCell(1).value).toBe('0095168420');
      expect(row2.getCell(2).value).toBe('Agus Susanto');
      expect(row2.getCell(3).value).toBe('0011223344');
      expect(row2.getCell(4).value).toBe(6000000);
      expect(row2.getCell(5).value).toBe(1000000);
      expect(row2.getCell(1).numFmt).toBe('@');
      expect(row2.getCell(3).numFmt).toBe('@');
      expect(row2.getCell(4).numFmt).toBe('#,##0');
      expect(row2.getCell(5).numFmt).toBe('#,##0');

      const row3 = ws!.getRow(3);
      expect(row3.getCell(3).value).toBe('');
      expect(row3.getCell(4).value).toBe(4800000);
      expect(row3.getCell(5).value).toBe(0);
    });

    it('mengambil anggota aktif urut nama ASC dan mengunduh file Template_Rekonsiliasi_YYYY-MM-DD.xlsx', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'm-1',
            nrp: '95168420',
            nama: 'Agus Susanto',
            bank_account_number: '1122334455',
            master_thp: 6000000,
            take_home_pay: 6000000,
            angsuran_lain_lain: 500000,
          },
        ],
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { select: mockSelect };
        }
        return {};
      });

      const originalWindow = (globalThis as any).window;
      const originalDocument = (globalThis as any).document;

      const setAttributeMock = vi.fn();
      const clickMock = vi.fn();
      const removeChildMock = vi.fn();
      const appendChildMock = vi.fn();
      const mockLink = {
        href: '',
        setAttribute: setAttributeMock,
        click: clickMock,
        parentNode: { removeChild: removeChildMock },
      };

      (globalThis as any).window = {
        URL: {
          createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
          revokeObjectURL: vi.fn(),
        },
      };
      (globalThis as any).document = {
        createElement: vi.fn().mockReturnValue(mockLink),
        body: { appendChild: appendChildMock },
      };

      try {
        const result = await downloadSalaryReconciliationTemplate();
        expect(result).toBe(true);
        expect(mockSelect).toHaveBeenCalledWith(
          'id, nrp, nama, bank_account_number, master_thp, take_home_pay, angsuran_lain_lain'
        );
        expect(mockEq).toHaveBeenCalledWith('status', 'aktif');
        expect(mockOrder).toHaveBeenCalledWith('nama', { ascending: true });

        const today = new Date().toISOString().split('T')[0];
        expect(setAttributeMock).toHaveBeenCalledWith(
          'download',
          `Template_Rekonsiliasi_${today}.xlsx`
        );
        expect(clickMock).toHaveBeenCalledTimes(1);
      } finally {
        (globalThis as any).window = originalWindow;
        (globalThis as any).document = originalDocument;
      }
    });
  });

  describe('parseSalaryReconciliationFile', () => {
    it('memparsing template 5 kolom (Gaji Pokok & Angsuran Lain-lain) dan mendukung fallback header lama Take Home Pay (THP)', async () => {
      const mockIn = vi.fn().mockResolvedValue({
        data: [
          { nrp: '95168420', nama: 'Agus Susanto', bank_account_number: '123456' },
        ],
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { select: mockSelect };
        }
        return {};
      });

      // 1. File format 5 kolom baru
      const wbNew = new ExcelJS.Workbook();
      const wsNew = wbNew.addWorksheet('Template Rekonsiliasi');
      wsNew.addRow(['NRP', 'Nama Lengkap', 'Nomor Rekening', 'Gaji Pokok', 'Angsuran Lain-lain']);
      wsNew.addRow(['95168420', 'Agus Susanto', '123456', 6000000, 1000000]);
      const bufNew = await wbNew.xlsx.writeBuffer();
      const fileNew = { arrayBuffer: async () => bufNew } as unknown as File;

      const resNew = await parseSalaryReconciliationFile(fileNew);
      expect(resNew).toHaveLength(1);
      expect(resNew[0]).toMatchObject({
        nrp: '95168420',
        nama: 'Agus Susanto',
        gaji_pokok: 6000000,
        take_home_pay: 6000000,
        angsuran_lain_lain: 1000000,
        status: 'MATCH',
      });

      // 2. File format 4 kolom lama (kompatibilitas mundur)
      const wbOld = new ExcelJS.Workbook();
      const wsOld = wbOld.addWorksheet('Template Rekonsiliasi');
      wsOld.addRow(['NRP', 'Nama Lengkap', 'Nomor Rekening', 'Take Home Pay (THP)']);
      wsOld.addRow(['95168420', 'Agus Susanto', '123456', 'Rp 5.500.000']);
      const bufOld = await wbOld.xlsx.writeBuffer();
      const fileOld = { arrayBuffer: async () => bufOld } as unknown as File;

      const resOld = await parseSalaryReconciliationFile(fileOld);
      expect(resOld).toHaveLength(1);
      expect(resOld[0]).toMatchObject({
        nrp: '95168420',
        gaji_pokok: 5500000,
        take_home_pay: 5500000,
        angsuran_lain_lain: 0,
        status: 'MATCH',
      });

      // 3. Variasi header Angsuran Lain
      const wbAlias = new ExcelJS.Workbook();
      const wsAlias = wbAlias.addWorksheet('Template Rekonsiliasi');
      wsAlias.addRow(['nrp', 'nama', 'no rekening', 'gaji_pokok', 'Angsuran Lain']);
      wsAlias.addRow(['95168420', 'Agus Susanto', '123456', '6.250.000', 'Rp 350.000']);
      const bufAlias = await wbAlias.xlsx.writeBuffer();
      const fileAlias = { arrayBuffer: async () => bufAlias } as unknown as File;

      const resAlias = await parseSalaryReconciliationFile(fileAlias);
      expect(resAlias).toHaveLength(1);
      expect(resAlias[0]).toMatchObject({
        nrp: '95168420',
        gaji_pokok: 6250000,
        angsuran_lain_lain: 350000,
        status: 'MATCH',
      });
    });

    it('mencocokkan NRP numerik 99999999, NRP nol di depan (00050543), serta header Gaji Pokok (Rp) & Angsuran Lain-lain (Rp)', async () => {
      const dbMembers = [
        { nrp: '99999999', nama: 'anggota tes 1', bank_account_number: '112233' },
        { nrp: '00050543', nama: 'Anggota Nol Depan', bank_account_number: '445566' },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((_col: string, nrps: string[]) => {
                const matched = dbMembers.filter((m) => nrps.includes(m.nrp));
                return Promise.resolve({ data: matched, error: null });
              }),
              range: vi.fn().mockResolvedValue({ data: dbMembers, error: null }),
            }),
          };
        }
        return {};
      });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Rekonsiliasi');
      ws.addRow(['NRP', 'Nama Lengkap', 'No. Rekening Bank', 'Gaji Pokok (Rp)', 'Angsuran Lain-lain (Rp)']);
      ws.addRow([99999999, 'anggota tes 1', '112233', 'Rp 4.000.000', '250.000']);
      ws.addRow([50543, 'Anggota Nol Depan', '445566', 5250000, 0]);
      const buf = await wb.xlsx.writeBuffer();
      const file = { arrayBuffer: async () => buf } as unknown as File;

      const res = await parseSalaryReconciliationFile(file);
      expect(res).toHaveLength(2);
      expect(res[0]).toMatchObject({
        nrp: '99999999',
        gaji_pokok: 4000000,
        take_home_pay: 4000000,
        angsuran_lain_lain: 250000,
        status: 'MATCH',
      });
      expect(res[1]).toMatchObject({
        nrp: '00050543',
        gaji_pokok: 5250000,
        take_home_pay: 5250000,
        angsuran_lain_lain: 0,
        status: 'MATCH',
      });
    });
  });

  describe('resolveMemberSalary & multi-column retry in applySalaryReconciliation', () => {
    it('resolveMemberSalary menangani kombinasi master_thp, take_home_pay, string terformat, dan 0', () => {
      expect(resolveMemberSalary({ master_thp: 4000000, take_home_pay: 0 })).toBe(4000000);
      expect(resolveMemberSalary({ master_thp: 0, take_home_pay: 4500000 })).toBe(4500000);
      expect(resolveMemberSalary({ master_thp: 'Rp 4.000.000', take_home_pay: 0 })).toBe(4000000);
      expect(resolveMemberSalary({ master_thp: 0, take_home_pay: 0, salary: 0 })).toBe(0);
      expect(resolveMemberSalary(null)).toBe(0);
    });

    it('applySalaryReconciliation melakukan retry berulang saat salary DAN angsuran_lain_lain keduanya tidak ada di DB', async () => {
      let callCount = 0;
      const mockEq = vi.fn().mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({
            error: { message: 'column "salary" of relation "anggota" does not exist' },
          });
        }
        if (callCount === 2) {
          return Promise.resolve({
            error: { message: 'column "angsuran_lain_lain" of relation "anggota" does not exist' },
          });
        }
        return Promise.resolve({ error: null });
      });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { update: mockUpdate };
        }
        return {};
      });

      const ok = await applySalaryReconciliation([
        {
          nrp: '99999999',
          gaji_pokok: 4000000,
          angsuran_lain_lain: 200000,
        },
      ]);

      expect(ok).toBe(true);
      expect(mockUpdate).toHaveBeenCalledTimes(3);
      expect(mockUpdate).toHaveBeenLastCalledWith({
        master_thp: 4000000,
        take_home_pay: 4000000,
      });
      expect(mockEq).toHaveBeenCalledWith('nrp', '99999999');
    });
  });

  describe('row-by-row & chunked progress callbacks', () => {
    it('parseSalaryReconciliationFile memanggil onProgress secara bertahap per chunk (>20 baris)', async () => {
      const dbMembers = Array.from({ length: 24 }, (_, idx) => ({
        nrp: String(10000 + idx),
        nama: `Anggota ${idx + 1}`,
        bank_account_number: `REK-${idx + 1}`,
      }));

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: dbMembers, error: null }),
              range: vi.fn().mockResolvedValue({ data: dbMembers, error: null }),
            }),
          };
        }
        return {};
      });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Template Rekonsiliasi');
      ws.addRow(['NRP', 'Nama Lengkap', 'Nomor Rekening', 'Gaji Pokok', 'Angsuran Lain-lain']);
      for (let i = 0; i < 25; i++) {
        ws.addRow([String(10000 + i), `Anggota ${i + 1}`, `REK-${i + 1}`, 5000000, 100000]);
      }
      const buf = await wb.xlsx.writeBuffer();
      const file = { arrayBuffer: async () => buf } as unknown as File;

      const progressUpdates: SalaryImportProgress[] = [];
      const results = await parseSalaryReconciliationFile(file, (prog) => {
        progressUpdates.push(prog);
      });

      expect(results).toHaveLength(25);
      // 1 initial + chunk 1 (20) + chunk 2 (5)
      expect(progressUpdates.length).toBeGreaterThanOrEqual(3);
      expect(progressUpdates[0].processed).toBe(0);
      expect(progressUpdates[1]).toMatchObject({
        processed: 20,
        total: 25,
        updatedCount: 20,
        skippedCount: 0,
      });
      expect(progressUpdates[progressUpdates.length - 1]).toMatchObject({
        processed: 25,
        total: 25,
        updatedCount: 24,
        skippedCount: 1,
        currentLabel: 'Anggota 25 (NRP: 10024)',
      });
    });

    it('applySalaryReconciliation memanggil onProgress per baris, melewati NOT_FOUND ke skippedCount, dan tetap mengembalikan true', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          return { update: mockUpdate };
        }
        return {};
      });

      const progressUpdates: SalaryImportProgress[] = [];
      const ok = await applySalaryReconciliation(
        [
          {
            nrp: '10001',
            nama: 'Budi',
            gaji_pokok: 5500000,
            take_home_pay: 5500000,
            angsuran_lain_lain: 200000,
            excel_account_number: '111222',
            db_account_number: '111222',
            status: 'MATCH',
          },
          {
            nrp: '99999',
            nama: 'Tidak Terdaftar',
            gaji_pokok: 4000000,
            take_home_pay: 4000000,
            angsuran_lain_lain: 0,
            excel_account_number: null,
            db_account_number: null,
            status: 'NOT_FOUND',
          },
        ],
        (prog) => progressUpdates.push(prog)
      );

      expect(ok).toBe(true);
      expect(mockEq).toHaveBeenCalledTimes(1);
      expect(mockEq).toHaveBeenCalledWith('nrp', '10001');
      expect(progressUpdates).toHaveLength(3);
      expect(progressUpdates[0]).toMatchObject({
        processed: 0,
        total: 2,
        updatedCount: 0,
        skippedCount: 0,
      });
      expect(progressUpdates[1]).toMatchObject({
        processed: 1,
        total: 2,
        updatedCount: 1,
        skippedCount: 0,
        currentLabel: 'Budi (NRP: 10001)',
      });
      expect(progressUpdates[2]).toMatchObject({
        processed: 2,
        total: 2,
        updatedCount: 1,
        skippedCount: 1,
        currentLabel: 'Tidak Terdaftar (NRP: 99999)',
      });
    });
  });
});

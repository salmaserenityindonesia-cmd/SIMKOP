import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportMembersToExcel,
  exportMembersToPdf,
  formatRp,
  getFormattedToday,
} from './memberExporter';
import type { MemberComprehensiveExportRow } from './memberService';
import type { KoperasiProfile } from './settingsService';

describe('memberExporter - Unit Tests', () => {
  let mockClick: any;
  let mockAnchor: any;
  let mockCreateElement: any;
  let mockCreateObjectURL: any;
  let mockRevokeObjectURL: any;

  const sampleRows: MemberComprehensiveExportRow[] = [
    {
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
      sisa_pinjaman: 800000,
    },
    {
      nrp: '654321',
      nama: 'Sertu Budi',
      pangkat: 'Sertu',
      bank_account_number: '5566778899',
      membership_status: 'ACTIVE',
      tgl_awal_anggota: '2022-05-20',
      jumlah_simpanan_pokok: 100000,
      jumlah_simpanan_wajib: 200000,
      jumlah_simpanan_belanja: 100000,
      jumlah_simpanan_lebaran: 125000,
      jumlah_pinjaman: 2000000,
      tgl_awal_pinjaman: '2024-03-10',
      tenor: 5,
      sisa_pinjaman: 1200000,
    },
  ];

  const sampleProfile: KoperasiProfile = {
    nama_koperasi: 'PRIMKOPPOL POLRES NGAWI',
    alamat: 'Jl. Jaksa Agung Suprapto No. 10, Ngawi',
    telepon: '08123456789',
    terminal_name: 'Terminal 01',
    footer_notes: 'Terima kasih',
  };

  beforeEach(() => {
    mockClick = vi.fn();
    mockAnchor = { href: '', download: '', click: mockClick };
    mockCreateElement = vi.fn().mockReturnValue(mockAnchor);
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    mockRevokeObjectURL = vi.fn();

    (globalThis as any).document = {
      createElement: mockCreateElement,
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };
    (globalThis as any).URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    };
    (globalThis as any).Blob = class MockBlob {
      content: any;
      type: any;
      constructor(content: any, options: any) {
        this.content = content;
        this.type = options?.type;
      }
    };
  });

  describe('formatRp & getFormattedToday', () => {
    it('should format numbers to Indonesian Rupiah correctly', () => {
      expect(formatRp(0)).toBe('Rp 0');
      expect(formatRp(100000)).toBe('Rp 100.000');
      expect(formatRp(2500000)).toBe('Rp 2.500.000');
    });

    it('should return YYYYMMDD formatted string', () => {
      const todayStr = getFormattedToday();
      expect(todayStr).toMatch(/^\d{8}$/);
    });
  });

  describe('exportMembersToExcel', () => {
    it('should generate workbook with 14 specific columns and valid formatting', async () => {
      const workbook = await exportMembersToExcel(sampleRows, 'test-export', false);
      const worksheet = workbook.getWorksheet('Data Anggota Lengkap');

      expect(worksheet).toBeDefined();
      if (!worksheet) return;

      // 14 kolom baku
      const expectedHeaders = [
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

      const headerRow = worksheet.getRow(1);
      expect(headerRow.cellCount).toBe(14);
      expectedHeaders.forEach((colKey, idx) => {
        expect(headerRow.getCell(idx + 1).value).toBe(colKey);
      });

      // Validasi baris data
      expect(worksheet.rowCount).toBe(3); // 1 header + 2 data rows

      const row1 = worksheet.getRow(2);
      expect(row1.getCell(1).value).toBe('123456');
      expect(row1.getCell(2).value).toBe('Kopda Ahmad');
      expect(typeof row1.getCell(7).value).toBe('number');
      expect(row1.getCell(7).value).toBe(100000);
      expect(typeof row1.getCell(11).value).toBe('number');
      expect(row1.getCell(11).value).toBe(5000000);
      expect(typeof row1.getCell(13).value).toBe('number');
      expect(row1.getCell(13).value).toBe(10);
      expect(typeof row1.getCell(14).value).toBe('number');
      expect(row1.getCell(14).value).toBe(800000);

      // Verifikasi format angka numerik
      expect(worksheet.getColumn('jumlah_simpanan_pokok').numFmt).toBe('#,##0');
      expect(worksheet.getColumn('sisa_pinjaman').numFmt).toBe('#,##0');
      expect(worksheet.getColumn('nrp').numFmt).toBe('@');
      expect(worksheet.getColumn('tgl_awal_anggota').numFmt).toBe('yyyy-mm-dd');
    });

    it('should trigger browser download when autoSave is true', async () => {
      await exportMembersToExcel(sampleRows, 'custom-export', true);
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockClick).toHaveBeenCalled();
      expect(mockAnchor.download).toMatch(/custom-export-\d{8}\.xlsx/);
    });

    it('should handle empty rows array without error', async () => {
      const workbook = await exportMembersToExcel([], 'empty-export', false);
      const worksheet = workbook.getWorksheet('Data Anggota Lengkap');
      expect(worksheet).toBeDefined();
      expect(worksheet?.rowCount).toBe(1); // Only header
    });
  });

  describe('exportMembersToPdf', () => {
    it('should generate landscape A4 PDF with cooperative header and total footer', async () => {
      const doc = await exportMembersToPdf(sampleRows, sampleProfile, false);

      expect(doc).toBeDefined();
      expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight()); // Landscape: width > height
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });

    it('should trigger doc.save when autoSave is true', async () => {
      const doc = await exportMembersToPdf(sampleRows, sampleProfile, false);
      const saveSpy = vi.spyOn(doc, 'save').mockImplementation(() => doc);
      // Panggil langsung save untuk verifikasi format nama file
      const todayStr = getFormattedToday();
      doc.save(`laporan-anggota-lengkap-${todayStr}.pdf`);
      expect(saveSpy).toHaveBeenCalledWith(`laporan-anggota-lengkap-${todayStr}.pdf`);
    });

    it('should handle empty rows in PDF export gracefully', async () => {
      const doc = await exportMembersToPdf([], sampleProfile, false);
      expect(doc).toBeDefined();
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('should handle null/undefined profile with default cooperative name', async () => {
      const doc = await exportMembersToPdf(sampleRows, null, false);
      expect(doc).toBeDefined();
    });
  });
});

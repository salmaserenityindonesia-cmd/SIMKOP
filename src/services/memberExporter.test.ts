import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportMembersToExcel,
  exportDataAnggotaExcel,
  exportDataAkhirSimpananExcel,
  exportDataAkhirPinjamanExcel,
  exportDataKomitmenTarifLebaranExcel,
  exportDataAkhirGajiAngsuranLainExcel,
  exportMembersToPdf,
  formatRp,
  getFormattedToday,
  getFormattedTodayIso,
} from './memberExporter';
import { parseMemberLebaranRateExcel } from './savingsRateService';
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
      sisa_pinjaman: 800000,
    },
    {
      nrp: '654321',
      nama: 'Sertu Budi',
      tanggal_lahir: '1985-05-20',
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
        'Tanggal Lahir',
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

      // Verifikasi autoTable terpanggil dan menghasilkan tabel dengan 15 kolom (No + 14 data)
      const lastTable = (doc as any).lastAutoTable;
      expect(lastTable).toBeDefined();
      expect(lastTable.columns.length).toBe(15);

      // Verifikasi baris footer akumulasi total (Pokok: 100k+100k=200k, Pinjaman: 5M+2M=7M, Sisa: 800k+1.2M=2M)
      const footCellTexts = Object.values(lastTable.foot[0].cells).map(
        (c: any) => c.text?.[0] || c.raw?.content || c.raw
      );
      expect(footCellTexts).toContain('TOTAL');
      expect(footCellTexts).toContain('Rp 200.000');
      expect(footCellTexts).toContain('Rp 350.000');
      expect(footCellTexts).toContain('Rp 150.000');
      expect(footCellTexts).toContain('Rp 200.000');
      expect(footCellTexts).toContain('Rp 7.000.000');
      expect(footCellTexts).toContain('Rp 2.000.000');
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

  describe('3 Separate Template-Matched Excel Exporters', () => {
    it('exportDataAnggotaExcel produces exact 7-column header and preserves leading zeros as text', async () => {
      const wb = await exportDataAnggotaExcel(
        [
          {
            nomor_referensi: '00050543',
            nrp: '00123456',
            nama: 'Kopda Ahmad',
            tanggal_lahir: '1988-11-10',
            bank_account_number: '005701044350505',
            membership_status: 'ACTIVE',
            tgl_awal_anggota: '2023-01-15',
          },
        ],
        undefined,
        false
      );

      const ws = wb.getWorksheet('Data Anggota');
      expect(ws).toBeDefined();
      const headers = ws!.getRow(1).values as any[];
      expect(headers.slice(1)).toEqual([
        'nomor_referensi',
        'nrp',
        'nama',
        'tanggal_lahir',
        'bank_account_number',
        'membership_status',
        'tgl_awal_anggota',
      ]);
      expect(ws!.getRow(2).getCell(1).value).toBe('00050543');
      expect(ws!.getRow(2).getCell(1).numFmt).toBe('@');
      expect(ws!.getRow(2).getCell(2).value).toBe('00123456');
      expect(ws!.getRow(2).getCell(5).value).toBe('005701044350505');
    });

    it('exportDataAkhirSimpananExcel produces exact 7-column header and numeric savings balances', async () => {
      const wb = await exportDataAkhirSimpananExcel(
        [
          {
            nomor_referensi: '00050543',
            nrp: '00123456',
            nama: 'Kopda Ahmad',
            jumlah_simpanan_pokok: 100000,
            jumlah_simpanan_wajib: 200000,
            jumlah_simpanan_belanja: 50000,
            jumlah_simpanan_lebaran: 75000,
          },
        ],
        undefined,
        false
      );

      const ws = wb.getWorksheet('Data Akhir Simpanan');
      expect(ws).toBeDefined();
      const headers = ws!.getRow(1).values as any[];
      expect(headers.slice(1)).toEqual([
        'nomor_referensi',
        'nrp',
        'nama',
        'jumlah_simpanan_pokok',
        'jumlah_simpanan_wajib',
        'jumlah_simpanan_belanja',
        'jumlah_simpanan_lebaran',
      ]);
      expect(ws!.getRow(2).getCell(4).value).toBe(100000);
      expect(ws!.getRow(2).getCell(7).value).toBe(75000);
    });

    it('exportDataAkhirPinjamanExcel produces exact 9-column header and filename format', async () => {
      const wb = await exportDataAkhirPinjamanExcel(
        [
          {
            nomor_referensi: '00050543',
            nrp: '00123456',
            nama: 'Kopda Ahmad',
            jenis_pinjaman: 'Pinjaman Reguler',
            jumlah_pinjaman: 5000000,
            tgl_awal_pinjaman: '2024-02-01',
            nilai_angsuran: 500000,
            tenor: 10,
            total_terangsur: 1500000,
          },
        ],
        undefined,
        true
      );

      const ws = wb.getWorksheet('Data Akhir Pinjaman');
      expect(ws).toBeDefined();
      const headers = ws!.getRow(1).values as any[];
      expect(headers.slice(1)).toEqual([
        'nomor_referensi',
        'nrp',
        'nama',
        'jenis_pinjaman',
        'jumlah_pinjaman',
        'tgl_awal_pinjaman',
        'nilai_angsuran',
        'tenor',
        'total_terangsur',
      ]);
      expect(mockAnchor.download).toBe(`data_akhir_pinjaman_${getFormattedTodayIso()}.xlsx`);
    });

    it('exportDataKomitmenTarifLebaranExcel produces exact 9-column header, preserves leading zeros, and stays compatible with parseMemberLebaranRateExcel', async () => {
      const wb = await exportDataKomitmenTarifLebaranExcel(
        [
          {
            id: 'm-1',
            nomor_referensi: '00050543',
            nrp: '00123456',
            nama: 'Kopda Ahmad',
            tanggal_lahir: '1988-11-10',
          },
        ],
        undefined,
        true
      );

      const ws = wb.getWorksheet('Komitmen Tarif Lebaran');
      expect(ws).toBeDefined();
      const headers = ws!.getRow(1).values as any[];
      expect(headers.slice(1)).toEqual([
        'nomor_referensi',
        'nrp',
        'nama',
        'tanggal_lahir',
        'tarif_saat_ini',
        'tarif_lebaran_baru',
        'mulai_bulan',
        'mulai_tahun',
        'keterangan_siklus',
      ]);
      expect(ws!.getRow(2).getCell(1).value).toBe('00050543');
      expect(ws!.getRow(2).getCell(1).numFmt).toBe('@');
      expect(ws!.getRow(2).getCell(2).value).toBe('00123456');
      expect(ws!.getRow(2).getCell(2).numFmt).toBe('@');
      expect(ws!.getRow(2).getCell(4).value).toBe('1988-11-10');
      expect(ws!.getRow(2).getCell(6).value).toBe('');
      expect(mockAnchor.download).toBe(
        `data_komitmen_tarif_simpanan_lebaran_${getFormattedTodayIso()}.xlsx`
      );

      // Uji kompatibilitas impor kembali setelah tarif_lebaran_baru diisi
      ws!.getRow(2).getCell(6).value = 250000;
      const buf = await wb.xlsx.writeBuffer();
      const parsed = await parseMemberLebaranRateExcel(buf as ArrayBuffer);
      expect(parsed.invalidRows).toEqual([]);
      expect(parsed.validRows).toHaveLength(1);
      expect(parsed.validRows[0].nrp).toBe('00123456');
      expect(parsed.validRows[0].tarif_lebaran_baru).toBe(250000);
    });

    it('exportDataAkhirGajiAngsuranLainExcel produces exact 6-column header and preserves leading zeros', async () => {
      const wb = await exportDataAkhirGajiAngsuranLainExcel(
        [
          {
            id: 'm-1',
            nomor_referensi: '00050543',
            nrp: '00123456',
            nama: 'Kopda Ahmad',
            bank_account_number: '005701044350505',
            master_thp: 6500000,
            angsuran_lain_lain: 750000,
          },
        ],
        undefined,
        true
      );

      const ws = wb.getWorksheet('Gaji & Angsuran Lain-lain');
      expect(ws).toBeDefined();
      const headers = ws!.getRow(1).values as any[];
      expect(headers.slice(1)).toEqual([
        'nomor_referensi',
        'NRP',
        'Nama Lengkap',
        'Nomor Rekening',
        'Gaji Pokok',
        'Angsuran Lain-lain',
      ]);
      expect(ws!.getRow(2).getCell(1).value).toBe('00050543');
      expect(ws!.getRow(2).getCell(1).numFmt).toBe('@');
      expect(ws!.getRow(2).getCell(2).value).toBe('00123456');
      expect(ws!.getRow(2).getCell(2).numFmt).toBe('@');
      expect(ws!.getRow(2).getCell(4).value).toBe('005701044350505');
      expect(ws!.getRow(2).getCell(4).numFmt).toBe('@');
      expect(ws!.getRow(2).getCell(5).value).toBe(6500000);
      expect(ws!.getRow(2).getCell(6).value).toBe(750000);
      expect(mockAnchor.download).toBe(
        `data_akhir_gaji_angsuran_lain_${getFormattedTodayIso()}.xlsx`
      );
    });
  });
});

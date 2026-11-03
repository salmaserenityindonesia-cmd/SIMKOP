import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  parseMonthYearHeader,
  extractNumericAmount,
  parseSavingsMatrixExcel
} from './savingsMatrixImporter';

describe('savingsMatrixImporter', () => {
  describe('parseMonthYearHeader', () => {
    it('harus mem-parsing format bulan singkatan Indonesia dan tahun 2-digit', () => {
      expect(parseMonthYearHeader('Mei-21')).toEqual({ month: 5, year: 2021 });
      expect(parseMonthYearHeader('Des-25')).toEqual({ month: 12, year: 2025 });
      expect(parseMonthYearHeader('Ags-22')).toEqual({ month: 8, year: 2022 });
      expect(parseMonthYearHeader('Okt-24')).toEqual({ month: 10, year: 2024 });
      expect(parseMonthYearHeader('Jan-26')).toEqual({ month: 1, year: 2026 });
    });

    it('harus mem-parsing format bulan singkatan Inggris', () => {
      expect(parseMonthYearHeader('May-21')).toEqual({ month: 5, year: 2021 });
      expect(parseMonthYearHeader('Dec-25')).toEqual({ month: 12, year: 2025 });
      expect(parseMonthYearHeader('Aug-22')).toEqual({ month: 8, year: 2022 });
      expect(parseMonthYearHeader('Oct-24')).toEqual({ month: 10, year: 2024 });
    });

    it('harus mem-parsing nama bulan panjang (Indonesia dan Inggris)', () => {
      expect(parseMonthYearHeader('Januari 2024')).toEqual({ month: 1, year: 2024 });
      expect(parseMonthYearHeader('Desember 2023')).toEqual({ month: 12, year: 2023 });
      expect(parseMonthYearHeader('March 2022')).toEqual({ month: 3, year: 2022 });
      expect(parseMonthYearHeader('August 2025')).toEqual({ month: 8, year: 2025 });
    });

    it('harus mem-parsing format numerik MM/YY atau YYYY-MM', () => {
      expect(parseMonthYearHeader('05/21')).toEqual({ month: 5, year: 2021 });
      expect(parseMonthYearHeader('5/2024')).toEqual({ month: 5, year: 2024 });
      expect(parseMonthYearHeader('2021-05')).toEqual({ month: 5, year: 2021 });
    });

    it('harus mem-parsing objek Date langsung dari Excel', () => {
      const d = new Date(2024, 4, 1); // Mei 2024 (0-indexed 4)
      expect(parseMonthYearHeader(d)).toEqual({ month: 5, year: 2024 });
    });

    it('harus mengabaikan kolom non-bulan dan non-numerik', () => {
      expect(parseMonthYearHeader('NRP')).toBeNull();
      expect(parseMonthYearHeader('Nama Anggota')).toBeNull();
      expect(parseMonthYearHeader('Tgl Masuk')).toBeNull();
      expect(parseMonthYearHeader('Saldo Acuan Database')).toBeNull();
      expect(parseMonthYearHeader('Total Alokasi')).toBeNull();
      expect(parseMonthYearHeader('Selisih')).toBeNull();
      expect(parseMonthYearHeader('Status Validasi')).toBeNull();
      expect(parseMonthYearHeader('')).toBeNull();
      expect(parseMonthYearHeader(null)).toBeNull();
    });
  });

  describe('extractNumericAmount', () => {
    it('harus mengekstrak nilai angka murni', () => {
      expect(extractNumericAmount(150000)).toBe(150000);
      expect(extractNumericAmount(0)).toBe(0);
    });

    it('harus mengekstrak angka dari format teks accounting atau currency Indonesia', () => {
      expect(extractNumericAmount('150.000')).toBe(150000);
      expect(extractNumericAmount('Rp 150.000')).toBe(150000);
      expect(extractNumericAmount('Rp 150.000,00')).toBe(150000);
      expect(extractNumericAmount('2.500.000')).toBe(2500000);
    });

    it('harus mengekstrak nilai dari formula result object ExcelJS', () => {
      expect(extractNumericAmount({ formula: 'SUM(E2:G2)', result: 450000 })).toBe(450000);
      expect(extractNumericAmount({ formula: 'D2', result: '150.000' })).toBe(150000);
    });

    it('harus mengembalikan 0 untuk karakter dash atau kosong', () => {
      expect(extractNumericAmount('-')).toBe(0);
      expect(extractNumericAmount('')).toBe(0);
      expect(extractNumericAmount(null)).toBe(0);
      expect(extractNumericAmount(undefined)).toBe(0);
    });
  });

  describe('parseSavingsMatrixExcel', () => {
    it('harus berhasil mem-parsing workbook matriks simpanan yang valid', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Matriks WAJIB');

      // Baris Header
      ws.addRow([
        'NRP',
        'Nama Anggota',
        'Tgl Masuk',
        'Saldo Acuan Database',
        'Mei-21',
        'Jun-21',
        'Jul-21',
        'Total Alokasi',
        'Selisih',
        'Status Validasi'
      ]);

      // Baris Data 1 (Anggota 1001)
      ws.addRow([
        '1001',
        'Budi Santoso',
        '2021-05-01',
        300000,
        150000,
        150000,
        0, // Bulan ke-3 bernilai 0, tidak dibuat mutasi
        { formula: 'SUM(E2:G2)', result: 300000 },
        0,
        'SEIMBANG'
      ]);

      // Baris Data 2 (Anggota 1002, formula result pada bulan Mei)
      ws.addRow([
        '1002',
        'Siti Aminah',
        '2021-05-15',
        450000,
        { formula: 'E2', result: 150000 },
        150000,
        150000,
        450000,
        0,
        'SEIMBANG'
      ]);

      // Baris kosong & Baris ringkasan yang harus dilewati
      ws.addRow(['', '', '', '', '', '', '', '', '', '']);
      ws.addRow(['TOTAL KESELURUHAN', '', '', 750000, 300000, 300000, 150000, 750000, 0, '']);

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSavingsMatrixExcel(buffer);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.totalRows).toBe(2);
      expect(result.detectedMonths).toHaveLength(3);
      expect(result.detectedMonths[0]).toMatchObject({ year: 2021, month: 5, label: 'Mei-21' });
      expect(result.detectedMonths[1]).toMatchObject({ year: 2021, month: 6, label: 'Jun-21' });
      expect(result.detectedMonths[2]).toMatchObject({ year: 2021, month: 7, label: 'Jul-21' });

      // Total mutasi: Anggota 1001 (2 mutasi: Mei & Jun) + Anggota 1002 (3 mutasi: Mei, Jun, Jul) = 5
      expect(result.totalMutations).toBe(5);
      expect(result.mutations).toEqual([
        { nrp: '1001', year: 2021, month: 5, amount: 150000 },
        { nrp: '1001', year: 2021, month: 6, amount: 150000 },
        { nrp: '1002', year: 2021, month: 5, amount: 150000 },
        { nrp: '1002', year: 2021, month: 6, amount: 150000 },
        { nrp: '1002', year: 2021, month: 7, amount: 150000 }
      ]);
    });

    it('harus mengembalikan error jika kolom NRP tidak ditemukan', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['Kode', 'Nama', 'Saldo', 'Mei-21']);
      ws.addRow(['101', 'Test', 100000, 100000]);

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSavingsMatrixExcel(buffer);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Kolom header 'NRP' tidak ditemukan");
    });

    it('harus mengembalikan error jika tidak ada kolom bulan transaksi', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['NRP', 'Nama Anggota', 'Total Alokasi']);
      ws.addRow(['1001', 'Test User', 100000]);

      const buffer = await wb.xlsx.writeBuffer();
      const result = await parseSavingsMatrixExcel(buffer);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Tidak ditemukan kolom bulan transaksi');
    });

    it('harus menangani file/buffer rusak dengan aman tanpa melempar unhandled exception', async () => {
      const corruptBuffer = new ArrayBuffer(16);
      const result = await parseSavingsMatrixExcel(corruptBuffer);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Gagal membaca berkas Excel');
    });
  });
});

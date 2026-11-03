import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseMemberExcel } from './memberExcelParser';

describe('memberExcelParser', () => {
  it('harus mem-parsing file excel anggota dengan format standar dan alias kolom', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Anggota');

    worksheet.columns = [
      { header: 'No. Anggota', key: 'nrp', width: 15 },
      { header: 'Nama Lengkap', key: 'nama', width: 25 },
      { header: 'Pangkat', key: 'pangkat', width: 15 },
      { header: 'Nomor Rekening', key: 'rek', width: 20 },
      { header: 'Status Anggota', key: 'status', width: 15 },
      { header: 'Tanggal Masuk', key: 'tgl', width: 15 },
      { header: 'Simpanan Pokok', key: 'pokok', width: 15 },
      { header: 'Simpanan Wajib', key: 'wajib', width: 15 },
      { header: 'Simpanan Belanja', key: 'belanja', width: 15 },
      { header: 'Simpanan Hari Raya', key: 'lebaran', width: 15 },
      { header: 'Total Pinjaman', key: 'pinjaman', width: 15 },
      { header: 'Tanggal Pinjam', key: 'tgl_pinj', width: 15 },
      { header: 'Tenor', key: 'tenor', width: 10 },
      { header: 'Sisa Pokok', key: 'sisa', width: 15 },
    ];

    worksheet.addRow({
      nrp: '123456',
      nama: 'Ahmad Dahlan',
      pangkat: 'Bripda',
      rek: '5566778899',
      status: 'ACTIVE',
      tgl: '2023-01-15',
      pokok: '100.000',
      wajib: '2.500.000,00',
      belanja: 500000,
      lebaran: 300000,
      pinjaman: '10.000.000',
      tgl_pinj: '2023-06-01',
      tenor: 12,
      sisa: '5.000.000',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await parseMemberExcel(buffer as ArrayBuffer);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    expect(row.nrp).toBe('123456');
    expect(row.nama).toBe('Ahmad Dahlan');
    expect(row.pangkat).toBe('Bripda');
    expect(row.bank_account_number).toBe('5566778899');
    expect(row.membership_status).toBe('ACTIVE');
    expect(row.tgl_awal_anggota).toBe('2023-01-15');
    expect(row.jumlah_simpanan_pokok).toBe(100000);
    expect(row.jumlah_simpanan_wajib).toBe(2500000);
    expect(row.jumlah_simpanan_belanja).toBe(500000);
    expect(row.jumlah_simpanan_lebaran).toBe(300000);
    expect(row.jumlah_pinjaman).toBe(10000000);
    expect(row.sisa_pinjaman).toBe(5000000);
    expect(row.tenor).toBe(12);
  });

  it('harus mendeteksi baris dengan NRP atau Nama kosong sebagai error', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    worksheet.columns = [
      { header: 'nrp', key: 'nrp' },
      { header: 'nama', key: 'nama' },
    ];

    worksheet.addRow({ nrp: '', nama: 'Tanpa NRP' });
    worksheet.addRow({ nrp: '998877', nama: '' });

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await parseMemberExcel(buffer as ArrayBuffer);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain('Baris 2: NRP dan Nama wajib diisi');
    expect(result.errors[1]).toContain('Baris 3: NRP dan Nama wajib diisi');
  });

  it('harus melempar error jika kolom minimal (nrp dan nama) tidak ditemukan', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    worksheet.columns = [{ header: 'alamat', key: 'alamat' }];
    worksheet.addRow({ alamat: 'Jl. Merdeka' });

    const buffer = await workbook.xlsx.writeBuffer();
    await expect(parseMemberExcel(buffer as ArrayBuffer)).rejects.toThrow(
      'Format kolom Excel tidak valid'
    );
  });
});


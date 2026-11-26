import ExcelJS from 'exceljs';
import type {
  MemberComprehensiveExportRow,
  MemberTemplateDataAnggotaRow,
  MemberTemplateDataAkhirSimpananRow,
  MemberTemplateDataAkhirPinjamanRow,
} from './memberService';
import { formatTanggalLahirWithAge } from '../utils/dateUtils';
import {
  getMemberLebaranRates,
  loadSavingsRateConfig,
  resolveDefaultLebaranCyclePeriod,
  resolveMemberSavingsRate,
  type ResolveMemberSavingsRateContext,
} from './savingsRateService';
import { getLastCompletedLebaranCycle } from './bulkWithdrawalService';

/**
 * Format angka nominal ke format mata uang Rupiah
 */
export const formatRp = (n: number = 0): string =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

/**
 * Mendapatkan string tanggal hari ini dalam format YYYYMMDD
 */
export function getFormattedToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Mendapatkan string tanggal hari ini dalam format YYYY-MM-DD
 */
export function getFormattedTodayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function saveWorkbookToBrowser(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    const buf = await workbook.xlsx.writeBuffer();
    if (typeof URL !== 'undefined' && URL.createObjectURL && typeof Blob !== 'undefined') {
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body?.appendChild?.(a);
      a.click();
      document.body?.removeChild?.(a);
      URL.revokeObjectURL?.(url);
    }
  } catch (err) {
    console.warn('Gagal memicu unduhan Excel di browser:', err);
  }
}

interface TemplateSheetColumn {
  header: string;
  key: string;
  width: number;
  numFmt: string;
  align: 'left' | 'center' | 'right';
}

async function buildTemplateExcelWorkbook<T extends Record<string, any>>(
  sheetName: string,
  columns: TemplateSheetColumn[],
  rows: T[],
  filename: string,
  autoSave = true
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMKOP Enterprise';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  columns.forEach((c) => {
    const col = worksheet.getColumn(c.key);
    if (col) col.numFmt = c.numFmt;
  });

  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF334155' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  rows.forEach((r) => {
    const rowData: Record<string, any> = {};
    columns.forEach((c) => {
      rowData[c.key] = r[c.key];
    });
    const row = worksheet.addRow(rowData);
    row.height = 20;
    row.font = { name: 'Calibri', size: 9 };

    columns.forEach((c) => {
      const cell = row.getCell(c.key);
      cell.alignment = { horizontal: c.align, vertical: 'middle' };
      if (c.numFmt === '@') {
        cell.numFmt = '@';
      }
    });

    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  if (autoSave) {
    await saveWorkbookToBrowser(workbook, filename);
  }

  return workbook;
}

/**
 * Ekspor File 1: Data Anggota (7 kolom sesuai template impor Data Anggota).
 */
export async function exportDataAnggotaExcel(
  rows: MemberTemplateDataAnggotaRow[],
  filename?: string,
  autoSave = true
): Promise<ExcelJS.Workbook> {
  const columns: TemplateSheetColumn[] = [
    { header: 'nomor_referensi', key: 'nomor_referensi', width: 20, numFmt: '@', align: 'center' },
    { header: 'nrp', key: 'nrp', width: 16, numFmt: '@', align: 'center' },
    { header: 'nama', key: 'nama', width: 28, numFmt: '@', align: 'left' },
    { header: 'tanggal_lahir', key: 'tanggal_lahir', width: 16, numFmt: '@', align: 'center' },
    { header: 'bank_account_number', key: 'bank_account_number', width: 22, numFmt: '@', align: 'center' },
    { header: 'membership_status', key: 'membership_status', width: 18, numFmt: '@', align: 'center' },
    { header: 'tgl_awal_anggota', key: 'tgl_awal_anggota', width: 18, numFmt: '@', align: 'center' },
  ];

  const mapped = rows.map((r) => ({
    nomor_referensi: String(r.nomor_referensi ?? ''),
    nrp: String(r.nrp ?? ''),
    nama: String(r.nama ?? ''),
    tanggal_lahir: String(r.tanggal_lahir ?? '').slice(0, 10),
    bank_account_number: String(r.bank_account_number ?? ''),
    membership_status: String(r.membership_status || 'ACTIVE'),
    tgl_awal_anggota: String(r.tgl_awal_anggota ?? '').slice(0, 10),
  }));

  const targetFilename = filename || `data_anggota_${getFormattedTodayIso()}.xlsx`;
  return buildTemplateExcelWorkbook('Data Anggota', columns, mapped, targetFilename, autoSave);
}

/**
 * Ekspor File 2: Data Akhir Simpanan (7 kolom sesuai template impor Simpanan + nomor_referensi).
 */
export async function exportDataAkhirSimpananExcel(
  rows: MemberTemplateDataAkhirSimpananRow[],
  filename?: string,
  autoSave = true
): Promise<ExcelJS.Workbook> {
  const columns: TemplateSheetColumn[] = [
    { header: 'nomor_referensi', key: 'nomor_referensi', width: 20, numFmt: '@', align: 'center' },
    { header: 'nrp', key: 'nrp', width: 16, numFmt: '@', align: 'center' },
    { header: 'nama', key: 'nama', width: 28, numFmt: '@', align: 'left' },
    { header: 'jumlah_simpanan_pokok', key: 'jumlah_simpanan_pokok', width: 22, numFmt: '#,##0', align: 'right' },
    { header: 'jumlah_simpanan_wajib', key: 'jumlah_simpanan_wajib', width: 22, numFmt: '#,##0', align: 'right' },
    { header: 'jumlah_simpanan_belanja', key: 'jumlah_simpanan_belanja', width: 24, numFmt: '#,##0', align: 'right' },
    { header: 'jumlah_simpanan_lebaran', key: 'jumlah_simpanan_lebaran', width: 24, numFmt: '#,##0', align: 'right' },
  ];

  const mapped = rows.map((r) => ({
    nomor_referensi: String(r.nomor_referensi ?? ''),
    nrp: String(r.nrp ?? ''),
    nama: String(r.nama ?? ''),
    jumlah_simpanan_pokok: Number(r.jumlah_simpanan_pokok) || 0,
    jumlah_simpanan_wajib: Number(r.jumlah_simpanan_wajib) || 0,
    jumlah_simpanan_belanja: Number(r.jumlah_simpanan_belanja) || 0,
    jumlah_simpanan_lebaran: Number(r.jumlah_simpanan_lebaran) || 0,
  }));

  const targetFilename = filename || `data_akhir_simpanan_${getFormattedTodayIso()}.xlsx`;
  return buildTemplateExcelWorkbook('Data Akhir Simpanan', columns, mapped, targetFilename, autoSave);
}

/**
 * Ekspor File 3: Data Akhir Pinjaman (9 kolom sesuai template impor Pinjaman + nomor_referensi).
 */
export async function exportDataAkhirPinjamanExcel(
  rows: MemberTemplateDataAkhirPinjamanRow[],
  filename?: string,
  autoSave = true
): Promise<ExcelJS.Workbook> {
  const columns: TemplateSheetColumn[] = [
    { header: 'nomor_referensi', key: 'nomor_referensi', width: 20, numFmt: '@', align: 'center' },
    { header: 'nrp', key: 'nrp', width: 16, numFmt: '@', align: 'center' },
    { header: 'nama', key: 'nama', width: 28, numFmt: '@', align: 'left' },
    { header: 'jenis_pinjaman', key: 'jenis_pinjaman', width: 20, numFmt: '@', align: 'center' },
    { header: 'jumlah_pinjaman', key: 'jumlah_pinjaman', width: 18, numFmt: '#,##0', align: 'right' },
    { header: 'tgl_awal_pinjaman', key: 'tgl_awal_pinjaman', width: 18, numFmt: '@', align: 'center' },
    { header: 'nilai_angsuran', key: 'nilai_angsuran', width: 18, numFmt: '#,##0', align: 'right' },
    { header: 'tenor', key: 'tenor', width: 12, numFmt: '#,##0', align: 'center' },
    { header: 'total_terangsur', key: 'total_terangsur', width: 18, numFmt: '#,##0', align: 'right' },
  ];

  const mapped = rows.map((r) => ({
    nomor_referensi: String(r.nomor_referensi ?? ''),
    nrp: String(r.nrp ?? ''),
    nama: String(r.nama ?? ''),
    jenis_pinjaman: String(r.jenis_pinjaman || '-'),
    jumlah_pinjaman: Number(r.jumlah_pinjaman) || 0,
    tgl_awal_pinjaman: String(r.tgl_awal_pinjaman ?? '').slice(0, 10),
    nilai_angsuran: Number(r.nilai_angsuran) || 0,
    tenor: Number(r.tenor) || 0,
    total_terangsur: Number(r.total_terangsur) || 0,
  }));

  const targetFilename = filename || `data_akhir_pinjaman_${getFormattedTodayIso()}.xlsx`;
  return buildTemplateExcelWorkbook('Data Akhir Pinjaman', columns, mapped, targetFilename, autoSave);
}

/**
 * Ekspor File 4: Data Komitmen Tarif Simpanan Lebaran (9 kolom).
 * Kompatibel dengan parser impor massal Tarif Lebaran di /admin/pengaturan.
 */
export async function exportDataKomitmenTarifLebaranExcel(
  members: any[],
  filename?: string,
  autoSave = true
): Promise<ExcelJS.Workbook> {
  const [resolver, personalRates, lastCycle] = await Promise.all([
    loadSavingsRateConfig(true),
    getMemberLebaranRates(undefined, true),
    getLastCompletedLebaranCycle().catch(() => null),
  ]);

  const {
    year: defaultYear,
    month: defaultMonth,
    cycleLabel: defaultCycleLabel,
  } = resolveDefaultLebaranCyclePeriod(
    lastCycle?.disbursement_date || lastCycle?.cut_off_date || null
  );

  const context: ResolveMemberSavingsRateContext = {
    globalTiers: resolver.tiers,
    depositTypes: resolver.depositTypes,
    memberLebaranRates: personalRates,
  };

  const sortedMembers = [...(members || [])].sort((a, b) =>
    String(a?.nama ?? '').localeCompare(String(b?.nama ?? ''), 'id')
  );

  const columns: TemplateSheetColumn[] = [
    { header: 'nomor_referensi', key: 'nomor_referensi', width: 20, numFmt: '@', align: 'center' },
    { header: 'nrp', key: 'nrp', width: 16, numFmt: '@', align: 'center' },
    { header: 'nama', key: 'nama', width: 28, numFmt: '@', align: 'left' },
    { header: 'tanggal_lahir', key: 'tanggal_lahir', width: 16, numFmt: '@', align: 'center' },
    { header: 'tarif_saat_ini', key: 'tarif_saat_ini', width: 18, numFmt: '#,##0', align: 'right' },
    { header: 'tarif_lebaran_baru', key: 'tarif_lebaran_baru', width: 20, numFmt: '#,##0', align: 'right' },
    { header: 'mulai_bulan', key: 'mulai_bulan', width: 14, numFmt: '0', align: 'center' },
    { header: 'mulai_tahun', key: 'mulai_tahun', width: 14, numFmt: '0', align: 'center' },
    { header: 'keterangan_siklus', key: 'keterangan_siklus', width: 28, numFmt: '@', align: 'left' },
  ];

  const mapped = sortedMembers.map((m) => {
    const currentRate = resolveMemberSavingsRate(
      m?.id,
      'LEBARAN',
      defaultYear,
      defaultMonth,
      context
    );
    return {
      nomor_referensi: String(m?.nomor_referensi ?? ''),
      nrp: String(m?.nrp ?? ''),
      nama: String(m?.nama ?? ''),
      tanggal_lahir: String(m?.tanggal_lahir || m?.birth_date || '').slice(0, 10),
      tarif_saat_ini: Number(currentRate) || 0,
      tarif_lebaran_baru: '',
      mulai_bulan: defaultMonth,
      mulai_tahun: defaultYear,
      keterangan_siklus: defaultCycleLabel,
    };
  });

  const targetFilename =
    filename || `data_komitmen_tarif_simpanan_lebaran_${getFormattedTodayIso()}.xlsx`;
  return buildTemplateExcelWorkbook(
    'Komitmen Tarif Lebaran',
    columns,
    mapped,
    targetFilename,
    autoSave
  );
}

/**
 * Ekspor File 5: Data Akhir Gaji & Angsuran Lain-lain (6 kolom).
 * Kompatibel dengan parser impor rekonsiliasi gaji di /admin/import-gaji.
 */
export async function exportDataAkhirGajiAngsuranLainExcel(
  members: any[],
  filename?: string,
  autoSave = true
): Promise<ExcelJS.Workbook> {
  const sortedMembers = [...(members || [])].sort((a, b) =>
    String(a?.nama ?? '').localeCompare(String(b?.nama ?? ''), 'id')
  );

  const columns: TemplateSheetColumn[] = [
    { header: 'nomor_referensi', key: 'nomor_referensi', width: 20, numFmt: '@', align: 'center' },
    { header: 'NRP', key: 'nrp', width: 16, numFmt: '@', align: 'center' },
    { header: 'Nama Lengkap', key: 'nama_lengkap', width: 30, numFmt: '@', align: 'left' },
    { header: 'Nomor Rekening', key: 'nomor_rekening', width: 24, numFmt: '@', align: 'center' },
    { header: 'Gaji Pokok', key: 'gaji_pokok', width: 20, numFmt: '#,##0', align: 'right' },
    { header: 'Angsuran Lain-lain', key: 'angsuran_lain_lain', width: 22, numFmt: '#,##0', align: 'right' },
  ];

  const mapped = sortedMembers.map((m) => ({
    nomor_referensi: String(m?.nomor_referensi ?? ''),
    nrp: String(m?.nrp ?? ''),
    nama_lengkap: String(m?.nama ?? ''),
    nomor_rekening: String(m?.bank_account_number ?? ''),
    gaji_pokok: Number(m?.master_thp ?? m?.take_home_pay ?? 0) || 0,
    angsuran_lain_lain: Number(m?.angsuran_lain_lain ?? 0) || 0,
  }));

  const targetFilename =
    filename || `data_akhir_gaji_angsuran_lain_${getFormattedTodayIso()}.xlsx`;
  return buildTemplateExcelWorkbook(
    'Gaji & Angsuran Lain-lain',
    columns,
    mapped,
    targetFilename,
    autoSave
  );
}

/**
 * Mengekspor data komprehensif anggota ke format file Excel (.xlsx) dengan 14 kolom baku.
 * Header dan kolom identik dengan skema template migrasi anggota untuk integritas dua arah.
 *
 * @param rows Daftar baris data komprehensif anggota
 * @param filenamePrefix Prefiks opsional untuk nama berkas (default: 'laporan-anggota-lengkap')
 * @param autoSave Apakah otomatis memicu pengunduhan berkas di browser (default: true)
 */
export async function exportMembersToExcel(
  rows: MemberComprehensiveExportRow[],
  filenamePrefix?: string,
  autoSave = true
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMKOP Enterprise';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Data Anggota Lengkap');

  // 14 Kolom baku sesuai skema template migrasi anggota
  worksheet.columns = [
    { header: 'nrp', key: 'nrp', width: 16 },
    { header: 'nama', key: 'nama', width: 28 },
    { header: 'Tanggal Lahir', key: 'tanggal_lahir', width: 22 },
    { header: 'bank_account_number', key: 'bank_account_number', width: 22 },
    { header: 'membership_status', key: 'membership_status', width: 18 },
    { header: 'tgl_awal_anggota', key: 'tgl_awal_anggota', width: 16 },
    { header: 'jumlah_simpanan_pokok', key: 'jumlah_simpanan_pokok', width: 22 },
    { header: 'jumlah_simpanan_wajib', key: 'jumlah_simpanan_wajib', width: 22 },
    { header: 'jumlah_simpanan_belanja', key: 'jumlah_simpanan_belanja', width: 22 },
    { header: 'jumlah_simpanan_lebaran', key: 'jumlah_simpanan_lebaran', width: 22 },
    { header: 'jumlah_pinjaman', key: 'jumlah_pinjaman', width: 18 },
    { header: 'tgl_awal_pinjaman', key: 'tgl_awal_pinjaman', width: 18 },
    { header: 'tenor', key: 'tenor', width: 12 },
    { header: 'sisa_pinjaman', key: 'sisa_pinjaman', width: 18 },
  ];

  // Format kolom teks dengan format text '@'
  ['nrp', 'nama', 'tanggal_lahir', 'bank_account_number', 'membership_status'].forEach((k) => {
    const col = worksheet.getColumn(k);
    if (col) col.numFmt = '@';
  });

  // Format kolom tanggal dengan format 'yyyy-mm-dd'
  ['tgl_awal_anggota', 'tgl_awal_pinjaman'].forEach((k) => {
    const col = worksheet.getColumn(k);
    if (col) col.numFmt = 'yyyy-mm-dd';
  });

  // Format kolom nominal numerik dengan format angka '#,##0'
  [
    'jumlah_simpanan_pokok',
    'jumlah_simpanan_wajib',
    'jumlah_simpanan_belanja',
    'jumlah_simpanan_lebaran',
    'jumlah_pinjaman',
    'sisa_pinjaman',
  ].forEach((k) => {
    const col = worksheet.getColumn(k);
    if (col) col.numFmt = '#,##0';
  });

  // Format tenor dengan format angka '#,##0'
  const tenorCol = worksheet.getColumn('tenor');
  if (tenorCol) tenorCol.numFmt = '#,##0';

  // Format header baris pertama dengan tema warna SIMKOP (latar abu/slate, teks tebal)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF334155' }, // Slate 700
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Isi data per baris
  rows.forEach((r) => {
    const row = worksheet.addRow({
      nrp: r.nrp || '',
      nama: r.nama || '',
      tanggal_lahir: formatTanggalLahirWithAge(r.tanggal_lahir),
      bank_account_number: r.bank_account_number || '',
      membership_status: r.membership_status || '',
      tgl_awal_anggota: r.tgl_awal_anggota || '',
      jumlah_simpanan_pokok: Number(r.jumlah_simpanan_pokok) || 0,
      jumlah_simpanan_wajib: Number(r.jumlah_simpanan_wajib) || 0,
      jumlah_simpanan_belanja: Number(r.jumlah_simpanan_belanja) || 0,
      jumlah_simpanan_lebaran: Number(r.jumlah_simpanan_lebaran) || 0,
      jumlah_pinjaman: Number(r.jumlah_pinjaman) || 0,
      tgl_awal_pinjaman: r.tgl_awal_pinjaman || '',
      tenor: Number(r.tenor) || 0,
      sisa_pinjaman: Number(r.sisa_pinjaman) || 0,
    });

    row.height = 20;
    row.font = { name: 'Calibri', size: 9 };

    row.getCell('nrp').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('nama').alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell('tanggal_lahir').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('bank_account_number').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('membership_status').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('tgl_awal_anggota').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('jumlah_simpanan_pokok').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('jumlah_simpanan_wajib').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('jumlah_simpanan_belanja').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('jumlah_simpanan_lebaran').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('jumlah_pinjaman').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('tgl_awal_pinjaman').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('tenor').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('sisa_pinjaman').alignment = { horizontal: 'right', vertical: 'middle' };

    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Tentukan nama berkas unduhan
  const filename = filenamePrefix
    ? filenamePrefix.endsWith('.xlsx')
      ? filenamePrefix
      : `${filenamePrefix}-${getFormattedToday()}.xlsx`
    : `laporan-anggota-lengkap-${getFormattedToday()}.xlsx`;

  // Trigger unduhan di browser jika autoSave diaktifkan
  if (autoSave && typeof document !== 'undefined') {
    try {
      const buf = await workbook.xlsx.writeBuffer();
      if (typeof URL !== 'undefined' && URL.createObjectURL && typeof Blob !== 'undefined') {
        const blob = new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body?.appendChild?.(a);
        a.click();
        document.body?.removeChild?.(a);
        URL.revokeObjectURL?.(url);
      }
    } catch (err) {
      console.warn('Gagal memicu unduhan Excel di browser:', err);
    }
  }

  return workbook;
}

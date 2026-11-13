import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import { parseAmount } from './memberMigrationParser';

export const INITIAL_SAVINGS_TEMPLATE_FILENAME = 'template_saldo_awal_simpanan.xlsx';

export const INITIAL_SAVINGS_HEADERS = [
  'nrp',
  'nama',
  'jumlah_simpanan_pokok',
  'jumlah_simpanan_wajib',
  'jumlah_simpanan_belanja',
  'jumlah_simpanan_lebaran',
] as const;

export interface InitialSavingsRow {
  nrp: string;
  nama: string;
  jumlah_simpanan_pokok: number;
  jumlah_simpanan_wajib: number;
  jumlah_simpanan_belanja: number;
  jumlah_simpanan_lebaran: number;
}

export interface InitialSavingsTemplateMember {
  nrp?: string | null;
  nama?: string | null;
  status?: string | null;
  membership_status?: string | null;
}

/**
 * Membangun workbook Excel template 6 kolom Saldo Awal Simpanan.
 * Jika daftar anggota tidak disediakan, mencoba mengambil anggota aktif dari database.
 */
export async function buildInitialSavingsTemplateWorkbook(
  members?: InitialSavingsTemplateMember[]
): Promise<ExcelJS.Workbook> {
  let targetMembers: InitialSavingsTemplateMember[] = Array.isArray(members) ? [...members] : [];

  if (targetMembers.length === 0) {
    try {
      const { data, error } = await supabase
        .from('anggota')
        .select('nrp, nama, status, membership_status')
        .order('nama', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        targetMembers = data;
      }
    } catch (err) {
      console.warn('Gagal mengambil daftar anggota untuk template saldo awal:', err);
    }
  }

  // Filter hanya anggota aktif jika informasi status tersedia
  const activeMembers = targetMembers.filter((m) => {
    const ms = m.membership_status ? String(m.membership_status).toUpperCase().trim() : '';
    const st = m.status ? String(m.status).toLowerCase().trim() : '';
    if (ms && ms !== 'ACTIVE') return false;
    if (st && st !== 'aktif' && st !== 'active') return false;
    return Boolean(m.nrp && String(m.nrp).trim());
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Saldo Awal Simpanan');

  worksheet.columns = [
    { header: 'nrp', key: 'nrp', width: 18 },
    { header: 'nama', key: 'nama', width: 30 },
    { header: 'jumlah_simpanan_pokok', key: 'jumlah_simpanan_pokok', width: 24 },
    { header: 'jumlah_simpanan_wajib', key: 'jumlah_simpanan_wajib', width: 24 },
    { header: 'jumlah_simpanan_belanja', key: 'jumlah_simpanan_belanja', width: 24 },
    { header: 'jumlah_simpanan_lebaran', key: 'jumlah_simpanan_lebaran', width: 24 },
  ];

  worksheet.getColumn('nrp').numFmt = '@';
  worksheet.getColumn('nama').numFmt = '@';

  if (activeMembers.length > 0) {
    for (const member of activeMembers) {
      worksheet.addRow({
        nrp: String(member.nrp || '').trim(),
        nama: String(member.nama || '-').trim(),
        jumlah_simpanan_pokok: 0,
        jumlah_simpanan_wajib: 0,
        jumlah_simpanan_belanja: 0,
        jumlah_simpanan_lebaran: 0,
      });
    }
  } else {
    worksheet.addRow({
      nrp: '95168420',
      nama: 'Budi Santoso',
      jumlah_simpanan_pokok: 0,
      jumlah_simpanan_wajib: 0,
      jumlah_simpanan_belanja: 0,
      jumlah_simpanan_lebaran: 0,
    });
  }

  return workbook;
}

/**
 * Mengunduh file Excel template_saldo_awal_simpanan.xlsx ke browser pengguna.
 */
export async function downloadInitialSavingsTemplate(
  members?: InitialSavingsTemplateMember[]
): Promise<void> {
  const workbook = await buildInitialSavingsTemplateWorkbook(members);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = INITIAL_SAVINGS_TEMPLATE_FILENAME;
  link.click();

  window.URL.revokeObjectURL(url);
}

function extractCellValue(cell: ExcelJS.Cell): unknown {
  let val: unknown = cell.value;
  if (val && typeof val === 'object' && 'result' in val) {
    val = (val as { result: unknown }).result;
  }
  return val === null || val === undefined ? null : val;
}

/**
 * Mem-parsing file Excel upload Saldo Awal Simpanan dan memvalidasi keberadaan kolom wajib.
 * Mengembalikan nilai nominal murni (as-is, tanpa rumus pembagian/perkalian, default 0 jika kosong).
 */
export async function parseInitialSavingsExcel(
  fileOrBuffer: File | ArrayBuffer | Uint8Array
): Promise<InitialSavingsRow[]> {
  let buffer: any;
  if (fileOrBuffer instanceof ArrayBuffer) {
    buffer = fileOrBuffer;
  } else if (ArrayBuffer.isView(fileOrBuffer)) {
    buffer = fileOrBuffer.buffer.slice(
      fileOrBuffer.byteOffset,
      fileOrBuffer.byteOffset + fileOrBuffer.byteLength
    );
  } else if (typeof fileOrBuffer?.arrayBuffer === 'function') {
    buffer = await fileOrBuffer.arrayBuffer();
  } else if (typeof FileReader !== 'undefined') {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Gagal membaca file Excel'));
      reader.readAsArrayBuffer(fileOrBuffer as File);
    });
  } else {
    throw new Error('Format input file Excel tidak didukung.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('File Excel kosong atau tidak valid');
  }

  const headers: Record<string, number> = {};
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const raw = extractCellValue(cell);
    const headerName = raw !== null && raw !== undefined ? String(raw).trim().toLowerCase() : '';
    if (headerName) {
      headers[headerName] = colNumber;
    }
  });

  const requiredColumns = [
    'nrp',
    'jumlah_simpanan_pokok',
    'jumlah_simpanan_wajib',
    'jumlah_simpanan_belanja',
    'jumlah_simpanan_lebaran',
  ] as const;

  const missingColumns = requiredColumns.filter((col) => !headers[col]);
  if (missingColumns.length > 0) {
    throw new Error(
      `Format kolom Excel tidak valid. Kolom wajib yang belum ada: ${missingColumns.join(', ')}. Gunakan template Saldo Awal Simpanan yang disediakan.`
    );
  }

  const rows: InitialSavingsRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const getVal = (colName: string): unknown => {
      const idx = headers[colName];
      if (!idx) return null;
      return extractCellValue(row.getCell(idx));
    };

    const rawNrp = getVal('nrp');
    const nrp = rawNrp !== null && rawNrp !== undefined ? String(rawNrp).trim() : '';
    const rawNama = getVal('nama');
    const namaStr = rawNama !== null && rawNama !== undefined ? String(rawNama).trim() : '';

    // Lewati baris yang benar-benar kosong
    if (!nrp && !namaStr) {
      return;
    }

    if (!nrp) {
      return;
    }

    rows.push({
      nrp,
      nama: namaStr || '-',
      jumlah_simpanan_pokok: parseAmount(getVal('jumlah_simpanan_pokok')),
      jumlah_simpanan_wajib: parseAmount(getVal('jumlah_simpanan_wajib')),
      jumlah_simpanan_belanja: parseAmount(getVal('jumlah_simpanan_belanja')),
      jumlah_simpanan_lebaran: parseAmount(getVal('jumlah_simpanan_lebaran')),
    });
  });

  if (rows.length === 0) {
    throw new Error('Tidak ada data saldo awal valid yang ditemukan di dalam file Excel.');
  }

  return rows;
}


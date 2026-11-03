import ExcelJS from 'exceljs';
import {
  parseAmount,
  sanitizeDateString,
  sanitizeBankAccountNumber,
  sanitizeMigrationLoanRow,
} from './memberMigrationParser';

export interface ParsedMemberRow {
  nrp: string;
  nama: string;
  pangkat: string | null;
  bank_account_number: string | null;
  membership_status: string;
  tgl_awal_anggota: string | null;
  jumlah_simpanan_pokok: number;
  jumlah_simpanan_wajib: number;
  jumlah_simpanan_belanja: number;
  jumlah_simpanan_lebaran: number;
  jumlah_pinjaman: number;
  tgl_awal_pinjaman: string | null;
  tenor: number;
  sisa_pinjaman: number;
}

export interface MemberExcelParseResult {
  rows: ParsedMemberRow[];
  errors: string[];
  totalRows: number;
}

const ALLOWED_STATUS = ['ACTIVE', 'PENDING_RESIGNED', 'READY_TO_RESIGN', 'RESIGNED', 'BLOCKED'];

/**
 * Normalisasi header untuk pencocokan kolom yang fleksibel dan toleran
 */
function normalizeHeaderName(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Pemetaan alias kolom header ke properti internal
 */
const HEADER_ALIASES: Record<string, string[]> = {
  nrp: ['nrp', 'no_anggota', 'nomor_anggota', 'nip', 'nik', 'id_anggota', 'no_id'],
  nama: ['nama', 'nama_lengkap', 'nama_anggota', 'name', 'member_name'],
  pangkat: ['pangkat', 'golongan', 'rank', 'jabatan'],
  bank_account_number: ['bank_account_number', 'no_rekening', 'nomor_rekening', 'no_rek', 'rekening', 'bank_account', 'norek'],
  membership_status: ['membership_status', 'status_keanggotaan', 'status_anggota', 'status_member'],
  tgl_awal_anggota: ['tgl_awal_anggota', 'tgl_daftar', 'tanggal_daftar', 'tgl_masuk', 'tanggal_masuk', 'tgl_bergabung', 'tanggal_bergabung', 'join_date'],
  jumlah_simpanan_pokok: ['jumlah_simpanan_pokok', 'simpanan_pokok', 'pokok', 'simp_pokok', 'saldo_pokok'],
  jumlah_simpanan_wajib: ['jumlah_simpanan_wajib', 'simpanan_wajib', 'wajib', 'simp_wajib', 'saldo_wajib'],
  jumlah_simpanan_belanja: ['jumlah_simpanan_belanja', 'simpanan_belanja', 'belanja', 'simp_belanja', 'saldo_belanja'],
  jumlah_simpanan_lebaran: ['jumlah_simpanan_lebaran', 'simpanan_lebaran', 'lebaran', 'simp_lebaran', 'saldo_lebaran', 'simpanan_hari_raya'],
  jumlah_pinjaman: ['jumlah_pinjaman', 'pinjaman', 'pokok_pinjaman', 'plafon_pinjaman', 'total_pinjaman'],
  tgl_awal_pinjaman: ['tgl_awal_pinjaman', 'tgl_pinjam', 'tanggal_pinjam', 'tgl_pencairan', 'tanggal_pencairan'],
  tenor: ['tenor', 'jangka_waktu', 'durasi', 'lama_angsuran', 'bulan_angsuran'],
  sisa_pinjaman: ['sisa_pinjaman', 'baki_debet', 'baki_piutang', 'sisa_pokok', 'outstanding'],
};

/**
 * Mencari indeks kolom berdasarkan daftar alias
 */
function findColumnIndex(headersMap: Record<string, number>, targetKey: string): number | undefined {
  const aliases = HEADER_ALIASES[targetKey] || [targetKey];
  for (const alias of aliases) {
    if (headersMap[alias] !== undefined) {
      return headersMap[alias];
    }
  }
  return undefined;
}

/**
 * Parse file Excel anggota koperasi dengan ketahanan terhadap format angka, teks, tanggal, dan formula.
 */
export async function parseMemberExcel(
  fileOrBuffer: File | ArrayBuffer | Uint8Array | any
): Promise<MemberExcelParseResult> {
  let buffer: any;
  if (fileOrBuffer instanceof ArrayBuffer) {
    buffer = fileOrBuffer;
  } else if (ArrayBuffer.isView(fileOrBuffer)) {
    buffer = fileOrBuffer.buffer;
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
    buffer = fileOrBuffer;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('File Excel tidak memiliki lembar kerja (worksheet kosong).');
  }

  const headersMap: Record<string, number> = {};
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    let headerText = '';
    if (cell.value !== null && cell.value !== undefined) {
      if (typeof cell.value === 'object' && 'result' in cell.value) {
        headerText = String((cell.value as any).result);
      } else {
        headerText = String(cell.value);
      }
    }
    const normalized = normalizeHeaderName(headerText);
    if (normalized) {
      headersMap[normalized] = colNumber;
    }
  });

  const nrpCol = findColumnIndex(headersMap, 'nrp');
  const namaCol = findColumnIndex(headersMap, 'nama');

  if (!nrpCol || !namaCol) {
    throw new Error(
      'Format kolom Excel tidak valid. Kolom minimal (NRP dan Nama) wajib ada pada baris pertama.'
    );
  }

  const pangkatCol = findColumnIndex(headersMap, 'pangkat');
  const rekCol = findColumnIndex(headersMap, 'bank_account_number');
  const statusCol = findColumnIndex(headersMap, 'membership_status');
  const tglAwalCol = findColumnIndex(headersMap, 'tgl_awal_anggota');
  const pokokCol = findColumnIndex(headersMap, 'jumlah_simpanan_pokok');
  const wajibCol = findColumnIndex(headersMap, 'jumlah_simpanan_wajib');
  const belanjaCol = findColumnIndex(headersMap, 'jumlah_simpanan_belanja');
  const lebaranCol = findColumnIndex(headersMap, 'jumlah_simpanan_lebaran');
  const pinjamanCol = findColumnIndex(headersMap, 'jumlah_pinjaman');
  const tglPinjCol = findColumnIndex(headersMap, 'tgl_awal_pinjaman');
  const tenorCol = findColumnIndex(headersMap, 'tenor');
  const sisaCol = findColumnIndex(headersMap, 'sisa_pinjaman');

  const rows: ParsedMemberRow[] = [];
  const errors: string[] = [];

  const getCellValue = (row: ExcelJS.Row, colIndex?: number): any => {
    if (!colIndex) return null;
    const cell = row.getCell(colIndex);
    let val = cell.value;
    if (val && typeof val === 'object' && 'result' in val) {
      val = (val as any).result;
    }
    return val === null || val === undefined ? null : val;
  };

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const rawNrp = getCellValue(row, nrpCol);
    const rawNama = getCellValue(row, namaCol);

    const nrpStr = rawNrp !== null && rawNrp !== undefined ? String(rawNrp).trim() : '';
    const namaStr = rawNama !== null && rawNama !== undefined ? String(rawNama).trim() : '';

    // Lewati baris kosong total
    if (!nrpStr && !namaStr) {
      return;
    }

    if (!nrpStr || !namaStr) {
      errors.push(`Baris ${rowNumber}: NRP dan Nama wajib diisi.`);
      return;
    }

    const rawStatus = getCellValue(row, statusCol);
    let membership_status = 'ACTIVE';
    if (rawStatus) {
      const upperStatus = String(rawStatus).toUpperCase().trim();
      if (ALLOWED_STATUS.includes(upperStatus)) {
        membership_status = upperStatus;
      } else {
        errors.push(`Baris ${rowNumber} (NRP ${nrpStr}): membership_status "${rawStatus}" tidak valid.`);
        return;
      }
    }

    const rawPangkat = getCellValue(row, pangkatCol);
    const pangkat = rawPangkat ? String(rawPangkat).trim() : null;

    const rawRek = getCellValue(row, rekCol);
    const bank_account_number = sanitizeBankAccountNumber(rawRek);

    const rawTglAwal = getCellValue(row, tglAwalCol);
    const tgl_awal_anggota = sanitizeDateString(rawTglAwal);

    const pokok = parseAmount(getCellValue(row, pokokCol));
    const wajib = parseAmount(getCellValue(row, wajibCol));
    const belanja = parseAmount(getCellValue(row, belanjaCol));
    const lebaran = parseAmount(getCellValue(row, lebaranCol));

    const sanitizedLoan = sanitizeMigrationLoanRow({
      bank_account_number,
      jumlah_pinjaman: getCellValue(row, pinjamanCol),
      tgl_awal_pinjaman: getCellValue(row, tglPinjCol),
      tenor: getCellValue(row, tenorCol),
      sisa_pinjaman: getCellValue(row, sisaCol),
    });

    rows.push({
      nrp: nrpStr,
      nama: namaStr,
      pangkat,
      bank_account_number,
      membership_status,
      tgl_awal_anggota,
      jumlah_simpanan_pokok: pokok,
      jumlah_simpanan_wajib: wajib,
      jumlah_simpanan_belanja: belanja,
      jumlah_simpanan_lebaran: lebaran,
      jumlah_pinjaman: sanitizedLoan.jumlah_pinjaman,
      tgl_awal_pinjaman: sanitizedLoan.tgl_awal_pinjaman,
      tenor: sanitizedLoan.tenor,
      sisa_pinjaman: sanitizedLoan.sisa_pinjaman,
    });
  });

  return {
    rows,
    errors,
    totalRows: rows.length,
  };
}

/**
 * savingsMatrixImporter.ts
 * Parser cerdas untuk membaca berkas Excel matriks simpanan (.xlsx) hasil audit admin
 * dan mengekstrak mutasi bulanan per anggota untuk disinkronkan ke buku besar deposit_transactions.
 */

import ExcelJS from 'exceljs';

export interface ParsedMonthlyDeposit {
  nrp: string;
  year: number;
  month: number;
  amount: number;
}

export interface DetectedMonthColumn {
  colIndex: number;
  year: number;
  month: number;
  label: string;
}

export interface ParseSavingsMatrixResult {
  success: boolean;
  totalRows: number;
  totalMutations: number;
  mutations: ParsedMonthlyDeposit[];
  errors: string[];
  detectedMonths: DetectedMonthColumn[];
}

const MONTH_MAP: Record<string, number> = {
  // Indonesian 3-letter & variations
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6,
  jul: 7, ags: 8, agu: 8, agt: 8, sep: 9, okt: 10, nov: 11, des: 12,
  // English 3-letter
  may: 5, aug: 8, oct: 10, dec: 12,
  // Indonesian full
  januari: 1, februari: 2, maret: 3, april: 4, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  // English full
  january: 1, february: 2, march: 3, june: 6,
  july: 7, august: 8, october: 10, december: 12,
};

const NON_MONTH_KEYWORDS = [
  'nrp', 'nama', 'anggota', 'tgl', 'tanggal', 'masuk', 'join',
  'saldo', 'acuan', 'database', 'total', 'alokasi', 'selisih',
  'status', 'validasi', 'keterangan', 'no', 'catatan'
];

/**
 * Parsing teks header kolom menjadi { month, year } jika sesuai format bulan/tahun
 */
export function parseMonthYearHeader(headerVal: any): { month: number; year: number } | null {
  if (headerVal === null || headerVal === undefined) return null;

  // 1. Tangani jika sel Excel bertipe Date langsung
  if (headerVal instanceof Date) {
    if (isNaN(headerVal.getTime())) return null;
    return {
      month: headerVal.getMonth() + 1,
      year: headerVal.getFullYear()
    };
  }

  // 2. Ekstrak string dari berbagai representasi cell ExcelJS
  let str = '';
  if (typeof headerVal === 'string') {
    str = headerVal.trim();
  } else if (typeof headerVal === 'object') {
    if ('text' in headerVal && typeof headerVal.text === 'string') {
      str = headerVal.text.trim();
    } else if ('richText' in headerVal && Array.isArray(headerVal.richText)) {
      str = headerVal.richText.map((t: any) => t.text || '').join('').trim();
    } else if ('result' in headerVal) {
      return parseMonthYearHeader(headerVal.result);
    }
  }

  if (!str) return null;

  const lowerStr = str.toLowerCase();

  // Abaikan jika jelas-jelas kolom informasi statis/agregasi
  for (const kw of NON_MONTH_KEYWORDS) {
    if (lowerStr === kw || lowerStr.startsWith(kw + ' ') || lowerStr.endsWith(' ' + kw)) {
      return null;
    }
  }

  // Pola 1: Nama bulan (ID/EN) diikuti tahun (2 atau 4 digit), misal: 'Mei-21', 'May-21', 'Jun 2024', 'Des.25'
  const nameYearMatch = str.match(/^([a-zA-Z]+)[\s\-_\/.]*(\d{2,4})$/);
  if (nameYearMatch) {
    const mStr = nameYearMatch[1].toLowerCase();
    const yVal = parseInt(nameYearMatch[2], 10);
    const mNum = MONTH_MAP[mStr];
    if (mNum) {
      const year = yVal < 100 ? (yVal < 50 ? 2000 + yVal : 1900 + yVal) : yVal;
      return { month: mNum, year };
    }
  }

  // Pola 2: Tahun diikuti nama bulan (ID/EN), misal: '2024-Mei', '2024 May'
  const yearNameMatch = str.match(/^(\d{2,4})[\s\-_\/.]+([a-zA-Z]+)$/);
  if (yearNameMatch) {
    const yVal = parseInt(yearNameMatch[1], 10);
    const mStr = yearNameMatch[2].toLowerCase();
    const mNum = MONTH_MAP[mStr];
    if (mNum) {
      const year = yVal < 100 ? (yVal < 50 ? 2000 + yVal : 1900 + yVal) : yVal;
      return { month: mNum, year };
    }
  }

  // Pola 3: Numerik bulan/tahun, misal: '05/21', '05-2021', '5/24'
  const numMonthYearMatch = str.match(/^(\d{1,2})[\s\-_\/.]+(\d{2,4})$/);
  if (numMonthYearMatch) {
    const mVal = parseInt(numMonthYearMatch[1], 10);
    const yVal = parseInt(numMonthYearMatch[2], 10);
    if (mVal >= 1 && mVal <= 12) {
      const year = yVal < 100 ? (yVal < 50 ? 2000 + yVal : 1900 + yVal) : yVal;
      return { month: mVal, year };
    }
  }

  // Pola 4: ISO format YYYY-MM, misal: '2021-05', '2024/11'
  const isoMatch = str.match(/^(\d{4})[\s\-_\/.]+(\d{1,2})$/);
  if (isoMatch) {
    const yVal = parseInt(isoMatch[1], 10);
    const mVal = parseInt(isoMatch[2], 10);
    if (mVal >= 1 && mVal <= 12) {
      return { month: mVal, year: yVal };
    }
  }

  return null;
}

/**
 * Ekstraksi nilai numerik dari sel Excel (angka murni, string terformat, accounting format, atau formula result)
 */
export function extractNumericAmount(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  if (typeof val === 'object') {
    if ('result' in val) {
      return extractNumericAmount(val.result);
    }
    if ('richText' in val && Array.isArray(val.richText)) {
      const text = val.richText.map((t: any) => t.text || '').join('');
      return extractNumericAmount(text);
    }
    if ('text' in val) {
      return extractNumericAmount(val.text);
    }
  }
  if (typeof val === 'string') {
    let clean = val.trim();
    if (!clean || clean === '-' || clean === 'Rp' || clean === 'Rp.') return 0;

    // Bersihkan prefix mata uang
    clean = clean.replace(/^(Rp\.?|IDR|\$)\s*/i, '').trim();

    // Normalisasi pemisah ribuan dan desimal
    if (clean.includes('.') && clean.includes(',')) {
      if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
        // Format Indonesia: 150.000,00 -> titik ribuan, koma desimal
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        // Format US: 150,000.00 -> koma ribuan, titik desimal
        clean = clean.replace(/,/g, '');
      }
    } else if (clean.includes('.')) {
      const parts = clean.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        clean = clean.replace(/\./g, '');
      }
    } else if (clean.includes(',')) {
      const parts = clean.split(',');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        clean = clean.replace(/,/g, '');
      } else {
        clean = clean.replace(',', '.');
      }
    }

    const parsed = parseFloat(clean.replace(/[^\d.-]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Membaca file atau buffer Excel matriks simpanan dan mengekstrak mutasi bulanan per anggota
 */
export async function parseSavingsMatrixExcel(
  file: File | ArrayBuffer | Uint8Array | any
): Promise<ParseSavingsMatrixResult> {
  const errors: string[] = [];
  const mutations: ParsedMonthlyDeposit[] = [];
  const detectedMonths: DetectedMonthColumn[] = [];

  try {
    let buffer: any;
    if (file instanceof ArrayBuffer) {
      buffer = file;
    } else if (file instanceof Uint8Array) {
      buffer = file.buffer;
    } else if (file && typeof file.arrayBuffer === 'function') {
      buffer = await file.arrayBuffer();
    } else {
      buffer = file;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return {
        success: false,
        totalRows: 0,
        totalMutations: 0,
        mutations: [],
        errors: ['Berkas Excel tidak memiliki lembar kerja (worksheet) yang dapat dibaca.'],
        detectedMonths: []
      };
    }

    // Cari baris header yang memuat kolom 'NRP'
    let headerRowIndex = -1;
    let nrpColIndex = -1;

    const maxScanRow = Math.min(worksheet.rowCount || 10, 15);
    for (let r = 1; r <= maxScanRow; r++) {
      const row = worksheet.getRow(r);
      const cellCount = Math.max(row.cellCount, worksheet.columnCount || 0);

      for (let c = 1; c <= cellCount; c++) {
        const val = row.getCell(c).value;
        let str = '';
        if (typeof val === 'string') str = val.trim();
        else if (typeof val === 'object' && val && 'text' in val) str = String(val.text).trim();

        if (str.toUpperCase() === 'NRP' || str.toUpperCase().startsWith('NRP')) {
          headerRowIndex = r;
          nrpColIndex = c;
          break;
        }
      }
      if (headerRowIndex !== -1) break;
    }

    if (headerRowIndex === -1 || nrpColIndex === -1) {
      return {
        success: false,
        totalRows: 0,
        totalMutations: 0,
        mutations: [],
        errors: ["Kolom header 'NRP' tidak ditemukan pada berkas Excel."],
        detectedMonths: []
      };
    }

    const headerRow = worksheet.getRow(headerRowIndex);
    const colCount = Math.max(headerRow.cellCount, worksheet.columnCount || 0);

    // Deteksi kolom-kolom bulan
    for (let c = 1; c <= colCount; c++) {
      if (c === nrpColIndex) continue;
      const cellVal = headerRow.getCell(c).value;
      const parsed = parseMonthYearHeader(cellVal);
      if (parsed) {
        let label = '';
        if (typeof cellVal === 'string') label = cellVal.trim();
        else if (typeof cellVal === 'object' && cellVal && 'text' in cellVal) label = String(cellVal.text).trim();
        else if (cellVal instanceof Date) label = `${parsed.month}/${parsed.year}`;
        else label = String(cellVal ?? '');

        detectedMonths.push({
          colIndex: c,
          year: parsed.year,
          month: parsed.month,
          label
        });
      }
    }

    if (detectedMonths.length === 0) {
      return {
        success: false,
        totalRows: 0,
        totalMutations: 0,
        mutations: [],
        errors: ['Tidak ditemukan kolom bulan transaksi pada berkas Excel.'],
        detectedMonths: []
      };
    }

    // Urutkan kolom bulan terdeteksi berdasarkan urutan indeks kolom
    detectedMonths.sort((a, b) => a.colIndex - b.colIndex);

    // Iterasi baris data (mulai dari baris setelah header)
    let totalRows = 0;
    const totalRowCount = worksheet.rowCount;

    for (let r = headerRowIndex + 1; r <= totalRowCount; r++) {
      const row = worksheet.getRow(r);
      const nrpCellVal = row.getCell(nrpColIndex).value;

      let rawNrp = nrpCellVal;
      if (rawNrp && typeof rawNrp === 'object' && 'text' in rawNrp) {
        rawNrp = rawNrp.text;
      }
      const nrp = String(rawNrp ?? '').trim();

      // Lewati baris kosong atau baris ringkasan/header duplikat
      if (!nrp || nrp === '-' || nrp.toUpperCase() === 'NRP' || nrp.toLowerCase().startsWith('total')) {
        continue;
      }

      totalRows++;

      for (const mCol of detectedMonths) {
        const cell = row.getCell(mCol.colIndex);
        const amount = extractNumericAmount(cell.value);

        if (amount > 0) {
          mutations.push({
            nrp,
            year: mCol.year,
            month: mCol.month,
            amount
          });
        }
      }
    }

    return {
      success: true,
      totalRows,
      totalMutations: mutations.length,
      mutations,
      errors: [],
      detectedMonths
    };
  } catch (err: any) {
    return {
      success: false,
      totalRows: 0,
      totalMutations: 0,
      mutations: [],
      errors: ['Gagal membaca berkas Excel: ' + (err?.message || String(err))],
      detectedMonths: []
    };
  }
}

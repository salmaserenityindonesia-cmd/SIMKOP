/**
 * SIMKOP - Migration Loan Schedule Generator & Sanitizer
 * Modul kalkulasi amortisasi pinjaman migrasi, sanitasi data Excel, dan penyesuaian baki piutang.
 */

import ExcelJS from 'exceljs';

export interface MigrationLoanSchedule {
  period_number: number;
  due_date: string;
  target_amount: number;
  paid_amount: number;
  status: 'paid' | 'partial' | 'unpaid';
}

export interface SanitizedMigrationLoan {
  bank_account_number: string | null;
  jumlah_pinjaman: number;
  tgl_awal_pinjaman: string | null;
  tenor: number;
  sisa_pinjaman: number;
}

/**
 * Parsing angka / nominal mata uang secara aman dan non-negatif.
 * Mendukung format desimal US (1,000,000.00) dan Indo (1.000.000,00).
 */
export const parseAmount = (val: unknown): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, val);
  if (typeof val === 'string') {
    let str = val.trim();
    if (!str) return 0;

    // Bersihkan karakter pemisah ribuan dan desimal
    if (str.includes('.') && str.includes(',')) {
      const lastDot = str.lastIndexOf('.');
      const lastComma = str.lastIndexOf(',');
      if (lastDot < lastComma) {
        // Format Indo: 1.500.000,00 -> titik ribuan, koma desimal
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        // Format US: 1,500,000.00 -> koma ribuan, titik desimal
        str = str.replace(/,/g, '');
      }
    } else if (str.includes('.')) {
      // Deteksi format ribuan bertitik seperti "2.000.000" atau "50.000"
      const parts = str.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        str = str.replace(/\./g, '');
      }
    } else if (str.includes(',')) {
      // Deteksi format ribuan berkoma seperti "2,000,000" atau desimal koma "50000,50"
      const parts = str.split(',');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        str = str.replace(/,/g, '');
      } else {
        str = str.replace(',', '.');
      }
    }

    const cleaned = str.replace(/[^0-9.-]+/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.max(0, num);
  }
  return 0;
};

/**
 * Parsing tanggal ke objek Date secara aman.
 * Menghindari interpretasi angka murni (seperti '10' atau '33') sebagai tahun/tanggal liar.
 */
export const parseSafeDate = (dateInput: Date | string | null | undefined): Date => {
  if (!dateInput) return new Date();

  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? new Date() : new Date(dateInput.getTime());
  }

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return new Date();

    // Jika berupa angka murni tanpa pemisah tanggal, bukan kalender valid
    if (/^\d+$/.test(trimmed)) {
      return new Date();
    }

    // Tangani format YYYY-MM-DD atau YYYY/MM/DD
    const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10) - 1;
      const d = parseInt(match[3], 10);
      const candidate = new Date(y, m, d);
      if (!isNaN(candidate.getTime())) return candidate;
    }

    const candidate = new Date(trimmed);
    if (!isNaN(candidate.getTime())) return candidate;
  }

  return new Date();
};

/**
 * Sanitasi string tanggal ke ISO Date YYYY-MM-DD jika valid.
 * Jika berupa angka Excel serial date, konversikan ke kalender.
 * Jika berupa string teks mentah yang tidak parseable, pertahankan string asli jika non-empty.
 */
export const sanitizeDateString = (val: unknown): string | null => {
  if (val === null || val === undefined) return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Excel serial date number (antara 1970 s/d 2099)
  if (typeof val === 'number') {
    if (val >= 25569 && val <= 73050) {
      const epochMs = (val - 25569) * 86400 * 1000;
      const d = new Date(epochMs);
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const date = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${date}`;
      }
    }
    // Jika angka mentah (seperti 10 atau 42), pertahankan sebagai string angka
    return String(val);
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // Format ISO YYYY-MM-DD
    const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const d = parseInt(match[3], 10);
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    // Jika string lain (termasuk format angka hari '10' atau ' 15 '), kembalikan trimmed string
    return trimmed;
  }

  return null;
};

/**
 * Sanitasi nomor rekening bank
 */
export const sanitizeBankAccountNumber = (val: unknown): string | null => {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') {
    return null;
  }
  return str;
};

export const REQUIRED_MEMBER_HEADERS = [
  'nrp',
  'nama',
  'pangkat',
  'bank_account_number',
  'membership_status',
  'tgl_awal_anggota',
] as const;

export const MEMBER_IMPORT_TEMPLATE_HEADERS = REQUIRED_MEMBER_HEADERS;

export const MEMBER_IMPORT_TEMPLATE_FILENAME = 'template_import_anggota.xlsx';

export const MEMBER_IMPORT_TEMPLATE_SAMPLE_ROWS = [
  {
    nrp: '95168420',
    nama: 'Budi Santoso',
    pangkat: 'Aipda',
    bank_account_number: '367800973556',
    membership_status: 'ACTIVE',
    tgl_awal_anggota: '2026-11-13',
  },
];

/**
 * Validasi ketat header kolom file Excel Import Data Induk Anggota.
 * Mencegah file template Saldo Awal Simpanan atau Saldo Awal Pinjaman tertukar.
 */
export function validateMemberImportHeaders(rawHeaders: unknown[]): string[] {
  const headers = rawHeaders
    .map((h) => String(h || '').trim().toLowerCase())
    .filter(Boolean);

  if (headers.includes('jumlah_simpanan_wajib') || headers.includes('jumlah_simpanan_pokok')) {
    throw new Error(
      'File tidak sesuai! File ini adalah template "Saldo Awal Simpanan". Silakan unggah melalui tombol hijau "Saldo Awal Simpanan" agar tanggal cut-off tercatat.'
    );
  }

  if (headers.includes('jumlah_pinjaman') || headers.includes('jenis_pinjaman')) {
    throw new Error(
      'File tidak sesuai! File ini adalah template "Saldo Awal Pinjaman". Silakan unggah melalui tombol kuning "Saldo Awal Pinjaman".'
    );
  }

  const missing = REQUIRED_MEMBER_HEADERS.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new Error(
      `Header kolom tidak sesuai template Data Anggota. Kolom yang kurang: ${missing.join(', ')}`
    );
  }

  return headers;
}

/**
 * Membangun workbook Excel template 6 kolom Data Induk Anggota.
 */
export async function buildMemberImportTemplateWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Import Anggota');

  worksheet.columns = [
    { header: 'nrp', key: 'nrp', width: 15 },
    { header: 'nama', key: 'nama', width: 30 },
    { header: 'pangkat', key: 'pangkat', width: 20 },
    { header: 'bank_account_number', key: 'bank_account_number', width: 25 },
    { header: 'membership_status', key: 'membership_status', width: 20 },
    { header: 'tgl_awal_anggota', key: 'tgl_awal_anggota', width: 20 },
  ];

  ['nrp', 'nama', 'pangkat', 'bank_account_number', 'membership_status'].forEach((k) => {
    worksheet.getColumn(k).numFmt = '@';
  });
  worksheet.getColumn('tgl_awal_anggota').numFmt = 'yyyy-mm-dd';

  for (const sampleRow of MEMBER_IMPORT_TEMPLATE_SAMPLE_ROWS) {
    worksheet.addRow(sampleRow);
  }

  return workbook;
}

/**
 * Mengunduh file Excel template_import_anggota.xlsx ke browser pengguna.
 */
export async function downloadMemberImportTemplate(): Promise<void> {
  const workbook = await buildMemberImportTemplateWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = MEMBER_IMPORT_TEMPLATE_FILENAME;
  link.click();

  window.URL.revokeObjectURL(url);
}

function extractExcelCellValue(cell: ExcelJS.Cell): unknown {
  let val: unknown = cell.value;
  if (val && typeof val === 'object' && 'result' in val) {
    val = (val as { result: unknown }).result;
  }
  return val === null || val === undefined ? null : val;
}

/**
 * Mem-parsing file Excel Import Data Induk Anggota (6 kolom profil) dengan validasi header ketat.
 * Seluruh nilai simpanan & pinjaman di-nolkan sehingga hanya memproses profil induk anggota.
 */
export async function parseMemberImportExcel(
  fileOrBuffer: File | ArrayBuffer | Uint8Array
): Promise<SanitizedMigrationMemberRow[]> {
  let buffer: any;
  if (fileOrBuffer instanceof ArrayBuffer) {
    buffer = fileOrBuffer;
  } else if (ArrayBuffer.isView(fileOrBuffer)) {
    buffer = fileOrBuffer.buffer.slice(
      fileOrBuffer.byteOffset,
      fileOrBuffer.byteOffset + fileOrBuffer.byteLength
    );
  } else if (typeof (fileOrBuffer as File)?.arrayBuffer === 'function') {
    buffer = await (fileOrBuffer as File).arrayBuffer();
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

  const rawHeaders: unknown[] = [];
  const headerMap: Record<string, number> = {};
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const raw = extractExcelCellValue(cell);
    rawHeaders.push(raw);
    const headerName = raw !== null && raw !== undefined ? String(raw).trim().toLowerCase() : '';
    if (headerName) {
      headerMap[headerName] = colNumber;
    }
  });

  validateMemberImportHeaders(rawHeaders);

  const allowedStatus = ['ACTIVE', 'PENDING_RESIGNED', 'READY_TO_RESIGN', 'RESIGNED', 'BLOCKED'];
  const rows: SanitizedMigrationMemberRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const getVal = (colName: string): unknown => {
      const idx = headerMap[colName];
      if (!idx) return null;
      return extractExcelCellValue(row.getCell(idx));
    };

    const rawNrp = getVal('nrp');
    const rawNama = getVal('nama');
    const rawPangkat = getVal('pangkat');
    const rawBank = getVal('bank_account_number');
    const rawStatus = getVal('membership_status');
    const rawTgl = getVal('tgl_awal_anggota');

    const nrp = rawNrp !== null && rawNrp !== undefined ? String(rawNrp).trim() : '';
    const nama = rawNama !== null && rawNama !== undefined ? String(rawNama).trim() : '';

    if (!nrp && !nama && !rawPangkat && !rawBank && !rawStatus && !rawTgl) {
      return;
    }

    if (!nrp || !nama) {
      throw new Error(`Baris ${rowNumber}: NRP dan Nama wajib diisi.`);
    }

    let membership_status = 'ACTIVE';
    if (rawStatus !== null && rawStatus !== undefined && String(rawStatus).trim() !== '') {
      const upperStatus = String(rawStatus).trim().toUpperCase();
      if (!allowedStatus.includes(upperStatus)) {
        throw new Error(
          `Baris ${rowNumber}: membership_status "${String(rawStatus).trim()}" tidak valid. Gunakan salah satu dari: ${allowedStatus.join(', ')}.`
        );
      }
      membership_status = upperStatus;
    }

    rows.push(
      sanitizeMigrationMemberRow({
        nrp,
        nama,
        pangkat: rawPangkat,
        bank_account_number: rawBank,
        membership_status,
        tgl_awal_anggota: rawTgl,
        jumlah_simpanan_pokok: 0,
        jumlah_simpanan_wajib: 0,
        jumlah_simpanan_belanja: 0,
        jumlah_simpanan_lebaran: 0,
        jumlah_pinjaman: 0,
        tgl_awal_pinjaman: null,
        tenor: 0,
        sisa_pinjaman: 0,
      })
    );
  });

  if (rows.length === 0) {
    throw new Error('Tidak ada data anggota valid yang ditemukan di dalam file Excel.');
  }

  return rows;
}

export interface SanitizedMigrationMemberRow extends SanitizedMigrationLoan {
  nrp: string;
  nama: string;
  pangkat: string | null;
  membership_status: string;
  tgl_awal_anggota: string | null;
  jumlah_simpanan_pokok: number;
  jumlah_simpanan_wajib: number;
  jumlah_simpanan_belanja: number;
  jumlah_simpanan_lebaran: number;
}

/**
 * Helper sanitasi lengkap baris impor/migrasi anggota (mendukung 6 kolom profil maupun 14 kolom migrasi).
 * Kolom simpanan & pinjaman yang tidak ada atau kosong otomatis bernilai 0.
 */
export const sanitizeMigrationMemberRow = (row: any): SanitizedMigrationMemberRow => {
  const loan = sanitizeMigrationLoanRow(row);
  return {
    nrp: row?.nrp !== undefined && row?.nrp !== null ? String(row.nrp).trim() : '',
    nama: row?.nama !== undefined && row?.nama !== null ? String(row.nama).trim() : '',
    pangkat: row?.pangkat ? String(row.pangkat).trim() : null,
    bank_account_number: loan.bank_account_number,
    membership_status: row?.membership_status ? String(row.membership_status).trim().toUpperCase() : 'ACTIVE',
    tgl_awal_anggota: sanitizeDateString(row?.tgl_awal_anggota),
    jumlah_simpanan_pokok: parseAmount(row?.jumlah_simpanan_pokok),
    jumlah_simpanan_wajib: parseAmount(row?.jumlah_simpanan_wajib),
    jumlah_simpanan_belanja: parseAmount(row?.jumlah_simpanan_belanja),
    jumlah_simpanan_lebaran: parseAmount(row?.jumlah_simpanan_lebaran),
    jumlah_pinjaman: loan.jumlah_pinjaman,
    tgl_awal_pinjaman: loan.tgl_awal_pinjaman,
    tenor: loan.tenor,
    sisa_pinjaman: loan.sisa_pinjaman,
  };
};

/**
 * Helper sanitasi data pinjaman dari row Excel / objek migrasi.
 */
export const sanitizeMigrationLoanRow = (row: any): SanitizedMigrationLoan => {
  if (!row || typeof row !== 'object') {
    return {
      bank_account_number: null,
      jumlah_pinjaman: 0,
      tgl_awal_pinjaman: null,
      tenor: 0,
      sisa_pinjaman: 0,
    };
  }

  const bank_account_number = sanitizeBankAccountNumber(row.bank_account_number);
  const rawJumlah = parseAmount(row.jumlah_pinjaman);
  const tenor = Math.max(0, Math.floor(parseAmount(row.tenor)));
  const rawSisa = parseAmount(row.sisa_pinjaman);

  // Jika jumlah pinjaman 0, pastikan sisa pinjaman juga 0
  const jumlah_pinjaman = rawJumlah;
  // Sisa pinjaman tidak boleh melebihi jumlah pinjaman
  const sisa_pinjaman = jumlah_pinjaman > 0 ? Math.min(rawSisa, jumlah_pinjaman) : 0;
  const tgl_awal_pinjaman = sanitizeDateString(row.tgl_awal_pinjaman);

  return {
    bank_account_number,
    jumlah_pinjaman,
    tgl_awal_pinjaman,
    tenor,
    sisa_pinjaman,
  };
};

/**
 * Generator jadwal amortisasi pinjaman migrasi.
 * Menghasilkan array MigrationLoanSchedule dengan pendistribusian amortisasi historis secara matematis.
 * Nilai unpaid/partial persis sama dengan remainingBalance.
 */
export function generateMigrationLoanSchedules(
  principal: number,
  tenor: number,
  remainingBalance: number,
  startDate: Date | string = new Date()
): MigrationLoanSchedule[] {
  if (principal <= 0 || tenor <= 0) {
    return [];
  }

  // Batasi sisa pinjaman agar valid antara 0 dan principal
  const safeRemaining = Math.max(0, Math.min(principal, remainingBalance));
  const monthlyInstallment = Math.round(principal / tenor);

  // Total yang telah diangsur sebelum proses migrasi
  let alreadyPaid = Math.max(0, principal - safeRemaining);

  const schedules: MigrationLoanSchedule[] = [];
  const baseDate = parseSafeDate(startDate);
  const baseYear = baseDate.getFullYear();
  const baseMonth = baseDate.getMonth();
  const baseDay = baseDate.getDate();

  for (let i = 0; i < tenor; i++) {
    // Pada periode terakhir, serap selisih pembulatan agar total target tepat sama dengan principal
    const targetAmount = (i === tenor - 1)
      ? (principal - (monthlyInstallment * (tenor - 1)))
      : monthlyInstallment;

    // Kalkulasi tanggal jatuh tempo berturut-turut per bulan dari startDate
    const targetMonthOffset = baseMonth + (i + 1);
    const targetYear = baseYear + Math.floor(targetMonthOffset / 12);
    const targetMonth = ((targetMonthOffset % 12) + 12) % 12;

    // Dapatkan hari terakhir bulan target untuk menangani rollover akhir bulan (misal 31 Jan -> 28/29 Feb)
    const maxDayInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDay = Math.min(baseDay, maxDayInMonth);

    const yyyy = targetYear;
    const mm = String(targetMonth + 1).padStart(2, '0');
    const dd = String(targetDay).padStart(2, '0');
    const dueDate = `${yyyy}-${mm}-${dd}`;

    // Alokasikan alreadyPaid secara progresif
    let paidAmount = 0;
    let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';

    if (alreadyPaid >= targetAmount) {
      paidAmount = targetAmount;
      status = 'paid';
      alreadyPaid -= targetAmount;
    } else if (alreadyPaid > 0) {
      paidAmount = alreadyPaid;
      status = 'partial';
      alreadyPaid = 0;
    } else {
      paidAmount = 0;
      status = 'unpaid';
    }

    schedules.push({
      period_number: i + 1,
      due_date: dueDate,
      target_amount: targetAmount,
      paid_amount: paidAmount,
      status: status,
    });
  }

  return schedules;
}

export interface TierRate {
  startYear: number;
  startMonth: number;
  endYear?: number | null;
  endMonth?: number | null;
  monthlyAmount: number;
}

export interface MonthlyBreakdownItem {
  year: number;
  month: number;
  amount: number;
}

export interface ReverseWajibBreakdownResult {
  monthlyBreakdown: MonthlyBreakdownItem[];
  monthsCount: number;
  calculatedTotal: number;
  pre2020LumpSum: number;
  excelWajibAmount: number;
  difference: number;
  hasDifference: boolean;
  isPre2020Member: boolean;
}

/**
 * Penguraian mundur Simpanan Wajib dari bulan berjalan ke belakang hingga tanggal awal anggota.
 * Periode sebelum Jan 2020 tidak diurai bulanan melainkan dicatat utuh (lump sum) dan digabung dengan total uraian.
 * Mendeteksi selisih antara nilai Excel dan ekspektasi sistem.
 */
export function computeReverseWajibBreakdown(
  joinDateStr: string | null | undefined,
  excelWajibAmount: number,
  tiers: TierRate[],
  currentDate: Date = new Date()
): ReverseWajibBreakdownResult {
  const safeExcelAmount = parseAmount(excelWajibAmount);
  const cutoff2020 = new Date(2020, 0, 1); // 1 Januari 2020

  const joinDate = joinDateStr ? parseSafeDate(joinDateStr) : null;
  const isPre2020Member = !!(joinDate && joinDate < cutoff2020);

  let currYear = currentDate.getFullYear();
  let currMonth = currentDate.getMonth() + 1; // 1-12

  const joinYear = joinDate ? joinDate.getFullYear() : currYear;
  const joinMonth = joinDate ? joinDate.getMonth() + 1 : currMonth;

  let calculatedTotal = 0;
  const monthlyBreakdown: MonthlyBreakdownItem[] = [];

  // Loop mundur dari bulan berjalan sampai batas tanggal bergabung atau batas 2020
  while (true) {
    const isPastJoin = currYear < joinYear || (currYear === joinYear && currMonth < joinMonth);
    const isPre2020 = currYear < 2020;

    if (isPastJoin || isPre2020) break;

    // Cari tarif yang berlaku pada currYear & currMonth
    const targetIndex = currYear * 12 + currMonth;
    const matchedTier = tiers.find(t => {
      const startIdx = t.startYear * 12 + t.startMonth;
      const endIdx = t.endYear && t.endMonth ? t.endYear * 12 + t.endMonth : 999999;
      return targetIndex >= startIdx && targetIndex <= endIdx;
    });

    const rate = matchedTier ? matchedTier.monthlyAmount : 200000;
    monthlyBreakdown.push({ year: currYear, month: currMonth, amount: rate });
    calculatedTotal += rate;

    // Geser mundur 1 bulan
    currMonth--;
    if (currMonth === 0) {
      currMonth = 12;
      currYear--;
    }
  }

  // Jika tanggal bergabung sebelum Jan 2020:
  // Saldo sebelum 2020 tidak diurai per bulan, melainkan dicatat utuh
  let pre2020LumpSum = 0;
  let difference = 0;
  let hasDifference = false;

  if (isPre2020Member) {
    if (safeExcelAmount >= calculatedTotal) {
      pre2020LumpSum = safeExcelAmount - calculatedTotal;
      difference = 0;
      hasDifference = false;
    } else {
      // Jika total Excel lebih kecil dari uraian >= 2020 yang wajib dibayar
      pre2020LumpSum = 0;
      difference = safeExcelAmount - calculatedTotal;
      hasDifference = true;
    }
  } else {
    // Anggota bergabung >= Jan 2020
    difference = safeExcelAmount - calculatedTotal;
    hasDifference = Math.abs(difference) > 0;
  }

  return {
    monthlyBreakdown,
    monthsCount: monthlyBreakdown.length,
    calculatedTotal,
    pre2020LumpSum,
    excelWajibAmount: safeExcelAmount,
    difference,
    hasDifference,
    isPre2020Member,
  };
}


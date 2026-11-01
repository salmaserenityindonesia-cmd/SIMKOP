/**
 * SIMKOP - Migration Loan Schedule Generator & Sanitizer
 * Modul kalkulasi amortisasi pinjaman migrasi, sanitasi data Excel, dan penyesuaian baki piutang.
 */

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
  if (typeof val === 'number' && val >= 25569 && val <= 73050) {
    const epochMs = (val - 25569) * 86400 * 1000;
    const d = new Date(epochMs);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const date = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${date}`;
    }
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

    // Jika string lain (termasuk format angka hari '10'), kembalikan trimmed string
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

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function formatIsoParts(year: number, month: number, day: number): string | null {
  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 73050) {
    return null;
  }
  const days = Math.floor(serial);
  // Excel epoch: 1899-12-30 accounts for the Excel 1900 leap-year bug for serial >= 61.
  // For serial 1..59 in Excel, 1900-02-29 did not exist, so serial 1..59 would be shifted by 1 day;
  // birth dates in practice are >= 1920 (serial >= 7305), well past serial 61.
  const utcDate = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
  if (isNaN(utcDate.getTime())) {
    return null;
  }
  return formatIsoParts(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

/**
 * Mengurai berbagai format input tanggal lahir (Date, nomor seri Excel, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
 * menjadi string ISO `YYYY-MM-DD` yang aman disimpan ke kolom PostgreSQL `DATE`.
 * Mengembalikan `null` jika kosong atau tidak valid.
 */
export function parseBirthDateInput(val: unknown): string | null {
  if (val === null || val === undefined) {
    return null;
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return null;
    }
    const isUtcMidnight =
      val.getUTCHours() === 0 &&
      val.getUTCMinutes() === 0 &&
      val.getUTCSeconds() === 0 &&
      val.getUTCMilliseconds() === 0;
    const year = isUtcMidnight ? val.getUTCFullYear() : val.getFullYear();
    const month = (isUtcMidnight ? val.getUTCMonth() : val.getMonth()) + 1;
    const day = isUtcMidnight ? val.getUTCDate() : val.getDate();
    return formatIsoParts(year, month, day);
  }

  if (typeof val === 'number') {
    return excelSerialToIso(val);
  }

  if (typeof val === 'string') {
    let trimmed = val.trim();
    if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
      return null;
    }

    // Hilangkan akhiran indikator usia hasil ekspor seperti " (43 Thn)" atau " (43 Tahun)"
    trimmed = trimmed.replace(/\s*\(\d+\s*(?:thn|tahun)\)\s*$/i, '').trim();
    if (!trimmed) {
      return null;
    }

    // Format ISO: YYYY-MM-DD atau YYYY/MM/DD (opsional dengan timestamp ISO T...)
    const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10);
      const d = parseInt(isoMatch[3], 10);
      return formatIsoParts(y, m, d);
    }

    // Format DD/MM/YYYY atau DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1], 10);
      const m = parseInt(dmyMatch[2], 10);
      const y = parseInt(dmyMatch[3], 10);
      return formatIsoParts(y, m, d);
    }

    // Nomor seri Excel dalam bentuk string numerik (misal "31187" -> "1985-05-20")
    if (/^\d{4,5}(?:\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num >= 1 && num <= 73050) {
        return excelSerialToIso(num);
      }
    }

    return null;
  }

  return null;
}

/**
 * Memformat tanggal lahir menjadi `dd/MM/yyyy` (contoh: `15/08/1983`), atau `-` jika kosong/tidak valid.
 */
export function formatTanggalLahir(dateStr?: string | null): string {
  const iso = parseBirthDateInput(dateStr);
  if (!iso) {
    return '-';
  }
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Memformat tanggal lahir menjadi format panjang Indonesia (contoh: `15 Agustus 1983`), atau `-` jika kosong.
 */
export function formatTanggalLahirLong(dateStr?: string | null): string {
  const iso = parseBirthDateInput(dateStr);
  if (!iso) {
    return '-';
  }
  const [y, m, d] = iso.split('-');
  const monthIdx = parseInt(m, 10) - 1;
  const monthName = INDONESIAN_MONTHS[monthIdx] || m;
  return `${parseInt(d, 10)} ${monthName} ${y}`;
}

/**
 * Menghitung usia anggota (dalam tahun penuh) berdasarkan tanggal referensi (default: hari ini).
 */
export function hitungUsia(
  dateStr?: string | null,
  referenceDate: Date = new Date()
): number | null {
  const iso = parseBirthDateInput(dateStr);
  if (!iso || isNaN(referenceDate.getTime())) {
    return null;
  }
  const [birthYear, birthMonth, birthDay] = iso.split('-').map((p) => parseInt(p, 10));
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  let age = refYear - birthYear;
  if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/**
 * Memformat tanggal lahir lengkap dengan indikator usia, misal `15/08/1983 (43 Thn)`
 * atau `15 Agustus 1983 (43 Tahun)` jika `options.long === true`.
 */
export function formatTanggalLahirWithAge(
  dateStr?: string | null,
  options?: { long?: boolean; referenceDate?: Date }
): string {
  const formatted = options?.long
    ? formatTanggalLahirLong(dateStr)
    : formatTanggalLahir(dateStr);
  if (formatted === '-') {
    return '-';
  }
  const age = hitungUsia(dateStr, options?.referenceDate);
  if (age === null) {
    return formatted;
  }
  return options?.long ? `${formatted} (${age} Tahun)` : `${formatted} (${age} Thn)`;
}

export const formatBirthDate = formatTanggalLahir;
export const calculateAge = hitungUsia;

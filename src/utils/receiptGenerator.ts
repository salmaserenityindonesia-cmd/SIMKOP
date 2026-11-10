let sequenceOffset = Math.floor(Math.random() * 46656);

/**
 * Menghasilkan nomor kwitansi pembayaran cicilan yang terstruktur dan unik anti-bentrok.
 * Format: KW-PINJ/{loanNumber}/B{periodNumber}/{YYYYMMDD}-{RAND3}
 * Contoh: KW-PINJ/PINJ-MIGRASI-98119961/B42/20261110-A9Z
 *
 * @param loanNumber - Nomor identifikasi pinjaman (contoh: PINJ-MIGRASI-001)
 * @param periodNumber - Angka periode/tenor angsuran (contoh: 1, 42)
 * @param customDate - Opsional tanggal spesifik (default: new Date())
 * @returns String nomor kwitansi standar
 */
export function generateLoanReceiptNumber(
  loanNumber: string | null | undefined,
  periodNumber: number | string,
  customDate?: Date
): string {
  const cleanNumber = String(loanNumber || 'PINJ')
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '') || 'PINJ';

  const safePeriod = Math.max(1, Math.round(Number(periodNumber) || 1));

  const targetDate = customDate instanceof Date && !isNaN(customDate.getTime())
    ? customDate
    : new Date();

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  // 3 karakter acak alphanumeric (uppercase) untuk mencegah tabrakan/collision
  // Monotonic step mencegah tabrakan ketika pemanggilan beruntun dalam waktu singkat
  sequenceOffset = (sequenceOffset + Math.floor(Math.random() * 7) + 1) % 46656;
  const randSuffix = sequenceOffset.toString(36).toUpperCase().padStart(3, '0');

  return `KW-PINJ/${cleanNumber}/B${safePeriod}/${dateStr}-${randSuffix}`;
}

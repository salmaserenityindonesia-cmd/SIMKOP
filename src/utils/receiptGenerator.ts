export type RegisterPrefix = 'LN' | 'KW' | 'KS' | 'POS' | 'PB' | 'KB' | 'RB';

export const COMPACT_REGISTER_REGEX = /\b(?:LN|KW|KS|POS|PB|KB|RB)\d{4}-\d{4,}\b/i;

const syncSequenceMap: Record<RegisterPrefix, number> = {
  LN: 0,
  KW: 0,
  KS: 0,
  POS: 0,
  PB: 0,
  KB: 0,
  RB: 0,
};

/**
 * Mengurai tanggal dari Date atau string YYYY-MM-DD secara aman tanpa pergeseran timezone UTC.
 */
export function resolveValidDate(date?: Date | string | null): Date {
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return date;
  }

  if (typeof date === 'string') {
    const trimmed = date.trim();
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10);
      const day = parseInt(ymdMatch[3], 10);
      const localDate = new Date(year, month - 1, day);
      if (!Number.isNaN(localDate.getTime())) {
        return localDate;
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

/**
 * Membentuk prefix periode bulanan ringkas, misalnya `LN2611-` atau `POS2611-`.
 */
export function getCompactPeriodPrefix(
  prefix: RegisterPrefix,
  date: Date | string = new Date()
): string {
  const targetDate = resolveValidDate(date);
  const yy = String(targetDate.getFullYear()).slice(-2);
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  return `${prefix}${yy}${mm}-`;
}

/**
 * Membentuk kode register ringkas (11-12 karakter).
 * Contoh: LN2611-0001, KW2611-0001, KS2611-0001, POS2611-0001, PB2611-0001, KB2611-0001, RB2611-0001
 */
export function formatCompactRegister(
  prefix: RegisterPrefix,
  sequenceNumber: number,
  date: Date | string = new Date()
): string {
  const periodPrefix = getCompactPeriodPrefix(prefix, date);
  const seq = String(Math.max(1, Math.floor(sequenceNumber))).padStart(4, '0');
  return `${periodPrefix}${seq}`;
}

/**
 * Menghitung nomor urut berikutnya berdasarkan daftar nomor register yang sudah ada di bulan terkait.
 */
export function getNextCompactRegister(
  prefix: RegisterPrefix,
  existingCodes: Array<string | null | undefined>,
  date: Date | string = new Date()
): string {
  const targetDate = resolveValidDate(date);
  const periodPrefix = getCompactPeriodPrefix(prefix, targetDate);

  let maxSeq = 0;
  for (const code of existingCodes) {
    const clean = String(code || '').trim().toUpperCase();
    if (clean.startsWith(periodPrefix)) {
      const tail = clean.slice(periodPrefix.length);
      if (/^\d+$/.test(tail)) {
        const parsed = parseInt(tail, 10);
        if (!Number.isNaN(parsed) && parsed > maxSeq) {
          maxSeq = parsed;
        }
      }
    }
  }

  return formatCompactRegister(prefix, maxSeq + 1, targetDate);
}

/**
 * Menaikkan nomor urut pada kode register ringkas sebesar `step` untuk retry anti-bentrok.
 */
export function incrementCompactRegister(code: string, step: number = 1): string {
  const clean = String(code || '').trim();
  const match = clean.match(/^(LN|KW|KS|POS|PB|KB|RB)(\d{4})-(\d+)$/i);
  if (match) {
    const [, prefix, yymm, seqStr] = match;
    const nextSeq = Math.max(1, parseInt(seqStr, 10) + Math.max(1, Math.floor(step)));
    const width = Math.max(4, seqStr.length);
    return `${prefix.toUpperCase()}${yymm}-${String(nextSeq).padStart(width, '0')}`;
  }
  return `${clean}-${step}`;
}

/**
 * Mendeteksi error duplicate key / unique constraint PostgreSQL (23505).
 */
export function isUniqueConstraintError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '23505' ||
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    msg.includes('already exists')
  );
}

/**
 * Mengambil nomor urut ringkas berikutnya langsung dari tabel Supabase terkait
 * dengan fallback aman jika mock/tabel tidak mendukung filter ilike/like.
 */
export async function generateNextCompactRegister(
  supabaseClient: any,
  options: {
    table: string;
    column: string;
    prefix: RegisterPrefix;
    date?: Date | string;
    extraCodes?: Array<string | null | undefined>;
  }
): Promise<string> {
  const targetDate = resolveValidDate(options.date);
  const periodPrefix = getCompactPeriodPrefix(options.prefix, targetDate);
  const existingCodes: Array<string | null | undefined> = [...(options.extraCodes || [])];

  try {
    const tableRef = supabaseClient?.from?.(options.table);
    if (tableRef && typeof tableRef.select === 'function') {
      const sel = tableRef.select(options.column);
      let res: any = null;
      if (sel && typeof sel.ilike === 'function') {
        res = await sel.ilike(options.column, `${periodPrefix}%`);
      } else if (sel && typeof sel.like === 'function') {
        res = await sel.like(options.column, `${periodPrefix}%`);
      }

      if (res && !res.error && Array.isArray(res.data)) {
        for (const row of res.data) {
          existingCodes.push(row?.[options.column]);
        }
      }
    }
  } catch {
    // Non-blocking fallback when mock/offline client lacks ilike/like
  }

  return getNextCompactRegister(options.prefix, existingCodes, targetDate);
}

/**
 * Menghasilkan nomor register ringkas secara sinkron & monotonik untuk fallback UI/offline.
 */
export function generateCompactRegisterSync(
  prefix: RegisterPrefix,
  date?: Date | string
): string {
  const targetDate = resolveValidDate(date);
  const nextSeq = (syncSequenceMap[prefix] % 9999) + 1;
  syncSequenceMap[prefix] = nextSeq;
  return formatCompactRegister(prefix, nextSeq, targetDate);
}

/**
 * Menghasilkan nomor kwitansi pembayaran cicilan ringkas berformat KWYYMM-XXXX (11 karakter).
 *
 * @param _loanNumber - Nomor identifikasi pinjaman (dipertahankan demi kompatibilitas signature)
 * @param _periodNumber - Angka periode/tenor angsuran (dipertahankan demi kompatibilitas signature)
 * @param customDate - Opsional tanggal spesifik (default: new Date())
 * @param existingCodes - Opsional daftar kode kwitansi yang sudah ada untuk penentuan nomor urut
 * @returns String nomor kwitansi ringkas standar (contoh: KW2611-0001)
 */
export function generateLoanReceiptNumber(
  _loanNumber?: string | null,
  _periodNumber?: number | string,
  customDate?: Date,
  existingCodes?: Array<string | null | undefined>
): string {
  const targetDate = resolveValidDate(customDate);
  if (Array.isArray(existingCodes)) {
    return getNextCompactRegister('KW', existingCodes, targetDate);
  }
  return generateCompactRegisterSync('KW', targetDate);
}

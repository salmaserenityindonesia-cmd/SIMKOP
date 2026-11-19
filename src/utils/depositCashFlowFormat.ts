/**
 * Shared pure formatting and classification helpers for savings matrix deposit
 * cash_flow descriptions and category normalization.
 */

export const SHORT_MONTH_NAMES_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Ags',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

export interface MatrixDepositDescriptionParams {
  depositTypeName?: string | null;
  month?: number | null;
  year?: number | null;
  memberNrp?: string | null;
  memberName?: string | null;
  referenceNo?: string | null;
}

/**
 * Checks whether a cash_flow category represents an individual/matrix savings deposit.
 */
export function isSavingsDepositCategory(category?: string | null): boolean {
  const normalized = String(category || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  return normalized === 'SETORAN_SIMPANAN' || normalized === 'SIMPANAN';
}

/**
 * Formats period (month, year) into concise Indonesian label e.g. `Mar 2026`.
 */
export function formatMatrixDepositPeriodLabel(
  month?: number | null,
  year?: number | null
): string {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y <= 0) {
    return '-';
  }
  return `${SHORT_MONTH_NAMES_ID[m - 1]} ${y}`;
}

/**
 * Formats period (month, year) into short matrix column label e.g. `Mar-26`.
 */
export function formatMatrixDepositShortPeriod(
  month?: number | null,
  year?: number | null
): string {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y <= 0) {
    return '-';
  }
  return `${SHORT_MONTH_NAMES_ID[m - 1]}-${String(y).slice(-2)}`;
}

/**
 * Formats an auditable matrix deposit description for public.cash_flow:
 * `Setoran [Jenis Simpanan] ([Periode])` -> `Setoran [Jenis Simpanan] [Periode] — [NRP] - [Nama] ([No. Kwitansi])`
 */
export function formatMatrixDepositCashFlowDescription(
  params: MatrixDepositDescriptionParams
): string {
  const depositLabel = (params.depositTypeName || '').trim() || 'Simpanan Anggota';
  const periodLabel = formatMatrixDepositPeriodLabel(params.month, params.year);
  const periodSegment = periodLabel !== '-' ? ` [${periodLabel}]` : '';

  const nrp = (params.memberNrp || '').trim();
  const nama = (params.memberName || '').trim();
  const hasValidNrp = nrp !== '' && nrp !== '-';
  const hasValidNama = nama !== '' && nama !== '-';

  let memberSegment = '';
  if (hasValidNrp && hasValidNama) {
    memberSegment = `${nrp} - ${nama}`;
  } else if (hasValidNama) {
    memberSegment = nama;
  } else if (hasValidNrp) {
    memberSegment = nrp;
  }

  const refNo = (params.referenceNo || '').trim();
  const kwitansiSuffix = refNo ? ` (${refNo})` : '';

  if (memberSegment) {
    return `Setoran ${depositLabel}${periodSegment} — ${memberSegment}${kwitansiSuffix}`;
  }
  return `Setoran ${depositLabel}${periodSegment}${kwitansiSuffix}`;
}

/**
 * Returns true if a deposit description belongs to opening balance / migration / cut-off entries.
 */
export function isOpeningOrMigrationDepositDescription(
  desc?: string | null
): boolean {
  const lower = String(desc || '').toLowerCase();
  if (!lower) return false;
  return (
    lower.includes('saldo awal') ||
    lower.includes('cut-off') ||
    lower.includes('migra') ||
    lower.includes('historical') ||
    lower.includes('one-time') ||
    lower.includes('belum teralokasi')
  );
}

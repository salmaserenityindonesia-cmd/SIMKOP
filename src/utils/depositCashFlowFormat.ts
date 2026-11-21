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

export const CANCELLATION_REVERSAL_CATEGORY = 'KOREKSI_PEMBATALAN';

export interface MatrixDepositDescriptionParams {
  depositTypeName?: string | null;
  month?: number | null;
  year?: number | null;
  memberNrp?: string | null;
  memberName?: string | null;
  referenceNo?: string | null;
}

export interface MatrixCancellationDescriptionParams {
  depositTypeName?: string | null;
  month?: number | null;
  year?: number | null;
  memberNrp?: string | null;
  memberName?: string | null;
  cancelReason?: string | null;
  adminName?: string | null;
}

export interface ParsedCancellationReversalDescription {
  depositTypeName: string | null;
  depositTypeCode: 'WAJIB' | 'BELANJA' | 'LEBARAN' | 'POKOK' | null;
  forMonth: number | null;
  forYear: number | null;
  periodLabel: string | null;
  shortPeriodLabel: string | null;
  memberNrp: string | null;
  memberName: string | null;
  cancelReason: string | null;
  adminName: string | null;
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
 * Checks whether a cash_flow category represents a matrix deposit cancellation reversal entry.
 */
export function isCancellationReversalCategory(category?: string | null): boolean {
  const normalized = String(category || '')
    .trim()
    .toUpperCase()
    .replace(/[\s/]+/g, '_');
  return (
    normalized === CANCELLATION_REVERSAL_CATEGORY ||
    normalized === 'PEMBATALAN_SETORAN' ||
    normalized === 'KOREKSI_PEMBATALAN_SETORAN'
  );
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

function buildMemberSegment(
  memberNrp?: string | null,
  memberName?: string | null
): string {
  const nrp = (memberNrp || '').trim();
  const nama = (memberName || '').trim();
  const hasValidNrp = nrp !== '' && nrp !== '-';
  const hasValidNama = nama !== '' && nama !== '-';

  if (hasValidNrp && hasValidNama) {
    return `${nrp} - ${nama}`;
  }
  if (hasValidNama) {
    return nama;
  }
  if (hasValidNrp) {
    return nrp;
  }
  return '';
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
  const memberSegment = buildMemberSegment(params.memberNrp, params.memberName);

  const refNo = (params.referenceNo || '').trim();
  const kwitansiSuffix = refNo ? ` (${refNo})` : '';

  if (memberSegment) {
    return `Setoran ${depositLabel}${periodSegment} — ${memberSegment}${kwitansiSuffix}`;
  }
  return `Setoran ${depositLabel}${periodSegment}${kwitansiSuffix}`;
}

/**
 * Formats an auditable matrix cancellation reversal description for public.cash_flow:
 * `Pembatalan Setoran [Jenis Simpanan] [Periode] — [NRP] - [Nama] | Alasan: "[Alasan]" (Oleh: [Admin])`
 */
export function formatMatrixCancellationCashFlowDescription(
  params: MatrixCancellationDescriptionParams
): string {
  const depositLabel = (params.depositTypeName || '').trim() || 'Simpanan Anggota';
  const periodLabel = formatMatrixDepositPeriodLabel(params.month, params.year);
  const periodSegment = periodLabel !== '-' ? ` [${periodLabel}]` : '';
  const memberSegment = buildMemberSegment(params.memberNrp, params.memberName);

  const cleanReason = String(params.cancelReason || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'");
  const cleanAdmin = String(params.adminName || '').trim() || 'Pengelola';

  const base = memberSegment
    ? `Pembatalan Setoran ${depositLabel}${periodSegment} — ${memberSegment}`
    : `Pembatalan Setoran ${depositLabel}${periodSegment}`;
  const reasonSegment = cleanReason ? ` | Alasan: "${cleanReason}"` : '';
  return `${base}${reasonSegment} (Oleh: ${cleanAdmin})`;
}

const CANCELLATION_MONTH_TOKEN_MAP: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mar: 3,
  maret: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  ags: 8,
  aug: 8,
  agustus: 8,
  sep: 9,
  september: 9,
  okt: 10,
  oct: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  des: 12,
  dec: 12,
  desember: 12,
};

function inferDepositTypeCodeFromLabel(
  label?: string | null
): 'WAJIB' | 'BELANJA' | 'LEBARAN' | 'POKOK' | null {
  const lower = String(label || '').toLowerCase();
  if (!lower) return null;
  if (lower.includes('wajib')) return 'WAJIB';
  if (lower.includes('belanja')) return 'BELANJA';
  if (lower.includes('lebaran') || lower.includes('hari raya')) return 'LEBARAN';
  if (lower.includes('pokok')) return 'POKOK';
  return null;
}

/**
 * Parses metadata from a `KOREKSI_PEMBATALAN` cash_flow description into structured audit fields.
 */
export function parseCancellationReversalDescription(
  description?: string | null
): ParsedCancellationReversalDescription {
  const empty: ParsedCancellationReversalDescription = {
    depositTypeName: null,
    depositTypeCode: null,
    forMonth: null,
    forYear: null,
    periodLabel: null,
    shortPeriodLabel: null,
    memberNrp: null,
    memberName: null,
    cancelReason: null,
    adminName: null,
  };

  let remaining = String(description || '').trim();
  if (!remaining) return empty;

  let adminName: string | null = null;
  const adminMatch = remaining.match(/\(\s*Oleh:\s*([^)]+?)\s*\)\s*$/i);
  if (adminMatch) {
    adminName = adminMatch[1].trim() || null;
    remaining = remaining.slice(0, adminMatch.index).trim();
  }

  let cancelReason: string | null = null;
  const quotedReasonMatch = remaining.match(/\|\s*Alasan:\s*"([^"]*)"\s*$/i);
  if (quotedReasonMatch) {
    cancelReason = quotedReasonMatch[1].trim() || null;
    remaining = remaining.slice(0, quotedReasonMatch.index).trim();
  } else {
    const plainReasonMatch = remaining.match(/\|\s*Alasan:\s*(.+?)\s*$/i);
    if (plainReasonMatch) {
      cancelReason = plainReasonMatch[1].trim() || null;
      remaining = remaining.slice(0, plainReasonMatch.index).trim();
    }
  }

  const parts = remaining.split(/\s+[—–]\s+/);
  const leftPart = (parts[0] || '').trim();
  const rightPart = parts.slice(1).join(' — ').trim();

  let depositTypeName: string | null = null;
  let forMonth: number | null = null;
  let forYear: number | null = null;
  let periodLabel: string | null = null;
  let shortPeriodLabel: string | null = null;

  if (leftPart) {
    let headerText = leftPart.replace(/^Pembatalan\s+Setoran\s+/i, '').trim();
    const periodMatch = headerText.match(/\[\s*([A-Za-z]+)[-\s]+(\d{2}|\d{4})\s*\]/);
    if (periodMatch) {
      const mToken = CANCELLATION_MONTH_TOKEN_MAP[periodMatch[1].toLowerCase()];
      const rawY = Number(periodMatch[2]);
      const yNum = periodMatch[2].length === 2 ? 2000 + rawY : rawY;
      if (mToken && mToken >= 1 && mToken <= 12 && Number.isInteger(yNum) && yNum > 0) {
        forMonth = mToken;
        forYear = yNum;
        periodLabel = formatMatrixDepositPeriodLabel(forMonth, forYear);
        shortPeriodLabel = formatMatrixDepositShortPeriod(forMonth, forYear);
      } else {
        periodLabel = `${periodMatch[1]} ${periodMatch[2]}`.trim();
      }
      headerText = headerText.replace(periodMatch[0], '').trim();
    }
    depositTypeName = headerText || null;
  }

  let memberNrp: string | null = null;
  let memberName: string | null = null;
  if (rightPart) {
    const nrpNameMatch = rightPart.match(/^(\S+)\s+-\s+(.+)$/);
    if (nrpNameMatch) {
      memberNrp = nrpNameMatch[1].trim() || null;
      memberName = nrpNameMatch[2].trim() || null;
    } else {
      memberName = rightPart;
    }
  }

  return {
    depositTypeName,
    depositTypeCode: inferDepositTypeCodeFromLabel(depositTypeName),
    forMonth,
    forYear,
    periodLabel,
    shortPeriodLabel,
    memberNrp,
    memberName,
    cancelReason,
    adminName,
  };
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

const MEMBER_DEPOSIT_TYPE_PRIORITY: Record<string, number> = {
  Pokok: 1,
  Wajib: 2,
  Belanja: 3,
  Lebaran: 4,
  'Angsuran Pinjaman': 6,
};

/**
 * Normalizes a deposit type code or name into a concise Indonesian short label
 * (`Pokok`, `Wajib`, `Belanja`, `Lebaran`, `Angsuran Pinjaman`, or cleaned custom name).
 */
export function normalizeDepositTypeShortName(
  codeOrName?: string | null,
  fallbackName?: string | null
): string | null {
  const code = String(codeOrName || '').trim().toUpperCase();
  const combined = `${codeOrName || ''} ${fallbackName || ''}`.trim().toLowerCase();

  if (!combined) return null;

  if (code === 'POKOK' || code === 'SP' || combined.includes('pokok')) {
    return 'Pokok';
  }
  if (code === 'WAJIB' || code === 'SW' || combined.includes('wajib')) {
    return 'Wajib';
  }
  if (
    code === 'BELANJA' ||
    code === 'SB' ||
    combined.includes('belanja') ||
    combined.includes('toko')
  ) {
    return 'Belanja';
  }
  if (
    code === 'LEBARAN' ||
    code === 'SL' ||
    code === 'SHR' ||
    code === 'HARI_RAYA' ||
    code === 'THR' ||
    combined.includes('lebaran') ||
    combined.includes('hari raya')
  ) {
    return 'Lebaran';
  }
  if (
    code === 'PINJAMAN' ||
    combined.includes('pinjaman') ||
    combined.includes('angsuran')
  ) {
    return 'Angsuran Pinjaman';
  }

  const fbTrimmed = String(fallbackName || '').trim();
  const rawCandidate =
    fbTrimmed && fbTrimmed !== '-' ? fbTrimmed : String(codeOrName || '').trim();
  if (!rawCandidate || rawCandidate === '-') return null;

  const cleaned = rawCandidate
    .replace(/^setoran\s+/i, '')
    .replace(/^simpanan\s+/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();

  if (!cleaned || cleaned === '-') return null;
  return cleaned;
}

/**
 * Deduplicates and canonically orders member deposit component short labels
 * (`Pokok`, `Wajib`, `Belanja`, `Lebaran`, custom types, `Angsuran Pinjaman`).
 */
export function buildMemberDepositTypeSummary(
  inputs: Array<{ code?: string | null; name?: string | null; category?: string | null }>
): string {
  const uniqueByLower = new Map<string, string>();

  for (const item of inputs) {
    const shortName =
      item?.category === 'loan'
        ? 'Angsuran Pinjaman'
        : normalizeDepositTypeShortName(item?.code, item?.name);
    if (!shortName) continue;
    const key = shortName.toLowerCase();
    if (!uniqueByLower.has(key)) {
      uniqueByLower.set(key, shortName);
    }
  }

  const sorted = Array.from(uniqueByLower.values()).sort((a, b) => {
    const prioA = MEMBER_DEPOSIT_TYPE_PRIORITY[a] ?? 5;
    const prioB = MEMBER_DEPOSIT_TYPE_PRIORITY[b] ?? 5;
    if (prioA !== prioB) return prioA - prioB;
    return a.localeCompare(b, 'id');
  });

  return sorted.join(', ');
}

/**
 * Checks whether a `SETORAN_ANGGOTA` description already embeds deposit type components
 * like `Setoran Anggota (Wajib, Belanja) — ...`.
 */
export function hasMemberDepositTypeComponents(description?: string | null): boolean {
  return /^Setoran\s+Anggota\s*\([^)]+\)/i.test(String(description || '').trim());
}

/**
 * Formats a `SETORAN_ANGGOTA` cash_flow description including deposit type components:
 * `Setoran Anggota (${typeSummary}) — ${nama} (${nrp}) - ${metode} [${kwitansi}]`.
 */
export function formatMemberDepositCashFlowDescription(params: {
  typeSummary?: string | null;
  memberName?: string | null;
  memberNrp?: string | null;
  paymentMethodLabel?: string | null;
  receiptNo?: string | null;
}): string {
  const nama = String(params.memberName || '').trim() || 'Anggota';
  const nrp = String(params.memberNrp || '').trim();
  const nrpSeg = nrp && nrp !== '-' ? ` (${nrp})` : '';
  const method = String(params.paymentMethodLabel || '').trim();
  const methodSeg = method ? ` - ${method}` : '';
  const receipt = String(params.receiptNo || '').trim();
  const receiptSeg = receipt ? ` [${receipt}]` : '';
  const tail = `${nama}${nrpSeg}${methodSeg}${receiptSeg}`;

  const summary = String(params.typeSummary || '').trim();
  if (summary) {
    return `Setoran Anggota (${summary}) — ${tail}`;
  }
  return `Setoran Anggota ${tail}`;
}

/**
 * Idempotently injects resolved deposit type components into an existing `SETORAN_ANGGOTA`
 * description without duplicating components or altering already-enriched entries.
 */
export function injectDepositTypesIntoMemberDepositDescription(
  originalDescription: string | null | undefined,
  typeSummary: string,
  fallbackMeta?: {
    memberName?: string | null;
    memberNrp?: string | null;
    paymentMethodLabel?: string | null;
    receiptNo?: string | null;
  }
): string {
  const summary = String(typeSummary || '').trim();
  const orig = String(originalDescription || '').trim();

  if (!summary) return orig;
  if (hasMemberDepositTypeComponents(orig)) return orig;

  if (!orig || orig === '-') {
    return formatMemberDepositCashFlowDescription({
      typeSummary: summary,
      ...fallbackMeta,
    });
  }

  if (/^Setoran\s+Anggota\b/i.test(orig)) {
    const rest = orig.replace(/^Setoran\s+Anggota(?:\s*[—–-]\s*|\s+)/i, '').trim();
    if (rest) {
      return `Setoran Anggota (${summary}) — ${rest}`;
    }
    return formatMemberDepositCashFlowDescription({
      typeSummary: summary,
      ...fallbackMeta,
    });
  }

  return `Setoran Anggota (${summary}) — ${orig}`;
}

/**
 * Extracts individual deposit type component labels from an enriched
 * `Setoran Anggota (Wajib, Belanja, Lebaran) — ...` description.
 */
export function parseMemberDepositDescriptionComponents(
  description?: string | null
): string[] {
  const match = String(description || '')
    .trim()
    .match(/^Setoran\s+Anggota\s*\(([^)]+)\)\s*[—–-]/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

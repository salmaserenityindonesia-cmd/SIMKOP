/**
 * Shared pure formatting and classification helpers for member resignation
 * clearance cash_flow entries, description formatting, and status detection.
 */

export const MEMBER_CLEARANCE_CATEGORY = 'KLIRING_ANGGOTA_KELUAR';

/**
 * Checks whether a cash_flow category represents a member resignation clearance.
 */
export function isMemberClearanceCategory(category?: string | null): boolean {
  const normalized = String(category || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  return normalized === MEMBER_CLEARANCE_CATEGORY;
}

/**
 * Strips the resigned trigger prefix `(lama X) ` from member NRP so display and audit
 * strings retain the clean original NRP (e.g., `(lama 1) 00010062` -> `00010062`).
 */
export function stripResignedNrpPrefix(nrp?: string | null): string {
  return String(nrp || '')
    .trim()
    .replace(/^\(lama\s*\d+\)\s*/i, '')
    .trim();
}

/**
 * Distinguishes permanently resigned members from temporarily suspended, blocked,
 * or pending-resignation debtor members (who may also have `status = 'nonaktif'`).
 */
export function isResignedMemberRecord(
  member?: { status?: string | null; membership_status?: string | null } | null
): boolean {
  if (!member) return false;
  const mst = String(member.membership_status || '').trim().toUpperCase();
  const st = String(member.status || '').trim().toLowerCase();
  return mst === 'RESIGNED' || st === 'keluar' || (!mst && st === 'nonaktif');
}

/**
 * Checks whether a `deposit_transactions` row is an explicit clearance closing withdrawal.
 */
export function isClearanceWithdrawalTx(
  tx?: {
    transaction_type?: string | null;
    description?: string | null;
    notes?: string | null;
    reference_no?: string | null;
  } | null
): boolean {
  if (!tx || tx.transaction_type !== 'withdrawal') return false;
  const desc = String(tx.description || '');
  const notes = String(tx.notes || '');
  const refUpper = String(tx.reference_no || '').trim().toUpperCase();
  const pattern = /kliring|pengunduran\s*diri|clearance|resign|penutupan\s*(rekening|simpanan)/i;
  return (
    pattern.test(desc) ||
    pattern.test(notes) ||
    refUpper.startsWith('CLR-') ||
    refUpper.startsWith('KLR-')
  );
}

/**
 * Checks whether a `loan_repayments` row represents a clearance loan payoff offset.
 */
export function isClearanceLoanRepayment(
  repay?: { payment_method?: string | null; notes?: string | null } | null
): boolean {
  if (!repay) return false;
  const methodUpper = String(repay.payment_method || '').toUpperCase();
  const notes = String(repay.notes || '');
  return (
    methodUpper.includes('KLIRING') ||
    /kliring|pengunduran\s*diri|net\s*settlement|clearance/i.test(notes)
  );
}

export interface MemberClearanceDescriptionParams {
  memberNrp?: string | null;
  memberName?: string | null;
  totalSavings: number;
  totalDebtOffset: number;
  netSettlement: number;
}

/**
 * Formats an informative audit description for a `KLIRING_ANGGOTA_KELUAR` cash_flow entry.
 */
export function formatMemberClearanceCashFlowDescription(
  params: MemberClearanceDescriptionParams
): string {
  const fmtId = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n));
  const fmtSavings = fmtId(Math.max(0, Number(params.totalSavings || 0)));
  const fmtDebt = fmtId(Math.max(0, Number(params.totalDebtOffset || 0)));
  const netVal = Number(params.netSettlement || 0);
  const fmtNet = fmtId(Math.abs(netVal));

  const cleanNrp = stripResignedNrpPrefix(params.memberNrp);
  const cleanName = String(params.memberName || '').trim();
  const hasValidNrp = cleanNrp !== '' && cleanNrp !== '-';
  const hasValidName = cleanName !== '' && cleanName !== '-';

  let memberSegment = 'Anggota';
  if (hasValidNrp && hasValidName) {
    memberSegment = `${cleanNrp} - ${cleanName}`;
  } else if (hasValidName) {
    memberSegment = cleanName;
  } else if (hasValidNrp) {
    memberSegment = cleanNrp;
  }

  const actionLabel =
    netVal >= 0
      ? `Kas Dibayarkan: Rp ${fmtNet}`
      : `Kekurangan Disetor Anggota: Rp ${fmtNet}`;

  return `Kliring Pengunduran Diri — ${memberSegment} | Hak Simpanan: Rp ${fmtSavings}, Potong Utang: Rp ${fmtDebt}, ${actionLabel}`;
}

export interface ClearanceCashFlowRowLike {
  id?: string | null;
  category?: string | null;
  kategori?: string | null;
  reference_id?: string | null;
  description?: string | null;
  deskripsi?: string | null;
  created_at?: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compareAscii(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Extracts the member NRP from a `KLIRING_ANGGOTA_KELUAR` description header
 * (restricted before `|` so currency amounts after `|` are never matched).
 */
export function extractNrpFromClearanceDescription(description?: string | null): string | null {
  const raw = String(description || '').trim();
  if (!raw || raw === '-') return null;

  const header = raw.split('|')[0] || raw;
  const structuredMatch = header.match(
    /(?:—|–|-)\s*(?:\(lama\s*\d+\)\s*)?([A-Za-z0-9./-]*\d{3,}[A-Za-z0-9./-]*)\s*-\s+/i
  );
  if (structuredMatch?.[1]) {
    return structuredMatch[1].trim();
  }

  const fallbackMatch = header.match(/\b(\d{6,})\b/);
  return fallbackMatch?.[1] ? fallbackMatch[1].trim() : null;
}

/**
 * Checks whether a clearance cash_flow description belongs to the given member NRP
 * using strict boundary matching on the pre-`|` header segment.
 */
export function descriptionContainsClearanceMemberNrp(
  description?: string | null,
  memberNrp?: string | null
): boolean {
  const cleanNrp = stripResignedNrpPrefix(memberNrp);
  if (!cleanNrp || cleanNrp === '-') return false;

  const extracted = extractNrpFromClearanceDescription(description);
  if (extracted && extracted.toLowerCase() === cleanNrp.toLowerCase()) {
    return true;
  }

  const raw = String(description || '').trim();
  if (!raw || raw === '-') return false;

  const header = raw.split('|')[0] || raw;
  const boundaryRegex = new RegExp(
    `(?:^|[^0-9A-Za-z])${escapeRegExp(cleanNrp)}(?:$|[^0-9A-Za-z])`,
    'i'
  );
  return boundaryRegex.test(header);
}

/**
 * Partitions `KLIRING_ANGGOTA_KELUAR` rows into canonical kept rows and duplicate rows
 * sorted deterministically by `created_at ASC, id ASC`.
 */
export function partitionDuplicateClearanceRows<T extends ClearanceCashFlowRowLike>(
  rows: T[]
): { kept: T[]; duplicates: T[] } {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { kept: [], duplicates: [] };
  }

  const clearanceRows = rows.filter((row) =>
    isMemberClearanceCategory(row?.category ?? row?.kategori)
  );
  if (clearanceRows.length === 0) {
    return { kept: [], duplicates: [] };
  }

  const sorted = [...clearanceRows].sort((a, b) => {
    const rawA = String(a?.created_at || '').trim();
    const rawB = String(b?.created_at || '').trim();
    const ta = rawA ? Date.parse(rawA) : NaN;
    const tb = rawB ? Date.parse(rawB) : NaN;

    if (Number.isFinite(ta) && Number.isFinite(tb)) {
      if (ta !== tb) return ta - tb;
    } else if (rawA !== rawB) {
      return compareAscii(rawA, rawB);
    }

    const idA = String(a?.id || '').toLowerCase();
    const idB = String(b?.id || '').toLowerCase();
    return compareAscii(idA, idB);
  });

  const kept: T[] = [];
  const duplicates: T[] = [];
  const seenRefIds = new Set<string>();
  const seenNrps = new Set<string>();
  const seenDescriptions = new Set<string>();

  for (const row of sorted) {
    const refKey = String(row?.reference_id || '').trim().toLowerCase();
    const rawDesc = String(row?.description ?? row?.deskripsi ?? '').trim();
    const nrpKey = (extractNrpFromClearanceDescription(rawDesc) || '').toLowerCase();
    const normalizedDesc = rawDesc && rawDesc !== '-' ? rawDesc.toLowerCase() : '';

    const isDuplicate =
      (refKey !== '' && seenRefIds.has(refKey)) ||
      (nrpKey !== '' && seenNrps.has(nrpKey)) ||
      (refKey === '' &&
        nrpKey === '' &&
        normalizedDesc !== '' &&
        seenDescriptions.has(normalizedDesc));

    if (isDuplicate) {
      duplicates.push(row);
      continue;
    }

    kept.push(row);
    if (refKey !== '') seenRefIds.add(refKey);
    if (nrpKey !== '') seenNrps.add(nrpKey);
    if (normalizedDesc !== '') seenDescriptions.add(normalizedDesc);
  }

  return { kept, duplicates };
}

/**
 * Removes duplicate `KLIRING_ANGGOTA_KELUAR` rows from an in-memory cash_flow array
 * while preserving the canonical earliest row and all non-clearance rows in order.
 */
export function deduplicateClearanceRowsInMemory<T extends ClearanceCashFlowRowLike>(
  rows: T[]
): T[] {
  if (!Array.isArray(rows) || rows.length <= 1) {
    return rows;
  }

  const { duplicates } = partitionDuplicateClearanceRows(rows);
  if (duplicates.length === 0) {
    return rows;
  }

  const duplicateSet = new Set<T>(duplicates);
  return rows.filter((row) => !duplicateSet.has(row));
}

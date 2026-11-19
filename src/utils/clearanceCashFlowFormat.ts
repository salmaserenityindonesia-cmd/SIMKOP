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

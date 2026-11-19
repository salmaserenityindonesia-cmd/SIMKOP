/**
 * Shared pure formatting and classification helpers for savings withdrawal
 * cash_flow descriptions and category normalization.
 */

export interface IndividualWithdrawalDescriptionParams {
  depositTypeName?: string | null;
  depositTypeCode?: string | null;
  memberNrp?: string | null;
  memberName?: string | null;
  amount: number;
  isBulkMemberRow?: boolean;
}

/**
 * Checks whether a cash_flow category represents a savings withdrawal.
 */
export function isSavingsWithdrawalCategory(category?: string | null): boolean {
  const normalized = String(category || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  return normalized === 'PENARIKAN_SIMPANAN';
}

/**
 * Checks whether a deposit type code or name represents Simpanan Lebaran / Hari Raya.
 */
export function isLebaranDepositCodeOrName(
  code?: string | null,
  name?: string | null
): boolean {
  const c = String(code || '').toUpperCase().trim();
  const n = String(name || '').toLowerCase().trim();
  return (
    c.includes('LEBARAN') ||
    c === 'SL' ||
    c === 'THR' ||
    c === 'SHR' ||
    n.includes('lebaran') ||
    n.includes('hari raya')
  );
}

/**
 * Formats an individual savings withdrawal description for cash_flow.
 * Format: `Pencairan [Nama Jenis Simpanan] — [NRP] - [Nama Anggota] (Rp [Nominal])`
 */
export function formatIndividualWithdrawalCashFlowDescription(
  params: IndividualWithdrawalDescriptionParams
): string {
  const roundedAmount = Math.round(Number(params.amount || 0));
  const formattedAmount = new Intl.NumberFormat('id-ID').format(roundedAmount);
  const baseTypeName = (params.depositTypeName || '').trim() || 'Simpanan Anggota';
  const isLebaran = isLebaranDepositCodeOrName(params.depositTypeCode, baseTypeName);

  let labelJenis = baseTypeName;
  if (params.isBulkMemberRow) {
    labelJenis = baseTypeName.includes('(Massal)')
      ? baseTypeName
      : `${baseTypeName} (Massal)`;
  } else if (isLebaran && !baseTypeName.toLowerCase().includes('(personal)')) {
    labelJenis = `${baseTypeName} (Personal)`;
  }

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

  if (memberSegment) {
    return `Pencairan ${labelJenis} — ${memberSegment} (Rp ${formattedAmount})`;
  }
  return `Pencairan ${labelJenis} (Rp ${formattedAmount})`;
}

/**
 * Formats an aggregate bulk Lebaran withdrawal description for cash_flow.
 * Format: `Pencairan Massal Simpanan Lebaran ([Nama Siklus]) — [X] Anggota (Rp [Total])`
 */
export function formatBulkLebaranCashFlowDescription(
  cycleName: string,
  recipientCount: number,
  totalAmount: number
): string {
  const cleanCycleName = (cycleName || '').trim() || 'Simpanan Lebaran';
  const count = Math.max(0, Math.round(Number(recipientCount || 0)));
  const formattedTotal = new Intl.NumberFormat('id-ID').format(
    Math.round(Number(totalAmount || 0))
  );
  return `Pencairan Massal Simpanan Lebaran (${cleanCycleName}) — ${count} Anggota (Rp ${formattedTotal})`;
}

/**
 * Returns true when a description is missing, blank, or just a placeholder dash.
 */
export function isBlankOrDashDescription(desc?: string | null): boolean {
  if (!desc) return true;
  const trimmed = desc.trim();
  return trimmed === '' || trimmed === '-';
}

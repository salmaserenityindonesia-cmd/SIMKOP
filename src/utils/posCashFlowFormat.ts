/**
 * Shared pure formatting, classification, and terminology normalization helpers
 * for POS cash sale cash_flow descriptions and modal labels.
 */

export interface PosCashFlowDescriptionParams {
  saleNumber?: string | null;
  memberNrp?: string | null;
  memberName?: string | null;
  amount: number;
}

export interface PosPaymentSchemeParams {
  paymentScheme?: string | null;
  paidCash?: number | null;
  paidDeposit?: number | null;
  paidCredit?: number | null;
}

/**
 * Checks whether a cash_flow category represents an individual POS sale entry.
 * Explicitly excludes shift-level `PENJUALAN_KASIR_TUNAI`.
 */
export function isPosCashSaleCategory(category?: string | null): boolean {
  const normalized = String(category || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  return normalized === 'PENJUALAN_TUNAI' || normalized === 'PENJUALAN_POS';
}

/**
 * Replaces legacy "Pembelian Tunai" phrasing with cooperative-perspective "Penjualan Tunai".
 */
export function sanitizePosTerminology(text?: string | null): string {
  const raw = String(text ?? '');
  if (!raw) return raw;
  return raw
    .replace(/pembelian\s+tunai/gi, 'Penjualan Tunai')
    .replace(/pembelian_tunai/gi, 'Penjualan Tunai');
}

/**
 * Formats POS payment scheme & channel breakdown into cooperative-standard Indonesian label.
 */
export function formatPosPaymentSchemeLabel(params: PosPaymentSchemeParams): string {
  const paidCash = Math.max(0, Number(params.paidCash || 0));
  const paidDeposit = Math.max(0, Number(params.paidDeposit || 0));
  const paidCredit = Math.max(0, Number(params.paidCredit || 0));

  const positiveChannels = [paidCash > 0, paidDeposit > 0, paidCredit > 0].filter(Boolean).length;
  if (positiveChannels > 1) {
    return 'Penjualan Campuran';
  }
  if (paidCash > 0) {
    return 'Penjualan Tunai';
  }
  if (paidDeposit > 0) {
    return 'Penjualan Potong Simpanan';
  }
  if (paidCredit > 0) {
    return 'Penjualan Bon Toko';
  }

  const normalizedScheme = String(params.paymentScheme || '')
    .trim()
    .toLowerCase();

  switch (normalizedScheme) {
    case 'split':
    case 'campuran':
    case 'penjualan campuran':
      return 'Penjualan Campuran';
    case 'store_credit':
    case 'bon':
    case 'bon toko':
    case 'kredit':
    case 'penjualan bon toko':
      return 'Penjualan Bon Toko';
    case 'deposit':
    case 'simpanan':
    case 'potong simpanan':
    case 'penjualan potong simpanan':
      return 'Penjualan Potong Simpanan';
    case '':
    case 'cash':
    case 'tunai':
    case 'penjualan tunai':
    case 'penjualan_tunai':
    case 'pembelian tunai':
    case 'pembelian_tunai':
      return 'Penjualan Tunai';
    default:
      return sanitizePosTerminology(String(params.paymentScheme || '').trim());
  }
}

/**
 * Formats an auditable POS cash sale description for public.cash_flow:
 * `Penjualan Tunai (${sale_number}) — ${nrp} - ${nama} (Rp ${nominal})`
 */
export function formatPosCashFlowDescription(params: PosCashFlowDescriptionParams): string {
  const cleanSaleNumber = String(params.saleNumber || '').trim();
  const saleNumber = cleanSaleNumber && cleanSaleNumber !== '-' ? cleanSaleNumber : '';

  const nrp = String(params.memberNrp || '').trim();
  const nama = String(params.memberName || '').trim();
  const hasValidNrp = nrp !== '' && nrp !== '-';
  const hasValidNama = nama !== '' && nama !== '-';

  let buyerInfo = 'Pelanggan Umum';
  if (hasValidNrp && hasValidNama) {
    buyerInfo = `${nrp} - ${nama}`;
  } else if (hasValidNama) {
    buyerInfo = nama;
  } else if (hasValidNrp) {
    buyerInfo = nrp;
  }

  const fmtCash = new Intl.NumberFormat('id-ID').format(
    Math.round(Number(params.amount || 0))
  );

  if (saleNumber) {
    return `Penjualan Tunai (${saleNumber}) — ${buyerInfo} (Rp ${fmtCash})`;
  }
  return `Penjualan Tunai — ${buyerInfo} (Rp ${fmtCash})`;
}

/**
 * Returns true if a POS cash_flow description is missing, placeholder, or uses legacy terminology.
 */
export function needsPosDescriptionEnrichment(desc?: string | null): boolean {
  const trimmed = String(desc ?? '').trim();
  return (
    trimmed === '' ||
    trimmed === '-' ||
    trimmed.toLowerCase() === 'penjualan kasir tunai' ||
    /pembelian[\s_]+tunai/i.test(trimmed)
  );
}

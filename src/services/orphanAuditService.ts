import { supabase } from '../lib/supabaseClient';
import { fetchAllPaginated } from '../utils/supabasePagination';
import { stripResignedNrpPrefix } from '../utils/clearanceCashFlowFormat';

export const ORPHAN_AUDIT_UPDATED_EVENT = 'simkop:orphan-audit-updated';

export function notifyOrphanAuditUpdated(): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(ORPHAN_AUDIT_UPDATED_EVENT));
    }
  } catch {
    // Non-blocking in SSR/non-browser environments
  }
}

export type OrphanSourceTable =
  | 'cash_flow'
  | 'loans'
  | 'member_deposits'
  | 'loan_schedules'
  | 'loan_repayments'
  | 'deposit_transactions';

export type OrphanAnomalyType = 'orphan_delete' | 'missing_receipt_and_cashflow';

export type OrphanModuleCategory =
  | 'Arus Kas Pinjaman'
  | 'Arus Kas Simpanan'
  | 'Arus Kas Retail/Bon'
  | 'Kontrak Pinjaman'
  | 'Rekening Simpanan'
  | 'Jadwal Angsuran'
  | 'Pembayaran Angsuran'
  | 'Transaksi Simpanan'
  | 'Angsuran Tanpa Kwitansi/Kas';

export interface OrphanRecordItem {
  id: string;
  sourceTable: OrphanSourceTable;
  anomalyType?: OrphanAnomalyType;
  recommendedActionLabel?: string;
  referenceCode: string;
  transactionDate: string;
  moduleCategory: OrphanModuleCategory;
  description: string;
  amount: number;
  direction?: 'in' | 'out' | 'neutral';
  missingTarget: string;
  reason: string;
  rawRecord: Record<string, any>;
}

export interface OrphanScanSummary {
  totalCount: number;
  cashInImpact: number;
  cashOutImpact: number;
  cashFlowOrphanCount: number;
  orphanDeleteCount: number;
  missingSyncCount: number;
  missingSyncAmount: number;
}

export interface SyncUnreceiptedInstallmentsResult {
  syncedCount: number;
  createdReceiptsCount: number;
  createdCashFlowsCount: number;
  skippedCount: number;
  errors: string[];
}

export interface OrphanScanResult {
  items: OrphanRecordItem[];
  scannedAt: string;
  summary: OrphanScanSummary;
}

export interface OrphanScanDataset {
  cashFlows: any[];
  loans: any[];
  loanSchedules: any[];
  loanRepayments: any[];
  loanInstallments?: any[];
  members: any[];
  memberDeposits: any[];
  depositTransactions: any[];
  lebaranCycles: any[];
  sales: any[];
  storeCreditPayments: any[];
}

const EXEMPT_CASH_FLOW_CATEGORIES = new Set<string>([
  'SALDO_AWAL_SIMPANAN',
  'SALDO_AWAL',
  'SALDO-AWAL',
  'MODAL_KASIR_AWAL',
  'PENUTUPAN_KASIR',
  'PENJUALAN_KASIR_TUNAI',
  'BEBAN_OPERASIONAL',
  'RESTOCK_SUPPLIER',
  'PEMBELIAN_BARANG',
  'PEMBAGIAN_SHU_RAT',
  'KOREKSI_PEMBATALAN',
]);

const ALLOWED_DELETE_TABLES = new Set<OrphanSourceTable>([
  'cash_flow',
  'loans',
  'member_deposits',
  'loan_schedules',
  'loan_repayments',
  'deposit_transactions',
]);

function isPostgrestColumnOrMissingTableError(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('column') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

function normalizeCategoryKey(category?: string | null): string {
  return String(category || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function isEightDigitDateStamp(token: string): boolean {
  return /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(token);
}

function extractContractCodes(description: string): string[] {
  const matches =
    description.match(/\b((?:LOAN|PJ)-[A-Z0-9-]+|LN\d{4}-\d{4,}|SALDO-AWAL-[^\s—|,)\]"']+)/gi) || [];
  return Array.from(new Set(matches.map((m) => m.toUpperCase())));
}

function extractReceiptCodes(description: string): string[] {
  const matches =
    description.match(/\b(KW-[A-Z0-9/_-]+|(?:KW|KS|KB)\d{4}-\d{4,})\b/gi) || [];
  return Array.from(new Set(matches.map((m) => m.toUpperCase())));
}

function extractCandidateNrps(description: string): string[] {
  if (!description) return [];
  const cleaned = description.replace(
    /\b((?:LOAN|PJ)-[A-Z0-9-]+|SALDO-AWAL-[^\s—|,)\]"']+|KW-[A-Z0-9/_-]+|CF-[A-Z0-9-]+|(?:LN|KW|KS|POS|PB|KB|RB)\d{4}-\d{4,})\b/gi,
    ' '
  );

  const candidates: string[] = [];

  const explicitNrpRegex = /NRP[:\s.-]*([A-Z0-9-]{4,20})/gi;
  let match: RegExpExecArray | null;
  while ((match = explicitNrpRegex.exec(cleaned)) !== null) {
    if (match[1]) candidates.push(match[1].trim().toUpperCase());
  }

  const parenRegex = /\(\s*(\d{5,18})\s*\)/g;
  while ((match = parenRegex.exec(cleaned)) !== null) {
    if (match[1] && !isEightDigitDateStamp(match[1])) {
      candidates.push(match[1].trim().toUpperCase());
    }
  }

  const standaloneDigitsRegex = /\b(\d{6,18})\b/g;
  while ((match = standaloneDigitsRegex.exec(cleaned)) !== null) {
    const token = match[1];
    if (token && !isEightDigitDateStamp(token)) {
      candidates.push(token.toUpperCase());
    }
  }

  return Array.from(new Set(candidates));
}

async function fetchAllPaginatedRows<T = any>(
  table: string,
  columns: string,
  fallbackColumns: string[] = []
): Promise<T[]> {
  const columnVariants = [columns, ...fallbackColumns];

  for (const cols of columnVariants) {
    try {
      const rows = await fetchAllPaginated<T>(async (from, to) => {
        const tableRef: any = supabase?.from?.(table);
        if (!tableRef || typeof tableRef.select !== 'function') {
          return { data: [], error: null };
        }

        let query: any = tableRef.select(cols);
        if (query && typeof query.order === 'function') {
          query = query.order('id', { ascending: true });
        }

        if (query && typeof query.range === 'function') {
          const res = await query.range(from, to);
          return res ?? { data: [], error: null };
        }

        if (query && typeof query.then === 'function') {
          if (from > 0) {
            return { data: [], error: null };
          }
          const res = await query;
          return res ?? { data: [], error: null };
        }

        return { data: [], error: null };
      }, 1000);

      return rows;
    } catch (err) {
      if (isPostgrestColumnOrMissingTableError(err)) {
        continue;
      }
      return [];
    }
  }

  return [];
}

function normalizeDateYmd(value?: string | null): string {
  if (!value) return '';
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function extractPeriodNumberFromText(text?: string | null): number | null {
  if (!text) return null;
  const match = String(text).match(
    /(?:\b(?:bln|bulan|angsuran)\s*ke[-\s]*|\bke[-\s]*|\/B)(\d+)\b/i
  );
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isLoanInstallmentCashFlowRow(cf: any): boolean {
  if (!cf) return false;
  if (String(cf.direction || '').trim().toLowerCase() === 'out') return false;
  const catKey = normalizeCategoryKey(cf.category);
  if (
    catKey === 'ANGSURAN_PINJAMAN' ||
    catKey === 'ANGSURAN_PEMBIAYAAN' ||
    catKey === 'ANGSURAN_PEMBIAYAAN_BARANG' ||
    catKey === 'PEMBAYARAN_PINJAMAN' ||
    catKey === 'PELUNASAN_PINJAMAN'
  ) {
    return true;
  }
  return (
    catKey.includes('ANGSURAN') &&
    (catKey.includes('PINJAMAN') || catKey.includes('PEMBIAYAAN'))
  );
}

export function buildOrphanScanSummary(items: OrphanRecordItem[]): OrphanScanSummary {
  let cashInImpact = 0;
  let cashOutImpact = 0;
  let cashFlowOrphanCount = 0;
  let missingSyncCount = 0;
  let missingSyncAmount = 0;

  for (const item of items) {
    const anomalyType: OrphanAnomalyType = item.anomalyType ?? 'orphan_delete';
    if (anomalyType === 'missing_receipt_and_cashflow') {
      missingSyncCount += 1;
      missingSyncAmount += Number(item.amount || 0);
      continue;
    }

    if (item.sourceTable === 'cash_flow') {
      cashFlowOrphanCount += 1;
      const amt = Number(item.amount || 0);
      if (item.direction === 'in') {
        cashInImpact += amt;
      } else if (item.direction === 'out') {
        cashOutImpact += amt;
      }
    }
  }

  return {
    totalCount: items.length,
    cashInImpact,
    cashOutImpact,
    cashFlowOrphanCount,
    orphanDeleteCount: items.length - missingSyncCount,
    missingSyncCount,
    missingSyncAmount,
  };
}

export function isPerPeriodMigrationRepayment(rep: any): boolean {
  if (!rep) return false;
  const methodUpper = String(rep.payment_method ?? rep.paymentMethod ?? '')
    .trim()
    .toUpperCase();
  const receiptUpper = String(rep.receipt_number ?? rep.receiptNumber ?? '')
    .trim()
    .toUpperCase();
  return methodUpper === 'SALDO_AWAL_MIGRASI' || receiptUpper.startsWith('KW-MIGRASI/');
}

export function isLegacyLumpSumSaldoAwalRepayment(rep: any): boolean {
  if (!rep || isPerPeriodMigrationRepayment(rep)) return false;
  const methodUpper = String(rep.payment_method ?? rep.paymentMethod ?? '')
    .trim()
    .toUpperCase();
  const notesLower = String(rep.notes ?? '').trim().toLowerCase();
  const hasScheduleId = Boolean(rep.schedule_id ?? rep.scheduleId);

  if (notesLower.includes('total terangsur saldo awal')) {
    return true;
  }
  return !hasScheduleId && (methodUpper === 'SALDO_AWAL' || methodUpper === 'MIGRASI_AWAL');
}

/**
 * Memfilter keluar baris gelondongan SALDO_AWAL / migrasi_awal lama apabila kontrak
 * sudah memiliki rekaman kwitansi per periode (`SALDO_AWAL_MIGRASI` / `KW-MIGRASI/...`).
 */
export function filterRedundantLegacySaldoAwalRepayments<T>(
  repayments: T[]
): { cleaned: T[]; redundant: T[] } {
  const list = Array.isArray(repayments) ? repayments : [];
  if (!list.some((r) => isPerPeriodMigrationRepayment(r))) {
    return { cleaned: list, redundant: [] };
  }
  const cleaned: T[] = [];
  const redundant: T[] = [];
  for (const rep of list) {
    if (isLegacyLumpSumSaldoAwalRepayment(rep)) {
      redundant.push(rep);
    } else {
      cleaned.push(rep);
    }
  }
  return { cleaned, redundant };
}

/**
 * Pure cross-table orphan analyzer so both runtime scanning and unit tests
 * share identical detection rules without duplicating logic.
 */
export function analyzeOrphanRecords(dataset: OrphanScanDataset): OrphanRecordItem[] {
  const validLoanIds = new Set<string>();
  const validLoanNumbers = new Set<string>();
  const memberIdsWithLoans = new Set<string>();

  for (const loan of dataset.loans || []) {
    if (loan?.id) validLoanIds.add(String(loan.id));
    if (loan?.loan_number) validLoanNumbers.add(String(loan.loan_number).trim().toUpperCase());
    if (loan?.member_id) memberIdsWithLoans.add(String(loan.member_id));
  }

  const validScheduleIds = new Set<string>();
  for (const sch of dataset.loanSchedules || []) {
    if (sch?.id) validScheduleIds.add(String(sch.id));
  }

  const validRepaymentIds = new Set<string>();
  for (const rep of dataset.loanRepayments || []) {
    if (rep?.id) validRepaymentIds.add(String(rep.id));
  }

  const validLoanInstallmentIds = new Set<string>();
  for (const inst of dataset.loanInstallments || []) {
    if (inst?.id) validLoanInstallmentIds.add(String(inst.id));
  }

  const validMemberIds = new Set<string>();
  const validMemberNrps = new Set<string>();
  const nrpToMemberId = new Map<string, string>();
  for (const member of dataset.members || []) {
    if (!member?.id) continue;
    const memberId = String(member.id);
    validMemberIds.add(memberId);

    const rawNrp = String(member.nrp || '').trim().toUpperCase();
    if (rawNrp) {
      validMemberNrps.add(rawNrp);
      nrpToMemberId.set(rawNrp, memberId);
      const stripped = stripResignedNrpPrefix(rawNrp).toUpperCase();
      if (stripped) {
        validMemberNrps.add(stripped);
        nrpToMemberId.set(stripped, memberId);
      }
    }
  }

  const validMemberDepositIds = new Set<string>();
  for (const md of dataset.memberDeposits || []) {
    if (md?.id) validMemberDepositIds.add(String(md.id));
  }

  const validDepositTxIds = new Set<string>();
  const validDepositReceipts = new Set<string>();
  for (const tx of dataset.depositTransactions || []) {
    if (tx?.id) validDepositTxIds.add(String(tx.id));
    if (tx?.reference_no) {
      validDepositReceipts.add(String(tx.reference_no).trim().toUpperCase());
    }
    const combinedText = `${String(tx?.notes || '')} ${String(tx?.description || '')}`;
    for (const code of extractReceiptCodes(combinedText)) {
      validDepositReceipts.add(code);
    }
  }

  const validLebaranCycleIds = new Set<string>();
  for (const cycle of dataset.lebaranCycles || []) {
    if (cycle?.id) validLebaranCycleIds.add(String(cycle.id));
  }

  const validSaleIds = new Set<string>();
  const validSaleNumbers = new Set<string>();
  for (const sale of dataset.sales || []) {
    if (sale?.id) validSaleIds.add(String(sale.id));
    if (sale?.sale_number) validSaleNumbers.add(String(sale.sale_number).trim().toUpperCase());
  }

  const validCreditPaymentIds = new Set<string>();
  const validCreditReceipts = new Set<string>();
  for (const cp of dataset.storeCreditPayments || []) {
    if (cp?.id) validCreditPaymentIds.add(String(cp.id));
    if (cp?.receipt_number) {
      validCreditReceipts.add(String(cp.receipt_number).trim().toUpperCase());
    }
  }

  const allValidReferenceIds = new Set<string>([
    ...validLoanIds,
    ...validScheduleIds,
    ...validRepaymentIds,
    ...validLoanInstallmentIds,
    ...validDepositTxIds,
    ...validMemberDepositIds,
    ...validMemberIds,
    ...validLebaranCycleIds,
    ...validSaleIds,
    ...validCreditPaymentIds,
  ]);

  const findings: OrphanRecordItem[] = [];

  // 1. Scan public.cash_flow
  for (const cf of dataset.cashFlows || []) {
    if (!cf?.id) continue;
    const id = String(cf.id);
    const referenceCode = `CF-${id.slice(0, 8).toUpperCase()}`;
    const transactionDate = String(cf.created_at || cf.transaction_date || '');
    const description = String(cf.description || '');
    const amount = Number(cf.amount || 0);
    const direction: 'in' | 'out' =
      String(cf.direction || '').toLowerCase() === 'out' ? 'out' : 'in';
    const refId = cf.reference_id ? String(cf.reference_id).trim() : '';
    const catKey = normalizeCategoryKey(cf.category);

    if (
      !catKey ||
      EXEMPT_CASH_FLOW_CATEGORIES.has(catKey) ||
      catKey.startsWith('SALDO_AWAL') ||
      catKey.startsWith('SALDO-AWAL')
    ) {
      continue;
    }

    const candidateNrps = extractCandidateNrps(description);
    const hasValidGenericRefId = Boolean(refId) && allValidReferenceIds.has(refId);

    // 1a. Mutasi Pinjaman & Pembiayaan
    if (catKey.includes('PINJAMAN') || catKey.includes('PEMBIAYAAN')) {
      const contractCodes = extractContractCodes(description);
      const hasValidRefId =
        hasValidGenericRefId || (Boolean(refId) && validLoanNumbers.has(refId.toUpperCase()));
      const hasValidContractInDesc = contractCodes.some((code) =>
        validLoanNumbers.has(code)
      );

      let missingTarget = '';
      let reason = '';

      if (contractCodes.length > 0 && !hasValidContractInDesc && !hasValidRefId) {
        missingTarget = 'loans (kontrak)';
        reason = `Nomor kontrak ${contractCodes.join(', ')} pada deskripsi tidak ditemukan di tabel loans.`;
      } else if (refId && !hasValidRefId) {
        missingTarget = 'loans / loan_schedules / loan_repayments / loan_installments';
        reason = `reference_id "${refId}" tidak ditemukan pada tabel loans, loan_schedules, loan_repayments, maupun loan_installments.`;
      } else if (!refId && !hasValidContractInDesc) {
        if (candidateNrps.length > 0) {
          const matchedMemberWithLoan = candidateNrps.some((nrp) => {
            const mId = nrpToMemberId.get(nrp);
            return Boolean(mId && memberIdsWithLoans.has(mId));
          });

          if (!matchedMemberWithLoan) {
            const anyMemberExists = candidateNrps.some((nrp) => validMemberNrps.has(nrp));
            if (anyMemberExists) {
              missingTarget = 'loans';
              reason = `Anggota NRP ${candidateNrps.join(', ')} tidak lagi memiliki data kontrak pinjaman di tabel loans (kemungkinan sudah dihapus) dan reference_id kosong.`;
            } else {
              missingTarget = 'loans / anggota';
              reason = `NRP ${candidateNrps.join(', ')} tidak ditemukan di tabel anggota dan kontrak pinjamannya tidak ada di tabel loans.`;
            }
          }
        } else if (validLoanIds.size === 0) {
          missingTarget = 'loans';
          reason =
            'Mutasi pinjaman tidak memiliki reference_id dan tabel loans saat ini kosong.';
        }
      }

      if (reason) {
        findings.push({
          id,
          sourceTable: 'cash_flow',
          anomalyType: 'orphan_delete',
          recommendedActionLabel: 'Hapus Permanen',
          referenceCode,
          transactionDate,
          moduleCategory: 'Arus Kas Pinjaman',
          description: description || `(${cf.category})`,
          amount,
          direction,
          missingTarget,
          reason,
          rawRecord: cf,
        });
      }
      continue;
    }

    // 1b. Mutasi Simpanan & Kliring
    if (
      catKey === 'SETORAN_ANGGOTA' ||
      catKey === 'SETORAN_SIMPANAN' ||
      catKey === 'SIMPANAN' ||
      catKey === 'PENARIKAN_SIMPANAN' ||
      catKey === 'KLIRING_ANGGOTA_KELUAR'
    ) {
      const receiptCodes = extractReceiptCodes(description);
      const hasValidReceiptInDesc = receiptCodes.some((code) =>
        validDepositReceipts.has(code)
      );
      const hasValidMemberNrp = candidateNrps.some((nrp) => validMemberNrps.has(nrp));

      let missingTarget = '';
      let reason = '';

      if (catKey === 'KLIRING_ANGGOTA_KELUAR') {
        const hasValidKliringRef =
          hasValidGenericRefId ||
          (Boolean(refId) &&
            (validMemberIds.has(refId) ||
              validDepositTxIds.has(refId) ||
              validMemberDepositIds.has(refId)));

        if (!hasValidKliringRef && !hasValidMemberNrp) {
          missingTarget = 'anggota / deposit_transactions';
          reason = refId
            ? `reference_id "${refId}" untuk kliring anggota keluar tidak ditemukan di tabel anggota maupun deposit_transactions.`
            : 'Data anggota atau transaksi penutupan untuk mutasi kliring keluar tidak ditemukan.';
        }
      } else if (catKey === 'PENARIKAN_SIMPANAN') {
        const hasValidWithdrawalRef =
          hasValidGenericRefId ||
          (Boolean(refId) &&
            (validDepositTxIds.has(refId) ||
              validMemberDepositIds.has(refId) ||
              validLebaranCycleIds.has(refId) ||
              validMemberIds.has(refId)));

        if (refId && !hasValidWithdrawalRef) {
          missingTarget = 'deposit_transactions / lebaran_disbursement_cycles';
          reason = `reference_id "${refId}" pada mutasi penarikan simpanan tidak ditemukan di deposit_transactions maupun lebaran_disbursement_cycles.`;
        } else if (!refId) {
          if (receiptCodes.length > 0 && !hasValidReceiptInDesc) {
            missingTarget = 'deposit_transactions';
            reason = `Kode kwitansi ${receiptCodes.join(', ')} pada penarikan simpanan tidak ditemukan di tabel deposit_transactions.`;
          } else if (
            receiptCodes.length === 0 &&
            candidateNrps.length > 0 &&
            !hasValidMemberNrp
          ) {
            missingTarget = 'anggota / deposit_transactions';
            reason = `NRP ${candidateNrps.join(', ')} pada penarikan simpanan tidak ditemukan di tabel anggota.`;
          }
        }
      } else {
        const hasValidDepositRef =
          hasValidGenericRefId ||
          (Boolean(refId) &&
            (validDepositTxIds.has(refId) ||
              validMemberDepositIds.has(refId) ||
              validMemberIds.has(refId) ||
              validDepositReceipts.has(refId.toUpperCase())));

        if (receiptCodes.length > 0 && !hasValidReceiptInDesc && !hasValidDepositRef) {
          missingTarget = 'deposit_transactions';
          reason = `Kode kwitansi ${receiptCodes.join(', ')} tidak lagi ditemukan di tabel deposit_transactions.`;
        } else if (refId && !hasValidDepositRef) {
          missingTarget = 'deposit_transactions / member_deposits / anggota';
          reason = `reference_id "${refId}" pada mutasi simpanan tidak ditemukan di deposit_transactions, member_deposits, maupun anggota.`;
        } else if (
          !refId &&
          receiptCodes.length === 0 &&
          candidateNrps.length > 0 &&
          !hasValidMemberNrp
        ) {
          missingTarget = 'anggota / deposit_transactions';
          reason = `NRP ${candidateNrps.join(', ')} pada mutasi simpanan tidak ditemukan di tabel anggota.`;
        }
      }

      if (reason) {
        findings.push({
          id,
          sourceTable: 'cash_flow',
          anomalyType: 'orphan_delete',
          recommendedActionLabel: 'Hapus Permanen',
          referenceCode,
          transactionDate,
          moduleCategory: 'Arus Kas Simpanan',
          description: description || `(${cf.category})`,
          amount,
          direction,
          missingTarget,
          reason,
          rawRecord: cf,
        });
      }
      continue;
    }

    // 1c. Mutasi Retail POS & Bon Toko
    if (
      catKey === 'PENJUALAN_TUNAI' ||
      catKey === 'PENJUALAN_POS' ||
      catKey === 'PELUNASAN_BON_TOKO'
    ) {
      let missingTarget = '';
      let reason = '';

      if (catKey === 'PELUNASAN_BON_TOKO') {
        const hasValidBonRef =
          hasValidGenericRefId ||
          (Boolean(refId) &&
            (validCreditPaymentIds.has(refId) ||
              validSaleIds.has(refId) ||
              validCreditReceipts.has(refId.toUpperCase())));
        if (refId && !hasValidBonRef) {
          missingTarget = 'store_credit_payments';
          reason = `reference_id "${refId}" pada pelunasan bon toko tidak ditemukan di tabel store_credit_payments maupun sales.`;
        }
      } else {
        const hasValidSaleRef =
          hasValidGenericRefId ||
          (Boolean(refId) &&
            (validSaleIds.has(refId) || validSaleNumbers.has(refId.toUpperCase())));
        if (refId && !hasValidSaleRef) {
          missingTarget = 'sales';
          reason = `reference_id "${refId}" pada penjualan POS tidak ditemukan di tabel sales.`;
        }
      }

      if (reason) {
        findings.push({
          id,
          sourceTable: 'cash_flow',
          anomalyType: 'orphan_delete',
          recommendedActionLabel: 'Hapus Permanen',
          referenceCode,
          transactionDate,
          moduleCategory: 'Arus Kas Retail/Bon',
          description: description || `(${cf.category})`,
          amount,
          direction,
          missingTarget,
          reason,
          rawRecord: cf,
        });
      }
    }
  }

  // 2. Scan public.loans without valid anggota or refinanced_loan_id
  for (const loan of dataset.loans || []) {
    if (!loan?.id) continue;
    const memberId = loan.member_id ? String(loan.member_id) : '';
    const refinancedLoanId = loan.refinanced_loan_id ? String(loan.refinanced_loan_id) : '';
    const missingMember = !memberId || !validMemberIds.has(memberId);
    const missingRefinancedLoan =
      refinancedLoanId !== '' && !validLoanIds.has(refinancedLoanId);

    if (missingMember || missingRefinancedLoan) {
      const id = String(loan.id);
      const loanCode = loan.loan_number
        ? String(loan.loan_number)
        : `LOAN-${id.slice(0, 8).toUpperCase()}`;
      findings.push({
        id,
        sourceTable: 'loans',
        anomalyType: 'orphan_delete',
        recommendedActionLabel: 'Hapus Permanen',
        referenceCode: loanCode,
        transactionDate: String(loan.created_at || loan.applied_at || ''),
        moduleCategory: 'Kontrak Pinjaman',
        description: String(
          loan.purpose || loan.item_description || loan.notes || `Kontrak pinjaman ${loanCode}`
        ),
        amount: Number(loan.amount ?? loan.principal_amount ?? 0),
        direction: 'neutral',
        missingTarget: missingMember ? 'anggota' : 'loans (refinanced_loan_id)',
        reason: missingMember
          ? `member_id "${memberId || '-'}" pada kontrak pinjaman tidak terdaftar di tabel anggota.`
          : `refinanced_loan_id "${refinancedLoanId}" pada kontrak pinjaman tidak ditemukan di tabel loans.`,
        rawRecord: loan,
      });
    }
  }

  // 3. Scan public.member_deposits without valid anggota
  for (const md of dataset.memberDeposits || []) {
    if (!md?.id) continue;
    const memberId = md.member_id ? String(md.member_id) : '';
    if (!memberId || !validMemberIds.has(memberId)) {
      const id = String(md.id);
      findings.push({
        id,
        sourceTable: 'member_deposits',
        anomalyType: 'orphan_delete',
        recommendedActionLabel: 'Hapus Permanen',
        referenceCode: `DEP-${id.slice(0, 8).toUpperCase()}`,
        transactionDate: String(md.updated_at || md.created_at || ''),
        moduleCategory: 'Rekening Simpanan',
        description: `Rekening simpanan yatim (member_id: ${memberId || '-'})`,
        amount: Number(md.balance || 0),
        direction: 'neutral',
        missingTarget: 'anggota',
        reason: `member_id "${memberId || '-'}" pada rekening simpanan tidak terdaftar di tabel anggota.`,
        rawRecord: md,
      });
    }
  }

  // 4. Scan public.deposit_transactions without valid member_deposits
  for (const dt of dataset.depositTransactions || []) {
    if (!dt?.id) continue;
    const memberDepositId = dt.member_deposit_id ? String(dt.member_deposit_id) : '';
    if (!memberDepositId || !validMemberDepositIds.has(memberDepositId)) {
      const id = String(dt.id);
      const refCode = dt.reference_no
        ? String(dt.reference_no)
        : `DTX-${id.slice(0, 8).toUpperCase()}`;
      findings.push({
        id,
        sourceTable: 'deposit_transactions',
        anomalyType: 'orphan_delete',
        recommendedActionLabel: 'Hapus Permanen',
        referenceCode: refCode,
        transactionDate: String(dt.created_at || ''),
        moduleCategory: 'Transaksi Simpanan',
        description: String(
          dt.description || dt.notes || `Transaksi simpanan yatim (${refCode})`
        ),
        amount: Number(dt.amount || 0),
        direction: 'neutral',
        missingTarget: 'member_deposits',
        reason: `member_deposit_id "${memberDepositId || '-'}" pada transaksi simpanan tidak ditemukan di tabel member_deposits.`,
        rawRecord: dt,
      });
    }
  }

  // 5. Scan public.loan_schedules without valid loans
  for (const sch of dataset.loanSchedules || []) {
    if (!sch?.id) continue;
    const loanId = sch.loan_id ? String(sch.loan_id) : '';
    if (!loanId || !validLoanIds.has(loanId)) {
      const id = String(sch.id);
      findings.push({
        id,
        sourceTable: 'loan_schedules',
        anomalyType: 'orphan_delete',
        recommendedActionLabel: 'Hapus Permanen',
        referenceCode: `SCH-${id.slice(0, 8).toUpperCase()}`,
        transactionDate: String(sch.due_date || sch.created_at || ''),
        moduleCategory: 'Jadwal Angsuran',
        description: `Jadwal angsuran ke-${sch.period_number ?? '-'} (loan_id: ${loanId || '-'})`,
        amount: Number(sch.target_amount || 0),
        direction: 'neutral',
        missingTarget: 'loans',
        reason: `loan_id "${loanId || '-'}" pada jadwal angsuran tidak ditemukan di tabel loans.`,
        rawRecord: sch,
      });
    }
  }

  // 6. Scan public.loan_repayments without valid loans or loan_schedules,
  //    or redundant legacy lump-sum SALDO_AWAL rows superseded by per-period SALDO_AWAL_MIGRASI receipts
  const loanIdsWithPerPeriodMigration = new Set<string>();
  for (const rep of dataset.loanRepayments || []) {
    if (rep?.loan_id && isPerPeriodMigrationRepayment(rep)) {
      loanIdsWithPerPeriodMigration.add(String(rep.loan_id));
    }
  }

  for (const rep of dataset.loanRepayments || []) {
    if (!rep?.id) continue;
    const loanId = rep.loan_id ? String(rep.loan_id) : '';
    const scheduleId = rep.schedule_id ? String(rep.schedule_id) : '';
    const missingLoan = !loanId || !validLoanIds.has(loanId);
    const missingSchedule = scheduleId !== '' && !validScheduleIds.has(scheduleId);

    if (missingLoan || missingSchedule) {
      const id = String(rep.id);
      findings.push({
        id,
        sourceTable: 'loan_repayments',
        anomalyType: 'orphan_delete',
        recommendedActionLabel: 'Hapus Permanen',
        referenceCode: `REP-${id.slice(0, 8).toUpperCase()}`,
        transactionDate: String(rep.payment_date || rep.created_at || ''),
        moduleCategory: 'Pembayaran Angsuran',
        description: `Pembayaran angsuran yatim (loan_id: ${loanId || '-'})`,
        amount: Number(rep.amount_paid || 0),
        direction: 'neutral',
        missingTarget: missingLoan ? 'loans' : 'loan_schedules',
        reason: missingLoan
          ? `loan_id "${loanId || '-'}" pada pembayaran angsuran tidak ditemukan di tabel loans.`
          : `schedule_id "${scheduleId}" pada pembayaran angsuran tidak ditemukan di tabel loan_schedules.`,
        rawRecord: rep,
      });
      continue;
    }

    if (loanIdsWithPerPeriodMigration.has(loanId) && isLegacyLumpSumSaldoAwalRepayment(rep)) {
      const id = String(rep.id);
      const receiptCode = rep.receipt_number
        ? String(rep.receipt_number).trim()
        : `REP-${id.slice(0, 8).toUpperCase()}`;
      findings.push({
        id,
        sourceTable: 'loan_repayments',
        anomalyType: 'orphan_delete',
        recommendedActionLabel: 'Hapus Permanen',
        referenceCode: receiptCode,
        transactionDate: String(rep.payment_date || rep.created_at || ''),
        moduleCategory: 'Pembayaran Angsuran',
        description: String(
          rep.notes || `Duplikasi saldo awal gelondongan (${receiptCode})`
        ),
        amount: Number(rep.amount_paid || 0),
        direction: 'neutral',
        missingTarget: 'duplikasi SALDO_AWAL',
        reason:
          'Rekaman gelondongan SALDO_AWAL lama ini sudah dipecah menjadi kwitansi per periode (SALDO_AWAL_MIGRASI / KW-MIGRASI) sehingga menyebabkan perhitungan ganda (double counting).',
        rawRecord: rep,
      });
    }
  }

  // 7. Scan paid loan_schedules missing loan_repayments and/or cash_flow entries
  const loanById = new Map<string, any>();
  for (const loan of dataset.loans || []) {
    if (loan?.id) loanById.set(String(loan.id), loan);
  }

  const memberById = new Map<string, any>();
  for (const member of dataset.members || []) {
    if (member?.id) memberById.set(String(member.id), member);
  }

  const repaymentsByScheduleId = new Map<string, any[]>();
  const repaymentsByLoanId = new Map<string, any[]>();
  for (const rep of dataset.loanRepayments || []) {
    if (!rep) continue;
    const schId = rep.schedule_id ? String(rep.schedule_id).trim() : '';
    if (schId) {
      const list = repaymentsByScheduleId.get(schId) ?? [];
      list.push(rep);
      repaymentsByScheduleId.set(schId, list);
    }
    const lId = rep.loan_id ? String(rep.loan_id).trim() : '';
    if (lId) {
      const list = repaymentsByLoanId.get(lId) ?? [];
      list.push(rep);
      repaymentsByLoanId.set(lId, list);
    }
  }

  const cfRefIds = new Set<string>();
  const cfLoanPeriodKeys = new Set<string>();
  const cfReceiptCodes = new Set<string>();
  const unperiodizedLoanCfPool = new Map<string, number>();

  for (const cf of dataset.cashFlows || []) {
    if (!isLoanInstallmentCashFlowRow(cf)) continue;
    const refId = cf.reference_id ? String(cf.reference_id).trim() : '';
    if (refId) cfRefIds.add(refId);

    const desc = String(cf.description || '');
    for (const rCode of extractReceiptCodes(desc)) {
      cfReceiptCodes.add(rCode);
    }

    const periodInDesc = extractPeriodNumberFromText(desc);
    if (periodInDesc !== null) {
      for (const rawContractCode of extractContractCodes(desc)) {
        const cleanContract = rawContractCode.split('/')[0];
        if (cleanContract) {
          cfLoanPeriodKeys.add(`${cleanContract}::${periodInDesc}`);
        }
      }
    } else if (refId && loanById.has(refId)) {
      unperiodizedLoanCfPool.set(
        refId,
        (unperiodizedLoanCfPool.get(refId) ?? 0) + Math.round(Number(cf.amount || 0))
      );
    }
  }

  for (const sch of dataset.loanSchedules || []) {
    if (!sch?.id) continue;
    const schId = String(sch.id);
    const loanId = sch.loan_id ? String(sch.loan_id) : '';
    const loan = loanId ? loanById.get(loanId) : null;
    if (!loan) continue;

    const paidAmt = Math.round(Number(sch.paid_amount ?? 0));
    const statusLower = String(sch.status || '').trim().toLowerCase();
    if (!(paidAmt > 0 || statusLower === 'paid')) continue;

    const amount = paidAmt > 0 ? paidAmt : Math.round(Number(sch.target_amount || 0));
    if (amount <= 0) continue;

    const member = loan.member_id ? memberById.get(String(loan.member_id)) ?? null : null;
    const loanNumber = String(
      loan.loan_number || `LOAN-${loanId.slice(0, 8).toUpperCase()}`
    ).trim();
    const loanNumberUpper = loanNumber.toUpperCase();
    const periodNumber = Number(sch.period_number || 0);

    const directReps = repaymentsByScheduleId.get(schId) ?? [];
    const fallbackReps = (repaymentsByLoanId.get(loanId) ?? []).filter((r) => {
      const nPeriod = extractPeriodNumberFromText(r?.notes);
      const recUpper = String(r?.receipt_number || '').trim().toUpperCase();
      return (
        (periodNumber > 0 && nPeriod === periodNumber) ||
        (periodNumber > 0 && recUpper.endsWith(`/B${periodNumber}`))
      );
    });
    const matchedReps = directReps.length > 0 ? directReps : fallbackReps;
    const hasReceipt = matchedReps.length > 0;

    let hasCashFlow = false;
    if (cfRefIds.has(schId)) {
      hasCashFlow = true;
    } else if (
      matchedReps.some(
        (r) =>
          (r?.id && cfRefIds.has(String(r.id))) ||
          (r?.receipt_number && cfReceiptCodes.has(String(r.receipt_number).trim().toUpperCase()))
      )
    ) {
      hasCashFlow = true;
    } else if (periodNumber > 0 && cfLoanPeriodKeys.has(`${loanNumberUpper}::${periodNumber}`)) {
      hasCashFlow = true;
    } else if (hasReceipt) {
      const poolAmt = unperiodizedLoanCfPool.get(loanId) ?? 0;
      if (poolAmt >= amount - 5) {
        unperiodizedLoanCfPool.set(loanId, Math.max(0, poolAmt - amount));
        hasCashFlow = true;
      }
    }

    if (!hasReceipt || !hasCashFlow) {
      const previewReceiptNumber = `KW-MIGRASI/${loanNumber}/B${periodNumber}`;
      const previewCashFlowDate =
        normalizeDateYmd(sch.due_date) ||
        normalizeDateYmd(loan.disbursed_at) ||
        normalizeDateYmd(loan.created_at) ||
        '2026-01-01';

      let missingTarget = '';
      let reason = '';
      if (!hasReceipt && !hasCashFlow) {
        missingTarget = 'loan_repayments & cash_flow';
        reason =
          'Jadwal angsuran sudah lunas namun belum memiliki No. Kwitansi (loan_repayments) dan belum tercatat di Arus Kas (/admin/laporan-keuangan).';
      } else if (!hasReceipt) {
        missingTarget = 'loan_repayments';
        reason =
          'Jadwal angsuran sudah lunas namun belum memiliki rekaman kwitansi di tabel loan_repayments.';
      } else {
        missingTarget = 'cash_flow';
        reason =
          'Jadwal angsuran sudah lunas namun belum tercatat sebagai mutasi kas masuk di tabel cash_flow (/admin/laporan-keuangan).';
      }

      const memberSeg = [member?.nrp, member?.nama].filter(Boolean).join(' - ');
      findings.push({
        id: schId,
        sourceTable: 'loan_schedules',
        anomalyType: 'missing_receipt_and_cashflow',
        recommendedActionLabel: 'Sinkronkan Kwitansi & Kas',
        referenceCode: `${loanNumber} • Bln Ke-${periodNumber}`,
        transactionDate: String(sch.due_date || loan.disbursed_at || loan.created_at || ''),
        moduleCategory: 'Angsuran Tanpa Kwitansi/Kas',
        description: `Angsuran Ke-${periodNumber} (${loanNumber})${
          memberSeg ? ` — ${memberSeg}` : ''
        }`,
        amount,
        direction: 'neutral',
        missingTarget,
        reason,
        rawRecord: {
          schedule: sch,
          loan,
          member,
          hasReceipt,
          hasCashFlow,
          previewReceiptNumber,
          previewCashFlowDate,
        },
      });
    }
  }

  return findings.sort((a, b) =>
    String(b.transactionDate || '').localeCompare(String(a.transactionDate || ''))
  );
}

/**
 * Memindai seluruh tabel transaksi utama secara paralel (tanpa N+1 query)
 * menggunakan paginasi penuh untuk menemukan data yatim (orphan) lintas modul.
 */
export async function scanAllOrphanRecords(): Promise<OrphanScanResult> {
  const [
    cashFlows,
    loans,
    loanSchedules,
    loanRepayments,
    loanInstallments,
    members,
    memberDeposits,
    depositTransactions,
    lebaranCycles,
    sales,
    storeCreditPayments,
  ] = await Promise.all([
    fetchAllPaginatedRows<any>(
      'cash_flow',
      'id, direction, amount, category, reference_id, description, created_at',
      [
        'id, direction, amount, category, reference_id, created_at',
        'id, direction, amount, category, reference_id',
      ]
    ),
    fetchAllPaginatedRows<any>(
      'loans',
      'id, loan_number, member_id, refinanced_loan_id, principal_amount, amount, item_description, notes, status, disbursed_at, created_at',
      [
        'id, loan_number, member_id, refinanced_loan_id, principal_amount, amount, item_description, notes, status, created_at',
        'id, loan_number, member_id, refinanced_loan_id, amount, status, created_at',
        'id, loan_number, member_id, amount, status, created_at',
        'id, loan_number, member_id, purpose, amount, status, applied_at, created_at',
        'id, member_id, amount, status',
        'id, member_id',
      ]
    ),
    fetchAllPaginatedRows<any>(
      'loan_schedules',
      'id, loan_id, period_number, due_date, target_amount, paid_amount, status',
      [
        'id, loan_id, period_number, due_date, target_amount, status',
        'id, loan_id, period_number, due_date, target_amount',
        'id, loan_id',
      ]
    ),
    fetchAllPaginatedRows<any>(
      'loan_repayments',
      'id, loan_id, schedule_id, amount_paid, payment_date, receipt_number, notes, payment_method, created_at',
      [
        'id, loan_id, schedule_id, amount_paid, payment_date, receipt_number, notes',
        'id, loan_id, schedule_id, amount_paid, payment_date, created_at',
        'id, loan_id, schedule_id, amount_paid, payment_date',
        'id, loan_id, schedule_id',
        'id, loan_id',
      ]
    ),
    fetchAllPaginatedRows<any>('loan_installments', 'id, loan_id', ['id']),
    fetchAllPaginatedRows<any>('anggota', 'id, nrp, nama, status', ['id, nrp', 'id']),
    fetchAllPaginatedRows<any>(
      'member_deposits',
      'id, member_id, deposit_type_id, balance, created_at',
      ['id, member_id, balance', 'id, member_id']
    ),
    fetchAllPaginatedRows<any>(
      'deposit_transactions',
      'id, member_deposit_id, reference_no, amount, transaction_type, notes, description, created_at',
      [
        'id, member_deposit_id, reference_no, amount, description, created_at',
        'id, member_deposit_id, reference_no, description',
        'id, member_deposit_id, reference_no',
        'id, member_deposit_id',
      ]
    ),
    fetchAllPaginatedRows<any>('lebaran_disbursement_cycles', 'id, cycle_name', ['id']),
    fetchAllPaginatedRows<any>('sales', 'id, sale_number, total_amount', [
      'id, sale_number',
      'id',
    ]),
    fetchAllPaginatedRows<any>(
      'store_credit_payments',
      'id, sale_id, receipt_number, amount',
      ['id, sale_id', 'id']
    ),
  ]);

  const items = analyzeOrphanRecords({
    cashFlows,
    loans,
    loanSchedules,
    loanRepayments,
    loanInstallments,
    members,
    memberDeposits,
    depositTransactions,
    lebaranCycles,
    sales,
    storeCreditPayments,
  });

  return {
    items,
    scannedAt: new Date().toISOString(),
    summary: buildOrphanScanSummary(items),
  };
}

/**
 * Menghapus record orphan terpilih yang dikelompokkan berdasarkan `sourceTable`.
 */
export async function deleteOrphanRecords(
  items: OrphanRecordItem[]
): Promise<{ deletedCount: number; errors: string[] }> {
  const grouped = new Map<OrphanSourceTable, string[]>();

  for (const item of items) {
    if (
      !item?.id ||
      item.anomalyType === 'missing_receipt_and_cashflow' ||
      !ALLOWED_DELETE_TABLES.has(item.sourceTable)
    ) {
      continue;
    }
    const list = grouped.get(item.sourceTable) ?? [];
    if (!list.includes(item.id)) {
      list.push(item.id);
    }
    grouped.set(item.sourceTable, list);
  }

  let deletedCount = 0;
  const errors: string[] = [];

  for (const [table, ids] of grouped.entries()) {
    if (ids.length === 0) continue;
    const tableRef: any = supabase?.from?.(table);
    if (!tableRef || typeof tableRef.delete !== 'function') {
      errors.push(`Tabel ${table} tidak mendukung operasi hapus.`);
      continue;
    }

    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const delQuery: any = tableRef.delete();

      if (delQuery && typeof delQuery.in === 'function') {
        const res = await delQuery.in('id', chunk);
        if (res?.error) {
          errors.push(`${table}: ${res.error.message || 'Gagal menghapus data.'}`);
        } else {
          deletedCount += chunk.length;
        }
      } else if (delQuery && typeof delQuery.eq === 'function') {
        for (const id of chunk) {
          const res = await tableRef.delete().eq('id', id);
          if (res?.error) {
            errors.push(`${table} (${id}): ${res.error.message || 'Gagal menghapus data.'}`);
          } else {
            deletedCount += 1;
          }
        }
      } else {
        errors.push(`Query delete pada ${table} tidak tersedia.`);
      }
    }
  }

  if (deletedCount > 0) {
    notifyOrphanAuditUpdated();
  }

  return { deletedCount, errors };
}

/**
 * Menghapus rekaman gelondongan SALDO_AWAL lama pada tabel `loan_repayments`
 * untuk kontrak yang sudah memiliki kwitansi migrasi per periode (`SALDO_AWAL_MIGRASI`),
 * secara idempoten agar tidak terjadi perhitungan ganda (double counting).
 */
export async function cleanupRedundantLegacySaldoAwalRepayments(
  loanIds: string[]
): Promise<{ deletedCount: number; errors: string[] }> {
  const uniqueLoanIds = Array.from(
    new Set((loanIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (uniqueLoanIds.length === 0) {
    return { deletedCount: 0, errors: [] };
  }

  const repayTable: any = supabase?.from?.('loan_repayments');
  if (!repayTable || typeof repayTable.select !== 'function') {
    return { deletedCount: 0, errors: [] };
  }

  const redundantIdsToDelete: string[] = [];
  const errors: string[] = [];

  for (const loanId of uniqueLoanIds) {
    try {
      const selQ: any = repayTable.select(
        'id, loan_id, schedule_id, payment_method, receipt_number, notes'
      );
      if (!selQ || typeof selQ.eq !== 'function') continue;

      const { data: existingReps, error: selErr } = await selQ.eq('loan_id', loanId);
      if (selErr || !Array.isArray(existingReps)) continue;

      const { redundant } = filterRedundantLegacySaldoAwalRepayments(existingReps);
      for (const rep of redundant) {
        if (rep?.id) {
          redundantIdsToDelete.push(String(rep.id));
        }
      }
    } catch {
      // Non-blocking per-loan inspection
    }
  }

  const uniqueIdsToDelete = Array.from(new Set(redundantIdsToDelete));
  if (uniqueIdsToDelete.length === 0 || typeof repayTable.delete !== 'function') {
    return { deletedCount: 0, errors };
  }

  let deletedCount = 0;
  for (let i = 0; i < uniqueIdsToDelete.length; i += 80) {
    const chunk = uniqueIdsToDelete.slice(i, i + 80);
    try {
      const delQ: any = repayTable.delete();
      if (delQ && typeof delQ.in === 'function') {
        const res = await delQ.in('id', chunk);
        if (res?.error) {
          errors.push(`loan_repayments: ${res.error.message || 'Gagal menghapus duplikasi SALDO_AWAL.'}`);
        } else {
          deletedCount += chunk.length;
        }
      } else {
        for (const id of chunk) {
          const singleDelQ: any = repayTable.delete();
          if (singleDelQ && typeof singleDelQ.eq === 'function') {
            const res = await singleDelQ.eq('id', id);
            if (res?.error) {
              errors.push(`loan_repayments (${id}): ${res.error.message || 'Gagal menghapus duplikasi SALDO_AWAL.'}`);
            } else {
              deletedCount += 1;
            }
          }
        }
      }
    } catch (err: any) {
      errors.push(`loan_repayments: ${err?.message || 'Gagal membersihkan duplikasi SALDO_AWAL.'}`);
    }
  }

  return { deletedCount, errors };
}

/**
 * Menyinkronkan jadwal angsuran yang sudah lunas namun belum memiliki kwitansi
 * (`loan_repayments`) dan/atau catatan kas masuk (`cash_flow`) secara idempoten.
 */
export async function syncUnreceiptedInstallments(
  items: OrphanRecordItem[]
): Promise<SyncUnreceiptedInstallmentsResult> {
  const targetItems = (items || []).filter(
    (item) => item?.anomalyType === 'missing_receipt_and_cashflow'
  );

  let syncedCount = 0;
  let createdReceiptsCount = 0;
  let createdCashFlowsCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const syncedLoanIds = new Set<string>();

  for (const item of targetItems) {
    const sch = item.rawRecord?.schedule;
    const loan = item.rawRecord?.loan;
    const member = item.rawRecord?.member;

    if (!sch?.id || !loan?.id) {
      errors.push(`${item.referenceCode}: Data jadwal atau kontrak pinjaman tidak lengkap.`);
      continue;
    }

    const schId = String(sch.id);
    const loanId = String(loan.id);
    const amount = Math.round(Number(sch.paid_amount || item.amount || 0));
    if (amount <= 0) {
      skippedCount += 1;
      continue;
    }

    const loanNumber = String(
      loan.loan_number || `LOAN-${loanId.slice(0, 8).toUpperCase()}`
    ).trim();
    const periodNumber = Number(sch.period_number || 0);
    const receiptNo =
      String(item.rawRecord?.previewReceiptNumber || '').trim() ||
      `KW-MIGRASI/${loanNumber}/B${periodNumber}`;
    const dueDateYmd =
      String(item.rawRecord?.previewCashFlowDate || '').trim() ||
      normalizeDateYmd(sch.due_date) ||
      normalizeDateYmd(loan.disbursed_at) ||
      normalizeDateYmd(loan.created_at) ||
      '2026-01-01';
    const isoTimestamp = `${dueDateYmd}T08:00:00.000Z`;
    const memberSeg = [member?.nrp, member?.nama].filter(Boolean).join(' - ');

    let itemInserted = false;
    let itemHasError = false;

    // 1. Idempotent insert ke public.loan_repayments
    let needReceipt = item.rawRecord?.hasReceipt !== true;
    const repayTable: any = supabase?.from?.('loan_repayments');
    if (needReceipt && repayTable && typeof repayTable.select === 'function') {
      try {
        const selQ: any = repayTable.select('id, schedule_id, receipt_number');
        if (selQ && typeof selQ.eq === 'function') {
          const { data: existingReps, error: selErr } = await selQ.eq('loan_id', loanId);
          if (!selErr && Array.isArray(existingReps)) {
            const exists = existingReps.some(
              (r: any) =>
                String(r?.schedule_id || '') === schId ||
                String(r?.receipt_number || '').trim().toUpperCase() === receiptNo.toUpperCase()
            );
            if (exists) needReceipt = false;
          }
        }
      } catch {
        // Proceed with insert if pre-check is unavailable
      }
    }

    if (needReceipt) {
      if (!repayTable || typeof repayTable.insert !== 'function') {
        errors.push(`${item.referenceCode}: Tabel loan_repayments tidak mendukung insert.`);
        itemHasError = true;
      } else {
        const repayPayload = {
          loan_id: loanId,
          schedule_id: schId,
          amount_paid: amount,
          payment_date: isoTimestamp,
          payment_method: 'SALDO_AWAL_MIGRASI',
          receipt_number: receiptNo,
          notes: `Angsuran Saldo Awal Migrasi (${loanNumber}) Bln ke-${periodNumber}`,
        };

        let insRes = await repayTable.insert(repayPayload);
        if (insRes?.error && isPostgrestColumnOrMissingTableError(insRes.error)) {
          const { receipt_number: _omitted, ...fallbackPayload } = repayPayload;
          insRes = await repayTable.insert(fallbackPayload);
        }

        if (insRes?.error) {
          errors.push(
            `${item.referenceCode} (kwitansi): ${insRes.error.message || 'Gagal menyimpan kwitansi.'}`
          );
          itemHasError = true;
        } else {
          createdReceiptsCount += 1;
          itemInserted = true;
        }
      }
    }

    // 2. Idempotent insert ke public.cash_flow
    let needCashFlow = item.rawRecord?.hasCashFlow !== true;
    const cfTable: any = supabase?.from?.('cash_flow');
    if (needCashFlow && cfTable && typeof cfTable.select === 'function') {
      try {
        const selQ: any = cfTable.select('id, direction, reference_id');
        if (selQ && typeof selQ.eq === 'function') {
          const { data: existingCfs, error: cfSelErr } = await selQ.eq('reference_id', schId);
          if (!cfSelErr && Array.isArray(existingCfs)) {
            const exists = existingCfs.some(
              (cf: any) => String(cf?.direction || 'in').toLowerCase() !== 'out'
            );
            if (exists) needCashFlow = false;
          }
        }
      } catch {
        // Proceed with insert if pre-check is unavailable
      }
    }

    if (needCashFlow) {
      if (!cfTable || typeof cfTable.insert !== 'function') {
        errors.push(`${item.referenceCode}: Tabel cash_flow tidak mendukung insert.`);
        itemHasError = true;
      } else {
        const cfPayload = {
          direction: 'in',
          amount,
          category: 'angsuran_pinjaman',
          reference_id: schId,
          description: `Angsuran Pinjaman (${loanNumber}) Bln ke-${periodNumber}${
            memberSeg ? ` — ${memberSeg}` : ''
          } [${receiptNo}]`,
          created_at: isoTimestamp,
        };

        let cfRes = await cfTable.insert(cfPayload);
        if (cfRes?.error && isPostgrestColumnOrMissingTableError(cfRes.error)) {
          const { description: _omitted, ...fallbackCfPayload } = cfPayload;
          cfRes = await cfTable.insert(fallbackCfPayload);
        }

        if (cfRes?.error) {
          errors.push(
            `${item.referenceCode} (arus kas): ${cfRes.error.message || 'Gagal mencatat arus kas.'}`
          );
          itemHasError = true;
        } else {
          createdCashFlowsCount += 1;
          itemInserted = true;
        }
      }
    }

    if (!itemHasError) {
      syncedLoanIds.add(loanId);
    }

    if (itemInserted && !itemHasError) {
      syncedCount += 1;
    } else if (!itemInserted && !itemHasError) {
      skippedCount += 1;
    }
  }

  let cleanedLegacyCount = 0;
  if (syncedLoanIds.size > 0) {
    const cleanupRes = await cleanupRedundantLegacySaldoAwalRepayments(
      Array.from(syncedLoanIds)
    );
    cleanedLegacyCount = cleanupRes.deletedCount;
    if (cleanupRes.errors.length > 0) {
      errors.push(...cleanupRes.errors);
    }
  }

  if (createdReceiptsCount > 0 || createdCashFlowsCount > 0 || cleanedLegacyCount > 0) {
    notifyOrphanAuditUpdated();
  }

  return {
    syncedCount,
    createdReceiptsCount,
    createdCashFlowsCount,
    skippedCount,
    errors,
  };
}

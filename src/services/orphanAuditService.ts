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

export type OrphanModuleCategory =
  | 'Arus Kas Pinjaman'
  | 'Arus Kas Simpanan'
  | 'Arus Kas Retail/Bon'
  | 'Kontrak Pinjaman'
  | 'Rekening Simpanan'
  | 'Jadwal Angsuran'
  | 'Pembayaran Angsuran'
  | 'Transaksi Simpanan';

export interface OrphanRecordItem {
  id: string;
  sourceTable: OrphanSourceTable;
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

export function buildOrphanScanSummary(items: OrphanRecordItem[]): OrphanScanSummary {
  let cashInImpact = 0;
  let cashOutImpact = 0;
  let cashFlowOrphanCount = 0;

  for (const item of items) {
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
  };
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

  // 6. Scan public.loan_repayments without valid loans or loan_schedules
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
      'id, loan_number, member_id, refinanced_loan_id, principal_amount, amount, item_description, notes, status, created_at',
      [
        'id, loan_number, member_id, refinanced_loan_id, amount, status, created_at',
        'id, loan_number, member_id, amount, status, created_at',
        'id, loan_number, member_id, purpose, amount, status, applied_at, created_at',
        'id, member_id, amount, status',
        'id, member_id',
      ]
    ),
    fetchAllPaginatedRows<any>(
      'loan_schedules',
      'id, loan_id, period_number, due_date, target_amount, status',
      ['id, loan_id, period_number, due_date, target_amount', 'id, loan_id']
    ),
    fetchAllPaginatedRows<any>(
      'loan_repayments',
      'id, loan_id, schedule_id, amount_paid, payment_date, created_at',
      [
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
    if (!item?.id || !ALLOWED_DELETE_TABLES.has(item.sourceTable)) continue;
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

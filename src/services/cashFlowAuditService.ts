import { supabase } from '../lib/supabaseClient';
import { isOpeningDepositTransaction } from './cashFlowService';
import {
  formatBulkLebaranCashFlowDescription,
  formatIndividualWithdrawalCashFlowDescription,
  isBlankOrDashDescription,
  isLebaranDepositCodeOrName,
  isSavingsWithdrawalCategory,
} from '../utils/withdrawalCashFlowFormat';
import {
  buildMemberDepositTypeSummary,
  formatMatrixCancellationCashFlowDescription,
  formatMatrixDepositCashFlowDescription,
  formatMatrixDepositPeriodLabel,
  formatMatrixDepositShortPeriod,
  hasMemberDepositTypeComponents,
  injectDepositTypesIntoMemberDepositDescription,
  isCancellationReversalCategory,
  isOpeningOrMigrationDepositDescription,
  isSavingsDepositCategory,
  parseCancellationReversalDescription,
} from '../utils/depositCashFlowFormat';
import {
  formatStoreCreditCashFlowDescription,
  inferStoreCreditPaymentMethod,
} from './storeCreditLedgerService';
import {
  formatPosCashFlowDescription,
  formatPosPaymentSchemeLabel,
  isPosCashSaleCategory,
  needsPosDescriptionEnrichment,
  sanitizePosTerminology,
} from '../utils/posCashFlowFormat';
import {
  MEMBER_CLEARANCE_CATEGORY,
  descriptionContainsClearanceMemberNrp,
  extractNrpFromClearanceDescription,
  formatMemberClearanceCashFlowDescription,
  isClearanceLoanRepayment,
  isClearanceWithdrawalTx,
  isMemberClearanceCategory,
  isResignedMemberRecord,
  partitionDuplicateClearanceRows,
  stripResignedNrpPrefix,
} from '../utils/clearanceCashFlowFormat';

export interface CashFlowAuditInput {
  id: string;
  category: string;
  amount: number;
  direction?: 'in' | 'out';
  description?: string | null;
  reference_id?: string | null;
  referensi?: string;
  unit_usaha?: string;
  created_at: string;
}

export interface OpeningSavingsDepositTypeSummary {
  pokok: number;
  wajib: number;
  belanja: number;
  lebaran: number;
  lainnya: number;
  items: Array<{ code: string; name: string; amount: number; memberCount: number }>;
}

export interface OpeningSavingsMemberRow {
  member_id: string;
  nrp: string;
  nama: string;
  tanggal_lahir: string | null;
  pokok: number;
  wajib: number;
  belanja: number;
  lebaran: number;
  lainnya: number;
  total: number;
}

export interface PosSaleBreakdown {
  saleId: string;
  saleNumber: string;
  createdAt: string;
  paymentScheme: string;
  paymentSchemeLabel?: string;
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidCash: number;
  paidDeposit: number;
  paidCredit: number;
  member?: { nrp: string; nama: string; tanggal_lahir?: string | null } | null;
  items: Array<{
    id: string;
    productName: string;
    qty: number;
    price: number;
    subtotal: number;
  }>;
}

export interface StoreCreditRelatedSale {
  saleId: string;
  saleNumber: string;
  totalAmount: number;
  paidCredit: number;
  createdAt: string;
}

export interface StoreCreditPaymentBreakdown {
  paymentId: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string | null;
  notes?: string | null;
  saleNumber?: string | null;
  saleTotal?: number;
  salePaidCredit?: number;
  saleCreatedAt?: string | null;
  beforeBalance?: number;
  afterBalance?: number;
  relatedSales?: StoreCreditRelatedSale[];
  member?: { nrp: string; nama: string; tanggal_lahir?: string | null } | null;
}

export interface DepositWithdrawalBreakdown {
  transactionId: string;
  amount: number;
  transactionType: string;
  description: string;
  referenceNo?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  createdAt: string;
  depositTypeName: string;
  depositTypeCode: string;
  isLebaranPersonal?: boolean;
  member?: {
    nrp: string;
    nama: string;
    tanggal_lahir?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
  } | null;
}

export interface BulkLebaranRecipientRow {
  id: string;
  memberId: string;
  nrp: string;
  nama: string;
  tanggal_lahir: string | null;
  bankName: string;
  bankAccountNumber: string;
  amount: number;
  referenceNo?: string | null;
}

export interface BulkLebaranWithdrawalBreakdown {
  cycleId: string;
  cycleName: string;
  disbursementDate: string;
  sourceType?: string | null;
  notes?: string | null;
  recipients: BulkLebaranRecipientRow[];
  recipientCount: number;
  calculatedTotal: number;
  journalAmount: number;
  difference: number;
  isMatched: boolean;
}

export interface CashierShiftBreakdown {
  shiftId: string;
  shiftNumber: string;
  cashierName?: string | null;
  openedAt: string;
  closedAt?: string | null;
  initialCash: number;
  cashSales: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  status: string;
  notes?: string | null;
}

export interface LoanDisbursementBreakdown {
  loanId: string;
  amount: number;
  tenor: number;
  status: string;
  disbursedAt?: string | null;
  itemDescription?: string | null;
  costPrice?: number;
  markupAmount?: number;
  member?: { nrp: string; nama: string; tanggal_lahir?: string | null } | null;
}

export interface IndividualDepositBreakdown {
  transactionId: string;
  memberId?: string;
  nrp: string;
  nama: string;
  memberNrp?: string;
  memberName?: string;
  tanggal_lahir?: string | null;
  depositTypeCode: string;
  depositTypeName: string;
  forMonth: number | null;
  forYear: number | null;
  periodLabel: string;
  shortPeriodLabel: string;
  periodCode?: string;
  referenceNo: string | null;
  receiptNumber?: string;
  paymentMethod: string | null;
  description: string;
  notes: string | null;
  createdAt: string;
  amount: number;
}

export interface DepositCancellationReversalBreakdown {
  originalTransactionId: string | null;
  memberId?: string;
  memberNrp: string;
  memberName: string;
  tanggal_lahir?: string | null;
  depositTypeCode: string;
  depositTypeName: string;
  forMonth: number | null;
  forYear: number | null;
  periodLabel: string;
  shortPeriodLabel: string;
  amount: number;
  cancelReason: string;
  adminName: string;
  canceledAt: string;
  originalReferenceNo: string | null;
  originalPaymentMethod: string | null;
  originalCreatedAt: string | null;
}

export interface MemberDepositBatchItem {
  id: string;
  memberId?: string;
  memberNrp?: string;
  memberName?: string;
  depositTypeName: string;
  depositTypeCode: string;
  forMonth: number | null;
  forYear: number | null;
  periodLabel: string;
  paymentMethod: string | null;
  referenceNo: string | null;
  description: string;
  notes: string | null;
  amount: number;
  createdAt: string;
}

export interface MemberDepositBatchBreakdown {
  sourceMenu: string;
  receiptNumber: string;
  paymentMethod: string | null;
  member: {
    id: string;
    nrp: string;
    nama: string;
    tanggal_lahir?: string | null;
  };
  items: MemberDepositBatchItem[];
  totalAmount: number;
  journalAmount: number;
  difference: number;
  isMatched: boolean;
}

export interface TraceBackDepositLookupResult {
  traceCode: string;
  resolvedReceiptCode: string | null;
  resolvedCashFlowRef: string | null;
  member: {
    id: string;
    nrp: string;
    nama: string;
    tanggal_lahir?: string | null;
  } | null;
  items: MemberDepositBatchItem[];
  totalAmount: number;
}

export interface JournalMetadata {
  id: string;
  refCode: string;
  category: string;
  direction: 'in' | 'out';
  amount: number;
  description: string;
  unitUsaha: string;
  referenceId: string | null;
  createdAt: string;
}

export interface OpeningSavingsBreakdownPayload {
  byDepositType: OpeningSavingsDepositTypeSummary;
  memberRows: OpeningSavingsMemberRow[];
  calculatedTotal: number;
  journalAmount: number;
  difference: number;
  isMatched: boolean;
  transactionCount: number;
}

export interface MemberClearanceSavingsItem {
  depositTypeId: string;
  code: string;
  name: string;
  bucket: 'pokok' | 'wajib' | 'belanja' | 'lebaran' | 'lainnya';
  amount: number;
}

export interface MemberClearanceDebtItem {
  loanId: string;
  loanNumber: string;
  purpose: string;
  offsetAmount: number;
  paymentMethod?: string | null;
  paymentDate?: string | null;
}

export interface MemberClearanceBreakdown {
  memberId: string;
  member: {
    nrp: string;
    nama: string;
    tanggal_lahir?: string | null;
    status: string;
    membershipStatus: string;
    bankName?: string | null;
    bankAccountNumber?: string | null;
  };
  clearanceDate: string;
  settlementType: 'SURPLUS_PAYOUT' | 'INSTANT_PAYOFF';
  paymentMethod?: string | null;
  notes?: string | null;
  savingsItems: MemberClearanceSavingsItem[];
  savingsByBucket: {
    pokok: number;
    wajib: number;
    belanja: number;
    lebaran: number;
    lainnya: number;
  };
  totalSavings: number;
  debtItems: MemberClearanceDebtItem[];
  totalDebtOffset: number;
  netSettlement: number;
  journalAmount: number;
  difference: number;
  isMatched: boolean;
}

export interface DeduplicateClearanceCashFlowResult {
  deletedCount: number;
  keptCount: number;
  deletedIds: string[];
}

export interface SyncResignedMemberClearanceResult {
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  deletedCount?: number;
}

export interface SyncMatrixDepositsToCashFlowResult {
  syncedCount: number;
  skippedCount: number;
}

export interface SyncApprovedLoansToCashFlowResult {
  syncedCount: number;
  skippedCount: number;
}

export type CashFlowReferenceBreakdown =
  | {
      kind: 'opening_savings';
      journal: JournalMetadata;
      openingSavings: OpeningSavingsBreakdownPayload;
    }
  | {
      kind: 'pos_sale';
      journal: JournalMetadata;
      posSale: PosSaleBreakdown;
    }
  | {
      kind: 'store_credit_payment';
      journal: JournalMetadata;
      storeCreditPayment: StoreCreditPaymentBreakdown;
    }
  | {
      kind: 'deposit_withdrawal';
      journal: JournalMetadata;
      depositWithdrawal: DepositWithdrawalBreakdown;
    }
  | {
      kind: 'bulk_lebaran_withdrawal';
      journal: JournalMetadata;
      bulkLebaranWithdrawal: BulkLebaranWithdrawalBreakdown;
    }
  | {
      kind: 'individual_deposit';
      journal: JournalMetadata;
      individualDeposit: IndividualDepositBreakdown;
    }
  | {
      kind: 'deposit_cancellation_reversal';
      journal: JournalMetadata;
      cancellationReversal: DepositCancellationReversalBreakdown;
    }
  | {
      kind: 'MEMBER_DEPOSIT_BATCH';
      journal: JournalMetadata;
      memberDepositBatch: MemberDepositBatchBreakdown;
    }
  | {
      kind: 'cashier_shift';
      journal: JournalMetadata;
      cashierShift: CashierShiftBreakdown;
    }
  | {
      kind: 'loan_disbursement';
      journal: JournalMetadata;
      loanDisbursement: LoanDisbursementBreakdown;
    }
  | {
      kind: 'MEMBER_CLEARANCE';
      journal: JournalMetadata;
      memberClearance: MemberClearanceBreakdown;
    }
  | {
      kind: 'journal_only';
      journal: JournalMetadata;
    };

function isPostgrestColumnError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  return (
    err?.code === 'PGRST204' ||
    err?.code === '42703' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

async function safeFetchAllPaged<T = any>(
  table: string,
  columns: string
): Promise<{ data: T[]; error: any }> {
  try {
    const pageSize = 1000;
    let offset = 0;
    const allRows: T[] = [];

    while (true) {
      const tableRef: any = supabase?.from?.(table);
      if (!tableRef || typeof tableRef.select !== 'function') {
        return { data: [], error: null };
      }

      const query: any = tableRef.select(columns);
      if (query && typeof query.range === 'function') {
        const res = await query.range(offset, offset + pageSize - 1);
        if (res?.error) {
          return { data: allRows, error: res.error };
        }
        const rows = Array.isArray(res?.data) ? res.data : [];
        allRows.push(...rows);
        if (rows.length < pageSize) break;
        offset += pageSize;
      } else if (query && typeof query.then === 'function') {
        const res = await query;
        if (res?.error) {
          return { data: [], error: res.error };
        }
        return { data: Array.isArray(res?.data) ? res.data : [], error: null };
      } else {
        return { data: [], error: null };
      }
    }

    return { data: allRows, error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

async function safeFetchSingleById<T = any>(
  table: string,
  columns: string,
  id: string
): Promise<{ data: T | null; error: any }> {
  try {
    const tableRef: any = supabase?.from?.(table);
    if (!tableRef || typeof tableRef.select !== 'function') {
      return { data: null, error: null };
    }
    const q: any = tableRef.select(columns);
    if (!q || typeof q.eq !== 'function') {
      return { data: null, error: null };
    }
    const eqQ: any = q.eq('id', id);
    if (eqQ && typeof eqQ.maybeSingle === 'function') {
      const res = await eqQ.maybeSingle();
      return { data: (res?.data as T) ?? null, error: res?.error ?? null };
    }
    if (eqQ && typeof eqQ.single === 'function') {
      const res = await eqQ.single();
      return { data: (res?.data as T) ?? null, error: res?.error ?? null };
    }
    const res = await eqQ;
    const row = Array.isArray(res?.data) ? res.data[0] : res?.data;
    return { data: (row as T) ?? null, error: res?.error ?? null };
  } catch (err) {
    return { data: null, error: err };
  }
}

async function safeFetchListByEq<T = any>(
  table: string,
  columns: string,
  col: string,
  val: string
): Promise<{ data: T[]; error: any }> {
  try {
    const tableRef: any = supabase?.from?.(table);
    if (!tableRef || typeof tableRef.select !== 'function') {
      return { data: [], error: null };
    }
    const q: any = tableRef.select(columns);
    if (!q || typeof q.eq !== 'function') {
      return { data: [], error: null };
    }
    const res = await q.eq(col, val);
    return {
      data: Array.isArray(res?.data) ? (res.data as T[]) : [],
      error: res?.error ?? null,
    };
  } catch (err) {
    return { data: [], error: err };
  }
}

function classifyDepositTypeBucket(
  dt?: { code?: string; name?: string } | null
): 'pokok' | 'wajib' | 'belanja' | 'lebaran' | 'lainnya' {
  const code = String(dt?.code || '').trim().toUpperCase();
  const name = String(dt?.name || '').trim().toLowerCase();

  if (code === 'POKOK' || code === 'SP' || name.includes('pokok')) {
    return 'pokok';
  }
  if (code === 'WAJIB' || code === 'SW' || name.includes('wajib')) {
    return 'wajib';
  }
  if (code === 'BELANJA' || code === 'SB' || name.includes('belanja')) {
    return 'belanja';
  }
  if (
    code === 'LEBARAN' ||
    code === 'SL' ||
    code === 'SHR' ||
    name.includes('lebaran') ||
    name.includes('hari raya')
  ) {
    return 'lebaran';
  }
  return 'lainnya';
}

function formatMemberSummary(
  member?: any
): {
  nrp: string;
  nama: string;
  tanggal_lahir?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
} | null {
  if (!member) return null;
  const summary: {
    nrp: string;
    nama: string;
    tanggal_lahir?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
  } = {
    nrp: String(member.nrp || '-'),
    nama: String(member.nama || '-'),
    tanggal_lahir: member.tanggal_lahir ?? null,
  };
  if (member.bank_name !== undefined) {
    summary.bankName = member.bank_name ?? null;
  }
  if (member.bank_account_number !== undefined) {
    summary.bankAccountNumber = member.bank_account_number ?? null;
  }
  return summary;
}

async function safeFetchMemberWithBankById(memberId: string): Promise<any | null> {
  if (!memberId) return null;
  let res = await safeFetchSingleById<any>(
    'anggota',
    'id, nrp, nama, tanggal_lahir, bank_name, bank_account_number',
    memberId
  );
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchSingleById<any>(
      'anggota',
      'id, nrp, nama, tanggal_lahir, bank_account_number',
      memberId
    );
  }
  return res.data ?? null;
}

async function safeFetchByIds<T = any>(
  table: string,
  columns: string,
  ids: string[],
  fallbackColumns?: string
): Promise<T[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const runQuery = async (cols: string): Promise<{ data: T[]; error: any; unsupportedIn?: boolean }> => {
    try {
      const tableRef: any = supabase?.from?.(table);
      if (!tableRef || typeof tableRef.select !== 'function') {
        return { data: [], error: null };
      }
      const results: T[] = [];
      for (let i = 0; i < uniqueIds.length; i += 200) {
        const chunk = uniqueIds.slice(i, i + 200);
        const q: any = tableRef.select(cols);
        if (!q || typeof q.in !== 'function') {
          return { data: [], error: null, unsupportedIn: true };
        }
        const res = await q.in('id', chunk);
        if (res?.error) {
          return { data: results, error: res.error };
        }
        if (Array.isArray(res?.data)) {
          results.push(...res.data);
        }
      }
      return { data: results, error: null };
    } catch (err) {
      return { data: [], error: err };
    }
  };

  let res = await runQuery(columns);
  if (res.unsupportedIn) {
    const idSet = new Set(uniqueIds);
    let paged = await safeFetchAllPaged<T>(table, columns);
    if (paged.error && fallbackColumns && isPostgrestColumnError(paged.error)) {
      paged = await safeFetchAllPaged<T>(table, fallbackColumns);
    }
    if (paged.data.length > 0) {
      return paged.data.filter((r: any) => r?.id && idSet.has(String(r.id)));
    }
    const perId: T[] = [];
    for (const id of uniqueIds) {
      let sRes = await safeFetchSingleById<T>(table, columns, id);
      if (sRes.error && fallbackColumns && isPostgrestColumnError(sRes.error)) {
        sRes = await safeFetchSingleById<T>(table, fallbackColumns, id);
      }
      if (sRes.data) perId.push(sRes.data);
    }
    return perId;
  }

  if (res.error && fallbackColumns && isPostgrestColumnError(res.error)) {
    res = await runQuery(fallbackColumns);
  }
  return res.data;
}

async function safeFetchMembersWithBankByIds(
  memberIds: string[]
): Promise<Map<string, { id: string; nrp: string; nama: string; tanggal_lahir: string | null; bankName: string; bankAccountNumber: string }>> {
  const rows = await safeFetchByIds<any>(
    'anggota',
    'id, nrp, nama, tanggal_lahir, bank_name, bank_account_number',
    memberIds,
    'id, nrp, nama, tanggal_lahir, bank_account_number'
  );
  const map = new Map<
    string,
    { id: string; nrp: string; nama: string; tanggal_lahir: string | null; bankName: string; bankAccountNumber: string }
  >();
  for (const m of rows) {
    if (m?.id) {
      map.set(String(m.id), {
        id: String(m.id),
        nrp: String(m.nrp || '-'),
        nama: String(m.nama || '-'),
        tanggal_lahir: m.tanggal_lahir ?? null,
        bankName: String(m.bank_name || ''),
        bankAccountNumber: String(m.bank_account_number || ''),
      });
    }
  }
  return map;
}

function getCycleDateOnly(cycle: any): string {
  const raw = cycle?.disbursement_date || cycle?.cut_off_date || cycle?.created_at || '';
  return String(raw).slice(0, 10);
}

function getTxDateOnly(tx: any): string {
  const raw = tx?.transaction_date || tx?.created_at || '';
  return String(raw).slice(0, 10);
}

const formatYmdLocal = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function getDateCandidates(raw?: string | null): string[] {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  const candidates = new Set<string>();
  const prefixMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (prefixMatch) {
    candidates.add(prefixMatch[1]);
  }
  if (trimmed.length > 10) {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      candidates.add(formatYmdLocal(parsed));
      candidates.add(
        new Date(parsed.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
      );
    }
  }
  return Array.from(candidates);
}

function hasCommonDate(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b);
  return a.some((d) => setB.has(d));
}

async function safeFetchByColumnIn<T = any>(
  table: string,
  columns: string,
  columnName: string,
  values: string[],
  fallbackColumns?: string
): Promise<T[]> {
  const uniqueVals = Array.from(new Set(values.filter(Boolean)));
  if (uniqueVals.length === 0) return [];

  const runQuery = async (
    cols: string
  ): Promise<{ data: T[]; error: any; unsupportedIn?: boolean }> => {
    try {
      const tableRef: any = supabase?.from?.(table);
      if (!tableRef || typeof tableRef.select !== 'function') {
        return { data: [], error: null };
      }
      const results: T[] = [];
      for (let i = 0; i < uniqueVals.length; i += 200) {
        const chunk = uniqueVals.slice(i, i + 200);
        const q: any = tableRef.select(cols);
        if (!q || typeof q.in !== 'function') {
          if (uniqueVals.length === 1 && q && typeof q.eq === 'function') {
            const eqRes = await q.eq(columnName, uniqueVals[0]);
            if (eqRes?.error) return { data: results, error: eqRes.error };
            return { data: Array.isArray(eqRes?.data) ? eqRes.data : [], error: null };
          }
          return { data: [], error: null, unsupportedIn: true };
        }
        const res = await q.in(columnName, chunk);
        if (res?.error) {
          return { data: results, error: res.error };
        }
        if (Array.isArray(res?.data)) {
          results.push(...res.data);
        }
      }
      return { data: results, error: null };
    } catch (err) {
      return { data: [], error: err };
    }
  };

  let res = await runQuery(columns);
  if (res.unsupportedIn) {
    const valSet = new Set(uniqueVals);
    let paged = await safeFetchAllPaged<T>(table, columns);
    if (paged.error && fallbackColumns && isPostgrestColumnError(paged.error)) {
      paged = await safeFetchAllPaged<T>(table, fallbackColumns);
    }
    return paged.data.filter((r: any) => r?.[columnName] && valSet.has(String(r[columnName])));
  }

  if (res.error && fallbackColumns && isPostgrestColumnError(res.error)) {
    res = await runQuery(fallbackColumns);
  }
  return res.data;
}

async function safeFetchAllAnggotaForClearance(): Promise<{ data: any[]; error: any }> {
  let res = await safeFetchAllPaged<any>(
    'anggota',
    'id, nrp, nama, tanggal_lahir, status, membership_status, updated_at, created_at'
  );
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchAllPaged<any>(
      'anggota',
      'id, nrp, nama, tanggal_lahir, status, membership_status, created_at'
    );
  }
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchAllPaged<any>('anggota', 'id, nrp, nama, status, created_at');
  }
  return res;
}

async function safeFetchMemberFullById(memberId: string): Promise<any | null> {
  if (!memberId) return null;
  let res = await safeFetchSingleById<any>(
    'anggota',
    'id, nrp, nama, tanggal_lahir, status, membership_status, bank_name, bank_account_number, updated_at',
    memberId
  );
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchSingleById<any>(
      'anggota',
      'id, nrp, nama, tanggal_lahir, status, membership_status, bank_account_number, created_at',
      memberId
    );
  }
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchSingleById<any>(
      'anggota',
      'id, nrp, nama, tanggal_lahir, status, created_at',
      memberId
    );
  }
  return res.data ?? null;
}

const CLEARANCE_BUCKET_ORDER: Record<MemberClearanceSavingsItem['bucket'], number> = {
  wajib: 1,
  pokok: 2,
  belanja: 3,
  lebaran: 4,
  lainnya: 5,
};

function computeMemberClearanceSettlement(params: {
  member: any;
  clearanceLog?: any | null;
  memberDeposits: any[];
  depositTypesMap: Map<string, { id: string; code: string; name: string }>;
  depositTransactions: any[];
  loans: any[];
  loanRepayments: any[];
}): {
  savingsItems: MemberClearanceSavingsItem[];
  savingsByBucket: MemberClearanceBreakdown['savingsByBucket'];
  totalSavings: number;
  debtItems: MemberClearanceDebtItem[];
  totalDebtOffset: number;
  netSettlement: number;
  settlementType: 'SURPLUS_PAYOUT' | 'INSTANT_PAYOFF';
  clearanceTimestamp: string;
} {
  const {
    member,
    clearanceLog = null,
    memberDeposits,
    depositTypesMap,
    depositTransactions,
    loans,
    loanRepayments,
  } = params;

  const txsByMdId = new Map<string, any[]>();
  for (const tx of depositTransactions) {
    const mdId = String(tx?.member_deposit_id || '');
    if (!mdId) continue;
    const list = txsByMdId.get(mdId) || [];
    list.push(tx);
    txsByMdId.set(mdId, list);
  }

  for (const md of memberDeposits) {
    const mdId = String(md?.id || '');
    if (!mdId) continue;
    if (!txsByMdId.has(mdId) && Array.isArray(md?.deposit_transactions) && md.deposit_transactions.length > 0) {
      txsByMdId.set(mdId, md.deposit_transactions);
    }
  }

  const allMemberTxs: any[] = [];
  for (const md of memberDeposits) {
    const mdId = String(md?.id || '');
    if (!mdId) continue;
    allMemberTxs.push(...(txsByMdId.get(mdId) || []));
  }

  const explicitClearanceTxs = allMemberTxs.filter((tx) => isClearanceWithdrawalTx(tx));
  const clearanceLogDateCandidates = clearanceLog?.created_at
    ? getDateCandidates(clearanceLog.created_at)
    : [];

  const mdAmountMap = new Map<string, number>();

  if (explicitClearanceTxs.length > 0) {
    for (const md of memberDeposits) {
      const mdId = String(md?.id || '');
      if (!mdId) continue;
      const txs = (txsByMdId.get(mdId) || []).filter((tx) => isClearanceWithdrawalTx(tx));
      const sum = txs.reduce((acc, tx) => acc + Math.max(0, Math.round(Number(tx?.amount || 0))), 0);
      mdAmountMap.set(mdId, sum);
    }
  } else {
    let ledgerTotal = 0;
    for (const md of memberDeposits) {
      const mdId = String(md?.id || '');
      if (!mdId) continue;
      const txs = txsByMdId.get(mdId) || [];
      let mdAmount = 0;
      if (txs.length > 0) {
        let bal = 0;
        for (const tx of txs) {
          const amt = Number(tx?.amount || 0);
          bal += !tx?.transaction_type || tx.transaction_type === 'deposit' ? amt : -amt;
        }
        mdAmount = Math.max(0, Math.round(bal));
      } else {
        mdAmount = Math.max(0, Math.round(Number(md?.balance || 0)));
      }
      mdAmountMap.set(mdId, mdAmount);
      ledgerTotal += mdAmount;
    }

    if (ledgerTotal === 0 && clearanceLog && Math.round(Number(clearanceLog.total_savings || 0)) > 0) {
      const allWithdrawals = allMemberTxs.filter((tx) => tx?.transaction_type === 'withdrawal');
      let matchedWithdrawals =
        clearanceLogDateCandidates.length > 0
          ? allWithdrawals.filter((tx) =>
              hasCommonDate(clearanceLogDateCandidates, [
                ...getDateCandidates(tx?.transaction_date),
                ...getDateCandidates(tx?.created_at),
              ])
            )
          : [];

      if (matchedWithdrawals.length === 0 && allWithdrawals.length > 0) {
        let latestDate = '';
        for (const tx of allWithdrawals) {
          const d = getTxDateOnly(tx);
          if (d > latestDate) latestDate = d;
        }
        if (latestDate) {
          matchedWithdrawals = allWithdrawals.filter((tx) => getTxDateOnly(tx) === latestDate);
        }
      }

      if (matchedWithdrawals.length > 0) {
        for (const md of memberDeposits) {
          const mdId = String(md?.id || '');
          if (!mdId) continue;
          const sum = matchedWithdrawals
            .filter((tx) => String(tx?.member_deposit_id || '') === mdId)
            .reduce((acc, tx) => acc + Math.max(0, Math.round(Number(tx?.amount || 0))), 0);
          mdAmountMap.set(mdId, sum);
        }
      }
    }
  }

  const savingsAggMap = new Map<string, MemberClearanceSavingsItem>();
  const savingsByBucket: MemberClearanceBreakdown['savingsByBucket'] = {
    pokok: 0,
    wajib: 0,
    belanja: 0,
    lebaran: 0,
    lainnya: 0,
  };

  const defaultBucketMeta: Record<
    MemberClearanceSavingsItem['bucket'],
    { code: string; name: string }
  > = {
    pokok: { code: 'POKOK', name: 'Simpanan Pokok' },
    wajib: { code: 'WAJIB', name: 'Simpanan Wajib' },
    belanja: { code: 'BELANJA', name: 'Simpanan Belanja' },
    lebaran: { code: 'LEBARAN', name: 'Simpanan Lebaran' },
    lainnya: { code: 'LAINNYA', name: 'Simpanan Lainnya' },
  };

  for (const md of memberDeposits) {
    const mdId = String(md?.id || '');
    if (!mdId) continue;
    const amt = Math.max(0, Math.round(mdAmountMap.get(mdId) ?? 0));
    if (amt <= 0) continue;

    const embeddedDt = Array.isArray(md?.deposit_types) ? md.deposit_types[0] : md?.deposit_types;
    const dt = (md?.deposit_type_id ? depositTypesMap.get(String(md.deposit_type_id)) : undefined) ||
      (embeddedDt
        ? {
            id: String(embeddedDt.id || md.deposit_type_id || ''),
            code: String(embeddedDt.code || ''),
            name: String(embeddedDt.name || ''),
          }
        : undefined);
    const bucket = classifyDepositTypeBucket(dt);
    savingsByBucket[bucket] += amt;

    const dtKey = dt?.id || bucket.toUpperCase();
    const meta = dt
      ? {
          code: dt.code || defaultBucketMeta[bucket].code,
          name: dt.name || defaultBucketMeta[bucket].name,
        }
      : defaultBucketMeta[bucket];

    const existing = savingsAggMap.get(dtKey);
    if (existing) {
      existing.amount += amt;
    } else {
      savingsAggMap.set(dtKey, {
        depositTypeId: dtKey,
        code: meta.code,
        name: meta.name,
        bucket,
        amount: amt,
      });
    }
  }

  const savingsItems = Array.from(savingsAggMap.values()).sort((a, b) => {
    const orderDiff = CLEARANCE_BUCKET_ORDER[a.bucket] - CLEARANCE_BUCKET_ORDER[b.bucket];
    return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name, 'id');
  });

  const ledgerSavingsTotal = savingsItems.reduce((sum, item) => sum + item.amount, 0);
  const totalSavings =
    ledgerSavingsTotal > 0
      ? ledgerSavingsTotal
      : Math.max(0, Math.round(Number(clearanceLog?.total_savings || 0)));

  // Hitung potongan kompensasi pinjaman saat kliring
  const loanMap = new Map<string, any>();
  for (const l of loans) {
    if (l?.id) loanMap.set(String(l.id), l);
  }

  const matchedRepayments = loanRepayments.filter((r) => {
    const lid = String(r?.loan_id || '');
    if (!lid || !loanMap.has(lid)) return false;
    if (isClearanceLoanRepayment(r)) return true;
    if (
      clearanceLogDateCandidates.length > 0 &&
      Math.round(Number(clearanceLog?.total_loans || 0)) > 0
    ) {
      return hasCommonDate(clearanceLogDateCandidates, [
        ...getDateCandidates(r?.payment_date),
        ...getDateCandidates(r?.created_at),
      ]);
    }
    return false;
  });

  const debtAggMap = new Map<string, MemberClearanceDebtItem>();
  for (const rep of matchedRepayments) {
    const lid = String(rep.loan_id);
    const amt = Math.max(0, Math.round(Number(rep?.amount_paid || 0)));
    if (amt <= 0) continue;
    const loan = loanMap.get(lid);
    const existing = debtAggMap.get(lid);
    if (existing) {
      existing.offsetAmount += amt;
    } else {
      debtAggMap.set(lid, {
        loanId: lid,
        loanNumber: String(loan?.loan_number || `PINJ-${lid.slice(0, 8).toUpperCase()}`),
        purpose: String(loan?.notes || '-'),
        offsetAmount: amt,
        paymentMethod: rep?.payment_method ?? null,
        paymentDate: rep?.payment_date ?? rep?.created_at ?? null,
      });
    }
  }

  const debtItems = Array.from(debtAggMap.values());
  const repaymentOffsetTotal = debtItems.reduce((sum, d) => sum + d.offsetAmount, 0);
  const logTotalLoans = clearanceLog
    ? Math.max(0, Math.round(Number(clearanceLog.total_loans || 0)))
    : 0;
  const totalDebtOffset = repaymentOffsetTotal > 0 ? repaymentOffsetTotal : logTotalLoans;

  if (debtItems.length === 0 && totalDebtOffset > 0) {
    debtItems.push({
      loanId: 'clearance-loan-offset',
      loanNumber: 'Kompensasi Pinjaman',
      purpose: 'Pelunasan Pinjaman via Kliring Anggota Keluar',
      offsetAmount: totalDebtOffset,
      paymentMethod: clearanceLog?.payment_method ?? 'POTONG_SIMPANAN_KLIRING',
      paymentDate: clearanceLog?.created_at ?? null,
    });
  }

  const netSettlement =
    totalSavings === 0 &&
    totalDebtOffset === 0 &&
    clearanceLog?.net_amount !== undefined &&
    clearanceLog?.net_amount !== null
      ? Math.round(Number(clearanceLog.net_amount))
      : Math.round(totalSavings - totalDebtOffset);

  const settlementType: 'SURPLUS_PAYOUT' | 'INSTANT_PAYOFF' =
    netSettlement >= 0 ? 'SURPLUS_PAYOUT' : 'INSTANT_PAYOFF';

  const latestClearanceTxTs = explicitClearanceTxs
    .map((tx) => String(tx?.created_at || tx?.transaction_date || ''))
    .filter(Boolean)
    .sort()
    .pop();

  const latestRepayTs = matchedRepayments
    .map((r) => String(r?.payment_date || r?.created_at || ''))
    .filter(Boolean)
    .sort()
    .pop();

  const clearanceTimestamp =
    String(
      clearanceLog?.created_at ||
        latestClearanceTxTs ||
        latestRepayTs ||
        member?.updated_at ||
        ''
    ).trim() || new Date().toISOString();

  return {
    savingsItems,
    savingsByBucket,
    totalSavings,
    debtItems,
    totalDebtOffset,
    netSettlement,
    settlementType,
    clearanceTimestamp,
  };
}

interface MemberClearanceContext {
  logsByMember: Map<string, any[]>;
  mdsByMember: Map<string, any[]>;
  dtMap: Map<string, { id: string; code: string; name: string }>;
  txsByMdId: Map<string, any[]>;
  loansByMember: Map<string, any[]>;
  repaysByLoanId: Map<string, any[]>;
}

function pickLatestSettlementClearanceLog(logs: any[]): any | null {
  const valid = logs.filter(
    (l) => String(l?.settlement_type || '').toUpperCase() !== 'TRANSFERRED_TO_DEBTOR'
  );
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) =>
    String(b?.created_at || '').localeCompare(String(a?.created_at || ''))
  );
  return sorted[0] ?? null;
}

async function fetchMemberClearanceContext(
  memberIds: string[]
): Promise<MemberClearanceContext> {
  const uniqueIds = Array.from(new Set(memberIds.filter(Boolean)));
  const logsByMember = new Map<string, any[]>();
  const mdsByMember = new Map<string, any[]>();
  const dtMap = new Map<string, { id: string; code: string; name: string }>();
  const txsByMdId = new Map<string, any[]>();
  const loansByMember = new Map<string, any[]>();
  const repaysByLoanId = new Map<string, any[]>();

  if (uniqueIds.length === 0) {
    return { logsByMember, mdsByMember, dtMap, txsByMdId, loansByMember, repaysByLoanId };
  }

  const [clearanceLogs, memberDeposits, dtRes, loans] = await Promise.all([
    safeFetchByColumnIn<any>(
      'member_clearance_logs',
      'id, anggota_id, settlement_type, total_savings, total_loans, net_amount, payment_method, notes, created_at',
      'anggota_id',
      uniqueIds
    ),
    safeFetchByColumnIn<any>(
      'member_deposits',
      'id, member_id, deposit_type_id, balance',
      'member_id',
      uniqueIds,
      'id, member_id, deposit_type_id'
    ),
    safeFetchAllPaged<any>('deposit_types', 'id, code, name'),
    safeFetchByColumnIn<any>(
      'loans',
      'id, member_id, loan_number, amount, principal_amount, notes, status, created_at',
      'member_id',
      uniqueIds,
      'id, member_id, loan_number, amount, notes, status, created_at'
    ),
  ]);

  for (const log of clearanceLogs) {
    const mid = String(log?.anggota_id || '');
    if (!mid) continue;
    const list = logsByMember.get(mid) || [];
    list.push(log);
    logsByMember.set(mid, list);
  }

  for (const md of memberDeposits) {
    const mid = String(md?.member_id || '');
    if (!mid) continue;
    const list = mdsByMember.get(mid) || [];
    list.push(md);
    mdsByMember.set(mid, list);
  }

  for (const dt of dtRes.data || []) {
    if (dt?.id) {
      dtMap.set(String(dt.id), {
        id: String(dt.id),
        code: String(dt.code || ''),
        name: String(dt.name || ''),
      });
    }
  }

  for (const l of loans) {
    const mid = String(l?.member_id || '');
    if (!mid) continue;
    const list = loansByMember.get(mid) || [];
    list.push(l);
    loansByMember.set(mid, list);
  }

  const mdIds = Array.from(
    new Set(memberDeposits.map((md: any) => String(md?.id || '')).filter(Boolean))
  );
  const loanIds = Array.from(
    new Set(loans.map((l: any) => String(l?.id || '')).filter(Boolean))
  );

  const [depositTransactions, loanRepayments] = await Promise.all([
    mdIds.length > 0
      ? safeFetchByColumnIn<any>(
          'deposit_transactions',
          'id, member_deposit_id, transaction_type, amount, description, reference_no, notes, transaction_date, created_at',
          'member_deposit_id',
          mdIds,
          'id, member_deposit_id, transaction_type, amount, description, created_at'
        )
      : Promise.resolve([]),
    loanIds.length > 0
      ? safeFetchByColumnIn<any>(
          'loan_repayments',
          'id, loan_id, amount_paid, payment_method, notes, payment_date, created_at',
          'loan_id',
          loanIds,
          'id, loan_id, amount_paid, payment_method, notes, payment_date'
        )
      : Promise.resolve([]),
  ]);

  for (const tx of depositTransactions) {
    const mdId = String(tx?.member_deposit_id || '');
    if (!mdId) continue;
    const list = txsByMdId.get(mdId) || [];
    list.push(tx);
    txsByMdId.set(mdId, list);
  }

  for (const rep of loanRepayments) {
    const lid = String(rep?.loan_id || '');
    if (!lid) continue;
    const list = repaysByLoanId.get(lid) || [];
    list.push(rep);
    repaysByLoanId.set(lid, list);
  }

  return { logsByMember, mdsByMember, dtMap, txsByMdId, loansByMember, repaysByLoanId };
}

function computeMemberSettlementFromContext(
  memberId: string,
  member: any,
  ctx: MemberClearanceContext,
  extraLog?: any | null
) {
  const logs = [...(ctx.logsByMember.get(memberId) || [])];
  if (extraLog && !logs.some((l) => l?.id && l.id === extraLog.id)) {
    logs.push(extraLog);
  }
  const clearanceLog = pickLatestSettlementClearanceLog(logs);
  const memberDeposits = ctx.mdsByMember.get(memberId) || [];
  const memberTxs: any[] = [];
  for (const md of memberDeposits) {
    if (md?.id) {
      memberTxs.push(...(ctx.txsByMdId.get(String(md.id)) || []));
    }
  }
  const memberLoans = ctx.loansByMember.get(memberId) || [];
  const memberRepayments: any[] = [];
  for (const l of memberLoans) {
    if (l?.id) {
      memberRepayments.push(...(ctx.repaysByLoanId.get(String(l.id)) || []));
    }
  }

  return {
    clearanceLog,
    ...computeMemberClearanceSettlement({
      member,
      clearanceLog,
      memberDeposits,
      depositTypesMap: ctx.dtMap,
      depositTransactions: memberTxs,
      loans: memberLoans,
      loanRepayments: memberRepayments,
    }),
  };
}

function getCycleDateCandidates(cycle: any): string[] {
  const primaryRaw = cycle?.disbursement_date || cycle?.approved_at || null;
  if (primaryRaw) {
    const primaryDates = [
      ...getDateCandidates(cycle?.disbursement_date),
      ...getDateCandidates(cycle?.approved_at),
    ];
    return Array.from(new Set(primaryDates));
  }
  return Array.from(
    new Set([
      ...getDateCandidates(cycle?.cut_off_date),
      ...getDateCandidates(cycle?.created_at),
    ])
  );
}

function extractCycleNameFromBulkText(text?: string | null): string | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const parenMatch = raw.match(
    /pencairan\s+massal\s+simpanan\s+lebaran\s*\((.+?)\)\s*(?:[—–-]\s*\d+\s*anggota|\(Rp|$)/i
  );
  if (parenMatch?.[1]) {
    const extracted = parenMatch[1].trim();
    if (extracted) return extracted;
  }

  const dashMatch = raw.match(
    /pencairan\s+massal\s+simpanan\s+lebaran\s*[-–—:]\s*(.+)$/i
  );
  if (dashMatch?.[1]) {
    const extracted = dashMatch[1]
      .replace(/\s*[—–-]\s*\d+\s*anggota.*$/i, '')
      .replace(/\s*\(Rp\s+[\d.,]+\)\s*$/i, '')
      .trim();
    if (extracted) return extracted;
  }

  return null;
}

async function fetchLebaranWithdrawalRecipientsFromTransactions(params: {
  dateCandidates: string[];
  cycleName?: string | null;
  fallbackPrefix?: string;
}): Promise<BulkLebaranRecipientRow[]> {
  const { dateCandidates, cycleName, fallbackPrefix = 'bulk' } = params;

  let txAllRes = await safeFetchAllPaged<any>(
    'deposit_transactions',
    'id, member_deposit_id, transaction_type, amount, description, reference_no, payment_method, transaction_date, created_at'
  );
  if (txAllRes.error && isPostgrestColumnError(txAllRes.error)) {
    txAllRes = await safeFetchAllPaged<any>(
      'deposit_transactions',
      'id, member_deposit_id, transaction_type, amount, description, created_at'
    );
  }

  const allWithdrawalTxs = (txAllRes.data || []).filter(
    (tx: any) => tx?.transaction_type === 'withdrawal'
  );
  if (allWithdrawalTxs.length === 0) return [];

  const cycleNameLower = String(cycleName || '').trim().toLowerCase();
  let matchingTxs = allWithdrawalTxs.filter((tx: any) => {
    const txDescLower = String(tx?.description || '').toLowerCase();
    const txRefUpper = String(tx?.reference_no || '').toUpperCase();
    const txDateCandidates = [
      ...getDateCandidates(tx?.transaction_date),
      ...getDateCandidates(tx?.created_at),
    ];
    if (cycleNameLower && txDescLower.includes(cycleNameLower)) {
      return true;
    }
    if (
      txRefUpper.startsWith('KW-THR-') &&
      hasCommonDate(dateCandidates, txDateCandidates) &&
      !txDescLower.includes('(personal)')
    ) {
      return true;
    }
    return false;
  });

  // Fallback: cari transaksi penarikan pada jenis simpanan LEBARAN pada tanggal yang sama
  if (matchingTxs.length === 0 && dateCandidates.length > 0) {
    const [dtRes, mdRes] = await Promise.all([
      safeFetchAllPaged<any>('deposit_types', 'id, code, name'),
      safeFetchAllPaged<any>('member_deposits', 'id, member_id, deposit_type_id'),
    ]);

    const lebaranTypeIds = new Set(
      (dtRes.data || [])
        .filter((dt: any) => isLebaranDepositCodeOrName(dt?.code, dt?.name))
        .map((dt: any) => String(dt?.id || ''))
        .filter(Boolean)
    );

    if (lebaranTypeIds.size > 0) {
      const lebaranMdIds = new Set(
        (mdRes.data || [])
          .filter((md: any) => lebaranTypeIds.has(String(md?.deposit_type_id || '')))
          .map((md: any) => String(md?.id || ''))
          .filter(Boolean)
      );

      matchingTxs = allWithdrawalTxs.filter((tx: any) => {
        const mdId = String(tx?.member_deposit_id || '');
        if (!mdId || !lebaranMdIds.has(mdId)) return false;
        const txDescLower = String(tx?.description || '').toLowerCase();
        if (txDescLower.includes('(personal)')) return false;
        const txDateCandidates = [
          ...getDateCandidates(tx?.transaction_date),
          ...getDateCandidates(tx?.created_at),
        ];
        return hasCommonDate(dateCandidates, txDateCandidates);
      });
    }
  }

  if (matchingTxs.length === 0) return [];

  const mdIds = matchingTxs
    .map((tx: any) => String(tx?.member_deposit_id || ''))
    .filter(Boolean);
  const mdRows = await safeFetchByIds<any>(
    'member_deposits',
    'id, member_id, deposit_type_id',
    mdIds
  );
  const mdMap = new Map<string, any>();
  for (const md of mdRows) {
    if (md?.id) mdMap.set(String(md.id), md);
  }

  const memberIds = Array.from(
    new Set(mdRows.map((md: any) => String(md?.member_id || '')).filter(Boolean))
  );
  const memberMap = await safeFetchMembersWithBankByIds(memberIds);

  return matchingTxs.map((tx: any, idx: number) => {
    const md = tx?.member_deposit_id ? mdMap.get(String(tx.member_deposit_id)) : undefined;
    const mInfo = md?.member_id ? memberMap.get(String(md.member_id)) : undefined;
    return {
      id: String(tx?.id || `${fallbackPrefix}-tx-${idx}`),
      memberId: String(md?.member_id || ''),
      nrp: String(mInfo?.nrp || '-'),
      nama: String(mInfo?.nama || 'Anggota'),
      tanggal_lahir: mInfo?.tanggal_lahir ?? null,
      bankName: String(mInfo?.bankName || ''),
      bankAccountNumber: String(mInfo?.bankAccountNumber || ''),
      amount: Math.round(Number(tx?.amount || 0)),
      referenceNo: tx?.reference_no ?? null,
    };
  });
}

const CASHIER_SHIFT_CATEGORIES = new Set([
  'MODAL_KASIR_AWAL',
  'PENGEMBALIAN_MODAL_KASIR',
  'PENJUALAN_KASIR_TUNAI',
  'SELISIH_LEBIH_KASIR',
  'SELISIH_KURANG_KASIR',
]);

const FULL_MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

const DEPOSIT_TX_FULL_COLS =
  'id, member_deposit_id, transaction_type, amount, for_month, for_year, description, reference_no, payment_method, notes, transaction_date, created_at';
const DEPOSIT_TX_NO_DATE_COLS =
  'id, member_deposit_id, transaction_type, amount, for_month, for_year, description, reference_no, payment_method, notes, created_at';
const DEPOSIT_TX_MIN_COLS =
  'id, member_deposit_id, transaction_type, amount, for_month, for_year, description, created_at';

const LOAN_REPAY_FULL_COLS =
  'id, loan_id, schedule_id, amount_paid, payment_method, receipt_number, payment_date, notes, created_at';
const LOAN_REPAY_NO_DATE_COLS =
  'id, loan_id, schedule_id, amount_paid, payment_method, receipt_number, notes, created_at';
const LOAN_REPAY_MIN_COLS =
  'id, loan_id, amount_paid, notes, created_at';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMemberDepositBatchCategory(category?: string | null): boolean {
  const normalized = String(category || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  return normalized === 'SETORAN_ANGGOTA';
}

export function extractReceiptCodeFromCashFlow(
  referenceId?: string | null,
  description?: string | null
): string | null {
  const refTrimmed = String(referenceId || '').trim();
  if (/^(KW-[A-Z0-9/_-]+)$/i.test(refTrimmed)) {
    return refTrimmed.toUpperCase();
  }

  const desc = String(description || '');
  const bracketMatch = desc.match(/\[(KW-[A-Z0-9/_-]+)\]/i);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].toUpperCase();
  }

  const setorMatch = desc.match(/\b(KW-SETOR-[A-Z0-9/_-]+)\b/i);
  if (setorMatch?.[1]) {
    return setorMatch[1].toUpperCase();
  }

  const kwMatch = desc.match(/\b(KW-[A-Z0-9/_-]+)\b/i);
  if (kwMatch?.[1]) {
    return kwMatch[1].toUpperCase();
  }

  return null;
}

export function extractMemberNrpFromDepositDescription(
  description?: string | null
): string | null {
  const desc = String(description || '');
  const parenMatch = desc.match(/\((\d{5,})\)/);
  if (parenMatch?.[1]) return parenMatch[1];

  const dashMatch = desc.match(/[—–-]\s*(?:\(lama\s*\d+\)\s*)?(\d{5,})\s*-/);
  if (dashMatch?.[1]) return dashMatch[1];

  return null;
}

export function extractMemberNameFromDepositDescription(
  description?: string | null
): string | null {
  const desc = String(description || '');
  const typedExactMatch = desc.match(
    /^Setoran\s+Anggota\s*\([^)]+\)\s*[—–-]\s*(.+?)\s*\(\d{5,}\)/i
  );
  if (typedExactMatch?.[1]) return typedExactMatch[1].trim();

  const typedFallbackMatch = desc.match(
    /^Setoran\s+Anggota\s*\([^)]+\)\s*[—–-]\s*(.+?)\s*\(/i
  );
  if (typedFallbackMatch?.[1]) return typedFallbackMatch[1].trim();

  const exactMatch = desc.match(/^Setoran\s+Anggota\s+(.+?)\s*\(\d{5,}\)/i);
  if (exactMatch?.[1]) return exactMatch[1].trim();

  const fallbackMatch = desc.match(/^Setoran\s+Anggota\s+(.+?)\s*\(/i);
  if (fallbackMatch?.[1]) return fallbackMatch[1].trim();

  return null;
}

export function extractPaymentMethodFromDepositDescription(
  description?: string | null
): string | null {
  const desc = String(description || '');
  const nrpAnchoredMatch = desc.match(/\(\d{5,}\)\s*-\s*([^[\]]+?)(?:\s*\[|$)/i);
  if (nrpAnchoredMatch?.[1]) return nrpAnchoredMatch[1].trim();

  const match = desc.match(/\)\s*-\s*([^[\]]+?)(?:\s*\[|$)/i);
  return match?.[1] ? match[1].trim() : null;
}

function formatBatchPeriodLabel(
  forMonth: number | null,
  forYear: number | null,
  depositTypeCode: string,
  description?: string | null
): string {
  if (
    forMonth !== null &&
    forYear !== null &&
    Number.isInteger(forMonth) &&
    forMonth >= 1 &&
    forMonth <= 12 &&
    Number.isInteger(forYear) &&
    forYear > 0
  ) {
    return `${FULL_MONTH_NAMES_ID[forMonth - 1]} ${forYear}`;
  }

  const codeUpper = String(depositTypeCode || '').trim().toUpperCase();
  if (codeUpper === 'POKOK' || codeUpper === 'SP') {
    return 'Kewajiban Pokok';
  }

  const desc = String(description || '');
  const parenPeriod = desc.match(/\(([^()]+)\)\s*$/);
  if (parenPeriod?.[1] && !/^\d{5,}$/.test(parenPeriod[1].trim())) {
    return parenPeriod[1].trim();
  }

  return 'Sekali Bayar';
}

function getBatchBucketSortOrder(code?: string | null): number {
  const upper = String(code || '').trim().toUpperCase();
  if (upper === 'POKOK' || upper === 'SP') return 1;
  if (upper === 'WAJIB' || upper === 'SW') return 2;
  if (upper === 'BELANJA' || upper === 'SB') return 3;
  if (upper === 'LEBARAN' || upper === 'SL' || upper === 'SHR') return 4;
  if (upper === 'PINJAMAN') return 6;
  return 5;
}

function depositTxMatchesReceipt(tx: any, receiptCodeUpper: string): boolean {
  if (!receiptCodeUpper) return false;
  const refNo = String(tx?.reference_no || '').trim().toUpperCase();
  if (refNo === receiptCodeUpper || refNo.includes(receiptCodeUpper)) return true;

  const notes = String(tx?.notes || '').toUpperCase();
  if (notes.includes(receiptCodeUpper)) return true;

  const desc = String(tx?.description || '').toUpperCase();
  if (desc.includes(receiptCodeUpper)) return true;

  return false;
}

function loanRepaymentMatchesReceipt(rep: any, receiptCodeUpper: string): boolean {
  if (!receiptCodeUpper) return false;
  const repNo = String(rep?.receipt_number || '').trim().toUpperCase();
  if (
    repNo === receiptCodeUpper ||
    repNo.startsWith(`${receiptCodeUpper}-L`) ||
    repNo.includes(receiptCodeUpper)
  ) {
    return true;
  }
  const notes = String(rep?.notes || '').toUpperCase();
  return notes.includes(receiptCodeUpper);
}

async function fetchDepositTransactionsByRefResilient(
  receiptCode: string
): Promise<any[]> {
  let res = await safeFetchListByEq<any>(
    'deposit_transactions',
    DEPOSIT_TX_FULL_COLS,
    'reference_no',
    receiptCode
  );
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchListByEq<any>(
      'deposit_transactions',
      DEPOSIT_TX_NO_DATE_COLS,
      'reference_no',
      receiptCode
    );
  }
  if (res.error) return [];
  return (res.data || []).filter(
    (r: any) => !r?.transaction_type || r.transaction_type === 'deposit'
  );
}

async function fetchAllDepositTransactionsResilient(): Promise<any[]> {
  let res = await safeFetchAllPaged<any>('deposit_transactions', DEPOSIT_TX_FULL_COLS);
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchAllPaged<any>('deposit_transactions', DEPOSIT_TX_NO_DATE_COLS);
  }
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchAllPaged<any>('deposit_transactions', DEPOSIT_TX_MIN_COLS);
  }
  return res.data || [];
}

async function fetchAllLoanRepaymentsResilient(): Promise<any[]> {
  let res = await safeFetchAllPaged<any>('loan_repayments', LOAN_REPAY_FULL_COLS);
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchAllPaged<any>('loan_repayments', LOAN_REPAY_NO_DATE_COLS);
  }
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchAllPaged<any>('loan_repayments', LOAN_REPAY_MIN_COLS);
  }
  return res.data || [];
}

async function fetchSingleDepositTxResilient(id: string): Promise<any | null> {
  let res = await safeFetchSingleById<any>('deposit_transactions', DEPOSIT_TX_FULL_COLS, id);
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchSingleById<any>('deposit_transactions', DEPOSIT_TX_NO_DATE_COLS, id);
  }
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchSingleById<any>('deposit_transactions', DEPOSIT_TX_MIN_COLS, id);
  }
  return res.data ?? null;
}

function selectBestMatchedDepositRowsForAmount(
  sameDayRows: any[],
  journalAmount: number,
  journalCreatedAt: string
): any[] {
  if (sameDayRows.length === 0) return [];
  const totalAll = sameDayRows.reduce(
    (s, r) => s + Math.round(Number(r?.amount || 0)),
    0
  );
  if (journalAmount <= 0 || totalAll === journalAmount) {
    return sameDayRows;
  }

  // 1. Coba kelompokkan berdasarkan reference_no yang jumlahnya persis sama dengan nominal jurnal
  const byRef = new Map<string, any[]>();
  for (const row of sameDayRows) {
    const key = String(row?.reference_no || '').trim().toUpperCase();
    if (!key) continue;
    const list = byRef.get(key) || [];
    list.push(row);
    byRef.set(key, list);
  }
  for (const group of byRef.values()) {
    const groupSum = group.reduce(
      (s, r) => s + Math.round(Number(r?.amount || 0)),
      0
    );
    if (groupSum === journalAmount) {
      return group;
    }
  }

  // 2. Coba filter baris dengan timestamp dalam ±60 detik dari created_at cash_flow
  const journalMs = new Date(journalCreatedAt).getTime();
  if (!Number.isNaN(journalMs)) {
    const withinWindow = sameDayRows.filter((row) => {
      const txMs = new Date(row?.created_at || '').getTime();
      return !Number.isNaN(txMs) && Math.abs(txMs - journalMs) <= 60_000;
    });
    const windowSum = withinWindow.reduce(
      (s, r) => s + Math.round(Number(r?.amount || 0)),
      0
    );
    if (withinWindow.length > 0 && windowSum === journalAmount) {
      return withinWindow;
    }
  }

  return sameDayRows;
}

async function resolveMemberDepositBatchData(params: {
  cashFlowRow: CashFlowAuditInput;
  journal: JournalMetadata;
  receiptCode: string | null;
  memberNrpHint: string | null;
  memberNameHint: string | null;
  paymentMethodHint: string | null;
}): Promise<MemberDepositBatchBreakdown> {
  const {
    cashFlowRow,
    journal,
    receiptCode: initialReceiptCode,
    memberNrpHint,
    memberNameHint,
    paymentMethodHint,
  } = params;

  let effectiveReceiptCode = initialReceiptCode;
  let matchedTxs: any[] = [];
  let cachedAllTxs: any[] | null = null;

  const getAllTxs = async (): Promise<any[]> => {
    if (cachedAllTxs !== null) return cachedAllTxs;
    cachedAllTxs = await fetchAllDepositTransactionsResilient();
    return cachedAllTxs;
  };

  // 1. Pencocokan utama via reference_no (direct eq query, lalu full scan notes/description)
  if (effectiveReceiptCode) {
    const receiptUpper = effectiveReceiptCode.toUpperCase();
    const directMatches = await fetchDepositTransactionsByRefResilient(effectiveReceiptCode);
    if (directMatches.length > 0) {
      matchedTxs = directMatches;
    }

    const directSum = matchedTxs.reduce(
      (s, t) => s + Math.round(Number(t?.amount || 0)),
      0
    );
    if (matchedTxs.length === 0 || (journal.amount > 0 && directSum < journal.amount)) {
      const allTxs = await getAllTxs();
      const scannedMatches = allTxs.filter(
        (row: any) =>
          row?.transaction_type === 'deposit' && depositTxMatchesReceipt(row, receiptUpper)
      );
      if (scannedMatches.length > matchedTxs.length) {
        matchedTxs = scannedMatches;
      }
    }
  }

  // 2. Pencocokan via UUID cash_flow.reference_id (dapat berupa deposit_transactions.id atau anggota.id)
  let resolvedMemberFromRef: any | null = null;
  const rawRefId = String(cashFlowRow.reference_id || '').trim();
  if (matchedTxs.length === 0 && rawRefId && UUID_REGEX.test(rawRefId)) {
    const txById = await fetchSingleDepositTxResilient(rawRefId);
    if (txById && txById.transaction_type === 'deposit') {
      const txRef = String(txById.reference_no || '').trim();
      if (txRef && !effectiveReceiptCode) {
        effectiveReceiptCode = txRef.toUpperCase();
      }
      if (effectiveReceiptCode) {
        const allTxs = await getAllTxs();
        const batchMatches = allTxs.filter(
          (row: any) =>
            row?.transaction_type === 'deposit' &&
            depositTxMatchesReceipt(row, effectiveReceiptCode!)
        );
        matchedTxs = batchMatches.length > 0 ? batchMatches : [txById];
      } else {
        matchedTxs = [txById];
      }
    } else {
      const memberByRef = await safeFetchSingleById<any>(
        'anggota',
        'id, nrp, nama, tanggal_lahir',
        rawRefId
      );
      if (memberByRef.data?.id) {
        resolvedMemberFromRef = memberByRef.data;
      }
    }
  }

  // 3. Fallback historis: cocokkan anggota via NRP + tanggal transaksi + nominal jurnal
  let resolvedMember: any | null = resolvedMemberFromRef;
  if (matchedTxs.length === 0 && (memberNrpHint || resolvedMember)) {
    if (!resolvedMember && memberNrpHint) {
      const allMembers = await safeFetchAllPaged<any>('anggota', 'id, nrp, nama, tanggal_lahir');
      resolvedMember =
        (allMembers.data || []).find(
          (m: any) => stripResignedNrpPrefix(m?.nrp) === stripResignedNrpPrefix(memberNrpHint)
        ) ?? null;
    }

    if (resolvedMember?.id) {
      const memberMdsRes = await safeFetchListByEq<any>(
        'member_deposits',
        'id, member_id, deposit_type_id',
        'member_id',
        String(resolvedMember.id)
      );
      let memberMdIds = new Set(
        (memberMdsRes.data || []).map((md: any) => String(md.id)).filter(Boolean)
      );
      if (memberMdIds.size === 0) {
        const allMds = await safeFetchAllPaged<any>(
          'member_deposits',
          'id, member_id, deposit_type_id'
        );
        memberMdIds = new Set(
          (allMds.data || [])
            .filter((md: any) => String(md?.member_id || '') === String(resolvedMember.id))
            .map((md: any) => String(md.id))
        );
      }

      if (memberMdIds.size > 0) {
        const allTxs = await getAllTxs();
        const cfDateCandidates = getDateCandidates(cashFlowRow.created_at);
        const sameDayMemberTxs = allTxs.filter((row: any) => {
          if (row?.transaction_type !== 'deposit') return false;
          if (!memberMdIds.has(String(row?.member_deposit_id || ''))) return false;
          if (isOpeningDepositTransaction(row)) return false;
          const descLower = String(row?.description || '').toLowerCase();
          if (descLower.includes('saldo awal')) return false;

          if (cfDateCandidates.length === 0) return true;
          const txDateCandidates = getDateCandidates(
            row?.transaction_date || row?.created_at
          );
          return hasCommonDate(cfDateCandidates, txDateCandidates);
        });

        matchedTxs = selectBestMatchedDepositRowsForAmount(
          sameDayMemberTxs,
          journal.amount,
          journal.createdAt
        );
      }
    }
  }

  // 4. Cek angsuran pinjaman yang dibayar dalam batch kwitansi yang sama (jika masih ada selisih)
  const matchedTxSum = matchedTxs.reduce(
    (s, t) => s + Math.round(Number(t?.amount || 0)),
    0
  );
  let matchedLoanRepayments: any[] = [];
  if (
    effectiveReceiptCode &&
    (matchedTxs.length === 0 || (journal.amount > 0 && matchedTxSum < journal.amount))
  ) {
    const receiptUpper = effectiveReceiptCode.toUpperCase();
    const allRepayments = await fetchAllLoanRepaymentsResilient();
    matchedLoanRepayments = allRepayments.filter((rep: any) =>
      loanRepaymentMatchesReceipt(rep, receiptUpper)
    );
  }

  // 5. Enrich member_deposits, deposit_types, loans, dan anggota
  const mdIds = Array.from(
    new Set(
      matchedTxs.map((t: any) => String(t?.member_deposit_id || '')).filter(Boolean)
    )
  );
  const loanIds = Array.from(
    new Set(
      matchedLoanRepayments.map((r: any) => String(r?.loan_id || '')).filter(Boolean)
    )
  );

  const [mdRows, loanRows] = await Promise.all([
    mdIds.length > 0
      ? safeFetchByIds<any>('member_deposits', 'id, member_id, deposit_type_id', mdIds)
      : Promise.resolve([]),
    loanIds.length > 0
      ? safeFetchByIds<any>(
          'loans',
          'id, member_id, loan_type_name, jenis_pinjaman',
          loanIds,
          'id, member_id'
        )
      : Promise.resolve([]),
  ]);

  const mdMap = new Map<string, any>();
  for (const md of mdRows) {
    if (md?.id) mdMap.set(String(md.id), md);
  }
  const loanMap = new Map<string, any>();
  for (const l of loanRows) {
    if (l?.id) loanMap.set(String(l.id), l);
  }

  const dtIds = Array.from(
    new Set(mdRows.map((md: any) => String(md?.deposit_type_id || '')).filter(Boolean))
  );
  const memberIds = Array.from(
    new Set(
      [
        ...mdRows.map((md: any) => String(md?.member_id || '')),
        ...loanRows.map((l: any) => String(l?.member_id || '')),
        resolvedMember?.id ? String(resolvedMember.id) : '',
      ].filter(Boolean)
    )
  );

  const [dtRows, memberRows] = await Promise.all([
    dtIds.length > 0
      ? safeFetchByIds<any>('deposit_types', 'id, code, name', dtIds)
      : Promise.resolve([]),
    memberIds.length > 0
      ? safeFetchByIds<any>('anggota', 'id, nrp, nama, tanggal_lahir', memberIds)
      : Promise.resolve([]),
  ]);

  const dtMap = new Map<string, any>();
  for (const dt of dtRows) {
    if (dt?.id) dtMap.set(String(dt.id), dt);
  }
  const memberMap = new Map<string, any>();
  for (const m of memberRows) {
    if (m?.id) memberMap.set(String(m.id), m);
  }

  const primaryMemberRow = memberRows[0] || resolvedMember || null;
  const finalMember = {
    id: String(primaryMemberRow?.id || ''),
    nrp: stripResignedNrpPrefix(primaryMemberRow?.nrp) || memberNrpHint || '-',
    nama: String(primaryMemberRow?.nama || memberNameHint || 'Anggota'),
    tanggal_lahir: primaryMemberRow?.tanggal_lahir ?? null,
  };

  const items: MemberDepositBatchItem[] = [];

  for (const tx of matchedTxs) {
    const md = tx?.member_deposit_id ? mdMap.get(String(tx.member_deposit_id)) : undefined;
    const dt = md?.deposit_type_id ? dtMap.get(String(md.deposit_type_id)) : undefined;
    const txMember = md?.member_id ? memberMap.get(String(md.member_id)) : primaryMemberRow;

    const depositTypeCode = String(dt?.code || '').trim() || '-';
    const depositTypeName = String(dt?.name || '').trim() || 'Simpanan Anggota';
    const forMonth =
      tx?.for_month !== null && tx?.for_month !== undefined && tx?.for_month !== ''
        ? Number(tx.for_month)
        : null;
    const forYear =
      tx?.for_year !== null && tx?.for_year !== undefined && tx?.for_year !== ''
        ? Number(tx.for_year)
        : null;

    items.push({
      id: String(tx.id || `${md?.id || 'tx'}-${forYear || 0}-${forMonth || 0}`),
      memberId: txMember?.id ? String(txMember.id) : finalMember.id || undefined,
      memberNrp: stripResignedNrpPrefix(txMember?.nrp) || finalMember.nrp,
      memberName: txMember?.nama ? String(txMember.nama) : finalMember.nama,
      depositTypeName,
      depositTypeCode,
      forMonth,
      forYear,
      periodLabel: formatBatchPeriodLabel(
        forMonth,
        forYear,
        depositTypeCode,
        tx?.description
      ),
      paymentMethod: tx?.payment_method ?? paymentMethodHint ?? null,
      referenceNo: tx?.reference_no ?? effectiveReceiptCode ?? null,
      description: String(tx?.description || `Setoran ${depositTypeName}`),
      notes: tx?.notes ?? null,
      amount: Math.round(Number(tx?.amount || 0)),
      createdAt: String(tx?.created_at || tx?.transaction_date || journal.createdAt),
    });
  }

  for (const rep of matchedLoanRepayments) {
    const loan = rep?.loan_id ? loanMap.get(String(rep.loan_id)) : undefined;
    const repMember = loan?.member_id ? memberMap.get(String(loan.member_id)) : primaryMemberRow;
    const loanLabel = loan?.loan_type_name || loan?.jenis_pinjaman || 'Pinjaman Anggota';

    items.push({
      id: `repay-${String(rep.id || rep.receipt_number || Math.random())}`,
      memberId: repMember?.id ? String(repMember.id) : finalMember.id || undefined,
      memberNrp: stripResignedNrpPrefix(repMember?.nrp) || finalMember.nrp,
      memberName: repMember?.nama ? String(repMember.nama) : finalMember.nama,
      depositTypeName: `Angsuran ${loanLabel}`,
      depositTypeCode: 'PINJAMAN',
      forMonth: null,
      forYear: null,
      periodLabel: formatBatchPeriodLabel(null, null, 'PINJAMAN', rep?.notes),
      paymentMethod: rep?.payment_method ?? paymentMethodHint ?? null,
      referenceNo: rep?.receipt_number ?? effectiveReceiptCode ?? null,
      description: String(rep?.notes || `Pembayaran Angsuran ${loanLabel}`),
      notes: rep?.notes ?? null,
      amount: Math.round(Number(rep?.amount_paid || 0)),
      createdAt: String(rep?.created_at || rep?.payment_date || journal.createdAt),
    });
  }

  items.sort((a, b) => {
    const bucketDiff =
      getBatchBucketSortOrder(a.depositTypeCode) - getBatchBucketSortOrder(b.depositTypeCode);
    if (bucketDiff !== 0) return bucketDiff;

    const pA = a.forYear && a.forMonth ? a.forYear * 12 + a.forMonth : 0;
    const pB = b.forYear && b.forMonth ? b.forYear * 12 + b.forMonth : 0;
    if (pA !== pB) return pA - pB;

    return a.createdAt.localeCompare(b.createdAt);
  });

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const firstRefNo = items.find((i) => i.referenceNo)?.referenceNo || null;
  const firstPayMethod = items.find((i) => i.paymentMethod)?.paymentMethod || null;
  const resolvedReceiptNumber = effectiveReceiptCode || firstRefNo || '-';

  return {
    sourceMenu: 'Simpanan & Buku Besar → Setoran Simpanan',
    receiptNumber: resolvedReceiptNumber,
    paymentMethod: firstPayMethod || paymentMethodHint || null,
    member: finalMember,
    items,
    totalAmount,
    journalAmount: journal.amount,
    difference: totalAmount - journal.amount,
    isMatched: items.length > 0 && totalAmount === journal.amount,
  };
}

async function safeFetchAuditLogsByRecordIds(
  recordIds: string[]
): Promise<any[]> {
  const uniqueIds = Array.from(new Set(recordIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const fullCols =
    'id, table_name, action, record_id, entity_id, old_data, performer_name, notes, created_at';
  const fallbackCols =
    'id, action, record_id, old_data, performer_name, notes, created_at';

  const rows = await safeFetchByColumnIn<any>(
    'audit_logs',
    fullCols,
    'record_id',
    uniqueIds,
    fallbackCols
  );
  if (rows.length > 0) return rows;

  if (uniqueIds.length === 1) {
    let singleRes = await safeFetchListByEq<any>(
      'audit_logs',
      fullCols,
      'record_id',
      uniqueIds[0]
    );
    if (singleRes.error && isPostgrestColumnError(singleRes.error)) {
      singleRes = await safeFetchListByEq<any>(
        'audit_logs',
        fallbackCols,
        'record_id',
        uniqueIds[0]
      );
    }
    if (!singleRes.error && singleRes.data.length > 0) {
      return singleRes.data;
    }
  }

  return [];
}

function isAuditDefaultSystemNote(note?: string | null): boolean {
  const lower = String(note || '').trim().toLowerCase();
  if (!lower) return true;
  return (
    lower.includes('setoran matriks') ||
    lower.includes('penghapusan / batal centang') ||
    lower.includes('pembatalan / batal centang') ||
    lower.includes('rekonsiliasi otomatis')
  );
}

function pickBestCancellationAuditLog(logs: any[], recordId: string): any | null {
  const matching = (logs || []).filter(
    (l: any) => String(l?.record_id || '') === recordId
  );
  if (matching.length === 0) return null;

  const deleteLogs = matching.filter(
    (l: any) => String(l?.action || 'DELETE').toUpperCase() === 'DELETE'
  );
  const pool = deleteLogs.length > 0 ? deleteLogs : matching;

  return [...pool].sort((a, b) => {
    const aCustom = !isAuditDefaultSystemNote(a?.notes) ? 1 : 0;
    const bCustom = !isAuditDefaultSystemNote(b?.notes) ? 1 : 0;
    if (aCustom !== bCustom) return bCustom - aCustom;
    const aPerf = a?.performer_name ? 1 : 0;
    const bPerf = b?.performer_name ? 1 : 0;
    if (aPerf !== bPerf) return bPerf - aPerf;
    return String(b?.created_at || '').localeCompare(String(a?.created_at || ''));
  })[0];
}

export async function getCashFlowReferenceBreakdown(
  cashFlowRow: CashFlowAuditInput
): Promise<CashFlowReferenceBreakdown> {
  const refCode =
    cashFlowRow.referensi ||
    `CF-${String(cashFlowRow.id || '').slice(0, 8).toUpperCase()}`;

  const journal: JournalMetadata = {
    id: String(cashFlowRow.id || ''),
    refCode,
    category: String(cashFlowRow.category || 'lainnya'),
    direction: cashFlowRow.direction === 'out' ? 'out' : 'in',
    amount: Math.round(Number(cashFlowRow.amount || 0)),
    description: String(cashFlowRow.description || '-'),
    unitUsaha: String(cashFlowRow.unit_usaha || 'Umum'),
    referenceId: cashFlowRow.reference_id ?? null,
    createdAt: String(cashFlowRow.created_at || ''),
  };

  const catUpper = String(cashFlowRow.category || '').trim().toUpperCase();

  // ── Cabang A: Saldo Awal Simpanan Cut-Off ───────────────────────────────────
  if (catUpper === 'SALDO_AWAL_SIMPANAN') {
    const rawCreated = String(cashFlowRow.created_at || '');
    const cutOffMatch = rawCreated.match(/^(\d{4}-\d{2}-\d{2})/);
    const cutOffDateStr = cutOffMatch ? cutOffMatch[1] : '2026-03-01';

    const [txRes, mdRes, dtRes, anggotaRes] = await Promise.all([
      safeFetchAllPaged<any>(
        'deposit_transactions',
        'id, member_deposit_id, transaction_type, amount, for_year, for_month, description, created_at'
      ),
      safeFetchAllPaged<any>('member_deposits', 'id, member_id, deposit_type_id'),
      safeFetchAllPaged<any>('deposit_types', 'id, code, name'),
      safeFetchAllPaged<any>('anggota', 'id, nrp, nama, tanggal_lahir'),
    ]);

    if (txRes.error) {
      throw new Error(
        `Gagal memuat rincian transaksi simpanan: ${txRes.error?.message || String(txRes.error)}`
      );
    }

    const mdMap = new Map<string, { member_id: string; deposit_type_id: string }>();
    for (const md of mdRes.data) {
      if (md?.id) {
        mdMap.set(md.id, {
          member_id: md.member_id,
          deposit_type_id: md.deposit_type_id,
        });
      }
    }

    const dtMap = new Map<string, { id: string; code: string; name: string }>();
    for (const dt of dtRes.data) {
      if (dt?.id) {
        dtMap.set(dt.id, {
          id: dt.id,
          code: String(dt.code || ''),
          name: String(dt.name || ''),
        });
      }
    }

    const memberMap = new Map<string, { id: string; nrp: string; nama: string; tanggal_lahir: string | null }>();
    for (const m of anggotaRes.data) {
      if (m?.id) {
        memberMap.set(m.id, {
          id: m.id,
          nrp: String(m.nrp || '-'),
          nama: String(m.nama || '-'),
          tanggal_lahir: m.tanggal_lahir ?? null,
        });
      }
    }

    const byDepositType: OpeningSavingsDepositTypeSummary = {
      pokok: 0,
      wajib: 0,
      belanja: 0,
      lebaran: 0,
      lainnya: 0,
      items: [],
    };

    const typeBucketMap = new Map<
      string,
      { code: string; name: string; amount: number; members: Set<string> }
    >();
    const memberRowMap = new Map<string, OpeningSavingsMemberRow>();

    let calculatedTotal = 0;
    let transactionCount = 0;

    for (const tx of txRes.data) {
      if (!isOpeningDepositTransaction(tx, cutOffDateStr)) continue;
      const amt = Math.round(Number(tx?.amount || 0));
      if (amt <= 0) continue;

      transactionCount++;
      calculatedTotal += amt;

      const md = tx?.member_deposit_id ? mdMap.get(tx.member_deposit_id) : undefined;
      const dt = md?.deposit_type_id ? dtMap.get(md.deposit_type_id) : undefined;
      const memberId = String(md?.member_id || tx?.member_deposit_id || tx?.id || 'unknown');
      const memberInfo = md?.member_id ? memberMap.get(md.member_id) : undefined;

      const bucket = classifyDepositTypeBucket(dt);
      byDepositType[bucket] += amt;

      const typeKey = dt?.id || bucket.toUpperCase();
      const defaultNames: Record<typeof bucket, { code: string; name: string }> = {
        pokok: { code: 'POKOK', name: 'Simpanan Pokok' },
        wajib: { code: 'WAJIB', name: 'Simpanan Wajib' },
        belanja: { code: 'BELANJA', name: 'Simpanan Belanja' },
        lebaran: { code: 'LEBARAN', name: 'Simpanan Lebaran' },
        lainnya: { code: 'LAINNYA', name: 'Simpanan Lainnya' },
      };

      const itemMeta = dt
        ? { code: dt.code || defaultNames[bucket].code, name: dt.name || defaultNames[bucket].name }
        : defaultNames[bucket];

      let typeAgg = typeBucketMap.get(typeKey);
      if (!typeAgg) {
        typeAgg = {
          code: itemMeta.code,
          name: itemMeta.name,
          amount: 0,
          members: new Set<string>(),
        };
        typeBucketMap.set(typeKey, typeAgg);
      }
      typeAgg.amount += amt;
      typeAgg.members.add(memberId);

      let mRow = memberRowMap.get(memberId);
      if (!mRow) {
        mRow = {
          member_id: memberId,
          nrp: memberInfo?.nrp || '-',
          nama: memberInfo?.nama || 'Anggota Tidak Dikenal',
          tanggal_lahir: memberInfo?.tanggal_lahir ?? null,
          pokok: 0,
          wajib: 0,
          belanja: 0,
          lebaran: 0,
          lainnya: 0,
          total: 0,
        };
        memberRowMap.set(memberId, mRow);
      }
      mRow[bucket] += amt;
      mRow.total += amt;
    }

    byDepositType.items = Array.from(typeBucketMap.values()).map((item) => ({
      code: item.code,
      name: item.name,
      amount: item.amount,
      memberCount: item.members.size,
    }));

    const memberRows = Array.from(memberRowMap.values())
      .filter((r) => r.total > 0)
      .sort((a, b) => {
        const nrpCmp = a.nrp.localeCompare(b.nrp, 'id', { numeric: true });
        return nrpCmp !== 0 ? nrpCmp : a.nama.localeCompare(b.nama, 'id');
      });

    const journalAmount = journal.amount;
    const difference = calculatedTotal - journalAmount;

    return {
      kind: 'opening_savings',
      journal,
      openingSavings: {
        byDepositType,
        memberRows,
        calculatedTotal,
        journalAmount,
        difference,
        isMatched: difference === 0,
        transactionCount,
      },
    };
  }

  // ── Cabang B: Penjualan POS ──────────────────────────────────────────────────
  if (isPosCashSaleCategory(cashFlowRow.category)) {
    const saleId =
      cashFlowRow.reference_id || (refCode.startsWith('POS-') ? cashFlowRow.id : null);

    if (saleId) {
      const { data: sale } = await safeFetchSingleById<any>(
        'sales',
        'id, sale_number, member_id, subtotal, discount, total_amount, paid_cash, paid_deposit, paid_credit, payment_scheme, created_at',
        saleId
      );

      if (sale) {
        const [itemsRes, memberRes] = await Promise.all([
          safeFetchListByEq<any>('sale_items', '*', 'sale_id', saleId),
          sale.member_id
            ? safeFetchSingleById<any>('anggota', 'id, nrp, nama, tanggal_lahir', sale.member_id)
            : Promise.resolve({ data: null, error: null }),
        ]);

        const rawItems = itemsRes.data || [];
        const missingNameProductIds = Array.from(
          new Set(
            rawItems
              .filter((si) => !si.product_name && si.product_id)
              .map((si) => String(si.product_id))
          )
        );

        const productNameMap = new Map<string, string>();
        if (missingNameProductIds.length > 0) {
          try {
            const pTable: any = supabase?.from?.('products');
            if (pTable && typeof pTable.select === 'function') {
              const pQ = pTable.select('id, name');
              if (pQ && typeof pQ.in === 'function') {
                const pRes = await pQ.in('id', missingNameProductIds);
                for (const p of pRes?.data || []) {
                  if (p?.id && p?.name) productNameMap.set(String(p.id), String(p.name));
                }
              }
            }
          } catch {
            // Non-blocking product name lookup
          }
        }

        const items = rawItems.map((si: any, idx: number) => {
          const qty = Number(si.quantity ?? si.qty ?? 0);
          const price = Number(si.unit_price ?? si.price ?? 0);
          const subtotal = Number(si.subtotal ?? qty * price);
          const productName =
            si.product_name ||
            (si.product_id ? productNameMap.get(String(si.product_id)) : undefined) ||
            `Produk #${idx + 1}`;
          return {
            id: String(si.id || `${saleId}-item-${idx}`),
            productName: String(productName),
            qty,
            price,
            subtotal,
          };
        });

        const resolvedSaleNumber = String(
          sale.sale_number || `POS-${String(saleId).slice(0, 8).toUpperCase()}`
        );
        const memberSummary = formatMemberSummary(memberRes.data);
        const paymentSchemeLabel = formatPosPaymentSchemeLabel({
          paymentScheme: sale.payment_scheme,
          paidCash: Number(sale.paid_cash ?? 0),
          paidDeposit: Number(sale.paid_deposit ?? 0),
          paidCredit: Number(sale.paid_credit ?? 0),
        });

        if (needsPosDescriptionEnrichment(journal.description)) {
          journal.description = formatPosCashFlowDescription({
            saleNumber: resolvedSaleNumber,
            memberNrp: memberSummary?.nrp,
            memberName: memberSummary?.nama,
            amount: Math.round(
              Number(journal.amount || sale.paid_cash || sale.total_amount || 0)
            ),
          });
        } else {
          journal.description = sanitizePosTerminology(journal.description);
        }

        return {
          kind: 'pos_sale',
          journal,
          posSale: {
            saleId: String(sale.id || saleId),
            saleNumber: resolvedSaleNumber,
            createdAt: String(sale.created_at || journal.createdAt),
            paymentScheme: String(sale.payment_scheme || 'cash'),
            paymentSchemeLabel,
            subtotal: Number(sale.subtotal ?? sale.total_amount ?? 0),
            discount: Number(sale.discount ?? 0),
            totalAmount: Number(sale.total_amount ?? 0),
            paidCash: Number(sale.paid_cash ?? 0),
            paidDeposit: Number(sale.paid_deposit ?? 0),
            paidCredit: Number(sale.paid_credit ?? 0),
            member: memberSummary,
            items,
          },
        };
      }
    }

    journal.description = sanitizePosTerminology(journal.description);
    return { kind: 'journal_only', journal };
  }

  // ── Cabang C: Pelunasan Bon Toko ─────────────────────────────────────────────
  if (
    (catUpper === 'PELUNASAN_BON_TOKO' || catUpper === 'PELUNASAN BON TOKO') &&
    cashFlowRow.reference_id
  ) {
    const { data: payment } = await safeFetchSingleById<any>(
      'store_credit_payments',
      'id, sale_id, amount, payment_date, receipt_number, notes, created_at',
      cashFlowRow.reference_id
    );

    if (payment) {
      let saleNumber: string | null = null;
      let saleTotal: number | undefined;
      let salePaidCredit: number | undefined;
      let saleCreatedAt: string | null = null;
      let member: { nrp: string; nama: string; tanggal_lahir?: string | null } | null = null;
      let linkedSale: any = null;

      if (payment.sale_id) {
        let saleRes = await safeFetchSingleById<any>(
          'sales',
          'id, sale_number, member_id, total_amount, paid_credit, created_at',
          String(payment.sale_id)
        );
        if (saleRes.error && isPostgrestColumnError(saleRes.error)) {
          saleRes = await safeFetchSingleById<any>(
            'sales',
            'id, sale_number, member_id, total_amount',
            String(payment.sale_id)
          );
        }
        linkedSale = saleRes.data;
        if (linkedSale) {
          saleNumber = linkedSale.sale_number ? String(linkedSale.sale_number) : null;
          saleTotal = Number(linkedSale.total_amount ?? 0);
          salePaidCredit =
            linkedSale.paid_credit !== undefined && linkedSale.paid_credit !== null
              ? Number(linkedSale.paid_credit)
              : undefined;
          saleCreatedAt = linkedSale.created_at ? String(linkedSale.created_at) : null;

          if (linkedSale.member_id) {
            const { data: m } = await safeFetchSingleById<any>(
              'anggota',
              'id, nrp, nama, tanggal_lahir',
              String(linkedSale.member_id)
            );
            member = formatMemberSummary(m);
          }
        }
      }

      const paidAmount = Math.round(Number(payment.amount ?? journal.amount));
      const inferredMethod = inferStoreCreditPaymentMethod(
        payment.payment_method || null,
        `${payment.notes || ''} ${cashFlowRow.description || ''}`
      );

      let beforeBalance: number | undefined;
      let afterBalance: number | undefined;
      let relatedSales: StoreCreditRelatedSale[] = [];

      if (linkedSale?.member_id) {
        try {
          const salesTable: any = supabase?.from?.('sales');
          if (salesTable && typeof salesTable.select === 'function') {
            let sQ: any = salesTable.select(
              'id, sale_number, member_id, total_amount, paid_credit, sale_status, created_at'
            );
            if (sQ && typeof sQ.eq === 'function') {
              sQ = sQ.eq('member_id', String(linkedSale.member_id));
            }
            const sRes: any = await sQ;
            const rawMemberSales = Array.isArray(sRes?.data) ? sRes.data : [];
            const memberCreditSales = rawMemberSales.filter(
              (s: any) =>
                Number(s?.paid_credit ?? 0) > 0 &&
                (!s?.sale_status ||
                  s.sale_status === 'completed' ||
                  s.sale_status === 'success')
            );

            if (memberCreditSales.length > 0) {
              const paymentTs = new Date(
                payment.created_at || payment.payment_date || journal.createdAt || 0
              ).getTime();

              const eligibleSales = memberCreditSales.filter((s: any) => {
                if (String(s.id) === String(payment.sale_id)) return true;
                const sTs = new Date(s.created_at || 0).getTime();
                return !isNaN(paymentTs) && !isNaN(sTs) ? sTs <= paymentTs : true;
              });

              const eligibleSaleIds = eligibleSales.map((s: any) => String(s.id)).filter(Boolean);
              let allPaymentsForSales: any[] = [];

              if (eligibleSaleIds.length > 0) {
                const payTable: any = supabase?.from?.('store_credit_payments');
                if (payTable && typeof payTable.select === 'function') {
                  let pQ: any = payTable.select('id, sale_id, amount, payment_date, created_at');
                  if (pQ && typeof pQ.in === 'function') {
                    pQ = pQ.in('sale_id', eligibleSaleIds);
                  }
                  const pRes: any = await pQ;
                  if (Array.isArray(pRes?.data)) {
                    allPaymentsForSales = pRes.data;
                  }
                }
              }

              const cumulativeCredit = eligibleSales.reduce(
                (sum: number, s: any) => sum + Number(s.paid_credit ?? s.total_amount ?? 0),
                0
              );

              const priorPaid = allPaymentsForSales.reduce((sum: number, p: any) => {
                if (String(p.id) === String(payment.id)) return sum;
                const pTs = new Date(p.created_at || p.payment_date || 0).getTime();
                if (
                  pTs < paymentTs ||
                  (pTs === paymentTs && String(p.id) < String(payment.id))
                ) {
                  return sum + Number(p.amount ?? 0);
                }
                return sum;
              }, 0);

              beforeBalance = Math.max(paidAmount, Math.round(cumulativeCredit - priorPaid));
              afterBalance = Math.max(0, beforeBalance - paidAmount);

              relatedSales = [...eligibleSales]
                .sort((a: any, b: any) => {
                  if (String(a.id) === String(payment.sale_id)) return -1;
                  if (String(b.id) === String(payment.sale_id)) return 1;
                  return (
                    new Date(a.created_at || 0).getTime() -
                    new Date(b.created_at || 0).getTime()
                  );
                })
                .map((s: any) => ({
                  saleId: String(s.id),
                  saleNumber: String(
                    s.sale_number || `INV-${String(s.id).slice(0, 8).toUpperCase()}`
                  ),
                  totalAmount: Math.round(Number(s.total_amount ?? s.paid_credit ?? 0)),
                  paidCredit: Math.round(Number(s.paid_credit ?? s.total_amount ?? 0)),
                  createdAt: String(s.created_at || ''),
                }));
            }
          }
        } catch {
          // Fallback ke data nota tunggal di bawah jika kueri agregat gagal
        }
      }

      if (beforeBalance === undefined) {
        const singleCredit = Number(
          linkedSale?.paid_credit ?? linkedSale?.total_amount ?? paidAmount
        );
        beforeBalance = Math.max(paidAmount, Math.round(singleCredit));
        afterBalance = Math.max(0, beforeBalance - paidAmount);
      }

      if (relatedSales.length === 0 && linkedSale) {
        relatedSales = [
          {
            saleId: String(linkedSale.id || payment.sale_id),
            saleNumber: String(
              linkedSale.sale_number ||
                `INV-${String(linkedSale.id || payment.sale_id).slice(0, 8).toUpperCase()}`
            ),
            totalAmount: Math.round(Number(linkedSale.total_amount ?? 0)),
            paidCredit: Math.round(
              Number(linkedSale.paid_credit ?? linkedSale.total_amount ?? 0)
            ),
            createdAt: String(linkedSale.created_at || ''),
          },
        ];
      }

      return {
        kind: 'store_credit_payment',
        journal,
        storeCreditPayment: {
          paymentId: String(payment.id || cashFlowRow.reference_id),
          receiptNumber: String(
            payment.receipt_number ||
              `BON-${String(payment.id || cashFlowRow.reference_id).slice(0, 8).toUpperCase()}`
          ),
          amount: paidAmount,
          paymentDate: String(payment.payment_date || payment.created_at || journal.createdAt),
          paymentMethod: inferredMethod,
          notes: payment.notes ?? null,
          saleNumber,
          saleTotal,
          salePaidCredit,
          saleCreatedAt,
          beforeBalance,
          afterBalance,
          relatedSales,
          member,
        },
      };
    }

    return { kind: 'journal_only', journal };
  }

  // ── Cabang D: Penarikan Simpanan (Perorangan & Massal Lebaran) ──────────────
  if (isSavingsWithdrawalCategory(cashFlowRow.category)) {
    const cashFlowDateOnly = String(cashFlowRow.created_at || '').slice(0, 10);
    const cashFlowDateCandidates = getDateCandidates(cashFlowRow.created_at);
    const descLower = String(cashFlowRow.description || '').toLowerCase();
    const isBulkDescHint =
      (descLower.includes('pencairan massal') ||
        descLower.includes('(massal)') ||
        descLower.includes('massal')) &&
      !descLower.includes('(personal)');

    // Langkah A: Cek apakah merujuk ke siklus Pencairan Massal Simpanan Lebaran
    let matchedCycle: any = null;
    if (cashFlowRow.reference_id) {
      let cycleRes = await safeFetchSingleById<any>(
        'lebaran_disbursement_cycles',
        'id, cycle_name, disbursement_date, cut_off_date, source_type, total_members, total_amount, status, notes, approved_at, created_at',
        cashFlowRow.reference_id
      );
      if (cycleRes.error && isPostgrestColumnError(cycleRes.error)) {
        cycleRes = await safeFetchSingleById<any>(
          'lebaran_disbursement_cycles',
          'id, cycle_name, cut_off_date, total_members, total_amount, status, notes, created_at',
          cashFlowRow.reference_id
        );
      }
      matchedCycle = cycleRes.data;
    }

    if (!matchedCycle && (isBulkDescHint || !cashFlowRow.reference_id)) {
      let cyclesRes = await safeFetchAllPaged<any>(
        'lebaran_disbursement_cycles',
        'id, cycle_name, disbursement_date, cut_off_date, source_type, total_members, total_amount, status, notes, approved_at, created_at'
      );
      if (cyclesRes.error && isPostgrestColumnError(cyclesRes.error)) {
        cyclesRes = await safeFetchAllPaged<any>(
          'lebaran_disbursement_cycles',
          'id, cycle_name, cut_off_date, total_members, total_amount, status, notes, created_at'
        );
      }
      const nonManualCycles = (cyclesRes.data || [])
        .filter(
          (c: any) =>
            String(c?.source_type || '').toUpperCase() !== 'MANUAL' &&
            String(c?.status || '').toUpperCase() !== 'REJECTED'
        )
        .sort(
          (a: any, b: any) =>
            String(b?.cycle_name || '').trim().length -
            String(a?.cycle_name || '').trim().length
        );
      const extractedNameLower = (
        extractCycleNameFromBulkText(cashFlowRow.description) || ''
      ).toLowerCase();

      matchedCycle =
        (extractedNameLower
          ? nonManualCycles.find(
              (c: any) => String(c?.cycle_name || '').trim().toLowerCase() === extractedNameLower
            )
          : null) ||
        nonManualCycles.find((c: any) => {
          const cname = String(c?.cycle_name || '').trim().toLowerCase();
          return cname !== '' && descLower.includes(cname);
        }) ||
        nonManualCycles.find((c: any) => {
          const cAmt = Math.round(Number(c?.total_amount || 0));
          return (
            hasCommonDate(cashFlowDateCandidates, getCycleDateCandidates(c)) &&
            cAmt === journal.amount
          );
        }) ||
        null;

      if (!matchedCycle && isBulkDescHint && cashFlowDateCandidates.length > 0) {
        const sameDateCycles = nonManualCycles.filter((c: any) =>
          hasCommonDate(cashFlowDateCandidates, getCycleDateCandidates(c))
        );
        if (sameDateCycles.length === 1) {
          matchedCycle = sameDateCycles[0];
        }
      }
    }

    if (matchedCycle) {
      const cycleDate = getCycleDateOnly(matchedCycle) || cashFlowDateOnly;
      const cycleDateCandidates = Array.from(
        new Set([...getCycleDateCandidates(matchedCycle), ...cashFlowDateCandidates])
      );
      const itemsRes = await safeFetchListByEq<any>(
        'lebaran_disbursement_items',
        'id, cycle_id, member_id, nrp, member_name, bank_account, amount_disbursed, created_at',
        'cycle_id',
        String(matchedCycle.id)
      );
      const rawItems = itemsRes.data || [];

      let recipients: BulkLebaranRecipientRow[] = [];

      if (rawItems.length > 0) {
        const memberIds = rawItems
          .map((it: any) => String(it?.member_id || ''))
          .filter(Boolean);
        const memberMap = await safeFetchMembersWithBankByIds(memberIds);

        recipients = rawItems.map((it: any, idx: number) => {
          const mInfo = it?.member_id ? memberMap.get(String(it.member_id)) : undefined;
          return {
            id: String(it?.id || `${matchedCycle.id}-item-${idx}`),
            memberId: String(it?.member_id || ''),
            nrp: String(it?.nrp || mInfo?.nrp || '-'),
            nama: String(it?.member_name || mInfo?.nama || 'Anggota'),
            tanggal_lahir: mInfo?.tanggal_lahir ?? null,
            bankName: String(mInfo?.bankName || ''),
            bankAccountNumber: String(it?.bank_account || mInfo?.bankAccountNumber || ''),
            amount: Math.round(Number(it?.amount_disbursed || 0)),
            referenceNo: null,
          };
        });
      } else {
        // Fallback: ambil penerima dari deposit_transactions pencairan massal/LEBARAN pada siklus/tanggal terkait
        recipients = await fetchLebaranWithdrawalRecipientsFromTransactions({
          dateCandidates: cycleDateCandidates,
          cycleName: matchedCycle.cycle_name,
          fallbackPrefix: String(matchedCycle.id),
        });
      }

      recipients.sort((a, b) => {
        const nrpCmp = a.nrp.localeCompare(b.nrp, 'id', { numeric: true });
        return nrpCmp !== 0 ? nrpCmp : a.nama.localeCompare(b.nama, 'id');
      });

      const recipientCount = recipients.length || Number(matchedCycle.total_members || 0);
      const calculatedTotal = recipients.reduce((s, r) => s + r.amount, 0);
      const difference = calculatedTotal - journal.amount;
      const isMatched = difference === 0;

      if (isBlankOrDashDescription(journal.description)) {
        journal.description = formatBulkLebaranCashFlowDescription(
          String(matchedCycle.cycle_name || 'Simpanan Lebaran'),
          recipientCount,
          journal.amount
        );
      }

      return {
        kind: 'bulk_lebaran_withdrawal',
        journal,
        bulkLebaranWithdrawal: {
          cycleId: String(matchedCycle.id),
          cycleName: String(matchedCycle.cycle_name || 'Simpanan Lebaran'),
          disbursementDate: cycleDate || String(journal.createdAt).slice(0, 10),
          sourceType: matchedCycle.source_type ?? 'MASSAL',
          notes: matchedCycle.notes ?? null,
          recipients,
          recipientCount,
          calculatedTotal,
          journalAmount: journal.amount,
          difference,
          isMatched,
        },
      };
    }

    // Fallback tanpa baris siklus di lebaran_disbursement_cycles namun deskripsi menandakan pencairan massal
    if (
      (descLower.includes('pencairan massal') || descLower.includes('(massal)')) &&
      !descLower.includes('(personal)')
    ) {
      const recipients = await fetchLebaranWithdrawalRecipientsFromTransactions({
        dateCandidates: cashFlowDateCandidates,
        cycleName: extractCycleNameFromBulkText(cashFlowRow.description),
        fallbackPrefix: String(cashFlowRow.id || 'bulk'),
      });
      recipients.sort((a, b) => {
        const nrpCmp = a.nrp.localeCompare(b.nrp, 'id', { numeric: true });
        return nrpCmp !== 0 ? nrpCmp : a.nama.localeCompare(b.nama, 'id');
      });
      const calculatedTotal = recipients.reduce((s, r) => s + r.amount, 0);
      const difference = calculatedTotal - journal.amount;
      return {
        kind: 'bulk_lebaran_withdrawal',
        journal,
        bulkLebaranWithdrawal: {
          cycleId: String(cashFlowRow.reference_id || cashFlowRow.id || ''),
          cycleName:
            extractCycleNameFromBulkText(cashFlowRow.description) || 'Siklus Lebaran',
          disbursementDate: cashFlowDateOnly || String(journal.createdAt).slice(0, 10),
          sourceType: 'MASSAL',
          notes: null,
          recipients,
          recipientCount: recipients.length,
          calculatedTotal,
          journalAmount: journal.amount,
          difference,
          isMatched: difference === 0,
        },
      };
    }

    // Langkah B: Cek Pencairan Perorangan pada deposit_transactions
    let tx: any = null;
    if (cashFlowRow.reference_id) {
      let dtTxRes = await safeFetchSingleById<any>(
        'deposit_transactions',
        'id, member_deposit_id, transaction_type, amount, description, reference_no, payment_method, notes, transaction_date, created_at',
        cashFlowRow.reference_id
      );

      if (dtTxRes.error && isPostgrestColumnError(dtTxRes.error)) {
        dtTxRes = await safeFetchSingleById<any>(
          'deposit_transactions',
          'id, member_deposit_id, transaction_type, amount, description, reference_no, payment_method, notes, created_at',
          cashFlowRow.reference_id
        );
      }

      if (dtTxRes.error && isPostgrestColumnError(dtTxRes.error)) {
        dtTxRes = await safeFetchSingleById<any>(
          'deposit_transactions',
          'id, member_deposit_id, transaction_type, amount, description, created_at',
          cashFlowRow.reference_id
        );
      }
      tx = dtTxRes.data;
    }

    if (!tx && !cashFlowRow.reference_id) {
      let txAllRes = await safeFetchAllPaged<any>(
        'deposit_transactions',
        'id, member_deposit_id, transaction_type, amount, description, reference_no, payment_method, notes, transaction_date, created_at'
      );
      if (txAllRes.error && isPostgrestColumnError(txAllRes.error)) {
        txAllRes = await safeFetchAllPaged<any>(
          'deposit_transactions',
          'id, member_deposit_id, transaction_type, amount, description, created_at'
        );
      }
      const cfMs = new Date(String(cashFlowRow.created_at || '')).getTime();
      const candidates = (txAllRes.data || []).filter((row: any) => {
        if (row?.transaction_type !== 'withdrawal') return false;
        const amt = Math.round(Number(row?.amount || 0));
        if (amt !== journal.amount) return false;
        const txDate = getTxDateOnly(row);
        return !cashFlowDateOnly || txDate === cashFlowDateOnly;
      });
      if (candidates.length > 0) {
        candidates.sort((a: any, b: any) => {
          const da = Math.abs(new Date(String(a?.created_at || '')).getTime() - cfMs);
          const db = Math.abs(new Date(String(b?.created_at || '')).getTime() - cfMs);
          return (isNaN(da) ? 0 : da) - (isNaN(db) ? 0 : db);
        });
        tx = candidates[0];
      }
    }

    if (tx) {
      let member: DepositWithdrawalBreakdown['member'] = null;
      let depositTypeName = 'Simpanan Anggota';
      let depositTypeCode = '-';

      if (tx.member_deposit_id) {
        const { data: md } = await safeFetchSingleById<any>(
          'member_deposits',
          'id, member_id, deposit_type_id',
          String(tx.member_deposit_id)
        );
        if (md) {
          const [memberData, typeRes] = await Promise.all([
            md.member_id
              ? safeFetchMemberWithBankById(String(md.member_id))
              : Promise.resolve(null),
            md.deposit_type_id
              ? safeFetchSingleById<any>('deposit_types', 'id, code, name', String(md.deposit_type_id))
              : Promise.resolve({ data: null, error: null }),
          ]);
          member = formatMemberSummary(memberData);
          if (typeRes.data) {
            depositTypeName = String(typeRes.data.name || depositTypeName);
            depositTypeCode = String(typeRes.data.code || depositTypeCode);
          }
        }
      }

      const txAmount = Math.round(Number(tx.amount ?? journal.amount));
      const isLebaranPersonal =
        isLebaranDepositCodeOrName(depositTypeCode, depositTypeName) &&
        !String(tx.description || '').toLowerCase().includes('massal');

      if (isBlankOrDashDescription(journal.description)) {
        journal.description = formatIndividualWithdrawalCashFlowDescription({
          depositTypeName,
          depositTypeCode,
          memberNrp: member?.nrp,
          memberName: member?.nama,
          amount: txAmount,
        });
      }

      return {
        kind: 'deposit_withdrawal',
        journal,
        depositWithdrawal: {
          transactionId: String(tx.id || cashFlowRow.reference_id || ''),
          amount: txAmount,
          transactionType: String(tx.transaction_type || 'withdrawal'),
          description: String(tx.description || journal.description),
          referenceNo: tx.reference_no ?? null,
          paymentMethod: tx.payment_method ?? null,
          notes: tx.notes ?? null,
          createdAt: String(tx.created_at || journal.createdAt),
          depositTypeName,
          depositTypeCode,
          isLebaranPersonal,
          member,
        },
      };
    }

    return { kind: 'journal_only', journal };
  }

  // ── Cabang D2b: Setoran Simpanan Anggota Batch (Menu Terima Setoran / KW-SETOR) ─
  const parsedBatchReceipt = extractReceiptCodeFromCashFlow(
    cashFlowRow.reference_id,
    cashFlowRow.description
  );
  if (
    isMemberDepositBatchCategory(cashFlowRow.category) ||
    (isSavingsDepositCategory(cashFlowRow.category) &&
      Boolean(parsedBatchReceipt && parsedBatchReceipt.startsWith('KW-SETOR-')))
  ) {
    const memberNrpHint = extractMemberNrpFromDepositDescription(cashFlowRow.description);
    const memberNameHint = extractMemberNameFromDepositDescription(cashFlowRow.description);
    const paymentMethodHint = extractPaymentMethodFromDepositDescription(cashFlowRow.description);

    const memberDepositBatch = await resolveMemberDepositBatchData({
      cashFlowRow,
      journal,
      receiptCode: parsedBatchReceipt,
      memberNrpHint,
      memberNameHint,
      paymentMethodHint,
    });

    return {
      kind: 'MEMBER_DEPOSIT_BATCH',
      journal,
      memberDepositBatch,
    };
  }

  // ── Cabang D2c: Jurnal Balik / Pembatalan Setoran Matriks (KOREKSI_PEMBATALAN)
  if (isCancellationReversalCategory(cashFlowRow.category)) {
    const parsed = parseCancellationReversalDescription(cashFlowRow.description);
    const refTxId = cashFlowRow.reference_id ? String(cashFlowRow.reference_id) : null;

    let auditLog: any = null;
    if (refTxId) {
      const logs = await safeFetchAuditLogsByRecordIds([refTxId]);
      auditLog = pickBestCancellationAuditLog(logs, refTxId);
    }

    const oldTx =
      auditLog?.old_data && typeof auditLog.old_data === 'object' ? auditLog.old_data : null;
    const memberDepositId = String(
      oldTx?.member_deposit_id || auditLog?.entity_id || ''
    ).trim();

    let memberId: string | undefined;
    let nrp = parsed.memberNrp || '-';
    let nama = parsed.memberName || 'Anggota';
    let tanggal_lahir: string | null = null;
    let depositTypeName = parsed.depositTypeName || 'Simpanan Anggota';
    let depositTypeCode = parsed.depositTypeCode || '-';

    if (memberDepositId) {
      const { data: md } = await safeFetchSingleById<any>(
        'member_deposits',
        'id, member_id, deposit_type_id',
        memberDepositId
      );
      if (md) {
        if (md.member_id) memberId = String(md.member_id);
        const [memberRes, typeRes] = await Promise.all([
          md.member_id
            ? safeFetchSingleById<any>('anggota', 'id, nrp, nama, tanggal_lahir', String(md.member_id))
            : Promise.resolve({ data: null, error: null }),
          md.deposit_type_id
            ? safeFetchSingleById<any>('deposit_types', 'id, code, name', String(md.deposit_type_id))
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (memberRes.data) {
          if (memberRes.data.id) memberId = String(memberRes.data.id);
          if (memberRes.data.nrp) nrp = String(memberRes.data.nrp);
          if (memberRes.data.nama) nama = String(memberRes.data.nama);
          tanggal_lahir = memberRes.data.tanggal_lahir ?? null;
        }
        if (typeRes.data) {
          if (typeRes.data.name) depositTypeName = String(typeRes.data.name);
          if (typeRes.data.code) depositTypeCode = String(typeRes.data.code);
        }
      }
    }

    const forMonth =
      parsed.forMonth ??
      (oldTx?.for_month !== null && oldTx?.for_month !== undefined && oldTx?.for_month !== ''
        ? Number(oldTx.for_month)
        : null);
    const forYear =
      parsed.forYear ??
      (oldTx?.for_year !== null && oldTx?.for_year !== undefined && oldTx?.for_year !== ''
        ? Number(oldTx.for_year)
        : null);

    const computedPeriod = formatMatrixDepositPeriodLabel(forMonth, forYear);
    const computedShort = formatMatrixDepositShortPeriod(forMonth, forYear);
    const periodLabel = computedPeriod !== '-' ? computedPeriod : parsed.periodLabel || '-';
    const shortPeriodLabel =
      computedShort !== '-' ? computedShort : parsed.shortPeriodLabel || '-';

    const auditNote =
      auditLog?.notes && !isAuditDefaultSystemNote(auditLog.notes)
        ? String(auditLog.notes).trim()
        : null;
    const cancelReason =
      parsed.cancelReason ||
      auditNote ||
      (auditLog?.notes ? String(auditLog.notes).trim() : null) ||
      'Koreksi / Pembatalan Setoran';
    const adminName =
      parsed.adminName ||
      (auditLog?.performer_name ? String(auditLog.performer_name).trim() : null) ||
      'Pengelola';

    const amount = Math.round(Number(oldTx?.amount ?? journal.amount));

    if (isBlankOrDashDescription(journal.description)) {
      journal.description = formatMatrixCancellationCashFlowDescription({
        depositTypeName,
        month: forMonth,
        year: forYear,
        memberNrp: nrp,
        memberName: nama,
        cancelReason,
        adminName,
      });
    }

    return {
      kind: 'deposit_cancellation_reversal',
      journal,
      cancellationReversal: {
        originalTransactionId: refTxId || (oldTx?.id ? String(oldTx.id) : null),
        memberId,
        memberNrp: nrp,
        memberName: nama,
        tanggal_lahir,
        depositTypeCode,
        depositTypeName,
        forMonth,
        forYear,
        periodLabel,
        shortPeriodLabel,
        amount,
        cancelReason,
        adminName,
        canceledAt: String(journal.createdAt || auditLog?.created_at || ''),
        originalReferenceNo: oldTx?.reference_no ? String(oldTx.reference_no) : null,
        originalPaymentMethod: oldTx?.payment_method ? String(oldTx.payment_method) : null,
        originalCreatedAt: oldTx?.created_at ? String(oldTx.created_at) : null,
      },
    };
  }

  // ── Cabang D3: Setoran Simpanan (Matriks / Individual) ─────────────────────
  if (isSavingsDepositCategory(cashFlowRow.category)) {
    let tx: any = null;
    if (cashFlowRow.reference_id) {
      let dtTxRes = await safeFetchSingleById<any>(
        'deposit_transactions',
        'id, member_deposit_id, transaction_type, amount, for_month, for_year, description, reference_no, payment_method, notes, created_at',
        cashFlowRow.reference_id
      );
      if (dtTxRes.error && isPostgrestColumnError(dtTxRes.error)) {
        dtTxRes = await safeFetchSingleById<any>(
          'deposit_transactions',
          'id, member_deposit_id, transaction_type, amount, for_month, for_year, description, created_at',
          cashFlowRow.reference_id
        );
      }
      tx = dtTxRes.data;
    }

    if (!tx && !cashFlowRow.reference_id) {
      let txAllRes = await safeFetchAllPaged<any>(
        'deposit_transactions',
        'id, member_deposit_id, transaction_type, amount, for_month, for_year, description, reference_no, payment_method, notes, created_at'
      );
      if (txAllRes.error && isPostgrestColumnError(txAllRes.error)) {
        txAllRes = await safeFetchAllPaged<any>(
          'deposit_transactions',
          'id, member_deposit_id, transaction_type, amount, for_month, for_year, description, created_at'
        );
      }
      const receiptMatch = String(cashFlowRow.description || '').match(/\b(KW-[A-Z0-9\/-]+)\b/i);
      const targetReceipt = receiptMatch?.[1]?.toUpperCase() || null;
      const cfDateCandidates = getDateCandidates(cashFlowRow.created_at);

      const candidates = (txAllRes.data || []).filter((row: any) => {
        if (row?.transaction_type !== 'deposit') return false;
        if (targetReceipt && String(row?.reference_no || '').toUpperCase() === targetReceipt) {
          return true;
        }
        const amt = Math.round(Number(row?.amount || 0));
        if (amt !== journal.amount) return false;
        return (
          cfDateCandidates.length === 0 ||
          hasCommonDate(cfDateCandidates, getDateCandidates(row?.created_at))
        );
      });
      if (candidates.length > 0) {
        tx = candidates[0];
      }
    }

    if (tx) {
      let memberId: string | undefined;
      let nrp = '-';
      let nama = 'Anggota';
      let tanggal_lahir: string | null = null;
      let depositTypeName = 'Simpanan Anggota';
      let depositTypeCode = '-';

      if (tx.member_deposit_id) {
        const { data: md } = await safeFetchSingleById<any>(
          'member_deposits',
          'id, member_id, deposit_type_id',
          String(tx.member_deposit_id)
        );
        if (md) {
          if (md.member_id) {
            memberId = String(md.member_id);
          }
          const [memberRes, typeRes] = await Promise.all([
            md.member_id
              ? safeFetchSingleById<any>('anggota', 'id, nrp, nama, tanggal_lahir', String(md.member_id))
              : Promise.resolve({ data: null, error: null }),
            md.deposit_type_id
              ? safeFetchSingleById<any>('deposit_types', 'id, code, name', String(md.deposit_type_id))
              : Promise.resolve({ data: null, error: null }),
          ]);
          if (memberRes.data) {
            if (memberRes.data.id) {
              memberId = String(memberRes.data.id);
            }
            nrp = String(memberRes.data.nrp || '-');
            nama = String(memberRes.data.nama || 'Anggota');
            tanggal_lahir = memberRes.data.tanggal_lahir ?? null;
          }
          if (typeRes.data) {
            depositTypeName = String(typeRes.data.name || depositTypeName);
            depositTypeCode = String(typeRes.data.code || depositTypeCode);
          }
        }
      }

      if (nrp === '-') {
        const extractedNrp =
          extractMemberNrpFromDepositDescription(cashFlowRow.description) ||
          extractMemberNrpFromDepositDescription(tx.description);
        if (extractedNrp) nrp = extractedNrp;
      }

      const forMonth =
        tx.for_month !== null && tx.for_month !== undefined ? Number(tx.for_month) : null;
      const forYear =
        tx.for_year !== null && tx.for_year !== undefined ? Number(tx.for_year) : null;
      const periodLabel = formatMatrixDepositPeriodLabel(forMonth, forYear);
      const shortPeriodLabel = formatMatrixDepositShortPeriod(forMonth, forYear);
      const txAmount = Math.round(Number(tx.amount ?? journal.amount));
      const cleanedRefNo =
        tx.reference_no &&
        String(tx.reference_no).trim() !== '' &&
        String(tx.reference_no).trim() !== '-'
          ? String(tx.reference_no).trim()
          : null;
      const receiptNumber = cleanedRefNo || journal.refCode;

      if (isBlankOrDashDescription(journal.description)) {
        journal.description = formatMatrixDepositCashFlowDescription({
          depositTypeName,
          month: forMonth,
          year: forYear,
          memberNrp: nrp,
          memberName: nama,
          referenceNo: tx.reference_no ?? null,
        });
      }

      return {
        kind: 'individual_deposit',
        journal,
        individualDeposit: {
          transactionId: String(tx.id || cashFlowRow.reference_id || ''),
          memberId,
          nrp,
          nama,
          memberNrp: nrp,
          memberName: nama,
          tanggal_lahir,
          depositTypeCode,
          depositTypeName,
          forMonth,
          forYear,
          periodLabel,
          shortPeriodLabel,
          periodCode: shortPeriodLabel,
          referenceNo: tx.reference_no ?? null,
          receiptNumber,
          paymentMethod: tx.payment_method ?? null,
          description: String(tx.description || journal.description),
          notes: tx.notes ?? null,
          createdAt: String(tx.created_at || journal.createdAt),
          amount: txAmount,
        },
      };
    }

    return { kind: 'journal_only', journal };
  }

  // ── Cabang E1: Shift Kasir ───────────────────────────────────────────────────
  if (CASHIER_SHIFT_CATEGORIES.has(catUpper) && cashFlowRow.reference_id) {
    const { data: shift } = await safeFetchSingleById<any>(
      'cashier_shifts',
      'id, shift_number, cashier_id, opened_at, closed_at, initial_cash, cash_sales, expected_cash, actual_cash, difference, status, notes',
      cashFlowRow.reference_id
    );

    if (shift) {
      let cashierName: string | null = null;
      if (shift.cashier_id) {
        const { data: staff } = await safeFetchSingleById<any>(
          'pengelola',
          'id, nama',
          String(shift.cashier_id)
        );
        if (staff?.nama) cashierName = String(staff.nama);
      }

      return {
        kind: 'cashier_shift',
        journal,
        cashierShift: {
          shiftId: String(shift.id || cashFlowRow.reference_id),
          shiftNumber: String(
            shift.shift_number || `SHIFT-${String(shift.id || cashFlowRow.reference_id).slice(0, 8).toUpperCase()}`
          ),
          cashierName,
          openedAt: String(shift.opened_at || journal.createdAt),
          closedAt: shift.closed_at ?? null,
          initialCash: Number(shift.initial_cash ?? 0),
          cashSales: Number(shift.cash_sales ?? 0),
          expectedCash: Number(shift.expected_cash ?? 0),
          actualCash: Number(shift.actual_cash ?? 0),
          difference: Number(shift.difference ?? 0),
          status: String(shift.status || 'closed'),
          notes: shift.notes ?? null,
        },
      };
    }
  }

  // ── Cabang E2: Pencairan Pinjaman & Pembiayaan Barang ────────────────────────
  if (
    (catUpper === 'PENCAIRAN_PINJAMAN' || catUpper === 'PEMBIAYAAN_BARANG') &&
    cashFlowRow.reference_id
  ) {
    let { data: loan, error: loanLookupErr } = await safeFetchSingleById<any>(
      'loans',
      'id, member_id, amount, principal_amount, item_description, cost_price, markup_amount, tenor, agreed_tenor_months, status, disbursed_at, created_at',
      cashFlowRow.reference_id
    );

    if (!loan && loanLookupErr) {
      const fbLoan = await safeFetchSingleById<any>(
        'loans',
        'id, member_id, amount, principal_amount, tenor, agreed_tenor_months, status, disbursed_at, created_at',
        cashFlowRow.reference_id
      );
      loan = fbLoan.data;
    }

    if (loan) {
      let member: { nrp: string; nama: string; tanggal_lahir?: string | null } | null = null;
      if (loan.member_id) {
        const { data: m } = await safeFetchSingleById<any>(
          'anggota',
          'id, nrp, nama, tanggal_lahir',
          String(loan.member_id)
        );
        member = formatMemberSummary(m);
      }

      const isGoodsDisbursement =
        catUpper === 'PEMBIAYAAN_BARANG' ||
        Number(loan.markup_amount ?? 0) > 0 ||
        Boolean(String(loan.item_description || '').trim());
      const disbursedAmount = isGoodsDisbursement
        ? Math.round(Number(loan.cost_price ?? journal.amount ?? 0))
        : Math.round(Number(loan.principal_amount ?? loan.amount ?? journal.amount));

      return {
        kind: 'loan_disbursement',
        journal,
        loanDisbursement: {
          loanId: String(loan.id || cashFlowRow.reference_id),
          amount: disbursedAmount,
          tenor: Number(loan.agreed_tenor_months ?? loan.tenor ?? 0),
          status: String(loan.status || 'active'),
          disbursedAt: loan.disbursed_at ?? loan.created_at ?? null,
          itemDescription: loan.item_description ?? null,
          costPrice: loan.cost_price !== undefined ? Math.round(Number(loan.cost_price)) : undefined,
          markupAmount: loan.markup_amount !== undefined ? Math.round(Number(loan.markup_amount)) : undefined,
          member,
        },
      };
    }
  }

  // ── Cabang E2b: Kliring Anggota Keluar (Member Clearance) ──────────────────
  if (isMemberClearanceCategory(cashFlowRow.category)) {
    let member: any | null = null;
    let clearanceLogFromRef: any | null = null;
    let resolvedMemberId = '';

    if (cashFlowRow.reference_id) {
      member = await safeFetchMemberFullById(String(cashFlowRow.reference_id));
      if (member?.id) {
        resolvedMemberId = String(member.id);
      } else {
        const logRes = await safeFetchSingleById<any>(
          'member_clearance_logs',
          'id, anggota_id, settlement_type, total_savings, total_loans, net_amount, payment_method, notes, created_at',
          String(cashFlowRow.reference_id)
        );
        if (logRes.data?.anggota_id) {
          clearanceLogFromRef = logRes.data;
          resolvedMemberId = String(logRes.data.anggota_id);
          member = await safeFetchMemberFullById(resolvedMemberId);
        }
      }
    }

    if (!member) {
      const descText = String(cashFlowRow.description || '');
      const nrpMatch = descText.match(/[—–-]\s*(?:\(lama\s*\d+\)\s*)?([0-9A-Za-z._/-]+)\s*-/);
      const targetNrp = nrpMatch?.[1] ? stripResignedNrpPrefix(nrpMatch[1]) : '';
      if (targetNrp) {
        const allMembersRes = await safeFetchAllAnggotaForClearance();
        const found = (allMembersRes.data || []).find(
          (m: any) => stripResignedNrpPrefix(m?.nrp) === targetNrp
        );
        if (found?.id) {
          member = found;
          resolvedMemberId = String(found.id);
        }
      }
    }

    if (resolvedMemberId || clearanceLogFromRef) {
      const ctx = resolvedMemberId
        ? await fetchMemberClearanceContext([resolvedMemberId])
        : {
            logsByMember: new Map<string, any[]>(),
            mdsByMember: new Map<string, any[]>(),
            dtMap: new Map<string, { id: string; code: string; name: string }>(),
            txsByMdId: new Map<string, any[]>(),
            loansByMember: new Map<string, any[]>(),
            repaysByLoanId: new Map<string, any[]>(),
          };

      const settlement = computeMemberSettlementFromContext(
        resolvedMemberId,
        member,
        ctx,
        clearanceLogFromRef
      );

      const calculatedCash = Math.round(Math.abs(settlement.netSettlement));
      const difference = calculatedCash - journal.amount;
      const isMatched = difference === 0;

      if (isBlankOrDashDescription(journal.description)) {
        journal.description = formatMemberClearanceCashFlowDescription({
          memberNrp: member?.nrp ?? null,
          memberName: member?.nama ?? null,
          totalSavings: settlement.totalSavings,
          totalDebtOffset: settlement.totalDebtOffset,
          netSettlement: settlement.netSettlement,
        });
      }

      return {
        kind: 'MEMBER_CLEARANCE',
        journal,
        memberClearance: {
          memberId: resolvedMemberId || String(cashFlowRow.reference_id || ''),
          member: {
            nrp: stripResignedNrpPrefix(member?.nrp) || '-',
            nama: String(member?.nama || 'Anggota Keluar'),
            tanggal_lahir: member?.tanggal_lahir ?? null,
            status: String(member?.status || 'nonaktif'),
            membershipStatus: String(member?.membership_status || 'RESIGNED'),
            bankName: member?.bank_name ?? null,
            bankAccountNumber: member?.bank_account_number ?? null,
          },
          clearanceDate: settlement.clearanceTimestamp || journal.createdAt,
          settlementType: settlement.settlementType,
          paymentMethod: settlement.clearanceLog?.payment_method ?? null,
          notes: settlement.clearanceLog?.notes ?? null,
          savingsItems: settlement.savingsItems,
          savingsByBucket: settlement.savingsByBucket,
          totalSavings: settlement.totalSavings,
          debtItems: settlement.debtItems,
          totalDebtOffset: settlement.totalDebtOffset,
          netSettlement: settlement.netSettlement,
          journalAmount: journal.amount,
          difference,
          isMatched,
        },
      };
    }

    return { kind: 'journal_only', journal };
  }

  // ── Cabang E3: Metadata Jurnal Umum ──────────────────────────────────────────
  return {
    kind: 'journal_only',
    journal,
  };
}

/**
 * Melacak rincian mutasi simpanan & angsuran berdasarkan kode trace-back
 * (`KW-SETOR-...`, `KW-...`, atau kode referensi jurnal `CF-...`).
 */
export async function getTraceBackDepositRows(
  traceCode: string,
  memberNrpHint?: string | null
): Promise<TraceBackDepositLookupResult> {
  const trimmedCode = String(traceCode || '').trim();
  if (!trimmedCode) {
    return {
      traceCode: '',
      resolvedReceiptCode: null,
      resolvedCashFlowRef: null,
      member: null,
      items: [],
      totalAmount: 0,
    };
  }

  const codeUpper = trimmedCode.toUpperCase();

  if (codeUpper.startsWith('CF-')) {
    const cfRes = await safeFetchAllPaged<any>(
      'cash_flow',
      'id, category, amount, direction, description, reference_id, created_at'
    );
    const matchedCf = (cfRes.data || []).find(
      (row: any) =>
        `CF-${String(row?.id || '').slice(0, 8).toUpperCase()}` === codeUpper
    );

    if (matchedCf) {
      const breakdown = await getCashFlowReferenceBreakdown({
        id: String(matchedCf.id),
        category: String(matchedCf.category || ''),
        amount: Math.round(Number(matchedCf.amount || 0)),
        direction: matchedCf.direction === 'out' ? 'out' : 'in',
        description: matchedCf.description ?? null,
        reference_id: matchedCf.reference_id ?? null,
        referensi: codeUpper,
        created_at: String(matchedCf.created_at || ''),
      });

      if (breakdown.kind === 'MEMBER_DEPOSIT_BATCH') {
        const batch = breakdown.memberDepositBatch;
        return {
          traceCode: trimmedCode,
          resolvedReceiptCode:
            batch.receiptNumber && batch.receiptNumber !== '-'
              ? batch.receiptNumber
              : null,
          resolvedCashFlowRef: codeUpper,
          member: batch.member,
          items: batch.items,
          totalAmount: batch.totalAmount,
        };
      }

      if (breakdown.kind === 'individual_deposit') {
        const ind = breakdown.individualDeposit;
        const resolvedNrp = ind.memberNrp || ind.nrp;
        const resolvedName = ind.memberName || ind.nama;
        const item: MemberDepositBatchItem = {
          id: ind.transactionId,
          memberId: ind.memberId,
          memberNrp: resolvedNrp,
          memberName: resolvedName,
          depositTypeName: ind.depositTypeName,
          depositTypeCode: ind.depositTypeCode,
          forMonth: ind.forMonth,
          forYear: ind.forYear,
          periodLabel: ind.periodLabel,
          paymentMethod: ind.paymentMethod,
          referenceNo: ind.referenceNo,
          description: ind.description,
          notes: ind.notes,
          amount: ind.amount,
          createdAt: ind.createdAt,
        };
        return {
          traceCode: trimmedCode,
          resolvedReceiptCode:
            ind.referenceNo && ind.referenceNo !== '-' ? ind.referenceNo : null,
          resolvedCashFlowRef: codeUpper,
          member: {
            id: ind.memberId || '',
            nrp: resolvedNrp,
            nama: resolvedName,
            tanggal_lahir: ind.tanggal_lahir ?? null,
          },
          items: [item],
          totalAmount: ind.amount,
        };
      }
    }

    return {
      traceCode: trimmedCode,
      resolvedReceiptCode: null,
      resolvedCashFlowRef: codeUpper,
      member: null,
      items: [],
      totalAmount: 0,
    };
  }

  // Pencarian langsung berdasarkan nomor kwitansi (`KW-SETOR-...` / `KW-...`)
  let matchedTxs = await fetchDepositTransactionsByRefResilient(trimmedCode);
  if (matchedTxs.length === 0) {
    const allTxs = await fetchAllDepositTransactionsResilient();
    matchedTxs = allTxs.filter(
      (row: any) =>
        (!row?.transaction_type || row.transaction_type === 'deposit') &&
        depositTxMatchesReceipt(row, codeUpper)
    );
  }

  const allRepayments = await fetchAllLoanRepaymentsResilient();
  const matchedRepayments = allRepayments.filter((rep: any) =>
    loanRepaymentMatchesReceipt(rep, codeUpper)
  );

  const mdIds = Array.from(
    new Set(matchedTxs.map((t: any) => String(t?.member_deposit_id || '')).filter(Boolean))
  );
  const loanIds = Array.from(
    new Set(matchedRepayments.map((r: any) => String(r?.loan_id || '')).filter(Boolean))
  );

  const [mdRows, loanRows] = await Promise.all([
    mdIds.length > 0
      ? safeFetchByIds<any>('member_deposits', 'id, member_id, deposit_type_id', mdIds)
      : Promise.resolve([]),
    loanIds.length > 0
      ? safeFetchByIds<any>(
          'loans',
          'id, member_id, loan_type_name, jenis_pinjaman',
          loanIds,
          'id, member_id'
        )
      : Promise.resolve([]),
  ]);

  const mdMap = new Map<string, any>();
  for (const md of mdRows) if (md?.id) mdMap.set(String(md.id), md);
  const loanMap = new Map<string, any>();
  for (const l of loanRows) if (l?.id) loanMap.set(String(l.id), l);

  const dtIds = Array.from(
    new Set(mdRows.map((md: any) => String(md?.deposit_type_id || '')).filter(Boolean))
  );
  const memberIds = Array.from(
    new Set(
      [
        ...mdRows.map((md: any) => String(md?.member_id || '')),
        ...loanRows.map((l: any) => String(l?.member_id || '')),
      ].filter(Boolean)
    )
  );

  const [dtRows, memberRows] = await Promise.all([
    dtIds.length > 0
      ? safeFetchByIds<any>('deposit_types', 'id, code, name', dtIds)
      : Promise.resolve([]),
    memberIds.length > 0
      ? safeFetchByIds<any>('anggota', 'id, nrp, nama, tanggal_lahir', memberIds)
      : Promise.resolve([]),
  ]);

  const dtMap = new Map<string, any>();
  for (const dt of dtRows) if (dt?.id) dtMap.set(String(dt.id), dt);
  const memberMap = new Map<string, any>();
  for (const m of memberRows) if (m?.id) memberMap.set(String(m.id), m);

  const normalizedNrpHint = memberNrpHint
    ? stripResignedNrpPrefix(memberNrpHint).toLowerCase()
    : '';
  const distinctMembers = Array.from(memberMap.values());
  let targetMember = distinctMembers[0] || null;
  if (normalizedNrpHint && distinctMembers.length > 1) {
    targetMember =
      distinctMembers.find(
        (m: any) =>
          stripResignedNrpPrefix(m?.nrp).toLowerCase() === normalizedNrpHint
      ) || targetMember;
  }

  const items: MemberDepositBatchItem[] = [];
  for (const tx of matchedTxs) {
    const md = tx?.member_deposit_id ? mdMap.get(String(tx.member_deposit_id)) : undefined;
    const dt = md?.deposit_type_id ? dtMap.get(String(md.deposit_type_id)) : undefined;
    const m = md?.member_id ? memberMap.get(String(md.member_id)) : targetMember;
    if (
      normalizedNrpHint &&
      distinctMembers.length > 1 &&
      m &&
      stripResignedNrpPrefix(m.nrp).toLowerCase() !== normalizedNrpHint
    ) {
      continue;
    }

    const depositTypeCode = String(dt?.code || '').trim() || '-';
    const depositTypeName = String(dt?.name || '').trim() || 'Simpanan Anggota';
    const forMonth =
      tx?.for_month !== null && tx?.for_month !== undefined && tx?.for_month !== ''
        ? Number(tx.for_month)
        : null;
    const forYear =
      tx?.for_year !== null && tx?.for_year !== undefined && tx?.for_year !== ''
        ? Number(tx.for_year)
        : null;

    items.push({
      id: String(tx.id),
      memberId: m?.id ? String(m.id) : undefined,
      memberNrp: stripResignedNrpPrefix(m?.nrp) || undefined,
      memberName: m?.nama ? String(m.nama) : undefined,
      depositTypeName,
      depositTypeCode,
      forMonth,
      forYear,
      periodLabel: formatBatchPeriodLabel(
        forMonth,
        forYear,
        depositTypeCode,
        tx?.description
      ),
      paymentMethod: tx?.payment_method ?? null,
      referenceNo: tx?.reference_no ?? codeUpper,
      description: String(tx?.description || `Setoran ${depositTypeName}`),
      notes: tx?.notes ?? null,
      amount: Math.round(Number(tx?.amount || 0)),
      createdAt: String(tx?.created_at || tx?.transaction_date || ''),
    });
  }

  for (const rep of matchedRepayments) {
    const loan = rep?.loan_id ? loanMap.get(String(rep.loan_id)) : undefined;
    const m = loan?.member_id ? memberMap.get(String(loan.member_id)) : targetMember;
    if (
      normalizedNrpHint &&
      distinctMembers.length > 1 &&
      m &&
      stripResignedNrpPrefix(m.nrp).toLowerCase() !== normalizedNrpHint
    ) {
      continue;
    }
    const loanLabel = loan?.loan_type_name || loan?.jenis_pinjaman || 'Pinjaman Anggota';

    items.push({
      id: `repay-${String(rep.id)}`,
      memberId: m?.id ? String(m.id) : undefined,
      memberNrp: stripResignedNrpPrefix(m?.nrp) || undefined,
      memberName: m?.nama ? String(m.nama) : undefined,
      depositTypeName: `Angsuran ${loanLabel}`,
      depositTypeCode: 'PINJAMAN',
      forMonth: null,
      forYear: null,
      periodLabel: formatBatchPeriodLabel(null, null, 'PINJAMAN', rep?.notes),
      paymentMethod: rep?.payment_method ?? null,
      referenceNo: rep?.receipt_number ?? codeUpper,
      description: String(rep?.notes || `Pembayaran Angsuran ${loanLabel}`),
      notes: rep?.notes ?? null,
      amount: Math.round(Number(rep?.amount_paid || 0)),
      createdAt: String(rep?.created_at || rep?.payment_date || ''),
    });
  }

  items.sort((a, b) => {
    const bucketDiff =
      getBatchBucketSortOrder(a.depositTypeCode) - getBatchBucketSortOrder(b.depositTypeCode);
    if (bucketDiff !== 0) return bucketDiff;
    const pA = a.forYear && a.forMonth ? a.forYear * 12 + a.forMonth : 0;
    const pB = b.forYear && b.forMonth ? b.forYear * 12 + b.forMonth : 0;
    if (pA !== pB) return pA - pB;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const totalAmount = items.reduce((s, i) => s + i.amount, 0);

  return {
    traceCode: trimmedCode,
    resolvedReceiptCode: codeUpper,
    resolvedCashFlowRef: null,
    member: targetMember
      ? {
          id: String(targetMember.id),
          nrp: stripResignedNrpPrefix(targetMember.nrp) || '-',
          nama: String(targetMember.nama || 'Anggota'),
          tanggal_lahir: targetMember.tanggal_lahir ?? null,
        }
      : null,
    items,
    totalAmount,
  };
}

export interface WithdrawalCashFlowRowLike {
  id: string;
  kategori: string;
  deskripsi: string;
  kas_keluar: number;
  reference_id?: string | null;
  created_at?: string;
}

/**
 * Melengkapi deskripsi baris mutasi `cash_flow` berkategori Penarikan Simpanan yang
 * kolom `description`-nya masih kosong atau bernilai `'-'` secara batch dari relasi
 * `lebaran_disbursement_cycles` maupun `deposit_transactions`.
 */
export async function enrichWithdrawalCashFlowDescriptions<
  T extends WithdrawalCashFlowRowLike
>(rows: T[]): Promise<T[]> {
  const needsEnrichment = rows.some(
    (r) => isSavingsWithdrawalCategory(r.kategori) && isBlankOrDashDescription(r.deskripsi)
  );
  if (!needsEnrichment) return rows;

  try {
    const targetRows = rows.filter(
      (r) => isSavingsWithdrawalCategory(r.kategori) && isBlankOrDashDescription(r.deskripsi)
    );
    const refIds = Array.from(
      new Set(targetRows.map((r) => r.reference_id).filter((id): id is string => Boolean(id)))
    );
    const hasMissingRef = targetRows.some((r) => !r.reference_id);

    // 1. Muat siklus pencairan massal Lebaran terkait
    let cycleRows: any[] = [];
    if (hasMissingRef) {
      let cyclesRes = await safeFetchAllPaged<any>(
        'lebaran_disbursement_cycles',
        'id, cycle_name, disbursement_date, cut_off_date, source_type, total_members, total_amount, created_at'
      );
      if (cyclesRes.error && isPostgrestColumnError(cyclesRes.error)) {
        cyclesRes = await safeFetchAllPaged<any>(
          'lebaran_disbursement_cycles',
          'id, cycle_name, cut_off_date, total_members, total_amount, created_at'
        );
      }
      cycleRows = cyclesRes.data || [];
    } else if (refIds.length > 0) {
      cycleRows = await safeFetchByIds<any>(
        'lebaran_disbursement_cycles',
        'id, cycle_name, disbursement_date, cut_off_date, source_type, total_members, total_amount, created_at',
        refIds,
        'id, cycle_name, cut_off_date, total_members, total_amount, created_at'
      );
    }

    const cycleMap = new Map<string, any>();
    for (const c of cycleRows) {
      if (c?.id) cycleMap.set(String(c.id), c);
    }

    // 2. Muat transaksi deposit_transactions terkait (untuk yang tidak cocok ke siklus)
    const remainingRefIds = refIds.filter((id) => !cycleMap.has(id));
    let txRows: any[] = [];
    if (hasMissingRef) {
      let txAllRes = await safeFetchAllPaged<any>(
        'deposit_transactions',
        'id, member_deposit_id, transaction_type, amount, description, transaction_date, created_at'
      );
      if (txAllRes.error && isPostgrestColumnError(txAllRes.error)) {
        txAllRes = await safeFetchAllPaged<any>(
          'deposit_transactions',
          'id, member_deposit_id, transaction_type, amount, description, created_at'
        );
      }
      txRows = (txAllRes.data || []).filter((t: any) => t?.transaction_type === 'withdrawal');
    } else if (remainingRefIds.length > 0) {
      txRows = await safeFetchByIds<any>(
        'deposit_transactions',
        'id, member_deposit_id, transaction_type, amount, description, transaction_date, created_at',
        remainingRefIds,
        'id, member_deposit_id, transaction_type, amount, description, created_at'
      );
    }

    const txMap = new Map<string, any>();
    for (const t of txRows) {
      if (t?.id) txMap.set(String(t.id), t);
    }

    // 3. Batch fetch member_deposits, anggota, dan deposit_types untuk seluruh transaksi terkait
    const mdIds = Array.from(
      new Set(txRows.map((t: any) => String(t?.member_deposit_id || '')).filter(Boolean))
    );
    const mdRows = await safeFetchByIds<any>(
      'member_deposits',
      'id, member_id, deposit_type_id',
      mdIds
    );
    const mdMap = new Map<string, any>();
    for (const md of mdRows) {
      if (md?.id) mdMap.set(String(md.id), md);
    }

    const memberIds = Array.from(
      new Set(mdRows.map((md: any) => String(md?.member_id || '')).filter(Boolean))
    );
    const dtIds = Array.from(
      new Set(mdRows.map((md: any) => String(md?.deposit_type_id || '')).filter(Boolean))
    );

    const [memberRows, dtRows] = await Promise.all([
      safeFetchByIds<any>('anggota', 'id, nrp, nama', memberIds),
      safeFetchByIds<any>('deposit_types', 'id, code, name', dtIds),
    ]);

    const memberMap = new Map<string, any>();
    for (const m of memberRows) {
      if (m?.id) memberMap.set(String(m.id), m);
    }
    const dtMap = new Map<string, any>();
    for (const dt of dtRows) {
      if (dt?.id) dtMap.set(String(dt.id), dt);
    }

    const buildTxDescription = (tx: any, rowAmount: number): string => {
      const md = tx?.member_deposit_id ? mdMap.get(String(tx.member_deposit_id)) : undefined;
      const member = md?.member_id ? memberMap.get(String(md.member_id)) : undefined;
      const dt = md?.deposit_type_id ? dtMap.get(String(md.deposit_type_id)) : undefined;
      const amt = Math.round(Number(rowAmount || tx?.amount || 0));

      if (member || dt) {
        return formatIndividualWithdrawalCashFlowDescription({
          depositTypeName: dt?.name,
          depositTypeCode: dt?.code,
          memberNrp: member?.nrp,
          memberName: member?.nama,
          amount: amt,
          isBulkMemberRow: String(tx?.description || '')
            .toLowerCase()
            .includes('pencairan massal'),
        });
      }

      if (!isBlankOrDashDescription(tx?.description)) {
        return String(tx.description);
      }

      const formatted = new Intl.NumberFormat('id-ID').format(amt);
      return `Pencairan Simpanan (Rp ${formatted})`;
    };

    // 4. Kembalikan baris yang telah diperkaya deskripsinya
    return rows.map((row) => {
      if (!isSavingsWithdrawalCategory(row.kategori) || !isBlankOrDashDescription(row.deskripsi)) {
        return row;
      }

      const rowAmount = Math.round(Number(row.kas_keluar || 0));
      const rowDateOnly = String(row.created_at || '').slice(0, 10);

      if (row.reference_id) {
        const refCycle = cycleMap.get(String(row.reference_id));
        if (refCycle) {
          return {
            ...row,
            deskripsi: formatBulkLebaranCashFlowDescription(
              String(refCycle.cycle_name || 'Simpanan Lebaran'),
              Number(refCycle.total_members || 0),
              rowAmount || Number(refCycle.total_amount || 0)
            ),
          };
        }

        const refTx = txMap.get(String(row.reference_id));
        if (refTx) {
          return {
            ...row,
            deskripsi: buildTxDescription(refTx, rowAmount),
          };
        }
      } else {
        // Fallback tanpa reference_id: cocokkan siklus massal berdasarkan tanggal & total
        const matchedCycle = cycleRows.find((c: any) => {
          const src = String(c?.source_type || '').toUpperCase();
          if (src === 'MANUAL') return false;
          const cDate = getCycleDateOnly(c);
          const cAmt = Math.round(Number(c?.total_amount || 0));
          return Boolean(rowDateOnly) && cDate === rowDateOnly && cAmt === rowAmount;
        });

        if (matchedCycle) {
          return {
            ...row,
            deskripsi: formatBulkLebaranCashFlowDescription(
              String(matchedCycle.cycle_name || 'Simpanan Lebaran'),
              Number(matchedCycle.total_members || 0),
              rowAmount || Number(matchedCycle.total_amount || 0)
            ),
          };
        }

        // Fallback tanpa reference_id: cocokkan withdrawal deposit_transactions berdasarkan tanggal & nominal
        const matchedTx = txRows.find((tx: any) => {
          const txAmt = Math.round(Number(tx?.amount || 0));
          const txDate = getTxDateOnly(tx);
          return txAmt === rowAmount && (!rowDateOnly || txDate === rowDateOnly);
        });

        if (matchedTx) {
          return {
            ...row,
            deskripsi: buildTxDescription(matchedTx, rowAmount),
          };
        }
      }

      const formatted = new Intl.NumberFormat('id-ID').format(rowAmount);
      return {
        ...row,
        deskripsi: `Pencairan Simpanan (Rp ${formatted})`,
      };
    });
  } catch (err) {
    console.warn('Warning enrichWithdrawalCashFlowDescriptions:', err);
    return rows;
  }
}

/**
 * Melengkapi deskripsi baris mutasi `cash_flow` berkategori Setoran Simpanan
 * maupun Jurnal Balik Pembatalan (`KOREKSI_PEMBATALAN`) yang kolom `description`-nya
 * masih kosong atau bernilai `'-'` secara batch dari relasi `deposit_transactions` / `audit_logs`
 * -> `member_deposits` -> `anggota` & `deposit_types`.
 */
export async function enrichDepositCashFlowDescriptions<
  T extends WithdrawalCashFlowRowLike & { kas_masuk?: number }
>(rows: T[]): Promise<T[]> {
  const needsDepositEnrichment = rows.some(
    (r) => isSavingsDepositCategory(r.kategori) && isBlankOrDashDescription(r.deskripsi)
  );
  const needsReversalEnrichment = rows.some(
    (r) => isCancellationReversalCategory(r.kategori) && isBlankOrDashDescription(r.deskripsi)
  );
  if (!needsDepositEnrichment && !needsReversalEnrichment) return rows;

  try {
    const depositTargetRows = needsDepositEnrichment
      ? rows.filter(
          (r) => isSavingsDepositCategory(r.kategori) && isBlankOrDashDescription(r.deskripsi)
        )
      : [];
    const reversalTargetRows = needsReversalEnrichment
      ? rows.filter(
          (r) => isCancellationReversalCategory(r.kategori) && isBlankOrDashDescription(r.deskripsi)
        )
      : [];

    const depositRefIds = Array.from(
      new Set(
        depositTargetRows.map((r) => r.reference_id).filter((id): id is string => Boolean(id))
      )
    );
    const reversalRefIds = Array.from(
      new Set(
        reversalTargetRows.map((r) => r.reference_id).filter((id): id is string => Boolean(id))
      )
    );
    if (depositRefIds.length === 0 && reversalRefIds.length === 0) return rows;

    const [txRows, auditLogRows] = await Promise.all([
      depositRefIds.length > 0
        ? safeFetchByIds<any>(
            'deposit_transactions',
            'id, member_deposit_id, amount, for_month, for_year, reference_no, description',
            depositRefIds,
            'id, member_deposit_id, amount, for_month, for_year, description'
          )
        : Promise.resolve([]),
      reversalRefIds.length > 0
        ? safeFetchAuditLogsByRecordIds(reversalRefIds)
        : Promise.resolve([]),
    ]);

    const txMap = new Map<string, any>();
    for (const tx of txRows) {
      if (tx?.id) txMap.set(String(tx.id), tx);
    }
    const auditByRecordMap = new Map<string, any>();
    for (const refId of reversalRefIds) {
      const best = pickBestCancellationAuditLog(auditLogRows, refId);
      if (best) auditByRecordMap.set(refId, best);
    }

    const mdIds = Array.from(
      new Set(
        [
          ...txRows.map((t: any) => String(t?.member_deposit_id || '')),
          ...Array.from(auditByRecordMap.values()).map((log: any) =>
            String(log?.old_data?.member_deposit_id || log?.entity_id || '')
          ),
        ].filter(Boolean)
      )
    );
    const mdRows = await safeFetchByIds<any>(
      'member_deposits',
      'id, member_id, deposit_type_id',
      mdIds
    );
    const mdMap = new Map<string, any>();
    for (const md of mdRows) {
      if (md?.id) mdMap.set(String(md.id), md);
    }

    const memberIds = Array.from(
      new Set(mdRows.map((md: any) => String(md?.member_id || '')).filter(Boolean))
    );
    const dtIds = Array.from(
      new Set(mdRows.map((md: any) => String(md?.deposit_type_id || '')).filter(Boolean))
    );

    const [memberRows, dtRows] = await Promise.all([
      safeFetchByIds<any>('anggota', 'id, nrp, nama', memberIds),
      safeFetchByIds<any>('deposit_types', 'id, code, name', dtIds),
    ]);

    const memberMap = new Map<string, any>();
    for (const m of memberRows) {
      if (m?.id) memberMap.set(String(m.id), m);
    }
    const dtMap = new Map<string, any>();
    for (const dt of dtRows) {
      if (dt?.id) dtMap.set(String(dt.id), dt);
    }

    return rows.map((row) => {
      if (!isBlankOrDashDescription(row.deskripsi)) {
        return row;
      }

      if (isSavingsDepositCategory(row.kategori)) {
        const tx = row.reference_id ? txMap.get(String(row.reference_id)) : undefined;
        if (!tx) return row;

        const md = tx?.member_deposit_id ? mdMap.get(String(tx.member_deposit_id)) : undefined;
        const member = md?.member_id ? memberMap.get(String(md.member_id)) : undefined;
        const dt = md?.deposit_type_id ? dtMap.get(String(md.deposit_type_id)) : undefined;

        return {
          ...row,
          deskripsi: formatMatrixDepositCashFlowDescription({
            depositTypeName: dt?.name || null,
            month: tx?.for_month ?? null,
            year: tx?.for_year ?? null,
            memberNrp: member?.nrp || null,
            memberName: member?.nama || null,
            referenceNo: tx?.reference_no ?? null,
          }),
        };
      }

      if (isCancellationReversalCategory(row.kategori)) {
        const log = row.reference_id ? auditByRecordMap.get(String(row.reference_id)) : undefined;
        if (!log) return row;

        const oldTx = log?.old_data && typeof log.old_data === 'object' ? log.old_data : {};
        const mdId = String(oldTx?.member_deposit_id || log?.entity_id || '');
        const md = mdId ? mdMap.get(mdId) : undefined;
        const member = md?.member_id ? memberMap.get(String(md.member_id)) : undefined;
        const dt = md?.deposit_type_id ? dtMap.get(String(md.deposit_type_id)) : undefined;

        return {
          ...row,
          deskripsi: formatMatrixCancellationCashFlowDescription({
            depositTypeName: dt?.name || null,
            month: oldTx?.for_month ?? null,
            year: oldTx?.for_year ?? null,
            memberNrp: member?.nrp || null,
            memberName: member?.nama || null,
            cancelReason: log?.notes || null,
            adminName: log?.performer_name || null,
          }),
        };
      }

      return row;
    });
  } catch (err) {
    console.warn('Warning enrichDepositCashFlowDescriptions:', err);
    return rows;
  }
}

function isStoreCreditRepaymentCategory(category?: string | null): boolean {
  const norm = String(category || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  return norm === 'PELUNASAN_BON_TOKO';
}

/**
 * Melengkapi atau memformat ulang deskripsi baris mutasi `cash_flow` berkategori
 * `PELUNASAN_BON_TOKO` agar merinci pengurangan piutang anggota sekaligus penambahan kas masuk.
 */
export async function enrichStoreCreditCashFlowDescriptions<
  T extends {
    kategori?: string;
    category?: string;
    deskripsi?: string;
    description?: string | null;
    reference_id?: string | null;
    kas_masuk?: number;
    amount?: number;
  }
>(rows: T[]): Promise<T[]> {
  const needsEnrichment = (row: T): boolean => {
    if (!isStoreCreditRepaymentCategory(row.kategori ?? row.category)) return false;
    if (!row.reference_id) return false;
    const rawDesc = String(row.deskripsi ?? row.description ?? '').trim();
    return isBlankOrDashDescription(rawDesc) || !rawDesc.includes('Piutang -Rp');
  };

  const targetRows = rows.filter(needsEnrichment);
  if (targetRows.length === 0) return rows;

  try {
    const refIds = Array.from(
      new Set(targetRows.map((r) => r.reference_id).filter((id): id is string => Boolean(id)))
    );
    if (refIds.length === 0) return rows;

    const paymentRows = await safeFetchByIds<any>(
      'store_credit_payments',
      'id, sale_id, amount, payment_date, receipt_number, notes, created_at',
      refIds
    );
    const paymentMap = new Map<string, any>();
    for (const p of paymentRows) {
      if (p?.id) paymentMap.set(String(p.id), p);
    }

    const saleIds = Array.from(
      new Set(paymentRows.map((p: any) => String(p?.sale_id || '')).filter(Boolean))
    );
    const saleRows = await safeFetchByIds<any>(
      'sales',
      'id, sale_number, member_id, total_amount, paid_credit, created_at',
      saleIds,
      'id, sale_number, member_id, total_amount'
    );
    const saleMap = new Map<string, any>();
    for (const s of saleRows) {
      if (s?.id) saleMap.set(String(s.id), s);
    }

    const memberIds = Array.from(
      new Set(saleRows.map((s: any) => String(s?.member_id || '')).filter(Boolean))
    );
    const memberRows = await safeFetchByIds<any>('anggota', 'id, nrp, nama', memberIds);
    const memberMap = new Map<string, any>();
    for (const m of memberRows) {
      if (m?.id) memberMap.set(String(m.id), m);
    }

    return rows.map((row) => {
      if (!needsEnrichment(row)) return row;
      const payment = row.reference_id ? paymentMap.get(String(row.reference_id)) : undefined;
      if (!payment) return row;

      const sale = payment.sale_id ? saleMap.get(String(payment.sale_id)) : undefined;
      const member = sale?.member_id ? memberMap.get(String(sale.member_id)) : undefined;
      const paidAmount = Math.round(
        Number(payment.amount ?? row.kas_masuk ?? row.amount ?? 0)
      );
      const inferredMethod = inferStoreCreditPaymentMethod(
        payment.payment_method || null,
        payment.notes || null
      );
      const receiptNo =
        payment.receipt_number ||
        `BYR-${String(payment.id || row.reference_id).slice(0, 6).toUpperCase()}`;

      let remainingDebt: number | null = null;
      if (sale && sale.paid_credit !== undefined && sale.paid_credit !== null) {
        remainingDebt = Math.max(0, Math.round(Number(sale.paid_credit)) - paidAmount);
      }

      const enrichedDesc = formatStoreCreditCashFlowDescription({
        paymentMethod: inferredMethod,
        receiptNumber: receiptNo,
        memberNrp: member?.nrp ?? null,
        memberName: member?.nama ?? null,
        paidAmount,
        remainingDebt,
      });

      return {
        ...row,
        ...(row.deskripsi !== undefined ? { deskripsi: enrichedDesc } : {}),
        ...(row.description !== undefined ? { description: enrichedDesc } : {}),
      };
    });
  } catch (err) {
    console.warn('Warning enrichStoreCreditCashFlowDescriptions:', err);
    return rows;
  }
}

export interface ConsolidateBulkLebaranResult {
  consolidatedGroups: number;
  mergedRows: number;
  updatedRows: number;
}

interface BulkConsolidationEntry {
  cf: any;
  linkedTx?: any;
  matchingCycle?: any;
  extractedCycleName: string | null;
}

/**
 * Mengonsolidasikan baris-baris `public.cash_flow` pencairan massal Simpanan Lebaran
 * yang terlanjur tercatat terpisah per anggota (baik baris lama ber-reference_id
 * `deposit_transactions.id` maupun baris ber-deskripsi `(Massal)`) menjadi tepat
 * 1 baris agregat per siklus/tanggal dengan `reference_id = cycle.id`.
 * Pencairan perorangan / personal tidak pernah disentuh.
 */
export async function consolidateBulkLebaranCashFlow(): Promise<ConsolidateBulkLebaranResult> {
  const emptyResult: ConsolidateBulkLebaranResult = {
    consolidatedGroups: 0,
    mergedRows: 0,
    updatedRows: 0,
  };

  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return emptyResult;
    }

    // 1. Ambil seluruh baris cash_flow dengan fallback bila kolom description belum tersedia
    let cfRes = await safeFetchAllPaged<any>(
      'cash_flow',
      'id, created_at, description, category, direction, amount, reference_id'
    );
    if (cfRes.error && isPostgrestColumnError(cfRes.error)) {
      cfRes = await safeFetchAllPaged<any>(
        'cash_flow',
        'id, created_at, category, direction, amount, reference_id'
      );
    }
    if (cfRes.error) {
      return emptyResult;
    }

    const withdrawalRows = (cfRes.data || []).filter((r: any) => {
      const dir = String(r?.direction ?? r?.type ?? '').toLowerCase();
      return dir === 'out' && isSavingsWithdrawalCategory(r?.category);
    });
    if (withdrawalRows.length === 0) {
      return emptyResult;
    }

    // 2. Muat daftar siklus pencairan Lebaran (kecuali MANUAL)
    let cyclesRes = await safeFetchAllPaged<any>(
      'lebaran_disbursement_cycles',
      'id, cycle_name, disbursement_date, cut_off_date, source_type, total_members, total_amount, status, approved_at, created_at'
    );
    if (cyclesRes.error && isPostgrestColumnError(cyclesRes.error)) {
      cyclesRes = await safeFetchAllPaged<any>(
        'lebaran_disbursement_cycles',
        'id, cycle_name, cut_off_date, total_members, total_amount, status, created_at'
      );
    }

    const nonManualCycles = (cyclesRes.data || [])
      .filter((c: any) => String(c?.source_type || '').toUpperCase() !== 'MANUAL')
      .sort(
        (a: any, b: any) =>
          String(b?.cycle_name || '').trim().length -
          String(a?.cycle_name || '').trim().length
      );
    const nonManualCycleById = new Map<string, any>();
    for (const c of nonManualCycles) {
      if (c?.id) nonManualCycleById.set(String(c.id), c);
    }
    const matchableCycles = nonManualCycles.filter(
      (c: any) => String(c?.status || '').toUpperCase() !== 'REJECTED'
    );

    // 3. Muat deposit_transactions terkait untuk mendeteksi baris cash_flow massal lama
    const nonCycleRefIds = Array.from(
      new Set(
        withdrawalRows
          .map((r: any) => (r?.reference_id ? String(r.reference_id) : ''))
          .filter((id: string) => Boolean(id) && !nonManualCycleById.has(id))
      )
    );

    const txRows =
      nonCycleRefIds.length > 0
        ? await safeFetchByIds<any>(
            'deposit_transactions',
            'id, member_deposit_id, transaction_type, amount, description, reference_no, notes, transaction_date, created_at',
            nonCycleRefIds,
            'id, member_deposit_id, transaction_type, amount, description, created_at'
          )
        : [];
    const txById = new Map<string, any>();
    for (const tx of txRows) {
      if (tx?.id) txById.set(String(tx.id), tx);
    }

    // 4. Klasifikasikan baris pencairan massal dan kelompokkan per siklus / tanggal
    const groups = new Map<string, BulkConsolidationEntry[]>();

    for (const cf of withdrawalRows) {
      const refId = cf?.reference_id ? String(cf.reference_id) : '';
      const directCycle = refId ? nonManualCycleById.get(refId) : undefined;
      const cfDescLower = String(cf?.description || '').toLowerCase();
      const isPersonalCf = cfDescLower.includes('(personal)');
      const isBulkByCfDesc =
        !isPersonalCf &&
        (cfDescLower.includes('(massal)') || cfDescLower.includes('pencairan massal'));

      const linkedTx = refId ? txById.get(refId) : undefined;
      const txDescLower = String(linkedTx?.description || '').toLowerCase();
      const txNotesLower = String(linkedTx?.notes || '').toLowerCase();
      const txRefUpper = String(linkedTx?.reference_no || '').toUpperCase();
      const isBulkByTx =
        !isPersonalCf &&
        Boolean(linkedTx) &&
        linkedTx?.transaction_type === 'withdrawal' &&
        (txDescLower.includes('pencairan massal') ||
          txDescLower.includes('(massal)') ||
          txNotesLower.includes('pencairan massal') ||
          (txRefUpper.startsWith('KW-THR-') && !txDescLower.includes('personal')));

      if (!directCycle && !isBulkByCfDesc && !isBulkByTx) {
        continue;
      }

      const extractedFromTx = extractCycleNameFromBulkText(linkedTx?.description);
      const extractedFromCf = extractCycleNameFromBulkText(cf?.description);
      const extractedCycleName = extractedFromTx || extractedFromCf;

      const rowDateCandidates = Array.from(
        new Set([
          ...getDateCandidates(linkedTx?.transaction_date),
          ...getDateCandidates(linkedTx?.created_at),
          ...getDateCandidates(cf?.created_at),
        ])
      );

      let matchingCycle = directCycle;

      if (!matchingCycle && extractedFromTx) {
        const targetLower = extractedFromTx.toLowerCase();
        const nameMatches = matchableCycles.filter(
          (c: any) => String(c?.cycle_name || '').trim().toLowerCase() === targetLower
        );
        matchingCycle =
          nameMatches.find((c: any) =>
            hasCommonDate(rowDateCandidates, getCycleDateCandidates(c))
          ) || nameMatches[0];
      }

      if (!matchingCycle && cfDescLower) {
        const descMatches = matchableCycles.filter((c: any) => {
          const cname = String(c?.cycle_name || '').trim().toLowerCase();
          return cname !== '' && cfDescLower.includes(cname);
        });
        matchingCycle =
          descMatches.find((c: any) =>
            hasCommonDate(rowDateCandidates, getCycleDateCandidates(c))
          ) || descMatches[0];
      }

      if (!matchingCycle && rowDateCandidates.length > 0) {
        const dateMatches = matchableCycles.filter((c: any) =>
          hasCommonDate(rowDateCandidates, getCycleDateCandidates(c))
        );
        matchingCycle =
          dateMatches.find(
            (c: any) =>
              String(c?.source_type || '').toUpperCase() === 'MASSAL' &&
              Number(c?.total_members || 0) > 0
          ) ||
          dateMatches.find((c: any) => String(c?.source_type || '').toUpperCase() === 'MASSAL') ||
          dateMatches[0];
      }

      const dateKey =
        getDateCandidates(linkedTx?.transaction_date)[0] ||
        getDateCandidates(cf?.created_at)[0] ||
        String(cf?.created_at || '').slice(0, 10) ||
        'unknown';

      const groupKey = matchingCycle?.id
        ? `cycle:${matchingCycle.id}`
        : extractedCycleName
        ? `txcycle:${dateKey}::${extractedCycleName.toLowerCase()}`
        : `date:${dateKey}`;

      const list = groups.get(groupKey) || [];
      list.push({
        cf,
        linkedTx,
        matchingCycle,
        extractedCycleName,
      });
      groups.set(groupKey, list);
    }

    if (groups.size === 0) {
      return emptyResult;
    }

    const cfTable: any = supabase.from('cash_flow');
    if (!cfTable || typeof cfTable.update !== 'function') {
      return emptyResult;
    }

    let consolidatedGroups = 0;
    let mergedRows = 0;
    let updatedRows = 0;

    for (const entries of groups.values()) {
      entries.sort((a, b) => {
        const tsA = new Date(String(a.cf?.created_at || '')).getTime();
        const tsB = new Date(String(b.cf?.created_at || '')).getTime();
        const safeA = isNaN(tsA) ? 0 : tsA;
        const safeB = isNaN(tsB) ? 0 : tsB;
        if (safeA !== safeB) return safeA - safeB;
        return String(a.cf?.id || '').localeCompare(String(b.cf?.id || ''));
      });

      const matchingCycle = entries.find((e) => e.matchingCycle)?.matchingCycle;
      const extractedCycleName =
        entries.find((e) => e.extractedCycleName)?.extractedCycleName || null;

      const existingAggEntries = matchingCycle?.id
        ? entries.filter(
            (e) => String(e.cf?.reference_id || '') === String(matchingCycle.id)
          )
        : [];
      const splitEntries = entries.filter((e) => !existingAggEntries.includes(e));

      const cycleTotal = Math.round(Number(matchingCycle?.total_amount || 0));
      const sumAll = entries.reduce(
        (sum, e) => sum + Math.round(Number(e.cf?.amount || 0)),
        0
      );

      let primaryEntry: BulkConsolidationEntry;
      let extraEntries: BulkConsolidationEntry[];
      let targetAmount: number;

      if (existingAggEntries.length > 0 && splitEntries.length > 0) {
        primaryEntry = existingAggEntries[0];
        extraEntries = [...existingAggEntries.slice(1), ...splitEntries];
        const primaryAmt = Math.round(Number(primaryEntry.cf?.amount || 0));
        targetAmount = cycleTotal > 0 ? cycleTotal : primaryAmt;
      } else if (existingAggEntries.length > 1 && splitEntries.length === 0) {
        primaryEntry = existingAggEntries[0];
        extraEntries = existingAggEntries.slice(1);
        const primaryAmt = Math.round(Number(primaryEntry.cf?.amount || 0));
        targetAmount = cycleTotal > 0 && primaryAmt === cycleTotal ? cycleTotal : sumAll;
      } else if (entries.length > 1 && existingAggEntries.length === 0) {
        primaryEntry = entries[0];
        extraEntries = entries.slice(1);
        targetAmount = sumAll;
      } else {
        primaryEntry = entries[0];
        extraEntries = [];
        targetAmount = Math.round(Number(primaryEntry.cf?.amount || 0));
      }

      if (!primaryEntry?.cf?.id) continue;
      if (extraEntries.length > 0 && typeof cfTable.delete !== 'function') {
        continue;
      }

      const targetRefId: string | null = matchingCycle?.id
        ? String(matchingCycle.id)
        : primaryEntry.cf?.reference_id ?? null;

      const existingDescCountMatch = String(primaryEntry.cf?.description || '').match(
        /—\s*(\d+)\s*Anggota/i
      );
      const memberCount =
        Number(matchingCycle?.total_members || 0) > 0
          ? Number(matchingCycle.total_members)
          : entries.length > 1
          ? entries.length
          : existingDescCountMatch
          ? Number(existingDescCountMatch[1])
          : 1;

      const cycleLabel = String(
        matchingCycle?.cycle_name || extractedCycleName || 'Siklus Lebaran'
      );
      const aggregatedDescription = formatBulkLebaranCashFlowDescription(
        cycleLabel,
        memberCount,
        targetAmount
      );

      const origAmount = Math.round(Number(primaryEntry.cf?.amount || 0));
      const origRefId: string | null = primaryEntry.cf?.reference_id ?? null;
      const hasDescriptionField = Object.prototype.hasOwnProperty.call(
        primaryEntry.cf,
        'description'
      );
      const origDesc = primaryEntry.cf?.description;

      const needsAmountUpdate = origAmount !== targetAmount;
      const needsRefUpdate =
        targetRefId !== null && String(origRefId || '') !== String(targetRefId);
      const needsDescUpdate =
        hasDescriptionField && String(origDesc || '').trim() !== aggregatedDescription;

      if (
        extraEntries.length === 0 &&
        !needsAmountUpdate &&
        !needsRefUpdate &&
        !needsDescUpdate
      ) {
        continue;
      }

      const updatePrimaryRow = async (payload: {
        amount: number;
        reference_id: string | null;
        description?: string | null;
      }): Promise<{ error: any }> => {
        const fullPayload: Record<string, any> = {
          amount: payload.amount,
          reference_id: payload.reference_id,
        };
        if (payload.description !== undefined) {
          fullPayload.description = payload.description;
        }
        const updQ: any = cfTable.update(fullPayload);
        if (!updQ || typeof updQ.eq !== 'function') {
          return { error: new Error('Update query builder tidak mendukung .eq()') };
        }
        let res: any = await updQ.eq('id', primaryEntry.cf.id);
        if (
          res?.error &&
          isPostgrestColumnError(res.error) &&
          fullPayload.description !== undefined
        ) {
          const fallbackUpdQ: any = cfTable.update({
            amount: payload.amount,
            reference_id: payload.reference_id,
          });
          if (fallbackUpdQ && typeof fallbackUpdQ.eq === 'function') {
            res = await fallbackUpdQ.eq('id', primaryEntry.cf.id);
          }
        }
        return { error: res?.error ?? null };
      };

      const { error: updErr } = await updatePrimaryRow({
        amount: targetAmount,
        reference_id: targetRefId,
        description: aggregatedDescription,
      });

      if (updErr) {
        continue;
      }

      if (extraEntries.length > 0) {
        const extraIds = extraEntries.map((e) => e.cf?.id).filter(Boolean);
        let deleteError: any = null;

        if (extraIds.length > 0) {
          try {
            const delQ: any = cfTable.delete();
            if (delQ && typeof delQ.in === 'function') {
              const delRes: any = await delQ.in('id', extraIds);
              deleteError = delRes?.error ?? null;
            } else if (delQ && typeof delQ.eq === 'function') {
              for (const delId of extraIds) {
                const delRes: any = await cfTable.delete().eq('id', delId);
                if (delRes?.error) {
                  deleteError = delRes.error;
                  break;
                }
              }
            } else {
              deleteError = new Error('Delete query builder tidak mendukung .in() atau .eq()');
            }
          } catch (delCatchErr) {
            deleteError = delCatchErr;
          }
        }

        if (deleteError) {
          await updatePrimaryRow({
            amount: origAmount,
            reference_id: origRefId,
            ...(hasDescriptionField ? { description: origDesc ?? null } : {}),
          }).catch(() => {});
          continue;
        }

        consolidatedGroups += 1;
        mergedRows += extraIds.length;
      }

      updatedRows += 1;
    }

    return {
      consolidatedGroups,
      mergedRows,
      updatedRows,
    };
  } catch (err) {
    console.warn('Warning consolidateBulkLebaranCashFlow:', err);
    return emptyResult;
  }
}

export interface SyncPosCashSalesResult {
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
}

/**
 * Menyinkronkan (backfill idempoten) transaksi penjualan POS tunai (`sales.paid_cash > 0`)
 * ke `public.cash_flow` sekaligus melengkapi baris penjualan POS lama yang kolom `description`-nya
 * masih kosong, `'-'`, `'Penjualan Kasir Tunai'`, atau memakai istilah lama `"Pembelian Tunai"`.
 */
export async function syncPosCashSalesToCashFlow(): Promise<SyncPosCashSalesResult> {
  const emptyResult: SyncPosCashSalesResult = {
    insertedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
  };

  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return emptyResult;
    }

    let salesRes = await safeFetchAllPaged<any>(
      'sales',
      'id, sale_number, member_id, paid_cash, total_amount, payment_scheme, sale_status, created_at'
    );
    if (salesRes.error && isPostgrestColumnError(salesRes.error)) {
      salesRes = await safeFetchAllPaged<any>(
        'sales',
        'id, sale_number, member_id, paid_cash, total_amount, created_at'
      );
    }
    if (salesRes.error) {
      return emptyResult;
    }

    let hasDescriptionCol = true;
    let cfRes = await safeFetchAllPaged<any>(
      'cash_flow',
      'id, category, direction, amount, reference_id, description, created_at'
    );
    if (cfRes.error && isPostgrestColumnError(cfRes.error)) {
      hasDescriptionCol = false;
      cfRes = await safeFetchAllPaged<any>(
        'cash_flow',
        'id, category, direction, amount, reference_id, created_at'
      );
    }
    if (cfRes.error) {
      return emptyResult;
    }

    const validSales = (salesRes.data || []).filter((sale: any) => {
      if (!sale?.id) return false;
      const st = String(sale?.sale_status || '').trim().toLowerCase();
      return !st || st === 'completed' || st === 'success';
    });

    if (validSales.length === 0) {
      return emptyResult;
    }

    const existingRowsByRef = new Map<string, any[]>();
    for (const r of cfRes.data || []) {
      if (!isPosCashSaleCategory(r?.category) || !r?.reference_id) continue;
      const refKey = String(r.reference_id);
      const list = existingRowsByRef.get(refKey) || [];
      list.push(r);
      existingRowsByRef.set(refKey, list);
    }

    const rowsToUpdate: Array<{ cfRow: any; sale: any }> = [];
    if (hasDescriptionCol) {
      for (const sale of validSales) {
        const existingRows = existingRowsByRef.get(String(sale.id)) || [];
        for (const cfRow of existingRows) {
          if (needsPosDescriptionEnrichment(cfRow?.description)) {
            rowsToUpdate.push({ cfRow, sale });
          }
        }
      }
    }

    const salesToInsert = validSales.filter(
      (sale: any) =>
        Math.round(Number(sale?.paid_cash || 0)) > 0 &&
        !existingRowsByRef.has(String(sale.id))
    );

    const skippedCount = Math.max(0, validSales.length - salesToInsert.length);
    if (rowsToUpdate.length === 0 && salesToInsert.length === 0) {
      return { insertedCount: 0, updatedCount: 0, skippedCount };
    }

    const memberIds = Array.from(
      new Set(
        [...rowsToUpdate.map((entry) => entry.sale), ...salesToInsert]
          .filter((sale: any) => sale?.member_id && !sale?.anggota)
          .map((sale: any) => String(sale.member_id))
          .filter(Boolean)
      )
    );
    const memberRows =
      memberIds.length > 0
        ? await safeFetchByIds<any>('anggota', 'id, nrp, nama', memberIds)
        : [];
    const memberMap = new Map<string, any>();
    for (const m of memberRows) {
      if (m?.id) memberMap.set(String(m.id), m);
    }

    const getSaleMember = (sale: any) => {
      if (sale?.anggota && (sale.anggota.nrp || sale.anggota.nama)) {
        return sale.anggota;
      }
      return sale?.member_id ? memberMap.get(String(sale.member_id)) : undefined;
    };

    const cfTable: any = supabase?.from?.('cash_flow');
    let updatedCount = 0;
    let insertedCount = 0;

    if (cfTable && typeof cfTable.update === 'function') {
      for (const { cfRow, sale } of rowsToUpdate) {
        if (!cfRow?.id) continue;
        const member = getSaleMember(sale);
        const fullDescription = formatPosCashFlowDescription({
          saleNumber:
            sale?.sale_number || `POS-${String(sale.id).slice(0, 8).toUpperCase()}`,
          memberNrp: member?.nrp ?? null,
          memberName: member?.nama ?? null,
          amount: Math.round(
            Number(cfRow?.amount || sale?.paid_cash || sale?.total_amount || 0)
          ),
        });
        const updQ: any = cfTable.update({ description: fullDescription });
        if (updQ && typeof updQ.eq === 'function') {
          const updRes: any = await updQ.eq('id', cfRow.id);
          if (!updRes?.error) {
            updatedCount += 1;
          }
        }
      }
    }

    if (cfTable && typeof cfTable.insert === 'function' && salesToInsert.length > 0) {
      for (const sale of salesToInsert) {
        const member = getSaleMember(sale);
        const paidCash = Math.round(Number(sale?.paid_cash || 0));
        if (paidCash <= 0) continue;
        const fullDescription = formatPosCashFlowDescription({
          saleNumber:
            sale?.sale_number || `POS-${String(sale.id).slice(0, 8).toUpperCase()}`,
          memberNrp: member?.nrp ?? null,
          memberName: member?.nama ?? null,
          amount: paidCash,
        });
        let insRes: any = await cfTable.insert({
          direction: 'in',
          category: 'penjualan_tunai',
          amount: paidCash,
          reference_id: sale.id,
          description: fullDescription,
          created_at: sale?.created_at || new Date().toISOString(),
        });
        if (insRes?.error && isPostgrestColumnError(insRes.error)) {
          insRes = await cfTable.insert({
            direction: 'in',
            category: 'penjualan_tunai',
            amount: paidCash,
            reference_id: sale.id,
            created_at: sale?.created_at || new Date().toISOString(),
          });
        }
        if (!insRes?.error) {
          insertedCount += 1;
        }
      }
    }

    return { insertedCount, updatedCount, skippedCount };
  } catch (err) {
    console.warn('Warning syncPosCashSalesToCashFlow:', err);
    return emptyResult;
  }
}

/**
 * Melengkapi deskripsi baris mutasi `cash_flow` berkategori Penjualan POS yang
 * kolom `description`-nya masih kosong, bernilai `'-'`, `'Penjualan Kasir Tunai'`,
 * atau menggunakan istilah lama `"Pembelian Tunai"`.
 */
export async function enrichPosCashFlowDescriptions<
  T extends {
    id?: string;
    kategori?: string;
    category?: string;
    deskripsi?: string;
    description?: string | null;
    reference_id?: string | null;
    kas_masuk?: number;
    amount?: number;
  }
>(rows: T[]): Promise<T[]> {
  const needsEnrichment = (row: T): boolean => {
    const category = row.kategori ?? row.category;
    if (!isPosCashSaleCategory(category)) return false;
    const rawDesc = row.deskripsi ?? row.description;
    return needsPosDescriptionEnrichment(rawDesc);
  };

  const targetRows = rows.filter(needsEnrichment);
  if (targetRows.length === 0) return rows;

  try {
    const saleIds = Array.from(
      new Set(
        targetRows
          .map((r) => r.reference_id || r.id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const saleRows =
      saleIds.length > 0
        ? await safeFetchByIds<any>(
            'sales',
            'id, sale_number, member_id, paid_cash, total_amount',
            saleIds
          )
        : [];
    const saleMap = new Map<string, any>();
    for (const s of saleRows) {
      if (s?.id) saleMap.set(String(s.id), s);
    }

    const memberIds = Array.from(
      new Set(saleRows.map((s: any) => String(s?.member_id || '')).filter(Boolean))
    );
    const memberRows =
      memberIds.length > 0
        ? await safeFetchByIds<any>('anggota', 'id, nrp, nama', memberIds)
        : [];
    const memberMap = new Map<string, any>();
    for (const m of memberRows) {
      if (m?.id) memberMap.set(String(m.id), m);
    }

    return rows.map((row) => {
      if (!needsEnrichment(row)) return row;
      const lookupId = String(row.reference_id || row.id || '');
      const sale = lookupId ? saleMap.get(lookupId) : undefined;
      const rawDesc = String(row.deskripsi ?? row.description ?? '').trim();
      const rowAmount = Math.round(
        Number(row.kas_masuk ?? row.amount ?? sale?.paid_cash ?? sale?.total_amount ?? 0)
      );

      let enrichedDesc: string;
      if (sale) {
        const member = sale.member_id ? memberMap.get(String(sale.member_id)) : undefined;
        enrichedDesc = formatPosCashFlowDescription({
          saleNumber:
            sale.sale_number || `POS-${String(sale.id).slice(0, 8).toUpperCase()}`,
          memberNrp: member?.nrp ?? null,
          memberName: member?.nama ?? null,
          amount: rowAmount,
        });
      } else if (/pembelian[\s_]+tunai/i.test(rawDesc)) {
        enrichedDesc = sanitizePosTerminology(rawDesc);
      } else {
        const fmtCash = new Intl.NumberFormat('id-ID').format(rowAmount);
        enrichedDesc = `Penjualan Tunai (Rp ${fmtCash})`;
      }

      return {
        ...row,
        ...(row.deskripsi !== undefined ? { deskripsi: enrichedDesc } : {}),
        ...(row.description !== undefined ? { description: enrichedDesc } : {}),
      };
    });
  } catch (err) {
    console.warn('Warning enrichPosCashFlowDescriptions:', err);
    return rows;
  }
}

let activeClearanceDedupePromise: Promise<DeduplicateClearanceCashFlowResult> | null = null;
let activeClearanceSyncPromise: Promise<SyncResignedMemberClearanceResult> | null = null;

async function deleteCashFlowRowsByIds(ids: string[]): Promise<string[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const cfTable: any = supabase?.from?.('cash_flow');
  if (!cfTable || typeof cfTable.delete !== 'function') {
    return [];
  }

  const deletedIds: string[] = [];
  for (let i = 0; i < uniqueIds.length; i += 200) {
    const chunk = uniqueIds.slice(i, i + 200);
    try {
      const delQ: any = cfTable.delete();
      if (delQ && typeof delQ.in === 'function') {
        const delRes: any = await delQ.in('id', chunk);
        if (!delRes?.error) {
          deletedIds.push(...chunk);
        } else {
          console.warn('Warning deleteCashFlowRowsByIds (.in):', delRes.error);
        }
      } else if (delQ && typeof delQ.eq === 'function') {
        for (let j = 0; j < chunk.length; j += 1) {
          const delId = chunk[j];
          const targetQ: any = j === 0 ? delQ : cfTable.delete();
          const delRes: any = await targetQ.eq('id', delId);
          if (!delRes?.error) {
            deletedIds.push(delId);
          } else {
            console.warn('Warning deleteCashFlowRowsByIds (.eq):', delRes.error);
          }
        }
      }
    } catch (err) {
      console.warn('Warning deleteCashFlowRowsByIds:', err);
    }
  }

  return deletedIds;
}

async function runDeduplicateClearanceCashFlow(
  prefetchedRows?: any[]
): Promise<DeduplicateClearanceCashFlowResult> {
  const emptyResult: DeduplicateClearanceCashFlowResult = {
    deletedCount: 0,
    keptCount: 0,
    deletedIds: [],
  };

  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return emptyResult;
    }

    let rows: any[];
    if (Array.isArray(prefetchedRows)) {
      rows = prefetchedRows;
    } else {
      let cfRes = await safeFetchAllPaged<any>(
        'cash_flow',
        'id, category, direction, amount, reference_id, description, created_at'
      );
      if (cfRes.error && isPostgrestColumnError(cfRes.error)) {
        cfRes = await safeFetchAllPaged<any>(
          'cash_flow',
          'id, category, direction, amount, reference_id, created_at'
        );
      }
      if (cfRes.error) {
        return emptyResult;
      }
      rows = cfRes.data || [];
    }

    const { kept, duplicates } = partitionDuplicateClearanceRows(rows);
    const duplicateIds = duplicates
      .map((r: any) => String(r?.id || '').trim())
      .filter(Boolean);

    if (duplicateIds.length === 0) {
      return {
        deletedCount: 0,
        keptCount: kept.length,
        deletedIds: [],
      };
    }

    const deletedIds = await deleteCashFlowRowsByIds(duplicateIds);
    return {
      deletedCount: deletedIds.length,
      keptCount: kept.length,
      deletedIds,
    };
  } catch (err) {
    console.warn('Warning deduplicateClearanceCashFlow:', err);
    return emptyResult;
  }
}

/**
 * Menghapus baris duplikat `public.cash_flow` berkategori `KLIRING_ANGGOTA_KELUAR`
 * berdasarkan `reference_id` atau NRP anggota, menyisakan tepat 1 baris kanonik
 * paling awal (`created_at ASC, id ASC`). Dilengkapi singleton in-flight lock.
 */
export async function deduplicateClearanceCashFlow(): Promise<DeduplicateClearanceCashFlowResult> {
  if (activeClearanceDedupePromise) {
    return activeClearanceDedupePromise;
  }

  const runPromise = runDeduplicateClearanceCashFlow().finally(() => {
    if (activeClearanceDedupePromise === runPromise) {
      activeClearanceDedupePromise = null;
    }
  });
  activeClearanceDedupePromise = runPromise;
  return runPromise;
}

function compareClearanceRowsOrder(a: any, b: any): number {
  const rawA = String(a?.created_at || '').trim();
  const rawB = String(b?.created_at || '').trim();
  const ta = rawA ? Date.parse(rawA) : NaN;
  const tb = rawB ? Date.parse(rawB) : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb)) {
    if (ta !== tb) return ta - tb;
  } else if (rawA !== rawB) {
    return rawA < rawB ? -1 : 1;
  }
  const idA = String(a?.id || '').toLowerCase();
  const idB = String(b?.id || '').toLowerCase();
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  return 0;
}

async function runSyncResignedMemberClearanceToCashFlow(): Promise<SyncResignedMemberClearanceResult> {
  const emptyResult: SyncResignedMemberClearanceResult = {
    insertedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    deletedCount: 0,
  };

  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return emptyResult;
    }

    let hasDescriptionCol = true;
    let cfRes = await safeFetchAllPaged<any>(
      'cash_flow',
      'id, category, direction, amount, reference_id, description, created_at'
    );
    if (cfRes.error && isPostgrestColumnError(cfRes.error)) {
      hasDescriptionCol = false;
      cfRes = await safeFetchAllPaged<any>(
        'cash_flow',
        'id, category, direction, amount, reference_id, created_at'
      );
    }
    if (cfRes.error) {
      return emptyResult;
    }

    const dedupeRes = await runDeduplicateClearanceCashFlow(cfRes.data || []);
    const deletedIdSet = new Set(dedupeRes.deletedIds);
    const survivingCfRows = (cfRes.data || []).filter(
      (r: any) => !deletedIdSet.has(String(r?.id || '').trim())
    );

    const anggotaRes = await safeFetchAllAnggotaForClearance();
    if (anggotaRes.error) {
      return {
        ...emptyResult,
        deletedCount: dedupeRes.deletedCount,
      };
    }

    const resignedMembers = (anggotaRes.data || []).filter(
      (m: any) => m?.id && isResignedMemberRecord(m)
    );
    if (resignedMembers.length === 0) {
      return {
        ...emptyResult,
        deletedCount: dedupeRes.deletedCount,
      };
    }

    const existingClearanceRows = survivingCfRows
      .filter((r: any) => isMemberClearanceCategory(r?.category))
      .sort(compareClearanceRowsOrder);

    const existingClearanceByRef = new Map<string, any>();
    const existingClearanceByNrp = new Map<string, any>();

    const registerClearanceRow = (r: any) => {
      const refKey = String(r?.reference_id || '').trim();
      if (refKey && !existingClearanceByRef.has(refKey)) {
        existingClearanceByRef.set(refKey, r);
      }
      const extractedNrp = extractNrpFromClearanceDescription(r?.description);
      if (extractedNrp) {
        const nrpKey = extractedNrp.toLowerCase();
        if (!existingClearanceByNrp.has(nrpKey)) {
          existingClearanceByNrp.set(nrpKey, r);
        }
      }
    };

    for (const r of existingClearanceRows) {
      registerClearanceRow(r);
    }

    const findExistingClearanceForMember = (member: any): any | undefined => {
      const memberId = String(member?.id || '').trim();
      if (memberId && existingClearanceByRef.has(memberId)) {
        return existingClearanceByRef.get(memberId);
      }
      const cleanNrp = stripResignedNrpPrefix(member?.nrp).toLowerCase();
      if (cleanNrp && cleanNrp !== '-') {
        const byNrp = existingClearanceByNrp.get(cleanNrp);
        if (byNrp) return byNrp;
        const scanned = existingClearanceRows.find((r: any) =>
          descriptionContainsClearanceMemberNrp(r?.description, member?.nrp)
        );
        if (scanned) return scanned;
      }
      return undefined;
    };

    const rowsToUpdate: Array<{ cfRow: any; member: any }> = [];
    if (hasDescriptionCol) {
      for (const m of resignedMembers) {
        const cfRow = findExistingClearanceForMember(m);
        if (cfRow?.id && isBlankOrDashDescription(cfRow?.description)) {
          rowsToUpdate.push({ cfRow, member: m });
        }
      }
    }

    const missingMembers = resignedMembers.filter(
      (m: any) => !findExistingClearanceForMember(m)
    );

    const skippedAlreadySynced = resignedMembers.length - missingMembers.length;
    if (missingMembers.length === 0 && rowsToUpdate.length === 0) {
      return {
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: skippedAlreadySynced,
        deletedCount: dedupeRes.deletedCount,
      };
    }

    const targetMemberIds = Array.from(
      new Set([
        ...missingMembers.map((m: any) => String(m.id)),
        ...rowsToUpdate.map((entry) => String(entry.member.id)),
      ])
    );

    const ctx = await fetchMemberClearanceContext(targetMemberIds);
    const cfTable: any = supabase.from('cash_flow');

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedZeroOrDupCount = skippedAlreadySynced;

    if (cfTable && typeof cfTable.update === 'function') {
      for (const { cfRow, member } of rowsToUpdate) {
        const settlement = computeMemberSettlementFromContext(
          String(member.id),
          member,
          ctx
        );
        const fullDesc = formatMemberClearanceCashFlowDescription({
          memberNrp: member?.nrp ?? null,
          memberName: member?.nama ?? null,
          totalSavings: settlement.totalSavings,
          totalDebtOffset: settlement.totalDebtOffset,
          netSettlement:
            settlement.netSettlement !== 0
              ? settlement.netSettlement
              : cfRow?.direction === 'out'
              ? Math.round(Number(cfRow?.amount || 0))
              : -Math.round(Number(cfRow?.amount || 0)),
        });

        const updQ: any = cfTable.update({ description: fullDesc });
        if (updQ && typeof updQ.eq === 'function') {
          const updRes: any = await updQ.eq('id', cfRow.id);
          if (!updRes?.error) {
            updatedCount += 1;
          }
        }
      }
    }

    if (cfTable && typeof cfTable.insert === 'function' && missingMembers.length > 0) {
      for (const member of missingMembers) {
        const memberId = String(member.id);
        const memberLogs = ctx.logsByMember.get(memberId) || [];
        const hasLogRefAlready = memberLogs.some(
          (l: any) => l?.id && existingClearanceByRef.has(String(l.id))
        );
        if (hasLogRefAlready || findExistingClearanceForMember(member)) {
          skippedZeroOrDupCount += 1;
          continue;
        }

        const settlement = computeMemberSettlementFromContext(memberId, member, ctx);
        if (settlement.netSettlement === 0) {
          skippedZeroOrDupCount += 1;
          continue;
        }

        const direction = settlement.netSettlement > 0 ? 'out' : 'in';
        const amount = Math.round(Math.abs(settlement.netSettlement));
        const fullDesc = formatMemberClearanceCashFlowDescription({
          memberNrp: member?.nrp ?? null,
          memberName: member?.nama ?? null,
          totalSavings: settlement.totalSavings,
          totalDebtOffset: settlement.totalDebtOffset,
          netSettlement: settlement.netSettlement,
        });

        let insRes: any = await cfTable.insert({
          direction,
          category: MEMBER_CLEARANCE_CATEGORY,
          amount,
          reference_id: memberId,
          description: fullDesc,
          created_at: settlement.clearanceTimestamp,
        });

        if (insRes?.error && isPostgrestColumnError(insRes.error)) {
          insRes = await cfTable.insert({
            direction,
            category: MEMBER_CLEARANCE_CATEGORY,
            amount,
            reference_id: memberId,
            created_at: settlement.clearanceTimestamp,
          });
        }

        if (!insRes?.error) {
          insertedCount += 1;
          const insertedRow = {
            reference_id: memberId,
            category: MEMBER_CLEARANCE_CATEGORY,
            description: fullDesc,
          };
          existingClearanceRows.push(insertedRow);
          registerClearanceRow(insertedRow);
        }
      }
    }

    return {
      insertedCount,
      updatedCount,
      skippedCount: skippedZeroOrDupCount,
      deletedCount: dedupeRes.deletedCount,
    };
  } catch (err) {
    console.warn('Warning syncResignedMemberClearanceToCashFlow:', err);
    return emptyResult;
  }
}

/**
 * Menyinkronkan (backfill idempoten) pencairan/kliring simpanan anggota berstatus `RESIGNED`
 * ke `public.cash_flow` (`category = 'KLIRING_ANGGOTA_KELUAR'`) beserta deskripsi rincian
 * hak simpanan, potongan utang, dan kas bersih yang dibayarkan.
 * Menggunakan singleton in-flight mutex lock untuk mencegah eksekusi paralel (misal React StrictMode).
 */
export async function syncResignedMemberClearanceToCashFlow(): Promise<SyncResignedMemberClearanceResult> {
  if (activeClearanceSyncPromise) {
    return activeClearanceSyncPromise;
  }

  const runPromise = runSyncResignedMemberClearanceToCashFlow().finally(() => {
    if (activeClearanceSyncPromise === runPromise) {
      activeClearanceSyncPromise = null;
    }
  });
  activeClearanceSyncPromise = runPromise;
  return runPromise;
}

/**
 * Melengkapi deskripsi baris mutasi `cash_flow` berkategori `KLIRING_ANGGOTA_KELUAR`
 * yang kolom `description`-nya masih kosong atau bernilai `'-'`.
 */
export async function enrichMemberClearanceCashFlowDescriptions<
  T extends {
    id?: string;
    kategori?: string;
    category?: string;
    deskripsi?: string;
    description?: string | null;
    reference_id?: string | null;
    kas_masuk?: number;
    kas_keluar?: number;
    amount?: number;
    direction?: 'in' | 'out';
  }
>(rows: T[]): Promise<T[]> {
  const needsEnrichment = (row: T): boolean => {
    const category = row.kategori ?? row.category;
    if (!isMemberClearanceCategory(category)) return false;
    const rawDesc = row.deskripsi ?? row.description;
    return isBlankOrDashDescription(rawDesc);
  };

  const targetRows = rows.filter(needsEnrichment);
  if (targetRows.length === 0) return rows;

  try {
    const refIds = Array.from(
      new Set(targetRows.map((r) => r.reference_id).filter((id): id is string => Boolean(id)))
    );
    if (refIds.length === 0) return rows;

    const memberRows = await safeFetchByIds<any>(
      'anggota',
      'id, nrp, nama, tanggal_lahir, status, membership_status, updated_at',
      refIds,
      'id, nrp, nama, status'
    );
    const memberMap = new Map<string, any>();
    for (const m of memberRows) {
      if (m?.id) memberMap.set(String(m.id), m);
    }

    const memberIds = Array.from(memberMap.keys());
    const ctx = await fetchMemberClearanceContext(memberIds);

    return rows.map((row) => {
      if (!needsEnrichment(row)) return row;
      const refId = row.reference_id ? String(row.reference_id) : '';
      const member = refId ? memberMap.get(refId) : undefined;
      if (!member) return row;

      const settlement = computeMemberSettlementFromContext(refId, member, ctx);
      const fallbackNet =
        Number(row.kas_keluar || 0) > 0
          ? Number(row.kas_keluar)
          : Number(row.kas_masuk || 0) > 0
          ? -Number(row.kas_masuk)
          : row.direction === 'in'
          ? -Number(row.amount || 0)
          : Number(row.amount || 0);

      const enrichedDesc = formatMemberClearanceCashFlowDescription({
        memberNrp: member?.nrp ?? null,
        memberName: member?.nama ?? null,
        totalSavings:
          settlement.totalSavings > 0
            ? settlement.totalSavings
            : Math.round(Math.abs(fallbackNet)),
        totalDebtOffset: settlement.totalDebtOffset,
        netSettlement:
          settlement.netSettlement !== 0 ? settlement.netSettlement : fallbackNet,
      });

      return {
        ...row,
        ...(row.deskripsi !== undefined ? { deskripsi: enrichedDesc } : {}),
        ...(row.description !== undefined ? { description: enrichedDesc } : {}),
      };
    });
  } catch (err) {
    console.warn('Warning enrichMemberClearanceCashFlowDescriptions:', err);
    return rows;
  }
}

export interface EnrichMemberDepositDescriptionsResult {
  updatedCount: number;
  skippedCount: number;
  resolvedDescriptions: Record<string, string>;
}

let activeMemberDepositEnrichPromise: Promise<EnrichMemberDepositDescriptionsResult> | null =
  null;

async function runEnrichMemberDepositCashFlowDescriptions(): Promise<EnrichMemberDepositDescriptionsResult> {
  const emptyResult: EnrichMemberDepositDescriptionsResult = {
    updatedCount: 0,
    skippedCount: 0,
    resolvedDescriptions: {},
  };

  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return emptyResult;
    }

    const cfRes = await safeFetchAllPaged<any>(
      'cash_flow',
      'id, created_at, description, category, direction, amount, reference_id'
    );
    if (cfRes.error) {
      return emptyResult;
    }

    const memberDepositRows = (cfRes.data || []).filter((r: any) =>
      isMemberDepositBatchCategory(r?.category)
    );
    const targetRows = memberDepositRows.filter(
      (r: any) => r?.id && !hasMemberDepositTypeComponents(r?.description)
    );
    let skippedCount = memberDepositRows.length - targetRows.length;

    if (targetRows.length === 0) {
      return { updatedCount: 0, skippedCount, resolvedDescriptions: {} };
    }

    const rowMeta = targetRows.map((cfRow: any) => ({
      cfRow,
      cfId: String(cfRow.id),
      receiptCode: extractReceiptCodeFromCashFlow(cfRow?.reference_id, cfRow?.description),
      rawRefId: String(cfRow?.reference_id || '').trim(),
      memberNrpHint: extractMemberNrpFromDepositDescription(cfRow?.description),
      cfAmount: Math.round(Number(cfRow?.amount || 0)),
      matchedTxs: [] as any[],
      matchedLoanRepayments: [] as any[],
      resolvedMember: null as any | null,
    }));

    const uniqueReceiptCodes = Array.from(
      new Set(
        rowMeta
          .map((entry) => entry.receiptCode)
          .filter((code): code is string => Boolean(code))
      )
    );

    const txByRef =
      uniqueReceiptCodes.length > 0
        ? await safeFetchByColumnIn<any>(
            'deposit_transactions',
            DEPOSIT_TX_FULL_COLS,
            'reference_no',
            uniqueReceiptCodes,
            DEPOSIT_TX_NO_DATE_COLS
          )
        : [];
    const validDepositTxsByRef = txByRef.filter(
      (tx: any) => !tx?.transaction_type || tx.transaction_type === 'deposit'
    );

    for (const entry of rowMeta) {
      if (entry.receiptCode) {
        entry.matchedTxs = validDepositTxsByRef.filter((tx: any) =>
          depositTxMatchesReceipt(tx, entry.receiptCode!)
        );
      }
    }

    const needsFullTxScan = rowMeta.some((entry) => {
      const sum = entry.matchedTxs.reduce(
        (s, t) => s + Math.round(Number(t?.amount || 0)),
        0
      );
      return entry.matchedTxs.length === 0 || (entry.cfAmount > 0 && sum < entry.cfAmount);
    });

    if (needsFullTxScan) {
      const allTxs = await fetchAllDepositTransactionsResilient();
      const depositTxsAll = allTxs.filter(
        (row: any) => !row?.transaction_type || row.transaction_type === 'deposit'
      );

      for (const entry of rowMeta) {
        if (!entry.receiptCode) continue;
        const sum = entry.matchedTxs.reduce(
          (s, t) => s + Math.round(Number(t?.amount || 0)),
          0
        );
        if (entry.matchedTxs.length === 0 || (entry.cfAmount > 0 && sum < entry.cfAmount)) {
          const scanned = depositTxsAll.filter((tx: any) =>
            depositTxMatchesReceipt(tx, entry.receiptCode!)
          );
          if (scanned.length > entry.matchedTxs.length) {
            entry.matchedTxs = scanned;
          }
        }
      }

      for (const entry of rowMeta) {
        if (entry.matchedTxs.length > 0) continue;
        if (!entry.rawRefId || !UUID_REGEX.test(entry.rawRefId)) continue;
        const txById = depositTxsAll.find(
          (tx: any) => String(tx?.id || '') === entry.rawRefId
        );
        if (txById) {
          const txRef = String(txById?.reference_no || '').trim().toUpperCase();
          if (txRef) {
            const batchMatches = depositTxsAll.filter((row: any) =>
              depositTxMatchesReceipt(row, txRef)
            );
            entry.matchedTxs = batchMatches.length > 0 ? batchMatches : [txById];
          } else {
            entry.matchedTxs = [txById];
          }
        }
      }

      const entriesNeedingMemberFallback = rowMeta.filter(
        (entry) =>
          entry.matchedTxs.length === 0 &&
          (Boolean(entry.memberNrpHint) ||
            (Boolean(entry.rawRefId) && UUID_REGEX.test(entry.rawRefId)))
      );

      if (entriesNeedingMemberFallback.length > 0) {
        const [allMembersRes, allMdsRes] = await Promise.all([
          safeFetchAllPaged<any>('anggota', 'id, nrp, nama'),
          safeFetchAllPaged<any>('member_deposits', 'id, member_id, deposit_type_id'),
        ]);
        const allMembers = allMembersRes.data || [];
        const allMds = allMdsRes.data || [];

        for (const entry of entriesNeedingMemberFallback) {
          let resolvedMember: any = null;
          if (entry.rawRefId && UUID_REGEX.test(entry.rawRefId)) {
            resolvedMember =
              allMembers.find((m: any) => String(m?.id || '') === entry.rawRefId) ?? null;
          }
          if (!resolvedMember && entry.memberNrpHint) {
            const cleanHint = stripResignedNrpPrefix(entry.memberNrpHint);
            resolvedMember =
              allMembers.find(
                (m: any) => stripResignedNrpPrefix(m?.nrp) === cleanHint
              ) ?? null;
          }
          if (!resolvedMember?.id) continue;
          entry.resolvedMember = resolvedMember;

          const memberMdIds = new Set(
            allMds
              .filter((md: any) => String(md?.member_id || '') === String(resolvedMember.id))
              .map((md: any) => String(md.id))
              .filter(Boolean)
          );
          if (memberMdIds.size === 0) continue;

          const cfDateCandidates = getDateCandidates(entry.cfRow?.created_at);
          const sameDayMemberTxs = depositTxsAll.filter((row: any) => {
            if (!memberMdIds.has(String(row?.member_deposit_id || ''))) return false;
            if (isOpeningDepositTransaction(row)) return false;
            const descLower = String(row?.description || '').toLowerCase();
            if (descLower.includes('saldo awal')) return false;

            if (cfDateCandidates.length === 0) return true;
            const txDateCandidates = getDateCandidates(
              row?.transaction_date || row?.created_at
            );
            return hasCommonDate(cfDateCandidates, txDateCandidates);
          });

          entry.matchedTxs = selectBestMatchedDepositRowsForAmount(
            sameDayMemberTxs,
            entry.cfAmount,
            String(entry.cfRow?.created_at || '')
          );
        }
      }
    }

    const needsLoanRepayments = rowMeta.some((entry) => {
      if (!entry.receiptCode) return false;
      const sum = entry.matchedTxs.reduce(
        (s, t) => s + Math.round(Number(t?.amount || 0)),
        0
      );
      return entry.matchedTxs.length === 0 || (entry.cfAmount > 0 && sum < entry.cfAmount);
    });

    if (needsLoanRepayments) {
      const allRepayments = await fetchAllLoanRepaymentsResilient();
      for (const entry of rowMeta) {
        if (!entry.receiptCode) continue;
        const sum = entry.matchedTxs.reduce(
          (s, t) => s + Math.round(Number(t?.amount || 0)),
          0
        );
        if (entry.matchedTxs.length === 0 || (entry.cfAmount > 0 && sum < entry.cfAmount)) {
          entry.matchedLoanRepayments = allRepayments.filter((rep: any) =>
            loanRepaymentMatchesReceipt(rep, entry.receiptCode!)
          );
        }
      }
    }

    const mdIds = Array.from(
      new Set(
        rowMeta
          .flatMap((entry) => entry.matchedTxs)
          .map((tx: any) => String(tx?.member_deposit_id || ''))
          .filter(Boolean)
      )
    );
    const mdRows =
      mdIds.length > 0
        ? await safeFetchByIds<any>('member_deposits', 'id, member_id, deposit_type_id', mdIds)
        : [];
    const mdMap = new Map<string, any>();
    for (const md of mdRows) {
      if (md?.id) mdMap.set(String(md.id), md);
    }

    const dtIds = Array.from(
      new Set(
        [
          ...mdRows.map((md: any) => String(md?.deposit_type_id || '')),
          ...rowMeta
            .flatMap((entry) => entry.matchedTxs)
            .map((tx: any) => String(tx?.deposit_type_id || '')),
        ].filter(Boolean)
      )
    );

    const blankMemberIds = Array.from(
      new Set(
        rowMeta
          .filter((entry) => isBlankOrDashDescription(entry.cfRow?.description))
          .flatMap((entry) => {
            const ids: string[] = [];
            if (entry.resolvedMember?.id) ids.push(String(entry.resolvedMember.id));
            for (const tx of entry.matchedTxs) {
              const md = tx?.member_deposit_id
                ? mdMap.get(String(tx.member_deposit_id))
                : undefined;
              if (md?.member_id) ids.push(String(md.member_id));
            }
            return ids;
          })
          .filter(Boolean)
      )
    );

    const [dtRows, blankMemberRows] = await Promise.all([
      dtIds.length > 0
        ? safeFetchByIds<any>('deposit_types', 'id, code, name', dtIds)
        : Promise.resolve([]),
      blankMemberIds.length > 0
        ? safeFetchByIds<any>('anggota', 'id, nrp, nama', blankMemberIds)
        : Promise.resolve([]),
    ]);

    const dtMap = new Map<string, any>();
    for (const dt of dtRows) {
      if (dt?.id) dtMap.set(String(dt.id), dt);
    }
    const blankMemberMap = new Map<string, any>();
    for (const m of blankMemberRows) {
      if (m?.id) blankMemberMap.set(String(m.id), m);
    }

    let updatedCount = 0;
    const resolvedDescriptions: Record<string, string> = {};
    const cfTable: any = supabase?.from?.('cash_flow');

    for (const entry of rowMeta) {
      const componentSources: Array<{
        code?: string | null;
        name?: string | null;
        category?: string | null;
      }> = [];

      for (const tx of entry.matchedTxs) {
        const md = tx?.member_deposit_id
          ? mdMap.get(String(tx.member_deposit_id))
          : undefined;
        const dt =
          tx?.deposit_types ||
          md?.deposit_types ||
          (md?.deposit_type_id ? dtMap.get(String(md.deposit_type_id)) : undefined) ||
          (tx?.deposit_type_id ? dtMap.get(String(tx.deposit_type_id)) : undefined);
        componentSources.push({
          code: dt?.code ?? null,
          name:
            dt?.name ??
            (tx?.description && String(tx.description).trim() !== '-'
              ? String(tx.description)
              : null),
        });
      }

      if (entry.matchedLoanRepayments.length > 0) {
        componentSources.push({
          code: 'PINJAMAN',
          name: 'Angsuran Pinjaman',
          category: 'loan',
        });
      }

      const typeSummary = buildMemberDepositTypeSummary(componentSources);
      if (!typeSummary) {
        skippedCount += 1;
        continue;
      }

      let fallbackMeta:
        | {
            memberName?: string | null;
            memberNrp?: string | null;
            paymentMethodLabel?: string | null;
            receiptNo?: string | null;
          }
        | undefined;

      if (isBlankOrDashDescription(entry.cfRow?.description)) {
        const firstTx = entry.matchedTxs[0];
        const firstMd = firstTx?.member_deposit_id
          ? mdMap.get(String(firstTx.member_deposit_id))
          : undefined;
        const memberObj =
          entry.resolvedMember ||
          (firstMd?.member_id ? blankMemberMap.get(String(firstMd.member_id)) : undefined);
        const rawPayMethod = String(
          firstTx?.payment_method ||
            entry.matchedLoanRepayments[0]?.payment_method ||
            ''
        )
          .trim()
          .toLowerCase();
        fallbackMeta = {
          memberName: memberObj?.nama ?? null,
          memberNrp: memberObj?.nrp ? stripResignedNrpPrefix(memberObj.nrp) : null,
          paymentMethodLabel:
            rawPayMethod === 'transfer_bank'
              ? 'Transfer Bank'
              : rawPayMethod === 'tunai'
              ? 'Tunai'
              : null,
          receiptNo: entry.receiptCode,
        };
      }

      const origDesc = String(entry.cfRow?.description || '').trim();
      const newDescription = injectDepositTypesIntoMemberDepositDescription(
        entry.cfRow?.description,
        typeSummary,
        fallbackMeta
      );

      if (!newDescription || newDescription === origDesc) {
        skippedCount += 1;
        continue;
      }

      resolvedDescriptions[entry.cfId] = newDescription;

      if (cfTable && typeof cfTable.update === 'function') {
        const updQ: any = cfTable.update({ description: newDescription });
        if (updQ && typeof updQ.eq === 'function') {
          const updRes: any = await updQ.eq('id', entry.cfRow.id);
          if (!updRes?.error) {
            updatedCount += 1;
          }
        }
      }
    }

    return { updatedCount, skippedCount, resolvedDescriptions };
  } catch (err) {
    console.warn('Warning enrichMemberDepositCashFlowDescriptions:', err);
    return emptyResult;
  }
}

/**
 * Memperbarui kolom `description` pada baris `public.cash_flow` berkategori `SETORAN_ANGGOTA`
 * yang belum mencantumkan komponen jenis simpanan berdasarkan rincian `deposit_transactions`
 * dan `loan_repayments` terkait nomor kwitansi (`KW-SETOR-...`). Idempoten & aman dijalankan berulang.
 */
export async function enrichMemberDepositCashFlowDescriptions(): Promise<EnrichMemberDepositDescriptionsResult> {
  if (activeMemberDepositEnrichPromise) {
    return activeMemberDepositEnrichPromise;
  }

  const runPromise = runEnrichMemberDepositCashFlowDescriptions().finally(() => {
    if (activeMemberDepositEnrichPromise === runPromise) {
      activeMemberDepositEnrichPromise = null;
    }
  });
  activeMemberDepositEnrichPromise = runPromise;
  return runPromise;
}

const DEFAULT_MATRIX_SYNC_CUTOFF_DATE = '2026-03-01';
let activeMatrixDepositSyncPromise: Promise<SyncMatrixDepositsToCashFlowResult> | null = null;

async function resolveRawSavingsCutOffDateForMatrixSync(): Promise<string> {
  try {
    const ssTable: any = supabase?.from?.('system_settings');
    if (!ssTable || typeof ssTable.select !== 'function') {
      return DEFAULT_MATRIX_SYNC_CUTOFF_DATE;
    }

    const extractCutOff = (raw: unknown): string | null => {
      if (typeof raw !== 'string') return null;
      const trimmed = raw.trim().slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
    };

    const query: any = ssTable.select('key, value');
    if (query && typeof query.eq === 'function') {
      const eqQ = query.eq('key', 'initial_savings_effective_date');
      const res =
        typeof eqQ?.maybeSingle === 'function'
          ? await eqQ.maybeSingle()
          : typeof eqQ?.single === 'function'
          ? await eqQ.single()
          : await eqQ;
      const rowData = Array.isArray(res?.data) ? res.data[0] : res?.data;
      return extractCutOff(rowData?.value ? String(rowData.value) : null) || DEFAULT_MATRIX_SYNC_CUTOFF_DATE;
    }

    if (query && typeof query.then === 'function') {
      const res = await query;
      const rows = Array.isArray(res?.data) ? res.data : res?.data ? [res.data] : [];
      const found = rows.find((r: any) => r?.key === 'initial_savings_effective_date');
      return extractCutOff(found?.value ? String(found.value) : null) || DEFAULT_MATRIX_SYNC_CUTOFF_DATE;
    }
  } catch {
    // Non-blocking fallback
  }
  return DEFAULT_MATRIX_SYNC_CUTOFF_DATE;
}

async function runSyncMatrixDepositsToCashFlow(): Promise<SyncMatrixDepositsToCashFlowResult> {
  const emptyResult: SyncMatrixDepositsToCashFlowResult = {
    syncedCount: 0,
    skippedCount: 0,
  };

  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return emptyResult;
    }

    const actualCutOffDate = await resolveRawSavingsCutOffDateForMatrixSync();

    let txRes = await safeFetchAllPaged<any>(
      'deposit_transactions',
      'id, member_deposit_id, transaction_type, amount, for_month, for_year, description, reference_no, payment_method, notes, created_at'
    );
    if (txRes.error && isPostgrestColumnError(txRes.error)) {
      txRes = await safeFetchAllPaged<any>(
        'deposit_transactions',
        'id, member_deposit_id, transaction_type, amount, for_month, for_year, description, created_at'
      );
    }
    if (txRes.error) {
      return emptyResult;
    }

    const candidateTxs = (txRes.data || []).filter((tx: any) => {
      if (!tx?.id) return false;
      if (tx?.transaction_type !== 'deposit') return false;
      const amt = Math.round(Number(tx?.amount || 0));
      if (amt <= 0) return false;

      const fy =
        tx?.for_year !== null && tx?.for_year !== undefined && tx?.for_year !== ''
          ? Number(tx.for_year)
          : NaN;
      const fm =
        tx?.for_month !== null && tx?.for_month !== undefined && tx?.for_month !== ''
          ? Number(tx.for_month)
          : NaN;

      if (!Number.isInteger(fy) || fy <= 0 || !Number.isInteger(fm) || fm < 1 || fm > 12) {
        return false;
      }
      if (isOpeningOrMigrationDepositDescription(tx?.description)) {
        return false;
      }
      if (isOpeningDepositTransaction(tx, actualCutOffDate)) {
        return false;
      }

      const refNoUpper = String(tx?.reference_no || '').trim().toUpperCase();
      const notesUpper = String(tx?.notes || '').toUpperCase();
      const descUpper = String(tx?.description || '').toUpperCase();
      if (
        refNoUpper.startsWith('KW-SETOR-') ||
        notesUpper.includes('KW-SETOR-') ||
        descUpper.includes('KW-SETOR-')
      ) {
        return false;
      }

      return true;
    });

    if (candidateTxs.length === 0) {
      return emptyResult;
    }

    let cfRes = await safeFetchAllPaged<any>(
      'cash_flow',
      'id, category, direction, reference_id, description'
    );
    if (cfRes.error && isPostgrestColumnError(cfRes.error)) {
      cfRes = await safeFetchAllPaged<any>(
        'cash_flow',
        'id, category, direction, reference_id'
      );
    }
    if (cfRes.error) {
      return emptyResult;
    }

    const existingRefIds = new Set<string>();
    const existingBatchSetoranReceipts = new Set<string>();
    for (const cf of cfRes.data || []) {
      if (cf?.reference_id) {
        existingRefIds.add(String(cf.reference_id));
      }
      const catNorm = String(cf?.category || '').trim().toUpperCase().replace(/\s+/g, '_');
      if (catNorm === 'SETORAN_ANGGOTA' && typeof cf?.description === 'string') {
        const matches = cf.description.match(/\bKW-SETOR-[A-Z0-9\/-]+\b/gi) || [];
        for (const code of matches) {
          existingBatchSetoranReceipts.add(code.toUpperCase());
        }
      }
    }

    const missingTxs = candidateTxs.filter((tx: any) => {
      if (existingRefIds.has(String(tx.id))) return false;
      const refNoUpper = String(tx?.reference_no || '').trim().toUpperCase();
      if (refNoUpper && existingBatchSetoranReceipts.has(refNoUpper)) return false;
      return true;
    });

    const skippedCount = candidateTxs.length - missingTxs.length;
    if (missingTxs.length === 0) {
      return { syncedCount: 0, skippedCount };
    }

    const mdIds = Array.from(
      new Set(missingTxs.map((tx: any) => String(tx?.member_deposit_id || '')).filter(Boolean))
    );
    const mdRows = await safeFetchByIds<any>(
      'member_deposits',
      'id, member_id, deposit_type_id',
      mdIds
    );
    const mdMap = new Map<string, any>();
    for (const md of mdRows) {
      if (md?.id) mdMap.set(String(md.id), md);
    }

    const memberIds = Array.from(
      new Set(mdRows.map((md: any) => String(md?.member_id || '')).filter(Boolean))
    );
    const dtIds = Array.from(
      new Set(mdRows.map((md: any) => String(md?.deposit_type_id || '')).filter(Boolean))
    );

    const [memberRows, dtRows] = await Promise.all([
      safeFetchByIds<any>('anggota', 'id, nrp, nama', memberIds),
      safeFetchByIds<any>('deposit_types', 'id, code, name', dtIds),
    ]);

    const memberMap = new Map<string, any>();
    for (const m of memberRows) {
      if (m?.id) memberMap.set(String(m.id), m);
    }
    const dtMap = new Map<string, any>();
    for (const dt of dtRows) {
      if (dt?.id) dtMap.set(String(dt.id), dt);
    }

    const cfTable: any = supabase?.from?.('cash_flow');
    if (!cfTable || typeof cfTable.insert !== 'function') {
      return { syncedCount: 0, skippedCount };
    }

    const cashFlowPayloads = missingTxs.map((tx: any) => {
      const md = tx?.member_deposit_id ? mdMap.get(String(tx.member_deposit_id)) : undefined;
      const member = md?.member_id ? memberMap.get(String(md.member_id)) : undefined;
      const dt = md?.deposit_type_id ? dtMap.get(String(md.deposit_type_id)) : undefined;

      const description = formatMatrixDepositCashFlowDescription({
        depositTypeName: dt?.name || null,
        month: Number(tx.for_month),
        year: Number(tx.for_year),
        memberNrp: member?.nrp || null,
        memberName: member?.nama || null,
        referenceNo: tx?.reference_no || null,
      });

      return {
        direction: 'in',
        category: 'Setoran Simpanan',
        amount: Math.round(Number(tx.amount)),
        reference_id: tx.id,
        description,
        created_at: tx?.created_at || new Date().toISOString(),
      };
    });

    let syncedCount = 0;
    const CHUNK_SIZE = 100;
    for (let i = 0; i < cashFlowPayloads.length; i += CHUNK_SIZE) {
      const chunk = cashFlowPayloads.slice(i, i + CHUNK_SIZE);
      let res: any = await cfTable.insert(chunk);
      if (res?.error && isPostgrestColumnError(res.error)) {
        const fallbackChunk = chunk.map(({ description: _desc, ...rest }) => rest);
        res = await cfTable.insert(fallbackChunk);
      }
      if (res?.error) {
        console.error('[syncMatrixDepositsToCashFlow] Insert gagal:', res.error);
      } else {
        syncedCount += chunk.length;
      }
    }

    return { syncedCount, skippedCount };
  } catch (err) {
    console.warn('Warning syncMatrixDepositsToCashFlow:', err);
    return emptyResult;
  }
}

/**
 * Menyinkronkan (backfill idempoten) mutasi setoran matriks pada `public.deposit_transactions`
 * yang belum tercatat di `public.cash_flow`, dengan in-flight promise lock agar bebas duplikasi
 * akibat eksekusi paralel. Mengecualikan saldo awal/cut-off serta transaksi batch kasir (`KW-SETOR-...`).
 */
export async function syncMatrixDepositsToCashFlow(): Promise<SyncMatrixDepositsToCashFlowResult> {
  if (activeMatrixDepositSyncPromise) {
    return activeMatrixDepositSyncPromise;
  }

  const runPromise = runSyncMatrixDepositsToCashFlow().finally(() => {
    if (activeMatrixDepositSyncPromise === runPromise) {
      activeMatrixDepositSyncPromise = null;
    }
  });
  activeMatrixDepositSyncPromise = runPromise;
  return runPromise;
}

const ACTIVE_OR_SETTLED_LOAN_STATUSES = new Set([
  'active',
  'approved',
  'berjalan',
  'disbursed',
  'paid_off',
  'completed',
  'lunas',
]);

let activeApprovedLoanSyncPromise: Promise<SyncApprovedLoansToCashFlowResult> | null = null;

function resolveApprovedLoanCashFlowTimestamp(loan: any): string {
  const primary = String(loan?.disbursed_at || loan?.approved_at || '').trim();
  const created = String(loan?.created_at || '').trim();
  if (primary) {
    if (primary.includes('T')) return primary;
    if (/^\d{4}-\d{2}-\d{2}$/.test(primary)) {
      if (created && created.startsWith(primary)) return created;
      return `${primary}T00:00:00.000Z`;
    }
  }
  return created || new Date().toISOString();
}

async function runSyncApprovedLoansToCashFlow(): Promise<SyncApprovedLoansToCashFlowResult> {
  const emptyResult: SyncApprovedLoansToCashFlowResult = {
    syncedCount: 0,
    skippedCount: 0,
  };

  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return emptyResult;
    }

    let loanRes = await safeFetchAllPaged<any>(
      'loans',
      'id, loan_number, member_id, loan_type_id, principal_amount, amount, cost_price, markup_amount, item_description, topup_settlement_amount, tenor, agreed_tenor_months, status, disbursed_at, approved_at, created_at, notes'
    );
    if (loanRes.error && isPostgrestColumnError(loanRes.error)) {
      loanRes = await safeFetchAllPaged<any>(
        'loans',
        'id, loan_number, member_id, loan_type_id, principal_amount, amount, topup_settlement_amount, tenor, agreed_tenor_months, status, disbursed_at, approved_at, created_at, notes'
      );
    }
    if (loanRes.error && isPostgrestColumnError(loanRes.error)) {
      loanRes = await safeFetchAllPaged<any>('loans', '*');
    }
    if (loanRes.error) {
      console.error('[syncApprovedLoansToCashFlow] Query loans gagal:', loanRes.error);
      return emptyResult;
    }

    const candidateLoans = (loanRes.data || []).filter((loan: any) => {
      if (!loan?.id) return false;
      const statusNorm = String(loan?.status || '').trim().toLowerCase();
      if (!ACTIVE_OR_SETTLED_LOAN_STATUSES.has(statusNorm)) return false;

      const loanNumberUpper = String(loan?.loan_number || '').trim().toUpperCase();
      if (loanNumberUpper.startsWith('SALDO-AWAL-')) return false;

      const notesLower = String(loan?.notes || '').toLowerCase();
      if (
        notesLower.includes('saldo awal') ||
        notesLower.includes('migrasi') ||
        notesLower.includes('cut-off')
      ) {
        return false;
      }

      const rawEffectiveDate = String(loan?.disbursed_at || loan?.approved_at || loan?.created_at || '').trim();
      const ymdMatch = rawEffectiveDate.match(/^(\d{4}-\d{2}-\d{2})/);
      if (ymdMatch && ymdMatch[1] < '2026-01-01') return false;

      return true;
    });

    if (candidateLoans.length === 0) {
      return emptyResult;
    }

    let [ltRes, cfRes] = await Promise.all([
      safeFetchAllPaged<any>('loan_types', 'id, code, name, financing_scheme'),
      safeFetchAllPaged<any>('cash_flow', 'id, category, direction, reference_id, description'),
    ]);
    if (ltRes.error && isPostgrestColumnError(ltRes.error)) {
      ltRes = await safeFetchAllPaged<any>('loan_types', 'id, code, name');
    }
    if (cfRes.error && isPostgrestColumnError(cfRes.error)) {
      cfRes = await safeFetchAllPaged<any>('cash_flow', 'id, category, direction, reference_id');
    }
    if (cfRes.error) {
      return emptyResult;
    }

    const loanTypeMap = new Map<string, any>();
    for (const lt of ltRes.data || []) {
      if (lt?.id) loanTypeMap.set(String(lt.id), lt);
    }

    const existingOutRefIds = new Set<string>();
    const existingOutLoanNumbers = new Set<string>();
    for (const cf of cfRes.data || []) {
      const dir = String(cf?.direction ?? cf?.type ?? '').trim().toLowerCase();
      if (dir !== 'out') continue;
      if (cf?.reference_id) {
        existingOutRefIds.add(String(cf.reference_id));
      }
      if (typeof cf?.description === 'string') {
        const matches = cf.description.match(/\bLOAN-[A-Z0-9-]+\b/gi) || [];
        for (const code of matches) {
          existingOutLoanNumbers.add(code.toUpperCase());
        }
      }
    }

    const pendingToInsert: Array<{
      loan: any;
      isGoodsMarkup: boolean;
      finalPrincipal: number;
      outflowAmount: number;
    }> = [];

    for (const loan of candidateLoans) {
      if (existingOutRefIds.has(String(loan.id))) continue;
      const loanNumberUpper = String(loan?.loan_number || '').trim().toUpperCase();
      if (loanNumberUpper && existingOutLoanNumbers.has(loanNumberUpper)) continue;

      const lt = loan?.loan_type_id ? loanTypeMap.get(String(loan.loan_type_id)) : undefined;
      const ltCodeUpper = String(lt?.code || '').trim().toUpperCase();
      const isGoodsMarkup =
        lt?.financing_scheme === 'GOODS_MARKUP' ||
        ltCodeUpper === 'PEMBIAYAAN_BARANG' ||
        ltCodeUpper === 'GOODS_MARKUP' ||
        Number(loan?.markup_amount || 0) > 0 ||
        Boolean(String(loan?.item_description || '').trim());

      const finalPrincipal = Math.max(
        0,
        Math.round(Number(loan?.principal_amount ?? loan?.amount ?? 0))
      );
      const markupAmount = isGoodsMarkup
        ? Math.max(0, Math.round(Number(loan?.markup_amount ?? 0)))
        : 0;
      const rawCostPrice = loan?.cost_price ?? loan?.supplier_cost;
      const outflowAmount = isGoodsMarkup
        ? Math.max(
            0,
            Math.round(
              rawCostPrice !== null && rawCostPrice !== undefined && Number(rawCostPrice) > 0
                ? Number(rawCostPrice)
                : Math.max(0, finalPrincipal - markupAmount)
            )
          )
        : Math.max(
            0,
            finalPrincipal - Math.max(0, Math.round(Number(loan?.topup_settlement_amount ?? 0)))
          );

      if (outflowAmount <= 0) continue;

      pendingToInsert.push({
        loan,
        isGoodsMarkup,
        finalPrincipal,
        outflowAmount,
      });
    }

    const skippedCount = candidateLoans.length - pendingToInsert.length;
    if (pendingToInsert.length === 0) {
      return { syncedCount: 0, skippedCount };
    }

    const memberIds = Array.from(
      new Set(pendingToInsert.map((item) => String(item.loan?.member_id || '')).filter(Boolean))
    );
    const memberRows = await safeFetchByIds<any>('anggota', 'id, nrp, nama', memberIds);
    const memberMap = new Map<string, any>();
    for (const m of memberRows) {
      if (m?.id) memberMap.set(String(m.id), m);
    }

    const cfTable: any = supabase?.from?.('cash_flow');
    if (!cfTable || typeof cfTable.insert !== 'function') {
      return { syncedCount: 0, skippedCount };
    }

    const fmtRp = (val: number) => Math.round(Number(val) || 0).toLocaleString('id-ID');

    const cashFlowPayloads = pendingToInsert.map(({ loan, isGoodsMarkup, finalPrincipal, outflowAmount }) => {
      const member = loan?.member_id ? memberMap.get(String(loan.member_id)) : undefined;
      const nrpStr = String(member?.nrp || '').trim();
      const namaStr = String(member?.nama || '').trim();
      const memberSegment = [nrpStr, namaStr].filter(Boolean).join(' - ') || 'Anggota';
      const loanNumberStr = String(loan?.loan_number || '').trim();
      const loanNumberSeg = loanNumberStr ? ` [${loanNumberStr}]` : '';
      const tenor = Math.max(1, Math.floor(Number(loan?.agreed_tenor_months ?? loan?.tenor ?? 1)));
      const itemDesc = String(loan?.item_description || loan?.notes || 'Barang').trim();
      const settlementAmt = Math.max(0, Math.round(Number(loan?.topup_settlement_amount ?? 0)));

      const description = isGoodsMarkup
        ? `Pencairan Pembiayaan Barang (${itemDesc})${loanNumberSeg} — ${memberSegment} (Modal: Rp ${fmtRp(outflowAmount)}, Akad: Rp ${fmtRp(finalPrincipal)})`
        : `Pencairan Pinjaman${loanNumberSeg} — ${memberSegment} (Tenor ${tenor} Bln${settlementAmt > 0 ? `, Potong Top-Up: Rp ${fmtRp(settlementAmt)}` : ''})`;

      return {
        direction: 'out' as const,
        category: isGoodsMarkup ? 'pembiayaan_barang' : 'pencairan_pinjaman',
        amount: outflowAmount,
        reference_id: loan.id,
        description,
        created_at: resolveApprovedLoanCashFlowTimestamp(loan),
      };
    });

    let syncedCount = 0;
    const CHUNK_SIZE = 100;
    for (let i = 0; i < cashFlowPayloads.length; i += CHUNK_SIZE) {
      const chunk = cashFlowPayloads.slice(i, i + CHUNK_SIZE);
      let res: any = await cfTable.insert(chunk);
      if (res?.error && isPostgrestColumnError(res.error)) {
        const fallbackChunk = chunk.map(({ description: _desc, ...rest }) => rest);
        res = await cfTable.insert(fallbackChunk);
      }
      if (res?.error) {
        console.error('[syncApprovedLoansToCashFlow] Insert gagal:', res.error);
      } else {
        syncedCount += chunk.length;
      }
    }

    return { syncedCount, skippedCount };
  } catch (err) {
    console.warn('Warning syncApprovedLoansToCashFlow:', err);
    return emptyResult;
  }
}

/**
 * Menyinkronkan (backfill idempoten) pencairan pinjaman dan pembiayaan barang berstatus
 * berjalan/disetujui/lunas (pasca-cut-off, non saldo awal) yang belum memiliki entri
 * Kas Keluar di `public.cash_flow`, dengan in-flight promise lock anti-duplikasi.
 */
export async function syncApprovedLoansToCashFlow(): Promise<SyncApprovedLoansToCashFlowResult> {
  if (activeApprovedLoanSyncPromise) {
    return activeApprovedLoanSyncPromise;
  }

  const runPromise = runSyncApprovedLoansToCashFlow().finally(() => {
    if (activeApprovedLoanSyncPromise === runPromise) {
      activeApprovedLoanSyncPromise = null;
    }
  });
  activeApprovedLoanSyncPromise = runPromise;
  return runPromise;
}

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
  formatMatrixDepositCashFlowDescription,
  formatMatrixDepositPeriodLabel,
  formatMatrixDepositShortPeriod,
  isSavingsDepositCategory,
} from '../utils/depositCashFlowFormat';
import {
  formatStoreCreditCashFlowDescription,
  inferStoreCreditPaymentMethod,
} from './storeCreditLedgerService';

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
  pangkat: string;
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
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidCash: number;
  paidDeposit: number;
  paidCredit: number;
  member?: { nrp: string; nama: string; pangkat?: string | null } | null;
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
  member?: { nrp: string; nama: string; pangkat?: string | null } | null;
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
    pangkat?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
  } | null;
}

export interface BulkLebaranRecipientRow {
  id: string;
  memberId: string;
  nrp: string;
  nama: string;
  pangkat: string;
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
  member?: { nrp: string; nama: string; pangkat?: string | null } | null;
}

export interface IndividualDepositBreakdown {
  transactionId: string;
  nrp: string;
  nama: string;
  pangkat?: string | null;
  depositTypeCode: string;
  depositTypeName: string;
  forMonth: number | null;
  forYear: number | null;
  periodLabel: string;
  shortPeriodLabel: string;
  referenceNo: string | null;
  paymentMethod: string | null;
  description: string;
  notes: string | null;
  createdAt: string;
  amount: number;
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
  pangkat?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
} | null {
  if (!member) return null;
  const summary: {
    nrp: string;
    nama: string;
    pangkat?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
  } = {
    nrp: String(member.nrp || '-'),
    nama: String(member.nama || '-'),
    pangkat: member.pangkat ?? null,
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
    'id, nrp, nama, pangkat, bank_name, bank_account_number',
    memberId
  );
  if (res.error && isPostgrestColumnError(res.error)) {
    res = await safeFetchSingleById<any>(
      'anggota',
      'id, nrp, nama, pangkat, bank_account_number',
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
): Promise<Map<string, { id: string; nrp: string; nama: string; pangkat: string; bankName: string; bankAccountNumber: string }>> {
  const rows = await safeFetchByIds<any>(
    'anggota',
    'id, nrp, nama, pangkat, bank_name, bank_account_number',
    memberIds,
    'id, nrp, nama, pangkat, bank_account_number'
  );
  const map = new Map<
    string,
    { id: string; nrp: string; nama: string; pangkat: string; bankName: string; bankAccountNumber: string }
  >();
  for (const m of rows) {
    if (m?.id) {
      map.set(String(m.id), {
        id: String(m.id),
        nrp: String(m.nrp || '-'),
        nama: String(m.nama || '-'),
        pangkat: String(m.pangkat || ''),
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
      pangkat: String(mInfo?.pangkat || ''),
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
      safeFetchAllPaged<any>('anggota', 'id, nrp, nama, pangkat'),
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

    const memberMap = new Map<string, { id: string; nrp: string; nama: string; pangkat: string }>();
    for (const m of anggotaRes.data) {
      if (m?.id) {
        memberMap.set(m.id, {
          id: m.id,
          nrp: String(m.nrp || '-'),
          nama: String(m.nama || '-'),
          pangkat: String(m.pangkat || ''),
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
          pangkat: memberInfo?.pangkat || '',
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
  if (catUpper === 'PENJUALAN_TUNAI' || catUpper === 'PENJUALAN_POS' || catUpper === 'PENJUALAN POS') {
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
            ? safeFetchSingleById<any>('anggota', 'id, nrp, nama, pangkat', sale.member_id)
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

        return {
          kind: 'pos_sale',
          journal,
          posSale: {
            saleId: String(sale.id || saleId),
            saleNumber: String(sale.sale_number || `POS-${String(saleId).slice(0, 8).toUpperCase()}`),
            createdAt: String(sale.created_at || journal.createdAt),
            paymentScheme: String(sale.payment_scheme || 'cash'),
            subtotal: Number(sale.subtotal ?? sale.total_amount ?? 0),
            discount: Number(sale.discount ?? 0),
            totalAmount: Number(sale.total_amount ?? 0),
            paidCash: Number(sale.paid_cash ?? 0),
            paidDeposit: Number(sale.paid_deposit ?? 0),
            paidCredit: Number(sale.paid_credit ?? 0),
            member: formatMemberSummary(memberRes.data),
            items,
          },
        };
      }
    }

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
      let member: { nrp: string; nama: string; pangkat?: string | null } | null = null;
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
              'id, nrp, nama, pangkat',
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
            pangkat: String(mInfo?.pangkat || ''),
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
      let nrp = '-';
      let nama = 'Anggota';
      let pangkat: string | null = null;
      let depositTypeName = 'Simpanan Anggota';
      let depositTypeCode = '-';

      if (tx.member_deposit_id) {
        const { data: md } = await safeFetchSingleById<any>(
          'member_deposits',
          'id, member_id, deposit_type_id',
          String(tx.member_deposit_id)
        );
        if (md) {
          const [memberRes, typeRes] = await Promise.all([
            md.member_id
              ? safeFetchSingleById<any>('anggota', 'id, nrp, nama, pangkat', String(md.member_id))
              : Promise.resolve({ data: null, error: null }),
            md.deposit_type_id
              ? safeFetchSingleById<any>('deposit_types', 'id, code, name', String(md.deposit_type_id))
              : Promise.resolve({ data: null, error: null }),
          ]);
          if (memberRes.data) {
            nrp = String(memberRes.data.nrp || '-');
            nama = String(memberRes.data.nama || 'Anggota');
            pangkat = memberRes.data.pangkat ?? null;
          }
          if (typeRes.data) {
            depositTypeName = String(typeRes.data.name || depositTypeName);
            depositTypeCode = String(typeRes.data.code || depositTypeCode);
          }
        }
      }

      const forMonth =
        tx.for_month !== null && tx.for_month !== undefined ? Number(tx.for_month) : null;
      const forYear =
        tx.for_year !== null && tx.for_year !== undefined ? Number(tx.for_year) : null;
      const periodLabel = formatMatrixDepositPeriodLabel(forMonth, forYear);
      const shortPeriodLabel = formatMatrixDepositShortPeriod(forMonth, forYear);
      const txAmount = Math.round(Number(tx.amount ?? journal.amount));

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
          nrp,
          nama,
          pangkat,
          depositTypeCode,
          depositTypeName,
          forMonth,
          forYear,
          periodLabel,
          shortPeriodLabel,
          referenceNo: tx.reference_no ?? null,
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

  // ── Cabang E2: Pencairan Pinjaman ────────────────────────────────────────────
  if (catUpper === 'PENCAIRAN_PINJAMAN' && cashFlowRow.reference_id) {
    const { data: loan } = await safeFetchSingleById<any>(
      'loans',
      'id, member_id, amount, principal_amount, tenor, agreed_tenor_months, status, disbursed_at, created_at',
      cashFlowRow.reference_id
    );

    if (loan) {
      let member: { nrp: string; nama: string; pangkat?: string | null } | null = null;
      if (loan.member_id) {
        const { data: m } = await safeFetchSingleById<any>(
          'anggota',
          'id, nrp, nama, pangkat',
          String(loan.member_id)
        );
        member = formatMemberSummary(m);
      }

      return {
        kind: 'loan_disbursement',
        journal,
        loanDisbursement: {
          loanId: String(loan.id || cashFlowRow.reference_id),
          amount: Math.round(Number(loan.principal_amount ?? loan.amount ?? journal.amount)),
          tenor: Number(loan.agreed_tenor_months ?? loan.tenor ?? 0),
          status: String(loan.status || 'active'),
          disbursedAt: loan.disbursed_at ?? loan.created_at ?? null,
          member,
        },
      };
    }
  }

  // ── Cabang E3: Metadata Jurnal Umum ──────────────────────────────────────────
  return {
    kind: 'journal_only',
    journal,
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
 * Melengkapi deskripsi baris mutasi `cash_flow` berkategori Setoran Simpanan yang
 * kolom `description`-nya masih kosong atau bernilai `'-'` secara batch dari relasi
 * `deposit_transactions` -> `member_deposits` -> `anggota` & `deposit_types`.
 */
export async function enrichDepositCashFlowDescriptions<
  T extends WithdrawalCashFlowRowLike & { kas_masuk?: number }
>(rows: T[]): Promise<T[]> {
  const needsEnrichment = rows.some(
    (r) => isSavingsDepositCategory(r.kategori) && isBlankOrDashDescription(r.deskripsi)
  );
  if (!needsEnrichment) return rows;

  try {
    const targetRows = rows.filter(
      (r) => isSavingsDepositCategory(r.kategori) && isBlankOrDashDescription(r.deskripsi)
    );
    const refIds = Array.from(
      new Set(targetRows.map((r) => r.reference_id).filter((id): id is string => Boolean(id)))
    );
    if (refIds.length === 0) return rows;

    const txRows = await safeFetchByIds<any>(
      'deposit_transactions',
      'id, member_deposit_id, amount, for_month, for_year, reference_no, description',
      refIds,
      'id, member_deposit_id, amount, for_month, for_year, description'
    );
    const txMap = new Map<string, any>();
    for (const tx of txRows) {
      if (tx?.id) txMap.set(String(tx.id), tx);
    }

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

    return rows.map((row) => {
      if (!isSavingsDepositCategory(row.kategori) || !isBlankOrDashDescription(row.deskripsi)) {
        return row;
      }
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

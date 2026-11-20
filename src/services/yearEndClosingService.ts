import { supabase } from '../lib/supabaseClient';
import { calculateRepaymentPortions } from './loanService';
import { normalizeDepositTypeCode } from './savingsRateService';
import { deduplicateClearanceRowsInMemory } from '../utils/clearanceCashFlowFormat';
import { isPosCashSaleCategory } from '../utils/posCashFlowFormat';

export type ShuPayoutMethod = 'CASH_PAYOUT' | 'CREDIT_SAVINGS';

export interface RatShuSettings {
  id?: string;
  fiscal_year: number;
  reserve_fund_pct: number;
  member_shu_pct: number;
  other_fund_pct: number;
  member_business_pct: number;
  member_capital_pct: number;
  payout_method: ShuPayoutMethod;
  target_deposit_type_code: string;
  updated_at?: string;
}

export interface RatSettingsValidationResult {
  valid: boolean;
  errors: string[];
  mainTotal: number;
  memberSubTotal: number;
}

export interface ShuAllocationBreakdown {
  distributableShu: number;
  reserveFundAmount: number;
  otherFundAmount: number;
  memberShuTotal: number;
  jasaUsahaPool: number;
  jasaModalPool: number;
}

export interface MemberContributionInput {
  memberId: string;
  nrp: string;
  nama: string;
  pangkat?: string | null;
  totalSavingsContribution: number;
  totalTransactionContribution: number;
}

export interface MemberShuPreviewRow extends MemberContributionInput {
  jasaModalAmount: number;
  jasaUsahaAmount: number;
  totalShuReceived: number;
  payoutStatus?: string;
}

export interface FiscalYearClosingRecord {
  id: string;
  fiscal_year: number;
  closing_date: string;
  opening_next_year_date: string;
  closing_cash_balance: number;
  closing_loan_receivable: number;
  closing_store_receivable: number;
  closing_member_savings: number;
  net_shu_amount: number;
  reserve_fund_amount: number;
  member_shu_total: number;
  other_fund_amount: number;
  payout_method: ShuPayoutMethod;
  status: 'CLOSED';
  notes?: string | null;
  executed_at: string;
  gross_sales?: number;
  cogs_amount?: number;
  gross_profit_amount?: number;
  goods_financing_margin?: number;
  opex_amount?: number;
  post_shu_cash_balance?: number;
  post_shu_member_savings?: number;
  reserve_fund_pct?: number;
  member_shu_pct?: number;
  other_fund_pct?: number;
  member_business_pct?: number;
  member_capital_pct?: number;
  target_deposit_type_code?: string | null;
}

export interface YearEndClosingPreview {
  fiscalYear: number;
  closingDate: string;
  openingNextYearDate: string;
  isClosed: boolean;
  closingRecord: FiscalYearClosingRecord | null;
  closingCashBalance: number;
  postShuCashBalance: number;
  closingLoanReceivable: number;
  closingStoreReceivable: number;
  closingMemberSavings: number;
  postShuMemberSavings: number;
  grossSales: number;
  cogs: number;
  grossProfit: number;
  goodsFinancingMargin: number;
  opex: number;
  netShuAmount: number;
  reserveFundAmount: number;
  otherFundAmount: number;
  memberShuTotal: number;
  jasaUsahaPool: number;
  jasaModalPool: number;
  totalDistributedToMembers: number;
  totalAllMembersSavings: number;
  totalAllMembersTransactions: number;
  memberRows: MemberShuPreviewRow[];
}

export interface ExecuteYearEndClosingResult {
  closingRecord: FiscalYearClosingRecord;
  distributionsCount: number;
  cashFlowInserted: boolean;
  creditedSavingsCount: number;
  openingMarkerLogged: boolean;
  preview: YearEndClosingPreview;
}

const DEFAULT_DEPOSIT_CODE = 'BELANJA';

export function createDefaultRatSettings(fiscalYear: number): RatShuSettings {
  return {
    fiscal_year: fiscalYear,
    reserve_fund_pct: 40,
    member_shu_pct: 60,
    other_fund_pct: 0,
    member_business_pct: 70,
    member_capital_pct: 30,
    payout_method: 'CASH_PAYOUT',
    target_deposit_type_code: DEFAULT_DEPOSIT_CODE,
  };
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

function isMissingTableOrSchemaErr(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

function isMissingColumnErr(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

function isUniqueViolationErr(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key') || msg.includes('unique');
}

function normalizePayoutMethod(raw?: string | null): ShuPayoutMethod {
  return String(raw || '').toUpperCase() === 'CREDIT_SAVINGS'
    ? 'CREDIT_SAVINGS'
    : 'CASH_PAYOUT';
}

function normalizeRatSettings(raw: Partial<RatShuSettings>, fiscalYear: number): RatShuSettings {
  const defaults = createDefaultRatSettings(fiscalYear);
  return {
    id: raw.id,
    fiscal_year: Number(raw.fiscal_year || fiscalYear),
    reserve_fund_pct:
      raw.reserve_fund_pct !== undefined && raw.reserve_fund_pct !== null
        ? Number(raw.reserve_fund_pct)
        : defaults.reserve_fund_pct,
    member_shu_pct:
      raw.member_shu_pct !== undefined && raw.member_shu_pct !== null
        ? Number(raw.member_shu_pct)
        : defaults.member_shu_pct,
    other_fund_pct:
      raw.other_fund_pct !== undefined && raw.other_fund_pct !== null
        ? Number(raw.other_fund_pct)
        : defaults.other_fund_pct,
    member_business_pct:
      raw.member_business_pct !== undefined && raw.member_business_pct !== null
        ? Number(raw.member_business_pct)
        : defaults.member_business_pct,
    member_capital_pct:
      raw.member_capital_pct !== undefined && raw.member_capital_pct !== null
        ? Number(raw.member_capital_pct)
        : defaults.member_capital_pct,
    payout_method: normalizePayoutMethod(raw.payout_method),
    target_deposit_type_code:
      String(raw.target_deposit_type_code || defaults.target_deposit_type_code).trim() ||
      defaults.target_deposit_type_code,
    updated_at: raw.updated_at,
  };
}

/**
 * Validasi rasio konfigurasi RAT secara ketat sebelum disimpan atau dieksekusi.
 */
export function validateRatSettings(settings: RatShuSettings): RatSettingsValidationResult {
  const errors: string[] = [];
  const fields: Array<{ label: string; value: number }> = [
    { label: 'Cadangan Modal Koperasi', value: Number(settings.reserve_fund_pct) },
    { label: 'Bagian SHU Anggota', value: Number(settings.member_shu_pct) },
    { label: 'Dana Pengurus / Sosial', value: Number(settings.other_fund_pct) },
    { label: 'Jasa Usaha / Transaksi', value: Number(settings.member_business_pct) },
    { label: 'Jasa Modal Simpanan', value: Number(settings.member_capital_pct) },
  ];

  for (const field of fields) {
    if (!Number.isFinite(field.value) || field.value < 0 || field.value > 100) {
      errors.push(`${field.label} harus bernilai antara 0% sampai 100%.`);
    }
  }

  const mainTotal = round2(
    Number(settings.reserve_fund_pct || 0) +
      Number(settings.member_shu_pct || 0) +
      Number(settings.other_fund_pct || 0)
  );
  const memberSubTotal = round2(
    Number(settings.member_business_pct || 0) + Number(settings.member_capital_pct || 0)
  );

  if (Math.abs(mainTotal - 100) > 0.01) {
    errors.push(
      `Total alokasi utama (Cadangan Modal + Bagian Anggota + Dana Lainnya) harus tepat 100% (saat ini ${mainTotal}%).`
    );
  }
  if (Math.abs(memberSubTotal - 100) > 0.01) {
    errors.push(
      `Total sub-rasio anggota (Jasa Usaha + Jasa Modal) harus tepat 100% (saat ini ${memberSubTotal}%).`
    );
  }
  if (settings.payout_method !== 'CASH_PAYOUT' && settings.payout_method !== 'CREDIT_SAVINGS') {
    errors.push('Metode penyaluran SHU anggota tidak valid.');
  }

  return {
    valid: errors.length === 0,
    errors,
    mainTotal,
    memberSubTotal,
  };
}

/**
 * Memecah SHU Bersih menjadi Cadangan Modal, Dana Lainnya, dan Pool SHU Anggota
 * (Jasa Usaha vs Jasa Modal).
 */
export function calculateShuAllocation(
  netShuAmount: number,
  settings: RatShuSettings
): ShuAllocationBreakdown {
  const distributableShu = Math.max(0, Math.round(Number(netShuAmount) || 0));
  const reserveFundAmount = Math.round(
    distributableShu * (Number(settings.reserve_fund_pct || 0) / 100)
  );
  const otherFundAmount = Math.round(
    distributableShu * (Number(settings.other_fund_pct || 0) / 100)
  );
  const memberShuTotal = Math.max(0, distributableShu - reserveFundAmount - otherFundAmount);
  const jasaUsahaPool = Math.round(
    memberShuTotal * (Number(settings.member_business_pct || 0) / 100)
  );
  const jasaModalPool = Math.max(0, memberShuTotal - jasaUsahaPool);

  return {
    distributableShu,
    reserveFundAmount,
    otherFundAmount,
    memberShuTotal,
    jasaUsahaPool,
    jasaModalPool,
  };
}

/**
 * Menghitung hak SHU tiap anggota berdasarkan proporsi Jasa Modal (simpanan)
 * dan Jasa Usaha (belanja POS + realisasi margin pembiayaan barang).
 */
export function distributeMemberShuRows(
  members: MemberContributionInput[],
  jasaModalPool: number,
  jasaUsahaPool: number
): {
  memberRows: MemberShuPreviewRow[];
  totalAllMembersSavings: number;
  totalAllMembersTransactions: number;
  totalDistributedToMembers: number;
} {
  const cleanMembers = members.map((m) => ({
    ...m,
    totalSavingsContribution: Math.max(0, Math.round(Number(m.totalSavingsContribution) || 0)),
    totalTransactionContribution: Math.max(
      0,
      Math.round(Number(m.totalTransactionContribution) || 0)
    ),
  }));

  const totalAllMembersSavings = cleanMembers.reduce(
    (sum, m) => sum + m.totalSavingsContribution,
    0
  );
  const totalAllMembersTransactions = cleanMembers.reduce(
    (sum, m) => sum + m.totalTransactionContribution,
    0
  );

  const memberRows: MemberShuPreviewRow[] = cleanMembers.map((m) => {
    const jasaModalAmount =
      totalAllMembersSavings > 0
        ? Math.round((m.totalSavingsContribution / totalAllMembersSavings) * jasaModalPool)
        : 0;
    const jasaUsahaAmount =
      totalAllMembersTransactions > 0
        ? Math.round(
            (m.totalTransactionContribution / totalAllMembersTransactions) * jasaUsahaPool
          )
        : 0;
    const totalShuReceived = jasaModalAmount + jasaUsahaAmount;
    return {
      ...m,
      jasaModalAmount,
      jasaUsahaAmount,
      totalShuReceived,
    };
  });

  memberRows.sort((a, b) => {
    if (b.totalShuReceived !== a.totalShuReceived) {
      return b.totalShuReceived - a.totalShuReceived;
    }
    return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
  });

  const totalDistributedToMembers = memberRows.reduce((sum, r) => sum + r.totalShuReceived, 0);

  return {
    memberRows,
    totalAllMembersSavings,
    totalAllMembersTransactions,
    totalDistributedToMembers,
  };
}

/**
 * Menghitung ulang pratinjau pembagian SHU & saldo bawaan tahun baru secara real-time di memori
 * saat pengurus mengubah persentase RAT atau metode penyaluran di layar.
 */
export function recalculatePreviewWithSettings(
  preview: YearEndClosingPreview,
  settings: RatShuSettings
): YearEndClosingPreview {
  if (preview.isClosed) {
    return preview;
  }

  const allocation = calculateShuAllocation(preview.netShuAmount, settings);
  const distributed = distributeMemberShuRows(
    preview.memberRows.map((r) => ({
      memberId: r.memberId,
      nrp: r.nrp,
      nama: r.nama,
      pangkat: r.pangkat,
      totalSavingsContribution: r.totalSavingsContribution,
      totalTransactionContribution: r.totalTransactionContribution,
    })),
    allocation.jasaModalPool,
    allocation.jasaUsahaPool
  );

  const postShuCashBalance =
    settings.payout_method === 'CASH_PAYOUT'
      ? preview.closingCashBalance - allocation.memberShuTotal
      : preview.closingCashBalance;
  const postShuMemberSavings =
    settings.payout_method === 'CREDIT_SAVINGS'
      ? preview.closingMemberSavings + distributed.totalDistributedToMembers
      : preview.closingMemberSavings;

  return {
    ...preview,
    postShuCashBalance,
    postShuMemberSavings,
    reserveFundAmount: allocation.reserveFundAmount,
    otherFundAmount: allocation.otherFundAmount,
    memberShuTotal: allocation.memberShuTotal,
    jasaUsahaPool: allocation.jasaUsahaPool,
    jasaModalPool: allocation.jasaModalPool,
    totalDistributedToMembers: distributed.totalDistributedToMembers,
    totalAllMembersSavings: distributed.totalAllMembersSavings,
    totalAllMembersTransactions: distributed.totalAllMembersTransactions,
    memberRows: distributed.memberRows,
  };
}

// ─── Safe Paged Query Helpers ────────────────────────────────────────────────

async function safeFetchPaged<T = any>(
  buildQuery: () => any
): Promise<{ data: T[]; error: any }> {
  try {
    const pageSize = 1000;
    let offset = 0;
    const allRows: T[] = [];

    while (true) {
      const q = buildQuery();
      if (!q) return { data: [], error: null };

      if (typeof q.range === 'function') {
        const res = await q.range(offset, offset + pageSize - 1);
        if (res?.error) return { data: allRows, error: res.error };
        const batch = Array.isArray(res?.data) ? res.data : [];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      } else if (typeof q.then === 'function') {
        const res = await q;
        if (res?.error) return { data: [], error: res.error };
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

// ─── Settings & Closings Queries ─────────────────────────────────────────────

export async function getOrInitYearEndSettings(fiscalYear: number): Promise<RatShuSettings> {
  const defaults = createDefaultRatSettings(fiscalYear);
  try {
    const tableRef: any = supabase?.from?.('rat_shu_settings');
    if (!tableRef || typeof tableRef.select !== 'function') {
      return defaults;
    }

    const q: any = tableRef.select('*');
    let res: any;
    if (q && typeof q.eq === 'function') {
      const eqQ = q.eq('fiscal_year', fiscalYear);
      res =
        typeof eqQ?.maybeSingle === 'function'
          ? await eqQ.maybeSingle()
          : await eqQ;
    } else if (q && typeof q.then === 'function') {
      res = await q;
    } else {
      return defaults;
    }

    if (res?.error) {
      if (!isMissingTableOrSchemaErr(res.error)) {
        console.warn('Gagal memuat rat_shu_settings:', res.error.message);
      }
      return defaults;
    }

    const row = Array.isArray(res?.data)
      ? res.data.find((r: any) => Number(r?.fiscal_year) === fiscalYear)
      : res?.data;

    if (!row) return defaults;
    return normalizeRatSettings(row, fiscalYear);
  } catch {
    return defaults;
  }
}

export async function saveYearEndSettings(settings: RatShuSettings): Promise<RatShuSettings> {
  const validation = validateRatSettings(settings);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const normalized = normalizeRatSettings(settings, settings.fiscal_year);
  const payload = {
    fiscal_year: normalized.fiscal_year,
    reserve_fund_pct: normalized.reserve_fund_pct,
    member_shu_pct: normalized.member_shu_pct,
    other_fund_pct: normalized.other_fund_pct,
    member_business_pct: normalized.member_business_pct,
    member_capital_pct: normalized.member_capital_pct,
    payout_method: normalized.payout_method,
    target_deposit_type_code: normalized.target_deposit_type_code,
    updated_at: new Date().toISOString(),
  };

  const tableRef: any = supabase?.from?.('rat_shu_settings');
  if (!tableRef || typeof tableRef.upsert !== 'function') {
    throw new Error('Klien database tidak mendukung penyimpanan pengaturan RAT.');
  }

  const upQ: any = tableRef.upsert(payload, { onConflict: 'fiscal_year' });
  const res =
    upQ && typeof upQ.select === 'function'
      ? await upQ.select('*').single()
      : await upQ;

  if (res?.error) {
    if (isMissingTableOrSchemaErr(res.error)) {
      throw new Error(
        'Tabel rat_shu_settings belum tersedia di Supabase. Jalankan migrasi 20261120_add_year_end_closing_and_rat_settings.sql terlebih dahulu.'
      );
    }
    throw new Error(`Gagal menyimpan pengaturan RAT: ${res.error.message}`);
  }

  return res?.data ? normalizeRatSettings(res.data, normalized.fiscal_year) : { ...normalized };
}

function mapClosingRecord(row: any): FiscalYearClosingRecord {
  const fiscalYear = Number(row.fiscal_year);
  return {
    id: String(row.id),
    fiscal_year: fiscalYear,
    closing_date: String(row.closing_date || `${fiscalYear}-12-31`),
    opening_next_year_date: String(row.opening_next_year_date || `${fiscalYear + 1}-01-01`),
    closing_cash_balance: Number(row.closing_cash_balance ?? 0),
    closing_loan_receivable: Number(row.closing_loan_receivable ?? 0),
    closing_store_receivable: Number(row.closing_store_receivable ?? 0),
    closing_member_savings: Number(row.closing_member_savings ?? 0),
    net_shu_amount: Number(row.net_shu_amount ?? 0),
    reserve_fund_amount: Number(row.reserve_fund_amount ?? 0),
    member_shu_total: Number(row.member_shu_total ?? 0),
    other_fund_amount: Number(row.other_fund_amount ?? 0),
    payout_method: normalizePayoutMethod(row.payout_method),
    status: 'CLOSED',
    notes: row.notes ?? null,
    executed_at: String(row.executed_at || new Date().toISOString()),
    gross_sales: row.gross_sales !== undefined ? Number(row.gross_sales) : undefined,
    cogs_amount: row.cogs_amount !== undefined ? Number(row.cogs_amount) : undefined,
    gross_profit_amount:
      row.gross_profit_amount !== undefined ? Number(row.gross_profit_amount) : undefined,
    goods_financing_margin:
      row.goods_financing_margin !== undefined ? Number(row.goods_financing_margin) : undefined,
    opex_amount: row.opex_amount !== undefined ? Number(row.opex_amount) : undefined,
    post_shu_cash_balance:
      row.post_shu_cash_balance !== undefined ? Number(row.post_shu_cash_balance) : undefined,
    post_shu_member_savings:
      row.post_shu_member_savings !== undefined ? Number(row.post_shu_member_savings) : undefined,
    reserve_fund_pct:
      row.reserve_fund_pct !== undefined ? Number(row.reserve_fund_pct) : undefined,
    member_shu_pct: row.member_shu_pct !== undefined ? Number(row.member_shu_pct) : undefined,
    other_fund_pct: row.other_fund_pct !== undefined ? Number(row.other_fund_pct) : undefined,
    member_business_pct:
      row.member_business_pct !== undefined ? Number(row.member_business_pct) : undefined,
    member_capital_pct:
      row.member_capital_pct !== undefined ? Number(row.member_capital_pct) : undefined,
    target_deposit_type_code: row.target_deposit_type_code ?? null,
  };
}

export async function getFiscalYearClosing(
  fiscalYear: number
): Promise<FiscalYearClosingRecord | null> {
  try {
    const tableRef: any = supabase?.from?.('fiscal_year_closings');
    if (!tableRef || typeof tableRef.select !== 'function') {
      return null;
    }

    const q: any = tableRef.select('*');
    if (!q || typeof q.eq !== 'function') {
      if (q && typeof q.then === 'function') {
        const res = await q;
        const rows = Array.isArray(res?.data) ? res.data : [];
        const match = rows.find(
          (r: any) => Number(r?.fiscal_year) === fiscalYear && String(r?.status || 'CLOSED') === 'CLOSED'
        );
        return match ? mapClosingRecord(match) : null;
      }
      return null;
    }

    const eqQ = q.eq('fiscal_year', fiscalYear);
    const res =
      typeof eqQ?.maybeSingle === 'function'
        ? await eqQ.maybeSingle()
        : await eqQ;

    if (res?.error) {
      if (!isMissingTableOrSchemaErr(res.error)) {
        console.warn('Gagal memeriksa status tutup buku:', res.error.message);
      }
      return null;
    }

    const row = Array.isArray(res?.data)
      ? res.data.find((r: any) => Number(r?.fiscal_year) === fiscalYear)
      : res?.data;

    if (!row || String(row.status || '').toUpperCase() !== 'CLOSED') {
      return null;
    }

    return mapClosingRecord(row);
  } catch {
    return null;
  }
}

export async function getFiscalYearClosingsHistory(): Promise<FiscalYearClosingRecord[]> {
  try {
    const tableRef: any = supabase?.from?.('fiscal_year_closings');
    if (!tableRef || typeof tableRef.select !== 'function') {
      return [];
    }

    let q: any = tableRef.select('*');
    if (q && typeof q.order === 'function') {
      q = q.order('fiscal_year', { ascending: false });
    }
    const res = await q;
    if (res?.error || !Array.isArray(res?.data)) {
      return [];
    }
    return res.data
      .filter((r: any) => String(r?.status || '').toUpperCase() === 'CLOSED')
      .map(mapClosingRecord)
      .sort((a: FiscalYearClosingRecord, b: FiscalYearClosingRecord) => b.fiscal_year - a.fiscal_year);
  } catch {
    return [];
  }
}

// ─── Closed Snapshot Loader ──────────────────────────────────────────────────

async function buildClosedPreviewFromRecord(
  closing: FiscalYearClosingRecord
): Promise<YearEndClosingPreview> {
  let rawDist: any[] = [];
  try {
    const { data } = await safeFetchPaged<any>(() => {
      const t: any = supabase?.from?.('shu_member_distributions');
      if (!t || typeof t.select !== 'function') return null;
      const q = t.select('*');
      return q && typeof q.eq === 'function' ? q.eq('closing_id', closing.id) : q;
    });
    rawDist = data.filter((d: any) => !d.closing_id || String(d.closing_id) === closing.id);
  } catch {
    rawDist = [];
  }

  const memberIds = Array.from(
    new Set(rawDist.map((d: any) => d?.member_id).filter(Boolean).map(String))
  );
  const memberLookup = new Map<string, { nrp: string; nama: string; pangkat?: string | null }>();
  if (memberIds.length > 0) {
    try {
      const { data: anggotaRows } = await safeFetchPaged<any>(() => {
        const t: any = supabase?.from?.('anggota');
        if (!t || typeof t.select !== 'function') return null;
        const q = t.select('id, nrp, nama, pangkat');
        return q && typeof q.in === 'function' ? q.in('id', memberIds) : q;
      });
      for (const m of anggotaRows) {
        if (m?.id) {
          memberLookup.set(String(m.id), {
            nrp: String(m.nrp || ''),
            nama: String(m.nama || ''),
            pangkat: m.pangkat ?? null,
          });
        }
      }
    } catch {
      // ignore non-blocking lookup failure
    }
  }

  const memberRows: MemberShuPreviewRow[] = rawDist.map((d: any) => {
    const mid = String(d.member_id || '');
    const joined = Array.isArray(d.anggota) ? d.anggota[0] : d.anggota;
    const info = memberLookup.get(mid);
    return {
      memberId: mid,
      nrp: String(joined?.nrp ?? info?.nrp ?? ''),
      nama: String(joined?.nama ?? info?.nama ?? 'Anggota'),
      pangkat: joined?.pangkat ?? info?.pangkat ?? null,
      totalSavingsContribution: Number(d.total_savings_contribution ?? 0),
      totalTransactionContribution: Number(d.total_transaction_contribution ?? 0),
      jasaModalAmount: Number(d.jasa_modal_amount ?? 0),
      jasaUsahaAmount: Number(d.jasa_usaha_amount ?? 0),
      totalShuReceived: Number(d.total_shu_received ?? 0),
      payoutStatus: String(d.payout_status || 'PAID'),
    };
  });

  memberRows.sort((a, b) => {
    if (b.totalShuReceived !== a.totalShuReceived) {
      return b.totalShuReceived - a.totalShuReceived;
    }
    return a.nama.localeCompare(b.nama, 'id');
  });

  const totalAllMembersSavings = memberRows.reduce(
    (s, r) => s + r.totalSavingsContribution,
    0
  );
  const totalAllMembersTransactions = memberRows.reduce(
    (s, r) => s + r.totalTransactionContribution,
    0
  );
  const totalDistributedToMembers = memberRows.reduce((s, r) => s + r.totalShuReceived, 0);
  const jasaModalPool = memberRows.reduce((s, r) => s + r.jasaModalAmount, 0);
  const jasaUsahaPool = memberRows.reduce((s, r) => s + r.jasaUsahaAmount, 0);

  const postShuCashBalance =
    closing.post_shu_cash_balance !== undefined
      ? closing.post_shu_cash_balance
      : closing.payout_method === 'CASH_PAYOUT'
        ? closing.closing_cash_balance - closing.member_shu_total
        : closing.closing_cash_balance;

  const postShuMemberSavings =
    closing.post_shu_member_savings !== undefined
      ? closing.post_shu_member_savings
      : closing.payout_method === 'CREDIT_SAVINGS'
        ? closing.closing_member_savings + totalDistributedToMembers
        : closing.closing_member_savings;

  return {
    fiscalYear: closing.fiscal_year,
    closingDate: closing.closing_date,
    openingNextYearDate: closing.opening_next_year_date,
    isClosed: true,
    closingRecord: closing,
    closingCashBalance: closing.closing_cash_balance,
    postShuCashBalance,
    closingLoanReceivable: closing.closing_loan_receivable,
    closingStoreReceivable: closing.closing_store_receivable,
    closingMemberSavings: closing.closing_member_savings,
    postShuMemberSavings,
    grossSales: Number(closing.gross_sales ?? 0),
    cogs: Number(closing.cogs_amount ?? 0),
    grossProfit: Number(closing.gross_profit_amount ?? 0),
    goodsFinancingMargin: Number(closing.goods_financing_margin ?? 0),
    opex: Number(closing.opex_amount ?? 0),
    netShuAmount: closing.net_shu_amount,
    reserveFundAmount: closing.reserve_fund_amount,
    otherFundAmount: closing.other_fund_amount,
    memberShuTotal: closing.member_shu_total,
    jasaUsahaPool,
    jasaModalPool,
    totalDistributedToMembers,
    totalAllMembersSavings,
    totalAllMembersTransactions,
    memberRows,
  };
}

// ─── Preview Computation ─────────────────────────────────────────────────────

/**
 * Menghitung pratinjau lengkap posisi akun riil akhir tahun (untuk dibawa ke 1 Jan tahun baru),
 * kinerja laba/SHU tahun buku, serta rincian hak SHU tiap anggota aktif.
 */
export async function computeYearEndPreview(
  fiscalYear: number,
  settingsInput?: RatShuSettings
): Promise<YearEndClosingPreview> {
  const existingClosing = await getFiscalYearClosing(fiscalYear);
  if (existingClosing) {
    return buildClosedPreviewFromRecord(existingClosing);
  }

  const settings = settingsInput
    ? normalizeRatSettings(settingsInput, fiscalYear)
    : await getOrInitYearEndSettings(fiscalYear);

  const yearStartDate = `${fiscalYear}-01-01`;
  const yearEndDate = `${fiscalYear}-12-31`;
  const yearStartIso = `${yearStartDate}T00:00:00.000Z`;
  const yearEndIso = `${yearEndDate}T23:59:59.999Z`;

  // 1. Akumulasi Kas Brankas s/d 31 Des {fiscalYear}
  let { data: cfRows, error: cfErr } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('cash_flow');
    if (!t || typeof t.select !== 'function') return null;
    let q = t.select('id, created_at, description, category, direction, amount, reference_id');
    if (q && typeof q.lte === 'function') q = q.lte('created_at', yearEndIso);
    if (q && typeof q.order === 'function') q = q.order('created_at', { ascending: true });
    return q;
  });

  if (cfErr && isMissingColumnErr(cfErr)) {
    const fallbackCf = await safeFetchPaged<any>(() => {
      const t: any = supabase?.from?.('cash_flow');
      if (!t || typeof t.select !== 'function') return null;
      let q = t.select('id, created_at, category, direction, amount, reference_id');
      if (q && typeof q.lte === 'function') q = q.lte('created_at', yearEndIso);
      if (q && typeof q.order === 'function') q = q.order('created_at', { ascending: true });
      return q;
    });
    cfRows = fallbackCf.data;
  }

  const cfRowsUpToYearEnd = deduplicateClearanceRowsInMemory<any>(
    (cfRows || []).filter((r: any) => {
      if (!r?.created_at) return true;
      return String(r.created_at).slice(0, 10) <= yearEndDate;
    })
  );

  let closingCashBalance = cfRowsUpToYearEnd.reduce((acc, row) => {
    const dir = String(row?.direction ?? row?.type ?? '').toLowerCase();
    const amt = Number(row?.amount || 0);
    if (!Number.isFinite(amt)) return acc;
    if (dir === 'in') return acc + amt;
    if (dir === 'out') return acc - amt;
    return acc;
  }, 0);

  // Fetch completed POS sales s/d 31 Des {fiscalYear} (dipakai utk cross-check kas & omzet tahun buku)
  let { data: rawSalesRows, error: salesErr } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('sales');
    if (!t || typeof t.select !== 'function') return null;
    let q = t.select(
      'id, sale_number, member_id, total_amount, paid_cash, paid_deposit, paid_credit, sale_status, created_at'
    );
    if (q && typeof q.lte === 'function') q = q.lte('created_at', yearEndIso);
    return q;
  });

  if (salesErr && isMissingColumnErr(salesErr)) {
    const fallbackSales = await safeFetchPaged<any>(() => {
      const t: any = supabase?.from?.('sales');
      if (!t || typeof t.select !== 'function') return null;
      let q = t.select('id, member_id, total_amount, paid_cash, paid_credit, sale_status, created_at');
      if (q && typeof q.lte === 'function') q = q.lte('created_at', yearEndIso);
      return q;
    });
    rawSalesRows = fallbackSales.data;
  }

  const completedSalesUpToYearEnd = (rawSalesRows || []).filter((s: any) => {
    if (s?.sale_status && String(s.sale_status).toLowerCase() !== 'completed') {
      return false;
    }
    if (s?.created_at && String(s.created_at).slice(0, 10) > yearEndDate) {
      return false;
    }
    return true;
  });

  const posCfRows = cfRowsUpToYearEnd.filter((r: any) => isPosCashSaleCategory(r?.category));
  const hasPosCfWithoutRef = posCfRows.some((r: any) => !r?.reference_id);
  const existingPosRefIds = new Set(
    posCfRows.map((r: any) => r?.reference_id).filter(Boolean).map(String)
  );
  if (!hasPosCfWithoutRef) {
    for (const s of completedSalesUpToYearEnd) {
      const paidCash = Number(s?.paid_cash ?? 0);
      if (Number.isFinite(paidCash) && paidCash > 0 && !existingPosRefIds.has(String(s?.id))) {
        closingCashBalance += paidCash;
      }
    }
  }

  // 2. Sisa Piutang Pinjaman Aktif s/d 31 Des {fiscalYear} & Realisasi Margin Pembiayaan Barang
  let { data: allLoans, error: loansErr } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('loans');
    if (!t || typeof t.select !== 'function') return null;
    return t.select(
      'id, loan_number, member_id, amount, principal_amount, sisa_pinjaman, status, disbursed_at, start_date, created_at, cost_price, markup_amount'
    );
  });

  if (loansErr && isMissingColumnErr(loansErr)) {
    const fallbackLoans = await safeFetchPaged<any>(() => {
      const t: any = supabase?.from?.('loans');
      if (!t || typeof t.select !== 'function') return null;
      return t.select('id, member_id, amount, principal_amount, sisa_pinjaman, status, created_at');
    });
    allLoans = fallbackLoans.data;
  }

  let { data: allRepayments, error: repayErr } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('loan_repayments');
    if (!t || typeof t.select !== 'function') return null;
    return t.select(
      'id, loan_id, schedule_id, amount_paid, principal_portion, margin_portion, payment_date, payment_method'
    );
  });

  if (repayErr && isMissingColumnErr(repayErr)) {
    const fallbackRepay = await safeFetchPaged<any>(() => {
      const t: any = supabase?.from?.('loan_repayments');
      if (!t || typeof t.select !== 'function') return null;
      return t.select('id, loan_id, schedule_id, amount_paid, payment_date, payment_method');
    });
    allRepayments = fallbackRepay.data;
  }

  const loanMap = new Map<string, any>();
  for (const l of allLoans || []) {
    if (l?.id) loanMap.set(String(l.id), l);
  }

  const repaidUpToYearEndByLoan = new Map<string, number>();
  const repaidAfterYearEndByLoan = new Map<string, number>();
  for (const r of allRepayments || []) {
    const method = String(r?.payment_method || '').toUpperCase();
    if (method === 'SALDO_AWAL' || method === 'TOPUP_COMPENSATION') continue;
    const lid = String(r?.loan_id || '');
    if (!lid) continue;
    const amt = Math.max(0, Number(r?.amount_paid || 0));
    const pDate = r?.payment_date ? String(r.payment_date).slice(0, 10) : '';
    if (pDate && /^\d{4}-\d{2}-\d{2}$/.test(pDate) && pDate > yearEndDate) {
      repaidAfterYearEndByLoan.set(lid, (repaidAfterYearEndByLoan.get(lid) || 0) + amt);
    } else {
      repaidUpToYearEndByLoan.set(lid, (repaidUpToYearEndByLoan.get(lid) || 0) + amt);
    }
  }

  let closingLoanReceivable = 0;
  for (const loan of allLoans || []) {
    const st = String(loan?.status || '').toLowerCase();
    if (st !== 'active' && st !== 'approved') continue;
    const effectiveDate = String(
      loan?.disbursed_at || loan?.start_date || loan?.created_at || ''
    ).slice(0, 10);
    if (effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) && effectiveDate > yearEndDate) {
      continue;
    }
    const principal = Math.max(0, Number(loan?.principal_amount ?? loan?.amount ?? 0));
    const lid = String(loan?.id || '');
    if (loan?.sisa_pinjaman !== null && loan?.sisa_pinjaman !== undefined) {
      const currentRem = Math.max(0, Number(loan.sisa_pinjaman));
      const paidAfter = repaidAfterYearEndByLoan.get(lid) || 0;
      closingLoanReceivable += Math.min(principal || currentRem + paidAfter, currentRem + paidAfter);
    } else {
      const paidUpToEnd = repaidUpToYearEndByLoan.get(lid) || 0;
      closingLoanReceivable += Math.max(0, principal - paidUpToEnd);
    }
  }

  // 3. Sisa Piutang Bon Toko s/d 31 Des {fiscalYear}
  const { data: scPayments } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('store_credit_payments');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, sale_id, amount, payment_date, created_at');
  });

  const creditSalesByMember = new Map<string, number>();
  const saleToMember = new Map<string, string>();
  for (const s of completedSalesUpToYearEnd) {
    const credit = Math.max(0, Number(s?.paid_credit ?? 0));
    if (credit <= 0) continue;
    const mKey = s?.member_id ? String(s.member_id) : `sale:${String(s?.id || '')}`;
    creditSalesByMember.set(mKey, (creditSalesByMember.get(mKey) || 0) + credit);
    if (s?.id) saleToMember.set(String(s.id), mKey);
  }

  const paidByMember = new Map<string, number>();
  let unlinkedCreditPayments = 0;
  for (const p of scPayments || []) {
    const pDate = String(p?.payment_date || p?.created_at || '').slice(0, 10);
    if (pDate && /^\d{4}-\d{2}-\d{2}$/.test(pDate) && pDate > yearEndDate) continue;
    const amt = Math.max(0, Number(p?.amount || 0));
    if (amt <= 0) continue;
    const mKey = p?.sale_id ? saleToMember.get(String(p.sale_id)) : undefined;
    if (mKey) {
      paidByMember.set(mKey, (paidByMember.get(mKey) || 0) + amt);
    } else {
      unlinkedCreditPayments += amt;
    }
  }

  let closingStoreReceivable = 0;
  for (const [mKey, creditTotal] of creditSalesByMember.entries()) {
    const paid = paidByMember.get(mKey) || 0;
    closingStoreReceivable += Math.max(0, creditTotal - paid);
  }
  closingStoreReceivable = Math.max(0, closingStoreReceivable - unlinkedCreditPayments);

  // 4. Anggota Aktif & Akumulasi Simpanan Anggota s/d 31 Des {fiscalYear}
  let { data: anggotaRows, error: anggotaErr } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('anggota');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, nrp, nama, pangkat, status, membership_status');
  });

  if (anggotaErr && isMissingColumnErr(anggotaErr)) {
    const fallbackAnggota = await safeFetchPaged<any>(() => {
      const t: any = supabase?.from?.('anggota');
      if (!t || typeof t.select !== 'function') return null;
      return t.select('id, nrp, nama, pangkat, status');
    });
    anggotaRows = fallbackAnggota.data;
  }

  const activeMembers = (anggotaRows || []).filter((m: any) => {
    const st = String(m?.status || 'aktif').toLowerCase();
    const mst = String(m?.membership_status || 'ACTIVE').toUpperCase();
    return st === 'aktif' && mst === 'ACTIVE';
  });
  const activeMemberIds = new Set(activeMembers.map((m: any) => String(m.id)));

  let { data: memberDeposits, error: mdErr } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('member_deposits');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, member_id, deposit_type_id, balance');
  });

  if (mdErr && isMissingColumnErr(mdErr)) {
    const fallbackMd = await safeFetchPaged<any>(() => {
      const t: any = supabase?.from?.('member_deposits');
      if (!t || typeof t.select !== 'function') return null;
      return t.select('id, member_id, deposit_type_id');
    });
    memberDeposits = fallbackMd.data;
  }

  const { data: depositTxs } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('deposit_transactions');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, member_deposit_id, transaction_type, amount, for_year, created_at');
  });

  const mdHasAnyTx = new Set<string>();
  const mdNetById = new Map<string, number>();

  for (const tx of depositTxs || []) {
    const mdId = String(tx?.member_deposit_id || '');
    if (!mdId) continue;
    mdHasAnyTx.add(mdId);

    const txDate = tx?.created_at ? String(tx.created_at).slice(0, 10) : '';
    if (txDate && /^\d{4}-\d{2}-\d{2}$/.test(txDate)) {
      if (txDate > yearEndDate) continue;
    } else if (tx?.for_year !== null && tx?.for_year !== undefined) {
      if (Number(tx.for_year) > fiscalYear) continue;
    }

    const amt = Math.max(0, Number(tx?.amount || 0));
    const txType = String(tx?.transaction_type || 'deposit').toLowerCase();
    const signed = txType === 'withdrawal' || txType === 'termination' ? -amt : amt;
    mdNetById.set(mdId, (mdNetById.get(mdId) || 0) + signed);
  }

  const memberSavingsMap = new Map<string, number>();
  for (const md of memberDeposits || []) {
    const mId = String(md?.member_id || '');
    if (!activeMemberIds.has(mId)) continue;
    const mdId = String(md?.id || '');
    const rawBalance = mdHasAnyTx.has(mdId)
      ? mdNetById.get(mdId) || 0
      : Math.max(0, Number(md?.balance || 0));
    const cleanBalance = Math.max(0, Math.round(rawBalance));
    memberSavingsMap.set(mId, (memberSavingsMap.get(mId) || 0) + cleanBalance);
  }

  let closingMemberSavings = 0;
  for (const val of memberSavingsMap.values()) {
    closingMemberSavings += val;
  }

  // 5. Kinerja Usaha & Net SHU Tahun Buku (1 Jan - 31 Des {fiscalYear})
  const salesInYear = completedSalesUpToYearEnd.filter((s: any) => {
    if (!s?.created_at) return true;
    const d = String(s.created_at).slice(0, 10);
    return !/^\d{4}-\d{2}-\d{2}$/.test(d) || (d >= yearStartDate && d <= yearEndDate);
  });

  const grossSales = salesInYear.reduce(
    (sum: number, s: any) => sum + Number(s?.total_amount ?? 0),
    0
  );
  const memberPosSalesMap = new Map<string, number>();
  for (const s of salesInYear) {
    if (s?.member_id) {
      const mId = String(s.member_id);
      memberPosSalesMap.set(
        mId,
        (memberPosSalesMap.get(mId) || 0) + Math.max(0, Number(s?.total_amount ?? 0))
      );
    }
  }

  let cogs = 0;
  const yearSaleIds = salesInYear.map((s: any) => s?.id).filter(Boolean).map(String);
  if (yearSaleIds.length > 0) {
    const yearSaleIdSet = new Set(yearSaleIds);
    let { data: saleItems, error: siErr } = await safeFetchPaged<any>(() => {
      const t: any = supabase?.from?.('sale_items');
      if (!t || typeof t.select !== 'function') return null;
      const q = t.select('sale_id, product_id, quantity, qty, unit_price, price');
      return q && typeof q.in === 'function' ? q.in('sale_id', yearSaleIds) : q;
    });
    if (siErr && isMissingColumnErr(siErr)) {
      const fbSi = await safeFetchPaged<any>(() => {
        const t: any = supabase?.from?.('sale_items');
        if (!t || typeof t.select !== 'function') return null;
        const q = t.select('sale_id, product_id, quantity');
        return q && typeof q.in === 'function' ? q.in('sale_id', yearSaleIds) : q;
      });
      saleItems = fbSi.data;
    }

    const filteredItems = (saleItems || []).filter(
      (si: any) => !si?.sale_id || yearSaleIdSet.has(String(si.sale_id))
    );
    const productIds = Array.from(
      new Set(filteredItems.map((si: any) => si?.product_id).filter(Boolean).map(String))
    );
    const buyPriceMap = new Map<string, number>();
    if (productIds.length > 0) {
      const { data: prodRows } = await safeFetchPaged<any>(() => {
        const t: any = supabase?.from?.('products');
        if (!t || typeof t.select !== 'function') return null;
        const q = t.select('id, buy_price');
        return q && typeof q.in === 'function' ? q.in('id', productIds) : q;
      });
      for (const p of prodRows || []) {
        if (p?.id) buyPriceMap.set(String(p.id), Number(p.buy_price ?? 0));
      }
    }

    for (const si of filteredItems) {
      const qty = Number(si?.quantity ?? si?.qty ?? 0);
      const buyPrice = si?.product_id
        ? buyPriceMap.get(String(si.product_id)) ?? Number(si?.buy_price ?? 0)
        : Number(si?.buy_price ?? 0);
      cogs += qty * buyPrice;
    }
  }

  // Realisasi Margin Pembiayaan Barang pada tahun {fiscalYear}
  const repaymentsInYear = (allRepayments || []).filter((r: any) => {
    const method = String(r?.payment_method || '').toUpperCase();
    if (method === 'SALDO_AWAL' || method === 'TOPUP_COMPENSATION') return false;
    if (Number(r?.amount_paid || 0) <= 0) return false;
    const pDate = r?.payment_date ? String(r.payment_date).slice(0, 10) : '';
    if (pDate && /^\d{4}-\d{2}-\d{2}$/.test(pDate)) {
      return pDate >= yearStartDate && pDate <= yearEndDate;
    }
    return true;
  });

  const missingMarginSchedIds = Array.from(
    new Set(
      repaymentsInYear
        .filter((r: any) => Number(r?.margin_portion || 0) <= 0 && r?.schedule_id)
        .map((r: any) => String(r.schedule_id))
    )
  );
  const scheduleLookup = new Map<string, any>();
  if (missingMarginSchedIds.length > 0) {
    const { data: schedRows } = await safeFetchPaged<any>(() => {
      const t: any = supabase?.from?.('loan_schedules');
      if (!t || typeof t.select !== 'function') return null;
      const q = t.select('id, target_amount, principal_portion, margin_portion');
      return q && typeof q.in === 'function' ? q.in('id', missingMarginSchedIds) : q;
    });
    for (const s of schedRows || []) {
      if (s?.id) scheduleLookup.set(String(s.id), s);
    }
  }

  let goodsFinancingMargin = 0;
  const memberMarginMap = new Map<string, number>();
  for (const r of repaymentsInYear) {
    const loan = r?.loan_id ? loanMap.get(String(r.loan_id)) : null;
    const sched = r?.schedule_id ? scheduleLookup.get(String(r.schedule_id)) : null;
    const explicitMargin = Math.round(Number(r?.margin_portion || 0));

    let marginPortion = 0;
    if (explicitMargin > 0) {
      marginPortion = explicitMargin;
    } else {
      const portions = calculateRepaymentPortions({
        amountPaid: Number(r?.amount_paid || 0),
        targetAmount: Number(sched?.target_amount || r?.amount_paid || 0),
        schedulePrincipalPortion: sched?.principal_portion,
        scheduleMarginPortion: sched?.margin_portion,
        loanCostPrice: loan?.cost_price,
        loanMarkupAmount: loan?.markup_amount,
        loanTotalAmount: loan?.principal_amount ?? loan?.amount,
      });
      marginPortion = portions.marginPortion;
    }

    if (marginPortion > 0) {
      goodsFinancingMargin += marginPortion;
      if (loan?.member_id) {
        const mId = String(loan.member_id);
        memberMarginMap.set(mId, (memberMarginMap.get(mId) || 0) + marginPortion);
      }
    }
  }

  // Beban Operasional pada tahun {fiscalYear}
  const opex = cfRowsUpToYearEnd
    .filter((r: any) => {
      const dir = String(r?.direction ?? r?.type ?? '').toLowerCase();
      const cat = String(r?.category || '');
      if (dir !== 'out' || cat !== 'beban_operasional') return false;
      const d = r?.created_at ? String(r.created_at).slice(0, 10) : '';
      return !/^\d{4}-\d{2}-\d{2}$/.test(d) || (d >= yearStartDate && d <= yearEndDate);
    })
    .reduce((sum: number, r: any) => sum + Math.max(0, Number(r?.amount || 0)), 0);

  const grossProfit = grossSales - cogs;
  const netShuAmount = grossProfit + goodsFinancingMargin - opex;

  // 6. Rincian Hak SHU per Anggota Aktif
  const memberInputs: MemberContributionInput[] = activeMembers.map((m: any) => {
    const mId = String(m.id);
    return {
      memberId: mId,
      nrp: String(m.nrp || ''),
      nama: String(m.nama || ''),
      pangkat: m.pangkat ?? null,
      totalSavingsContribution: memberSavingsMap.get(mId) || 0,
      totalTransactionContribution:
        (memberPosSalesMap.get(mId) || 0) + (memberMarginMap.get(mId) || 0),
    };
  });

  const basePreview: YearEndClosingPreview = {
    fiscalYear,
    closingDate: yearEndDate,
    openingNextYearDate: `${fiscalYear + 1}-01-01`,
    isClosed: false,
    closingRecord: null,
    closingCashBalance: Math.round(closingCashBalance),
    postShuCashBalance: Math.round(closingCashBalance),
    closingLoanReceivable: Math.round(closingLoanReceivable),
    closingStoreReceivable: Math.round(closingStoreReceivable),
    closingMemberSavings: Math.round(closingMemberSavings),
    postShuMemberSavings: Math.round(closingMemberSavings),
    grossSales: Math.round(grossSales),
    cogs: Math.round(cogs),
    grossProfit: Math.round(grossProfit),
    goodsFinancingMargin: Math.round(goodsFinancingMargin),
    opex: Math.round(opex),
    netShuAmount: Math.round(netShuAmount),
    reserveFundAmount: 0,
    otherFundAmount: 0,
    memberShuTotal: 0,
    jasaUsahaPool: 0,
    jasaModalPool: 0,
    totalDistributedToMembers: 0,
    totalAllMembersSavings: 0,
    totalAllMembersTransactions: 0,
    memberRows: memberInputs.map((m) => ({
      ...m,
      jasaModalAmount: 0,
      jasaUsahaAmount: 0,
      totalShuReceived: 0,
    })),
  };

  // Pastikan yearStartIso tercatat konsisten untuk audit boundary
  void yearStartIso;

  return recalculatePreviewWithSettings(basePreview, settings);
}

// ─── 1-Click Atomic Year-End Execution ───────────────────────────────────────

async function resolveTargetDepositType(targetCode: string): Promise<{ id: string; code: string; name: string }> {
  const { data: dTypes, error } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('deposit_types');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, code, name, can_be_withdrawn, is_active');
  });

  if (error) {
    throw new Error(`Gagal memuat jenis simpanan tujuan kredit SHU: ${error.message}`);
  }

  const normalizedTarget = normalizeDepositTypeCode(targetCode || DEFAULT_DEPOSIT_CODE);
  const activeTypes = (dTypes || []).filter((dt: any) => dt?.is_active !== false);

  const exactMatch = activeTypes.find(
    (dt: any) =>
      normalizeDepositTypeCode(dt.code || dt.name) === normalizedTarget ||
      String(dt.code || '').toUpperCase() === String(targetCode || '').toUpperCase()
  );
  if (exactMatch) {
    return {
      id: String(exactMatch.id),
      code: String(exactMatch.code || normalizedTarget),
      name: String(exactMatch.name || normalizedTarget),
    };
  }

  const withdrawableFallback = activeTypes.find((dt: any) => dt.can_be_withdrawn);
  if (withdrawableFallback) {
    return {
      id: String(withdrawableFallback.id),
      code: String(withdrawableFallback.code || DEFAULT_DEPOSIT_CODE),
      name: String(withdrawableFallback.name || 'Simpanan Belanja'),
    };
  }

  throw new Error(
    `Jenis simpanan tujuan "${targetCode || DEFAULT_DEPOSIT_CODE}" tidak ditemukan pada master deposit_types.`
  );
}

async function creditShuToMemberSavings(
  fiscalYear: number,
  targetDepositCode: string,
  memberRows: MemberShuPreviewRow[]
): Promise<number> {
  const eligibleRows = memberRows.filter((r) => r.totalShuReceived > 0);
  if (eligibleRows.length === 0) return 0;

  const targetType = await resolveTargetDepositType(targetDepositCode);
  const memberIds = eligibleRows.map((r) => r.memberId);

  const { data: existingMds } = await safeFetchPaged<any>(() => {
    const t: any = supabase?.from?.('member_deposits');
    if (!t || typeof t.select !== 'function') return null;
    let q = t.select('id, member_id, deposit_type_id, balance');
    if (q && typeof q.eq === 'function') q = q.eq('deposit_type_id', targetType.id);
    if (q && typeof q.in === 'function') q = q.in('member_id', memberIds);
    return q;
  });

  const mdByMemberId = new Map<string, { id: string; balance: number }>();
  for (const md of existingMds || []) {
    if (
      md?.member_id &&
      (!md.deposit_type_id || String(md.deposit_type_id) === targetType.id)
    ) {
      mdByMemberId.set(String(md.member_id), {
        id: String(md.id),
        balance: Number(md.balance || 0),
      });
    }
  }

  const missingMembers = eligibleRows.filter((r) => !mdByMemberId.has(r.memberId));
  if (missingMembers.length > 0) {
    const mdTable: any = supabase.from('member_deposits');
    const newMdPayload = missingMembers.map((r) => ({
      member_id: r.memberId,
      deposit_type_id: targetType.id,
    }));
    const insMd = await mdTable.insert(newMdPayload).select('id, member_id, balance');
    if (insMd?.error) {
      throw new Error(
        `Gagal menyiapkan rekening ${targetType.name} anggota untuk kredit SHU: ${insMd.error.message}`
      );
    }
    for (const created of insMd?.data || []) {
      if (created?.member_id) {
        mdByMemberId.set(String(created.member_id), {
          id: String(created.id),
          balance: Number(created.balance || 0),
        });
      }
    }
  }

  const closingTimestamp = `${fiscalYear}-12-31T23:59:00.000Z`;
  const txPayloads = eligibleRows
    .map((r) => {
      const md = mdByMemberId.get(r.memberId);
      if (!md) return null;
      return {
        member_deposit_id: md.id,
        transaction_type: 'deposit',
        amount: r.totalShuReceived,
        for_year: fiscalYear,
        for_month: 12,
        reference_no: `SHU-RAT-${fiscalYear}-${r.nrp || r.memberId.slice(0, 6)}`,
        payment_method: 'kredit_shu_rat',
        description: `Pembagian SHU RAT Tahun Buku ${fiscalYear} — ${targetType.name} (Jasa Modal + Jasa Usaha)`,
        created_at: closingTimestamp,
      };
    })
    .filter(Boolean);

  const dtTable: any = supabase.from('deposit_transactions');
  for (let i = 0; i < txPayloads.length; i += 100) {
    const chunk = txPayloads.slice(i, i + 100);
    let insTx = await dtTable.insert(chunk);
    if (insTx?.error && isMissingColumnErr(insTx.error)) {
      const fallbackChunk = chunk.map((item: any) => ({
        member_deposit_id: item.member_deposit_id,
        transaction_type: item.transaction_type,
        amount: item.amount,
        for_year: item.for_year,
        for_month: item.for_month,
        description: item.description,
        created_at: item.created_at,
      }));
      insTx = await dtTable.insert(fallbackChunk);
    }
    if (insTx?.error) {
      throw new Error(`Gagal mengkreditkan SHU ke simpanan anggota: ${insTx.error.message}`);
    }
  }

  // Non-blocking sync untuk kolom cache member_deposits.balance jika tersedia
  for (const r of eligibleRows) {
    const md = mdByMemberId.get(r.memberId);
    if (!md) continue;
    try {
      const mdTbl: any = supabase.from('member_deposits');
      if (mdTbl && typeof mdTbl.update === 'function') {
        await mdTbl
          .update({ balance: md.balance + r.totalShuReceived })
          .eq('id', md.id);
      }
    } catch {
      // Abaikan jika kolom balance tidak dipakai
    }
  }

  return txPayloads.length;
}

/**
 * Mengeksekusi Tutup Buku Akhir Tahun & Pembagian SHU RAT dalam 1 klik:
 * - Memvalidasi & menyimpan pengaturan RAT
 * - Mengunci tahun buku pada fiscal_year_closings (idempoten, anti eksekusi ganda)
 * - Menyimpan rincian SHU per anggota pada shu_member_distributions
 * - Mencatat jurnal kas keluar PEMBAGIAN_SHU_RAT atau kredit simpanan anggota
 * - Mencatat penanda pembukaan tahun buku baru OPENING_BALANCE_NEW_YEAR per 1 Januari
 */
export async function executeYearEndClosing(
  fiscalYear: number,
  settingsInput: RatShuSettings,
  notes?: string
): Promise<ExecuteYearEndClosingResult> {
  const settings = normalizeRatSettings(settingsInput, fiscalYear);
  const validation = validateRatSettings(settings);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const alreadyClosed = await getFiscalYearClosing(fiscalYear);
  if (alreadyClosed) {
    throw new Error(
      `Tahun buku ${fiscalYear} sudah berstatus CLOSED (terkunci) dan tidak dapat dieksekusi ulang.`
    );
  }

  const savedSettings = await saveYearEndSettings(settings);
  const preview = await computeYearEndPreview(fiscalYear, savedSettings);
  if (preview.isClosed) {
    throw new Error(
      `Tahun buku ${fiscalYear} sudah berstatus CLOSED (terkunci) dan tidak dapat dieksekusi ulang.`
    );
  }

  const cleanNotes = notes?.trim() || null;
  const fullClosingPayload = {
    fiscal_year: fiscalYear,
    closing_date: preview.closingDate,
    opening_next_year_date: preview.openingNextYearDate,
    closing_cash_balance: preview.closingCashBalance,
    closing_loan_receivable: preview.closingLoanReceivable,
    closing_store_receivable: preview.closingStoreReceivable,
    closing_member_savings: preview.closingMemberSavings,
    net_shu_amount: preview.netShuAmount,
    reserve_fund_amount: preview.reserveFundAmount,
    member_shu_total: preview.memberShuTotal,
    other_fund_amount: preview.otherFundAmount,
    payout_method: savedSettings.payout_method,
    status: 'CLOSED',
    notes: cleanNotes,
    gross_sales: preview.grossSales,
    cogs_amount: preview.cogs,
    gross_profit_amount: preview.grossProfit,
    goods_financing_margin: preview.goodsFinancingMargin,
    opex_amount: preview.opex,
    post_shu_cash_balance: preview.postShuCashBalance,
    post_shu_member_savings: preview.postShuMemberSavings,
    reserve_fund_pct: savedSettings.reserve_fund_pct,
    member_shu_pct: savedSettings.member_shu_pct,
    other_fund_pct: savedSettings.other_fund_pct,
    member_business_pct: savedSettings.member_business_pct,
    member_capital_pct: savedSettings.member_capital_pct,
    target_deposit_type_code: savedSettings.target_deposit_type_code,
  };

  const closingsTable: any = supabase.from('fiscal_year_closings');
  let insClosing = await closingsTable.insert(fullClosingPayload).select('*').single();

  if (insClosing?.error && isMissingColumnErr(insClosing.error)) {
    const corePayload = {
      fiscal_year: fiscalYear,
      closing_date: preview.closingDate,
      opening_next_year_date: preview.openingNextYearDate,
      closing_cash_balance: preview.closingCashBalance,
      closing_loan_receivable: preview.closingLoanReceivable,
      closing_store_receivable: preview.closingStoreReceivable,
      closing_member_savings: preview.closingMemberSavings,
      net_shu_amount: preview.netShuAmount,
      reserve_fund_amount: preview.reserveFundAmount,
      member_shu_total: preview.memberShuTotal,
      other_fund_amount: preview.otherFundAmount,
      payout_method: savedSettings.payout_method,
      status: 'CLOSED',
      notes: cleanNotes,
    };
    insClosing = await closingsTable.insert(corePayload).select('*').single();
  }

  if (insClosing?.error) {
    if (isUniqueViolationErr(insClosing.error)) {
      throw new Error(
        `Tahun buku ${fiscalYear} sudah berstatus CLOSED (terkunci) dan tidak dapat dieksekusi ulang.`
      );
    }
    if (isMissingTableOrSchemaErr(insClosing.error)) {
      throw new Error(
        'Tabel fiscal_year_closings belum tersedia di Supabase. Jalankan migrasi 20261120_add_year_end_closing_and_rat_settings.sql terlebih dahulu.'
      );
    }
    throw new Error(`Gagal mengunci tutup buku tahun ${fiscalYear}: ${insClosing.error.message}`);
  }

  const closingRecord = mapClosingRecord({
    ...fullClosingPayload,
    ...insClosing.data,
  });

  // Simpan distribusi per anggota
  const distPayloads = preview.memberRows.map((row) => ({
    closing_id: closingRecord.id,
    fiscal_year: fiscalYear,
    member_id: row.memberId,
    total_savings_contribution: row.totalSavingsContribution,
    total_transaction_contribution: row.totalTransactionContribution,
    jasa_modal_amount: row.jasaModalAmount,
    jasa_usaha_amount: row.jasaUsahaAmount,
    total_shu_received: row.totalShuReceived,
    payout_status: 'PAID',
  }));

  if (distPayloads.length > 0) {
    const distTable: any = supabase.from('shu_member_distributions');
    for (let i = 0; i < distPayloads.length; i += 100) {
      const chunk = distPayloads.slice(i, i + 100);
      const insDist = await distTable.insert(chunk);
      if (insDist?.error) {
        throw new Error(`Gagal menyimpan rincian distribusi SHU anggota: ${insDist.error.message}`);
      }
    }
  }

  let cashFlowInserted = false;
  let creditedSavingsCount = 0;

  if (preview.memberShuTotal > 0) {
    if (savedSettings.payout_method === 'CASH_PAYOUT') {
      const cfTable: any = supabase.from('cash_flow');
      const cfPayload = {
        direction: 'out',
        category: 'PEMBAGIAN_SHU_RAT',
        amount: preview.memberShuTotal,
        reference_id: closingRecord.id,
        description: `Pembagian SHU Anggota RAT Tahun Buku ${fiscalYear}`,
        created_at: `${fiscalYear}-12-31T23:59:00.000Z`,
      };
      let cfRes = await cfTable.insert(cfPayload);
      if (cfRes?.error && isMissingColumnErr(cfRes.error)) {
        const { description: _desc, ...cfFallback } = cfPayload;
        cfRes = await cfTable.insert(cfFallback);
      }
      if (cfRes?.error) {
        throw new Error(`Gagal mencatat kas keluar Pembagian SHU RAT: ${cfRes.error.message}`);
      }
      cashFlowInserted = true;
    } else {
      creditedSavingsCount = await creditShuToMemberSavings(
        fiscalYear,
        savedSettings.target_deposit_type_code,
        preview.memberRows
      );
    }
  }

  // Penanda pembukaan saldo awal tahun buku baru per 1 Januari tanpa mengotori arus kas
  let openingMarkerLogged = false;
  try {
    const auditTable: any = supabase?.from?.('audit_logs');
    if (auditTable && typeof auditTable.insert === 'function') {
      const auditRes = await auditTable.insert({
        table_name: 'fiscal_year_closings',
        action: 'OPENING_BALANCE_NEW_YEAR',
        record_id: closingRecord.id,
        entity_name: 'fiscal_year_closings',
        entity_id: closingRecord.id,
        new_data: {
          opening_date: preview.openingNextYearDate,
          from_fiscal_year: fiscalYear,
          to_fiscal_year: fiscalYear + 1,
          opening_cash_balance: preview.postShuCashBalance,
          opening_loan_receivable: preview.closingLoanReceivable,
          opening_store_receivable: preview.closingStoreReceivable,
          opening_member_savings: preview.postShuMemberSavings,
          opening_shu_amount: 0,
          payout_method: savedSettings.payout_method,
        },
        notes: `Pembukaan Saldo Awal Tahun Buku ${fiscalYear + 1} per 1 Januari ${fiscalYear + 1} hasil Tutup Buku ${fiscalYear}`,
        created_at: `${fiscalYear + 1}-01-01T00:00:00.000Z`,
      });
      if (!auditRes?.error) {
        openingMarkerLogged = true;
      }
    }
  } catch {
    // Non-blocking audit marker
  }

  return {
    closingRecord,
    distributionsCount: distPayloads.length,
    cashFlowInserted,
    creditedSavingsCount,
    openingMarkerLogged,
    preview: {
      ...preview,
      isClosed: true,
      closingRecord,
      memberRows: preview.memberRows.map((r) => ({ ...r, payoutStatus: 'PAID' })),
    },
  };
}

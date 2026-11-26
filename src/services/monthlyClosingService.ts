import { supabase } from '../lib/supabaseClient';
import { fetchAllPaginatedSafe } from '../utils/supabasePagination';
import { deduplicateClearanceRowsInMemory } from '../utils/clearanceCashFlowFormat';
import { isPosCashSaleCategory } from '../utils/posCashFlowFormat';
import { normalizeDepositTypeCode } from './savingsRateService';
import { calculateRepaymentPortions } from './loanService';
import { insertAuditLog } from './auditService';

export interface MonthlyClosingSnapshot {
  fiscalYear: number;
  periodMonth: number;
  cutoffDate: string;
  openingCashBalance: number;
  monthlyCashIn: number;
  monthlyCashOut: number;
  closingCashBalance: number;
  totalSavingsBalance: number;
  savingsPokok: number;
  savingsWajib: number;
  savingsBelanja: number;
  savingsLebaran: number;
  activeLoanCount: number;
  totalLoanReceivable: number;
  totalStoreCreditReceivable: number;
  inventoryValuation: number;
  monthlyRevenue: number;
  monthlyCogs: number;
  monthlyGrossProfit: number;
  monthlyFinancingMargin: number;
  monthlyOpnameImpact: number;
  monthlyOpex: number;
  monthlyNetShu: number;
  ytdRevenue: number;
  ytdCogs: number;
  ytdGrossProfit: number;
  ytdFinancingMargin: number;
  ytdOpnameImpact: number;
  ytdOpex: number;
  ytdNetShu: number;
}

export interface MonthlyClosingRecord {
  id: string;
  fiscal_year: number;
  period_month: number;
  cutoff_date: string;
  opening_cash_balance: number;
  monthly_cash_in: number;
  monthly_cash_out: number;
  closing_cash_balance: number;
  total_savings_balance: number;
  savings_pokok: number;
  savings_wajib: number;
  savings_belanja: number;
  savings_lebaran: number;
  active_loan_count: number;
  total_loan_receivable: number;
  total_store_credit_receivable: number;
  inventory_valuation: number;
  monthly_revenue: number;
  monthly_cogs: number;
  monthly_financing_margin: number;
  monthly_opex: number;
  monthly_net_shu: number;
  ytd_net_shu: number;
  minutes_number: string | null;
  meeting_date: string | null;
  attendees: string | null;
  evaluation_notes: string | null;
  approved_by: string | null;
  approved_at: string;
  updated_at: string;
}

export interface SaveMonthlyClosingPayload {
  snapshot: MonthlyClosingSnapshot;
  minutesNumber?: string;
  meetingDate?: string;
  attendees?: string;
  evaluationNotes?: string;
}

export const MONTH_NAMES_ID = [
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

export function getMonthNameId(month: number): string {
  return MONTH_NAMES_ID[month - 1] ?? `Bulan ${month}`;
}

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

async function fetchInChunks<T = any>(
  tableName: string,
  selectColumns: string,
  filterColumn: string,
  ids: string[],
  chunkSize = 500
): Promise<{ data: T[]; error: any }> {
  if (ids.length === 0) return { data: [], error: null };
  const all: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const res = await fetchAllPaginatedSafe<T>(() => {
      const t: any = supabase?.from?.(tableName);
      if (!t || typeof t.select !== 'function') return null;
      const q = t.select(selectColumns);
      return q && typeof q.in === 'function' ? q.in(filterColumn, chunk) : q;
    });
    if (res.error) return { data: all, error: res.error };
    all.push(...res.data);
  }
  return { data: all, error: null };
}

function extractDatePart(raw?: string | null): string {
  if (!raw) return '';
  const slice = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : '';
}

function mapMonthlyClosingRow(row: any): MonthlyClosingRecord {
  return {
    id: String(row.id),
    fiscal_year: Number(row.fiscal_year),
    period_month: Number(row.period_month),
    cutoff_date: String(row.cutoff_date || ''),
    opening_cash_balance: Number(row.opening_cash_balance ?? 0),
    monthly_cash_in: Number(row.monthly_cash_in ?? 0),
    monthly_cash_out: Number(row.monthly_cash_out ?? 0),
    closing_cash_balance: Number(row.closing_cash_balance ?? 0),
    total_savings_balance: Number(row.total_savings_balance ?? 0),
    savings_pokok: Number(row.savings_pokok ?? 0),
    savings_wajib: Number(row.savings_wajib ?? 0),
    savings_belanja: Number(row.savings_belanja ?? 0),
    savings_lebaran: Number(row.savings_lebaran ?? 0),
    active_loan_count: Number(row.active_loan_count ?? 0),
    total_loan_receivable: Number(row.total_loan_receivable ?? 0),
    total_store_credit_receivable: Number(row.total_store_credit_receivable ?? 0),
    inventory_valuation: Number(row.inventory_valuation ?? 0),
    monthly_revenue: Number(row.monthly_revenue ?? 0),
    monthly_cogs: Number(row.monthly_cogs ?? 0),
    monthly_financing_margin: Number(row.monthly_financing_margin ?? 0),
    monthly_opex: Number(row.monthly_opex ?? 0),
    monthly_net_shu: Number(row.monthly_net_shu ?? 0),
    ytd_net_shu: Number(row.ytd_net_shu ?? 0),
    minutes_number: row.minutes_number ?? null,
    meeting_date: row.meeting_date ?? null,
    attendees: row.attendees ?? null,
    evaluation_notes: row.evaluation_notes ?? null,
    approved_by: row.approved_by ?? null,
    approved_at: String(row.approved_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

/**
 * Menghitung snapshot neraca akhir bulan, arus kas bulanan, kewajiban simpanan,
 * piutang pinjaman & bon toko, valuasi persediaan, serta SHU bulan terpilih vs YTD.
 */
export async function calculateMonthlySnapshot(
  year: number,
  month: number
): Promise<MonthlyClosingSnapshot> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Tahun buku tidak valid.');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Bulan periode harus antara 1 sampai 12.');
  }

  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const monthStartDate = `${year}-${mm}-01`;
  const monthEndDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  const yearStartDate = `${year}-01-01`;

  const monthStartIso = `${monthStartDate}T00:00:00.000Z`;
  const monthEndIso = `${monthEndDate}T23:59:59.999Z`;
  const yearStartIso = `${yearStartDate}T00:00:00.000Z`;

  // 1. Arus Kas s/d Akhir Bulan (opening < monthStart, bulan ini [monthStart..monthEnd])
  let { data: cfRows, error: cfErr } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('cash_flow');
    if (!t || typeof t.select !== 'function') return null;
    let q = t.select('id, created_at, description, category, direction, amount, reference_id');
    if (q && typeof q.lte === 'function') q = q.lte('created_at', monthEndIso);
    if (q && typeof q.order === 'function') q = q.order('created_at', { ascending: true });
    return q;
  });

  if (cfErr && isMissingColumnErr(cfErr)) {
    const fbCf = await fetchAllPaginatedSafe<any>(() => {
      const t: any = supabase?.from?.('cash_flow');
      if (!t || typeof t.select !== 'function') return null;
      let q = t.select('id, created_at, category, direction, amount, reference_id');
      if (q && typeof q.lte === 'function') q = q.lte('created_at', monthEndIso);
      if (q && typeof q.order === 'function') q = q.order('created_at', { ascending: true });
      return q;
    });
    cfRows = fbCf.data;
  }

  const cfUpToMonthEnd = deduplicateClearanceRowsInMemory<any>(
    (cfRows || []).filter((r: any) => {
      const d = extractDatePart(r?.created_at);
      return !d || d <= monthEndDate;
    })
  );

  // Completed POS sales s/d akhir bulan
  let { data: rawSalesRows, error: salesErr } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('sales');
    if (!t || typeof t.select !== 'function') return null;
    let q = t.select(
      'id, sale_number, member_id, total_amount, paid_cash, paid_deposit, paid_credit, sale_status, created_at'
    );
    if (q && typeof q.lte === 'function') q = q.lte('created_at', monthEndIso);
    return q;
  });

  if (salesErr && isMissingColumnErr(salesErr)) {
    const fbSales = await fetchAllPaginatedSafe<any>(() => {
      const t: any = supabase?.from?.('sales');
      if (!t || typeof t.select !== 'function') return null;
      let q = t.select('id, member_id, total_amount, paid_cash, paid_credit, sale_status, created_at');
      if (q && typeof q.lte === 'function') q = q.lte('created_at', monthEndIso);
      return q;
    });
    rawSalesRows = fbSales.data;
  }

  const completedSalesUpToMonthEnd = (rawSalesRows || []).filter((s: any) => {
    if (s?.sale_status && String(s.sale_status).toLowerCase() !== 'completed') {
      return false;
    }
    const d = extractDatePart(s?.created_at);
    return !d || d <= monthEndDate;
  });

  let openingCashBalance = 0;
  let monthlyCashIn = 0;
  let monthlyCashOut = 0;

  for (const row of cfUpToMonthEnd) {
    const dir = String(row?.direction ?? row?.type ?? '').toLowerCase();
    const amt = Number(row?.amount || 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const d = extractDatePart(row?.created_at);
    const isPrior = d !== '' && d < monthStartDate;

    if (isPrior) {
      if (dir === 'in') openingCashBalance += amt;
      else if (dir === 'out') openingCashBalance -= amt;
    } else {
      if (dir === 'in') monthlyCashIn += amt;
      else if (dir === 'out') monthlyCashOut += amt;
    }
  }

  // Cross-check unlinked POS cash sales (konsisten dengan laporan-keuangan & yearEndClosingService)
  const posCfRows = cfUpToMonthEnd.filter((r: any) => isPosCashSaleCategory(r?.category));
  const hasPosCfWithoutRef = posCfRows.some((r: any) => !r?.reference_id);
  const existingPosRefIds = new Set(
    posCfRows.map((r: any) => r?.reference_id).filter(Boolean).map(String)
  );
  if (!hasPosCfWithoutRef) {
    for (const s of completedSalesUpToMonthEnd) {
      const paidCash = Number(s?.paid_cash ?? 0);
      if (!Number.isFinite(paidCash) || paidCash <= 0 || existingPosRefIds.has(String(s?.id))) {
        continue;
      }
      const d = extractDatePart(s?.created_at);
      if (d !== '' && d < monthStartDate) {
        openingCashBalance += paidCash;
      } else {
        monthlyCashIn += paidCash;
      }
    }
  }

  const closingCashBalance = openingCashBalance + monthlyCashIn - monthlyCashOut;

  // 2. Kewajiban Simpanan Anggota Aktif s/d Akhir Bulan (P/W/B/L)
  let { data: anggotaRows, error: anggotaErr } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('anggota');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, status, membership_status');
  });

  if (anggotaErr && isMissingColumnErr(anggotaErr)) {
    const fbAnggota = await fetchAllPaginatedSafe<any>(() => {
      const t: any = supabase?.from?.('anggota');
      if (!t || typeof t.select !== 'function') return null;
      return t.select('id, status');
    });
    anggotaRows = fbAnggota.data;
  }

  const activeMemberIds = new Set(
    (anggotaRows || [])
      .filter((m: any) => {
        const st = String(m?.status || 'aktif').toLowerCase();
        const mst = String(m?.membership_status || 'ACTIVE').toUpperCase();
        return st === 'aktif' && mst === 'ACTIVE';
      })
      .map((m: any) => String(m.id))
  );

  const { data: depositTypes } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('deposit_types');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, code, name');
  });

  const depositTypeCodeById = new Map<string, string>();
  for (const dt of depositTypes || []) {
    if (dt?.id) {
      depositTypeCodeById.set(
        String(dt.id),
        normalizeDepositTypeCode(dt.code || dt.name)
      );
    }
  }

  let { data: memberDeposits, error: mdErr } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('member_deposits');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, member_id, deposit_type_id, balance');
  });

  if (mdErr && isMissingColumnErr(mdErr)) {
    const fbMd = await fetchAllPaginatedSafe<any>(() => {
      const t: any = supabase?.from?.('member_deposits');
      if (!t || typeof t.select !== 'function') return null;
      return t.select('id, member_id, deposit_type_id');
    });
    memberDeposits = fbMd.data;
  }

  const { data: depositTxs } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('deposit_transactions');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, member_deposit_id, transaction_type, amount, for_year, for_month, created_at');
  });

  const mdHasAnyTx = new Set<string>();
  const mdNetById = new Map<string, number>();

  for (const tx of depositTxs || []) {
    const mdId = String(tx?.member_deposit_id || '');
    if (!mdId) continue;
    mdHasAnyTx.add(mdId);

    const txDate = extractDatePart(tx?.created_at);
    if (txDate) {
      if (txDate > monthEndDate) continue;
    } else if (tx?.for_year !== null && tx?.for_year !== undefined) {
      const fy = Number(tx.for_year);
      const fm = Number(tx.for_month ?? 12);
      if (fy > year || (fy === year && fm > month)) continue;
    }

    const amt = Math.max(0, Number(tx?.amount || 0));
    const txType = String(tx?.transaction_type || 'deposit').toLowerCase();
    const signed = txType === 'withdrawal' || txType === 'termination' ? -amt : amt;
    mdNetById.set(mdId, (mdNetById.get(mdId) || 0) + signed);
  }

  let savingsPokok = 0;
  let savingsWajib = 0;
  let savingsBelanja = 0;
  let savingsLebaran = 0;
  let totalSavingsBalance = 0;

  for (const md of memberDeposits || []) {
    const mId = String(md?.member_id || '');
    if (!activeMemberIds.has(mId)) continue;

    const mdId = String(md?.id || '');
    const rawBalance = mdHasAnyTx.has(mdId)
      ? mdNetById.get(mdId) || 0
      : Math.max(0, Number(md?.balance || 0));
    const cleanBalance = Math.max(0, Math.round(rawBalance));
    totalSavingsBalance += cleanBalance;

    const code = depositTypeCodeById.get(String(md?.deposit_type_id || '')) || '';
    if (code === 'POKOK') savingsPokok += cleanBalance;
    else if (code === 'WAJIB') savingsWajib += cleanBalance;
    else if (code === 'BELANJA') savingsBelanja += cleanBalance;
    else if (code === 'LEBARAN') savingsLebaran += cleanBalance;
  }

  // 3. Piutang Pinjaman Aktif s/d Akhir Bulan
  let { data: allLoans, error: loansErr } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('loans');
    if (!t || typeof t.select !== 'function') return null;
    return t.select(
      'id, member_id, amount, principal_amount, sisa_pinjaman, status, disbursed_at, start_date, created_at, cost_price, markup_amount'
    );
  });

  if (loansErr && isMissingColumnErr(loansErr)) {
    const fbLoans = await fetchAllPaginatedSafe<any>(() => {
      const t: any = supabase?.from?.('loans');
      if (!t || typeof t.select !== 'function') return null;
      return t.select('id, member_id, amount, principal_amount, sisa_pinjaman, status, created_at');
    });
    allLoans = fbLoans.data;
  }

  let { data: allRepayments, error: repayErr } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('loan_repayments');
    if (!t || typeof t.select !== 'function') return null;
    return t.select(
      'id, loan_id, schedule_id, amount_paid, principal_portion, margin_portion, payment_date, payment_method'
    );
  });

  if (repayErr && isMissingColumnErr(repayErr)) {
    const fbRepay = await fetchAllPaginatedSafe<any>(() => {
      const t: any = supabase?.from?.('loan_repayments');
      if (!t || typeof t.select !== 'function') return null;
      return t.select('id, loan_id, schedule_id, amount_paid, payment_date, payment_method');
    });
    allRepayments = fbRepay.data;
  }

  const loanMap = new Map<string, any>();
  for (const l of allLoans || []) {
    if (l?.id) loanMap.set(String(l.id), l);
  }

  const repaidUpToMonthEndByLoan = new Map<string, number>();
  const repaidAfterMonthEndByLoan = new Map<string, number>();
  for (const r of allRepayments || []) {
    const method = String(r?.payment_method || '').toUpperCase();
    if (method === 'SALDO_AWAL' || method === 'TOPUP_COMPENSATION') continue;
    const lid = String(r?.loan_id || '');
    if (!lid) continue;
    const amt = Math.max(0, Number(r?.amount_paid || 0));
    const pDate = extractDatePart(r?.payment_date);
    if (pDate && pDate > monthEndDate) {
      repaidAfterMonthEndByLoan.set(lid, (repaidAfterMonthEndByLoan.get(lid) || 0) + amt);
    } else {
      repaidUpToMonthEndByLoan.set(lid, (repaidUpToMonthEndByLoan.get(lid) || 0) + amt);
    }
  }

  let activeLoanCount = 0;
  let totalLoanReceivable = 0;
  for (const loan of allLoans || []) {
    const st = String(loan?.status || '').toLowerCase();
    if (st !== 'active' && st !== 'approved') continue;
    const effectiveDate = extractDatePart(
      loan?.disbursed_at || loan?.start_date || loan?.created_at
    );
    if (effectiveDate && effectiveDate > monthEndDate) continue;

    const principal = Math.max(0, Number(loan?.principal_amount ?? loan?.amount ?? 0));
    const lid = String(loan?.id || '');
    let remaining = 0;
    if (loan?.sisa_pinjaman !== null && loan?.sisa_pinjaman !== undefined) {
      const currentRem = Math.max(0, Number(loan.sisa_pinjaman));
      const paidAfter = repaidAfterMonthEndByLoan.get(lid) || 0;
      remaining = Math.min(principal || currentRem + paidAfter, currentRem + paidAfter);
    } else {
      const paidUpToEnd = repaidUpToMonthEndByLoan.get(lid) || 0;
      remaining = Math.max(0, principal - paidUpToEnd);
    }

    if (remaining > 0) {
      activeLoanCount += 1;
      totalLoanReceivable += remaining;
    }
  }

  // 4. Sisa Piutang Bon Toko s/d Akhir Bulan
  const { data: scPayments } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('store_credit_payments');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, sale_id, amount, payment_date, created_at');
  });

  const creditSalesByMember = new Map<string, number>();
  const saleToMember = new Map<string, string>();
  for (const s of completedSalesUpToMonthEnd) {
    const credit = Math.max(0, Number(s?.paid_credit ?? 0));
    if (credit <= 0) continue;
    const mKey = s?.member_id ? String(s.member_id) : `sale:${String(s?.id || '')}`;
    creditSalesByMember.set(mKey, (creditSalesByMember.get(mKey) || 0) + credit);
    if (s?.id) saleToMember.set(String(s.id), mKey);
  }

  const paidByMember = new Map<string, number>();
  let unlinkedCreditPayments = 0;
  for (const p of scPayments || []) {
    const pDate = extractDatePart(p?.payment_date || p?.created_at);
    if (pDate && pDate > monthEndDate) continue;
    const amt = Math.max(0, Number(p?.amount || 0));
    if (amt <= 0) continue;
    const mKey = p?.sale_id ? saleToMember.get(String(p.sale_id)) : undefined;
    if (mKey) {
      paidByMember.set(mKey, (paidByMember.get(mKey) || 0) + amt);
    } else {
      unlinkedCreditPayments += amt;
    }
  }

  let totalStoreCreditReceivable = 0;
  for (const [mKey, creditTotal] of creditSalesByMember.entries()) {
    const paid = paidByMember.get(mKey) || 0;
    totalStoreCreditReceivable += Math.max(0, creditTotal - paid);
  }
  totalStoreCreditReceivable = Math.max(0, totalStoreCreditReceivable - unlinkedCreditPayments);

  // 5. Valuasi Persediaan Barang Gudang (SUM(Math.max(0, stock) * buy_price) produk aktif)
  let { data: allProducts, error: prodErr } = await fetchAllPaginatedSafe<any>(() => {
    const t: any = supabase?.from?.('products');
    if (!t || typeof t.select !== 'function') return null;
    return t.select('id, buy_price, stock, is_active');
  });

  if (prodErr && isMissingColumnErr(prodErr)) {
    const fbProd = await fetchAllPaginatedSafe<any>(() => {
      const t: any = supabase?.from?.('products');
      if (!t || typeof t.select !== 'function') return null;
      return t.select('id, buy_price, stock');
    });
    allProducts = fbProd.data;
  }

  const buyPriceMap = new Map<string, number>();
  let inventoryValuation = 0;
  for (const p of allProducts || []) {
    if (p?.id) {
      buyPriceMap.set(String(p.id), Math.max(0, Number(p.buy_price ?? 0)));
    }
    if (p?.is_active === false) continue;
    const stock = Math.max(0, Number(p?.stock ?? 0));
    const buyPrice = Math.max(0, Number(p?.buy_price ?? 0));
    inventoryValuation += stock * buyPrice;
  }

  // 6. Kinerja Usaha & SHU Bulan Terpilih vs Year-to-Date (1 Jan s/d Akhir Bulan)
  const salesYtd = completedSalesUpToMonthEnd.filter((s: any) => {
    const d = extractDatePart(s?.created_at);
    return !d || (d >= yearStartDate && d <= monthEndDate);
  });

  const ytdSaleIds = salesYtd.map((s: any) => s?.id).filter(Boolean).map(String);
  const monthlySaleIds = new Set(
    salesYtd
      .filter((s: any) => {
        const d = extractDatePart(s?.created_at);
        return !d || (d >= monthStartDate && d <= monthEndDate);
      })
      .map((s: any) => String(s?.id))
  );

  let monthlyRevenue = 0;
  let ytdRevenue = 0;
  for (const s of salesYtd) {
    const amt = Number(s?.total_amount ?? 0);
    ytdRevenue += amt;
    const d = extractDatePart(s?.created_at);
    if (!d || (d >= monthStartDate && d <= monthEndDate)) {
      monthlyRevenue += amt;
    }
  }

  let monthlyCogs = 0;
  let ytdCogs = 0;
  if (ytdSaleIds.length > 0) {
    const ytdSaleIdSet = new Set(ytdSaleIds);
    let { data: saleItems, error: siErr } = await fetchInChunks<any>(
      'sale_items',
      'sale_id, product_id, quantity, qty',
      'sale_id',
      ytdSaleIds
    );
    if (siErr && isMissingColumnErr(siErr)) {
      const fbSi = await fetchInChunks<any>(
        'sale_items',
        'sale_id, product_id, quantity',
        'sale_id',
        ytdSaleIds
      );
      saleItems = fbSi.data;
    }

    const filteredItems = (saleItems || []).filter(
      (si: any) => !si?.sale_id || ytdSaleIdSet.has(String(si.sale_id))
    );

    const missingProdIds = Array.from(
      new Set(
        filteredItems
          .map((si: any) => (si?.product_id ? String(si.product_id) : ''))
          .filter((pid: string) => pid && !buyPriceMap.has(pid))
      )
    );
    if (missingProdIds.length > 0) {
      const { data: extraProds } = await fetchInChunks<any>(
        'products',
        'id, buy_price',
        'id',
        missingProdIds
      );
      for (const p of extraProds) {
        if (p?.id) buyPriceMap.set(String(p.id), Math.max(0, Number(p.buy_price ?? 0)));
      }
    }

    for (const si of filteredItems) {
      const qty = Number(si?.quantity ?? si?.qty ?? 0);
      const buyPrice = si?.product_id
        ? buyPriceMap.get(String(si.product_id)) ?? Number(si?.buy_price ?? 0)
        : Number(si?.buy_price ?? 0);
      const itemCost = qty * buyPrice;
      ytdCogs += itemCost;
      if (si?.sale_id && monthlySaleIds.has(String(si.sale_id))) {
        monthlyCogs += itemCost;
      }
    }
  }

  // Realisasi Margin Pembiayaan Barang YTD & Bulan Terpilih
  const repaymentsYtd = (allRepayments || []).filter((r: any) => {
    const method = String(r?.payment_method || '').toUpperCase();
    if (method === 'SALDO_AWAL' || method === 'TOPUP_COMPENSATION') return false;
    if (Number(r?.amount_paid || 0) <= 0) return false;
    const pDate = extractDatePart(r?.payment_date);
    return !pDate || (pDate >= yearStartDate && pDate <= monthEndDate);
  });

  const missingMarginSchedIds = Array.from(
    new Set(
      repaymentsYtd
        .filter((r: any) => Number(r?.margin_portion || 0) <= 0 && r?.schedule_id)
        .map((r: any) => String(r.schedule_id))
    )
  );
  const scheduleLookup = new Map<string, any>();
  if (missingMarginSchedIds.length > 0) {
    const { data: schedRows } = await fetchInChunks<any>(
      'loan_schedules',
      'id, target_amount, principal_portion, margin_portion',
      'id',
      missingMarginSchedIds
    );
    for (const s of schedRows) {
      if (s?.id) scheduleLookup.set(String(s.id), s);
    }
  }

  let monthlyFinancingMargin = 0;
  let ytdFinancingMargin = 0;
  for (const r of repaymentsYtd) {
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
      ytdFinancingMargin += marginPortion;
      const pDate = extractDatePart(r?.payment_date);
      if (!pDate || (pDate >= monthStartDate && pDate <= monthEndDate)) {
        monthlyFinancingMargin += marginPortion;
      }
    }
  }

  // Koreksi Stock Opname YTD & Bulan Terpilih (Surplus / Susut Nilai HPP)
  let monthlyOpnameImpact = 0;
  let ytdOpnameImpact = 0;
  try {
    const opnameRes = await fetchAllPaginatedSafe<any>(() => {
      const t: any = supabase?.from?.('stock_opname_adjustments');
      if (!t || typeof t.select !== 'function') return null;
      let q = t.select('id, qty_in, qty_out, unit_cost, created_at');
      if (q && typeof q.gte === 'function') q = q.gte('created_at', yearStartIso);
      if (q && typeof q.lte === 'function') q = q.lte('created_at', monthEndIso);
      return q;
    });

    if (!opnameRes.error) {
      for (const adj of opnameRes.data || []) {
        const d = extractDatePart(adj?.created_at);
        if (d && (d < yearStartDate || d > monthEndDate)) continue;
        const qtyIn = Number(adj?.qty_in || 0);
        const qtyOut = Number(adj?.qty_out || 0);
        const unitCost = Number(adj?.unit_cost || 0);
        const netVal = (qtyIn - qtyOut) * unitCost;
        ytdOpnameImpact += netVal;
        if (!d || (d >= monthStartDate && d <= monthEndDate)) {
          monthlyOpnameImpact += netVal;
        }
      }
    }
  } catch {
    // Abaikan jika tabel stock_opname_adjustments belum tersedia
  }

  // Beban Operasional YTD & Bulan Terpilih
  let monthlyOpex = 0;
  let ytdOpex = 0;
  for (const r of cfUpToMonthEnd) {
    const dir = String(r?.direction ?? r?.type ?? '').toLowerCase();
    const cat = String(r?.category || '');
    if (dir !== 'out' || cat !== 'beban_operasional') continue;
    const d = extractDatePart(r?.created_at);
    if (d && (d < yearStartDate || d > monthEndDate)) continue;
    const amt = Math.max(0, Number(r?.amount || 0));
    ytdOpex += amt;
    if (!d || (d >= monthStartDate && d <= monthEndDate)) {
      monthlyOpex += amt;
    }
  }

  const monthlyGrossProfit = monthlyRevenue - monthlyCogs;
  const ytdGrossProfit = ytdRevenue - ytdCogs;
  const monthlyNetShu =
    monthlyGrossProfit + monthlyFinancingMargin + monthlyOpnameImpact - monthlyOpex;
  const ytdNetShu =
    ytdGrossProfit + ytdFinancingMargin + ytdOpnameImpact - ytdOpex;

  return {
    fiscalYear: year,
    periodMonth: month,
    cutoffDate: monthEndDate,
    openingCashBalance: Math.round(openingCashBalance),
    monthlyCashIn: Math.round(monthlyCashIn),
    monthlyCashOut: Math.round(monthlyCashOut),
    closingCashBalance: Math.round(closingCashBalance),
    totalSavingsBalance: Math.round(totalSavingsBalance),
    savingsPokok: Math.round(savingsPokok),
    savingsWajib: Math.round(savingsWajib),
    savingsBelanja: Math.round(savingsBelanja),
    savingsLebaran: Math.round(savingsLebaran),
    activeLoanCount,
    totalLoanReceivable: Math.round(totalLoanReceivable),
    totalStoreCreditReceivable: Math.round(totalStoreCreditReceivable),
    inventoryValuation: Math.round(inventoryValuation),
    monthlyRevenue: Math.round(monthlyRevenue),
    monthlyCogs: Math.round(monthlyCogs),
    monthlyGrossProfit: Math.round(monthlyGrossProfit),
    monthlyFinancingMargin: Math.round(monthlyFinancingMargin),
    monthlyOpnameImpact: Math.round(monthlyOpnameImpact),
    monthlyOpex: Math.round(monthlyOpex),
    monthlyNetShu: Math.round(monthlyNetShu),
    ytdRevenue: Math.round(ytdRevenue),
    ytdCogs: Math.round(ytdCogs),
    ytdGrossProfit: Math.round(ytdGrossProfit),
    ytdFinancingMargin: Math.round(ytdFinancingMargin),
    ytdOpnameImpact: Math.round(ytdOpnameImpact),
    ytdOpex: Math.round(ytdOpex),
    ytdNetShu: Math.round(ytdNetShu),
  };
}

/**
 * Menyimpan atau memperbarui arsip rekap bulanan & notulensi rapat pengurus (Soft Archive)
 * pada tabel public.monthly_closings serta mencatat audit log.
 */
export async function saveMonthlyClosing(
  payload: SaveMonthlyClosingPayload
): Promise<MonthlyClosingRecord> {
  const { snapshot } = payload;
  let userId: string | null = null;
  try {
    const authRes = await supabase?.auth?.getUser?.();
    userId = authRes?.data?.user?.id ?? null;
  } catch {
    userId = null;
  }

  const nowIso = new Date().toISOString();
  const upsertRow = {
    fiscal_year: snapshot.fiscalYear,
    period_month: snapshot.periodMonth,
    cutoff_date: snapshot.cutoffDate,
    opening_cash_balance: snapshot.openingCashBalance,
    monthly_cash_in: snapshot.monthlyCashIn,
    monthly_cash_out: snapshot.monthlyCashOut,
    closing_cash_balance: snapshot.closingCashBalance,
    total_savings_balance: snapshot.totalSavingsBalance,
    savings_pokok: snapshot.savingsPokok,
    savings_wajib: snapshot.savingsWajib,
    savings_belanja: snapshot.savingsBelanja,
    savings_lebaran: snapshot.savingsLebaran,
    active_loan_count: snapshot.activeLoanCount,
    total_loan_receivable: snapshot.totalLoanReceivable,
    total_store_credit_receivable: snapshot.totalStoreCreditReceivable,
    inventory_valuation: snapshot.inventoryValuation,
    monthly_revenue: snapshot.monthlyRevenue,
    monthly_cogs: snapshot.monthlyCogs,
    monthly_financing_margin: snapshot.monthlyFinancingMargin,
    monthly_opex: snapshot.monthlyOpex,
    monthly_net_shu: snapshot.monthlyNetShu,
    ytd_net_shu: snapshot.ytdNetShu,
    minutes_number: payload.minutesNumber?.trim() || null,
    meeting_date: payload.meetingDate?.trim() || null,
    attendees: payload.attendees?.trim() || null,
    evaluation_notes: payload.evaluationNotes?.trim() || null,
    approved_by: userId,
    approved_at: nowIso,
    updated_at: nowIso,
  };

  const tableRef: any = supabase?.from?.('monthly_closings');
  if (!tableRef || typeof tableRef.upsert !== 'function') {
    throw new Error('Klien database tidak mendukung penyimpanan arsip rekap bulanan.');
  }

  const upQ: any = tableRef.upsert(upsertRow, {
    onConflict: 'fiscal_year,period_month',
  });
  const res =
    upQ && typeof upQ.select === 'function'
      ? await upQ.select('*').single()
      : await upQ;

  if (res?.error) {
    if (isMissingTableOrSchemaErr(res.error)) {
      throw new Error(
        'Tabel monthly_closings belum tersedia di Supabase. Jalankan migrasi 037_create_monthly_closings.sql terlebih dahulu.'
      );
    }
    throw new Error(`Gagal menyimpan rekap akhir bulan: ${res.error.message}`);
  }

  const saved = res?.data
    ? mapMonthlyClosingRow(res.data)
    : mapMonthlyClosingRow({ id: `${snapshot.fiscalYear}-${snapshot.periodMonth}`, ...upsertRow });

  try {
    await insertAuditLog({
      table_name: 'monthly_closings',
      action: 'MONTHLY_CLOSING_ARCHIVE',
      record_id: saved.id,
      new_data: saved,
      performed_by: userId,
      notes: `Pengesahan Rekap Akhir Bulan ${getMonthNameId(snapshot.periodMonth)} ${snapshot.fiscalYear}${
        saved.minutes_number ? ` (BA: ${saved.minutes_number})` : ''
      }`,
    });
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log rekap bulanan:', auditErr);
  }

  return saved;
}

/**
 * Mengambil seluruh arsip rekap bulanan pada tahun buku terpilih (diurutkan Januari–Desember).
 */
export async function getMonthlyClosingsByYear(
  year: number
): Promise<MonthlyClosingRecord[]> {
  try {
    const res = await fetchAllPaginatedSafe<any>(() => {
      const t: any = supabase?.from?.('monthly_closings');
      if (!t || typeof t.select !== 'function') return null;
      let q = t.select('*');
      if (q && typeof q.eq === 'function') q = q.eq('fiscal_year', year);
      if (q && typeof q.order === 'function') q = q.order('period_month', { ascending: true });
      return q;
    });

    if (res.error) {
      if (!isMissingTableOrSchemaErr(res.error)) {
        console.warn('Gagal memuat arsip monthly_closings:', res.error.message);
      }
      return [];
    }

    return (res.data || [])
      .filter((r: any) => Number(r?.fiscal_year) === year)
      .map(mapMonthlyClosingRow)
      .sort((a, b) => a.period_month - b.period_month);
  } catch {
    return [];
  }
}

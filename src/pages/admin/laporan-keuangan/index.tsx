import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useInRouterContext, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Filter, Receipt, RotateCcw, Search, ShieldAlert, X } from 'lucide-react';
import AdminLayout from '../../../components/layout/AdminLayout';
import CashFlowReferenceModal from '../../../components/finance/CashFlowReferenceModal';
import ShuReferenceDetailModal, {
  type ShuReferenceRow,
  type ShuReferenceLineItem,
  type ShuSourceType,
} from '../../../components/finance/ShuReferenceDetailModal';
import { supabase } from '../../../lib/supabaseClient';
import { useFeedback } from '../../../context/FeedbackContext';
import {
  syncOpeningSavingsBalanceToCashFlow,
} from '../../../services/cashFlowService';
import {
  consolidateBulkLebaranCashFlow,
  enrichDepositCashFlowDescriptions,
  enrichMemberClearanceCashFlowDescriptions,
  enrichMemberDepositCashFlowDescriptions,
  enrichPosCashFlowDescriptions,
  enrichStoreCreditCashFlowDescriptions,
  enrichWithdrawalCashFlowDescriptions,
  syncApprovedLoansToCashFlow,
  syncMatrixDepositsToCashFlow,
  syncPosCashSalesToCashFlow,
  syncResignedMemberClearanceToCashFlow,
} from '../../../services/cashFlowAuditService';
import {
  formatPosCashFlowDescription,
  isPosCashSaleCategory,
} from '../../../utils/posCashFlowFormat';
import { parseMemberDepositDescriptionComponents } from '../../../utils/depositCashFlowFormat';
import { deduplicateClearanceRowsInMemory } from '../../../utils/clearanceCashFlowFormat';
import {
  getOutstandingStoreCreditSummary,
  syncStoreCreditPaymentsToCashFlow,
  type OutstandingStoreCreditSummary,
} from '../../../services/storeCreditLedgerService';
import { calculateRepaymentPortions } from '../../../services/loanService';
import {
  getFiscalYearClosing,
  type FiscalYearClosingRecord,
} from '../../../services/yearEndClosingService';
import {
  scanAllOrphanRecords,
  ORPHAN_AUDIT_UPDATED_EVENT,
  filterRedundantLegacySaldoAwalRepayments,
} from '../../../services/orphanAuditService';
import { fetchAllPaginatedSafe } from '../../../utils/supabasePagination';

// ─── TypeScript Interfaces ───────────────────────────────────────────────────

export interface CashFlowTransaction {
  id: string;
  tanggal: string;
  referensi: string;
  deskripsi: string;
  kategori: string;
  unit_usaha: string;
  kas_masuk: number;
  kas_keluar: number;
  saldo_berjalan: number;
  reference_id?: string | null;
  direction?: 'in' | 'out';
  created_at?: string;
}

export interface CashFlowData {
  openingBalance?: number;
  inflowTotal: number;
  outflowTotal: number;
  netCashflow: number;
  closingBalance?: number;
  transactions: CashFlowTransaction[];
}

export interface MarginKategori {
  kategori: string;
  omzet: number;
  hpp: number;
  laba_kotor: number;
  gross_margin_pct: number;
}

export type { ShuReferenceRow, ShuReferenceLineItem, ShuSourceType };

export type ShuSourceFilterMode = 'default_shu_and_paid_off' | 'profit_only' | 'all';

export function filterShuRowsBySource(
  rows: ShuReferenceRow[],
  filterMode: ShuSourceFilterMode
): ShuReferenceRow[] {
  if (filterMode === 'all') return rows;
  if (filterMode === 'profit_only') {
    return rows.filter(
      (row) => Number(row.omzet || 0) > 0 || Number(row.grossProfit || 0) > 0
    );
  }
  // 'default_shu_and_paid_off': POS + Margin Pembiayaan (omzet/profit > 0) + Stock Opname + Pinjaman Lunas Penuh
  return rows.filter(
    (row) =>
      row.sourceType.startsWith('pos_') ||
      row.sourceType === 'stock_opname' ||
      Number(row.omzet || 0) > 0 ||
      Number(row.grossProfit || 0) > 0 ||
      row.isPaidOff === true
  );
}

export interface ShuEstimationData {
  grossSales: number;
  cogs: number;
  grossProfit: number;
  goodsFinancingMargin: number;
  opnameShrinkageLoss?: number;
  opnameSurplusGain?: number;
  opnameNetImpact?: number;
  opex: number;
  estimatedShu: number;
  marginPercentage: number;
  marginPerKategori: MarginKategori[];
  shuReferenceRows?: ShuReferenceRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatRp = (n: number): string =>
  'Rp ' + Math.round(n).toLocaleString('id-ID');

export function buildStartDateBoundaryIso(startDate: string): string {
  const trimmed = String(startDate || '').trim();
  if (!trimmed) return '';
  return trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00.000Z`;
}

export function formatDateDdMmYyyy(dateStr: string): string {
  const match = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(dateStr || '');
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function resolveJumpPage(
  rawInput: string,
  currentPage: number,
  totalPages: number
): number {
  const safeTotal = Math.max(1, totalPages);
  const safeCurrent = Math.min(Math.max(1, currentPage), safeTotal);
  const parsed = parseInt(String(rawInput).trim(), 10);
  if (Number.isNaN(parsed)) {
    return safeCurrent;
  }
  return Math.min(Math.max(1, parsed), safeTotal);
}

export function computeOpeningBalanceFromRows(
  priorCfRows: any[],
  priorSalesRows: any[] = []
): number {
  const dedupedPriorCf = deduplicateClearanceRowsInMemory<any>(priorCfRows ?? []);
  let balance = dedupedPriorCf.reduce((acc, row) => {
    const dir = String(row?.direction ?? row?.type ?? '').toLowerCase();
    const amt = Number(row?.amount || 0);
    if (!Number.isFinite(amt)) return acc;
    if (dir === 'in') return acc + amt;
    if (dir === 'out') return acc - amt;
    return acc;
  }, 0);

  const priorPosCfRows = dedupedPriorCf.filter((r: any) => isPosCashSaleCategory(r?.category));
  const hasPriorPosCfWithoutRef = priorPosCfRows.some((r: any) => !r?.reference_id);
  const existingPriorPosRefIds = new Set(
    priorPosCfRows.map((r: any) => r?.reference_id).filter(Boolean).map(String)
  );

  if (!hasPriorPosCfWithoutRef) {
    for (const s of (priorSalesRows ?? [])) {
      const masuk = Number(s?.paid_cash ?? 0);
      if (Number.isFinite(masuk) && masuk > 0 && !existingPriorPosRefIds.has(String(s?.id))) {
        balance += masuk;
      }
    }
  }

  return balance;
}

const getLocalDateString = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const today = new Date();
const startOfMonth = getLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1));
const todayStr = getLocalDateString(today);

const KATEGORI_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  penjualan_tunai: { bg: 'bg-emerald-50', text: 'text-emerald-800', label: 'Penjualan POS' },
  PENJUALAN_TUNAI: { bg: 'bg-emerald-50', text: 'text-emerald-800', label: 'Penjualan POS' },
  PENJUALAN_POS: { bg: 'bg-emerald-50', text: 'text-emerald-800', label: 'Penjualan POS' },
  'Penjualan POS': { bg: 'bg-emerald-50', text: 'text-emerald-800', label: 'Penjualan POS' },
  SALDO_AWAL_SIMPANAN: { bg: 'bg-indigo-50 border border-indigo-200', text: 'text-indigo-700', label: 'Saldo Awal Simpanan (Cut-Off)' },
  saldo_awal_simpanan: { bg: 'bg-indigo-50 border border-indigo-200', text: 'text-indigo-700', label: 'Saldo Awal Simpanan (Cut-Off)' },
  PELUNASAN_BON_TOKO: { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700', label: 'Pelunasan Bon Toko' },
  pelunasan_bon_toko: { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700', label: 'Pelunasan Bon Toko' },
  'Pelunasan Bon Toko': { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700', label: 'Pelunasan Bon Toko' },
  SETORAN_ANGGOTA: { bg: 'bg-blue-50', text: 'text-blue-800', label: 'Setoran Anggota' },
  'Setoran Simpanan': { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700', label: 'Setoran Simpanan' },
  SETORAN_SIMPANAN: { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700', label: 'Setoran Simpanan' },
  setoran_simpanan: { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700', label: 'Setoran Simpanan' },
  simpanan: { bg: 'bg-blue-50', text: 'text-blue-800', label: 'Simpanan' },
  angsuran_pinjaman: { bg: 'bg-amber-50', text: 'text-amber-800', label: 'Angsuran Pinjaman' },
  restock_supplier: { bg: 'bg-orange-50', text: 'text-orange-800', label: 'Restock Supplier' },
  pembelian_barang: { bg: 'bg-orange-50', text: 'text-orange-800', label: 'Pembelian Barang' },
  pencairan_pinjaman: { bg: 'bg-purple-50', text: 'text-purple-800', label: 'Pencairan Pinjaman' },
  pembiayaan_barang: { bg: 'bg-teal-50 border border-teal-200', text: 'text-teal-800', label: 'Pembiayaan Barang' },
  PEMBIAYAAN_BARANG: { bg: 'bg-teal-50 border border-teal-200', text: 'text-teal-800', label: 'Pembiayaan Barang' },
  penarikan_simpanan: { bg: 'bg-rose-50', text: 'text-rose-800', label: 'Penarikan Simpanan' },
  PENARIKAN_SIMPANAN: { bg: 'bg-rose-50', text: 'text-rose-800', label: 'Penarikan Simpanan' },
  'Penarikan Simpanan': { bg: 'bg-rose-50', text: 'text-rose-800', label: 'Penarikan Simpanan' },
  KLIRING_ANGGOTA_KELUAR: { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-700', label: 'Kliring Anggota Keluar' },
  kliring_anggota_keluar: { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-700', label: 'Kliring Anggota Keluar' },
  'Kliring Anggota Keluar': { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-700', label: 'Kliring Anggota Keluar' },
  KOREKSI_PEMBATALAN: { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-700', label: 'Koreksi / Pembatalan' },
  koreksi_pembatalan: { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-700', label: 'Koreksi / Pembatalan' },
  'Koreksi / Pembatalan': { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-700', label: 'Koreksi / Pembatalan' },
  PEMBAGIAN_SHU_RAT: { bg: 'bg-purple-50 border border-purple-200', text: 'text-purple-800', label: 'Pembagian SHU (RAT)' },
  pembagian_shu_rat: { bg: 'bg-purple-50 border border-purple-200', text: 'text-purple-800', label: 'Pembagian SHU (RAT)' },
  'Pembagian SHU (RAT)': { bg: 'bg-purple-50 border border-purple-200', text: 'text-purple-800', label: 'Pembagian SHU (RAT)' },
  KOREKSI_TAHUN_LALU: { bg: 'bg-purple-50 border border-purple-200', text: 'text-purple-800', label: 'Koreksi Tahun Lalu (Pasca-RAT)' },
  koreksi_tahun_lalu: { bg: 'bg-purple-50 border border-purple-200', text: 'text-purple-800', label: 'Koreksi Tahun Lalu (Pasca-RAT)' },
  'Koreksi Tahun Lalu (Pasca-RAT)': { bg: 'bg-purple-50 border border-purple-200', text: 'text-purple-800', label: 'Koreksi Tahun Lalu (Pasca-RAT)' },
  beban_operasional: { bg: 'bg-red-50', text: 'text-red-800', label: 'Beban Operasional' },
};

const KATEGORI_BADGE_BY_LABEL: Record<string, { bg: string; text: string; label: string }> =
  Object.values(KATEGORI_BADGE).reduce(
    (acc, item) => {
      const key = item.label.toLowerCase();
      if (!acc[key]) {
        acc[key] = item;
      }
      return acc;
    },
    {} as Record<string, { bg: string; text: string; label: string }>
  );

export interface CashFlowCategoryOption {
  label: string;
  count: number;
  bg: string;
  text: string;
}

export function getCashFlowCategoryMeta(kategori: string): {
  bg: string;
  text: string;
  label: string;
} {
  const trimmed = String(kategori || '').trim();
  if (!trimmed) {
    return { bg: 'bg-slate-50', text: 'text-slate-700', label: 'Lainnya' };
  }
  return (
    KATEGORI_BADGE[trimmed] ??
    KATEGORI_BADGE[trimmed.toLowerCase()] ??
    KATEGORI_BADGE[trimmed.toUpperCase()] ??
    KATEGORI_BADGE_BY_LABEL[trimmed.toLowerCase()] ?? {
      bg: 'bg-slate-50',
      text: 'text-slate-700',
      label: trimmed,
    }
  );
}

export function getNormalizedCategoryLabel(kategori: string): string {
  return getCashFlowCategoryMeta(kategori).label;
}

export function buildCashFlowCategoryOptions(
  transactions: CashFlowTransaction[]
): CashFlowCategoryOption[] {
  const map = new Map<string, CashFlowCategoryOption>();
  for (const tx of transactions) {
    const meta = getCashFlowCategoryMeta(tx.kategori);
    const existing = map.get(meta.label);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(meta.label, {
        label: meta.label,
        count: 1,
        bg: meta.bg,
        text: meta.text,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'id'));
}

export function filterCashFlowTransactions(
  transactions: CashFlowTransaction[],
  searchQuery: string,
  selectedCategories: string[]
): CashFlowTransaction[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const selectedSet = selectedCategories.length > 0 ? new Set(selectedCategories) : null;
  if (!normalizedQuery && !selectedSet) {
    return transactions;
  }

  return transactions.filter((t) => {
    const normalizedCategoryLabel = getNormalizedCategoryLabel(t.kategori);
    if (selectedSet && !selectedSet.has(normalizedCategoryLabel)) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const refMatch = String(t.referensi || '').toLowerCase().includes(normalizedQuery);
    const descMatch = String(t.deskripsi || '').toLowerCase().includes(normalizedQuery);
    const rawCatMatch = String(t.kategori || '').toLowerCase().includes(normalizedQuery);
    const normCatMatch = normalizedCategoryLabel.toLowerCase().includes(normalizedQuery);
    const refIdMatch = String(t.reference_id || '').toLowerCase().includes(normalizedQuery);
    return refMatch || descMatch || rawCatMatch || normCatMatch || refIdMatch;
  });
}

export const MONTH_INDEX_MAP: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mar: 3,
  maret: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  ags: 8,
  agu: 8,
  agustus: 8,
  aug: 8,
  sep: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
  dec: 12,
};

export function extractPeriodSortKey(desc?: string): number {
  if (!desc) return 0;
  const match = String(desc).match(/\[([A-Za-z]+)\s+(\d{4})\]/);
  if (!match) return 0;
  const monthNum = MONTH_INDEX_MAP[match[1].toLowerCase()] || 0;
  const yearNum = Number(match[2]) || 0;
  if (monthNum <= 0 || yearNum <= 0) return 0;
  return yearNum * 100 + monthNum;
}

export function extractMemberSortKey(desc?: string): string {
  if (!desc) return '';
  const dashIdx = desc.indexOf('—');
  if (dashIdx === -1) return '';
  return desc
    .slice(dashIdx + 1)
    .replace(/\s*\((?:Ref:|Rp\s)[^)]*\)\s*$/i, '')
    .trim();
}

export function extractDepositTypeSortOrder(desc?: string): number {
  if (!desc) return 0;
  const lower = desc.toLowerCase();
  if (lower.includes('simpanan pokok')) return 1;
  if (lower.includes('simpanan wajib')) return 2;
  if (lower.includes('simpanan belanja')) return 3;
  if (lower.includes('simpanan lebaran')) return 4;
  return 0;
}

export function formatTimeHhMmSs(isoOrDateStr?: string): string {
  if (!isoOrDateStr) return '';
  const d = new Date(isoOrDateStr);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseCashFlowTransactionTime(tx: CashFlowTransaction): number {
  if (tx.created_at) {
    const ms = new Date(tx.created_at).getTime();
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }
  const dmyMatch = String(tx.tanggal || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    return Date.UTC(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
  }
  const fallbackMs = new Date(String(tx.tanggal || '')).getTime();
  return Number.isNaN(fallbackMs) ? 0 : fallbackMs;
}

export function compareCashFlowChronological(
  a: CashFlowTransaction,
  b: CashFlowTransaction
): number {
  const timeA = parseCashFlowTransactionTime(a);
  const timeB = parseCashFlowTransactionTime(b);
  if (timeA !== timeB) {
    return timeA - timeB;
  }

  const periodA = extractPeriodSortKey(a.deskripsi);
  const periodB = extractPeriodSortKey(b.deskripsi);
  if (periodA !== periodB) {
    return periodA - periodB;
  }

  const memberA = extractMemberSortKey(a.deskripsi);
  const memberB = extractMemberSortKey(b.deskripsi);
  if (memberA !== memberB) {
    return memberA.localeCompare(memberB, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  const typeA = extractDepositTypeSortOrder(a.deskripsi);
  const typeB = extractDepositTypeSortOrder(b.deskripsi);
  if (typeA !== typeB) {
    return typeA - typeB;
  }

  if (periodA > 0 || periodB > 0) {
    const descCmp = (a.deskripsi || '').localeCompare(b.deskripsi || '');
    if (descCmp !== 0) {
      return descCmp;
    }
  }

  return String(a.id).localeCompare(String(b.id));
}

export function sortCashFlowTransactionsByDate(
  transactions: CashFlowTransaction[],
  sortOrder: 'asc' | 'desc'
): CashFlowTransaction[] {
  return [...transactions].sort((a, b) =>
    sortOrder === 'asc'
      ? compareCashFlowChronological(a, b)
      : -compareCashFlowChronological(a, b)
  );
}

export function buildCashFlowExportSheetRows(params: {
  startDate: string;
  endDate: string;
  transactions: CashFlowTransaction[];
  inflowTotal: number;
  outflowTotal: number;
  netCashflow: number;
  openingBalance?: number;
  selectedCategories?: string[];
  searchQuery?: string;
}): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    ['LAPORAN ARUS KAS SIMKOP'],
    [`Periode: ${params.startDate} s/d ${params.endDate}`],
  ];

  const hasNonZeroOpening =
    typeof params.openingBalance === 'number' && params.openingBalance !== 0;
  const formattedStart = formatDateDdMmYyyy(params.startDate);
  if (hasNonZeroOpening) {
    rows.push([
      `Saldo Awal Sebelum Periode (< ${formattedStart}): ${formatRp(params.openingBalance as number)}`,
    ]);
  }

  if (params.selectedCategories && params.selectedCategories.length > 0) {
    rows.push([`Filter Kategori: ${params.selectedCategories.join(', ')}`]);
  }
  const trimmedSearch = params.searchQuery?.trim();
  if (trimmedSearch) {
    rows.push([`Filter Pencarian: ${trimmedSearch}`]);
  }

  rows.push([]);
  rows.push([
    'Tanggal',
    'Referensi',
    'Deskripsi',
    'Kategori',
    'Unit',
    'Kas Masuk',
    'Kas Keluar',
    'Saldo Berjalan',
  ]);

  if (hasNonZeroOpening) {
    rows.push([
      `< ${formattedStart}`,
      'SALDO-AWAL',
      `Saldo Awal Kumulatif Sebelum Periode (${formattedStart})`,
      'Saldo Bawaan',
      'Semua Unit',
      0,
      0,
      params.openingBalance as number,
    ]);
  }

  for (const t of params.transactions) {
    rows.push([
      t.tanggal,
      t.referensi,
      t.deskripsi,
      getNormalizedCategoryLabel(t.kategori),
      t.unit_usaha,
      t.kas_masuk,
      t.kas_keluar,
      t.saldo_berjalan,
    ]);
  }

  rows.push([
    '',
    '',
    '',
    '',
    'TOTAL',
    params.inflowTotal,
    params.outflowTotal,
    params.netCashflow,
  ]);

  return rows;
}

export const KategoriBadge = ({ kategori }: { kategori: string }) => {
  const cfg = getCashFlowCategoryMeta(kategori);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
};

// ─── Service Layer (Wave 2) ───────────────────────────────────────────────────

const isMissingColumnErr = (err: any): boolean => {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return (
    err.code === '42703' ||
    err.code === 'PGRST204' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
};

async function fetchPriorCashFlowRows(startBoundaryIso: string): Promise<any[]> {
  if (!startBoundaryIso) return [];
  const pageSize = 1000;

  const queryWithColumns = async (
    cols: string
  ): Promise<{ data: any[]; error: any; unsupported?: boolean }> => {
    const allRows: any[] = [];
    let offset = 0;

    while (true) {
      const tableRef: any = supabase?.from?.('cash_flow');
      if (!tableRef || typeof tableRef.select !== 'function') {
        return { data: [], error: null, unsupported: true };
      }
      const selectQ: any = tableRef.select(cols);
      if (!selectQ || typeof selectQ.lt !== 'function') {
        return { data: [], error: null, unsupported: true };
      }

      let q: any = selectQ.lt('created_at', startBoundaryIso);
      if (q && typeof q.order === 'function') {
        q = q.order('created_at', { ascending: true });
      }

      if (q && typeof q.range === 'function') {
        const res = await q.range(offset, offset + pageSize - 1);
        if (res?.error) {
          return { data: allRows, error: res.error };
        }
        const batch = Array.isArray(res?.data) ? res.data : [];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      } else {
        const res = await q;
        if (res?.error) {
          return { data: [], error: res.error };
        }
        return { data: Array.isArray(res?.data) ? res.data : [], error: null };
      }
    }

    return { data: allRows, error: null };
  };

  const primary = await queryWithColumns(
    'id, created_at, description, category, direction, amount, reference_id'
  );
  if (primary.unsupported) return [];
  if (!primary.error) return primary.data;

  const fallback = await queryWithColumns(
    'id, created_at, category, direction, amount, reference_id'
  );
  if (fallback.unsupported) return [];
  if (!fallback.error) return fallback.data;

  console.error('prior cash_flow query error:', primary.error);
  return [];
}

async function fetchPeriodCashFlowRows(startDate: string, endDate: string): Promise<any[]> {
  const pageSize = 1000;
  const endBoundary = `${endDate}T23:59:59`;

  const queryWithColumns = async (
    cols: string
  ): Promise<{ data: any[]; error: any; unsupported?: boolean }> => {
    const allRows: any[] = [];
    let offset = 0;

    while (true) {
      const tableRef: any = supabase?.from?.('cash_flow');
      if (!tableRef || typeof tableRef.select !== 'function') {
        return { data: [], error: null, unsupported: true };
      }
      const selectQ: any = tableRef.select(cols);
      if (!selectQ || typeof selectQ.gte !== 'function') {
        return { data: [], error: null, unsupported: true };
      }

      let q: any = selectQ.gte('created_at', startDate);
      if (q && typeof q.lte === 'function') {
        q = q.lte('created_at', endBoundary);
      }
      if (q && typeof q.order === 'function') {
        q = q.order('created_at', { ascending: true });
      }

      if (q && typeof q.range === 'function') {
        const res = await q.range(offset, offset + pageSize - 1);
        if (res?.error) {
          return { data: allRows, error: res.error };
        }
        const batch = Array.isArray(res?.data) ? res.data : [];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      } else {
        const res = await q;
        if (res?.error) {
          return { data: [], error: res.error };
        }
        return { data: Array.isArray(res?.data) ? res.data : [], error: null };
      }
    }

    return { data: allRows, error: null };
  };

  const primary = await queryWithColumns(
    'id, created_at, description, category, direction, amount, reference_id'
  );
  if (primary.unsupported) return [];
  if (!primary.error) return primary.data;

  const fallback = await queryWithColumns(
    'id, created_at, category, direction, amount, reference_id'
  );
  if (fallback.unsupported) return [];
  if (!fallback.error) return fallback.data;

  console.error('cash_flow query error:', primary.error);
  return [];
}

async function fetchPeriodSalesRows(startDate: string, endDate: string): Promise<any[]> {
  const pageSize = 1000;
  const endBoundary = `${endDate}T23:59:59`;

  const queryWithColumns = async (
    cols: string
  ): Promise<{ data: any[]; error: any; unsupported?: boolean }> => {
    const allRows: any[] = [];
    let offset = 0;

    while (true) {
      const tableRef: any = supabase?.from?.('sales');
      if (!tableRef || typeof tableRef.select !== 'function') {
        return { data: [], error: null, unsupported: true };
      }
      const selectQ: any = tableRef.select(cols);
      if (!selectQ || typeof selectQ.gte !== 'function') {
        return { data: [], error: null, unsupported: true };
      }

      let q: any = selectQ.gte('created_at', startDate);
      if (q && typeof q.lte === 'function') {
        q = q.lte('created_at', endBoundary);
      }
      if (q && typeof q.eq === 'function') {
        q = q.eq('sale_status', 'completed');
      }
      if (q && typeof q.gt === 'function') {
        q = q.gt('paid_cash', 0);
      }
      if (q && typeof q.order === 'function') {
        q = q.order('created_at', { ascending: true });
      }

      if (q && typeof q.range === 'function') {
        const res = await q.range(offset, offset + pageSize - 1);
        if (res?.error) {
          return { data: allRows, error: res.error };
        }
        const batch = Array.isArray(res?.data) ? res.data : [];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      } else {
        const res = await q;
        if (res?.error) {
          return { data: [], error: res.error };
        }
        return { data: Array.isArray(res?.data) ? res.data : [], error: null };
      }
    }

    return { data: allRows, error: null };
  };

  const primary = await queryWithColumns(
    'id, sale_number, member_id, created_at, paid_cash, total_amount'
  );
  if (primary.unsupported) return [];
  if (!primary.error) return primary.data;

  if (isMissingColumnErr(primary.error)) {
    const fallback = await queryWithColumns(
      'id, created_at, paid_cash, total_amount'
    );
    if (fallback.unsupported) return [];
    if (!fallback.error) return fallback.data;
    console.error('sales query error:', fallback.error);
    return [];
  }

  console.error('sales query error:', primary.error);
  return [];
}

async function fetchPriorSalesRows(startBoundaryIso: string): Promise<any[]> {
  if (!startBoundaryIso) return [];
  const pageSize = 1000;
  const allRows: any[] = [];
  let offset = 0;

  while (true) {
    const tableRef: any = supabase?.from?.('sales');
    if (!tableRef || typeof tableRef.select !== 'function') {
      return [];
    }
    const selectQ: any = tableRef.select('id, created_at, paid_cash');
    if (!selectQ || typeof selectQ.lt !== 'function') {
      return [];
    }

    let q: any = selectQ.lt('created_at', startBoundaryIso);
    if (q && typeof q.eq === 'function') {
      q = q.eq('sale_status', 'completed');
    }
    if (q && typeof q.gt === 'function') {
      q = q.gt('paid_cash', 0);
    }
    if (q && typeof q.order === 'function') {
      q = q.order('created_at', { ascending: true });
    }

    if (q && typeof q.range === 'function') {
      const res = await q.range(offset, offset + pageSize - 1);
      if (res?.error) {
        console.error('prior sales query error:', res.error);
        return allRows;
      }
      const batch = Array.isArray(res?.data) ? res.data : [];
      allRows.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    } else {
      const res = await q;
      if (res?.error) {
        console.error('prior sales query error:', res.error);
        return [];
      }
      return Array.isArray(res?.data) ? res.data : [];
    }
  }

  return allRows;
}

export async function getCashFlowReport(
  startDate: string,
  endDate: string,
  _unit: string
): Promise<CashFlowData> {
  // Sinkronkan pelunasan bon toko historis, saldo awal cut-off, konsolidasi pencairan massal Lebaran, setoran matriks, penjualan tunai POS, dan kliring anggota keluar (idempoten)
  await syncStoreCreditPaymentsToCashFlow().catch(() => { });
  await syncOpeningSavingsBalanceToCashFlow().catch(() => { });
  await consolidateBulkLebaranCashFlow().catch(() => { });
  await syncMatrixDepositsToCashFlow().catch((err) => {
    console.error('[LaporanKeuangan] syncMatrixDepositsToCashFlow gagal:', err);
  });
  await syncPosCashSalesToCashFlow().catch(() => { });
  await syncResignedMemberClearanceToCashFlow().catch(() => { });
  await syncApprovedLoansToCashFlow().catch((err) => {
    console.error('[LaporanKeuangan] syncApprovedLoansToCashFlow gagal:', err);
  });
  const memberDepositEnrichRes = await enrichMemberDepositCashFlowDescriptions().catch(() => ({
    updatedCount: 0,
    skippedCount: 0,
    resolvedDescriptions: {} as Record<string, string>,
  }));

  const startBoundaryIso = buildStartDateBoundaryIso(startDate);
  const [priorCfRows, priorSalesRows] = await Promise.all([
    fetchPriorCashFlowRows(startBoundaryIso),
    fetchPriorSalesRows(startBoundaryIso),
  ]);
  const openingBalance = computeOpeningBalanceFromRows(priorCfRows, priorSalesRows);

  // Fetch cash_flow dan sales secara bertahap (range pagination) agar tidak terpotong batas 1.000 baris Supabase/PostgREST
  // NOTE: cash_flow table has no 'unit' column — filter unit usaha tidak tersedia di level DB
  const [cfRows, salesRows] = await Promise.all([
    fetchPeriodCashFlowRows(startDate, endDate),
    fetchPeriodSalesRows(startDate, endDate),
  ]);
  const deduplicatedCfRows = deduplicateClearanceRowsInMemory<any>(cfRows ?? []);

  const parseTimestamp = (raw?: string | null): number => {
    if (!raw) return 0;
    const ms = new Date(raw).getTime();
    return isNaN(ms) ? 0 : ms;
  };

  const taggedRows: Array<{ row: CashFlowTransaction; ts: number }> = [];

  // Build from cash_flow
  for (const r of deduplicatedCfRows) {
    const dir = r.direction ?? r.type;
    const masuk = dir === 'in' ? Number(r.amount) : 0;
    const keluar = dir === 'out' ? Number(r.amount) : 0;
    const isOpeningSavings =
      r.category === 'SALDO_AWAL_SIMPANAN' || r.category === 'saldo_awal_simpanan';
    const isModalKasirAwal =
      String(r.category || '').trim().toUpperCase() === 'MODAL_KASIR_AWAL';
    const rawDescription = typeof r.description === 'string' ? r.description.trim() : '';
    const enrichedMemberDesc =
      memberDepositEnrichRes?.resolvedDescriptions?.[String(r.id)] || '';
    const effectiveDescription = enrichedMemberDesc || rawDescription;
    taggedRows.push({
      ts: parseTimestamp(r.created_at),
      row: {
        id: r.id,
        tanggal: new Date(r.created_at).toLocaleDateString('id-ID'),
        referensi: `CF-${r.id.slice(0, 8).toUpperCase()}`,
        deskripsi:
          effectiveDescription !== ''
            ? effectiveDescription
            : isOpeningSavings
              ? 'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)'
              : isModalKasirAwal
                ? 'Penyerahan Modal Kas Kecil Awal Shift Kasir'
                : '-',
        kategori: r.category ?? 'lainnya',
        unit_usaha: 'Umum', // cash_flow table has no 'unit' column
        kas_masuk: masuk,
        kas_keluar: keluar,
        saldo_berjalan: 0,
        reference_id: r.reference_id ?? null,
        direction: dir === 'out' ? 'out' : 'in',
        created_at: r.created_at,
      },
    });
  }

  // Add sales paid_cash if not already in cash_flow
  // (some systems record via POS directly into sales, not cash_flow)
  const posCfRows = deduplicatedCfRows.filter((r: any) => isPosCashSaleCategory(r.category));
  const hasPosCfWithoutRef = posCfRows.some((r: any) => !r.reference_id);
  const existingPosRefIds = new Set(
    posCfRows.map((r: any) => r.reference_id).filter(Boolean).map(String)
  );
  if (!hasPosCfWithoutRef) {
    for (const s of (salesRows ?? [])) {
      const masuk = Number(s.paid_cash ?? 0);
      if (masuk > 0 && !existingPosRefIds.has(String(s.id))) {
        taggedRows.push({
          ts: parseTimestamp(s.created_at),
          row: {
            id: s.id,
            tanggal: new Date(s.created_at).toLocaleDateString('id-ID'),
            referensi: `POS-${s.id.slice(0, 8).toUpperCase()}`,
            deskripsi:
              !s.member_id && s.sale_number
                ? formatPosCashFlowDescription({
                  saleNumber: s.sale_number,
                  amount: masuk,
                })
                : '-',
            kategori: 'penjualan_tunai',
            unit_usaha: 'Retail Toko',
            kas_masuk: masuk,
            kas_keluar: 0,
            saldo_berjalan: 0,
            reference_id: s.id,
            direction: 'in',
            created_at: s.created_at,
          },
        });
      }
    }
  }

  // Sort chronologically by raw created_at timestamp
  taggedRows.sort((a, b) => a.ts - b.ts);
  const rows = taggedRows.map((item) => item.row);

  // Recalculate running saldo after sort starting from cumulative pre-period openingBalance
  let saldo = openingBalance;
  for (const r of rows) {
    saldo += r.kas_masuk - r.kas_keluar;
    r.saldo_berjalan = saldo;
  }

  const enrichedWithdrawals = await enrichWithdrawalCashFlowDescriptions(rows).catch(() => rows);
  const enrichedDeposits = await enrichDepositCashFlowDescriptions(enrichedWithdrawals).catch(
    () => enrichedWithdrawals
  );
  const enrichedStoreCredits = await enrichStoreCreditCashFlowDescriptions(enrichedDeposits).catch(
    () => enrichedDeposits
  );
  const enrichedPos = await enrichPosCashFlowDescriptions(enrichedStoreCredits).catch(
    () => enrichedStoreCredits
  );
  const enrichedRows = await enrichMemberClearanceCashFlowDescriptions(enrichedPos).catch(
    () => enrichedPos
  );
  const dedupedEnrichedRows = deduplicateClearanceRowsInMemory(enrichedRows);
  const sortedEnrichedRows = [...dedupedEnrichedRows].sort(compareCashFlowChronological);
  let running = openingBalance;
  const finalTransactions = sortedEnrichedRows.map((tx) => {
    running += tx.kas_masuk - tx.kas_keluar;
    return { ...tx, saldo_berjalan: running };
  });

  const inflowTotal = finalTransactions.reduce((s, r) => s + r.kas_masuk, 0);
  const outflowTotal = finalTransactions.reduce((s, r) => s + r.kas_keluar, 0);
  const netCashflow = inflowTotal - outflowTotal;
  const closingBalance = openingBalance + netCashflow;

  return {
    openingBalance,
    inflowTotal,
    outflowTotal,
    netCashflow,
    closingBalance,
    transactions: finalTransactions,
  };
}

const classifyPosPaymentSource = (
  sale: any
): { sourceType: ShuSourceType; paymentMethodLabel: string } => {
  const paidCash = Number(sale?.paid_cash ?? 0);
  const paidDeposit = Number(sale?.paid_deposit ?? 0);
  const paidCredit = Number(sale?.paid_credit ?? 0);
  const positiveChannels = [paidCash > 0, paidDeposit > 0, paidCredit > 0].filter(Boolean).length;

  if (positiveChannels > 1) {
    return { sourceType: 'pos_split', paymentMethodLabel: 'POS • Campuran' };
  }
  if (paidCredit > 0 || sale?.payment_scheme === 'store_credit') {
    return { sourceType: 'pos_credit', paymentMethodLabel: 'POS • Bon Toko' };
  }
  if (paidDeposit > 0) {
    return { sourceType: 'pos_deposit', paymentMethodLabel: 'POS • Potong Simpanan' };
  }
  return { sourceType: 'pos_cash', paymentMethodLabel: 'POS • Tunai' };
};

const SHU_SOURCE_BADGE: Record<ShuSourceType, { bg: string; text: string }> = {
  pos_cash: { bg: 'bg-emerald-50 border border-emerald-200/80', text: 'text-emerald-700' },
  pos_deposit: { bg: 'bg-blue-50 border border-blue-200/80', text: 'text-blue-700' },
  pos_credit: { bg: 'bg-amber-50 border border-amber-200/80', text: 'text-amber-800' },
  pos_split: { bg: 'bg-purple-50 border border-purple-200/80', text: 'text-purple-700' },
  goods_financing: { bg: 'bg-teal-50 border border-teal-200/80', text: 'text-teal-800' },
  LOAN_CONTRACT: { bg: 'bg-teal-50 border border-teal-200/80', text: 'text-teal-800' },
  stock_opname: { bg: 'bg-purple-50 border border-purple-200/80', text: 'text-purple-800' },
};

const formatDisplayDateId = (raw?: string | null): string => {
  if (!raw) return '-';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString('id-ID');
};

const chunkIds = (ids: string[], size = 80): string[][] => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const safeSize = Math.max(1, size);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += safeSize) {
    chunks.push(ids.slice(i, i + safeSize));
  }
  return chunks;
};

const fetchInChunksPaginated = async (
  table: string,
  columnVariants: string[],
  filterColumn: string,
  ids: string[]
): Promise<{ data: any[]; error: any }> => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean).map(String)));
  if (uniqueIds.length === 0) return { data: [], error: null };

  const idChunks = chunkIds(uniqueIds, 80);
  const allRows: any[] = [];
  let lastError: any = null;

  for (const idChunk of idChunks) {
    let chunkRows: any[] = [];
    let chunkError: any = null;
    let usedInFilter = false;

    for (let i = 0; i < columnVariants.length; i++) {
      const cols = columnVariants[i];
      const res = await fetchAllPaginatedSafe(() => {
        const tableRef: any = supabase.from(table);
        if (!tableRef || typeof tableRef.select !== 'function') return null;
        let q: any = tableRef.select(cols);
        if (!q) return null;
        if (typeof q.in === 'function') {
          usedInFilter = true;
          q = q.in(filterColumn, idChunk);
        } else if (typeof q.then === 'function') {
          return q;
        } else {
          return null;
        }
        if (q && typeof q.range === 'function' && typeof q.order === 'function') {
          q = q.order('id', { ascending: true });
        }
        return q;
      });

      if (!res.error) {
        chunkRows = Array.isArray(res.data) ? res.data : [];
        chunkError = null;
        break;
      }

      chunkError = res.error;
      if (isMissingColumnErr(res.error) && i < columnVariants.length - 1) {
        continue;
      }
      break;
    }

    if (chunkError) {
      lastError = chunkError;
    }
    if (chunkRows.length > 0) {
      allRows.push(...chunkRows);
    }
    if (!usedInFilter) {
      break;
    }
  }

  return { data: allRows, error: lastError };
};

export async function getShuEstimation(
  startDate: string,
  endDate: string
): Promise<ShuEstimationData> {
  // 1. Total Omzet dari sales.total_amount (completed)
  // NOTE: actual column is 'sale_status' (enum), not 'status'
  const runSalesQuery = async (cols: string): Promise<any> => {
    return await fetchAllPaginatedSafe(() => {
      const salesTable: any = supabase.from('sales');
      if (!salesTable || typeof salesTable.select !== 'function') return null;
      let q: any = salesTable.select(cols);
      if (!q) return null;
      if (typeof q.gte === 'function') q = q.gte('created_at', startDate);
      if (q && typeof q.lte === 'function') q = q.lte('created_at', endDate + 'T23:59:59');
      if (q && typeof q.eq === 'function') q = q.eq('sale_status', 'completed');
      if (q && typeof q.range === 'function' && typeof q.order === 'function') {
        q = q.order('id', { ascending: true });
      }
      return q;
    });
  };

  let salesRes: any = await runSalesQuery(
    'id, sale_number, member_id, subtotal, discount, total_amount, paid_cash, paid_deposit, paid_credit, payment_scheme, created_at'
  );
  if (salesRes?.error && isMissingColumnErr(salesRes.error)) {
    salesRes = await runSalesQuery('id, total_amount, created_at');
  }
  if (salesRes?.error) console.error('shu sales error:', salesRes.error);

  const salesData: any[] = Array.isArray(salesRes?.data) ? salesRes.data : [];
  const grossSales = salesData.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);
  const saleIds = Array.from(new Set(salesData.map((r: any) => r.id).filter(Boolean).map(String)));

  // 2. HPP = SUM(sale_items.quantity * products.buy_price) & Rincian per Referensi
  let cogs = 0;
  const marginMap: Record<string, { omzet: number; hpp: number; kategori: string }> = {};
  const memberMap: Record<string, { nrp: string; nama: string }> = {};
  const shuReferenceRows: ShuReferenceRow[] = [];

  if (saleIds.length > 0) {
    // NOTE: sale_items has both (quantity/unit_price) and (qty/price) columns.
    // 'quantity' is NOT NULL so it's the canonical column for HPP calculation.
    const siRes = await fetchInChunksPaginated(
      'sale_items',
      [
        'sale_id, product_id, product_name, quantity, qty, unit_price, price, subtotal',
        'quantity, unit_price, product_id, sale_id',
      ],
      'sale_id',
      saleIds
    );
    if (siRes?.error) console.error('sale_items error:', siRes.error);
    const saleItems: any[] = Array.isArray(siRes?.data) ? siRes.data : [];

    const productIds = [
      ...new Set(saleItems.map((si: any) => si.product_id).filter(Boolean).map(String)),
    ];

    const productMap: Record<string, { name?: string; buy_price: number; category_id: string }> = {};
    if (productIds.length > 0) {
      const prodRes = await fetchInChunksPaginated(
        'products',
        ['id, name, buy_price, category_id', 'id, buy_price, category_id'],
        'id',
        productIds
      );
      if (prodRes?.error) console.error('products error:', prodRes.error);
      for (const p of (Array.isArray(prodRes?.data) ? prodRes.data : [])) {
        productMap[p.id] = {
          name: p.name,
          buy_price: Number(p.buy_price ?? 0),
          category_id: p.category_id,
        };
      }
    }

    // Get categories
    const catIds = [
      ...new Set(Object.values(productMap).map(p => p.category_id).filter(Boolean).map(String)),
    ];
    const catMap: Record<string, string> = {};
    if (catIds.length > 0) {
      try {
        const catRes = await fetchInChunksPaginated(
          'product_categories',
          ['id, name'],
          'id',
          catIds
        );
        for (const c of (catRes?.data ?? [])) catMap[c.id] = c.name;
      } catch {
        // Non-blocking fallback
      }
    }

    // Fetch member identities for POS sales
    const saleMemberIds = [
      ...new Set(salesData.map((s: any) => s.member_id).filter(Boolean).map(String)),
    ];
    if (saleMemberIds.length > 0) {
      try {
        const mRes = await fetchInChunksPaginated(
          'anggota',
          ['id, nrp, nama'],
          'id',
          saleMemberIds
        );
        for (const m of mRes?.data || []) {
          if (m?.id) {
            memberMap[String(m.id)] = {
              nrp: String(m.nrp ?? ''),
              nama: String(m.nama ?? ''),
            };
          }
        }
      } catch {
        // Non-blocking fallback
      }
    }

    const itemsBySaleId: Record<string, ShuReferenceLineItem[]> = {};

    for (const si of saleItems) {
      const prod = productMap[si.product_id];
      const qty = Number(si.quantity ?? si.qty ?? 0);
      const sellPrice = Number(si.unit_price ?? si.price ?? 0);
      const buyPrice = prod ? prod.buy_price : Number(si.buy_price ?? 0);
      const subtotalOmzet = qty * sellPrice;
      const subtotalHpp = qty * buyPrice;
      const subtotalProfit = subtotalOmzet - subtotalHpp;
      const productName = String(si.product_name || prod?.name || 'Produk');
      const categoryName = prod?.category_id ? (catMap[prod.category_id] ?? 'Lainnya') : 'Lainnya';

      cogs += subtotalHpp;

      if (!marginMap[categoryName]) {
        marginMap[categoryName] = { omzet: 0, hpp: 0, kategori: categoryName };
      }
      marginMap[categoryName].omzet += subtotalOmzet;
      marginMap[categoryName].hpp += subtotalHpp;

      const saleKey = String(si.sale_id);
      if (!itemsBySaleId[saleKey]) itemsBySaleId[saleKey] = [];
      itemsBySaleId[saleKey].push({
        productName,
        categoryName,
        qty,
        sellPrice,
        buyPrice,
        subtotalOmzet,
        subtotalHpp,
        subtotalProfit,
      });
    }

    for (const sale of salesData) {
      const sid = String(sale.id);
      const lineItems = itemsBySaleId[sid] ?? [];
      const itemsOmzet = lineItems.reduce((sum, it) => sum + it.subtotalOmzet, 0);
      const itemsHpp = lineItems.reduce((sum, it) => sum + it.subtotalHpp, 0);
      const omzet =
        sale.total_amount !== undefined && sale.total_amount !== null
          ? Number(sale.total_amount)
          : itemsOmzet;
      const hpp = itemsHpp;
      const grossProfit = omzet - hpp;
      const marginPercent = omzet > 0 ? (grossProfit / omzet) * 100 : 0;
      const { sourceType, paymentMethodLabel } = classifyPosPaymentSource(sale);
      const member = sale.member_id ? memberMap[String(sale.member_id)] : undefined;
      const rawDate = String(sale.created_at || '');

      shuReferenceRows.push({
        id: `pos-${sid}`,
        referenceNumber: String(
          sale.sale_number || `INV-${sid.slice(0, 8).toUpperCase()}`
        ),
        sourceType,
        transactionDate: formatDisplayDateId(rawDate),
        rawDate,
        memberName: member?.nama || 'Pelanggan Umum',
        memberNrp: member?.nrp ?? '',
        paymentMethodLabel,
        omzet,
        hpp,
        grossProfit,
        marginPercent,
        discount: Number(sale.discount ?? 0),
        items: lineItems,
      });
    }
  }

  // 3. Beban Operasional (secara eksplisit hanya mengambil beban operasional, mengecualikan saldo awal/simpanan)
  const { data: opexData, error: opexErr } = await fetchAllPaginatedSafe(() => {
    const cfTable: any = supabase.from('cash_flow');
    if (!cfTable || typeof cfTable.select !== 'function') return null;
    let q: any = cfTable.select('amount, category, direction');
    if (!q) return null;
    if (typeof q.gte === 'function') q = q.gte('created_at', startDate);
    if (q && typeof q.lte === 'function') q = q.lte('created_at', endDate + 'T23:59:59');
    if (q && typeof q.eq === 'function') q = q.eq('direction', 'out');
    if (q && typeof q.eq === 'function') q = q.eq('category', 'beban_operasional');
    if (q && typeof q.range === 'function' && typeof q.order === 'function') {
      q = q.order('id', { ascending: true });
    }
    return q;
  });
  if (opexErr) console.error('opex error:', opexErr);

  const NON_SHU_CATEGORIES = new Set([
    'SALDO_AWAL_SIMPANAN',
    'saldo_awal_simpanan',
    'SETORAN_ANGGOTA',
    'setoran_anggota',
    'Setoran Simpanan',
    'SETORAN_SIMPANAN',
    'setoran_simpanan',
    'simpanan',
    'KLIRING_ANGGOTA_KELUAR',
    'kliring_anggota_keluar',
    'Kliring Anggota Keluar',
    'KOREKSI_PEMBATALAN',
    'koreksi_pembatalan',
    'Koreksi / Pembatalan',
    'PEMBAGIAN_SHU_RAT',
    'pembagian_shu_rat',
    'KOREKSI_TAHUN_LALU',
    'koreksi_tahun_lalu',
    'Koreksi Tahun Lalu (Pasca-RAT)',
    'OPENING_BALANCE_NEW_YEAR',
  ]);

  const opex = (opexData ?? [])
    .filter((r: any) => {
      const dir = r?.direction ?? r?.type;
      const cat = r?.category;
      if (dir !== undefined && dir !== 'out') return false;
      if (cat !== undefined && (NON_SHU_CATEGORIES.has(cat) || cat !== 'beban_operasional')) {
        return false;
      }
      return true;
    })
    .reduce((s: number, r: any) => s + Number(r?.amount ?? 0), 0);

  // 3b. Pendapatan Margin Pembiayaan Barang (hanya porsi margin dari angsuran barang yang masuk pada periode ini)
  let goodsFinancingMargin = 0;
  try {
    const repayTable: any = supabase.from('loan_repayments');
    if (repayTable && typeof repayTable.select === 'function') {
      const runRepayQuery = async (cols: string) => {
        return await fetchAllPaginatedSafe(() => {
          let q: any = repayTable.select(cols);
          if (!q) return null;
          if (typeof q.gte === 'function') {
            q = q.gte('payment_date', startDate);
            if (q && typeof q.lte === 'function') {
              q = q.lte('payment_date', endDate + 'T23:59:59');
            }
            if (q && typeof q.range === 'function' && typeof q.order === 'function') {
              q = q.order('id', { ascending: true });
            }
            return q;
          }
          if (typeof q.then === 'function') {
            return q;
          }
          return null;
        });
      };

      let repayRes = await runRepayQuery(
        'id, loan_id, schedule_id, amount_paid, principal_portion, margin_portion, payment_date, payment_method, receipt_number, notes'
      );
      if (repayRes?.error && isMissingColumnErr(repayRes.error)) {
        repayRes = await runRepayQuery(
          'id, loan_id, schedule_id, amount_paid, principal_portion, margin_portion, payment_date, payment_method'
        );
      }
      if (repayRes?.error && isMissingColumnErr(repayRes.error)) {
        repayRes = await runRepayQuery(
          'id, loan_id, schedule_id, amount_paid, payment_date, payment_method'
        );
      }

      const rawRepayments = Array.isArray(repayRes?.data) ? repayRes.data : [];
      const redundantLegacySet = new Set<any>();
      const repaymentsByLoan = new Map<string, any[]>();
      for (const r of rawRepayments) {
        if (!r?.loan_id) continue;
        const lid = String(r.loan_id);
        const bucket = repaymentsByLoan.get(lid);
        if (bucket) bucket.push(r);
        else repaymentsByLoan.set(lid, [r]);
      }
      for (const bucket of repaymentsByLoan.values()) {
        const { redundant } = filterRedundantLegacySaldoAwalRepayments(bucket);
        for (const red of redundant) redundantLegacySet.add(red);
      }

      const validRepayments = rawRepayments.filter((r: any) => {
        if (redundantLegacySet.has(r)) return false;
        const method = String(r?.payment_method || '').toUpperCase();
        if (method === 'SALDO_AWAL' || method === 'TOPUP_COMPENSATION') return false;
        if (r?.payment_date) {
          const pDate = String(r.payment_date).slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(pDate) && (pDate < startDate || pDate > endDate)) {
            return false;
          }
        }
        return Number(r?.amount_paid || 0) > 0;
      });

      const scheduleLookup = new Map<string, any>();
      const loanLookup = new Map<string, any>();

      const allSchedIds = Array.from(
        new Set(validRepayments.map((r: any) => r.schedule_id).filter(Boolean).map(String))
      );
      if (allSchedIds.length > 0) {
        try {
          const sRes = await fetchInChunksPaginated(
            'loan_schedules',
            [
              'id, period_number, target_amount, paid_amount, status, principal_portion, margin_portion',
              'id, target_amount, paid_amount, status, principal_portion, margin_portion',
              'id, target_amount, paid_amount, status',
            ],
            'id',
            allSchedIds
          );
          for (const s of sRes?.data || []) {
            if (s?.id) scheduleLookup.set(String(s.id), s);
          }
        } catch {
          // Non-blocking fallback
        }
      }

      const allLoanIds = Array.from(
        new Set(validRepayments.map((r: any) => r.loan_id).filter(Boolean).map(String))
      );
      if (allLoanIds.length > 0) {
        try {
          const lRes = await fetchInChunksPaginated(
            'loans',
            [
              'id, loan_number, member_id, amount, principal_amount, cost_price, markup_amount, item_description, status',
              'id, loan_number, member_id, amount, principal_amount, cost_price, markup_amount, item_description',
              'id, amount, principal_amount, member_id',
            ],
            'id',
            allLoanIds
          );
          for (const l of lRes?.data || []) {
            if (l?.id) loanLookup.set(String(l.id), l);
          }
        } catch {
          // Non-blocking fallback
        }
      }

      const loanMemberIds = Array.from(
        new Set(
          Array.from(loanLookup.values())
            .map((l: any) => l?.member_id)
            .filter((id: any) => id && !memberMap[String(id)])
            .map(String)
        )
      );
      if (loanMemberIds.length > 0) {
        try {
          const mRes = await fetchInChunksPaginated(
            'anggota',
            ['id, nrp, nama'],
            'id',
            loanMemberIds
          );
          for (const m of mRes?.data || []) {
            if (m?.id) {
              memberMap[String(m.id)] = {
                nrp: String(m.nrp ?? ''),
                nama: String(m.nama ?? ''),
              };
            }
          }
        } catch {
          // Non-blocking fallback
        }
      }

      const getSafeTimeLocal = (raw: string): number => {
        if (!raw) return 0;
        const ms = new Date(raw).getTime();
        return Number.isNaN(ms) ? 0 : ms;
      };

      interface GroupedLoanShuRow {
        loan: any;
        totalRealizedMargin: number;
        totalPaidInPeriod: number;
        totalPrincipalInPeriod: number;
        installmentCount: number;
        latestRawDate: string;
        items: ShuReferenceLineItem[];
      }

      const groupedLoanMap = new Map<string, GroupedLoanShuRow>();

      for (const r of validRepayments) {
        const sched = r?.schedule_id ? scheduleLookup.get(String(r.schedule_id)) : null;
        if (sched) {
          const schedStatus = String(sched.status || '').trim().toLowerCase();
          if (Number(sched.paid_amount || 0) <= 0 || schedStatus === 'unpaid') {
            continue;
          }
        }

        const explicitMargin = Math.round(Number(r?.margin_portion || 0));
        let marginPortion = 0;
        let principalPortion = 0;

        const loan = r?.loan_id ? loanLookup.get(String(r.loan_id)) : null;
        const paidAmt = Math.round(Number(r?.amount_paid || 0));
        const totalAkad = Math.round(Number(loan?.principal_amount ?? loan?.amount ?? 0));
        const totalMargin = Math.round(Number(loan?.markup_amount || 0));

        if (totalAkad > 0 && totalMargin > 0) {
          marginPortion = Math.min(paidAmt, Math.round((paidAmt / totalAkad) * totalMargin));
          principalPortion = Math.max(0, paidAmt - marginPortion);
        } else if (explicitMargin > 0) {
          marginPortion = explicitMargin;
          principalPortion =
            r?.principal_portion !== undefined && r?.principal_portion !== null
              ? Math.round(Number(r.principal_portion))
              : Math.max(0, paidAmt - marginPortion);
        } else {
          const portions = calculateRepaymentPortions({
            amountPaid: paidAmt,
            targetAmount: Number(sched?.target_amount || paidAmt || 0),
            schedulePrincipalPortion: sched?.principal_portion,
            scheduleMarginPortion: sched?.margin_portion,
            loanCostPrice: loan?.cost_price,
            loanMarkupAmount: loan?.markup_amount,
            loanTotalAmount: loan?.principal_amount ?? loan?.amount,
          });
          marginPortion = portions.marginPortion;
          principalPortion = portions.principalPortion;
        }

        goodsFinancingMargin += marginPortion;

        const groupKey = r?.loan_id
          ? String(r.loan_id)
          : loan?.loan_number
            ? String(loan.loan_number)
            : String(r?.receipt_number || r?.id);

        const receiptNumber = String(
          r?.receipt_number || `PAY-${String(r?.id || '').slice(0, 8).toUpperCase()}`
        );
        const rawDate = String(r?.payment_date || '');

        let periodNumber: number | null = null;
        if (sched?.period_number != null && !Number.isNaN(Number(sched.period_number))) {
          periodNumber = Number(sched.period_number);
        } else {
          const receiptPeriod = extractReceiptPeriodNumber(receiptNumber);
          if (receiptPeriod) {
            periodNumber = Number(receiptPeriod);
          } else {
            const notesMatch = String(r?.notes || '').match(/(?:bln\s*)?ke-?(\d+)/i);
            if (notesMatch) {
              periodNumber = Number(notesMatch[1]);
            }
          }
        }

        const existingGroup = groupedLoanMap.get(groupKey);
        const lineItem: ShuReferenceLineItem = {
          productName: loan?.item_description
            ? `${receiptNumber} — ${String(loan.item_description)}`
            : receiptNumber,
          categoryName: marginPortion > 0 ? 'Pembiayaan Barang' : 'Pinjaman Reguler (0% Jasa)',
          qty: 1,
          sellPrice: marginPortion,
          buyPrice: 0,
          subtotalOmzet: marginPortion,
          subtotalHpp: 0,
          subtotalProfit: marginPortion,
          receiptNumber,
          periodNumber,
          paymentDate: formatDisplayDateId(rawDate),
          rawPaymentDate: rawDate,
          paidAmt,
          principalPortion,
          realizedMargin: marginPortion,
        };

        if (existingGroup) {
          if (!existingGroup.loan && loan) {
            existingGroup.loan = loan;
          }
          existingGroup.totalRealizedMargin += marginPortion;
          existingGroup.totalPaidInPeriod += paidAmt;
          existingGroup.totalPrincipalInPeriod += principalPortion;
          existingGroup.installmentCount += 1;
          const currentTime = getSafeTimeLocal(existingGroup.latestRawDate);
          const candidateTime = getSafeTimeLocal(rawDate);
          if (
            !existingGroup.latestRawDate ||
            candidateTime > currentTime ||
            (candidateTime === currentTime && rawDate > existingGroup.latestRawDate)
          ) {
            existingGroup.latestRawDate = rawDate;
          }
          existingGroup.items.push(lineItem);
        } else {
          groupedLoanMap.set(groupKey, {
            loan,
            totalRealizedMargin: marginPortion,
            totalPaidInPeriod: paidAmt,
            totalPrincipalInPeriod: principalPortion,
            installmentCount: 1,
            latestRawDate: rawDate,
            items: [lineItem],
          });
        }
      }

      for (const [groupKey, group] of groupedLoanMap.entries()) {
        group.items.sort((a, b) => {
          if (a.periodNumber != null && b.periodNumber != null && a.periodNumber !== b.periodNumber) {
            return a.periodNumber - b.periodNumber;
          }
          const timeDiff =
            getSafeTimeLocal(a.rawPaymentDate || '') - getSafeTimeLocal(b.rawPaymentDate || '');
          if (timeDiff !== 0) return timeDiff;
          return String(a.receiptNumber || '').localeCompare(String(b.receiptNumber || ''));
        });

        const loan = group.loan;
        const member = loan?.member_id ? memberMap[String(loan.member_id)] : undefined;
        const hasMargin = group.totalRealizedMargin > 0;
        const isPaidOff = ['paid_off', 'lunas', 'completed', 'settled'].includes(
          String(loan?.status || '').trim().toLowerCase()
        );
        const subLabel = `${group.installmentCount} Angsuran${isPaidOff ? ' • Lunas Penuh' : ''}`;
        const referenceNumber = String(
          loan?.loan_number ||
          group.items[0]?.receiptNumber ||
          `LOAN-${groupKey.slice(0, 8).toUpperCase()}`
        );

        shuReferenceRows.push({
          id: `loan-contract-${groupKey}`,
          referenceNumber,
          subLabel,
          sourceType: 'LOAN_CONTRACT',
          transactionDate: formatDisplayDateId(group.latestRawDate),
          rawDate: group.latestRawDate,
          memberName: member?.nama || 'Pelanggan Umum',
          memberNrp: member?.nrp ?? '',
          paymentMethodLabel: hasMargin ? 'Margin Pembiayaan' : 'Pinjaman Reguler (0% Jasa)',
          omzet: group.totalRealizedMargin,
          hpp: 0,
          grossProfit: group.totalRealizedMargin,
          marginPercent: hasMargin ? 100 : 0,
          repaymentAmount: group.totalPaidInPeriod,
          principalPortion: group.totalPrincipalInPeriod,
          loanNumber: loan?.loan_number ?? null,
          installmentCount: group.installmentCount,
          isPaidOff,
          items: group.items,
        });
      }
    }
  } catch (goodsMarginErr) {
    console.warn('Gagal menghitung pendapatan margin pembiayaan barang:', goodsMarginErr);
  }

  // 4b. Dampak Penyesuaian Stock Opname Harian (Surplus / Susut Nilai HPP)
  let opnameShrinkageLoss = 0;
  let opnameSurplusGain = 0;
  try {
    const opnameAdjRes = await fetchAllPaginatedSafe<any>(() => {
      const tbl: any = supabase.from('stock_opname_adjustments');
      if (!tbl || typeof tbl.select !== 'function') return null;
      let q: any = tbl.select('id, task_id, product_id, reference_no, qty_in, qty_out, unit_cost, total_value, notes, created_at');
      if (!q) return null;
      if (typeof q.gte === 'function') q = q.gte('created_at', startDate);
      if (q && typeof q.lte === 'function') q = q.lte('created_at', endDate + 'T23:59:59');
      return q;
    });

    const adjRows: any[] = !opnameAdjRes?.error && Array.isArray(opnameAdjRes?.data)
      ? opnameAdjRes.data
      : [];

    if (adjRows.length > 0) {
      const adjProdIds = Array.from(
        new Set(adjRows.map((a: any) => a.product_id).filter(Boolean).map(String))
      );
      const adjProdMap: Record<string, { name: string; category_id?: string | null }> = {};
      if (adjProdIds.length > 0) {
        const prodRes = await fetchInChunksPaginated(
          'products',
          ['id, name, category_id'],
          'id',
          adjProdIds
        );
        for (const p of prodRes?.data || []) {
          adjProdMap[String(p.id)] = { name: String(p.name || 'Produk'), category_id: p.category_id };
        }
      }

      for (const adj of adjRows) {
        const qtyIn = Number(adj.qty_in || 0);
        const qtyOut = Number(adj.qty_out || 0);
        const unitCost = Number(adj.unit_cost || 0);
        const surplusVal = qtyIn * unitCost;
        const shrinkageVal = qtyOut * unitCost;
        const netVal = surplusVal - shrinkageVal;

        opnameSurplusGain += surplusVal;
        opnameShrinkageLoss += shrinkageVal;

        const prod = adjProdMap[String(adj.product_id)];
        const rawDate = String(adj.created_at || '');
        const qtyDisplay = qtyIn > 0 ? qtyIn : qtyOut;

        shuReferenceRows.push({
          id: `opname-${String(adj.id)}`,
          referenceNumber: String(adj.reference_no || `OPN-${String(adj.id).slice(0, 8).toUpperCase()}`),
          sourceType: 'stock_opname',
          transactionDate: formatDisplayDateId(rawDate),
          rawDate,
          memberName: 'Audit Inventori Gudang',
          memberNrp: '',
          paymentMethodLabel: qtyIn > 0 ? 'Surplus Stock Opname' : 'Selisih Kurang Opname',
          omzet: surplusVal,
          hpp: shrinkageVal,
          grossProfit: netVal,
          marginPercent: 0,
          items: [
            {
              productName: prod?.name || adj.notes || 'Penyesuaian Opname',
              categoryName: 'Stock Opname',
              qty: qtyDisplay,
              sellPrice: qtyIn > 0 ? unitCost : 0,
              buyPrice: unitCost,
              subtotalOmzet: surplusVal,
              subtotalHpp: shrinkageVal,
              subtotalProfit: netVal,
            },
          ],
        });
      }
    }
  } catch (opnameErr) {
    console.warn('Gagal menghitung dampak selisih stock opname ke SHU:', opnameErr);
  }

  const opnameNetImpact = opnameSurplusGain - opnameShrinkageLoss;

  const getSafeTime = (raw: string): number => {
    if (!raw) return 0;
    const ms = new Date(raw).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };
  shuReferenceRows.sort((a, b) => getSafeTime(b.rawDate) - getSafeTime(a.rawDate));

  const grossProfit = grossSales - cogs;
  const estimatedShu = grossProfit + goodsFinancingMargin + opnameNetImpact - opex;
  const totalRevenue = grossSales + goodsFinancingMargin;
  const marginPct = totalRevenue > 0 ? (estimatedShu / totalRevenue) * 100 : 0;

  const marginPerKategori: MarginKategori[] = Object.values(marginMap).map(m => ({
    kategori: m.kategori,
    omzet: m.omzet,
    hpp: m.hpp,
    laba_kotor: m.omzet - m.hpp,
    gross_margin_pct: m.omzet > 0 ? ((m.omzet - m.hpp) / m.omzet) * 100 : 0,
  }));

  return {
    grossSales,
    cogs,
    grossProfit,
    goodsFinancingMargin,
    ...(opnameShrinkageLoss !== 0 || opnameSurplusGain !== 0
      ? {
          opnameShrinkageLoss,
          opnameSurplusGain,
          opnameNetImpact,
        }
      : {}),
    opex,
    estimatedShu,
    marginPercentage: marginPct,
    marginPerKategori,
    shuReferenceRows,
  };
}

// ─── Deep-Link Highlight Helpers ─────────────────────────────────────────────

export function extractReceiptPeriodNumber(receipt?: string): string | null {
  if (!receipt) return null;
  const match = String(receipt).match(/\/B(\d+)(?:\/|$)/i);
  return match ? match[1] : null;
}

export function getHighlightedShuRowIds(
  rows: ShuReferenceRow[],
  ref: string,
  receipt: string
): Set<string> {
  const normRef = ref.trim().toLowerCase();
  const normReceipt = receipt.trim().toLowerCase();
  if (!normRef && !normReceipt) return new Set();

  if (normReceipt) {
    const exactOrSub = rows.filter((row) => {
      const rNo = String(row.referenceNumber || '').toLowerCase();
      if (rNo === normReceipt || rNo.includes(normReceipt)) return true;
      return (row.items ?? []).some((it) =>
        String(it.receiptNumber || '').toLowerCase().includes(normReceipt)
      );
    });
    if (exactOrSub.length > 0) {
      return new Set(exactOrSub.map((r) => r.id));
    }
  }

  if (normRef) {
    const refMatched = rows.filter((row) => {
      const rNo = String(row.referenceNumber || '').toLowerCase();
      const lNo = String(row.loanNumber || '').toLowerCase();
      return rNo.includes(normRef) || lNo.includes(normRef);
    });
    return new Set(refMatched.map((r) => r.id));
  }

  return new Set();
}

export function getHighlightedCashFlowRowIds(
  rows: CashFlowTransaction[],
  ref: string,
  receipt: string,
  txDate?: string
): Set<string> {
  const normRef = ref.trim().toLowerCase();
  const normReceipt = receipt.trim().toLowerCase();
  const normDate = (txDate || '').trim();
  if (!normRef && !normReceipt) return new Set();

  if (normReceipt) {
    const receiptMatches = rows.filter((r) => {
      const rRef = String(r.referensi || '').toLowerCase();
      const rDesc = String(r.deskripsi || '').toLowerCase();
      return rRef.includes(normReceipt) || rDesc.includes(normReceipt);
    });
    if (receiptMatches.length > 0) {
      return new Set(receiptMatches.map((r) => r.id));
    }
  }

  if (!normRef) return new Set();

  let candidates = rows.filter((r) => {
    const rRef = String(r.referensi || '').toLowerCase();
    const rDesc = String(r.deskripsi || '').toLowerCase();
    const rId = String(r.reference_id || '').toLowerCase();
    return rRef.includes(normRef) || rDesc.includes(normRef) || rId.includes(normRef);
  });

  if (candidates.length > 1) {
    const periodNum = extractReceiptPeriodNumber(receipt);
    if (periodNum) {
      const periodRegex = new RegExp(`(?:bln\\s*)?ke-?${periodNum}(?:\\D|$)`, 'i');
      const periodMatches = candidates.filter((r) =>
        periodRegex.test(String(r.deskripsi || ''))
      );
      if (periodMatches.length > 0) {
        const repaymentMatches = periodMatches.filter(
          (r) => String(r.kategori || '').toLowerCase() === 'angsuran_pinjaman'
        );
        candidates = repaymentMatches.length > 0 ? repaymentMatches : periodMatches;
      }
    }

    if (candidates.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(normDate)) {
      const dateMatches = candidates.filter(
        (r) => String(r.created_at || '').slice(0, 10) === normDate
      );
      if (dateMatches.length > 0) {
        candidates = dateMatches;
      }
    }
  }

  return new Set(candidates.map((r) => r.id));
}

const ResetRefFilterButton = ({ onReset }: { onReset: () => void }) => (
  <button
    type="button"
    onClick={onReset}
    data-testid="reset-ref-filter-btn"
    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
  >
    <RotateCcw className="w-3.5 h-3.5" />
    <span>Reset Filter Referensi</span>
  </button>
);

// ─── Main Page Component ──────────────────────────────────────────────────────

export interface LaporanKeuanganProps {
  initialSelectedCashFlowRef?: CashFlowTransaction | null;
  initialStoreCreditSummary?: OutstandingStoreCreditSummary | null;
  initialActiveTab?: 'cashflow' | 'shu';
  initialCashFlowData?: CashFlowData | null;
  initialCashFlowSearchQuery?: string;
  initialSelectedCategories?: string[];
  initialCategoryDropdownOpen?: boolean;
  initialShuData?: ShuEstimationData | null;
  initialSelectedShuRef?: ShuReferenceRow | null;
  initialShuSearchQuery?: string;
  initialShuSourceFilter?: ShuSourceFilterMode;
  initialStartDate?: string;
  initialEndDate?: string;
  initialClosedFiscalYear?: FiscalYearClosingRecord | null;
  initialDateSortOrder?: 'asc' | 'desc';
  initialOrphanCount?: number;
}

interface LaporanKeuanganContentProps extends LaporanKeuanganProps {
  urlTab?: 'cashflow' | 'shu' | null;
  urlRef?: string;
  urlReceipt?: string;
  urlDate?: string;
  urlOpenRef?: string;
  onClearUrlParams?: () => void;
  onClearOpenRef?: () => void;
}

function LaporanKeuanganContent({
  initialSelectedCashFlowRef = null,
  initialStoreCreditSummary = null,
  initialActiveTab = 'cashflow',
  initialCashFlowData = null,
  initialCashFlowSearchQuery = '',
  initialSelectedCategories = [],
  initialCategoryDropdownOpen = false,
  initialShuData = null,
  initialSelectedShuRef = null,
  initialShuSearchQuery = '',
  initialShuSourceFilter = 'default_shu_and_paid_off',
  initialStartDate,
  initialEndDate,
  initialClosedFiscalYear = null,
  initialDateSortOrder = 'asc',
  initialOrphanCount,
  urlTab = null,
  urlRef = '',
  urlReceipt = '',
  urlDate = '',
  urlOpenRef = '',
  onClearUrlParams,
  onClearOpenRef,
}: LaporanKeuanganContentProps = {}) {
  const { showToast } = useFeedback();
  const inRouter = useInRouterContext();
  const initialSearchValue = (urlRef || urlReceipt).trim();
  const [activeTab, setActiveTab] = useState<'cashflow' | 'shu'>(urlTab ?? initialActiveTab);
  const defaultStartDate = initialStartDate || startOfMonth;
  const defaultEndDate = initialEndDate || todayStr;
  const [startDate, setStartDate] = useState(
    urlDate && urlDate < defaultStartDate ? urlDate : defaultStartDate
  );
  const [endDate, setEndDate] = useState(
    urlDate && urlDate > defaultEndDate ? urlDate : defaultEndDate
  );
  const formattedStartDate = formatDateDdMmYyyy(startDate);
  const [unit, setUnit] = useState('all');
  const [loading, setLoading] = useState(false);

  const [cashFlowData, setCashFlowData] = useState<CashFlowData | null>(initialCashFlowData);
  const [shuData, setShuData] = useState<ShuEstimationData | null>(initialShuData);
  const [closedFiscalYear, setClosedFiscalYear] = useState<FiscalYearClosingRecord | null>(
    initialClosedFiscalYear
  );
  const filteredFiscalYear =
    Number(String(endDate || startDate || '2026').slice(0, 4)) || new Date().getFullYear();
  const [storeCreditSummary, setStoreCreditSummary] = useState<OutstandingStoreCreditSummary>(
    initialStoreCreditSummary ?? {
      totalOutstandingReceivable: 0,
      activeDebtorsCount: 0,
      totalCreditSales: 0,
      totalRepaid: 0,
    }
  );
  const [cashFlowSearchQuery, setCashFlowSearchQuery] = useState<string>(
    (urlTab === 'cashflow' || (!urlTab && initialSearchValue)) && initialSearchValue
      ? initialSearchValue
      : initialCashFlowSearchQuery
  );
  const [cashFlowPage, setCashFlowPage] = useState<number>(1);
  const [cashFlowPageInput, setCashFlowPageInput] = useState<string>('1');
  const [cashFlowPageSize, setCashFlowPageSize] = useState<number>(10);
  const [dateSortOrder, setDateSortOrder] = useState<'asc' | 'desc'>(initialDateSortOrder);
  const [selectedCashFlowRef, setSelectedCashFlowRef] = useState<CashFlowTransaction | null>(
    initialSelectedCashFlowRef ?? null
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialSelectedCategories
  );
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(
    initialCategoryDropdownOpen
  );
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);

  // State Pencarian, Filter Sumber, Pagination & Drill-Down Tabel Estimasi SHU
  const [shuSearchQuery, setShuSearchQuery] = useState<string>(
    urlTab === 'shu' && initialSearchValue ? initialSearchValue : initialShuSearchQuery
  );
  const [shuSourceFilter, setShuSourceFilter] = useState<ShuSourceFilterMode>(
    initialShuSourceFilter
  );
  const [shuCurrentPage, setShuCurrentPage] = useState<number>(1);
  const [shuPageSize, setShuPageSize] = useState<number>(10);
  const [selectedShuRef, setSelectedShuRef] = useState<ShuReferenceRow | null>(
    initialSelectedShuRef ?? null
  );

  // State Highlight Deep-Link Referensi URL
  const [activeHighlightRef, setActiveHighlightRef] = useState<string>(urlRef);
  const [activeHighlightReceipt, setActiveHighlightReceipt] = useState<string>(urlReceipt);
  const [activeHighlightDate, setActiveHighlightDate] = useState<string>(urlDate);

  const [orphanCount, setOrphanCount] = useState<number>(initialOrphanCount ?? 0);

  const urlDeepLinkKey = `${urlTab ?? ''}|${urlRef}|${urlReceipt}|${urlDate}|${urlOpenRef}`;
  const appliedUrlKeyRef = useRef<string>(urlDeepLinkKey);
  const lastAutoPagedKeyRef = useRef<string>('');
  const lastScrolledKeyRef = useRef<string>('');
  const lastAutoOpenedRefRef = useRef<string>('');

  // Sinkronisasi apabila parameter deep-link URL berubah saat halaman tetap mounted
  useEffect(() => {
    if (urlDeepLinkKey === appliedUrlKeyRef.current) return;
    appliedUrlKeyRef.current = urlDeepLinkKey;
    lastAutoPagedKeyRef.current = '';
    lastScrolledKeyRef.current = '';

    if (!urlTab && !urlRef && !urlReceipt && !urlDate && !urlOpenRef) return;

    if (urlTab) {
      setActiveTab(urlTab);
    }
    if (urlDate) {
      setStartDate((prev) => (urlDate < prev ? urlDate : prev));
      setEndDate((prev) => (urlDate > prev ? urlDate : prev));
    }

    const nextSearch = (urlRef || urlReceipt).trim();
    setActiveHighlightRef(urlRef);
    setActiveHighlightReceipt(urlReceipt);
    setActiveHighlightDate(urlDate);

    if (urlTab === 'shu') {
      setShuSearchQuery(nextSearch);
      setShuCurrentPage(1);
    } else if (urlTab === 'cashflow' || nextSearch) {
      setCashFlowSearchQuery(nextSearch);
      setSelectedCategories([]);
      setCashFlowPage(1);
    }
  }, [urlDeepLinkKey, urlTab, urlRef, urlReceipt, urlDate]);

  useEffect(() => {
    if (!isCategoryDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCategoryDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCategoryDropdownOpen]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cf, shu, creditSummary, fiscalClosing] = await Promise.all([
        getCashFlowReport(startDate, endDate, unit),
        getShuEstimation(startDate, endDate),
        getOutstandingStoreCreditSummary().catch(() => ({
          totalOutstandingReceivable: 0,
          activeDebtorsCount: 0,
          totalCreditSales: 0,
          totalRepaid: 0,
        })),
        getFiscalYearClosing(filteredFiscalYear).catch(() => null),
      ]);
      setCashFlowData(cf);
      setShuData(shu);
      setStoreCreditSummary(creditSummary);
      setClosedFiscalYear(fiscalClosing);
    } catch (e) {
      console.error('fetchData error:', e);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, unit, filteredFiscalYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (initialOrphanCount !== undefined) return;
    let cancelled = false;
    const loadOrphanStatus = () => {
      scanAllOrphanRecords()
        .then((res) => {
          if (!cancelled) {
            setOrphanCount(res.summary.totalCount);
          }
        })
        .catch(() => { });
    };
    loadOrphanStatus();
    const handleUpdated = () => loadOrphanStatus();
    if (typeof window !== 'undefined') {
      window.addEventListener(ORPHAN_AUDIT_UPDATED_EVENT, handleUpdated);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener(ORPHAN_AUDIT_UPDATED_EVENT, handleUpdated);
      }
    };
  }, [initialOrphanCount]);

  useEffect(() => {
    setCashFlowPage(1);
  }, [cashFlowSearchQuery, cashFlowPageSize, startDate, endDate, unit]);

  useEffect(() => {
    setShuCurrentPage(1);
  }, [shuSearchQuery, shuSourceFilter, shuPageSize, startDate, endDate, unit]);

  const rawCashFlowTransactions = cashFlowData?.transactions ?? [];
  const openingCashBalance = Number(cashFlowData?.openingBalance ?? 0);
  const dedupedRawTransactions = deduplicateClearanceRowsInMemory(rawCashFlowTransactions);
  const hadInMemoryClearanceDupes =
    dedupedRawTransactions.length < rawCashFlowTransactions.length;
  const cashFlowTransactions = hadInMemoryClearanceDupes
    ? (() => {
      let running = openingCashBalance;
      return [...dedupedRawTransactions]
        .sort(compareCashFlowChronological)
        .map((tx) => {
          running += Number(tx.kas_masuk || 0) - Number(tx.kas_keluar || 0);
          return { ...tx, saldo_berjalan: running };
        });
    })()
    : rawCashFlowTransactions;

  // Auto-open CashFlowReferenceModal when ?openRef=CF-... is present in URL
  useEffect(() => {
    if (!urlOpenRef) {
      lastAutoOpenedRefRef.current = '';
      return;
    }
    if (loading) return;

    const normalized = urlOpenRef.trim().toLowerCase();
    if (lastAutoOpenedRefRef.current === normalized) return;

    const matchedTx = cashFlowTransactions.find(
      (tx) => String(tx.referensi || '').trim().toLowerCase() === normalized
    );
    if (matchedTx) {
      lastAutoOpenedRefRef.current = normalized;
      setActiveTab('cashflow');
      setSelectedCashFlowRef(matchedTx);
    }
  }, [urlOpenRef, loading, cashFlowTransactions]);
  const availableCategoryOptions = useMemo(
    () => buildCashFlowCategoryOptions(cashFlowTransactions),
    [cashFlowTransactions]
  );

  const toggleCategoryFilter = (categoryLabel: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryLabel)
        ? prev.filter((item) => item !== categoryLabel)
        : [...prev, categoryLabel]
    );
    setCashFlowPage(1);
  };

  const handleClearCategoryFilters = () => {
    setSelectedCategories([]);
    setCashFlowPage(1);
  };

  const normalizedCashFlowQuery = cashFlowSearchQuery.trim().toLowerCase();
  const hasActiveCashFlowFilter =
    Boolean(normalizedCashFlowQuery) || selectedCategories.length > 0;
  const filteredCashFlowTransactions = filterCashFlowTransactions(
    cashFlowTransactions,
    cashFlowSearchQuery,
    selectedCategories
  );
  const sortedCashFlowTransactions = useMemo(
    () => sortCashFlowTransactionsByDate(filteredCashFlowTransactions, dateSortOrder),
    [filteredCashFlowTransactions, dateSortOrder]
  );
  const totalCashFlowItems = sortedCashFlowTransactions.length;
  const totalCashFlowPages = Math.max(1, Math.ceil(totalCashFlowItems / cashFlowPageSize));
  const safeCashFlowPage = Math.min(cashFlowPage, totalCashFlowPages);
  const cashFlowStartIndex = (safeCashFlowPage - 1) * cashFlowPageSize;
  const cashFlowEndIndex = Math.min(cashFlowStartIndex + cashFlowPageSize, totalCashFlowItems);
  const paginatedCashFlow = sortedCashFlowTransactions.slice(cashFlowStartIndex, cashFlowEndIndex);

  useEffect(() => {
    setCashFlowPageInput(String(safeCashFlowPage));
  }, [safeCashFlowPage]);

  const commitCashFlowPageJump = () => {
    const targetPage = resolveJumpPage(cashFlowPageInput, safeCashFlowPage, totalCashFlowPages);
    setCashFlowPage(targetPage);
    setCashFlowPageInput(String(targetPage));
  };

  const filteredCashFlowInflow = filteredCashFlowTransactions.reduce(
    (sum, r) => sum + Number(r.kas_masuk || 0),
    0
  );
  const filteredCashFlowOutflow = filteredCashFlowTransactions.reduce(
    (sum, r) => sum + Number(r.kas_keluar || 0),
    0
  );
  const filteredCashFlowNet = filteredCashFlowInflow - filteredCashFlowOutflow;
  const effectiveInflowTotal = hadInMemoryClearanceDupes
    ? cashFlowTransactions.reduce((sum, r) => sum + Number(r.kas_masuk || 0), 0)
    : (cashFlowData?.inflowTotal ?? 0);
  const effectiveOutflowTotal = hadInMemoryClearanceDupes
    ? cashFlowTransactions.reduce((sum, r) => sum + Number(r.kas_keluar || 0), 0)
    : (cashFlowData?.outflowTotal ?? 0);
  const effectiveNetCashflow = hadInMemoryClearanceDupes
    ? effectiveInflowTotal - effectiveOutflowTotal
    : (cashFlowData?.netCashflow ?? 0);
  const endingVaultBalance = hadInMemoryClearanceDupes
    ? openingCashBalance + effectiveInflowTotal - effectiveOutflowTotal
    : (cashFlowData?.closingBalance ?? (openingCashBalance + effectiveNetCashflow));
  const displayedCashFlowInflow = hasActiveCashFlowFilter
    ? filteredCashFlowInflow
    : effectiveInflowTotal;
  const displayedCashFlowOutflow = hasActiveCashFlowFilter
    ? filteredCashFlowOutflow
    : effectiveOutflowTotal;
  const displayedCashFlowNet = hasActiveCashFlowFilter
    ? filteredCashFlowNet
    : endingVaultBalance;

  const shuReferenceRows = shuData?.shuReferenceRows ?? [];
  const sourceFilteredShuRows = filterShuRowsBySource(shuReferenceRows, shuSourceFilter);
  const normalizedShuQuery = shuSearchQuery.trim().toLowerCase();
  const filteredShuRows = normalizedShuQuery
    ? sourceFilteredShuRows.filter((row) => {
      const refMatch = row.referenceNumber.toLowerCase().includes(normalizedShuQuery);
      const loanMatch = String(row.loanNumber || '').toLowerCase().includes(normalizedShuQuery);
      const receiptMatch = (row.items ?? []).some((it) =>
        String(it.receiptNumber || '').toLowerCase().includes(normalizedShuQuery)
      );
      const nameMatch = row.memberName.toLowerCase().includes(normalizedShuQuery);
      const nrpMatch = row.memberNrp.toLowerCase().includes(normalizedShuQuery);
      const methodMatch = row.paymentMethodLabel.toLowerCase().includes(normalizedShuQuery);
      return refMatch || loanMatch || receiptMatch || nameMatch || nrpMatch || methodMatch;
    })
    : sourceFilteredShuRows;
  const totalShuItems = filteredShuRows.length;
  const totalShuPages = Math.max(1, Math.ceil(totalShuItems / shuPageSize));
  const safeShuPage = Math.min(shuCurrentPage, totalShuPages);
  const shuStartIndex = (safeShuPage - 1) * shuPageSize;
  const shuEndIndex = Math.min(shuStartIndex + shuPageSize, totalShuItems);
  const paginatedShuRows = filteredShuRows.slice(shuStartIndex, shuEndIndex);

  const highlightedCashFlowIds = getHighlightedCashFlowRowIds(
    filteredCashFlowTransactions,
    activeHighlightRef,
    activeHighlightReceipt,
    activeHighlightDate
  );
  const highlightedShuIds = getHighlightedShuRowIds(
    filteredShuRows,
    activeHighlightRef,
    activeHighlightReceipt
  );
  const hasActiveUrlRef = Boolean(activeHighlightRef || activeHighlightReceipt);

  const handleResetReferenceFilter = () => {
    setShuSearchQuery('');
    setShuSourceFilter('default_shu_and_paid_off');
    setCashFlowSearchQuery('');
    setSelectedCategories([]);
    setActiveHighlightRef('');
    setActiveHighlightReceipt('');
    setActiveHighlightDate('');
    setCashFlowPage(1);
    setShuCurrentPage(1);
    lastAutoPagedKeyRef.current = '';
    lastScrolledKeyRef.current = '';
    onClearUrlParams?.();
  };

  const autoPageKey = `${activeTab}|${activeHighlightRef}|${activeHighlightReceipt}|${activeHighlightDate}|${filteredCashFlowTransactions.length}|${filteredShuRows.length}`;
  useEffect(() => {
    if (loading || !hasActiveUrlRef) return;
    if (lastAutoPagedKeyRef.current === autoPageKey) return;

    if (activeTab === 'cashflow' && highlightedCashFlowIds.size > 0) {
      const idx = sortedCashFlowTransactions.findIndex((r) =>
        highlightedCashFlowIds.has(r.id)
      );
      if (idx >= 0) {
        lastAutoPagedKeyRef.current = autoPageKey;
        const targetPage = Math.floor(idx / cashFlowPageSize) + 1;
        if (targetPage !== cashFlowPage) {
          setCashFlowPage(targetPage);
        }
      }
    } else if (activeTab === 'shu' && highlightedShuIds.size > 0) {
      const idx = filteredShuRows.findIndex((r) => highlightedShuIds.has(r.id));
      if (idx >= 0) {
        lastAutoPagedKeyRef.current = autoPageKey;
        const targetPage = Math.floor(idx / shuPageSize) + 1;
        if (targetPage !== shuCurrentPage) {
          setShuCurrentPage(targetPage);
        }
      }
    }
  }, [
    loading,
    hasActiveUrlRef,
    autoPageKey,
    activeTab,
    highlightedCashFlowIds,
    highlightedShuIds,
    sortedCashFlowTransactions,
    filteredShuRows,
    cashFlowPageSize,
    cashFlowPage,
    shuPageSize,
    shuCurrentPage,
  ]);

  const highlightScrollKey = `${activeTab}|${activeHighlightRef}|${activeHighlightReceipt}|${safeCashFlowPage}|${safeShuPage}|${highlightedCashFlowIds.size}|${highlightedShuIds.size}`;
  useEffect(() => {
    if (loading || !hasActiveUrlRef) return;
    if (typeof document === 'undefined') return;

    const hasMatch =
      activeTab === 'cashflow'
        ? highlightedCashFlowIds.size > 0
        : highlightedShuIds.size > 0;
    if (!hasMatch) return;
    if (lastScrolledKeyRef.current === highlightScrollKey) return;

    const targetRow = document.querySelector<HTMLElement>('tr[data-highlighted-ref="true"]');
    if (targetRow) {
      lastScrolledKeyRef.current = highlightScrollKey;
      if (typeof targetRow.scrollIntoView === 'function') {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [
    loading,
    hasActiveUrlRef,
    activeTab,
    highlightedCashFlowIds.size,
    highlightedShuIds.size,
    highlightScrollKey,
  ]);

  const filteredShuTotalOmzet = filteredShuRows.reduce((sum, r) => sum + Number(r.omzet || 0), 0);
  const filteredShuTotalHpp = filteredShuRows.reduce((sum, r) => sum + Number(r.hpp || 0), 0);
  const filteredShuTotalProfit = filteredShuRows.reduce(
    (sum, r) => sum + Number(r.grossProfit || 0),
    0
  );
  const filteredShuTotalMarginPct =
    filteredShuTotalOmzet > 0
      ? (filteredShuTotalProfit / filteredShuTotalOmzet) * 100
      : 0;

  // Quick preset handlers
  const applyPreset = (preset: 'today' | 'thisMonth' | 'year2026') => {
    const d = new Date();
    if (preset === 'today') {
      setStartDate(todayStr); setEndDate(todayStr);
    } else if (preset === 'thisMonth') {
      setStartDate(getLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1)));
      setEndDate(todayStr);
    } else {
      setStartDate('2026-01-01'); setEndDate('2026-12-31');
    }
  };

  // ── Export Excel (client-side via exceljs) ───────────────────────────────
  const handleExportExcel = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'SIMKOP Enterprise';
      wb.created = new Date();

      if (cashFlowData) {
        const wsCf = wb.addWorksheet('Arus Kas');
        const cfExportRows = buildCashFlowExportSheetRows({
          startDate,
          endDate,
          transactions: sortedCashFlowTransactions,
          inflowTotal: displayedCashFlowInflow,
          outflowTotal: displayedCashFlowOutflow,
          netCashflow: displayedCashFlowNet,
          openingBalance: hasActiveCashFlowFilter ? 0 : openingCashBalance,
          selectedCategories,
          searchQuery: cashFlowSearchQuery.trim(),
        });
        for (const row of cfExportRows) {
          wsCf.addRow(row);
        }
      }

      if (shuData) {
        const wsShu = wb.addWorksheet('Estimasi SHU');
        wsShu.addRow(['LAPORAN ESTIMASI SHU SIMKOP']);
        wsShu.addRow([`Periode: ${startDate} s/d ${endDate}`]);
        wsShu.addRow([]);
        wsShu.addRow(['Komponen', 'Jumlah (Rp)']);
        wsShu.addRow(['Total Omzet Penjualan', shuData.grossSales]);
        wsShu.addRow(['HPP / Modal Barang', shuData.cogs]);
        wsShu.addRow(['Laba Kotor', shuData.grossProfit]);
        wsShu.addRow(['Pendapatan Margin Pembiayaan Barang', shuData.goodsFinancingMargin]);
        wsShu.addRow(['Koreksi Selisih Stock Opname (Net HPP)', shuData.opnameNetImpact ?? 0]);
        wsShu.addRow(['Beban Operasional', shuData.opex]);
        wsShu.addRow(['Estimasi SHU Bersih', shuData.estimatedShu]);
        wsShu.addRow([]);
        if (shuData.shuReferenceRows) {
          wsShu.addRow([
            'Tanggal',
            'No. Referensi',
            'Sumber / Metode',
            'Anggota / Pembeli',
            'Omzet (Rp)',
            'HPP / Modal (Rp)',
            'Laba Kotor (Rp)',
            'Margin %',
          ]);
          let exportOmzet = 0;
          let exportHpp = 0;
          let exportProfit = 0;
          for (const row of shuData.shuReferenceRows) {
            const buyer = row.memberNrp ? `${row.memberNrp} - ${row.memberName}` : row.memberName;
            wsShu.addRow([
              row.transactionDate,
              row.referenceNumber,
              row.paymentMethodLabel,
              buyer,
              row.omzet,
              row.hpp,
              row.grossProfit,
              row.marginPercent.toFixed(1) + '%',
            ]);
            exportOmzet += row.omzet;
            exportHpp += row.hpp;
            exportProfit += row.grossProfit;
          }
          const exportMarginPct = exportOmzet > 0 ? (exportProfit / exportOmzet) * 100 : 0;
          wsShu.addRow([
            '',
            '',
            '',
            'TOTAL',
            exportOmzet,
            exportHpp,
            exportProfit,
            exportMarginPct.toFixed(1) + '%',
          ]);
        } else {
          wsShu.addRow(['Kategori Produk', 'Omzet', 'HPP', 'Laba Kotor', 'Gross Margin %']);
          for (const m of shuData.marginPerKategori) {
            wsShu.addRow([m.kategori, m.omzet, m.hpp, m.laba_kotor, m.gross_margin_pct.toFixed(1) + '%']);
          }
        }
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-keuangan-${startDate}-${endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Laporan keuangan berhasil diexport ke Excel', 'success');
    } catch (e) {
      console.error('Excel export error:', e);
      showToast('Gagal export Excel. Pastikan exceljs terinstall: npm install exceljs', 'error');
    }
  };

  // ── Print PDF (client-side) ──────────────────────────────────────────────
  const handlePrintPDF = () => window.print();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      {/* Print-only style */}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col gap-1 pb-2 border-b border-outline-variant/30">
        <div className="flex items-center gap-2 text-label-md font-label-md text-on-surface-variant text-[12px] no-print">
          <span className="font-bold text-primary">SIMKOP</span>
          <span className="text-outline-variant">/</span>
          <span>Laporan</span>
          <span className="text-outline-variant">/</span>
          <span className="text-secondary font-semibold">Laporan Keuangan Terpadu</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary" style={{ fontFamily: "'IBM Plex Serif', serif" }}>
              Laporan Keuangan Terpadu
            </h1>
            <p className="text-body-md text-on-surface-variant mt-0.5">
              Ringkasan arus kas dan estimasi SHU berjalan koperasi
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 no-print">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[12px] font-semibold border border-primary/20">
              <span className="material-symbols-outlined text-[16px]">event</span>
              Periode Fiskal: Tahun Buku {filteredFiscalYear}
            </span>
            {closedFiscalYear?.status === 'CLOSED' && (
              <span
                data-testid="laporan-fiscal-closed-badge"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-bold border border-emerald-300"
              >
                <span className="material-symbols-outlined text-[15px]">lock</span>
                TERKUNCI (CLOSED)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── BANNER STATUS TAHUN BUKU TERKUNCI (CLOSED) ── */}
      {closedFiscalYear?.status === 'CLOSED' && (
        <div
          data-testid="fiscal-year-closed-banner"
          className="rounded-xl border border-emerald-300 bg-emerald-50/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print"
        >
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined text-emerald-700 text-[20px] mt-0.5">verified</span>
            <div className="text-xs text-emerald-900">
              <p className="font-bold">
                Tahun Buku {closedFiscalYear.fiscal_year} Telah Ditutup Resmi (Status: CLOSED)
              </p>
              <p className="text-emerald-800 mt-0.5">
                SHU Bersih {formatRp(closedFiscalYear.net_shu_amount)} • SHU Anggota {formatRp(closedFiscalYear.member_shu_total)} • Saldo awal Tahun Buku {closedFiscalYear.fiscal_year + 1} dibuka per 1 Januari {closedFiscalYear.fiscal_year + 1}.
              </p>
            </div>
          </div>
          {inRouter ? (
            <Link
              to="/admin/tutup-buku"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-100/70 transition-colors whitespace-nowrap"
            >
              Lihat Arsip &amp; Cetak Berita Acara RAT →
            </Link>
          ) : (
            <a
              href="/admin/tutup-buku"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-100/70 transition-colors whitespace-nowrap"
            >
              Lihat Arsip &amp; Cetak Berita Acara RAT →
            </a>
          )}
        </div>
      )}

      {/* ── FILTER TOOLBAR ── */}
      <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm no-print">
        <div className="flex flex-wrap items-end gap-4">
          {/* Dates */}
          <div className="flex flex-wrap items-end gap-3 flex-1">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Dari Tanggal</label>
              <input
                type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border border-outline-variant/50 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Sampai Tanggal</label>
              <input
                type="date" value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="border border-outline-variant/50 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20"
              />
            </div>
            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 pb-0.5">
              {[['today', 'Hari Ini'], ['thisMonth', 'Bulan Ini'], ['year2026', 'Tahun 2026']].map(([p, l]) => (
                <button
                  key={p}
                  onClick={() => applyPreset(p as any)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-semibold border border-outline-variant/40 text-on-surface-variant hover:bg-secondary/10 hover:text-secondary hover:border-secondary/40 transition-colors"
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Unit Filter */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Filter Unit Usaha</label>
            <select
              value={unit} onChange={e => setUnit(e.target.value)}
              className="border border-outline-variant/50 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-secondary"
            >
              <option value="all">Semua Unit</option>
              <option value="retail">Retail Toko</option>
              <option value="simpan_pinjam">Simpan Pinjam</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pb-0.5">
            <button
              onClick={() => {
                setCashFlowPage(1);
                setShuCurrentPage(1);
                fetchData();
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">filter_alt</span>
              Terapkan
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export Excel
            </button>
            <button
              onClick={handlePrintPDF}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-500 text-rose-600 text-sm font-semibold hover:bg-rose-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              Download PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── TAB SWITCHER ── */}
      <div className="flex items-center gap-1 border-b border-outline-variant/30 no-print">
        {[
          { key: 'cashflow', label: 'Arus Kas (Cash Flow)', icon: 'account_balance_wallet' },
          { key: 'shu', label: 'Estimasi SHU Berjalan', icon: 'trending_up' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab.key
              ? 'border-secondary text-secondary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-[40px] animate-spin text-secondary">autorenew</span>
            <span className="text-sm">Memuat data laporan...</span>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB 1: ARUS KAS
         ══════════════════════════════════════════════════ */}
      {!loading && activeTab === 'cashflow' && (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Kas Masuk */}
            <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 rounded-t-xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-emerald-700">Total Kas Masuk</p>
                  <p className="text-2xl font-bold text-emerald-800 mt-1 tabular-nums" style={{ fontFamily: "'IBM Plex Serif', serif" }}>
                    {formatRp(effectiveInflowTotal)}
                  </p>
                  <p className="text-[12px] text-emerald-600 mt-1">Simpanan & penjualan tunai</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>savings</span>
                </div>
              </div>
            </div>

            {/* Kas Keluar */}
            <div className="bg-white rounded-xl border border-rose-200 p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500 rounded-t-xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-rose-700">Total Kas Keluar</p>
                  <p className="text-2xl font-bold text-rose-800 mt-1 tabular-nums" style={{ fontFamily: "'IBM Plex Serif', serif" }}>
                    {formatRp(effectiveOutflowTotal)}
                  </p>
                  <p className="text-[12px] text-rose-600 mt-1">Pencairan & restock toko</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-rose-600" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
                </div>
              </div>
            </div>

            {/* Saldo Bersih */}
            <div className={`bg-white rounded-xl border p-5 shadow-sm relative overflow-hidden ${endingVaultBalance >= 0 ? 'border-indigo-200' : 'border-rose-200'}`}>
              <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${endingVaultBalance >= 0 ? 'bg-indigo-600' : 'bg-rose-600'}`} />
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-[12px] font-semibold uppercase tracking-wider ${endingVaultBalance >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>Saldo Kas Bersih Brankas</p>
                  <p
                    data-testid="vault-balance-value"
                    className={`text-2xl font-bold mt-1 tabular-nums ${endingVaultBalance >= 0 ? 'text-indigo-800' : 'text-rose-700'}`}
                    style={{ fontFamily: "'IBM Plex Serif', serif" }}
                  >
                    {formatRp(endingVaultBalance)}
                  </p>
                  <p
                    data-testid="vault-opening-balance-subtext"
                    className={`text-[12px] mt-1 ${endingVaultBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}
                  >
                    Saldo awal s/d {formattedStartDate}: {formatRp(openingCashBalance)}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${endingVaultBalance >= 0 ? 'bg-indigo-100' : 'bg-rose-100'}`}>
                  <span className={`material-symbols-outlined ${endingVaultBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'}`} style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
                </div>
              </div>
            </div>

            {/* Sisa Piutang Bon Toko (Potong Gaji) */}
            <div className="bg-white rounded-xl border border-amber-200/80 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500 rounded-t-xl" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    SISA PIUTANG BON TOKO (POTONG GAJI)
                  </p>
                  <p
                    className="text-2xl font-extrabold text-amber-600 mt-1.5 tabular-nums"
                    style={{ fontFamily: "'IBM Plex Serif', serif" }}
                  >
                    {formatRp(storeCreditSummary.totalOutstandingReceivable)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
                <span className="text-amber-700 font-medium">
                  {storeCreditSummary.activeDebtorsCount} anggota berutang aktif
                </span>
                {inRouter ? (
                  <Link
                    className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline whitespace-nowrap"
                    to="/admin/buku-besar-bon-toko"
                  >
                    Lihat Buku Bon →
                  </Link>
                ) : (
                  <a
                    className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline whitespace-nowrap"
                    href="/admin/buku-besar-bon-toko"
                  >
                    Lihat Buku Bon →
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Transaction Table */}
          <div className="bg-white rounded-xl border border-outline-variant/30 shadow-sm">
            <div className="px-5 py-4 border-b border-outline-variant/20 rounded-t-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">receipt_long</span>
                  Mutasi Arus Kas Terperinci
                </h2>
                <span className="text-[12px] text-on-surface-variant">
                  {hasActiveCashFlowFilter
                    ? `${totalCashFlowItems} / ${cashFlowTransactions.length} transaksi`
                    : `${cashFlowTransactions.length} transaksi`}
                </span>
                {openingCashBalance !== 0 && (
                  <span
                    data-testid="cashflow-opening-balance-badge"
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${openingCashBalance >= 0
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                  >
                    Saldo Awal Sebelum Periode: {formatRp(openingCashBalance)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto no-print">
                <div className="relative" ref={categoryDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsCategoryDropdownOpen((prev) => !prev)}
                    aria-expanded={isCategoryDropdownOpen}
                    aria-haspopup="listbox"
                    data-testid="cashflow-category-filter-trigger"
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${selectedCategories.length > 0
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>
                      {selectedCategories.length === 0
                        ? 'Semua Kategori'
                        : `${selectedCategories.length} Kategori Dipilih`}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 opacity-70 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''
                        }`}
                    />
                  </button>

                  {isCategoryDropdownOpen && (
                    <div
                      data-testid="cashflow-category-filter-menu"
                      role="listbox"
                      aria-multiselectable="true"
                      className="absolute left-0 md:left-auto md:right-0 mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl z-30 p-3"
                    >
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Pilih Kategori Mutasi
                        </span>
                        <div className="flex items-center gap-2 text-xs">
                          {availableCategoryOptions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategories(availableCategoryOptions.map((c) => c.label));
                                setCashFlowPage(1);
                              }}
                              className="text-indigo-600 hover:underline font-medium cursor-pointer"
                            >
                              Pilih Semua
                            </button>
                          )}
                          {selectedCategories.length > 0 && (
                            <button
                              type="button"
                              onClick={handleClearCategoryFilters}
                              className="text-rose-600 hover:underline font-medium cursor-pointer"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>

                      {availableCategoryOptions.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-500">
                          Tidak ada kategori pada periode ini
                        </p>
                      ) : (
                        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                          {availableCategoryOptions.map((opt) => {
                            const checked = selectedCategories.includes(opt.label);
                            return (
                              <label
                                key={opt.label}
                                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${checked
                                    ? 'bg-indigo-50/80 text-indigo-900 font-semibold'
                                    : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleCategoryFilter(opt.label)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                                  />
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold truncate ${opt.bg} ${opt.text}`}
                                    title={opt.label}
                                  >
                                    {opt.label}
                                  </span>
                                </div>
                                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono shrink-0">
                                  {opt.count}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative flex-1 md:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={cashFlowSearchQuery}
                    onChange={(e) => setCashFlowSearchQuery(e.target.value)}
                    placeholder="Cari referensi CF-..., deskripsi, atau LOAN-..."
                    aria-label="Cari mutasi arus kas"
                    data-testid="cashflow-search-input"
                    className="w-full pl-9 pr-8 py-2 rounded-lg border border-outline-variant/50 bg-slate-50/50 focus:bg-white text-xs sm:text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-colors"
                  />
                  {cashFlowSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCashFlowSearchQuery('')}
                      aria-label="Hapus pencarian arus kas"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {hasActiveUrlRef && (
                  <ResetRefFilterButton onReset={handleResetReferenceFilter} />
                )}
                {inRouter ? (
                  <Link
                    to="/admin/audit-orphan"
                    data-testid="cashflow-audit-orphan-link"
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${orphanCount > 0
                        ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <ShieldAlert
                      className={`w-3.5 h-3.5 ${orphanCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}
                    />
                    <span>Verifikasi Data Orphan</span>
                    {orphanCount > 0 && (
                      <span
                        data-testid="cashflow-audit-orphan-badge"
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white"
                      >
                        {orphanCount}
                      </span>
                    )}
                  </Link>
                ) : (
                  <a
                    href="/admin/audit-orphan"
                    data-testid="cashflow-audit-orphan-link"
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${orphanCount > 0
                        ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <ShieldAlert
                      className={`w-3.5 h-3.5 ${orphanCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}
                    />
                    <span>Verifikasi Data Orphan</span>
                    {orphanCount > 0 && (
                      <span
                        data-testid="cashflow-audit-orphan-badge"
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white"
                      >
                        {orphanCount}
                      </span>
                    )}
                  </a>
                )}
              </div>
            </div>

            {selectedCategories.length > 0 && (
              <div
                data-testid="cashflow-active-category-chips"
                className="px-5 py-2.5 bg-indigo-50/40 border-b border-outline-variant/20 flex flex-wrap items-center gap-2"
              >
                <span className="text-[11px] font-semibold text-slate-600">
                  Filter Kategori:
                </span>
                {selectedCategories.map((label) => {
                  const meta =
                    availableCategoryOptions.find((o) => o.label === label) ??
                    getCashFlowCategoryMeta(label);
                  return (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.text}`}
                    >
                      <span>{label}</span>
                      <button
                        type="button"
                        onClick={() => toggleCategoryFilter(label)}
                        aria-label={`Hapus filter kategori ${label}`}
                        className="p-0.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer no-print"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={handleClearCategoryFilters}
                  data-testid="cashflow-clear-all-categories-btn"
                  className="ml-auto text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer no-print"
                >
                  Hapus Semua Filter
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low border-b border-outline-variant/20">
                  <tr>
                    <th
                      aria-sort={dateSortOrder === 'asc' ? 'ascending' : 'descending'}
                      className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap select-none"
                    >
                      <button
                        type="button"
                        data-testid="cashflow-sort-date-btn"
                        onClick={() => {
                          setDateSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          setCashFlowPage(1);
                        }}
                        title={
                          dateSortOrder === 'asc'
                            ? 'Urutan: Terlama ke Terbaru (ASC) — Klik untuk ubah ke Terbaru ke Terlama (DESC)'
                            : 'Urutan: Terbaru ke Terlama (DESC) — Klik untuk ubah ke Terlama ke Terbaru (ASC)'
                        }
                        className="inline-flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg hover:bg-slate-200/70 hover:text-slate-800 transition-colors cursor-pointer group"
                      >
                        <span>TANGGAL</span>
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[10px] font-mono">
                          {dateSortOrder === 'asc' ? (
                            <>
                              <ArrowUp className="w-3 h-3" />
                              <span>ASC</span>
                            </>
                          ) : (
                            <>
                              <ArrowDown className="w-3 h-3" />
                              <span>DESC</span>
                            </>
                          )}
                        </span>
                      </button>
                    </th>
                    {['Referensi', 'Deskripsi', 'Kategori', 'Unit', 'Kas Masuk (Rp)', 'Kas Keluar (Rp)', 'Saldo Berjalan (Rp)'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {totalCashFlowItems === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-on-surface-variant text-sm">
                        <span className="material-symbols-outlined text-[36px] block mb-2 text-outline">
                          {hasActiveCashFlowFilter ? 'search_off' : 'inbox'}
                        </span>
                        {selectedCategories.length > 0 && normalizedCashFlowQuery
                          ? 'Tidak ada mutasi arus kas yang cocok dengan filter kategori dan pencarian'
                          : selectedCategories.length > 0
                            ? 'Tidak ada mutasi arus kas untuk kategori yang dipilih'
                            : normalizedCashFlowQuery
                              ? 'Tidak ada mutasi arus kas yang cocok dengan pencarian'
                              : openingCashBalance !== 0
                                ? (
                                  <span data-testid="cashflow-empty-vault-note">
                                    Tidak ada transaksi pada periode ini — Saldo Kas Brankas tetap{' '}
                                    {formatRp(endingVaultBalance)}
                                  </span>
                                )
                                : 'Tidak ada transaksi pada periode ini'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {openingCashBalance !== 0 &&
                        !hasActiveCashFlowFilter &&
                        safeCashFlowPage === 1 && (
                          <tr
                            data-testid="cashflow-opening-balance-row"
                            className="bg-indigo-50/40 border-b border-indigo-100"
                          >
                            <td className="px-4 py-3 text-on-surface-variant text-[13px] whitespace-nowrap font-medium">
                              &lt; {formattedStartDate}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/80 font-mono text-xs font-semibold">
                                SALDO-AWAL
                              </span>
                            </td>
                            <td className="px-4 py-3 text-on-surface font-medium min-w-[240px]">
                              Saldo Awal Kumulatif Sebelum Periode ({formattedStartDate})
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700">
                                Saldo Bawaan
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-on-surface-variant">Semua Unit</td>
                            <td className="px-4 py-3 text-right font-semibold text-on-surface-variant tabular-nums whitespace-nowrap">-</td>
                            <td className="px-4 py-3 text-right font-semibold text-on-surface-variant tabular-nums whitespace-nowrap">-</td>
                            <td
                              className={`px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap ${openingCashBalance >= 0 ? 'text-indigo-700' : 'text-rose-700'
                                }`}
                            >
                              {formatRp(openingCashBalance)}
                            </td>
                          </tr>
                        )}
                      {paginatedCashFlow.map((t, i) => {
                        const isHighlighted = highlightedCashFlowIds.has(t.id);
                        return (
                          <tr
                            key={t.id}
                            data-highlighted-ref={isHighlighted ? 'true' : undefined}
                            className={`border-b border-outline-variant/10 transition-colors ${isHighlighted
                              ? 'bg-amber-50/90 ring-2 ring-amber-400/70 hover:bg-amber-100/70'
                              : `hover:bg-surface-container-low/50 ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''}`
                              }`}
                          >
                            <td className="px-4 py-3 text-on-surface-variant text-[13px] whitespace-nowrap align-top">
                              <div>{t.tanggal}</div>
                              {formatTimeHhMmSs(t.created_at) && (
                                <div
                                  data-testid="cashflow-row-time"
                                  className="text-[11px] font-mono text-slate-400 leading-tight mt-0.5"
                                >
                                  {formatTimeHhMmSs(t.created_at)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedCashFlowRef(t)}
                                title="Klik untuk melihat rincian sumber buku pembantu"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 font-mono text-xs font-semibold hover:underline transition-colors cursor-pointer group"
                              >
                                <span>{t.referensi}</span>
                                <ExternalLink className="w-3 h-3 opacity-70 group-hover:opacity-100 transition-opacity" />
                              </button>
                            </td>
                            <td
                              className="px-4 py-3 text-on-surface min-w-[260px] max-w-[440px] whitespace-normal align-top"
                              title={t.deskripsi}
                            >
                              {(() => {
                                const depositComponents = parseMemberDepositDescriptionComponents(
                                  t.deskripsi
                                );
                                return (
                                  <div className="space-y-1">
                                    <div className="line-clamp-2 break-words text-[13px] leading-snug">
                                      {t.deskripsi}
                                    </div>
                                    {depositComponents.length > 0 && (
                                      <div
                                        data-testid="cashflow-deposit-components"
                                        className="flex flex-wrap items-center gap-1"
                                      >
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                          Jenis Simpanan:
                                        </span>
                                        {depositComponents.map((comp) => (
                                          <span
                                            key={comp}
                                            className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/70 text-[10px] font-semibold leading-none"
                                          >
                                            {comp}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3"><KategoriBadge kategori={t.kategori} /></td>
                            <td className="px-4 py-3 text-[12px] text-on-surface-variant">{t.unit_usaha}</td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                              {t.kas_masuk > 0 ? formatRp(t.kas_masuk) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-rose-700 tabular-nums whitespace-nowrap">
                              {t.kas_keluar > 0 ? formatRp(t.kas_keluar) : '-'}
                            </td>
                            <td className={`px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap ${t.saldo_berjalan >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                              {formatRp(t.saldo_berjalan)}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
                {totalCashFlowItems > 0 && (
                  <tfoot className="bg-primary/5 border-t-2 border-primary/20">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 font-bold text-primary text-sm">
                        TOTAL
                        {hasActiveCashFlowFilter && (
                          <span className="ml-2 text-xs font-medium text-on-surface-variant">
                            (Terfilter — {totalCashFlowItems} transaksi)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatRp(displayedCashFlowInflow)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-700 tabular-nums whitespace-nowrap">
                        {formatRp(displayedCashFlowOutflow)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap ${displayedCashFlowNet >= 0 ? 'text-indigo-700' : 'text-rose-700'
                          }`}
                      >
                        {formatRp(displayedCashFlowNet)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 bg-white rounded-b-2xl text-xs sm:text-sm text-slate-600 no-print">
              <div className="flex items-center gap-3">
                <span>
                  Menampilkan{' '}
                  <strong className="font-semibold text-slate-800">
                    {totalCashFlowItems > 0 ? cashFlowStartIndex + 1 : 0}-{cashFlowEndIndex}
                  </strong>{' '}
                  dari <strong className="font-semibold text-slate-800">{totalCashFlowItems}</strong> transaksi
                </span>
                <select
                  value={cashFlowPageSize}
                  onChange={(e) => {
                    setCashFlowPageSize(Number(e.target.value));
                    setCashFlowPage(1);
                  }}
                  aria-label="Jumlah baris per halaman"
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value={10}>10 / halaman</option>
                  <option value={25}>25 / halaman</option>
                  <option value={50}>50 / halaman</option>
                  <option value={100}>100 / halaman</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Tombol Halaman Pertama */}
                <button
                  type="button"
                  onClick={() => setCashFlowPage(1)}
                  disabled={safeCashFlowPage <= 1}
                  title="Halaman Pertama"
                  aria-label="Halaman Pertama"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  «
                </button>

                {/* Tombol Prev */}
                <button
                  type="button"
                  onClick={() => setCashFlowPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeCashFlowPage <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Prev
                </button>

                {/* Kotak Input Lompat Halaman */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50/70 text-xs text-slate-700">
                  <span className="font-medium text-slate-500">Halaman</span>
                  <input
                    type="number"
                    min={1}
                    max={totalCashFlowPages}
                    value={cashFlowPageInput}
                    onChange={(e) => setCashFlowPageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitCashFlowPageJump();
                      }
                    }}
                    onBlur={commitCashFlowPageJump}
                    aria-label="Nomor halaman tujuan"
                    className="w-14 px-1.5 py-0.5 text-center font-bold text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="font-semibold text-slate-600">/ {totalCashFlowPages}</span>
                </div>

                {/* Tombol Next */}
                <button
                  type="button"
                  onClick={() => setCashFlowPage((prev) => Math.min(totalCashFlowPages, prev + 1))}
                  disabled={safeCashFlowPage >= totalCashFlowPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Next
                </button>

                {/* Tombol Halaman Terakhir */}
                <button
                  type="button"
                  onClick={() => setCashFlowPage(totalCashFlowPages)}
                  disabled={safeCashFlowPage >= totalCashFlowPages}
                  title="Halaman Terakhir"
                  aria-label="Halaman Terakhir"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB 2: ESTIMASI SHU
         ══════════════════════════════════════════════════ */}
      {!loading && activeTab === 'shu' && shuData && (
        <div className="space-y-6">
          {/* Waterfall Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
            {[
              { label: 'Total Omzet', value: shuData.grossSales, color: 'blue', icon: 'storefront', sub: 'Pendapatan kotor penjualan' },
              { label: 'HPP / Modal', value: shuData.cogs, color: 'orange', icon: 'inventory_2', sub: 'SUM(qty × buy_price)' },
              { label: 'Laba Kotor', value: shuData.grossProfit, color: 'emerald', icon: 'trending_up', sub: 'Omzet − HPP' },
              { label: 'Pendapatan Margin Pembiayaan Barang', value: shuData.goodsFinancingMargin, color: 'teal', icon: 'shopping_bag', sub: 'Realisasi margin angsuran barang (non-pokok)' },
              { label: 'Koreksi Selisih Opname', value: shuData.opnameNetImpact ?? 0, color: (shuData.opnameNetImpact ?? 0) < 0 ? 'rose' : 'indigo', icon: 'fact_check', sub: `Surplus ${formatRp(shuData.opnameSurplusGain ?? 0)} / Susut ${formatRp(shuData.opnameShrinkageLoss ?? 0)}` },
              { label: 'Beban Operasional', value: shuData.opex, color: 'rose', icon: 'payments', sub: 'Listrik, gaji, depresiasi' },
              { label: 'Estimasi SHU Bersih', value: shuData.estimatedShu, color: 'purple', icon: 'stars', sub: `Margin ${shuData.marginPercentage.toFixed(1)}%` },
            ].map((m, i) => {
              const cMap: Record<string, { border: string; bg: string; text: string; accent: string; badge: string }> = {
                blue: { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-800', accent: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800' },
                orange: { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-800', accent: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800' },
                emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-800', accent: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' },
                teal: { border: 'border-teal-200', bg: 'bg-teal-50', text: 'text-teal-800', accent: 'bg-teal-500', badge: 'bg-teal-100 text-teal-800' },
                indigo: { border: 'border-indigo-200', bg: 'bg-indigo-50', text: 'text-indigo-800', accent: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-800' },
                rose: { border: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-800', accent: 'bg-rose-500', badge: 'bg-rose-100 text-rose-800' },
                purple: { border: 'border-purple-300', bg: 'bg-purple-50', text: 'text-purple-900', accent: 'bg-purple-600', badge: 'bg-purple-100 text-purple-800' },
              };
              const c = cMap[m.color];
              return (
                <div key={i} className={`bg-white rounded-xl border ${c.border} p-4 shadow-sm relative overflow-hidden`}>
                  <div className={`absolute top-0 left-0 right-0 h-1 ${c.accent} rounded-t-xl`} />
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mb-2 ${c.badge}`}>
                    <span className="material-symbols-outlined text-[13px]">{m.icon}</span>
                    {m.label}
                  </span>
                  <p className={`text-xl font-bold tabular-nums ${c.text} mt-1`} style={{ fontFamily: "'IBM Plex Serif', serif" }}>
                    {formatRp(m.value)}
                  </p>
                  <p className={`text-[11px] mt-1 ${c.text} opacity-70`}>{m.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Sumber Laba & Margin per Nomor Referensi Table */}
          <div className="bg-white rounded-xl border border-outline-variant/30 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[20px]">receipt_long</span>
                  Rincian Sumber Laba &amp; Margin per Nomor Referensi
                </h2>
                <p className="text-[12px] text-on-surface-variant mt-0.5">
                  Klik nomor referensi untuk menelusuri rincian item barang, HPP, dan kontribusi laba SHU
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto no-print">
                <select
                  value={shuSourceFilter}
                  onChange={(e) => setShuSourceFilter(e.target.value as ShuSourceFilterMode)}
                  aria-label="Filter sumber dan status SHU"
                  data-testid="shu-source-filter"
                  className="px-3 py-2 rounded-lg border border-outline-variant/50 bg-slate-50/50 focus:bg-white text-xs sm:text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-colors cursor-pointer"
                >
                  <option value="default_shu_and_paid_off">
                    Penyumbang SHU &amp; Pinjaman Lunas (Default)
                  </option>
                  <option value="profit_only">
                    Hanya Penyumbang Laba (Omzet &gt; Rp 0)
                  </option>
                  <option value="all">
                    Semua Aktivitas Angsuran (Termasuk Berjalan 0%)
                  </option>
                </select>
                <div className="relative flex-1 md:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={shuSearchQuery}
                    onChange={(e) => setShuSearchQuery(e.target.value)}
                    placeholder="Cari No. Referensi (INV-...), NRP, atau Nama..."
                    aria-label="Cari transaksi sumber SHU"
                    data-testid="shu-search-input"
                    className="w-full pl-9 pr-8 py-2 rounded-lg border border-outline-variant/50 bg-slate-50/50 focus:bg-white text-xs sm:text-sm text-on-surface placeholder:text-slate-400 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-colors"
                  />
                  {shuSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setShuSearchQuery('')}
                      aria-label="Hapus pencarian"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {hasActiveUrlRef && (
                  <ResetRefFilterButton onReset={handleResetReferenceFilter} />
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low border-b border-outline-variant/20">
                  <tr>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                      TANGGAL
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                      NO. REFERENSI
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                      SUMBER / METODE
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                      ANGGOTA / PEMBELI
                    </th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                      OMZET (RP)
                    </th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                      HPP / MODAL (RP)
                    </th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                      LABA KOTOR (RP)
                    </th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                      MARGIN %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {totalShuItems === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-on-surface-variant text-sm">
                        <span className="material-symbols-outlined text-[36px] block mb-2 text-outline">
                          {normalizedShuQuery ? 'search_off' : 'inbox'}
                        </span>
                        {normalizedShuQuery
                          ? 'Tidak ada transaksi yang cocok dengan pencarian'
                          : 'Tidak ada transaksi sumber laba pada periode ini'}
                      </td>
                    </tr>
                  ) : (
                    paginatedShuRows.map((row, i) => {
                      const badgeStyle =
                        (row.sourceType === 'goods_financing' || row.sourceType === 'LOAN_CONTRACT') &&
                          row.grossProfit === 0
                          ? { bg: 'bg-slate-100 border border-slate-200/80', text: 'text-slate-700' }
                          : (SHU_SOURCE_BADGE[row.sourceType] ?? SHU_SOURCE_BADGE.pos_cash);
                      const isHighlighted = highlightedShuIds.has(row.id);
                      return (
                        <tr
                          key={row.id}
                          data-highlighted-ref={isHighlighted ? 'true' : undefined}
                          className={`border-b border-outline-variant/10 transition-colors ${isHighlighted
                            ? 'bg-amber-50/90 ring-2 ring-amber-400/70 hover:bg-amber-100/70'
                            : `hover:bg-surface-container-low/50 ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''}`
                            }`}
                        >
                          <td className="px-4 py-3 text-on-surface-variant text-[13px] whitespace-nowrap">
                            {row.transactionDate}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedShuRef(row)}
                              title="Klik untuk melihat rincian item pembentuk laba"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 font-mono text-xs font-semibold transition-colors cursor-pointer group"
                            >
                              <span>{row.referenceNumber}</span>
                              <ExternalLink className="w-3 h-3 opacity-70 group-hover:opacity-100 transition-opacity" />
                            </button>
                            {row.sourceType === 'LOAN_CONTRACT' && row.subLabel && (
                              <div className="text-[11px] text-on-surface-variant mt-1 pl-0.5 font-medium">
                                {row.subLabel}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeStyle.bg} ${badgeStyle.text}`}
                            >
                              {row.paymentMethodLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 min-w-[180px]">
                            <div className="font-semibold text-on-surface text-[13px] leading-tight">
                              {row.memberName}
                            </div>
                            {row.memberNrp && (
                              <div className="text-[11px] text-on-surface-variant font-mono mt-0.5">
                                NRP: {row.memberNrp}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-blue-700 font-semibold whitespace-nowrap">
                            {formatRp(row.omzet)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-orange-700 font-semibold whitespace-nowrap">
                            {formatRp(row.hpp)}
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums font-bold whitespace-nowrap ${row.grossProfit < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {formatRp(row.grossProfit)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold ${row.marginPercent >= 20
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.marginPercent >= 10
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                                }`}
                            >
                              {row.marginPercent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {totalShuItems > 0 && (
                  <tfoot className="bg-primary/5 border-t-2 border-primary/20">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 font-bold text-primary text-sm">
                        TOTAL
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-800 tabular-nums whitespace-nowrap">
                        {formatRp(filteredShuTotalOmzet)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-orange-800 tabular-nums whitespace-nowrap">
                        {formatRp(filteredShuTotalHpp)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-800 tabular-nums whitespace-nowrap">
                        {formatRp(filteredShuTotalProfit)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold bg-emerald-100 text-emerald-900">
                          {filteredShuTotalMarginPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 bg-white rounded-b-2xl text-xs sm:text-sm text-slate-600 no-print">
              <div className="flex items-center gap-3">
                <span>
                  Menampilkan{' '}
                  <strong className="font-semibold text-slate-800">
                    {totalShuItems > 0 ? shuStartIndex + 1 : 0}-{shuEndIndex}
                  </strong>{' '}
                  dari <strong className="font-semibold text-slate-800">{totalShuItems}</strong>{' '}
                  transaksi
                </span>
                <select
                  value={shuPageSize}
                  onChange={(e) => {
                    setShuPageSize(Number(e.target.value));
                    setShuCurrentPage(1);
                  }}
                  aria-label="Jumlah baris per halaman SHU"
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value={10}>10 / halaman</option>
                  <option value={25}>25 / halaman</option>
                  <option value={50}>50 / halaman</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShuCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeShuPage <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Prev
                </button>
                <span className="px-3 py-1.5 text-xs font-semibold text-slate-800">
                  Halaman {safeShuPage} / {totalShuPages}
                </span>
                <button
                  type="button"
                  onClick={() => setShuCurrentPage((prev) => Math.min(totalShuPages, prev + 1))}
                  disabled={safeShuPage >= totalShuPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* RAT Allocation Widget */}
          <div className="bg-white rounded-xl border border-outline-variant/30 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/20">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">pie_chart</span>
                Simulasi Alokasi SHU (RAT)
              </h2>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                Estimasi berdasarkan data periode berjalan — final ditetapkan di Rapat Anggota Tahunan (RAT)
              </p>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Cadangan Modal 40% */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-700" style={{ fontVariationSettings: "'FILL' 1" }}>savings</span>
                    <span className="font-semibold text-emerald-900">Cadangan Modal Koperasi</span>
                  </div>
                  <span className="text-2xl font-bold text-emerald-800">40%</span>
                </div>
                <p className="text-2xl font-bold text-emerald-900 tabular-nums mb-3" style={{ fontFamily: "'IBM Plex Serif', serif" }}>
                  {formatRp(shuData.estimatedShu * 0.40)}
                </p>
                <div className="w-full bg-emerald-200 rounded-full h-3">
                  <div className="bg-emerald-600 h-3 rounded-full transition-all duration-700" style={{ width: '40%' }} />
                </div>
                <p className="text-[11px] text-emerald-700 mt-2">Penguatan modal kerja internal & cadangan risiko kredit</p>
              </div>

              {/* SHU Anggota 60% */}
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-teal-700" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
                    <span className="font-semibold text-teal-900">Jasa Usaha / SHU Anggota</span>
                  </div>
                  <span className="text-2xl font-bold text-teal-800">60%</span>
                </div>
                <p className="text-2xl font-bold text-teal-900 tabular-nums mb-3" style={{ fontFamily: "'IBM Plex Serif', serif" }}>
                  {formatRp(shuData.estimatedShu * 0.60)}
                </p>
                <div className="w-full bg-teal-200 rounded-full h-3">
                  <div className="bg-teal-600 h-3 rounded-full transition-all duration-700" style={{ width: '60%' }} />
                </div>
                <div className="mt-2 text-[11px] text-teal-700 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Jasa Usaha/Transaksi Anggota (70%)</span>
                    <span className="font-bold">{formatRp(shuData.estimatedShu * 0.60 * 0.70)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Jasa Modal Simpanan (30%)</span>
                    <span className="font-bold">{formatRp(shuData.estimatedShu * 0.60 * 0.30)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DRILL-DOWN BUKTI JURNAL & BUKU PEMBANTU REFERENSI ── */}
      <CashFlowReferenceModal
        cashFlowItem={selectedCashFlowRef}
        onClose={() => {
          setSelectedCashFlowRef(null);
          onClearOpenRef?.();
        }}
        onFilterRefInReport={(refCode) => {
          setActiveTab('cashflow');
          setCashFlowSearchQuery(refCode);
          setSelectedCategories([]);
          setActiveHighlightRef(refCode);
          setCashFlowPage(1);
          onClearOpenRef?.();
        }}
      />

      {/* ── MODAL DRILL-DOWN RINCIAN REFERENSI PEMBENTUK SHU ── */}
      <ShuReferenceDetailModal
        referenceItem={selectedShuRef}
        onClose={() => setSelectedShuRef(null)}
      />
    </AdminLayout>
  );
}

function LaporanKeuanganWithRouter(props: LaporanKeuanganProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = (searchParams.get('tab') || '').trim().toLowerCase();
  const urlTab: 'cashflow' | 'shu' | null =
    rawTab === 'shu' || rawTab === 'cashflow' ? rawTab : null;
  const urlSearch = (searchParams.get('search') || '').trim();
  const urlOpenRef = (searchParams.get('openRef') || '').trim();
  const urlRef = (searchParams.get('ref') || urlSearch || urlOpenRef).trim();
  const urlReceipt = (searchParams.get('receipt') || '').trim();
  const rawDate = (searchParams.get('date') || '').trim();
  const urlDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';

  const handleClearUrlParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.delete('ref');
    next.delete('search');
    next.delete('openRef');
    next.delete('receipt');
    next.delete('date');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleClearOpenRef = useCallback(() => {
    if (!searchParams.has('openRef')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('openRef');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <LaporanKeuanganContent
      {...props}
      urlTab={urlTab}
      urlRef={urlRef}
      urlReceipt={urlReceipt}
      urlDate={urlDate}
      urlOpenRef={urlOpenRef}
      onClearUrlParams={handleClearUrlParams}
      onClearOpenRef={handleClearOpenRef}
    />
  );
}

export default function LaporanKeuangan(props: LaporanKeuanganProps = {}) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <LaporanKeuanganWithRouter {...props} />;
  }
  return <LaporanKeuanganContent {...props} />;
}

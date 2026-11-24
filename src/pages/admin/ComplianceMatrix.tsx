/**
 * ComplianceMatrix.tsx
 * Halaman Matriks Kepatuhan Simpanan Anggota.
 * Menyediakan audit visual kepatuhan, ekspor Excel berformula, dan modal impor mutasi buku besar.
 */
import { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { Link, useInRouterContext, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import FeedbackContext from '../../context/FeedbackContext';
import {
  Search,
  CheckCircle2,
  FileSpreadsheet,
  AlertTriangle,
  Eye,
  Loader2,
  Sparkles,
  X,
  ChevronDown,
  Upload,
  CheckSquare,
  BookOpen,
  RotateCcw
} from 'lucide-react';
import {
  getTraceBackDepositRows,
  type MemberDepositBatchItem
} from '../../services/cashFlowAuditService';
import {
  getComplianceMatrixData,
  ComplianceMatrixRow,
  ComplianceMonthData,
  MonthPeriod,
  getRolling12Months,
  getRolling12MonthRange,
  getSavingsComplianceAvailableYears,
  ImportSavingsMatrixLedgerResult,
  parseCutoffDateInfo
} from '../../services/complianceService';
import MemberLedgerModal from '../../components/members/MemberLedgerModal';
import SavingsLedgerMatrixModal from '../../components/compliance/SavingsLedgerMatrixModal';
import SavingsMatrixImportModal from '../../components/compliance/SavingsMatrixImportModal';
import PelunasanPokokModal from '../../components/compliance/PelunasanPokokModal';
import { exportSavingsMatrixExcel, DepositTypeKey } from '../../utils/savingsMatrixExporter';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  bulkCheckAllUpToCurrentMonth,
  BulkCheckProgress,
  resolveDepositTypeCode
} from '../../services/savingsMatrixService';
import {
  formatMatrixDepositCashFlowDescription,
  isOpeningOrMigrationDepositDescription
} from '../../utils/depositCashFlowFormat';
import {
  clearTierCache,
  getRateTiers,
  getApplicableRate,
  getApplicableTierRate,
  buildSavingsRateResolver,
  SavingsRateTier,
  DEFAULT_RATE_TIERS
} from '../../services/savingsRateService';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const CURRENT_MONTH = new Date().getMonth();

export interface ComplianceMatrixProps {
  initialYear?: string | number;
  initialAvailableYears?: number[];
  onYearChange?: (year: string) => void;
  initialData?: ComplianceMatrixRow[];
  initialSelectedMember?: {
    id: string;
    nrp: string;
    nama: string;
    joinDate?: string | null;
  } | null;
  initialShowCheckAllConfirmModal?: boolean;
  initialBulkChecking?: boolean;
  initialBulkCheckTargetType?: 'WAJIB' | 'BELANJA' | 'LEBARAN' | 'ALL';
  initialBulkCheckProgress?: { current: number; total: number; currentMemberName: string };
  initialBulkCheckSummary?: {
    totalSuccess: number;
    totalFailed: number;
    insertedCount?: number;
    totalAmount?: number;
  } | null;
  initialShowImportModal?: boolean;
  initialShowExportDropdown?: boolean;
  initialIsExporting?: boolean;
  initialCutoffDate?: string | null;
  initialSearch?: string;
  initialTraceRef?: string;
  initialFilterType?: string;
  initialTracePeriod?: string;
  initialTraceRows?: MemberDepositBatchItem[];
}

interface ComplianceMatrixInternalProps extends ComplianceMatrixProps {
  urlSearch?: string;
  urlRef?: string;
  urlType?: string;
  urlPeriod?: string;
  onClearUrlParams?: () => void;
}

export function normalizeDepositFilterType(
  raw?: string | null
): 'all' | 'wajib' | 'belanja' | 'lebaran' {
  const code = String(raw || '').trim().toUpperCase();
  if (code === 'WAJIB' || code === 'SW') return 'wajib';
  if (code === 'BELANJA' || code === 'SB') return 'belanja';
  if (code === 'LEBARAN' || code === 'SL' || code === 'SHR') return 'lebaran';
  return 'all';
}

const MONTH_TOKEN_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mei: 5,
  may: 5,
  jun: 6,
  jul: 7,
  ags: 8,
  aug: 8,
  sep: 9,
  okt: 10,
  oct: 10,
  nov: 11,
  des: 12,
  dec: 12,
};

export function parseShortPeriodParam(
  raw?: string | null
): { month: number; year: number } | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    if (month >= 1 && month <= 12 && year >= 2000) {
      return { month, year };
    }
    return null;
  }

  const tokenMatch = trimmed.match(/^([A-Za-z]{3})[-\s]+(\d{2}|\d{4})$/);
  if (!tokenMatch) return null;

  const month = MONTH_TOKEN_MAP[tokenMatch[1].toLowerCase()];
  if (!month || month < 1 || month > 12) return null;

  const rawYear = Number(tokenMatch[2]);
  const year = tokenMatch[2].length === 2 ? 2000 + rawYear : rawYear;
  if (year < 2000) return null;

  return { month, year };
}

export function rowMatchesSavingsSearch(
  row: ComplianceMatrixRow,
  query: string,
  traceMatchedMemberIds?: Set<string>
): boolean {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    if (traceMatchedMemberIds && traceMatchedMemberIds.size > 0) {
      return traceMatchedMemberIds.has(row.member_id);
    }
    return true;
  }

  if (
    row.nama.toLowerCase().includes(q) ||
    row.nrp.toLowerCase().includes(q)
  ) {
    return true;
  }

  if (traceMatchedMemberIds && traceMatchedMemberIds.has(row.member_id)) {
    return true;
  }

  return (row.months || []).some((m) => {
    if (!m) return false;
    const candidates = [
      m.wajib?.reference_no,
      m.belanja?.reference_no,
      m.lebaran?.reference_no,
      m.wajib?.notes,
      m.belanja?.notes,
      m.lebaran?.notes,
    ];
    return candidates.some((val) => val && String(val).toLowerCase().includes(q));
  });
}

export const handleExportSavingsMatrix = async (
  depositType: DepositTypeKey,
  setIsExporting: (loading: boolean) => void,
  setShowExportDropdown: (show: boolean) => void,
  feedback?: any
): Promise<boolean> => {
  setIsExporting(true);
  setShowExportDropdown(false);
  try {
    await exportSavingsMatrixExcel(depositType);
    const typeLabel =
      depositType === 'WAJIB'
        ? 'Simpanan Wajib'
        : depositType === 'BELANJA'
        ? 'Simpanan Belanja Bulanan'
        : 'Simpanan Hari Raya (Lebaran)';
    if (feedback?.showToast) {
      feedback.showToast(`Matriks periksa ${typeLabel} (.xlsx) berhasil diekspor`, 'success');
    }
    return true;
  } catch (err: any) {
    console.error('Error exporting savings matrix:', err);
    if (feedback?.showToast) {
      feedback.showToast('Gagal mengekspor matriks simpanan: ' + (err?.message || 'Terjadi kesalahan'), 'error');
    }
    return false;
  } finally {
    setIsExporting(false);
  }
};

export const handleImportMatrixSuccess = async (
  year: string,
  setLoading: (l: boolean) => void,
  setData: (d: ComplianceMatrixRow[]) => void,
  setTargets: (t: any) => void,
  setTotalSetoran: (s: number) => void,
  setShowImportModal: (show: boolean) => void,
  feedback?: any,
  importResult?: ImportSavingsMatrixLedgerResult
): Promise<void> => {
  clearTierCache();
  await fetchComplianceData(year, setLoading, setData, setTargets, setTotalSetoran);
  setShowImportModal(false);
  if (feedback?.showToast) {
    if (importResult) {
      const successCount = importResult.totalSuccess ?? importResult.totalMembers;
      const failedCount = importResult.totalFailed ?? 0;
      if (failedCount > 0) {
        feedback.showToast(
          `Impor selesai: ${successCount} anggota berhasil, ${failedCount} anggota gagal`,
          'warning'
        );
      } else {
        feedback.showToast(
          `Buku besar berhasil disinkronkan: ${successCount} anggota berhasil (${importResult.totalTransactions} mutasi)`,
          'success'
        );
      }
    } else {
      feedback.showToast('Buku besar berhasil disinkronkan dari file Excel', 'success');
    }
  }
};

export const loadComplianceAvailableYearsData = async (
  setAvailableYears: (years: number[]) => void,
  setYear: (updater: (prev: string) => string) => void
): Promise<number[]> => {
  try {
    const years = await getSavingsComplianceAvailableYears();
    if (years && years.length > 0) {
      setAvailableYears(years);
      setYear(prev => {
        const currentNum = parseInt(prev);
        return years.includes(currentNum) ? prev : years[0].toString();
      });
    }
    return years;
  } catch (err) {
    console.error('Error fetching savings compliance available years:', err);
    return [];
  }
};

export type BulkCheckTargetType = 'WAJIB' | 'BELANJA' | 'LEBARAN' | 'ALL';

export interface FiscalTargetMonthRange {
  targetMonths: number[];
  firstMonth: number | null;
  lastMonth: number | null;
  isFutureYear: boolean;
  rangeLabel: string;
}

export interface BulkCheckPlanItem {
  memberId: string;
  memberNrp: string;
  memberName: string;
  depositTypeCode: 'WAJIB' | 'BELANJA' | 'LEBARAN';
  month: number;
  year: number;
  amount: number;
  targetAmount: number;
}

export interface BulkCheckPlanSummary {
  items: BulkCheckPlanItem[];
  affectedMemberCount: number;
  totalItems: number;
  totalAmount: number;
}

export interface BulkCheckExecutionSummary {
  totalSuccess: number;
  totalFailed: number;
  insertedCount?: number;
  totalAmount?: number;
}

export function computeBulkCheckTargetMonths(
  visibleMonths: number[],
  selectedYear: number,
  now: Date = new Date()
): FiscalTargetMonthRange {
  const currentFiscalYear = now.getFullYear();
  const currentMonthIndex = now.getMonth() + 1;

  if (selectedYear > currentFiscalYear) {
    return {
      targetMonths: [],
      firstMonth: null,
      lastMonth: null,
      isFutureYear: true,
      rangeLabel: '',
    };
  }

  const maxTargetMonth = selectedYear < currentFiscalYear ? 12 : currentMonthIndex;
  const firstVisiblePostCutOffMonth = visibleMonths.length > 0 ? visibleMonths[0] : null;
  if (firstVisiblePostCutOffMonth === null) {
    return {
      targetMonths: [],
      firstMonth: null,
      lastMonth: null,
      isFutureYear: false,
      rangeLabel: '',
    };
  }

  const targetMonths = visibleMonths.filter(
    (m) => m >= firstVisiblePostCutOffMonth && m <= maxTargetMonth
  );
  if (targetMonths.length === 0) {
    return {
      targetMonths: [],
      firstMonth: null,
      lastMonth: null,
      isFutureYear: false,
      rangeLabel: '',
    };
  }

  const firstMonth = targetMonths[0];
  const lastMonth = targetMonths[targetMonths.length - 1];
  const yrSuffix = String(selectedYear).slice(-2);
  const firstLabel = `${MONTHS[firstMonth - 1]}-${yrSuffix}`;
  const lastLabel = `${MONTHS[lastMonth - 1]}-${yrSuffix}`;
  const rangeLabel = firstMonth === lastMonth ? firstLabel : `${firstLabel} s/d ${lastLabel}`;

  return {
    targetMonths,
    firstMonth,
    lastMonth,
    isFutureYear: false,
    rangeLabel,
  };
}

export function buildBulkCheckPlan(params: {
  rows: ComplianceMatrixRow[];
  targetType: BulkCheckTargetType;
  targetMonths: number[];
  selectedYear: number;
  rateTiers: SavingsRateTier[];
  targets: { wajib: number; belanja: number; lebaran: number };
}): BulkCheckPlanSummary {
  const { rows, targetType, targetMonths, selectedYear, rateTiers, targets } = params;
  if (!rows.length || !targetMonths.length) {
    return { items: [], affectedMemberCount: 0, totalItems: 0, totalAmount: 0 };
  }

  const types: Array<'WAJIB' | 'BELANJA' | 'LEBARAN'> =
    targetType === 'ALL' ? ['WAJIB', 'BELANJA', 'LEBARAN'] : [targetType];

  const rateResolver = buildSavingsRateResolver(rateTiers, [
    { code: 'WAJIB', default_amount: targets.wajib },
    { code: 'BELANJA', default_amount: targets.belanja },
    { code: 'LEBARAN', default_amount: targets.lebaran },
  ]);

  const items: BulkCheckPlanItem[] = [];
  const affectedMembers = new Set<string>();
  let totalAmount = 0;

  for (const row of rows) {
    if ((row.membership_status || '').toUpperCase() === 'SUSPENDED') continue;
    if (((row as any).status || 'aktif').toLowerCase() !== 'aktif') continue;

    for (const monthNum of targetMonths) {
      const idx = monthNum - 1;
      const monthData = row.months?.[idx] ?? null;
      if (monthData?.isBeforeCutoff) continue;

      for (const typeCode of types) {
        const item =
          typeCode === 'WAJIB'
            ? monthData?.wajib
            : typeCode === 'BELANJA'
            ? monthData?.belanja
            : monthData?.lebaran;
        const existingPaid =
          typeCode === 'WAJIB'
            ? Number(monthData?.w || 0)
            : typeCode === 'BELANJA'
            ? Number(monthData?.b || 0)
            : Number(monthData?.l || 0);

        if (
          item?.status === 'paid' ||
          item?.status === 'covered_by_opening' ||
          item?.status === 'frozen' ||
          item?.status === 'not_applicable'
        ) {
          continue;
        }

        const explicitTarget = Number(item?.targetAmount || 0);
        const targetAmount =
          explicitTarget > 0
            ? explicitTarget
            : typeCode === 'LEBARAN'
            ? rateResolver.resolveMemberRate(row.member_id, 'LEBARAN', selectedYear, monthNum)
            : rateResolver.getRateForPeriod(typeCode, selectedYear, monthNum);

        if (targetAmount <= 0 || existingPaid >= targetAmount) continue;

        const amountToInsert = Math.round(targetAmount - existingPaid);
        if (amountToInsert <= 0) continue;

        items.push({
          memberId: row.member_id,
          memberNrp: row.nrp,
          memberName: row.nama,
          depositTypeCode: typeCode,
          month: monthNum,
          year: selectedYear,
          amount: amountToInsert,
          targetAmount,
        });
        affectedMembers.add(row.member_id);
        totalAmount += amountToInsert;
      }
    }
  }

  return {
    items,
    affectedMemberCount: affectedMembers.size,
    totalItems: items.length,
    totalAmount,
  };
}

function isBulkPostgrestColumnError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  return (
    err?.code === 'PGRST204' ||
    err?.code === '42703' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

export const handleGlobalCheckAllUntilCurrentMonth = async (params: {
  plan: BulkCheckPlanSummary;
  selectedYear: number;
  targetMonths: number[];
  rangeLabel: string;
  setIsBulkChecking: (loading: boolean) => void;
  setBulkCheckProgress: (prog: { current: number; total: number; currentMemberName: string }) => void;
  setBulkCheckSummary: (res: BulkCheckExecutionSummary | null) => void;
  onComplete?: () => Promise<void> | void;
  feedback?: any;
}): Promise<BulkCheckExecutionSummary | null> => {
  const {
    plan,
    selectedYear,
    targetMonths,
    rangeLabel,
    setIsBulkChecking,
    setBulkCheckProgress,
    setBulkCheckSummary,
    onComplete,
    feedback,
  } = params;

  setIsBulkChecking(true);
  setBulkCheckProgress({ current: 0, total: plan.affectedMemberCount, currentMemberName: '' });
  setBulkCheckSummary(null);

  try {
    if (plan.items.length === 0 || targetMonths.length === 0) {
      const emptyRes: BulkCheckExecutionSummary = {
        totalSuccess: 0,
        totalFailed: 0,
        insertedCount: 0,
        totalAmount: 0,
      };
      setBulkCheckSummary(emptyRes);
      if (feedback?.showToast) {
        feedback.showToast('Seluruh sel pada rentang bulan tersebut sudah lunas', 'info');
      }
      return emptyRes;
    }

    // 1. Ambil master jenis simpanan (WAJIB, BELANJA, LEBARAN)
    const { data: depTypesData, error: depTypesErr } = await supabase
      .from('deposit_types')
      .select('id, code, name, default_amount');
    if (depTypesErr) {
      throw new Error(depTypesErr.message || 'Gagal memuat daftar jenis simpanan');
    }

    const depositTypeByCode = new Map<
      'WAJIB' | 'BELANJA' | 'LEBARAN',
      { id: string; name: string }
    >();
    for (const dt of depTypesData || []) {
      const code = resolveDepositTypeCode(dt);
      if (code && dt?.id && !depositTypeByCode.has(code)) {
        depositTypeByCode.set(code, {
          id: String(dt.id),
          name: String(dt.name || `Simpanan ${code}`),
        });
      }
    }

    // 2. Ambil rekening member_deposits yang sudah ada
    const uniqueMemberIds = Array.from(new Set(plan.items.map((i) => i.memberId)));
    const memberDepositMap = new Map<string, string>();
    const QUERY_CHUNK = 200;

    for (let i = 0; i < uniqueMemberIds.length; i += QUERY_CHUNK) {
      const memberChunk = uniqueMemberIds.slice(i, i + QUERY_CHUNK);
      const { data: mdRows, error: mdErr } = await supabase
        .from('member_deposits')
        .select('id, member_id, deposit_type_id')
        .in('member_id', memberChunk);
      if (mdErr) {
        throw new Error(mdErr.message || 'Gagal memuat rekening simpanan anggota');
      }
      for (const md of mdRows || []) {
        if (md?.id && md?.member_id && md?.deposit_type_id) {
          memberDepositMap.set(`${md.member_id}|${md.deposit_type_id}`, String(md.id));
        }
      }
    }

    // 3. Buat rekening member_deposits yang belum ada secara batch
    const missingAccountKeys = new Set<string>();
    const missingAccountsPayload: Array<{
      member_id: string;
      deposit_type_id: string;
      is_terminated: boolean;
    }> = [];

    for (const item of plan.items) {
      const dtInfo = depositTypeByCode.get(item.depositTypeCode);
      if (!dtInfo) continue;
      const key = `${item.memberId}|${dtInfo.id}`;
      if (!memberDepositMap.has(key) && !missingAccountKeys.has(key)) {
        missingAccountKeys.add(key);
        missingAccountsPayload.push({
          member_id: item.memberId,
          deposit_type_id: dtInfo.id,
          is_terminated: false,
        });
      }
    }

    const INSERT_CHUNK = 100;
    for (let i = 0; i < missingAccountsPayload.length; i += INSERT_CHUNK) {
      const chunk = missingAccountsPayload.slice(i, i + INSERT_CHUNK);
      const { data: createdMds, error: createMdErr } = await supabase
        .from('member_deposits')
        .insert(chunk)
        .select('id, member_id, deposit_type_id');
      if (createMdErr) {
        throw new Error(createMdErr.message || 'Gagal membuat rekening simpanan baru');
      }
      for (const md of createdMds || []) {
        if (md?.id && md?.member_id && md?.deposit_type_id) {
          memberDepositMap.set(`${md.member_id}|${md.deposit_type_id}`, String(md.id));
        }
      }
    }

    // 4. Guard idempotensi sisi server — jangan pernah menyentuh Saldo Awal Cut-Off
    const involvedMemberDepositIds = Array.from(new Set(memberDepositMap.values()));
    const existingPeriodSums = new Map<string, number>();

    for (let i = 0; i < involvedMemberDepositIds.length; i += QUERY_CHUNK) {
      const mdChunk = involvedMemberDepositIds.slice(i, i + QUERY_CHUNK);
      const { data: existingTxs, error: existingTxErr } = await supabase
        .from('deposit_transactions')
        .select('id, member_deposit_id, for_year, for_month, amount, transaction_type, description')
        .in('member_deposit_id', mdChunk)
        .eq('for_year', selectedYear)
        .in('for_month', targetMonths)
        .eq('transaction_type', 'deposit');
      if (existingTxErr) {
        throw new Error(existingTxErr.message || 'Gagal memverifikasi mutasi simpanan eksisting');
      }

      for (const tx of existingTxs || []) {
        if (isOpeningOrMigrationDepositDescription(tx.description)) continue;
        const fy = Number(tx.for_year || 0);
        const fm = Number(tx.for_month || 0);
        if (!tx.member_deposit_id || fy <= 0 || fm <= 0) continue;
        const periodKey = `${tx.member_deposit_id}|${fy}|${fm}`;
        existingPeriodSums.set(
          periodKey,
          (existingPeriodSums.get(periodKey) || 0) + Number(tx.amount || 0)
        );
      }
    }

    interface ResolvedInsertItem {
      memberId: string;
      memberNrp: string;
      memberName: string;
      memberDepositId: string;
      depositTypeCode: 'WAJIB' | 'BELANJA' | 'LEBARAN';
      depositTypeName: string;
      month: number;
      year: number;
      amount: number;
    }

    const rowsToInsert: ResolvedInsertItem[] = [];
    const failedMemberIds = new Set<string>();

    for (const item of plan.items) {
      const dtInfo = depositTypeByCode.get(item.depositTypeCode);
      if (!dtInfo) {
        failedMemberIds.add(item.memberId);
        continue;
      }
      const memberDepositId = memberDepositMap.get(`${item.memberId}|${dtInfo.id}`);
      if (!memberDepositId) {
        failedMemberIds.add(item.memberId);
        continue;
      }

      const periodKey = `${memberDepositId}|${item.year}|${item.month}`;
      const alreadyPaid = existingPeriodSums.get(periodKey) || 0;
      if (alreadyPaid >= item.targetAmount) {
        continue;
      }

      const finalAmount = Math.round(item.targetAmount - alreadyPaid);
      if (finalAmount <= 0) continue;

      existingPeriodSums.set(periodKey, alreadyPaid + finalAmount);
      rowsToInsert.push({
        memberId: item.memberId,
        memberNrp: item.memberNrp,
        memberName: item.memberName,
        memberDepositId,
        depositTypeCode: item.depositTypeCode,
        depositTypeName: dtInfo.name,
        month: item.month,
        year: item.year,
        amount: finalAmount,
      });
    }

    if (rowsToInsert.length === 0) {
      const noOpSummary: BulkCheckExecutionSummary = {
        totalSuccess: 0,
        totalFailed: failedMemberIds.size,
        insertedCount: 0,
        totalAmount: 0,
      };
      setBulkCheckSummary(noOpSummary);
      if (feedback?.showToast) {
        feedback.showToast('Seluruh sel pada rentang bulan tersebut sudah lunas', 'info');
      }
      return noOpSummary;
    }

    // 5. Batch insert ke public.deposit_transactions & public.cash_flow
    const DEPOSIT_TYPE_SORT_ORDER: Record<string, number> = {
      POKOK: 1,
      WAJIB: 2,
      BELANJA: 3,
      LEBARAN: 4,
    };
    rowsToInsert.sort((a, b) => {
      const nrpCmp = String(a.memberNrp || '').localeCompare(String(b.memberNrp || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (nrpCmp !== 0) return nrpCmp;

      const typeCmp =
        (DEPOSIT_TYPE_SORT_ORDER[a.depositTypeCode] ?? 99) -
        (DEPOSIT_TYPE_SORT_ORDER[b.depositTypeCode] ?? 99);
      if (typeCmp !== 0) return typeCmp;

      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    const baseTimestamp = Date.now();
    const totalMembersToProcess = new Set(rowsToInsert.map((r) => r.memberId)).size;
    const processedMemberIds = new Set<string>();
    const succeededMemberIds = new Set<string>();
    let insertedCount = 0;
    let insertedTotalAmount = 0;

    setBulkCheckProgress({
      current: 0,
      total: totalMembersToProcess,
      currentMemberName: rowsToInsert[0]?.memberName || '',
    });

    for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK) {
      const chunk = rowsToInsert.slice(i, i + INSERT_CHUNK);
      const chunkMetaByKey = new Map<string, ResolvedInsertItem & { createdAtIso: string }>();
      const txPayload = chunk.map((r, idx) => {
        const itemCreatedAtIso = new Date(baseTimestamp + (i + idx) * 10).toISOString();
        chunkMetaByKey.set(`${r.memberDepositId}|${r.year}|${r.month}`, {
          ...r,
          createdAtIso: itemCreatedAtIso,
        });
        return {
          member_deposit_id: r.memberDepositId,
          transaction_type: 'deposit',
          amount: r.amount,
          for_month: r.month,
          for_year: r.year,
          description: `Centang Setoran Rutin Matriks (${r.depositTypeCode})`,
          created_at: itemCreatedAtIso,
        };
      });

      const { data: insertedTxs, error: insertTxErr } = await supabase
        .from('deposit_transactions')
        .insert(txPayload)
        .select('id, member_deposit_id, amount, for_month, for_year, reference_no, created_at');

      if (insertTxErr) {
        throw insertTxErr;
      }

      const insertedList = Array.isArray(insertedTxs) ? insertedTxs : [];
      const cashFlowPayload: Array<{
        direction: 'in';
        category: string;
        amount: number;
        reference_id: string;
        description: string;
        created_at: string;
      }> = [];

      for (let cfIdx = 0; cfIdx < insertedList.length; cfIdx += 1) {
        const txRow = insertedList[cfIdx];
        const roundedAmt = Math.round(Number(txRow?.amount || 0));
        if (!txRow?.id || roundedAmt <= 0) continue;
        const fy = Number(txRow.for_year || 0);
        const fm = Number(txRow.for_month || 0);
        const meta = chunkMetaByKey.get(`${txRow.member_deposit_id}|${fy}|${fm}`);

        const description = formatMatrixDepositCashFlowDescription({
          depositTypeName: meta?.depositTypeName || null,
          month: fm,
          year: fy,
          memberNrp: meta?.memberNrp || null,
          memberName: meta?.memberName || null,
          referenceNo: txRow.reference_no || null,
        });

        cashFlowPayload.push({
          direction: 'in',
          category: 'Setoran Simpanan',
          amount: roundedAmt,
          reference_id: String(txRow.id),
          description,
          created_at:
            meta?.createdAtIso ||
            txRow.created_at ||
            new Date(baseTimestamp + (i + cfIdx) * 10).toISOString(),
        });

        insertedCount += 1;
        insertedTotalAmount += roundedAmt;
        if (meta?.memberId) {
          succeededMemberIds.add(meta.memberId);
        }
      }

      if (cashFlowPayload.length > 0) {
        const cfRes: any = await supabase.from('cash_flow').insert(cashFlowPayload);
        if (cfRes?.error) {
          if (isBulkPostgrestColumnError(cfRes.error)) {
            const fallbackPayload = cashFlowPayload.map(({ description: _d, ...rest }) => rest);
            const fallbackRes: any = await supabase.from('cash_flow').insert(fallbackPayload);
            if (fallbackRes?.error) {
              throw new Error(
                `Gagal mencatat ke Arus Kas: ${fallbackRes.error.message || String(fallbackRes.error)}`
              );
            }
          } else {
            throw new Error(
              `Gagal mencatat ke Arus Kas: ${cfRes.error.message || String(cfRes.error)}`
            );
          }
        }
      }

      for (const r of chunk) {
        processedMemberIds.add(r.memberId);
      }
      setBulkCheckProgress({
        current: processedMemberIds.size,
        total: totalMembersToProcess,
        currentMemberName: chunk[chunk.length - 1]?.memberName || '',
      });
    }

    const summary: BulkCheckExecutionSummary = {
      totalSuccess: succeededMemberIds.size,
      totalFailed: failedMemberIds.size,
      insertedCount,
      totalAmount: insertedTotalAmount,
    };

    setBulkCheckSummary(summary);
    if (onComplete) {
      await onComplete();
    }
    if (feedback?.showToast) {
      feedback.showToast(
        `Berhasil mencatat ${insertedCount} setoran (${formatCurrency(insertedTotalAmount)}) untuk periode ${rangeLabel}`,
        'success'
      );
    }
    return summary;
  } catch (err: any) {
    console.error('Global bulk check-all error:', err);
    const failSummary: BulkCheckExecutionSummary = {
      totalSuccess: 0,
      totalFailed: Math.max(1, plan.affectedMemberCount),
      insertedCount: 0,
      totalAmount: 0,
    };
    setBulkCheckSummary(failSummary);
    if (feedback?.showToast) {
      feedback.showToast(
        'Gagal memproses centang massal: ' + (err?.message || 'Terjadi kesalahan'),
        'error'
      );
    }
    return null;
  } finally {
    setIsBulkChecking(false);
  }
};

export const handleBulkCheckAllUpToNow = async (
  targetType: 'WAJIB' | 'BELANJA' | 'LEBARAN' | 'ALL',
  setIsBulkChecking: (loading: boolean) => void,
  setBulkCheckProgress: (prog: { current: number; total: number; currentMemberName: string }) => void,
  setBulkCheckSummary: (res: { totalSuccess: number; totalFailed: number } | null) => void,
  onComplete?: () => void
): Promise<{ totalSuccess: number; totalFailed: number } | null> => {
  setIsBulkChecking(true);
  setBulkCheckProgress({ current: 0, total: 0, currentMemberName: '' });
  setBulkCheckSummary(null);
  try {
    const res = await bulkCheckAllUpToCurrentMonth(targetType, (p) => {
      setBulkCheckProgress(p);
    });
    setBulkCheckSummary(res);
    if (onComplete) onComplete();
    return res;
  } catch (err) {
    console.error('Bulk check-all error:', err);
    setBulkCheckSummary({ totalSuccess: 0, totalFailed: 1 });
    return null;
  } finally {
    setIsBulkChecking(false);
  }
};

export const fetchComplianceMatrixData = async (
  targetYear: number | string,
  setLoading: (l: boolean) => void,
  setData: (d: ComplianceMatrixRow[]) => void,
  setTargets: (t: any) => void,
  setTotalSetoran: (s: number) => void,
  setRateTiers?: (r: SavingsRateTier[]) => void,
  setCutoffDate?: (d: string | null) => void
): Promise<{ rows: ComplianceMatrixRow[]; targets?: any; totalSetoran: number; rateTiers?: SavingsRateTier[] } | null> => {
  setLoading(true);
  try {
    const yearNum = typeof targetYear === 'string' ? parseInt(targetYear, 10) : targetYear;
    const matrixData = await getComplianceMatrixData(yearNum);
    setData(matrixData.rows || []);
    if (setCutoffDate) {
      setCutoffDate(matrixData.cutoffDate ?? null);
    }
    if (matrixData.targets) {
      setTargets(matrixData.targets);
    }
    if (setRateTiers && matrixData.rateTiers && matrixData.rateTiers.length > 0) {
      setRateTiers(matrixData.rateTiers);
    }
    
    // Fetch total setoran
    const { data: txs } = await supabase
      .from('deposit_transactions')
      .select('amount, transaction_type')
      .eq('for_year', yearNum);
      
    let sum = 0;
    if (txs) {
      txs.forEach((tx: any) => {
        if (tx.transaction_type === 'deposit') sum += Number(tx.amount);
        else if (tx.transaction_type === 'withdrawal') sum -= Number(tx.amount);
      });
    }
    setTotalSetoran(sum);
    return { rows: matrixData.rows || [], targets: matrixData.targets, totalSetoran: sum, rateTiers: matrixData.rateTiers };
  } catch (err) {
    console.error('Failed to fetch compliance matrix', err);
    return null;
  } finally {
    setLoading(false);
  }
};

export const fetchComplianceData = fetchComplianceMatrixData;

function ComplianceMatrixContent({
  initialYear,
  initialAvailableYears,
  onYearChange,
  initialData,
  initialSelectedMember,
  initialShowCheckAllConfirmModal,
  initialBulkChecking,
  initialBulkCheckTargetType,
  initialBulkCheckProgress,
  initialBulkCheckSummary,
  initialShowImportModal,
  initialShowExportDropdown,
  initialIsExporting,
  initialCutoffDate,
  initialSearch = '',
  initialTraceRef = '',
  initialFilterType = '',
  initialTracePeriod = '',
  initialTraceRows,
  urlSearch = '',
  urlRef = '',
  urlType = '',
  urlPeriod = '',
  onClearUrlParams,
}: ComplianceMatrixInternalProps) {
  const inRouter = useInRouterContext();
  const currentYearStr = new Date().getFullYear().toString();
  const initialParsedPeriod = parseShortPeriodParam(urlPeriod || initialTracePeriod);
  const [year, setYear] = useState<string>(
    initialYear
      ? initialYear.toString()
      : initialParsedPeriod
      ? initialParsedPeriod.year.toString()
      : currentYearStr
  );
  const [availableYears, setAvailableYears] = useState<number[]>(
    initialAvailableYears && initialAvailableYears.length > 0
      ? initialAvailableYears
      : [new Date().getFullYear()]
  );
  const [filterType, setFilterType] = useState(() =>
    normalizeDepositFilterType(urlType || initialFilterType)
  );
  const [search, setSearch] = useState(
    urlSearch || initialSearch || (urlRef && !urlSearch ? urlRef : '')
  );
  const [activeTraceRef, setActiveTraceRef] = useState(urlRef || initialTraceRef || '');
  const [activeTracePeriod, setActiveTracePeriod] = useState(
    urlPeriod || initialTracePeriod || ''
  );
  const [traceRows, setTraceRows] = useState<MemberDepositBatchItem[]>(initialTraceRows || []);
  const [traceResolvedReceipt, setTraceResolvedReceipt] = useState<string | null>(null);
  const [traceMember, setTraceMember] = useState<{
    id: string;
    nrp: string;
    nama: string;
    tanggal_lahir?: string | null;
  } | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [data, setData] = useState<ComplianceMatrixRow[]>(initialData || []);
  const [cutoffDate, setCutoffDate] = useState<string | null>(initialCutoffDate ?? null);

  const effectiveCutoffDate = useMemo(() => {
    if (cutoffDate) return cutoffDate;
    const rowCutoff = data.find(r => r.cutoffDate)?.cutoffDate;
    return rowCutoff || null;
  }, [cutoffDate, data]);

  const cutoffInfo = useMemo(() => parseCutoffDateInfo(effectiveCutoffDate), [effectiveCutoffDate]);

  const selectedYear = useMemo(() => parseInt(year, 10) || new Date().getFullYear(), [year]);
  const cutoffYear = cutoffInfo?.year ?? data.find(r => r.cutoffYear)?.cutoffYear ?? null;
  const cutoffMonth = cutoffInfo?.month ?? data.find(r => r.cutoffMonth)?.cutoffMonth ?? null;

  const visibleMonths = useMemo(() => {
    const allMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    if (cutoffYear && cutoffMonth && selectedYear === cutoffYear) {
      return allMonths.filter((m) => m >= cutoffMonth);
    }
    if (cutoffYear && selectedYear < cutoffYear) {
      return [];
    }
    return allMonths;
  }, [selectedYear, cutoffYear, cutoffMonth]);

  const currentPeriod = useMemo(() => {
    const now = new Date();
    if (effectiveCutoffDate) {
      return { year: selectedYear, month: 12 };
    }
    if (!isNaN(selectedYear) && selectedYear !== now.getFullYear()) {
      return { year: selectedYear, month: 12 };
    }
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, [selectedYear, effectiveCutoffDate]);

  const rollingMonths = useMemo(() => {
    if (data.length > 0 && data[0]?.periods && data[0].periods.length === 12) {
      return data[0].periods;
    }
    return getRolling12MonthRange(currentPeriod.year, currentPeriod.month);
  }, [data, currentPeriod]);
  const [targets, setTargets] = useState({ wajib: 25000, belanja: 50000, lebaran: 50000 });
  const [rateTiers, setRateTiers] = useState<SavingsRateTier[]>(DEFAULT_RATE_TIERS);
  const [loading, setLoading] = useState(initialData === undefined);
  const [selectedMember, setSelectedMember] = useState<{
    id: string;
    nrp: string;
    nama: string;
    joinDate?: string | null;
  } | null>(initialSelectedMember || null);
  const [totalSetoran, setTotalSetoran] = useState(0);

  const [showCheckAllConfirmModal, setShowCheckAllConfirmModal] = useState(initialShowCheckAllConfirmModal || false);
  const [isBulkChecking, setIsBulkChecking] = useState(initialBulkChecking || false);
  const [bulkCheckTargetType, setBulkCheckTargetType] = useState<'WAJIB' | 'BELANJA' | 'LEBARAN' | 'ALL'>(
    initialBulkCheckTargetType || 'ALL'
  );
  const [bulkCheckProgress, setBulkCheckProgress] = useState<{ current: number; total: number; currentMemberName: string }>(
    initialBulkCheckProgress || { current: 0, total: 0, currentMemberName: '' }
  );
  const [bulkCheckSummary, setBulkCheckSummary] = useState<BulkCheckExecutionSummary | null>(
    initialBulkCheckSummary || null
  );

  const [showImportModal, setShowImportModal] = useState(initialShowImportModal || false);
  const [showExportDropdown, setShowExportDropdown] = useState(initialShowExportDropdown || false);
  const [isExporting, setIsExporting] = useState(initialIsExporting || false);

  const [selectedMemberForPokok, setSelectedMemberForPokok] = useState<{
    id: string;
    nama: string;
    nrp: string;
    status?: string;
    membership_status?: string;
  } | null>(null);
  const [isPokokModalOpen, setIsPokokModalOpen] = useState(false);

  const feedback = useContext(FeedbackContext);

  const handleReloadAfterBulkCheck = async () => {
    clearTierCache();
    await fetchComplianceData(year, setLoading, setData, setTargets, setTotalSetoran, setRateTiers, setCutoffDate);
    setShowCheckAllConfirmModal(false);
    setBulkCheckSummary(null);
    if (feedback?.showToast) {
      feedback.showToast('Data matriks berhasil disinkronisasi', 'success');
    }
  };

  useEffect(() => {
    loadComplianceAvailableYearsData(setAvailableYears, setYear);
    getRateTiers(undefined, false)
      .then(tiers => {
        if (tiers && tiers.length > 0) setRateTiers(tiers);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchComplianceMatrixData(year, setLoading, setData, setTargets, setTotalSetoran, setRateTiers, setCutoffDate);
    if (onYearChange) {
      onYearChange(year);
    }
  }, [year]);

  const effectiveTraceCode = (
    activeTraceRef ||
    (/^(KW-|CF-|(?:KW|KS)\d{4}-\d{4,})/i.test(search.trim()) ? search.trim() : '')
  ).trim();

  useEffect(() => {
    if (urlSearch) {
      setSearch(urlSearch);
    }
    if (urlRef) {
      setActiveTraceRef(urlRef);
      if (!urlSearch) {
        setSearch(urlRef);
      }
    }
    if (urlType) {
      setFilterType(normalizeDepositFilterType(urlType));
    }
    if (urlPeriod) {
      setActiveTracePeriod(urlPeriod);
      const parsed = parseShortPeriodParam(urlPeriod);
      if (parsed) {
        const parsedYearStr = String(parsed.year);
        setYear((prev) => (prev === parsedYearStr ? prev : parsedYearStr));
      }
    }
  }, [urlSearch, urlRef, urlType, urlPeriod]);

  useEffect(() => {
    if (initialTraceRows !== undefined) {
      setTraceRows(initialTraceRows);
      return;
    }
    if (!effectiveTraceCode) {
      setTraceRows([]);
      setTraceResolvedReceipt(null);
      setTraceMember(null);
      setTraceLoading(false);
      return;
    }

    let cancelled = false;
    setTraceLoading(true);
    const nrpHint =
      search.trim() && search.trim().toUpperCase() !== effectiveTraceCode.toUpperCase()
        ? search.trim()
        : null;

    getTraceBackDepositRows(effectiveTraceCode, nrpHint)
      .then((res) => {
        if (cancelled) return;
        setTraceRows(res.items);
        setTraceResolvedReceipt(res.resolvedReceiptCode);
        setTraceMember(res.member);
        if (!urlPeriod && !initialYear && res.items.length > 0 && res.items[0]?.forYear) {
          const fy = Number(res.items[0].forYear);
          if (Number.isInteger(fy) && fy > 0) {
            const fyStr = String(fy);
            setYear((prev) => (prev === fyStr ? prev : fyStr));
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setTraceRows([]);
      })
      .finally(() => {
        if (!cancelled) setTraceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveTraceCode, initialTraceRows]);

  const handleResetTraceBack = () => {
    setActiveTraceRef('');
    setActiveTracePeriod('');
    setSearch('');
    setFilterType('all');
    setTraceRows([]);
    setTraceResolvedReceipt(null);
    setTraceMember(null);
    onClearUrlParams?.();
  };

  const traceMatchedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    if (traceMember?.id) ids.add(String(traceMember.id));
    for (const item of traceRows) {
      if (item.memberId) ids.add(String(item.memberId));
    }
    return ids;
  }, [traceMember, traceRows]);

  const activeHighlightRefs = useMemo(() => {
    const refs = new Set<string>();
    if (effectiveTraceCode) refs.add(effectiveTraceCode.toUpperCase());
    if (traceResolvedReceipt) refs.add(traceResolvedReceipt.toUpperCase());
    return refs;
  }, [effectiveTraceCode, traceResolvedReceipt]);

  const traceMatchedPeriods = useMemo(() => {
    const set = new Set<string>();
    for (const item of traceRows) {
      if (item.forYear && item.forMonth) {
        set.add(`${item.forYear}-${item.forMonth}`);
      }
    }
    const parsed = parseShortPeriodParam(activeTracePeriod);
    if (parsed) {
      set.add(`${parsed.year}-${parsed.month}`);
    }
    return set;
  }, [traceRows, activeTracePeriod]);

  const filteredData = useMemo(
    () =>
      data.filter((row) =>
        rowMatchesSavingsSearch(row, search || activeTraceRef, traceMatchedMemberIds)
      ),
    [data, search, activeTraceRef, traceMatchedMemberIds]
  );

  const bulkTargetRange = useMemo(
    () => computeBulkCheckTargetMonths(visibleMonths, selectedYear),
    [visibleMonths, selectedYear]
  );

  const bulkPlan = useMemo(
    () =>
      buildBulkCheckPlan({
        rows: filteredData,
        targetType: bulkCheckTargetType,
        targetMonths: bulkTargetRange.targetMonths,
        selectedYear,
        rateTiers,
        targets,
      }),
    [filteredData, bulkCheckTargetType, bulkTargetRange.targetMonths, selectedYear, rateTiers, targets]
  );

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeTraceRef]);

  const totalFiltered = filteredData.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const ytdCompliance = data.length > 0 
    ? (data.reduce((acc, row) => acc + row.compliance, 0) / data.length).toFixed(1)
    : '100';

  const currentMonthColIdx = rollingMonths.length - 1;
  const membersInArrears = data.filter(row => {
    if ((row.membership_status || '').toUpperCase() === 'SUSPENDED') return false;
    const currentMonthData = row.months[currentMonthColIdx] ?? row.months[CURRENT_MONTH];
    if (currentMonthData) {
      const isWajibArrears = currentMonthData.wajib ? currentMonthData.wajib.status === 'unpaid' : currentMonthData.w <= 0;
      const isBelanjaArrears = currentMonthData.belanja ? currentMonthData.belanja.status === 'unpaid' : currentMonthData.b <= 0;
      const isLebaranArrears = currentMonthData.lebaran ? currentMonthData.lebaran.status === 'unpaid' : currentMonthData.l <= 0;

      if (filterType === 'wajib') return isWajibArrears;
      if (filterType === 'belanja') return isBelanjaArrears;
      if (filterType === 'lebaran') return isLebaranArrears;
      return isWajibArrears || isBelanjaArrears || isLebaranArrears;
    }
    return false;
  }).length;

  const renderCell = (monthData: ComplianceMonthData | null, monthIndex: number, row: ComplianceMatrixRow) => {
    if (!monthData) return <div className="text-gray-300 text-xs text-center">-</div>;

    const colPeriod = rollingMonths[monthIndex];
    const yearNum = colPeriod?.year ?? parseInt(year, 10);
    const monthNum = colPeriod?.month ?? (monthIndex + 1);
    const rateResolver = buildSavingsRateResolver(rateTiers, [
      { code: 'WAJIB', default_amount: targets.wajib },
      { code: 'BELANJA', default_amount: targets.belanja },
      { code: 'LEBARAN', default_amount: targets.lebaran }
    ]);
    const applicableTariffW = rateResolver.getRateForPeriod('WAJIB', yearNum, monthNum);
    const applicableTariffB = rateResolver.getRateForPeriod('BELANJA', yearNum, monthNum);
    const applicableTariffL = rateResolver.resolveMemberRate(row.member_id, 'LEBARAN', yearNum, monthNum);

    const targetW = monthData.wajib?.targetAmount || applicableTariffW;
    const targetB = monthData.belanja?.targetAmount || applicableTariffB;
    const targetL = monthData.lebaran?.targetAmount || applicableTariffL;

    const totalOpeningBal = row.openingBalance
      ? Number(row.openingBalance.w || 0) + Number(row.openingBalance.b || 0) + Number(row.openingBalance.l || 0)
      : 0;

    const monthlyDepositTotal = Number(monthData.w || 0) + Number(monthData.b || 0) + Number(monthData.l || 0);
    const cumW = monthData.cum_w !== undefined ? Number(monthData.cum_w) : Number(monthData.bal_w || 0);
    const cumB = monthData.cum_b !== undefined ? Number(monthData.cum_b) : Number(monthData.bal_b || 0);
    const cumL = monthData.cum_l !== undefined ? Number(monthData.cum_l) : Number(monthData.bal_l || 0);
    const totalKumulatif = cumW + cumB + cumL;

    const totalReferenceAmount = (row.netSavings?.total && row.netSavings.total > 0)
      ? row.netSavings.total
      : (row.balances ? (row.balances.w + row.balances.b + row.balances.l) : 0);

    const percentageOfTotal = totalReferenceAmount > 0
      ? Math.min(100, Math.round((totalKumulatif / totalReferenceAmount) * 100))
      : 100;

    const isMemberSuspended = (row.membership_status || '').toUpperCase() === 'SUSPENDED';

    // Evaluasi fallback jika baris bulan belum memiliki sub-item eksplisit
    let fallbackStatusW: 'paid' | 'unpaid' | 'not_applicable' | 'partial' | 'unbilled' | 'frozen' = isMemberSuspended ? 'frozen' : 'unpaid';
    if (monthData.w >= targetW) fallbackStatusW = 'paid';
    else if (monthData.w > 0) fallbackStatusW = 'partial';
    else if (!isMemberSuspended) {
      let lastPosIdxW = -1;
      let hasPartialInRowW = false;
      row.months.forEach((m, idx) => {
        if (m && m.w > 0) {
          lastPosIdxW = idx;
          if (m.w < targetW || m.wajib?.status === 'partial') hasPartialInRowW = true;
        }
      });
      if ((hasPartialInRowW || lastPosIdxW >= 0) && monthIndex > lastPosIdxW && lastPosIdxW !== -1) {
        fallbackStatusW = 'unbilled';
      }
    }

    const wajibItem = monthData.wajib || {
      status: fallbackStatusW,
      amount: monthData.w > 0 ? monthData.w : fallbackStatusW === 'unpaid' ? targetW : 0,
      targetAmount: targetW,
    };
    const belanjaItem = monthData.belanja || {
      status: (monthData.b > 0 ? (monthData.b < targetB ? 'partial' : 'paid') : (isMemberSuspended ? 'frozen' : 'unpaid')) as 'paid' | 'unpaid' | 'not_applicable' | 'partial' | 'unbilled' | 'frozen',
      amount: monthData.b > 0 ? monthData.b : (isMemberSuspended ? 0 : targetB),
      targetAmount: targetB,
    };
    const lebaranItem = monthData.lebaran || {
      status: (monthData.l > 0 ? (monthData.l < targetL ? 'partial' : 'paid') : (isMemberSuspended ? 'frozen' : 'unpaid')) as 'paid' | 'unpaid' | 'not_applicable' | 'partial' | 'unbilled' | 'frozen',
      amount: monthData.l > 0 ? monthData.l : (isMemberSuspended ? 0 : targetL),
      targetAmount: targetL,
    };

    const isWajibCovered = wajibItem.status === 'covered_by_opening';
    const isBelanjaCovered = belanjaItem.status === 'covered_by_opening';
    const isLebaranCovered = lebaranItem.status === 'covered_by_opening';

    const isWajibFrozen = wajibItem.status === 'frozen';
    const isBelanjaFrozen = belanjaItem.status === 'frozen';
    const isLebaranFrozen = lebaranItem.status === 'frozen';

    const isWajibUnbilled = wajibItem.status === 'unbilled' || wajibItem.status === 'not_applicable' || isWajibCovered;
    const isBelanjaUnbilled = belanjaItem.status === 'unbilled' || belanjaItem.status === 'not_applicable' || isBelanjaCovered;
    const isLebaranUnbilled = lebaranItem.status === 'unbilled' || lebaranItem.status === 'not_applicable' || isLebaranCovered;
    const isMonthAllCovered = isWajibCovered && isBelanjaCovered && isLebaranCovered;

    const isWajibPartial = !isWajibUnbilled && !isWajibFrozen && wajibItem.status !== 'paid' && (wajibItem.status === 'partial' || (Number(wajibItem.amount) > 0 && Number(wajibItem.amount) < targetW));
    const isBelanjaPartial = !isBelanjaUnbilled && !isBelanjaFrozen && belanjaItem.status !== 'paid' && (belanjaItem.status === 'partial' || (Number(belanjaItem.amount) > 0 && Number(belanjaItem.amount) < targetB));
    const isLebaranPartial = !isLebaranUnbilled && !isLebaranFrozen && lebaranItem.status !== 'paid' && (lebaranItem.status === 'partial' || (Number(lebaranItem.amount) > 0 && Number(lebaranItem.amount) < targetL));
    const rowMatchesTracedMember =
      traceMatchedMemberIds.size > 0
        ? traceMatchedMemberIds.has(row.member_id) ||
          Boolean(
            traceMember?.nrp &&
              row.nrp.trim().toLowerCase() === traceMember.nrp.trim().toLowerCase()
          )
        : traceMember?.nrp
        ? row.nrp.trim().toLowerCase() === traceMember.nrp.trim().toLowerCase()
        : true;

    const cellMatchesByRef =
      activeHighlightRefs.size > 0 &&
      [wajibItem.reference_no, belanjaItem.reference_no, lebaranItem.reference_no].some(
        (ref) => ref && activeHighlightRefs.has(String(ref).trim().toUpperCase())
      );

    const cellMatchesByPeriod =
      Boolean(effectiveTraceCode || activeTracePeriod) &&
      rowMatchesTracedMember &&
      traceMatchedPeriods.has(`${yearNum}-${monthNum}`);

    const cellMatchesTrace = cellMatchesByRef || cellMatchesByPeriod;

    return (
      <div 
        onClick={() => setSelectedMember({
          id: row.member_id,
          nrp: row.nrp,
          nama: row.nama,
          joinDate: row.tgl_awal_anggota || row.created_at
        })}
        className={`relative group flex flex-col gap-0.5 py-1 px-1.5 text-[11px] leading-tight font-mono select-none rounded hover:bg-slate-100/80 cursor-pointer transition-colors ${
          cellMatchesTrace ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : ''
        }`}
        title={isMonthAllCovered
          ? `Sudah tercakup dalam Saldo Awal (${colPeriod?.label || `${MONTHS[monthIndex]} ${year}`})`
          : `Klik untuk rincian buku besar ${row.nama} - ${MONTHS[monthIndex]} ${year}`
        }
      >
        {monthIndex === 0 && totalOpeningBal > 0 && !effectiveCutoffDate && !isMonthAllCovered && (
          <span
            className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 block text-center truncate mb-0.5"
            title={`Saldo Bawaan (pra-jendela): Rp ${totalOpeningBal.toLocaleString('id-ID')}`}
            data-testid="opening-balance-indicator"
          >
            + Saldo Awal Rp {totalOpeningBal.toLocaleString('id-ID')}
          </span>
        )}

        {/* Baris Simpanan Wajib */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500">wajib</span>
          <span className={
            isWajibFrozen
              ? 'text-slate-500 bg-slate-100 border border-slate-200 px-1 rounded text-[10px] font-semibold'
              : isWajibUnbilled
              ? 'text-slate-300 font-normal'
              : isWajibPartial
              ? 'text-amber-600 font-bold'
              : wajibItem.status === 'paid'
              ? 'text-emerald-600 font-semibold'
              : wajibItem.status === 'unpaid'
              ? 'text-rose-600 font-bold'
              : 'text-slate-400'
          }>
            {isWajibFrozen
              ? 'BEKU'
              : isWajibUnbilled
              ? '-'
              : Number(wajibItem.amount || targetW).toLocaleString('id-ID')}
          </span>
        </div>

        {/* Baris Simpanan Belanja */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500">belanja</span>
          <span className={
            isBelanjaFrozen
              ? 'text-slate-500 bg-slate-100 border border-slate-200 px-1 rounded text-[10px] font-semibold'
              : isBelanjaUnbilled
              ? 'text-slate-300 font-normal'
              : isBelanjaPartial
              ? 'text-amber-600 font-bold'
              : belanjaItem.status === 'paid'
              ? 'text-teal-600 font-semibold'
              : belanjaItem.status === 'unpaid'
              ? 'text-rose-600 font-bold'
              : 'text-slate-400'
          }>
            {isBelanjaFrozen
              ? 'BEKU'
              : isBelanjaUnbilled
              ? '-'
              : Number(belanjaItem.amount || targetB).toLocaleString('id-ID')}
          </span>
        </div>

        {/* Baris Simpanan Lebaran */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500">lebaran</span>
          <span className={
            isLebaranFrozen
              ? 'text-slate-500 bg-slate-100 border border-slate-200 px-1 rounded text-[10px] font-semibold'
              : isLebaranUnbilled
              ? 'text-slate-300 font-normal'
              : isLebaranPartial
              ? 'text-amber-600 font-bold'
              : lebaranItem.status === 'paid'
              ? 'text-emerald-600 font-semibold'
              : lebaranItem.status === 'unpaid'
              ? 'text-rose-600 font-bold'
              : 'text-slate-400'
          }>
            {isLebaranFrozen
              ? 'BEKU'
              : isLebaranUnbilled
              ? '-'
              : Number(lebaranItem.amount || targetL).toLocaleString('id-ID')}
          </span>
        </div>

        {/* Tooltip Hover Detail */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-slate-800 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-3 pointer-events-none">
          <div className="font-semibold mb-2 text-slate-200 border-b border-slate-600 pb-1">{colPeriod?.label || `${MONTHS[monthIndex]} ${year}`}</div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center gap-2 border-b border-slate-700/50 pb-1.5 mb-1.5">
              <span>Wajib:</span>
              <div className="text-right">
                <div>
                  {isWajibFrozen ? (
                    <span className="text-slate-300 font-medium">BEKU (Nonaktif Sementara)</span>
                  ) : isWajibUnbilled ? (
                    <span className="text-slate-400">
                      {isWajibCovered
                        ? 'Sudah tercakup dalam Saldo Awal'
                        : wajibItem.status === 'unbilled'
                        ? 'Belum Terbit Tagihan'
                        : '-'}
                    </span>
                  ) : isWajibPartial ? (
                    <span className="text-amber-400 font-medium">
                      Setoran Parsial: Rp {Number(wajibItem.amount).toLocaleString('id-ID')} dari kewajiban Rp {Number(targetW).toLocaleString('id-ID')} (Kurang Rp {Number(targetW - Number(wajibItem.amount)).toLocaleString('id-ID')})
                    </span>
                  ) : wajibItem.status === 'paid' ? (
                    <span className="text-emerald-400">{formatCurrency(Number(wajibItem.amount))}</span>
                  ) : (
                    <span className="text-red-400 font-medium">Belum</span>
                  )}
                  {wajibItem.reference_no && (
                    <div className="text-[10px] text-emerald-300 font-mono mt-0.5" data-testid="tooltip-ref-wajib">
                      Bukti: {wajibItem.reference_no}
                      {wajibItem.notes && <span className="text-slate-300 block text-[9px] font-sans italic">"{wajibItem.notes}"</span>}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium border-t border-slate-700 pt-0.5">Total: Rp {Number(monthData.bal_w || 0).toLocaleString('id-ID')}</div>
              </div>
            </div>
            <div className="flex justify-between items-center gap-2 border-b border-slate-700/50 pb-1.5 mb-1.5">
              <span>Belanja:</span>
              <div className="text-right">
                <div>
                  {isBelanjaFrozen ? (
                    <span className="text-slate-300 font-medium">BEKU (Nonaktif Sementara)</span>
                  ) : isBelanjaUnbilled ? (
                    <span className="text-slate-400">
                      {isBelanjaCovered
                        ? 'Sudah tercakup dalam Saldo Awal'
                        : belanjaItem.status === 'unbilled'
                        ? 'Belum Terbit Tagihan'
                        : '-'}
                    </span>
                  ) : isBelanjaPartial ? (
                    <span className="text-amber-400 font-medium">
                      Setoran Parsial: Rp {Number(belanjaItem.amount).toLocaleString('id-ID')} dari kewajiban Rp {Number(targetB).toLocaleString('id-ID')} (Kurang Rp {Number(targetB - Number(belanjaItem.amount)).toLocaleString('id-ID')})
                    </span>
                  ) : belanjaItem.status === 'paid' ? (
                    <span className="text-teal-400">{formatCurrency(Number(belanjaItem.amount))}</span>
                  ) : (
                    <span className="text-red-400 font-medium">Belum</span>
                  )}
                  {belanjaItem.reference_no && (
                    <div className="text-[10px] text-teal-300 font-mono mt-0.5" data-testid="tooltip-ref-belanja">
                      Bukti: {belanjaItem.reference_no}
                      {belanjaItem.notes && <span className="text-slate-300 block text-[9px] font-sans italic">"{belanjaItem.notes}"</span>}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium border-t border-slate-700 pt-0.5">Total: Rp {Number(monthData.bal_b || 0).toLocaleString('id-ID')}</div>
              </div>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span>Lebaran:</span>
              <div className="text-right">
                <div>
                  {isLebaranFrozen ? (
                    <span className="text-slate-300 font-medium">BEKU (Nonaktif Sementara)</span>
                  ) : isLebaranUnbilled ? (
                    <span className="text-slate-400">
                      {isLebaranCovered
                        ? 'Sudah tercakup dalam Saldo Awal'
                        : lebaranItem.status === 'unbilled'
                        ? 'Belum Terbit Tagihan'
                        : '-'}
                    </span>
                  ) : isLebaranPartial ? (
                    <span className="text-amber-400 font-medium">
                      Setoran Parsial: Rp {Number(lebaranItem.amount).toLocaleString('id-ID')} dari kewajiban Rp {Number(targetL).toLocaleString('id-ID')} (Kurang Rp {Number(targetL - Number(lebaranItem.amount)).toLocaleString('id-ID')})
                    </span>
                  ) : lebaranItem.status === 'paid' ? (
                    <span className="text-emerald-400">{formatCurrency(Number(lebaranItem.amount))}</span>
                  ) : (
                    <span className="text-red-400 font-medium">Belum</span>
                  )}
                  {lebaranItem.reference_no && (
                    <div className="text-[10px] text-emerald-300 font-mono mt-0.5" data-testid="tooltip-ref-lebaran">
                      Bukti: {lebaranItem.reference_no}
                      {lebaranItem.notes && <span className="text-slate-300 block text-[9px] font-sans italic">"{lebaranItem.notes}"</span>}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium border-t border-slate-700 pt-0.5">Total: Rp {Number(monthData.bal_l || 0).toLocaleString('id-ID')}</div>
              </div>
            </div>
          </div>

          {/* Akumulasi Terbayar s/d Bulan Ini & Ringkasan */}
          <div className="mt-2 pt-1.5 border-t border-slate-700/80 space-y-1" data-testid="tooltip-cumulative-summary">
            <div className="flex justify-between items-center text-[11px] text-slate-300">
              <span>Iuran Bulan Ini:</span>
              <span className="font-semibold text-white">Rp {monthlyDepositTotal.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-emerald-400">
              <span>Akumulasi s/d Bulan Ini:</span>
              <span className="font-bold">Rp {totalKumulatif.toLocaleString('id-ID')}</span>
            </div>
            {totalReferenceAmount > 0 && (
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Pencapaian Saldo:</span>
                <span className="font-semibold text-slate-200">{percentageOfTotal}%</span>
              </div>
            )}
          </div>

          {/* Arrow */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <span>SIMKOP</span> <span className="text-slate-300">/</span>
            <span>Simpan Pinjam</span> <span className="text-slate-300">/</span>
            <span className="text-slate-700 font-medium">Matriks Pembayaran</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Matriks Tracking Pembayaran Simpanan Tahunan</h1>
          <p className="text-slate-500 mt-1">Monitoring kepatuhan dan histori pembayaran simpanan seluruh anggota per bulan pada tahun berjalan.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Tingkat Kepatuhan (YTD)</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">{ytdCompliance}%</h3>
            </div>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${ytdCompliance}%` }}></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Setoran Terkumpul ({year})</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">Rp {totalSetoran.toLocaleString('id-ID')}</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-emerald-600 font-medium flex items-center mt-2">
            <span className="mr-1">Real-time update</span> dari database
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Anggota Menunggak Bulan Ini</p>
              <h3 className="text-2xl font-bold text-red-600 mt-1">{membersInArrears} Orang</h3>
            </div>
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <button className="text-xs text-red-600 hover:text-red-700 font-medium text-left mt-2 underline underline-offset-2">
            Lihat daftar anggota
          </button>
        </div>
      </div>

      {/* Control Toolbar */}
      <div className="bg-white rounded-t-xl border border-slate-200 p-4 flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <select 
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-slate-800"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr.toString()}>
                Tahun {yr}
              </option>
            ))}
          </select>

          <select 
            value={filterType}
            onChange={(e) => setFilterType(normalizeDepositFilterType(e.target.value))}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          >
            <option value="all">Semua Jenis Simpanan</option>
            <option value="wajib">Simpanan Wajib</option>
            <option value="belanja">Simpanan Belanja Bulanan</option>
            <option value="lebaran">Simpanan Hari Raya</option>
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari NRP / Nama Anggota..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                title="Bersihkan pencarian"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
            <input
              type="text"
              data-testid="traceback-code-input"
              placeholder="Kode Trace-Back (KW-... / CF-...)"
              value={activeTraceRef}
              onChange={(e) => setActiveTraceRef(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-indigo-50/40 border border-indigo-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800 placeholder:font-sans"
            />
            {activeTraceRef && (
              <button
                type="button"
                onClick={handleResetTraceBack}
                title="Reset filter kode trace-back"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          {/* Tombol Impor Matriks Hasil Audit */}
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            data-testid="import-matrix-btn"
            title="Impor matriks simpanan hasil audit Excel untuk sinkronisasi buku besar"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-xs transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Impor Matriks Hasil Audit</span>
          </button>

          {/* Tombol Dropdown Ekspor Matriks Periksa (.xlsx) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportDropdown((prev) => !prev)}
              disabled={isExporting}
              data-testid="export-matrix-dropdown-btn"
              title="Ekspor matriks periksa simpanan ke Excel dengan formula validasi selisih"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              )}
              <span>Ekspor Matriks Periksa (.xlsx)</span>
              <ChevronDown
                className={`w-4 h-4 text-slate-500 transition-transform ${
                  showExportDropdown ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showExportDropdown && (
              <div
                data-testid="export-matrix-menu"
                className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 animate-fade-in"
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  Pilih Jenis Simpanan
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleExportSavingsMatrix('WAJIB', setIsExporting, setShowExportDropdown, feedback)
                  }
                  data-testid="export-wajib-btn"
                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>Simpanan Wajib</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                    SW
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleExportSavingsMatrix('BELANJA', setIsExporting, setShowExportDropdown, feedback)
                  }
                  data-testid="export-belanja-btn"
                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>Simpanan Belanja Bulanan</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                    SB
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleExportSavingsMatrix('LEBARAN', setIsExporting, setShowExportDropdown, feedback)
                  }
                  data-testid="export-lebaran-btn"
                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>Simpanan Hari Raya (Lebaran)</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                    SL
                  </span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const mappedType: BulkCheckTargetType =
                filterType === 'wajib'
                  ? 'WAJIB'
                  : filterType === 'belanja'
                  ? 'BELANJA'
                  : filterType === 'lebaran'
                  ? 'LEBARAN'
                  : 'ALL';
              setBulkCheckTargetType(mappedType);
              setBulkCheckSummary(null);
              setShowCheckAllConfirmModal(true);
            }}
            disabled={isBulkChecking || bulkTargetRange.isFutureYear || bulkTargetRange.targetMonths.length === 0}
            title={
              bulkTargetRange.isFutureYear
                ? 'Tahun fiskal belum berjalan'
                : bulkTargetRange.rangeLabel
                ? `Centang lunas semua anggota periode ${bulkTargetRange.rangeLabel} (pasca cut-off Saldo Awal)`
                : 'Tidak ada bulan aktif untuk dicentang pada tahun ini'
            }
            data-testid="bulk-check-all-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckSquare className="w-4 h-4 text-emerald-600" />
            <span>Centang Semua s/d Bulan Ini</span>
          </button>
        </div>
      </div>

      {/* Panel Filter Trace-Back Kode Bukti */}
      {effectiveTraceCode && (
        <div
          data-testid="traceback-filter-panel"
          className="bg-indigo-50/70 border-x border-b border-indigo-200 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-600 text-white font-semibold">
                Kode Trace-Back: <code className="font-mono font-bold">{effectiveTraceCode}</code>
              </span>
              {traceResolvedReceipt &&
                traceResolvedReceipt.toUpperCase() !== effectiveTraceCode.toUpperCase() && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold">
                    Kwitansi: {traceResolvedReceipt}
                  </span>
                )}
              {activeTracePeriod && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-white text-indigo-800 border border-indigo-200 font-mono font-semibold">
                  Periode: {activeTracePeriod}
                </span>
              )}
              {traceMember && (
                <span className="font-semibold text-slate-800">
                  {traceMember.nama} — NRP <span className="font-mono">{traceMember.nrp}</span>
                </span>
              )}
            </div>
            <button
              type="button"
              data-testid="btn-reset-traceback-filter"
              onClick={handleResetTraceBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filter Trace-Back</span>
            </button>
          </div>

          {traceLoading ? (
            <div className="flex items-center gap-2 text-xs text-indigo-700 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Melacak rincian mutasi simpanan untuk kode bukti {effectiveTraceCode}...</span>
            </div>
          ) : traceRows.length > 0 ? (
            <div className="bg-white rounded-xl border border-indigo-200/80 overflow-x-auto shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Tanggal</th>
                    <th className="px-3 py-2 font-semibold">Jenis Simpanan</th>
                    <th className="px-3 py-2 font-semibold">Periode / Bulan</th>
                    <th className="px-3 py-2 font-semibold">No. Bukti</th>
                    <th className="px-3 py-2 font-semibold">Keterangan</th>
                    <th className="px-3 py-2 font-semibold text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {traceRows.map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                        {tr.createdAt ? tr.createdAt.slice(0, 10) : '-'}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {tr.depositTypeName}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                        {tr.periodLabel}
                      </td>
                      <td className="px-3 py-2 font-mono text-indigo-700 whitespace-nowrap">
                        {tr.referenceNo || effectiveTraceCode}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {tr.notes || tr.description}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                        {formatCurrency(tr.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-emerald-50/70 border-t border-emerald-200 font-bold text-slate-900">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-xs uppercase tracking-wider text-emerald-900">
                      TOTAL MUTASI TRACE-BACK ({traceRows.length} komponen)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 whitespace-nowrap">
                      {formatCurrency(traceRows.reduce((s, r) => s + r.amount, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Menampilkan anggota yang terhubung dengan kode bukti <code className="font-mono font-semibold">{effectiveTraceCode}</code>.
            </p>
          )}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white border-x border-slate-200 overflow-hidden relative w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse min-w-[1200px]">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="sticky left-0 bg-slate-50 z-10 py-3 px-4 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[260px] w-64 md:w-[280px] shrink-0">
                  Informasi Anggota
                </th>
                <th className="py-3 px-3 bg-slate-100/80 border-b border-r border-slate-200 text-center min-w-[165px] whitespace-nowrap font-semibold text-slate-700 text-xs">
                  <div>Saldo Awal</div>
                  <div className="text-[10px] font-normal text-slate-500">
                    {cutoffInfo
                      ? `(Per ${cutoffInfo.formattedDate})`
                      : rollingMonths.length > 0
                      ? `Per ${rollingMonths[0].label}`
                      : 'Cut-Off Saldo Awal'}
                  </div>
                </th>
                {visibleMonths.map((monthNum) => {
                  const idx = monthNum - 1;
                  const col = rollingMonths[idx] || {
                    year: selectedYear,
                    month: monthNum,
                    label: `${MONTHS[idx]}-${String(selectedYear).slice(-2)}`,
                    periodIndex: selectedYear * 12 + monthNum,
                  };
                  const isCurrentMonth = idx === rollingMonths.length - 1;
                  return (
                    <th
                      key={col.periodIndex}
                      className={`py-3 px-2 border-b border-slate-200 text-center min-w-[95px] md:min-w-[105px] ${
                        isCurrentMonth ? 'bg-emerald-50/50 border-x-2 border-x-emerald-200/50 text-emerald-900 font-bold' : ''
                      }`}
                    >
                      <div>{col.label}</div>
                    </th>
                  );
                })}
                <th className="sticky right-0 bg-slate-50 z-10 py-3 px-4 border-b border-l border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[160px] text-center">
                  Kepatuhan & Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleMonths.length + 3} className="text-center py-8 text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      <p>Memuat data matriks...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={visibleMonths.length + 3} className="text-center py-8 text-slate-500">
                    {search.trim() ? `Tidak ada data anggota yang cocok dengan pencarian "${search}".` : 'Tidak ada data anggota ditemukan.'}
                  </td>
                </tr>
              ) : paginatedData.map((row) => (
                <tr key={row.nrp} className="hover:bg-slate-50/50 transition-colors group/row">
                  <td className="sticky left-0 bg-white group-hover/row:bg-slate-50/90 z-10 py-3 px-4 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[260px] w-64 md:w-[280px] shrink-0">
                    <div className="flex flex-col">
                      <button
                        onClick={() => setSelectedMember({
                          id: row.member_id,
                          nrp: row.nrp,
                          nama: row.nama,
                          joinDate: row.tgl_awal_anggota || row.created_at
                        })}
                        className="font-semibold text-slate-800 hover:text-emerald-600 transition-colors text-left cursor-pointer"
                        title="Buka Buku Besar Matriks Simpanan"
                      >
                        {row.nama}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{row.nrp}</span>
                        {(row.membership_status || '').toUpperCase() === 'SUSPENDED' && (
                          <span
                            title={row.suspension_reason || 'Tagihan dibekukan sementara'}
                            className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 rounded-full"
                          >
                            Nonaktif Sementara
                          </span>
                        )}
                        {row.pokokLunas ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Pokok: Lunas
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMemberForPokok({
                                id: row.member_id,
                                nama: row.nama,
                                nrp: row.nrp,
                                status: (row as any).status,
                                membership_status: (row as any).membership_status
                              });
                              setIsPokokModalOpen(true);
                            }}
                            data-testid={`pay-pokok-btn-${row.nrp}`}
                            title="Klik untuk melunasi Simpanan Pokok"
                            className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800 border border-amber-300 hover:border-amber-400 px-2 py-0.5 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            Pokok: Belum
                            <span className="text-[9px] underline ml-0.5 font-semibold">Bayar</span>
                          </button>
                        )}
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1 text-[11px] font-mono select-none whitespace-nowrap" data-testid={`member-net-savings-${row.nrp}`}>
                        <div className="flex items-center justify-between px-2 py-0.5 rounded bg-emerald-50/70 border border-emerald-200/60 text-emerald-900">
                          <span className="text-[10px] font-semibold uppercase tracking-wider">Kas Riil</span>
                          <span className="font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                            Rp {Number(row.netSavings?.total || 0).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-1 text-slate-600">
                          <span className="text-slate-500">Pokok:</span>
                          <span className="font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                            Rp {Number(row.pokokBalance ?? row.priorSummary?.pokok ?? 0).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-1 text-slate-600">
                          <span className="text-slate-500">Wajib:</span>
                          <span className="font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                            Rp {Number(row.netSavings?.wajib || 0).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-1 text-slate-600">
                          <span className="text-slate-500">Belanja:</span>
                          <span className="font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                            Rp {Number(row.netSavings?.belanja || 0).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-1 text-slate-600">
                          <span className="text-slate-500">Lebaran:</span>
                          <span className="font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                            Rp {Number(row.netSavings?.lebaran || 0).toLocaleString('id-ID')}
                          </span>
                        </div>
                        {inRouter ? (
                          <Link
                            to={`/admin/rekening-koran-simpanan?memberId=${row.member_id}`}
                            title="Buka Rekening Koran Simpanan Tambahan"
                            className="mt-0.5 flex items-center justify-between px-1.5 py-0.5 rounded bg-indigo-50/70 hover:bg-indigo-100/80 border border-indigo-200/70 text-indigo-800 transition-colors"
                          >
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold">
                              <BookOpen className="w-3 h-3 text-indigo-600" />
                              Tambahan:
                            </span>
                            <span className="font-semibold text-indigo-900 tabular-nums whitespace-nowrap">
                              Rp {Number(row.additionalSavingsBalance || 0).toLocaleString('id-ID')}
                            </span>
                          </Link>
                        ) : (
                          <a
                            href={`/admin/rekening-koran-simpanan?memberId=${row.member_id}`}
                            title="Buka Rekening Koran Simpanan Tambahan"
                            className="mt-0.5 flex items-center justify-between px-1.5 py-0.5 rounded bg-indigo-50/70 hover:bg-indigo-100/80 border border-indigo-200/70 text-indigo-800 transition-colors"
                          >
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold">
                              <BookOpen className="w-3 h-3 text-indigo-600" />
                              Tambahan:
                            </span>
                            <span className="font-semibold text-indigo-900 tabular-nums whitespace-nowrap">
                              Rp {Number(row.additionalSavingsBalance || 0).toLocaleString('id-ID')}
                            </span>
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-3 py-3 bg-slate-50/70 border-b border-r border-slate-200 text-xs select-none min-w-[165px] whitespace-nowrap" data-testid={`prior-summary-${row.nrp}`}>
                    <div className="text-slate-600 whitespace-nowrap">P: Rp {Number(row.pokokBalance ?? row.priorSummary?.pokok ?? 0).toLocaleString('id-ID')}</div>
                    <div className="font-semibold text-slate-700 whitespace-nowrap">W: Rp {Number(row.priorSummary?.wajib || 0).toLocaleString('id-ID')}</div>
                    <div className="text-slate-500 whitespace-nowrap">B: Rp {Number(row.priorSummary?.belanja || 0).toLocaleString('id-ID')}</div>
                    <div className="text-slate-500 whitespace-nowrap">L: Rp {Number(row.priorSummary?.lebaran || 0).toLocaleString('id-ID')}</div>
                  </td>
                  
                  {visibleMonths.map((monthNum) => {
                    const idx = monthNum - 1;
                    const month = row.months[idx] ?? null;
                    const isCurrentMonth = idx === rollingMonths.length - 1;
                    return (
                      <td
                        key={monthNum}
                        className={`py-3 px-1 border-b border-slate-100 align-middle ${
                          isCurrentMonth ? 'bg-emerald-50/20 border-x-2 border-x-emerald-100/50' : ''
                        }`}
                      >
                        {renderCell(month, idx, row)}
                      </td>
                    );
                  })}

                  <td className="sticky right-0 bg-white group-hover/row:bg-slate-50/90 z-10 py-3 px-4 border-b border-l border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium text-slate-600">{row.compliance}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full ${row.compliance >= 90 ? 'bg-emerald-500' : row.compliance >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} 
                            style={{ width: `${row.compliance}%` }}
                          ></div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedMember({
                          id: row.member_id,
                          nrp: row.nrp,
                          nama: row.nama,
                          joinDate: row.tgl_awal_anggota || row.created_at
                        })}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="Buku Besar Matriks Simpanan"
                        aria-label={`Buku Besar ${row.nama}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer / Legend */}
      <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span className="text-slate-600">Lunas (Hijau / Teal)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
            <span className="text-slate-600">Parsial (Oranye / Amber)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
            <span className="text-slate-600">Belum Bayar / Tunggakan (Merah)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold font-mono">-</span>
            <span className="text-slate-600">Belum Terdaftar / Tidak Berlaku</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-500">
          <span>
            Menampilkan {totalFiltered === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
            {Math.min(currentPage * itemsPerPage, totalFiltered)} dari {totalFiltered} anggota
          </span>
          <select 
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="ml-2 bg-transparent border-none font-medium text-slate-700 outline-none cursor-pointer"
          >
            <option value={10}>10 / halaman</option>
            <option value={25}>25 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
          </select>

          <div className="flex items-center gap-1 ml-4">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="text-sm font-medium px-2 text-slate-700">
              {currentPage} / {totalPages || 1}
            </span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedMember && (
        <SavingsLedgerMatrixModal
          memberId={selectedMember.id}
          memberNrp={selectedMember.nrp}
          memberName={selectedMember.nama}
          joinDate={selectedMember.joinDate}
          initialRateTiers={rateTiers}
          initialCutoffDate={effectiveCutoffDate}
          onClose={() => setSelectedMember(null)}
          onSuccess={() => {
            fetchComplianceMatrixData(year, setLoading, setData, setTargets, setTotalSetoran, setRateTiers, setCutoffDate);
          }}
        />
      )}

      {/* Modal Dialog Konfirmasi & Progress Centang Semua s/d Bulan Ini Massal */}
      {showCheckAllConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          data-testid="bulk-check-all-modal"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckSquare className={`w-5 h-5 ${isBulkChecking ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Centang Semua Anggota s/d Bulan Ini
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tandai lunas seluruh iuran belum terbayar pasca cut-off Saldo Awal s/d bulan berjalan
                  </p>
                </div>
              </div>
              {!isBulkChecking && (
                <button
                  onClick={async () => {
                    if (bulkCheckSummary) {
                      await handleReloadAfterBulkCheck();
                    } else {
                      setShowCheckAllConfirmModal(false);
                      setBulkCheckSummary(null);
                    }
                  }}
                  data-testid="close-check-all-modal-btn"
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* State 1: In Progress */}
              {isBulkChecking && (
                <div className="space-y-4 py-2" data-testid="bulk-check-all-in-progress">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>
                        Memproses {bulkCheckProgress.current} dari {bulkCheckProgress.total || 0} anggota...
                      </span>
                    </span>
                    <span className="text-emerald-700 font-bold">
                      {bulkCheckProgress.total > 0
                        ? Math.round((bulkCheckProgress.current / bulkCheckProgress.total) * 100)
                        : 0}
                      %
                    </span>
                  </div>

                  {/* Progress Bar Track */}
                  <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${
                          bulkCheckProgress.total > 0
                            ? Math.min(100, Math.round((bulkCheckProgress.current / bulkCheckProgress.total) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs text-slate-600 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Anggota Sedang Diproses:</span>
                      <span className="font-semibold text-slate-800" data-testid="bulk-check-all-current-member">
                        {bulkCheckProgress.currentMemberName || 'Menginisialisasi antrean...'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* State 2: Completed Result */}
              {!isBulkChecking && bulkCheckSummary !== null && (
                <div className="py-2 text-center space-y-4" data-testid="bulk-check-all-result">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      Centang Massal Berhasil Diselesaikan!
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Seluruh iuran anggota aktif s/d bulan ini telah diperbarui.
                    </p>
                  </div>

                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto text-left">
                    <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                      <div className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">
                        Berhasil Diproses
                      </div>
                      <div className="text-lg font-black text-emerald-900">
                        {bulkCheckSummary.totalSuccess}
                      </div>
                      {typeof bulkCheckSummary.insertedCount === 'number' && (
                        <div className="text-[11px] text-emerald-700 mt-0.5">
                          {bulkCheckSummary.insertedCount} setoran baru
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                        Gagal
                      </div>
                      <div className={`text-lg font-black ${bulkCheckSummary.totalFailed > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {bulkCheckSummary.totalFailed}
                      </div>
                      {typeof bulkCheckSummary.totalAmount === 'number' && bulkCheckSummary.totalAmount > 0 && (
                        <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                          {formatCurrency(bulkCheckSummary.totalAmount)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* State 3: Confirmation / Initial Setup */}
              {!isBulkChecking && bulkCheckSummary === null && (
                <div className="space-y-4" data-testid="bulk-check-all-confirmation">
                  {/* Info Box */}
                  <div className="flex items-start gap-3 bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900">
                    <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-emerald-950">
                        Perhatian Sebelum Melakukan Centang Massal
                      </p>
                      <p className="text-emerald-800 leading-relaxed">
                        Tindakan ini akan mencatat setoran <b>lunas</b> hanya untuk sel bulan yang belum terbayar pada rentang{' '}
                        <b>{bulkTargetRange.rangeLabel || `Tahun ${selectedYear}`}</b> (tahun fiskal {selectedYear}) ke buku simpanan &amp; arus kas.{' '}
                        <b>Saldo Awal Cut-Off tidak akan diubah.</b>
                      </p>
                    </div>
                  </div>

                  {/* Preview Summary Card */}
                  <div
                    data-testid="bulk-check-preview"
                    className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs"
                  >
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Rentang Bulan
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {bulkTargetRange.rangeLabel || '-'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {bulkTargetRange.targetMonths.length} bulan
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Anggota Terdampak
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {bulkPlan.affectedMemberCount} orang
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Item Setoran Baru
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {bulkPlan.totalItems} item
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Total Nominal
                      </div>
                      <div className="font-bold text-emerald-700 mt-0.5 font-mono">
                        {formatCurrency(bulkPlan.totalAmount)}
                      </div>
                    </div>
                  </div>

                  {/* Type Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Pilih Jenis Simpanan yang Dicentang:
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        {
                          type: 'ALL',
                          label: 'Semua Jenis Simpanan',
                          desc: 'Simpanan Wajib, Belanja, dan Lebaran sekaligus',
                        },
                        {
                          type: 'WAJIB',
                          label: 'Simpanan Wajib Saja',
                          desc: 'Hanya centang lunas Simpanan Wajib (SW)',
                        },
                        {
                          type: 'BELANJA',
                          label: 'Simpanan Belanja Saja',
                          desc: 'Hanya centang lunas Simpanan Belanja Bulanan (SB)',
                        },
                        {
                          type: 'LEBARAN',
                          label: 'Simpanan Hari Raya Saja',
                          desc: 'Hanya centang lunas Simpanan Lebaran (SL)',
                        },
                      ].map((opt) => (
                        <label
                          key={opt.type}
                          className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                            bulkCheckTargetType === opt.type
                              ? 'bg-emerald-50/50 border-emerald-500 ring-1 ring-emerald-500'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="bulkCheckTargetType"
                            value={opt.type}
                            checked={bulkCheckTargetType === opt.type}
                            onChange={() => setBulkCheckTargetType(opt.type as any)}
                            className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <div className="font-semibold text-slate-900">{opt.label}</div>
                            <div className="text-[11px] text-slate-500">{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              {/* During Execution: Progress indicator text */}
              {isBulkChecking && (
                <p className="text-xs text-slate-400 italic">
                  Proses sedang berjalan, mohon tunggu...
                </p>
              )}

              {/* After Execution: Close and Refresh Button */}
              {!isBulkChecking && bulkCheckSummary !== null && (
                <button
                  onClick={handleReloadAfterBulkCheck}
                  data-testid="complete-check-all-modal-btn"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  Selesai & Muat Ulang Matriks
                </button>
              )}

              {/* Before Execution: Cancel & Start Buttons */}
              {!isBulkChecking && bulkCheckSummary === null && (
                <>
                  <button
                    onClick={() => setShowCheckAllConfirmModal(false)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      handleGlobalCheckAllUntilCurrentMonth({
                        plan: bulkPlan,
                        selectedYear,
                        targetMonths: bulkTargetRange.targetMonths,
                        rangeLabel: bulkTargetRange.rangeLabel,
                        setIsBulkChecking,
                        setBulkCheckProgress,
                        setBulkCheckSummary,
                        onComplete: async () => {
                          clearTierCache();
                          await fetchComplianceData(
                            year,
                            setLoading,
                            setData,
                            setTargets,
                            setTotalSetoran,
                            setRateTiers,
                            setCutoffDate
                          );
                        },
                        feedback,
                      });
                    }}
                    disabled={bulkPlan.totalItems === 0 || bulkTargetRange.isFutureYear}
                    data-testid="start-check-all-btn"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>Mulai Centang Semua</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Impor Matriks Hasil Audit */}
      <SavingsMatrixImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={(result) =>
          handleImportMatrixSuccess(
            year,
            setLoading,
            setData,
            setTargets,
            setTotalSetoran,
            setShowImportModal,
            feedback,
            result
          )
        }
        defaultType="WAJIB"
      />

      {/* Modal Pelunasan Simpanan Pokok Anggota */}
      <PelunasanPokokModal
        isOpen={isPokokModalOpen}
        member={selectedMemberForPokok}
        onClose={() => {
          setIsPokokModalOpen(false);
          setSelectedMemberForPokok(null);
        }}
        onSuccess={async () => {
          clearTierCache();
          await fetchComplianceData(year, setLoading, setData, setTargets, setTotalSetoran, setRateTiers);
        }}
      />
    </AdminLayout>
  );
}

function ComplianceMatrixWithRouter(props: ComplianceMatrixProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = (searchParams.get('search') || '').trim();
  const urlRef = (searchParams.get('ref') || '').trim();
  const urlType = (searchParams.get('type') || '').trim();
  const urlPeriod = (searchParams.get('period') || '').trim();

  const handleClearUrlParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('search');
    next.delete('ref');
    next.delete('type');
    next.delete('period');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <ComplianceMatrixContent
      {...props}
      urlSearch={urlSearch}
      urlRef={urlRef}
      urlType={urlType}
      urlPeriod={urlPeriod}
      onClearUrlParams={handleClearUrlParams}
    />
  );
}

export const ComplianceMatrix: React.FC<ComplianceMatrixProps> = (props) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <ComplianceMatrixWithRouter {...props} />;
  }
  return <ComplianceMatrixContent {...props} />;
};

export default ComplianceMatrix;

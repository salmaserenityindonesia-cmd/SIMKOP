/**
 * ComplianceMatrix.tsx
 * Halaman Matriks Kepatuhan Simpanan Anggota.
 * Menyediakan audit visual kepatuhan, ekspor Excel berformula, dan modal impor mutasi buku besar.
 */
import { useState, useEffect, useContext, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import FeedbackContext from '../../context/FeedbackContext';
import {
  Search,
  Download,
  Send,
  CheckCircle2,
  FileSpreadsheet,
  AlertTriangle,
  Eye,
  Loader2,
  Sparkles,
  X,
  ChevronDown,
  Upload,
  CheckSquare
} from 'lucide-react';
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
  BulkCheckProgress
} from '../../services/savingsMatrixService';
import {
  clearTierCache,
  getRateTiers,
  getApplicableRate,
  getApplicableTierRate,
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
  initialBulkCheckSummary?: { totalSuccess: number; totalFailed: number } | null;
  initialShowImportModal?: boolean;
  initialShowExportDropdown?: boolean;
  initialIsExporting?: boolean;
  initialCutoffDate?: string | null;
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

export const ComplianceMatrix: React.FC<ComplianceMatrixProps> = ({
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
}) => {
  const currentYearStr = new Date().getFullYear().toString();
  const [year, setYear] = useState<string>(initialYear ? initialYear.toString() : currentYearStr);
  const [availableYears, setAvailableYears] = useState<number[]>(
    initialAvailableYears && initialAvailableYears.length > 0
      ? initialAvailableYears
      : [new Date().getFullYear()]
  );
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
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
  const [bulkCheckSummary, setBulkCheckSummary] = useState<{ totalSuccess: number; totalFailed: number } | null>(
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

  const filteredData = data.filter(row => 
    row.nama.toLowerCase().includes(search.toLowerCase()) || 
    row.nrp.includes(search)
  );

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalFiltered = filteredData.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const ytdCompliance = data.length > 0 
    ? (data.reduce((acc, row) => acc + row.compliance, 0) / data.length).toFixed(1)
    : '100';

  const currentMonthColIdx = rollingMonths.length - 1;
  const membersInArrears = data.filter(row => {
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
    const applicableTariffW = getApplicableTierRate(rateTiers, 'WAJIB', yearNum, monthNum) || (targets.wajib || 210000);
    const applicableTariffB = getApplicableTierRate(rateTiers, 'BELANJA', yearNum, monthNum) || (targets.belanja || 25000);
    const applicableTariffL = getApplicableTierRate(rateTiers, 'LEBARAN', yearNum, monthNum) || (targets.lebaran || 50000);

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

    // Evaluasi fallback jika baris bulan belum memiliki sub-item eksplisit
    let fallbackStatusW: 'paid' | 'unpaid' | 'not_applicable' | 'partial' | 'unbilled' = 'unpaid';
    if (monthData.w >= targetW) fallbackStatusW = 'paid';
    else if (monthData.w > 0) fallbackStatusW = 'partial';
    else {
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
      status: (monthData.b > 0 ? (monthData.b < targetB ? 'partial' : 'paid') : 'unpaid') as 'paid' | 'unpaid' | 'not_applicable' | 'partial' | 'unbilled',
      amount: monthData.b > 0 ? monthData.b : targetB,
      targetAmount: targetB,
    };
    const lebaranItem = monthData.lebaran || {
      status: (monthData.l > 0 ? (monthData.l < targetL ? 'partial' : 'paid') : 'unpaid') as 'paid' | 'unpaid' | 'not_applicable' | 'partial' | 'unbilled',
      amount: monthData.l > 0 ? monthData.l : targetL,
      targetAmount: targetL,
    };

    const isWajibCovered = wajibItem.status === 'covered_by_opening';
    const isBelanjaCovered = belanjaItem.status === 'covered_by_opening';
    const isLebaranCovered = lebaranItem.status === 'covered_by_opening';

    const isWajibUnbilled = wajibItem.status === 'unbilled' || wajibItem.status === 'not_applicable' || isWajibCovered;
    const isBelanjaUnbilled = belanjaItem.status === 'unbilled' || belanjaItem.status === 'not_applicable' || isBelanjaCovered;
    const isLebaranUnbilled = lebaranItem.status === 'unbilled' || lebaranItem.status === 'not_applicable' || isLebaranCovered;
    const isMonthAllCovered = isWajibCovered && isBelanjaCovered && isLebaranCovered;

    const isWajibPartial = !isWajibUnbilled && (wajibItem.status === 'partial' || (Number(wajibItem.amount) > 0 && Number(wajibItem.amount) < targetW));
    const isBelanjaPartial = !isBelanjaUnbilled && (belanjaItem.status === 'partial' || (Number(belanjaItem.amount) > 0 && Number(belanjaItem.amount) < targetB));
    const isLebaranPartial = !isLebaranUnbilled && (lebaranItem.status === 'partial' || (Number(lebaranItem.amount) > 0 && Number(lebaranItem.amount) < targetL));

    return (
      <div 
        onClick={() => setSelectedMember({
          id: row.member_id,
          nrp: row.nrp,
          nama: row.nama,
          joinDate: row.tgl_awal_anggota || row.created_at
        })}
        className="relative group flex flex-col gap-0.5 py-1 px-1.5 text-[11px] leading-tight font-mono select-none rounded hover:bg-slate-100/80 cursor-pointer transition-colors"
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
            isWajibUnbilled
              ? 'text-slate-300 font-normal'
              : isWajibPartial
              ? 'text-amber-600 font-bold'
              : wajibItem.status === 'paid'
              ? 'text-emerald-600 font-semibold'
              : wajibItem.status === 'unpaid'
              ? 'text-rose-600 font-bold'
              : 'text-slate-400'
          }>
            {isWajibUnbilled
              ? '-'
              : Number(wajibItem.amount || targetW).toLocaleString('id-ID')}
          </span>
        </div>

        {/* Baris Simpanan Belanja */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500">belanja</span>
          <span className={
            isBelanjaUnbilled
              ? 'text-slate-300 font-normal'
              : isBelanjaPartial
              ? 'text-amber-600 font-bold'
              : belanjaItem.status === 'paid'
              ? 'text-teal-600 font-semibold'
              : belanjaItem.status === 'unpaid'
              ? 'text-rose-600 font-bold'
              : 'text-slate-400'
          }>
            {isBelanjaUnbilled
              ? '-'
              : Number(belanjaItem.amount || targetB).toLocaleString('id-ID')}
          </span>
        </div>

        {/* Baris Simpanan Lebaran */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500">lebaran</span>
          <span className={
            isLebaranUnbilled
              ? 'text-slate-300 font-normal'
              : isLebaranPartial
              ? 'text-amber-600 font-bold'
              : lebaranItem.status === 'paid'
              ? 'text-emerald-600 font-semibold'
              : lebaranItem.status === 'unpaid'
              ? 'text-rose-600 font-bold'
              : 'text-slate-400'
          }>
            {isLebaranUnbilled
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
                  {isWajibUnbilled ? (
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
                  {isBelanjaUnbilled ? (
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
                  {isLebaranUnbilled ? (
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
            onChange={(e) => setFilterType(e.target.value)}
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
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
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
              setBulkCheckSummary(null);
              setShowCheckAllConfirmModal(true);
            }}
            disabled={isBulkChecking}
            title="Centang lunas semua anggota dari tanggal bergabung sampai bulan ini"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <CheckSquare className="w-4 h-4 text-emerald-600" />
            <span>Centang Semua s/d Bulan Ini</span>
          </button>

          <button className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
            <Download className="w-4 h-4 mr-2" />
            Export Rekap Excel
          </button>
          <button className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            <Send className="w-4 h-4 mr-2" />
            Kirim Pengingat
          </button>
        </div>
      </div>

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
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{row.nrp}</span>
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
                    Tandai lunas seluruh iuran anggota aktif dari tanggal bergabung s/d sekarang
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
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                        Gagal
                      </div>
                      <div className={`text-lg font-black ${bulkCheckSummary.totalFailed > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {bulkCheckSummary.totalFailed}
                      </div>
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
                        Tindakan ini akan menandai <b>lunas</b> seluruh iuran bulanan dari tanggal awal bergabung masing-masing anggota aktif hingga bulan berjalan saat ini ({MONTHS[new Date().getMonth()]} {new Date().getFullYear()}).
                      </p>
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
                      handleBulkCheckAllUpToNow(
                        bulkCheckTargetType,
                        setIsBulkChecking,
                        setBulkCheckProgress,
                        setBulkCheckSummary,
                        async () => {
                          clearTierCache();
                          await fetchComplianceData(year, setLoading, setData, setTargets, setTotalSetoran, setRateTiers, setCutoffDate);
                        }
                      );
                    }}
                    data-testid="start-check-all-btn"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-xs"
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
};

export default ComplianceMatrix;

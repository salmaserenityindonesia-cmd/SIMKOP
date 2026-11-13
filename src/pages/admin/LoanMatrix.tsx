import React, { useState, useEffect, useMemo, useContext } from 'react';
import FeedbackContext from '../../context/FeedbackContext';
import {
  Search,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  CalendarDays,
  TrendingUp,
  Eye,
  CheckSquare,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import LoanLedgerModal from '../../components/members/LoanLedgerModal';
import {
  getLoanMatrix,
  getLoanMatrixAvailableYears,
  getCumulativePaidUpToMonth,
  bulkCheckAllLoansUpToCurrentMonth,
  parseLoanCutoffDateInfo,
  BulkLoanProgress,
  BulkLoanResult,
  LoanMatrixSummary,
  MonthLoanCell,
} from '../../services/loanMatrixService';
import { formatCurrency } from '../../utils/formatCurrency';
import * as ExcelJS from 'exceljs';
import AdminLayout from '../../components/layout/AdminLayout';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

export const formatAmount = (num?: number | null): string => {
  if (!num || num === 0) return '-';
  return Number(num).toLocaleString('id-ID');
};

export interface CellBadgeInfo {
  text: string;
  className: string;
  statusLabel: string;
}

export const getCellBadge = (cell: MonthLoanCell): CellBadgeInfo => {
  const normStatus = (cell?.status || '').toUpperCase();
  switch (normStatus) {
    case 'PAID':
    case 'FINISHED':
      return {
        text: formatAmount(cell.paidAmount || cell.targetAmount),
        className: 'text-emerald-700 bg-emerald-50 border border-emerald-200 font-semibold',
        statusLabel: 'Lunas',
      };
    case 'PARTIAL':
      return {
        text: formatAmount(cell.paidAmount),
        className: 'text-amber-700 bg-amber-50 border border-amber-200 font-semibold',
        statusLabel: 'Parsial',
      };
    case 'UNPAID':
      return {
        text: formatAmount(cell.targetAmount),
        className: 'text-rose-700 bg-rose-50 border border-rose-200 font-bold',
        statusLabel: 'Menunggak',
      };
    case 'PROJECTED':
    case 'PROJECTION':
      return {
        text: formatAmount(cell.targetAmount),
        className: 'text-slate-400 bg-slate-50 border border-dashed border-slate-200 font-normal',
        statusLabel: 'Proyeksi',
      };
    case 'NONE':
    case 'NOT_APPLICABLE':
    default:
      return {
        text: '-',
        className: 'text-slate-300 font-normal',
        statusLabel: 'Di Luar Masa Tenor',
      };
  }
};

export interface LoanMatrixProps {
  initialYear?: number;
  initialAvailableYears?: number[];
  initialData?: LoanMatrixSummary | null;
  initialSelectedLoan?: { loanId: string; nrp: string; nama: string } | null;
  initialCutoffDate?: string | null;
  onYearChange?: (year: number) => void;
}

export const loadAvailableYearsData = async (
  setAvailableYears: (years: number[]) => void,
  setYear: (updater: (prev: number) => number) => void
): Promise<number[]> => {
  try {
    const years = await getLoanMatrixAvailableYears();
    if (years.length > 0) {
      setAvailableYears(years);
      setYear(prev => (years.includes(prev) ? prev : years[0]));
    }
    return years;
  } catch (err) {
    console.error('Error fetching available years:', err);
    return [];
  }
};

export const fetchLoanMatrixData = async (
  targetYear: number,
  setLoading: (l: boolean) => void,
  setData: (d: LoanMatrixSummary | null) => void
): Promise<LoanMatrixSummary | null> => {
  setLoading(true);
  try {
    const result = await getLoanMatrix(targetYear);
    setData(result);
    return result;
  } catch (error) {
    console.error('Error fetching loan matrix', error);
    return null;
  } finally {
    setLoading(false);
  }
};

export const LoanMatrix: React.FC<LoanMatrixProps> = ({
  initialYear,
  initialAvailableYears,
  initialData,
  initialSelectedLoan,
  initialCutoffDate,
  onYearChange,
}) => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(initialYear ?? currentYear);
  const [availableYears, setAvailableYears] = useState<number[]>(initialAvailableYears ?? [currentYear]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'UNPAID'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [loading, setLoading] = useState(initialData !== undefined ? false : true);
  const [data, setData] = useState<LoanMatrixSummary | null>(initialData ?? null);
  const [selectedLoan, setSelectedLoan] = useState<{loanId: string, nrp: string, nama: string} | null>(initialSelectedLoan ?? null);
  const feedback = useContext(FeedbackContext);

  // Bulk Actions State: Centang Semua s/d Bulan Ini
  const [showCheckAllConfirmModal, setShowCheckAllConfirmModal] = useState(false);
  const [isBulkChecking, setIsBulkChecking] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkCheckProgress, setBulkCheckProgress] = useState<{ current: number; total: number; currentMemberName?: string }>({
    current: 0,
    total: 0,
  });
  const [bulkCheckSummary, setBulkCheckSummary] = useState<{ totalSuccess: number; totalFailed: number } | null>(null);

  const effectiveCutoffDate = initialCutoffDate ?? data?.cutoffDate ?? null;
  const cutoffInfo = useMemo(
    () => parseLoanCutoffDateInfo(effectiveCutoffDate),
    [effectiveCutoffDate]
  );
  const cutoffYear = data?.cutoffYear ?? cutoffInfo?.year ?? null;
  const cutoffMonth = data?.cutoffMonth ?? cutoffInfo?.month ?? null;
  const formattedCutoffDate =
    data?.formattedCutoffDate ??
    cutoffInfo?.formattedDate ??
    `Jan-${String(year).slice(-2)}`;

  const visibleMonths = useMemo(() => {
    const allMonths = MONTHS.map((label, idx) => ({ label, monthNum: idx + 1 }));
    if (cutoffYear !== null && cutoffMonth !== null) {
      if (year < cutoffYear) return [];
      if (year === cutoffYear) {
        return allMonths.filter(m => m.monthNum >= cutoffMonth);
      }
    }
    return allMonths;
  }, [year, cutoffYear, cutoffMonth]);

  const handleBulkCheckAll = async () => {
    setIsProcessingBulk(true);
    setIsBulkChecking(true);
    setBulkCheckSummary(null);
    try {
      const res = await bulkCheckAllLoansUpToCurrentMonth((progress) => {
        setBulkCheckProgress({
          current: progress.processed,
          total: progress.total,
          currentMemberName: progress.currentMemberName,
        });
      });

      const successCount = res.successCount ?? res.totalSuccess ?? 0;
      const failCount = res.failCount ?? res.totalFailed ?? 0;

      setBulkCheckSummary({
        totalSuccess: successCount,
        totalFailed: failCount,
      });

      if (failCount === 0) {
        if (feedback?.showToast) {
          feedback.showToast('Seluruh angsuran pinjaman s/d bulan ini berhasil dicentang lunas.', 'success');
        }
      } else {
        console.warn('Rincian pinjaman yang gagal dicentang massal:', res.errors);
        if (feedback?.showToast) {
          feedback.showToast(
            `Centang massal selesai: ${successCount} berhasil, ${failCount} gagal. Periksa konsol untuk rincian.`,
            'warning'
          );
        }
      }

      await fetchLoanMatrixData(year, setLoading, setData);
    } catch (err: any) {
      console.error('Error during bulk check all loans:', err);
      if (feedback?.showToast) {
        feedback.showToast(
          'Terjadi kesalahan saat memproses centang massal pinjaman: ' + (err?.message || 'Kesalahan sistem'),
          'error'
        );
      } else {
        alert('Terjadi kesalahan saat memproses centang massal pinjaman.');
      }
      setShowCheckAllConfirmModal(false);
    } finally {
      setIsProcessingBulk(false);
      setIsBulkChecking(false);
    }
  };

  useEffect(() => {
    if (initialData !== undefined) return;
    loadAvailableYearsData(setAvailableYears, setYear);
  }, []);

  const skipInitialFetch = React.useRef(initialData !== undefined);
  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    fetchLoanMatrixData(year, setLoading, setData);
  }, [year]);

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    onYearChange?.(newYear);
  };

  const filteredMembers = useMemo(() => {
    if (!data) return [];
    return data.members.filter(m => {
      const matchSearch = 
        m.nrp.toLowerCase().includes(search.toLowerCase()) || 
        m.nama.toLowerCase().includes(search.toLowerCase()) ||
        (m.loanNumber || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.loan_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.loanTypeName || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = 
        statusFilter === 'ALL' ? true :
        statusFilter === 'ACTIVE' ? m.isLoanActive :
        statusFilter === 'UNPAID' ? Object.values(m.months).some(mo => mo.status === 'UNPAID') : true;
      
      return matchSearch && matchStatus;
    });
  }, [data, search, statusFilter]);

  // Unique members count for accurate pagination display
  const uniqueMembersCount = useMemo(() => {
    const ids = new Set(filteredMembers.map(m => m.memberId || m.nrp));
    return ids.size;
  }, [filteredMembers]);

  // Reset page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const totalFiltered = filteredMembers.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const paginatedMembers = filteredMembers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExportExcel = async () => {
    if (!data) return;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Matriks Pinjaman ${year}`);

    worksheet.columns = [
      { header: 'NRP', key: 'nrp', width: 15 },
      { header: 'Nama', key: 'nama', width: 25 },
      { header: 'No. Pinjaman', key: 'loanNumber', width: 20 },
      { header: 'Jenis Pinjaman', key: 'loanType', width: 20 },
      { header: 'Tenor (Bulan)', key: 'tenor', width: 15 },
      { header: 'Status Pinjaman', key: 'status', width: 15 },
      ...visibleMonths.map(m => ({ header: m.label, key: `m${m.monthNum}`, width: 15 })),
      { header: 'Kepatuhan YTD (%)', key: 'compliance', width: 20 },
    ];

    filteredMembers.forEach(m => {
      const isMemberCompleted = !m.isLoanActive || (m as any).status === 'completed' || (m as any).status === 'paid_off';
      const memberCompliance = isMemberCompleted ? 100 : m.complianceYTD;
      const row: any = {
        nrp: m.anggota?.nrp || m.nrp,
        nama: m.anggota?.nama || m.nama,
        loanNumber: m.loan_number || m.loanNumber || '-',
        loanType: m.loan_types?.name || m.loanTypeName || 'Pinjaman',
        tenor: m.agreedTenorMonths || m.agreed_tenor_months || m.tenor || '-',
        status: !isMemberCompleted ? 'Aktif' : 'Selesai',
        compliance: memberCompliance.toFixed(1) + '%'
      };
      
      visibleMonths.forEach(vm => {
        row[`m${vm.monthNum}`] = m.months[vm.monthNum]?.status || 'NONE';
      });
      worksheet.addRow(row);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Matriks_Pinjaman_${year}.xlsx`;
    link.click();
  };

  return (
    <AdminLayout>
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Matriks Proyeksi & Kepatuhan Pinjaman</h1>
          <p className="text-slate-500 mt-1">SIMKOP / Simpan Pinjam / Matriks Pinjaman</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-sm">Kepatuhan YTD</h3>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {data?.complianceYTD.toFixed(1) ?? '0.0'}%
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-sm">Realisasi YTD</h3>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {formatCurrency(data?.totalCollectedYTD ?? 0)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <CalendarDays className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-sm">Proyeksi Bulan Depan</h3>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {formatCurrency(data?.projectedNextMonth ?? 0)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <XCircle className="w-5 h-5 text-rose-600" />
            <h3 className="font-semibold text-sm">Anggota Menunggak</h3>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {data?.unpaidMembersCount ?? 0}
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Cari NRP atau Nama..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select 
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Pinjaman Aktif</option>
              <option value="UNPAID">Ada Tunggakan</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setBulkCheckSummary(null);
              setShowCheckAllConfirmModal(true);
            }}
            disabled={isProcessingBulk || isBulkChecking}
            title="Centang lunas seluruh pinjaman anggota pasca saldo awal s/d bulan ini"
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg font-semibold text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            data-testid="bulk-check-all-btn"
          >
            {isProcessingBulk || isBulkChecking ? (
              <>
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                <span>Memproses centang massal...</span>
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <span>Centang Semua s/d Bulan Ini</span>
              </>
            )}
          </button>

          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg transition-colors shadow-xs"
            data-testid="export-excel-btn"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>

          <div className="h-6 w-px bg-slate-200 hidden sm:block mx-1" />

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Tahun:</span>
            <select 
              value={year}
              onChange={e => handleYearChange(Number(e.target.value))}
              className="border border-slate-300 rounded-lg py-2 px-3 font-semibold focus:ring-2 focus:ring-emerald-500"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Status Legend */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4 text-xs">
        <span className="font-semibold text-slate-700">Keterangan Status:</span>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 rounded text-emerald-700 bg-emerald-50 border border-emerald-200 font-mono font-semibold">100.000</span>
          <span className="text-slate-600">Lunas</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 rounded text-amber-700 bg-amber-50 border border-amber-200 font-mono font-semibold">50.000</span>
          <span className="text-slate-600">Parsial</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 rounded text-rose-700 bg-rose-50 border border-rose-200 font-mono font-bold">100.000</span>
          <span className="text-slate-600">Menunggak</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 rounded text-slate-400 bg-slate-50 border border-dashed border-slate-200 font-mono font-normal">100.000</span>
          <span className="text-slate-600">Proyeksi</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 rounded text-slate-300 font-mono font-normal">-</span>
          <span className="text-slate-600">Di Luar Masa Tenor</span>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-3 py-3 sticky left-0 bg-slate-50 z-30 min-w-[185px] max-w-[205px] w-[195px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Anggota</th>
                <th className="px-2.5 py-2.5 text-left font-bold text-slate-700 bg-slate-50 border-r border-slate-200 min-w-[145px] max-w-[160px] w-[150px]">
                  <div className="text-[11px] leading-tight">Saldo Awal Pinjaman</div>
                  <div className="text-[9px] font-medium text-amber-700 leading-tight mt-0.5">
                    Sah per {formattedCutoffDate}
                  </div>
                </th>
                {visibleMonths.map(m => (
                  <th key={m.monthNum} className="px-3 py-3 text-center min-w-[110px] border-l border-slate-200">{m.label}</th>
                ))}
                <th className="px-4 py-3 text-center border-l border-slate-200">Kepatuhan YTD</th>
                <th className="px-4 py-3 text-center sticky right-0 bg-slate-50 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] z-30">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleMonths.length === 12 ? 15 : visibleMonths.length + 4} className="text-center py-8 text-slate-500">Memuat data matriks...</td>
                </tr>
              ) : paginatedMembers.length === 0 ? (
                <tr>
                  <td colSpan={visibleMonths.length === 12 ? 15 : visibleMonths.length + 4} className="text-center py-8 text-slate-500">Tidak ada data untuk tahun {year}</td>
                </tr>
              ) : (
                paginatedMembers.map(row => {
                  const rowKey = row.id || row.loanId || `${row.memberId}-${row.loanNumber || row.loan_number || ''}`;
                  const targetLoanId = row.loanId || row.id || Object.values(row.months).find(m => m.loanId)?.loanId;
                  const tenorDisplay = row.agreedTenorMonths || row.agreed_tenor_months || row.tenor || 0;
                  const isLoanCompleted = !row.isLoanActive || (row as any).status === 'completed' || (row as any).status === 'paid_off';
                  const rowCompliance = isLoanCompleted ? 100 : row.complianceYTD;

                  return (
                    <tr key={rowKey} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 min-w-[185px] max-w-[205px] w-[195px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="font-semibold text-slate-800 truncate" title={row.anggota?.nama || row.nama}>
                          {row.anggota?.nama || row.nama}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                          <span>NRP: {row.anggota?.nrp || row.nrp}</span>
                          <span>•</span>
                          <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-1.5 py-0.2 rounded">
                            ({tenorDisplay} Bln)
                          </span>
                          {!isLoanCompleted ? (
                            <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium">Aktif</span>
                          ) : (
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full text-[10px] font-medium">Selesai</span>
                          )}
                        </div>
                        {(row.loan_number || row.loanNumber) && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate" title={row.loan_number || row.loanNumber}>
                            {row.loan_number || row.loanNumber}
                          </div>
                        )}
                      </td>
                      
                      <td className="px-2.5 py-2.5 border-r border-slate-200 bg-slate-50/40 min-w-[145px] max-w-[160px] w-[150px] text-[11px] tabular-nums whitespace-nowrap select-none font-mono" data-testid={`prior-summary-${row.memberId}`}>
                        <div className="space-y-0.5">
                          <div className="text-slate-500 flex items-center justify-between gap-1 whitespace-nowrap">
                            <span className="font-sans text-[10px] text-slate-400">P:</span>
                            <span className="font-semibold text-slate-700 whitespace-nowrap tabular-nums">
                              Rp {Number(row.principalAmount ?? (row as any).principal_amount ?? 0).toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="text-emerald-700 flex items-center justify-between gap-1 whitespace-nowrap">
                            <span className="font-sans text-[10px] text-emerald-600">Terbayar:</span>
                            <span className="font-bold text-emerald-700 whitespace-nowrap tabular-nums">
                              Rp {Number(row.openingPaid ?? row.priorYearPaid ?? 0).toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="text-amber-700 flex items-center justify-between gap-1 border-t border-slate-200 pt-0.5 whitespace-nowrap">
                            <span className="font-sans text-[10px] text-amber-600">Sisa:</span>
                            <span className="font-semibold text-amber-800 whitespace-nowrap tabular-nums">
                              Rp {Number(row.openingRemaining ?? row.priorYearRemaining ?? 0).toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      </td>
                      
                      {visibleMonths.map(({ monthNum: m }) => {
                        const cell = row.months[m];
                        return (
                          <td key={m} className="px-2 py-2 border-l border-slate-100 text-center">
                            {(() => {
                              const badge = getCellBadge(cell);
                              const normStatus = (cell?.status || '').toUpperCase();
                              if (normStatus === 'NONE' || normStatus === 'NOT_APPLICABLE' || !cell) {
                                return (
                                  <div className="w-full py-1.5 text-center text-slate-300 font-normal select-none">
                                    -
                                  </div>
                                );
                              }
                              return (
                                <div className="relative group cursor-help">
                                  <div className={`px-2 py-1.5 rounded-lg text-xs font-mono text-center select-none transition-all ${badge.className}`}>
                                    {badge.text}
                                  </div>
                                  {/* Rich Tooltip */}
                                  <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl z-50 transition-all pointer-events-none">
                                    <div className="font-semibold mb-1 border-b border-slate-600 pb-1">
                                      No: {cell.loanNumber || '-'}
                                    </div>
                                    <div className="flex justify-between mt-1">
                                      <span className="text-slate-300">Status:</span>
                                      <span className="font-medium">{badge.statusLabel}</span>
                                    </div>
                                    <div className="flex justify-between mt-1">
                                      <span className="text-slate-300">Tenor:</span>
                                      <span>{cell.periodNumber ? `${cell.periodNumber} / ${cell.tenor}` : '-'}</span>
                                    </div>
                                    {cell.dueDate && (
                                      <div className="flex justify-between mt-1 text-slate-300">
                                        <span>Jatuh Tempo:</span>
                                        <span>{cell.dueDate}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between mt-1">
                                      <span className="text-slate-300">Target:</span>
                                      <span>Rp {formatAmount(cell.targetAmount)}</span>
                                    </div>
                                    {(() => {
                                      const cumulativePaid = cell.cumulativePaidAmount !== undefined
                                        ? cell.cumulativePaidAmount
                                        : getCumulativePaidUpToMonth(row, m, year);
                                      return (
                                        <div className="flex justify-between mt-1 text-emerald-400">
                                          <span>Terbayar:</span>
                                          <span>Rp {formatAmount(cumulativePaid)}</span>
                                        </div>
                                      );
                                    })()}
                                    {(() => {
                                      const remainingInstallment = isLoanCompleted 
                                        ? 0 
                                        : Math.max(0, Number(cell?.remainingBalance !== undefined ? cell.remainingBalance : (Number(cell?.targetAmount || 0) - Number(cell?.paidAmount || 0))));

                                      if (isLoanCompleted || remainingInstallment === 0) {
                                        return (
                                          <div className="flex justify-between mt-1 pt-1 border-t border-slate-600 text-emerald-400">
                                            <span>Sisa Angsuran:</span>
                                            <span>Rp 0 (Lunas)</span>
                                          </div>
                                        );
                                      }

                                      return (
                                        <div className="flex justify-between mt-1 pt-1 border-t border-slate-600 text-amber-400">
                                          <span>Sisa Angsuran:</span>
                                          <span>Rp {formatAmount(remainingInstallment)}</span>
                                        </div>
                                      );
                                    })()}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-800"></div>
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                        );
                      })}

                      <td className="px-4 py-3 border-l border-slate-100 bg-white group-hover:bg-slate-50 text-center">
                        <div className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${
                          rowCompliance >= 100 ? 'bg-emerald-100 text-emerald-700' :
                          rowCompliance >= 50 ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {rowCompliance.toFixed(0)}%
                        </div>
                      </td>
                      <td className="px-4 py-3 sticky right-0 bg-white group-hover:bg-slate-50 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] text-center">
                        {targetLoanId ? (
                          <button 
                            onClick={() => setSelectedLoan({ loanId: targetLoanId, nrp: row.anggota?.nrp || row.nrp, nama: row.anggota?.nama || row.nama })}
                            className="inline-flex p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Lihat Buku Bantu Angsuran"
                            data-testid={`view-ledger-${targetLoanId}`}
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm mt-4">
        <div className="flex items-center gap-2 text-slate-500">
          <span>
            Menampilkan {totalFiltered === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
            {Math.min(currentPage * itemsPerPage, totalFiltered)} dari {totalFiltered} pinjaman ({uniqueMembersCount} anggota)
          </span>
          <select 
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="ml-2 bg-transparent border-none font-medium text-slate-700 outline-none cursor-pointer focus:ring-0"
          >
            <option value={10}>10 / halaman</option>
            <option value={25}>25 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
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

      {selectedLoan && (
        <LoanLedgerModal
          loanId={selectedLoan.loanId}
          memberNrp={selectedLoan.nrp}
          memberName={selectedLoan.nama}
          onClose={() => setSelectedLoan(null)}
          onSuccess={() => fetchLoanMatrixData(year, setLoading, setData)}
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
                  <CheckSquare className={`w-5 h-5 ${isBulkChecking || isProcessingBulk ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Centang Semua Pinjaman s/d Bulan Ini
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tandai lunas seluruh jadwal angsuran pinjaman anggota dari awal tenor s/d sekarang
                  </p>
                </div>
              </div>
              {!(isBulkChecking || isProcessingBulk) && (
                <button
                  onClick={() => {
                    setShowCheckAllConfirmModal(false);
                    setBulkCheckSummary(null);
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
              {(isBulkChecking || isProcessingBulk) && (
                <div className="space-y-4 py-2" data-testid="bulk-check-all-in-progress">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>
                        Memproses {bulkCheckProgress.current} dari {bulkCheckProgress.total || 0} pinjaman...
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
                      <span className="text-slate-500">Pinjaman Sedang Diproses:</span>
                      <span className="font-semibold text-slate-800" data-testid="bulk-check-all-current-member">
                        {bulkCheckProgress.currentMemberName || 'Menginisialisasi antrean...'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 italic text-center pt-1">
                      Mohon tidak menutup jendela atau merefresh halaman saat pemrosesan sedang berlangsung.
                    </p>
                  </div>
                </div>
              )}

              {/* State 2: Completed Result */}
              {!(isBulkChecking || isProcessingBulk) && bulkCheckSummary !== null && (
                <div className="py-2 text-center space-y-4" data-testid="bulk-check-all-result">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      Centang Massal Berhasil Diselesaikan!
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Seluruh jadwal angsuran pinjaman s/d bulan ini berhasil ditandai lunas.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto text-left">
                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
                      <div className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wider">
                        Berhasil
                      </div>
                      <div className="text-xl font-bold text-emerald-700 mt-0.5">
                        {bulkCheckSummary.totalSuccess}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-center">
                      <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                        Gagal
                      </div>
                      <div className="text-xl font-bold text-slate-700 mt-0.5">
                        {bulkCheckSummary.totalFailed}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={async () => {
                        setShowCheckAllConfirmModal(false);
                        setBulkCheckSummary(null);
                        await fetchLoanMatrixData(year, setLoading, setData);
                      }}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
                      data-testid="finish-check-all-btn"
                    >
                      Tutup &amp; Muat Ulang
                    </button>
                  </div>
                </div>
              )}

              {/* State 3: Confirmation Dialog */}
              {!(isBulkChecking || isProcessingBulk) && bulkCheckSummary === null && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-2">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Konfirmasi Tindakan Massal</span>
                    </div>
                    <p className="leading-relaxed">
                      Aksi ini akan mencentang lunas jadwal angsuran pinjaman untuk <strong>seluruh anggota</strong> dari awal tenor pinjaman hingga bulan berjalan saat ini. Riwayat pelunasan otomatis akan dicatat untuk audit trail.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowCheckAllConfirmModal(false)}
                      className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkCheckAll}
                      disabled={isProcessingBulk || isBulkChecking}
                      className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                      data-testid="confirm-check-all-btn"
                    >
                      {isProcessingBulk || isBulkChecking ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Memproses centang massal...</span>
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-4 h-4" />
                          <span>Ya, Lanjutkan Centang Semua</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </AdminLayout>
  );
};

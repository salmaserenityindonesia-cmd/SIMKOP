import { useState, useEffect, useContext } from 'react';
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
  RefreshCw,
  AlertCircle,
  Loader2,
  Sparkles,
  Layers,
  X
} from 'lucide-react';
import {
  getComplianceMatrixData,
  ComplianceMatrixRow,
  ComplianceMonthData,
  getSavingsComplianceAvailableYears
} from '../../services/complianceService';
import MemberLedgerModal from '../../components/members/MemberLedgerModal';
import SavingsLedgerMatrixModal from '../../components/compliance/SavingsLedgerMatrixModal';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  bulkAutoReconcileAllMembers,
  BulkReconcileProgress,
  BulkReconcileResult
} from '../../services/savingsMatrixService';
import { clearTierCache } from '../../services/savingsRateService';

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
  initialShowConfirmBulkModal?: boolean;
  initialBulkReconciling?: boolean;
  initialBulkTargetType?: 'WAJIB' | 'BELANJA' | 'LEBARAN' | 'ALL';
  initialBulkProgress?: { processed: number; total: number; currentMemberName?: string };
  initialBulkResult?: { totalSuccess: number; totalFailed: number } | null;
}

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

export const handleBulkAutoReconcile = async (
  targetType: 'WAJIB' | 'BELANJA' | 'LEBARAN' | 'ALL',
  setIsBulkReconciling: (loading: boolean) => void,
  setBulkProgress: (prog: { processed: number; total: number; currentMemberName?: string }) => void,
  setBulkResult: (res: { totalSuccess: number; totalFailed: number } | null) => void,
  onComplete?: () => void
): Promise<BulkReconcileResult | null> => {
  setIsBulkReconciling(true);
  setBulkProgress({ processed: 0, total: 0 });
  setBulkResult(null);
  try {
    const res = await bulkAutoReconcileAllMembers(targetType, (p) => {
      setBulkProgress(p);
    });
    setBulkResult({
      totalSuccess: res.totalSuccess,
      totalFailed: res.totalFailed,
    });
    if (onComplete) onComplete();
    return res;
  } catch (err) {
    console.error('Bulk auto-reconcile error:', err);
    setBulkResult({ totalSuccess: 0, totalFailed: 1 });
    return null;
  } finally {
    setIsBulkReconciling(false);
  }
};

export const fetchComplianceMatrixData = async (
  targetYear: number | string,
  setLoading: (l: boolean) => void,
  setData: (d: ComplianceMatrixRow[]) => void,
  setTargets: (t: any) => void,
  setTotalSetoran: (s: number) => void
): Promise<{ rows: ComplianceMatrixRow[]; targets?: any; totalSetoran: number } | null> => {
  setLoading(true);
  try {
    const yearNum = typeof targetYear === 'string' ? parseInt(targetYear, 10) : targetYear;
    const matrixData = await getComplianceMatrixData(yearNum);
    setData(matrixData.rows || []);
    if (matrixData.targets) {
      setTargets(matrixData.targets);
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
    return { rows: matrixData.rows || [], targets: matrixData.targets, totalSetoran: sum };
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
  initialShowConfirmBulkModal,
  initialBulkReconciling,
  initialBulkTargetType,
  initialBulkProgress,
  initialBulkResult,
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
  const [targets, setTargets] = useState({ wajib: 25000, belanja: 50000, lebaran: 50000 });
  const [loading, setLoading] = useState(initialData === undefined);
  const [selectedMember, setSelectedMember] = useState<{
    id: string;
    nrp: string;
    nama: string;
    joinDate?: string | null;
  } | null>(initialSelectedMember || null);
  const [totalSetoran, setTotalSetoran] = useState(0);

  const [showConfirmBulkModal, setShowConfirmBulkModal] = useState(initialShowConfirmBulkModal || false);
  const [isBulkReconciling, setIsBulkReconciling] = useState(initialBulkReconciling || false);
  const [bulkTargetType, setBulkTargetType] = useState<'WAJIB' | 'BELANJA' | 'LEBARAN' | 'ALL'>(
    initialBulkTargetType || 'ALL'
  );
  const [bulkProgress, setBulkProgress] = useState<{ processed: number; total: number; currentMemberName?: string }>(
    initialBulkProgress || { processed: 0, total: 0 }
  );
  const [bulkResult, setBulkResult] = useState<{ totalSuccess: number; totalFailed: number } | null>(
    initialBulkResult || null
  );

  const feedback = useContext(FeedbackContext);

  const handleReloadAfterBulk = async () => {
    clearTierCache();
    await fetchComplianceData(year, setLoading, setData, setTargets, setTotalSetoran);
    setShowConfirmBulkModal(false);
    setBulkResult(null);
    if (feedback?.showToast) {
      feedback.showToast('Data matriks berhasil disinkronisasi', 'success');
    }
  };

  useEffect(() => {
    loadComplianceAvailableYearsData(setAvailableYears, setYear);
  }, []);

  useEffect(() => {
    fetchComplianceMatrixData(year, setLoading, setData, setTargets, setTotalSetoran);
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

  const membersInArrears = data.filter(row => {
    const currentMonthData = row.months[CURRENT_MONTH];
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

    const wajibItem = monthData.wajib || {
      status: (monthData.w > 0 ? 'paid' : 'unpaid') as 'paid' | 'unpaid' | 'not_applicable',
      amount: monthData.w > 0 ? monthData.w : (targets.wajib || 200000),
    };
    const belanjaItem = monthData.belanja || {
      status: (monthData.b > 0 ? 'paid' : 'unpaid') as 'paid' | 'unpaid' | 'not_applicable',
      amount: monthData.b > 0 ? monthData.b : (targets.belanja || 50000),
    };
    const lebaranItem = monthData.lebaran || {
      status: (monthData.l > 0 ? 'paid' : 'unpaid') as 'paid' | 'unpaid' | 'not_applicable',
      amount: monthData.l > 0 ? monthData.l : (targets.lebaran || 50000),
    };

    return (
      <div 
        onClick={() => setSelectedMember({
          id: row.member_id,
          nrp: row.nrp,
          nama: row.nama,
          joinDate: row.tgl_awal_anggota || row.created_at
        })}
        className="relative group flex flex-col gap-0.5 py-1 px-1.5 text-[11px] leading-tight font-mono select-none rounded hover:bg-slate-100/80 cursor-pointer transition-colors"
        title={`Klik untuk rincian buku besar ${row.nama} - ${MONTHS[monthIndex]} ${year}`}
      >
        {/* Baris Simpanan Wajib */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500">wajib</span>
          <span className={
            wajibItem.status === 'paid'
              ? 'text-emerald-600 font-semibold'
              : wajibItem.status === 'unpaid'
              ? 'text-rose-600 font-bold'
              : 'text-slate-400'
          }>
            {wajibItem.status === 'not_applicable'
              ? '-'
              : Number(wajibItem.amount).toLocaleString('id-ID')}
          </span>
        </div>

        {/* Baris Simpanan Belanja */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500">belanja</span>
          <span className={
            belanjaItem.status === 'paid'
              ? 'text-teal-600 font-semibold'
              : belanjaItem.status === 'unpaid'
              ? 'text-rose-600 font-bold'
              : 'text-slate-400'
          }>
            {belanjaItem.status === 'not_applicable'
              ? '-'
              : Number(belanjaItem.amount).toLocaleString('id-ID')}
          </span>
        </div>

        {/* Baris Simpanan Lebaran */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-500">lebaran</span>
          <span className={
            lebaranItem.status === 'paid'
              ? 'text-emerald-600 font-semibold'
              : lebaranItem.status === 'unpaid'
              ? 'text-rose-600 font-bold'
              : 'text-slate-400'
          }>
            {lebaranItem.status === 'not_applicable'
              ? '-'
              : Number(lebaranItem.amount).toLocaleString('id-ID')}
          </span>
        </div>

        {/* Tooltip Hover Detail */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-3 pointer-events-none">
          <div className="font-semibold mb-2 text-slate-200 border-b border-slate-600 pb-1">{MONTHS[monthIndex]} {year}</div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center gap-2 border-b border-slate-700/50 pb-1.5 mb-1.5">
              <span>Wajib:</span>
              <div className="text-right">
                <div>{wajibItem.status === 'paid' ? <span className="text-emerald-400">{formatCurrency(Number(wajibItem.amount))}</span> : <span className="text-red-400 font-medium">Belum</span>}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium border-t border-slate-700 pt-0.5">Total: Rp {Number(monthData.bal_w || 0).toLocaleString('id-ID')}</div>
              </div>
            </div>
            <div className="flex justify-between items-center gap-2 border-b border-slate-700/50 pb-1.5 mb-1.5">
              <span>Belanja:</span>
              <div className="text-right">
                <div>{belanjaItem.status === 'paid' ? <span className="text-teal-400">{formatCurrency(Number(belanjaItem.amount))}</span> : <span className="text-red-400 font-medium">Belum</span>}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium border-t border-slate-700 pt-0.5">Total: Rp {Number(monthData.bal_b || 0).toLocaleString('id-ID')}</div>
              </div>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span>Lebaran:</span>
              <div className="text-right">
                <div>{lebaranItem.status === 'paid' ? <span className="text-emerald-400">{formatCurrency(Number(lebaranItem.amount))}</span> : <span className="text-red-400 font-medium">Belum</span>}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium border-t border-slate-700 pt-0.5">Total: Rp {Number(monthData.bal_l || 0).toLocaleString('id-ID')}</div>
              </div>
            </div>
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
          <button
            onClick={() => {
              setBulkResult(null);
              setShowConfirmBulkModal(true);
            }}
            disabled={isBulkReconciling}
            title="Cocokkan otomatis saldo simpanan seluruh anggota ke buku besar bulanan"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isBulkReconciling ? 'animate-spin' : ''}`} />
            <span>Cocokkan Otomatis Semua Anggota</span>
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
                <th className="sticky left-0 bg-slate-50 z-10 py-3 px-4 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[280px]">
                  Informasi Anggota
                </th>
                {MONTHS.map((month, idx) => (
                  <th key={month} className={`py-3 px-2 border-b border-slate-200 text-center min-w-[95px] md:min-w-[105px] ${idx === CURRENT_MONTH ? 'bg-emerald-50/50 border-x-2 border-x-emerald-200/50' : ''}`}>
                    {month}
                  </th>
                ))}
                <th className="sticky right-0 bg-slate-50 z-10 py-3 px-4 border-b border-l border-slate-200 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] w-[160px] text-center">
                  Kepatuhan & Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      <p>Memuat data matriks...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-slate-500">
                    {search.trim() ? `Tidak ada data anggota yang cocok dengan pencarian "${search}".` : 'Tidak ada data anggota ditemukan.'}
                  </td>
                </tr>
              ) : paginatedData.map((row) => (
                <tr key={row.nrp} className="hover:bg-slate-50/50 transition-colors group/row">
                  <td className="sticky left-0 bg-white group-hover/row:bg-slate-50/90 z-10 py-3 px-4 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
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
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium border border-emerald-200">Pokok: Lunas</span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium border border-amber-200">Pokok: Belum</span>
                        )}
                      </div>
                    </div>
                  </td>
                  
                  {row.months.map((month, idx) => (
                    <td key={idx} className={`py-3 px-1 border-b border-slate-100 align-middle ${idx === CURRENT_MONTH ? 'bg-emerald-50/20 border-x-2 border-x-emerald-100/50' : ''}`}>
                      {renderCell(month, idx, row)}
                    </td>
                  ))}

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
          onClose={() => setSelectedMember(null)}
          onSuccess={() => {
            fetchComplianceMatrixData(year, setLoading, setData, setTargets, setTotalSetoran);
          }}
        />
      )}

      {/* Modal Dialog Konfirmasi & Progress Pencocokan Otomatis Massal */}
      {showConfirmBulkModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          data-testid="bulk-reconcile-modal"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <RefreshCw className={`w-5 h-5 ${isBulkReconciling ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Cocokkan Otomatis Simpanan Seluruh Anggota
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sinkronisasi saldo simpanan riil ke buku besar bulanan
                  </p>
                </div>
              </div>
              {!isBulkReconciling && (
                <button
                  onClick={async () => {
                    if (bulkResult) {
                      await handleReloadAfterBulk();
                    } else {
                      setShowConfirmBulkModal(false);
                      setBulkResult(null);
                    }
                  }}
                  data-testid="close-bulk-modal-btn"
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* State 1: In Progress */}
              {isBulkReconciling && (
                <div className="space-y-4 py-2" data-testid="bulk-reconcile-in-progress">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>
                        Memproses {bulkProgress.processed} dari {bulkProgress.total || 0} anggota...
                      </span>
                    </span>
                    <span className="text-emerald-700 font-bold">
                      {bulkProgress.total > 0
                        ? Math.round((bulkProgress.processed / bulkProgress.total) * 100)
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
                          bulkProgress.total > 0
                            ? Math.min(100, Math.round((bulkProgress.processed / bulkProgress.total) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs text-slate-600 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Anggota Sedang Diproses:</span>
                      <span className="font-semibold text-slate-800" data-testid="bulk-current-member">
                        {bulkProgress.currentMemberName || 'Menginisialisasi antrean...'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 italic text-center pt-1">
                      Mohon tidak menutup jendela atau merefresh halaman saat pencocokan sedang berlangsung.
                    </p>
                  </div>
                </div>
              )}

              {/* State 2: Completed Result */}
              {!isBulkReconciling && bulkResult !== null && (
                <div className="py-2 text-center space-y-4" data-testid="bulk-reconcile-result">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      Rekonsiliasi Selesai!
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Saldo simpanan seluruh anggota telah berhasil dipetakan ke buku besar bulanan.
                    </p>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-xs space-y-1.5 text-left">
                    <div className="flex justify-between items-center text-emerald-900 font-semibold">
                      <span>Anggota Berhasil Direkonsiliasi:</span>
                      <span className="text-emerald-700 font-bold" data-testid="result-success-count">
                        {bulkResult.totalSuccess} anggota
                      </span>
                    </div>
                    {bulkResult.totalFailed > 0 && (
                      <div className="flex justify-between items-center text-red-700 font-semibold">
                        <span>Anggota Gagal:</span>
                        <span className="text-red-600 font-bold" data-testid="result-failed-count">
                          {bulkResult.totalFailed} anggota
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* State 3: Confirmation / Initial Setup */}
              {!isBulkReconciling && bulkResult === null && (
                <div className="space-y-4" data-testid="bulk-reconcile-confirmation">
                  {/* Info Box */}
                  <div className="flex items-start gap-3 bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900">
                    <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-blue-950">
                        Algoritma Rekonsiliasi Otomatis FIFO
                      </p>
                      <p className="text-blue-800 leading-relaxed">
                        Sistem akan memetakan total saldo simpanan riil/migrasi seluruh anggota aktif ke kotak-kotak bulan buku besar sesuai tarif berjenjang yang berlaku secara FIFO. Mutasi awal migrasi tetap aman dan tidak akan terhapus.
                      </p>
                    </div>
                  </div>

                  {/* Target Type Selector */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Pilih Jenis Simpanan:
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { id: 'ALL', label: 'Semua Jenis Simpanan', desc: 'Simpanan Wajib, Belanja Bulanan, dan Hari Raya' },
                        { id: 'WAJIB', label: 'Simpanan Wajib', desc: 'Hanya mencocokkan simpanan wajib' },
                        { id: 'BELANJA', label: 'Simpanan Belanja Bulanan', desc: 'Hanya mencocokkan simpanan belanja bulanan' },
                        { id: 'LEBARAN', label: 'Simpanan Hari Raya/Lebaran', desc: 'Hanya mencocokkan simpanan hari raya' },
                      ].map((opt) => (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                            bulkTargetType === opt.id
                              ? 'border-emerald-500 bg-emerald-50/60 text-emerald-950 font-medium'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name="bulkTargetType"
                            value={opt.id}
                            checked={bulkTargetType === opt.id}
                            onChange={() => setBulkTargetType(opt.id as any)}
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
              {isBulkReconciling && (
                <p className="text-xs text-slate-400 italic">
                  Proses sedang berjalan, mohon tunggu...
                </p>
              )}

              {/* After Execution: Close and Refresh Button */}
              {!isBulkReconciling && bulkResult !== null && (
                <button
                  onClick={handleReloadAfterBulk}
                  data-testid="complete-bulk-modal-btn"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  Selesai & Muat Ulang Matriks
                </button>
              )}

              {/* Before Execution: Cancel & Start Buttons */}
              {!isBulkReconciling && bulkResult === null && (
                <>
                  <button
                    onClick={() => setShowConfirmBulkModal(false)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      handleBulkAutoReconcile(
                        bulkTargetType,
                        setIsBulkReconciling,
                        setBulkProgress,
                        setBulkResult,
                        async () => {
                          clearTierCache();
                          await fetchComplianceData(year, setLoading, setData, setTargets, setTotalSetoran);
                        }
                      );
                    }}
                    data-testid="start-bulk-reconcile-btn"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-xs"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Mulai Pencocokan Otomatis</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default ComplianceMatrix;

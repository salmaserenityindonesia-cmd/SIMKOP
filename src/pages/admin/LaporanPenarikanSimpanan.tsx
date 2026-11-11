import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  FileSpreadsheet,
  Printer,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  Wallet,
  Landmark,
  Banknote,
  AlertTriangle,
  CheckCircle2,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShieldAlert,
  ArrowDownRight
} from 'lucide-react';
import {
  getWithdrawalDetailedLedger,
  getWithdrawalSummary,
  exportWithdrawalReportExcel,
  getWithdrawableDepositTypes,
  formatRupiah,
  categorizeDepositType,
  type WithdrawalLedgerItem,
  type WithdrawalSummary,
  type WithdrawalReportFilters,
  type DepositTypeOption
} from '../../services/withdrawalReportService';
import WithdrawalReceiptModal from '../../components/withdrawal/WithdrawalReceiptModal';

// ─── Date Helpers ────────────────────────────────────────────────────────────

const getLocalDateString = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getStartOfMonthString = () => {
  const now = new Date();
  return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
};

const getStartOfQuarterString = () => {
  const now = new Date();
  const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
  return getLocalDateString(new Date(now.getFullYear(), quarterMonth, 1));
};

const formatDisplayDate = (dateStr?: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
};

// ─── Deposit Type Badge ──────────────────────────────────────────────────────

export function DepositTypeBadge({ code, name }: { code: string; name: string }) {
  const category = categorizeDepositType(code, name);
  const displayName = category === 'belanja' && (!name || name.trim().toLowerCase() === 'simpanan belanja')
    ? 'Simpanan Belanja Bulanan'
    : (name || (category === 'belanja' ? 'Simpanan Belanja Bulanan' : category === 'lebaran' ? 'Simpanan Lebaran' : 'Simpanan'));

  switch (category) {
    case 'lebaran':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {displayName}
        </span>
      );
    case 'belanja':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {displayName}
        </span>
      );
    case 'pokok_wajib':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          {displayName || 'Pokok & Wajib'}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          {displayName || 'Simpanan Sukarela'}
        </span>
      );
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export interface LaporanPenarikanSimpananProps {
  initialItems?: WithdrawalLedgerItem[];
  initialSummary?: WithdrawalSummary;
  initialDepositTypes?: DepositTypeOption[];
  initialReceiptData?: {
    transactionId: string;
    member: { id: string; nama: string; nrp: string };
    depositName: string;
    amount: number;
    paymentMethod: string;
    date: string;
  } | null;
}

export default function LaporanPenarikanSimpanan({
  initialItems,
  initialSummary,
  initialDepositTypes,
  initialReceiptData = null
}: LaporanPenarikanSimpananProps = {}) {
  // Preset filter state: 'all' | 'today' | 'month' | 'quarter' | 'custom'
  // Default ke 'all' (Semua Waktu) agar seluruh mutasi historis langsung tampil tanpa terpotong batas bulan
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'month' | 'quarter' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Dropdown & Checkbox filters
  const [depositTypeCode, setDepositTypeCode] = useState<string>('all');
  const [depositTypeOptions, setDepositTypeOptions] = useState<DepositTypeOption[]>(() => initialDepositTypes || []);
  const [isLoadingTypes, setIsLoadingTypes] = useState<boolean>(() => !initialDepositTypes);
  const [paymentMethod, setPaymentMethod] = useState<string>('all');
  const [hasActiveLoanOnly, setHasActiveLoanOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data state
  const [items, setItems] = useState<WithdrawalLedgerItem[]>(() => initialItems || []);
  const [summary, setSummary] = useState<WithdrawalSummary>(() => {
    if (initialSummary) return initialSummary;
    return {
      totalWithdrawalAmount: 0,
      totalTransactions: 0,
      uniqueMembers: 0,
      breakdownByType: { lebaran: 0, belanja: 0, pokok_wajib: 0, sukarela_lainnya: 0 },
      breakdownByMethod: {
        tunai: { amount: 0, percentage: 0, count: 0 },
        transfer: { amount: 0, percentage: 0, count: 0 }
      },
      membersWithActiveLoansCount: 0,
      totalActiveLoansObligation: 0
    };
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => !initialItems);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 15;

  // Receipt Modal State
  const [receiptData, setReceiptData] = useState<{
    transactionId: string;
    member: { id: string; nama: string; nrp: string };
    depositName: string;
    amount: number;
    paymentMethod: string;
    date: string;
  } | null>(initialReceiptData);

  // Handler: Preset tanggal
  const handlePresetChange = (preset: 'all' | 'today' | 'month' | 'quarter' | 'custom') => {
    setDatePreset(preset);
    const today = getLocalDateString();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'month') {
      setStartDate(getStartOfMonthString());
      setEndDate(today);
    } else if (preset === 'quarter') {
      setStartDate(getStartOfQuarterString());
      setEndDate(today);
    }
  };

  // Pemuatan data laporan
  const loadReportData = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: WithdrawalReportFilters = {
        startDate: (datePreset === 'all' || !startDate) ? undefined : startDate,
        endDate: (datePreset === 'all' || !endDate) ? undefined : endDate,
        depositTypeCode,
        paymentMethod,
        hasActiveLoanOnly,
        searchQuery
      };

      const ledger = await getWithdrawalDetailedLedger(filters);
      setItems(ledger);
      const summ = await getWithdrawalSummary(filters, ledger);
      setSummary(summ);
      setCurrentPage(1);
    } catch (err) {
      console.error('Gagal memuat laporan penarikan:', err);
    } finally {
      setIsLoading(false);
    }
  }, [datePreset, startDate, endDate, depositTypeCode, paymentMethod, hasActiveLoanOnly, searchQuery]);

  const loadWithdrawalData = loadReportData;

  const isInitialMount = React.useRef(true);

  useEffect(() => {
    let isMounted = true;
    getWithdrawableDepositTypes().then((types) => {
      if (isMounted) {
        setDepositTypeOptions(types);
        setIsLoadingTypes(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (initialItems && isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    loadReportData();
  }, [loadReportData, initialItems]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return items.slice(startIndex, startIndex + itemsPerPage);
  }, [items, currentPage, itemsPerPage]);

  // Handler: Ekspor Excel
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      let filterLabel = 'Semua Kategori Simpanan';
      if (depositTypeCode !== 'all') {
        if (depositTypeCode.toUpperCase() === 'TERMINATION' || depositTypeCode === 'pokok_wajib') {
          filterLabel = 'Simpanan: Pokok & Wajib (Kliring Keanggotaan)';
        } else {
          const matchedType = depositTypeOptions.find(
            t => t.code.toLowerCase() === depositTypeCode.toLowerCase() || t.id === depositTypeCode
          );
          const typeName = matchedType?.name || (depositTypeCode === 'lebaran' ? 'Simpanan Hari Raya (Lebaran)' : depositTypeCode === 'belanja' ? 'Simpanan Belanja Bulanan' : depositTypeCode.toUpperCase());
          filterLabel = `Simpanan: ${typeName}`;
        }
      }
      if (paymentMethod !== 'all') {
        filterLabel += ` | Metode: ${paymentMethod.toUpperCase()}`;
      }
      if (hasActiveLoanOnly) {
        filterLabel += ' | Filter: Memiliki Pinjaman Aktif';
      }

      await exportWithdrawalReportExcel(items, summary, {
        startDate: startDate || 'Awal',
        endDate: endDate || 'Sekarang',
        filterLabel
      });
    } catch (err) {
      console.error('Gagal ekspor Excel:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Handler: Cetak Rekap PDF / Window Print
  const handlePrintPdf = () => {
    window.print();
  };

  // Handler: Buka modal kwitansi dari baris tabel
  const handleOpenReceipt = (item: WithdrawalLedgerItem) => {
    const methodStr =
      item.payment_method.toLowerCase() === 'transfer'
        ? `Transfer Bank (${item.bank_name || '-'} - ${item.bank_account_number || '-'})`
        : 'Tunai Kasir Koperasi';

    setReceiptData({
      transactionId: item.reference_no !== '-' ? item.reference_no : item.id,
      member: {
        id: item.member_id,
        nama: item.member_name,
        nrp: item.member_nrp
      },
      depositName: item.deposit_type_name,
      amount: item.amount,
      paymentMethod: methodStr,
      date: item.transaction_date
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6 print:space-y-4">
        {/* Style khusus cetak */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            aside, nav, header, .no-print, button {
              display: none !important;
            }
            body {
              font-size: 11px;
              color: #000;
              background: #fff;
            }
            .print-only {
              display: block !important;
            }
            .table-container {
              overflow: visible !important;
            }
            table {
              width: 100% !important;
              border-collapse: collapse !important;
            }
            th, td {
              border: 1px solid #cbd5e1 !important;
              padding: 4px 6px !important;
            }
          }
        `}} />

        {/* Header Halaman */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1 no-print">
              <span>SIMKOP</span>
              <span className="text-slate-400">/</span>
              <span>Simpan Pinjam</span>
              <span className="text-slate-400">/</span>
              <span className="text-emerald-700 font-semibold">Laporan Pengawasan & Pencairan</span>
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Laporan Pengawasan & Pencairan Simpanan
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Monitoring real-time arus kas keluar penarikan simpanan sukarela, lebaran, dan kliring keanggotaan.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 no-print">
            <button
              onClick={handleExportExcel}
              disabled={isExporting || isLoading || items.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Unduh Buku Besar Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isExporting ? 'Mengekspor...' : 'Ekspor Excel (.xlsx)'}</span>
            </button>
            <button
              onClick={handlePrintPdf}
              disabled={isLoading || items.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Cetak Ringkasan / Ekspor PDF"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Cetak Rekap PDF</span>
            </button>
          </div>
        </div>

        {/* ─── Kartu KPI Pengawasan (Header Metrics) ───────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Total Pencairan Kas */}
          <div className="bg-white p-5 rounded-2xl border border-rose-100 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Pencairan Kas
              </span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <ArrowDownRight className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600">
              {formatRupiah(summary.totalWithdrawalAmount)}
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
              <span className="font-semibold text-slate-700">{summary.totalTransactions} transaksi</span>
              <span>•</span>
              <span>{summary.uniqueMembers} anggota</span>
            </div>
          </div>

          {/* KPI 2: Pencairan Simpanan Lebaran (Fokus Musiman) */}
          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Fokus Lebaran (THR)
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-700">
              {formatRupiah(summary.breakdownByType.lebaran)}
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                {summary.totalWithdrawalAmount > 0
                  ? `${((summary.breakdownByType.lebaran / summary.totalWithdrawalAmount) * 100).toFixed(1)}% dari total`
                  : '0% dari total'}
              </span>
            </div>
          </div>

          {/* KPI 3: Pencairan Non-Tunai / Transfer Bank */}
          <div className="bg-white p-5 rounded-2xl border border-sky-100 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Transfer Non-Tunai
              </span>
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Landmark className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-800">
              {formatRupiah(summary.breakdownByMethod.transfer.amount)}
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-semibold text-[11px]">
                {summary.breakdownByMethod.transfer.percentage}% Akuntabilitas
              </span>
              <span>({summary.breakdownByMethod.transfer.count} Trx)</span>
            </div>
          </div>

          {/* KPI 4: Cross-Obligation Risk Alert */}
          <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Kewajiban Pinjaman Aktif
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-600">
              {summary.membersWithActiveLoansCount} Anggota
            </div>
            <div className="text-xs text-slate-600 mt-2 flex items-center gap-1">
              <span>Sisa Pinjaman:</span>
              <span className="font-bold text-amber-700">
                {formatRupiah(summary.totalActiveLoansObligation)}
              </span>
            </div>
          </div>
        </div>

        {/* ─── Bilah Filter Komprehensif (No-Print) ─────────────────────────── */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 no-print">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Presets Tanggal Cepat */}
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase mr-1">Periode:</span>
              {(
                [
                  { id: 'month', label: 'Bulan Ini' },
                  { id: 'quarter', label: 'Kuartal Ini' },
                  { id: 'today', label: 'Hari Ini' },
                  { id: 'all', label: 'Semua Waktu' },
                  { id: 'custom', label: 'Custom' }
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetChange(preset.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    datePreset === preset.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Input Date Range (Jika custom atau preview aktif) */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setStartDate(e.target.value);
                  }}
                  className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  title="Tanggal Mulai"
                />
              </div>
              <span className="text-slate-400 text-xs font-semibold">s/d</span>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setEndDate(e.target.value);
                  }}
                  className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  title="Tanggal Selesai"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            {/* Filter Dropdown Jenis Simpanan */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Jenis Simpanan
              </label>
              <select
                value={depositTypeCode}
                onChange={(e) => setDepositTypeCode(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Semua Jenis Simpanan</option>
                {depositTypeOptions.map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.name}
                  </option>
                ))}
                <option value="TERMINATION">Pokok & Wajib (Kliring Keanggotaan)</option>
              </select>
            </div>

            {/* Filter Dropdown Metode Pencairan */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Metode Pencairan
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Semua Metode Penyaluran</option>
                <option value="tunai">Tunai Kasir Koperasi</option>
                <option value="transfer">Transfer Bank</option>
              </select>
            </div>

            {/* Search Box Interaktif */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Cari Transaksi / Anggota
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nama, NRP, No. Kwitansi..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Cross-Obligation Risk Checkbox / Toggle */}
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 p-2 bg-amber-50/60 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/50 transition-colors">
                <input
                  type="checkbox"
                  checked={hasActiveLoanOnly}
                  onChange={(e) => setHasActiveLoanOnly(e.target.checked)}
                  className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-amber-800">
                  Hanya yang Memiliki Pinjaman Aktif
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* ─── Tabel Data Pengawasan Pencairan ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden table-container">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-800">Buku Besar Pengawasan Mutasi Penarikan</h2>
              <p className="text-xs text-slate-500">
                Menampilkan {items.length} catatan transaksi pencairan simpanan
              </p>
            </div>
            <button
              onClick={() => loadReportData()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-all no-print"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3 text-center w-12">No</th>
                  <th className="py-3 px-3">Tanggal & Jam</th>
                  <th className="py-3 px-3">No. Kwitansi / Ref</th>
                  <th className="py-3 px-3">Identitas Anggota</th>
                  <th className="py-3 px-3 text-center">Jenis Simpanan</th>
                  <th className="py-3 px-3 text-right">Nominal Pencairan</th>
                  <th className="py-3 px-3 text-center">Metode Penyaluran</th>
                  <th className="py-3 px-3 text-center">Pengawasan Kewajiban (Pinjaman)</th>
                  <th className="py-3 px-3 text-center no-print">Aksi Kwitansi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                        <span>Memuat data pengawasan penarikan...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Wallet className="w-8 h-8 text-slate-300" />
                        <span className="font-semibold text-slate-600">Tidak ada catatan penarikan simpanan</span>
                        <span className="text-xs text-slate-400">Coba ubah filter periode atau kata kunci pencarian.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, idx) => {
                    const rowNumber = (currentPage - 1) * itemsPerPage + idx + 1;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 text-center text-slate-500 font-medium">
                          {rowNumber}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-700">
                          {formatDisplayDate(item.transaction_date)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            onClick={() => handleOpenReceipt(item)}
                            className="font-mono text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline inline-flex items-center gap-1"
                            title="Klik untuk cetak kwitansi"
                          >
                            <span>{item.reference_no !== '-' ? item.reference_no : item.id.slice(0, 8).toUpperCase()}</span>
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800">{item.member_name}</div>
                          <div className="text-[11px] text-slate-500">
                            NRP: {item.member_nrp} • {item.member_rank}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <DepositTypeBadge code={item.deposit_type_code} name={item.deposit_type_name} />
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-rose-600">
                          - {formatRupiah(item.amount)}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {item.payment_method.toLowerCase().includes('transfer') ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-100 text-sky-800">
                                <Landmark className="w-3 h-3" /> Transfer Bank
                              </span>
                              <span className="text-[10px] text-slate-500 mt-0.5">
                                {item.bank_name || '-'} ({item.bank_account_number || '-'})
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              <Banknote className="w-3 h-3" /> Kasir Tunai
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {item.has_active_loan ? (
                            <span
                              className="inline-flex flex-col items-center px-2 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200"
                              title={`Anggota memiliki ${item.active_loan_count} pinjaman aktif yang belum lunas`}
                            >
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-800">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Ada Pinjaman Aktif</span>
                              </span>
                              <span className="text-[10px] text-amber-700 font-bold">
                                Sisa: {formatRupiah(item.active_loan_balance)}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Bebas Pinjaman</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap no-print">
                          <button
                            onClick={() => handleOpenReceipt(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Buka Kwitansi"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>Kwitansi</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {/* Footer Total Akuntansi */}
              {!isLoading && items.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-800">
                  <tr>
                    <td colSpan={5} className="py-3 px-3 text-right uppercase text-[11px] tracking-wider">
                      TOTAL PENCAIRAN ({items.length} TRANSAKSI):
                    </td>
                    <td className="py-3 px-3 text-right text-sm text-rose-700 font-black whitespace-nowrap">
                      - {formatRupiah(summary.totalWithdrawalAmount)}
                    </td>
                    <td colSpan={3} className="py-3 px-3 text-left text-xs text-slate-500">
                      Tunai: {formatRupiah(summary.breakdownByMethod.tunai.amount)} • Transfer: {formatRupiah(summary.breakdownByMethod.transfer.amount)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination Controls */}
          {!isLoading && items.length > itemsPerPage && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 no-print">
              <span className="text-xs text-slate-500">
                Halaman {currentPage} dari {totalPages} ({items.length} total transaksi)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Halaman Pertama"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 text-xs font-bold text-slate-700 bg-slate-100 rounded-lg">
                  {currentPage}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Halaman Berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Halaman Terakhir"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Kwitansi Penarikan */}
        {receiptData && (
          <WithdrawalReceiptModal
            data={receiptData}
            onClose={() => setReceiptData(null)}
          />
        )}
      </div>
    </AdminLayout>
  );
}

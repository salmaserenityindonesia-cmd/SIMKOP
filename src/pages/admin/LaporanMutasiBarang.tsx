import { useState, useEffect, useCallback, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  FileSpreadsheet,
  Printer,
  RefreshCcw,
  Calendar,
  Search,
  PackagePlus,
  PackageMinus,
  Scale,
  History,
  Boxes,
  Inbox,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  ArrowDownRight,
  ArrowUpRight,
  X,
  AlertCircle
} from 'lucide-react';
import {
  getInventoryMutations,
  getProductStockLedger,
  getAllProductsForFilter,
  type InventoryMutation,
  type MutationKPISummary,
  type ProductOption,
  type ProductStockLedger,
  type MutationType
} from '../../services/inventoryMutationService';
import { formatCurrency } from '../../utils/formatCurrency';
import { useFeedback } from '../../context/FeedbackContext';
import { exportMutationToExcel, exportMutationToPdf } from '../../utils/mutationExporter';
import { getKoperasiProfile } from '../../services/settingsService';

// ─── Date Helpers ────────────────────────────────────────────────────────────

const getLocalDateString = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getDaysAgoDateString = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateString(d);
};

const getStartOfMonthString = () => {
  const now = new Date();
  return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
};

const formatMutationDate = (dateStr?: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
};

// ─── Mutation Badge Component ────────────────────────────────────────────────

interface MutationBadgeProps {
  type: MutationType;
  label?: string;
}

function MutationTypeBadge({ type, label }: MutationBadgeProps) {
  switch (type) {
    case 'MASUK_PEMBELIAN':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <ArrowDownRight className="w-3 h-3 text-emerald-600" />
          {label || 'Restock Pembelian'}
        </span>
      );
    case 'KELUAR_PENJUALAN':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
          <ArrowUpRight className="w-3 h-3 text-rose-600" />
          {label || 'Penjualan Kasir'}
        </span>
      );
    case 'KELUAR_RETUR':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <ArrowUpRight className="w-3 h-3 text-amber-600" />
          {label || 'Retur ke Supplier'}
        </span>
      );
    case 'MASUK_KLAIM_PENGGANTI':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
          <ArrowDownRight className="w-3 h-3 text-sky-600" />
          {label || 'Klaim Pengganti'}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
          {label || type}
        </span>
      );
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LaporanMutasiBarang() {
  const { showToast } = useFeedback();

  // Filter States
  const [startDate, setStartDate] = useState<string>(() => getDaysAgoDateString(30));
  const [endDate, setEndDate] = useState<string>(() => getLocalDateString());
  const [mutationType, setMutationType] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data States
  const [productsList, setProductsList] = useState<ProductOption[]>([]);
  const [mutations, setMutations] = useState<InventoryMutation[]>([]);
  const [kpi, setKpi] = useState<MutationKPISummary>({
    totalMasuk: 0,
    totalKeluar: 0,
    netPerubahan: 0,
    totalNilaiMasuk: 0,
    totalNilaiKeluar: 0,
    totalTransaksi: 0,
  });
  const [productLedger, setProductLedger] = useState<ProductStockLedger | null>(null);

  // UI States
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Fetch product list for dropdown on mount
  useEffect(() => {
    let isMounted = true;
    getAllProductsForFilter()
      .then((items) => {
        if (isMounted) setProductsList(items);
      })
      .catch((err) => {
        console.warn('Gagal mengambil daftar produk filter:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Mutations & Ledger Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (selectedProductId !== 'all') {
        // Mode Kartu Stok Produk Spesifik
        const [ledgerRes, filterRes] = await Promise.all([
          getProductStockLedger(selectedProductId, startDate, endDate),
          getInventoryMutations({
            startDate,
            endDate,
            productId: selectedProductId,
            mutationType: mutationType !== 'all' ? mutationType : undefined,
            search: searchQuery.trim() || undefined,
          }),
        ]);

        setProductLedger(ledgerRes);
        setMutations(filterRes.mutations);
        setKpi(filterRes.kpi);
      } else {
        // Mode Semua Produk (General Warehouse Mutations)
        setProductLedger(null);
        const res = await getInventoryMutations({
          startDate,
          endDate,
          mutationType: mutationType !== 'all' ? mutationType : undefined,
          search: searchQuery.trim() || undefined,
        });

        setMutations(res.mutations);
        setKpi(res.kpi);
      }
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Error fetching inventory mutations:', err);
      setError(err?.message || 'Terjadi kesalahan saat memuat data mutasi gudang.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedProductId, mutationType, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Quick Preset Handlers
  const applyPreset = (preset: 'today' | '7days' | '30days' | 'thisMonth') => {
    const todayStr = getLocalDateString();
    switch (preset) {
      case 'today':
        setStartDate(todayStr);
        setEndDate(todayStr);
        break;
      case '7days':
        setStartDate(getDaysAgoDateString(7));
        setEndDate(todayStr);
        break;
      case '30days':
        setStartDate(getDaysAgoDateString(30));
        setEndDate(todayStr);
        break;
      case 'thisMonth':
        setStartDate(getStartOfMonthString());
        setEndDate(todayStr);
        break;
    }
  };

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(mutations.length / pageSize));
  const paginatedMutations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return mutations.slice(start, start + pageSize);
  }, [mutations, currentPage, pageSize]);

  // Fallback CSV Exporter
  const handleDownloadCsv = () => {
    if (mutations.length === 0) {
      showToast('Tidak ada data mutasi untuk diekspor', 'warning');
      return;
    }

    const headers = [
      'No',
      'Waktu & Tanggal',
      'No. Referensi',
      'SKU',
      'Nama Barang',
      'Jenis Mutasi',
      'Masuk (+)',
      'Keluar (-)',
      'Saldo Berjalan',
      'Harga Satuan (Rp)',
      'Catatan / Keterangan',
    ];

    const rows = mutations.map((m, idx) => [
      idx + 1,
      formatMutationDate(m.mutation_date),
      `"${(m.reference_number || '').replace(/"/g, '""')}"`,
      `"${(m.sku || '').replace(/"/g, '""')}"`,
      `"${(m.product_name || '').replace(/"/g, '""')}"`,
      `"${(m.type_label || m.mutation_type || '').replace(/"/g, '""')}"`,
      m.qty_in,
      m.qty_out,
      m.balance_after ?? '',
      m.unit_price,
      `"${(m.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Laporan_Mutasi_Gudang_${startDate}_sd_${endDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Laporan mutasi berhasil diekspor (CSV)', 'success');
  };

  // Export Excel Action Handler (.xlsx via ExcelJS)
  const handleExportExcel = async () => {
    if (mutations.length === 0) {
      showToast('Tidak ada data mutasi untuk diekspor', 'warning');
      return;
    }
    setExporting(true);
    try {
      const profile = await getKoperasiProfile();
      await exportMutationToExcel({
        records: mutations,
        kpi,
        filters: {
          startDate,
          endDate,
          productId: selectedProductId !== 'all' ? selectedProductId : undefined,
          mutationType: mutationType !== 'all' ? mutationType : undefined,
          search: searchQuery.trim() || undefined,
        },
        profile,
        productLedger: selectedProductId !== 'all' ? productLedger : null,
      });
      showToast('Laporan mutasi berhasil diekspor ke Excel (.xlsx)', 'success');
    } catch (err: any) {
      console.error('Excel export error:', err);
      showToast('Gagal mengekspor laporan ke Excel: ' + (err?.message || 'Terjadi kesalahan'), 'error');
    } finally {
      setExporting(false);
    }
  };

  // Print PDF Action Handler (Landscape A4 via jsPDF)
  const handlePrintPdf = async () => {
    if (mutations.length === 0) {
      showToast('Tidak ada data mutasi untuk dicetak', 'warning');
      return;
    }
    setExporting(true);
    try {
      const profile = await getKoperasiProfile();
      await exportMutationToPdf({
        records: mutations,
        kpi,
        filters: {
          startDate,
          endDate,
          productId: selectedProductId !== 'all' ? selectedProductId : undefined,
          mutationType: mutationType !== 'all' ? mutationType : undefined,
          search: searchQuery.trim() || undefined,
        },
        profile,
        productLedger: selectedProductId !== 'all' ? productLedger : null,
      });
      showToast('Laporan mutasi berhasil diunduh dalam format PDF', 'success');
    } catch (err: any) {
      console.error('PDF export error:', err);
      showToast('Gagal memproses ekspor PDF: ' + (err?.message || 'Terjadi kesalahan'), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* ── Header Bar ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wider uppercase bg-teal-50 text-teal-700 border border-teal-200">
                Logistik &amp; Gudang
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-medium text-slate-500">Audit Arus Inventori</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
              Laporan Mutasi Barang Gudang
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Audit arus pergerakan stok keluar-masuk (penjualan kasir, pembelian supplier, retur barang, klaim pengganti) dengan kalkulasi saldo berjalan.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchData}
              disabled={loading}
              title="Perbarui Data Mutasi"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs disabled:opacity-50"
            >
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
            </button>

            <button
              onClick={handleExportExcel}
              disabled={loading || exporting || mutations.length === 0}
              className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors shadow-xs disabled:opacity-50 disabled:pointer-events-none"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>Export Excel</span>
            </button>

            <button
              onClick={handlePrintPdf}
              disabled={loading || exporting || mutations.length === 0}
              className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors shadow-xs disabled:opacity-50 disabled:pointer-events-none"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>Cetak PDF</span>
            </button>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── 4 KPI Summary Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Barang Masuk (+) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between border-l-4 border-l-emerald-500">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Barang Masuk (+)
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <PackagePlus className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900 tracking-tight">
                +{kpi.totalMasuk.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-normal text-slate-500">pcs</span>
              </div>
              <div className="text-xs text-emerald-700 font-medium mt-1">
                Nilai Masuk: {formatCurrency(kpi.totalNilaiMasuk)}
              </div>
            </div>
          </div>

          {/* Card 2: Total Barang Keluar (-) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between border-l-4 border-l-rose-500">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Barang Keluar (-)
              </span>
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                <PackageMinus className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900 tracking-tight">
                -{kpi.totalKeluar.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-normal text-slate-500">pcs</span>
              </div>
              <div className="text-xs text-rose-700 font-medium mt-1">
                Nilai Keluar: {formatCurrency(kpi.totalNilaiKeluar)}
              </div>
            </div>
          </div>

          {/* Card 3: Selisih Net Mutasi (+ / -) */}
          <div
            className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between border-l-4 ${
              kpi.netPerubahan >= 0 ? 'border-l-sky-500' : 'border-l-amber-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Selisih Net Mutasi (+ / -)
              </span>
              <div
                className={`p-2 rounded-xl border ${
                  kpi.netPerubahan >= 0
                    ? 'bg-sky-50 text-sky-600 border-sky-100'
                    : 'bg-amber-50 text-amber-600 border-amber-100'
                }`}
              >
                <Scale className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div
                className={`text-2xl font-bold tracking-tight ${
                  kpi.netPerubahan > 0
                    ? 'text-sky-700'
                    : kpi.netPerubahan < 0
                    ? 'text-amber-700'
                    : 'text-slate-900'
                }`}
              >
                {kpi.netPerubahan > 0 ? `+${kpi.netPerubahan.toLocaleString('id-ID')}` : kpi.netPerubahan.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-normal text-slate-500">pcs</span>
              </div>
              <div className="text-xs text-slate-500 font-medium mt-1">
                {kpi.netPerubahan >= 0 ? 'Arus Bersih: Surplus Akumulasi' : 'Arus Bersih: Berkurang'}
              </div>
            </div>
          </div>

          {/* Card 4: Total Mutasi Transaksi */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between border-l-4 border-l-purple-500">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Mutasi Transaksi
              </span>
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                <History className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900 tracking-tight">
                {kpi.totalTransaksi.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-normal text-slate-500">Mutasi</span>
              </div>
              <div className="text-xs text-purple-700 font-medium mt-1">
                Rekap Baris Log Pergerakan
              </div>
            </div>
          </div>
        </div>

        {/* ── Product Stock Ledger Card (Mode Kartu Stok Spesifik) ── */}
        {selectedProductId !== 'all' && productLedger && (
          <div className="bg-gradient-to-r from-teal-50 via-sky-50 to-indigo-50 border border-teal-200/80 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-teal-200/60">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-white text-teal-700 rounded-xl shadow-sm border border-teal-100">
                  <Boxes className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-teal-800 tracking-wider uppercase bg-teal-100/70 px-2 py-0.5 rounded">
                      KARTU STOK PRODUK
                    </span>
                    <span className="text-xs font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      SKU: {productLedger.sku || '-'}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">
                    {productLedger.productName}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-white px-4 py-2 rounded-xl border border-teal-200 shadow-sm text-right">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Stok Fisik Saat Ini
                  </span>
                  <span className="text-lg font-bold text-teal-900">
                    {productLedger.currentStock.toLocaleString('id-ID')} {productLedger.unit}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="bg-white/80 p-3 rounded-xl border border-teal-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Saldo Awal Periode
                </span>
                <span className="text-base font-bold text-slate-800">
                  {productLedger.initialBalance.toLocaleString('id-ID')} {productLedger.unit}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Sebelum {startDate}</span>
              </div>

              <div className="bg-white/80 p-3 rounded-xl border border-emerald-100">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
                  Total Masuk Periode
                </span>
                <span className="text-base font-bold text-emerald-700">
                  +{productLedger.kpi.totalMasuk.toLocaleString('id-ID')} {productLedger.unit}
                </span>
                <span className="text-[10px] text-emerald-600/70 block mt-0.5">Penambahan</span>
              </div>

              <div className="bg-white/80 p-3 rounded-xl border border-rose-100">
                <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">
                  Total Keluar Periode
                </span>
                <span className="text-base font-bold text-rose-700">
                  -{productLedger.kpi.totalKeluar.toLocaleString('id-ID')} {productLedger.unit}
                </span>
                <span className="text-[10px] text-rose-600/70 block mt-0.5">Pengurangan</span>
              </div>

              <div className="bg-white/80 p-3 rounded-xl border border-indigo-100">
                <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider block">
                  Saldo Akhir Periode
                </span>
                <span className="text-base font-bold text-indigo-900">
                  {productLedger.finalBalance.toLocaleString('id-ID')} {productLedger.unit}
                </span>
                <span className="text-[10px] text-indigo-600/70 block mt-0.5">Posisi {endDate}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Interactive Filter Controls Bar ── */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider pb-2 border-b border-slate-100">
            <Filter className="w-4 h-4 text-teal-600" />
            <span>Filter &amp; Kontrol Pencarian</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Dari Tanggal */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                Dari Tanggal
              </label>
              <div className="relative">
                <Calendar className="absolute inset-y-0 left-3 m-auto h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Sampai Tanggal */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                Sampai Tanggal
              </label>
              <div className="relative">
                <Calendar className="absolute inset-y-0 left-3 m-auto h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Filter Jenis Mutasi */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                Jenis Mutasi
              </label>
              <select
                value={mutationType}
                onChange={(e) => setMutationType(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white transition"
              >
                <option value="all">Semua Jenis Mutasi</option>
                <option value="MASUK_PEMBELIAN">Restock Pembelian (Masuk)</option>
                <option value="KELUAR_PENJUALAN">Penjualan Kasir POS (Keluar)</option>
                <option value="KELUAR_RETUR">Retur ke Supplier (Keluar)</option>
                <option value="MASUK_KLAIM_PENGGANTI">Klaim Pengganti Retur (Masuk)</option>
              </select>
            </div>

            {/* Mode Kartu Stok Produk */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                Mode Kartu Stok (Produk)
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white transition"
              >
                <option value="all">Semua Produk (Semua Mutasi Gudang)</option>
                {productsList.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name} ({prod.sku || '-'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Presets & Text Search Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1 font-medium">Preset:</span>
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => applyPreset('7days')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
              >
                7 Hari Terakhir
              </button>
              <button
                type="button"
                onClick={() => applyPreset('30days')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
              >
                30 Hari Terakhir
              </button>
              <button
                type="button"
                onClick={() => applyPreset('thisMonth')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition"
              >
                Bulan Ini
              </button>
            </div>

            {/* Pencarian Teks */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute inset-y-0 left-3 m-auto h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari No. Referensi, SKU, Nama Barang, Catatan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-2.5 m-auto text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Stock Ledger Table ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                Buku Besar Mutasi Stok (Stock Ledger)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Menampilkan seluruh riwayat pergerakan fisik barang terverifikasi secara kronologis.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>Baris per halaman:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
              <span className="text-sm font-medium text-slate-500 mt-3">
                Memuat buku besar mutasi barang...
              </span>
            </div>
          ) : mutations.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="p-4 bg-slate-100 rounded-full text-slate-400 mb-3">
                <Inbox className="w-10 h-10" />
              </div>
              <h4 className="text-base font-bold text-slate-800">
                Tidak ada riwayat mutasi barang
              </h4>
              <p className="text-sm text-slate-500 max-w-md mt-1">
                Tidak ditemukan catatan pergerakan stok untuk kriteria dan rentang tanggal yang dipilih.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200/80">
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4 w-40">Waktu &amp; Tanggal</th>
                    <th className="py-3 px-4 w-44">No. Referensi</th>
                    <th className="py-3 px-4">SKU &amp; Nama Barang</th>
                    <th className="py-3 px-4 w-48 text-center">Jenis Mutasi</th>
                    <th className="py-3 px-4 w-24 text-right">Masuk (+)</th>
                    <th className="py-3 px-4 w-24 text-right">Keluar (-)</th>
                    <th className="py-3 px-4 w-28 text-right">Saldo Berjalan</th>
                    <th className="py-3 px-4 w-32 text-right">Harga Satuan</th>
                    <th className="py-3 px-4 min-w-[200px]">Catatan / Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedMutations.map((item, index) => {
                    const rowNumber = (currentPage - 1) * pageSize + index + 1;
                    return (
                      <tr
                        key={item.mutation_id || `${item.reference_number}-${index}`}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3.5 px-4 text-center text-xs text-slate-400">
                          {rowNumber}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                          {formatMutationDate(item.mutation_date)}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800 text-xs whitespace-nowrap">
                          {item.reference_number || '-'}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900 text-sm">
                            {item.product_name || `Produk ${item.product_id}`}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            SKU: {item.sku || '-'} {item.unit ? `• ${item.unit}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <MutationTypeBadge
                            type={item.mutation_type}
                            label={item.type_label}
                          />
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-xs whitespace-nowrap">
                          {item.qty_in > 0 ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              +{item.qty_in.toLocaleString('id-ID')}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-xs whitespace-nowrap">
                          {item.qty_out > 0 ? (
                            <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                              -{item.qty_out.toLocaleString('id-ID')}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-800 text-xs whitespace-nowrap">
                          {item.balance_after !== undefined
                            ? item.balance_after.toLocaleString('id-ID')
                            : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-right text-xs text-slate-600 whitespace-nowrap">
                          {item.unit_price > 0 ? formatCurrency(item.unit_price) : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-500 leading-relaxed">
                          {item.notes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Table Footer & Pagination ── */}
          {!loading && mutations.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Menampilkan{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min((currentPage - 1) * pageSize + 1, mutations.length)}
                </span>{' '}
                sampai{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min(currentPage * pageSize, mutations.length)}
                </span>{' '}
                dari{' '}
                <span className="font-semibold text-slate-800">
                  {mutations.length}
                </span>{' '}
                data mutasi
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition"
                  title="Halaman Pertama"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 font-medium text-slate-700 bg-white border border-slate-200 rounded-lg">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition"
                  title="Halaman Selanjutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition"
                  title="Halaman Terakhir"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

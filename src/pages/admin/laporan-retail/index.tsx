import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../../components/layout/AdminLayout';
import {
  FileSpreadsheet,
  Printer,
  RefreshCcw,
  Calendar,
  Wallet,
  TrendingUp,
  Package,
  AlertTriangle,
  Store,
  Loader2,
  ChevronRight,
  ShoppingCart,
  BadgeDollarSign,
  BarChart2
} from 'lucide-react';
import {
  getEndOfDayReport,
  getFastMovingProducts,
  getStockValuation,
  type EndOfDayReport,
  type FastMovingProduct,
  type StockValuation
} from '../../../services/retail-report.service';
import { exportRetailToExcel, printRetailPDF } from '../../../utils/retailExporter';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const today = new Date().toISOString().slice(0, 10);
const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .slice(0, 10);

type TabKey = 'tutup-kasir' | 'terlaris' | 'stok';

const navLinkClass = (isActive: boolean) =>
  `whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
    isActive
      ? 'border-[#0D9488] text-[#0D9488]'
      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
  }`;

const metricCard = (
  label: string,
  value: string,
  sub: string,
  accentColor = '#0D9488'
) => (
  <div
    className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col justify-between"
    style={{ borderLeftColor: accentColor, borderLeftWidth: 4 }}
  >
    <div className="text-slate-500 text-sm font-medium mb-2">{label}</div>
    <div className="text-2xl font-semibold text-[#0F2942]">{value}</div>
    <div className="text-xs text-slate-500 mt-2">{sub}</div>
  </div>
);

// ─── Badge helpers ────────────────────────────────────────────────────────────
function StockBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    aman:   { bg: 'bg-[#ECFDF5]', text: 'text-[#047857]', label: 'Aman' },
    kritis: { bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', label: 'Kritis' },
    habis:  { bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', label: 'Habis' },
  };
  const s = map[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600', label: status };
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LaporanRetail() {
  const [activeTab, setActiveTab] = useState<TabKey>('tutup-kasir');

  // Filters
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Data state
  const [eodData, setEodData] = useState<EndOfDayReport | null>(null);
  const [fastMoving, setFastMoving] = useState<FastMovingProduct[]>([]);
  const [stockData, setStockData] = useState<StockValuation | null>(null);

  // Loading / error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eod, fast, stock] = await Promise.all([
        getEndOfDayReport(startDate, endDate),
        getFastMovingProducts(startDate, endDate),
        getStockValuation(),
      ]);
      setEodData(eod);
      setFastMoving(fast);
      setStockData(stock);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data. Periksa koneksi dan konfigurasi Supabase.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Auto-load on mount and when dates change
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Preset buttons
  const applyPreset = (preset: 'today' | 'yesterday' | 'month') => {
    const d = new Date();
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'yesterday') {
      const y = new Date(d);
      y.setDate(d.getDate() - 1);
      const ys = y.toISOString().slice(0, 10);
      setStartDate(ys);
      setEndDate(ys);
    } else {
      setStartDate(startOfMonth);
      setEndDate(today);
    }
  };

  const handleExportExcel = () =>
    exportRetailToExcel({ startDate, endDate }, eodData, fastMoving, stockData);
  const handlePrintPDF = () =>
    printRetailPDF(`Laporan Retail SIMKOP – ${startDate} s/d ${endDate}`);

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6 text-[#0F2942] print:p-0">

        {/* ── Page Header ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="text-sm text-slate-500 mb-1 flex items-center gap-1">
              <span>SIMKOP</span>
              <ChevronRight className="w-3 h-3" />
              <span>Laporan</span>
              <ChevronRight className="w-3 h-3" />
              <span className="font-semibold text-slate-800">Laporan Retail &amp; Inventori</span>
            </div>
            <h1 className="text-3xl font-semibold text-[#0F2942] flex items-center gap-2">
              <Store className="w-8 h-8 text-[#0D9488]" />
              Laporan Retail &amp; Inventori Toko
            </h1>
            <p className="text-slate-600 mt-1 max-w-3xl text-sm">
              Konsolidasi omzet penjualan kasir, rekonsiliasi kas/simpanan anggota,
              analisis margin laba kotor, serta valuasi aset gudang.
            </p>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <span className="px-3 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-full text-sm font-medium">
              {new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={fetchAll}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#0B7A70] transition shadow-sm font-medium disabled:opacity-60"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCcw className="w-4 h-4" />}
              Sinkronisasi POS
            </button>
          </div>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] px-4 py-3 rounded-xl flex items-center gap-3 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-wrap gap-4 items-end shadow-sm print:hidden">
          {/* Date range */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Dari Tanggal
            </label>
            <div className="relative">
              <Calendar className="absolute inset-y-0 left-3 m-auto h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="pl-10 pr-3 py-2 border border-[#CBD5E1] rounded-lg text-sm bg-[#F8FAFC] focus:outline-none focus:border-[#0D9488]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Sampai Tanggal
            </label>
            <div className="relative">
              <Calendar className="absolute inset-y-0 left-3 m-auto h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="pl-10 pr-3 py-2 border border-[#CBD5E1] rounded-lg text-sm bg-[#F8FAFC] focus:outline-none focus:border-[#0D9488]"
              />
            </div>
          </div>

          {/* Presets */}
          <div className="flex gap-2">
            {(['today', 'yesterday', 'month'] as const).map(p => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className="px-3 py-2 text-sm rounded-lg border border-[#CBD5E1] text-[#0F2942] bg-white hover:bg-slate-50 font-medium"
              >
                {p === 'today' ? 'Hari Ini' : p === 'yesterday' ? 'Kemarin' : 'Bulan Ini'}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition font-medium shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </button>
            <button
              onClick={handlePrintPDF}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#CBD5E1] text-[#0F2942] rounded-lg hover:bg-slate-50 transition font-medium"
            >
              <Printer className="w-4 h-4" />
              Cetak PDF
            </button>
          </div>
        </div>

        {/* ── Tab Switcher ── */}
        <div className="border-b border-[#CBD5E1] print:hidden">
          <nav className="-mb-px flex gap-8">
            <button onClick={() => setActiveTab('tutup-kasir')} className={navLinkClass(activeTab === 'tutup-kasir')}>
              <Wallet className="w-4 h-4" /> Tutup Kasir Harian &amp; Rekonsiliasi
            </button>
            <button onClick={() => setActiveTab('terlaris')} className={navLinkClass(activeTab === 'terlaris')}>
              <TrendingUp className="w-4 h-4" /> Produk Terlaris &amp; Margin Laba
            </button>
            <button onClick={() => setActiveTab('stok')} className={navLinkClass(activeTab === 'stok')}>
              <Package className="w-4 h-4" /> Status Stok &amp; Valuasi Gudang
            </button>
          </nav>
        </div>

        {/* ── Loading overlay ── */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#0D9488] animate-spin" />
            <span className="ml-3 text-slate-500">Memuat data laporan...</span>
          </div>
        )}

        {/* ── Tab Content ── */}
        {!loading && (

          <div className="space-y-6">

            {/* ═══════════════════════════════════════
                TAB 1 – Tutup Kasir Harian
            ═══════════════════════════════════════ */}
            {activeTab === 'tutup-kasir' && (
              <div className="space-y-6">
                {/* Metric Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                    <div className="flex items-center gap-2 text-slate-500 text-sm font-medium mb-2">
                      <BarChart2 className="w-4 h-4" /> Total Omzet
                    </div>
                    <div className="text-3xl font-semibold text-[#0F2942]">
                      {formatRp(eodData?.totalOmzet ?? 0)}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {eodData?.transactions.length ?? 0} transaksi
                    </div>
                  </div>
                  {metricCard(
                    'Uang Tunai Kasir',
                    formatRp(eodData?.paidCash ?? 0),
                    'Fisik laci kasir siap setoran',
                    '#0D9488'
                  )}
                  {metricCard(
                    'Potong Simpanan',
                    formatRp(eodData?.paidDeposit ?? 0),
                    'Terdebit otomatis rekening anggota',
                    '#10B981'
                  )}
                  {metricCard(
                    'Bon Toko / Piutang',
                    formatRp(eodData?.paidCredit ?? 0),
                    'Jatuh tempo potong gaji bulan depan',
                    '#F59E0B'
                  )}
                </div>

                {/* Transactions table */}
                <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
                    <h3 className="font-semibold text-[#0F2942] flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-[#0D9488]" />
                      Log Transaksi Penjualan
                    </h3>
                    <span className="text-xs text-slate-500">
                      {eodData?.transactions.length ?? 0} record ditemukan
                    </span>
                  </div>
                  {eodData && eodData.transactions.length === 0 ? (
                    <div className="py-16 text-center text-slate-400">
                      Tidak ada transaksi pada periode ini.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-white text-slate-500 text-xs uppercase font-semibold border-b border-[#CBD5E1]">
                          <tr>
                            <th className="px-4 py-3">Waktu</th>
                            <th className="px-4 py-3">No. Nota</th>
                            <th className="px-4 py-3">Kasir</th>
                            <th className="px-4 py-3">Pembeli</th>
                            <th className="px-4 py-3 text-right">Total</th>
                            <th className="px-4 py-3 text-right text-[#0D9488]">Tunai</th>
                            <th className="px-4 py-3 text-right text-[#10B981]">Simpanan</th>
                            <th className="px-4 py-3 text-right text-[#F59E0B]">Bon Toko</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {(eodData?.transactions ?? []).map((t: any) => {
                            const waktu = t.completed_at
                              ? new Date(t.completed_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                              : '-';
                            return (
                              <tr key={t.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-slate-500">{waktu}</td>
                                <td className="px-4 py-3 font-mono text-xs">{t.sale_number}</td>
                                <td className="px-4 py-3">{t.pengelola?.nama ?? '-'}</td>
                                <td className="px-4 py-3">{t.anggota?.nama ?? 'Non-Anggota'}</td>
                                <td className="px-4 py-3 text-right font-medium">{formatRp(t.total_amount)}</td>
                                <td className="px-4 py-3 text-right text-[#0D9488]">
                                  {t.paid_cash > 0 ? formatRp(t.paid_cash) : <span className="text-slate-300">-</span>}
                                </td>
                                <td className="px-4 py-3 text-right text-[#10B981]">
                                  {t.paid_deposit > 0 ? formatRp(t.paid_deposit) : <span className="text-slate-300">-</span>}
                                </td>
                                <td className="px-4 py-3 text-right text-[#F59E0B]">
                                  {t.paid_credit > 0 ? formatRp(t.paid_credit) : <span className="text-slate-300">-</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {eodData && eodData.transactions.length > 0 && (
                          <tfoot className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] font-semibold text-sm">
                            <tr>
                              <td colSpan={4} className="px-4 py-3 text-right text-slate-500">TOTAL REKONSILIASI</td>
                              <td className="px-4 py-3 text-right">{formatRp(eodData.totalOmzet)}</td>
                              <td className="px-4 py-3 text-right text-[#0D9488]">{formatRp(eodData.paidCash)}</td>
                              <td className="px-4 py-3 text-right text-[#10B981]">{formatRp(eodData.paidDeposit)}</td>
                              <td className="px-4 py-3 text-right text-[#F59E0B]">{formatRp(eodData.paidCredit)}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════
                TAB 2 – Produk Terlaris & Margin
            ═══════════════════════════════════════ */}
            {activeTab === 'terlaris' && (
              <div className="space-y-6">
                {/* Top 3 fast-mover showcase */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {fastMoving.slice(0, 3).map(item => (
                    <div key={item.sku} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-[#0D9488] text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                        #{item.rank}
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#F0FDFA] flex items-center justify-center shrink-0">
                          <BadgeDollarSign className="w-5 h-5 text-[#0D9488]" />
                        </div>
                        <div className="flex-1 pr-8">
                          <h4 className="font-semibold text-[#0F2942] leading-tight">{item.name}</h4>
                          <p className="text-xs text-slate-400 mt-0.5">{item.category}</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-xs text-slate-400 uppercase font-semibold">Qty</div>
                          <div className="font-bold text-[#0F2942]">{item.qty.toLocaleString('id-ID')}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 uppercase font-semibold">Omzet</div>
                          <div className="font-semibold text-[#0F2942] text-xs">{formatRp(item.omzet)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#10B981] uppercase font-semibold">Margin</div>
                          <div className="font-bold text-[#10B981]">{item.margin.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {fastMoving.length === 0 && (
                    <div className="col-span-3 py-12 text-center text-slate-400 bg-white rounded-xl border border-[#E2E8F0]">
                      Tidak ada data penjualan pada periode ini.
                    </div>
                  )}
                </div>

                {/* Ranking table */}
                <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                    <h3 className="font-semibold text-[#0F2942]">Peringkat Produk Terlaris &amp; Margin Laba</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-white text-slate-500 text-xs uppercase font-semibold border-b border-[#CBD5E1]">
                        <tr>
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Nama Produk</th>
                          <th className="px-4 py-3">Kategori</th>
                          <th className="px-4 py-3 text-right">Qty</th>
                          <th className="px-4 py-3 text-right">Omzet</th>
                          <th className="px-4 py-3 text-right">HPP Modal</th>
                          <th className="px-4 py-3 text-right text-[#0D9488]">Laba Kotor</th>
                          <th className="px-4 py-3 min-w-[140px]">Margin %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {fastMoving.map(p => (
                          <tr key={p.sku} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-bold text-[#0D9488]">{p.rank}</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                            <td className="px-4 py-3 font-medium">{p.name}</td>
                            <td className="px-4 py-3 text-slate-500">{p.category}</td>
                            <td className="px-4 py-3 text-right">{p.qty.toLocaleString('id-ID')}</td>
                            <td className="px-4 py-3 text-right">{formatRp(p.omzet)}</td>
                            <td className="px-4 py-3 text-right text-slate-500">{formatRp(p.hpp)}</td>
                            <td className="px-4 py-3 text-right font-medium text-[#0D9488]">{formatRp(p.labaKotor)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-200 rounded-full h-2">
                                  <div
                                    className="bg-[#10B981] h-2 rounded-full transition-all"
                                    style={{ width: `${Math.min(p.margin, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-[#10B981] w-12 text-right">
                                  {p.margin.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {fastMoving.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-4 py-16 text-center text-slate-400">
                              Tidak ada data penjualan pada periode ini.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════
                TAB 3 – Status Stok & Valuasi
            ═══════════════════════════════════════ */}
            {activeTab === 'stok' && (
              <div className="space-y-6">
                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm">
                    <div className="text-slate-500 text-sm font-medium mb-2">Valuasi Aset Toko (HPP)</div>
                    <div className="text-3xl font-semibold text-[#0F2942]">
                      {formatRp(stockData?.totalValuasiAset ?? 0)}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {stockData?.items.length ?? 0} SKU aktif
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm border-l-4 border-l-[#0D9488]">
                    <div className="text-slate-500 text-sm font-medium mb-2">Potensi Penjualan (Retail)</div>
                    <div className="text-3xl font-semibold text-[#0D9488]">
                      {formatRp(stockData?.potensiPenjualan ?? 0)}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Laba bruto: {formatRp((stockData?.potensiPenjualan ?? 0) - (stockData?.totalValuasiAset ?? 0))}
                    </div>
                  </div>
                  <div className={`p-5 rounded-xl border shadow-sm ${
                    (stockData?.kritisCount ?? 0) > 0
                      ? 'bg-[#FEF2F2] border-[#FECACA]'
                      : 'bg-[#ECFDF5] border-[#BBF7D0]'
                  }`}>
                    <div className={`text-sm font-medium mb-2 flex items-center gap-2 ${
                      (stockData?.kritisCount ?? 0) > 0 ? 'text-[#991B1B]' : 'text-[#047857]'
                    }`}>
                      <AlertTriangle className="w-4 h-4" /> Stok Kritis Butuh Restock
                    </div>
                    <div className={`text-3xl font-semibold ${
                      (stockData?.kritisCount ?? 0) > 0 ? 'text-[#991B1B]' : 'text-[#047857]'
                    }`}>
                      {stockData?.kritisCount ?? 0} Item
                    </div>
                    <div className={`text-xs mt-1 ${
                      (stockData?.kritisCount ?? 0) > 0 ? 'text-[#991B1B]' : 'text-[#047857]'
                    }`}>
                      {(stockData?.kritisCount ?? 0) > 0 ? 'Segera terbitkan Purchase Order' : 'Stok dalam kondisi aman'}
                    </div>
                  </div>
                </div>

                {/* Inventory table */}
                <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
                    <h3 className="font-semibold text-[#0F2942]">Inventori Produk &amp; Peringatan Stok Buffer</h3>
                    <span className="text-xs text-slate-500">
                      {stockData?.items.length ?? 0} produk
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-white text-slate-500 text-xs uppercase font-semibold border-b border-[#CBD5E1]">
                        <tr>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Nama Produk</th>
                          <th className="px-4 py-3 text-right">Stok Fisik</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Harga Beli</th>
                          <th className="px-4 py-3 text-right">Harga Jual</th>
                          <th className="px-4 py-3 text-right">Valuasi Aset</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {(stockData?.items ?? []).map((item: any) => (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-50 ${item.status === 'kritis' || item.status === 'habis' ? 'bg-[#FEF2F2]/40' : ''}`}
                          >
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.sku || '-'}</td>
                            <td className="px-4 py-3 font-medium">{item.name}</td>
                            <td className={`px-4 py-3 text-right font-bold ${
                              item.status === 'kritis' || item.status === 'habis'
                                ? 'text-[#991B1B]'
                                : 'text-[#0F2942]'
                            }`}>
                              {item.stock} {item.unit || 'pcs'}
                            </td>
                            <td className="px-4 py-3"><StockBadge status={item.status} /></td>
                            <td className="px-4 py-3 text-right text-slate-600">{formatRp(item.buy_price)}</td>
                            <td className="px-4 py-3 text-right">{formatRp(item.sell_price)}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatRp(item.valuasiAset)}</td>
                          </tr>
                        ))}
                        {(stockData?.items ?? []).length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-16 text-center text-slate-400">
                              Tidak ada data produk.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {stockData && stockData.items.length > 0 && (
                        <tfoot className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] font-semibold text-sm">
                          <tr>
                            <td colSpan={6} className="px-4 py-3 text-right text-slate-500">TOTAL VALUASI ASET</td>
                            <td className="px-4 py-3 text-right">{formatRp(stockData.totalValuasiAset)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </AdminLayout>
  );
}

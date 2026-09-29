import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../../components/layout/AdminLayout';
import { supabase } from '../../../lib/supabaseClient';

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
}

export interface CashFlowData {
  inflowTotal: number;
  outflowTotal: number;
  netCashflow: number;
  transactions: CashFlowTransaction[];
}

export interface MarginKategori {
  kategori: string;
  omzet: number;
  hpp: number;
  laba_kotor: number;
  gross_margin_pct: number;
}

export interface ShuEstimationData {
  grossSales: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  estimatedShu: number;
  marginPercentage: number;
  marginPerKategori: MarginKategori[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatRp = (n: number): string =>
  'Rp ' + Math.round(n).toLocaleString('id-ID');

const today = new Date();
const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const todayStr = today.toISOString().slice(0, 10);

const KATEGORI_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  penjualan_tunai:    { bg: 'bg-emerald-50',  text: 'text-emerald-800', label: 'Penjualan POS' },
  simpanan:           { bg: 'bg-blue-50',     text: 'text-blue-800',    label: 'Simpanan' },
  angsuran_pinjaman:  { bg: 'bg-amber-50',    text: 'text-amber-800',   label: 'Angsuran Pinjaman' },
  restock_supplier:   { bg: 'bg-orange-50',   text: 'text-orange-800',  label: 'Restock Supplier' },
  pembelian_barang:   { bg: 'bg-orange-50',   text: 'text-orange-800',  label: 'Pembelian Barang' },
  pencairan_pinjaman: { bg: 'bg-purple-50',   text: 'text-purple-800',  label: 'Pencairan Pinjaman' },
  penarikan_simpanan: { bg: 'bg-rose-50',     text: 'text-rose-800',    label: 'Penarikan Simpanan' },
  beban_operasional:  { bg: 'bg-red-50',      text: 'text-red-800',     label: 'Beban Operasional' },
};

const KategoriBadge = ({ kategori }: { kategori: string }) => {
  const cfg = KATEGORI_BADGE[kategori] ?? { bg: 'bg-slate-50', text: 'text-slate-700', label: kategori };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
};

// ─── Service Layer (Wave 2) ───────────────────────────────────────────────────

async function getCashFlowReport(
  startDate: string,
  endDate: string,
  unit: string
): Promise<CashFlowData> {
  // Fetch cash_flow table
  // NOTE: cash_flow table has no 'unit' column — filter unit usaha tidak tersedia di level DB
  const { data: cfRows, error: cfErr } = await supabase
    .from('cash_flow')
    .select('id, created_at, description, category, direction, amount, reference_id')
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .order('created_at', { ascending: true });
  if (cfErr) console.error('cash_flow query error:', cfErr);

  // Cross-check: also fetch sales.paid_cash for the period (retail inflow)
  // NOTE: actual column is 'sale_status' (enum), not 'status'
  const { data: salesRows, error: salesErr } = await supabase
    .from('sales')
    .select('id, created_at, paid_cash, total_amount')
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .eq('sale_status', 'completed')
    .gt('paid_cash', 0);
  if (salesErr) console.error('sales query error:', salesErr);

  const rows: CashFlowTransaction[] = [];
  let runningSaldo = 0;

  // Build from cash_flow
  for (const r of (cfRows ?? [])) {
    const masuk  = r.direction === 'in'  ? Number(r.amount) : 0;
    const keluar = r.direction === 'out' ? Number(r.amount) : 0;
    runningSaldo += masuk - keluar;
    rows.push({
      id: r.id,
      tanggal: new Date(r.created_at).toLocaleDateString('id-ID'),
      referensi: `CF-${r.id.slice(0, 8).toUpperCase()}`,
      deskripsi: r.description ?? '-',
      kategori: r.category ?? 'lainnya',
      unit_usaha: 'Umum', // cash_flow table has no 'unit' column
      kas_masuk: masuk,
      kas_keluar: keluar,
      saldo_berjalan: runningSaldo,
    });
  }

  // Add sales paid_cash if not already in cash_flow
  // (some systems record via POS directly into sales, not cash_flow)
  const cfCategories = new Set((cfRows ?? []).map((r: any) => r.category));
  if (!cfCategories.has('penjualan_tunai')) {
    for (const s of (salesRows ?? [])) {
      const masuk = Number(s.paid_cash ?? 0);
      if (masuk > 0) {
        runningSaldo += masuk;
        rows.push({
          id: s.id,
          tanggal: new Date(s.created_at).toLocaleDateString('id-ID'),
          referensi: `POS-${s.id.slice(0, 8).toUpperCase()}`,
          deskripsi: 'Penjualan Kasir Tunai',
          kategori: 'penjualan_tunai',
          unit_usaha: 'Retail Toko',
          kas_masuk: masuk,
          kas_keluar: 0,
          saldo_berjalan: runningSaldo,
        });
      }
    }
  }

  // Sort by tanggal ascending
  rows.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  // Recalculate running saldo after sort
  let saldo = 0;
  for (const r of rows) {
    saldo += r.kas_masuk - r.kas_keluar;
    r.saldo_berjalan = saldo;
  }

  const inflowTotal  = rows.reduce((s, r) => s + r.kas_masuk, 0);
  const outflowTotal = rows.reduce((s, r) => s + r.kas_keluar, 0);

  return { inflowTotal, outflowTotal, netCashflow: inflowTotal - outflowTotal, transactions: rows };
}

async function getShuEstimation(
  startDate: string,
  endDate: string
): Promise<ShuEstimationData> {
  // 1. Total Omzet dari sales.total_amount (completed)
  // NOTE: actual column is 'sale_status' (enum), not 'status'
  const { data: salesData, error: salesErr } = await supabase
    .from('sales')
    .select('id, total_amount, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .eq('sale_status', 'completed');
  if (salesErr) console.error('shu sales error:', salesErr);

  const grossSales = (salesData ?? []).reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0);
  const saleIds = (salesData ?? []).map((r: any) => r.id);

  // 2. HPP = SUM(sale_items.quantity * products.buy_price)
  let cogs = 0;
  const marginMap: Record<string, { omzet: number; hpp: number; kategori: string }> = {};

  if (saleIds.length > 0) {
    // NOTE: sale_items has both (quantity/unit_price) and (qty/price) columns.
    // 'quantity' is NOT NULL so it's the canonical column for HPP calculation.
    const { data: saleItems, error: siErr } = await supabase
      .from('sale_items')
      .select('quantity, unit_price, product_id, sale_id')
      .in('sale_id', saleIds);
    if (siErr) console.error('sale_items error:', siErr);

    const productIds = [...new Set((saleItems ?? []).map((si: any) => si.product_id))];

    let productMap: Record<string, { buy_price: number; category_id: string }> = {};
    if (productIds.length > 0) {
      const { data: products, error: prodErr } = await supabase
        .from('products')
        .select('id, buy_price, category_id')
        .in('id', productIds);
      if (prodErr) console.error('products error:', prodErr);
      for (const p of (products ?? [])) {
        productMap[p.id] = { buy_price: Number(p.buy_price ?? 0), category_id: p.category_id };
      }
    }

    // Get categories
    const catIds = [...new Set(Object.values(productMap).map(p => p.category_id).filter(Boolean))];
    let catMap: Record<string, string> = {};
    if (catIds.length > 0) {
      const { data: cats } = await supabase
        .from('product_categories')
        .select('id, name')
        .in('id', catIds);
      for (const c of (cats ?? [])) catMap[c.id] = c.name;
    }

    // Build a map of sale_id -> sale total for omzet by category
    const saleAmountMap: Record<string, number> = {};
    for (const s of (salesData ?? [])) saleAmountMap[s.id] = Number(s.total_amount ?? 0);

    for (const si of (saleItems ?? [])) {
      const prod = productMap[si.product_id];
      if (!prod) continue;
      const itemHpp   = Number(si.quantity ?? 0) * prod.buy_price;
      const itemOmzet = Number(si.quantity ?? 0) * Number(si.unit_price ?? 0);
      cogs += itemHpp;

      const catName = catMap[prod.category_id] ?? 'Lainnya';
      if (!marginMap[catName]) marginMap[catName] = { omzet: 0, hpp: 0, kategori: catName };
      marginMap[catName].omzet += itemOmzet;
      marginMap[catName].hpp   += itemHpp;
    }
  }

  // 3. Beban Operasional
  const { data: opexData, error: opexErr } = await supabase
    .from('cash_flow')
    .select('amount')
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .eq('direction', 'out')
    .eq('category', 'beban_operasional');
  if (opexErr) console.error('opex error:', opexErr);

  const opex = (opexData ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const grossProfit  = grossSales - cogs;
  const estimatedShu = grossProfit - opex;
  const marginPct    = grossSales > 0 ? (estimatedShu / grossSales) * 100 : 0;

  const marginPerKategori: MarginKategori[] = Object.values(marginMap).map(m => ({
    kategori: m.kategori,
    omzet: m.omzet,
    hpp: m.hpp,
    laba_kotor: m.omzet - m.hpp,
    gross_margin_pct: m.omzet > 0 ? ((m.omzet - m.hpp) / m.omzet) * 100 : 0,
  }));

  return { grossSales, cogs, grossProfit, opex, estimatedShu, marginPercentage: marginPct, marginPerKategori };
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function LaporanKeuangan() {
  const [activeTab, setActiveTab] = useState<'cashflow' | 'shu'>('cashflow');
  const [startDate, setStartDate] = useState(startOfMonth);
  const [endDate, setEndDate]     = useState(todayStr);
  const [unit, setUnit]           = useState('all');
  const [loading, setLoading]     = useState(false);

  const [cashFlowData, setCashFlowData] = useState<CashFlowData | null>(null);
  const [shuData, setShuData]           = useState<ShuEstimationData | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cf, shu] = await Promise.all([
        getCashFlowReport(startDate, endDate, unit),
        getShuEstimation(startDate, endDate),
      ]);
      setCashFlowData(cf);
      setShuData(shu);
    } catch (e) {
      console.error('fetchData error:', e);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, unit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Quick preset handlers
  const applyPreset = (preset: 'today' | 'thisMonth' | 'year2026') => {
    const d = new Date();
    if (preset === 'today') {
      setStartDate(todayStr); setEndDate(todayStr);
    } else if (preset === 'thisMonth') {
      setStartDate(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
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
        wsCf.addRow(['LAPORAN ARUS KAS SIMKOP']);
        wsCf.addRow([`Periode: ${startDate} s/d ${endDate}`]);
        wsCf.addRow([]);
        wsCf.addRow(['Tanggal','Referensi','Deskripsi','Kategori','Unit','Kas Masuk','Kas Keluar','Saldo Berjalan']);
        for (const t of cashFlowData.transactions) {
          wsCf.addRow([t.tanggal, t.referensi, t.deskripsi, t.kategori, t.unit_usaha, t.kas_masuk, t.kas_keluar, t.saldo_berjalan]);
        }
        wsCf.addRow(['','','','','TOTAL', cashFlowData.inflowTotal, cashFlowData.outflowTotal, cashFlowData.netCashflow]);
      }

      if (shuData) {
        const wsShu = wb.addWorksheet('Estimasi SHU');
        wsShu.addRow(['LAPORAN ESTIMASI SHU SIMKOP']);
        wsShu.addRow([`Periode: ${startDate} s/d ${endDate}`]);
        wsShu.addRow([]);
        wsShu.addRow(['Komponen','Jumlah (Rp)']);
        wsShu.addRow(['Total Omzet Penjualan', shuData.grossSales]);
        wsShu.addRow(['HPP / Modal Barang', shuData.cogs]);
        wsShu.addRow(['Laba Kotor', shuData.grossProfit]);
        wsShu.addRow(['Beban Operasional', shuData.opex]);
        wsShu.addRow(['Estimasi SHU Bersih', shuData.estimatedShu]);
        wsShu.addRow([]);
        wsShu.addRow(['Kategori Produk','Omzet','HPP','Laba Kotor','Gross Margin %']);
        for (const m of shuData.marginPerKategori) {
          wsShu.addRow([m.kategori, m.omzet, m.hpp, m.laba_kotor, m.gross_margin_pct.toFixed(1) + '%']);
        }
      }

      const buf  = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `laporan-keuangan-${startDate}-${endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Excel export error:', e);
      alert('Gagal export Excel. Pastikan exceljs terinstall: npm install exceljs');
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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary" style={{ fontFamily: "'IBM Plex Serif', serif" }}>
              Laporan Keuangan Terpadu
            </h1>
            <p className="text-body-md text-on-surface-variant mt-0.5">
              Ringkasan arus kas dan estimasi SHU berjalan koperasi
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[12px] font-semibold border border-primary/20 no-print">
            <span className="material-symbols-outlined text-[16px]">event</span>
            Periode Fiskal: Tahun Buku 2026
          </span>
        </div>
      </div>

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
              {[['today','Hari Ini'],['thisMonth','Bulan Ini'],['year2026','Tahun 2026']] .map(([p,l]) => (
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
              onClick={fetchData}
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
          { key: 'cashflow', label: 'Arus Kas (Cash Flow)',     icon: 'account_balance_wallet' },
          { key: 'shu',      label: 'Estimasi SHU Berjalan',   icon: 'trending_up' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Kas Masuk */}
            <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 rounded-t-xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-emerald-700">Total Kas Masuk</p>
                  <p className="text-2xl font-bold text-emerald-800 mt-1 tabular-nums" style={{ fontFamily: "'IBM Plex Serif', serif" }}>
                    {formatRp(cashFlowData?.inflowTotal ?? 0)}
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
                    {formatRp(cashFlowData?.outflowTotal ?? 0)}
                  </p>
                  <p className="text-[12px] text-rose-600 mt-1">Pencairan & restock toko</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-rose-600" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
                </div>
              </div>
            </div>

            {/* Saldo Bersih */}
            <div className="bg-white rounded-xl border border-indigo-200 p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-indigo-700">Saldo Kas Bersih Brankas</p>
                  <p className={`text-2xl font-bold mt-1 tabular-nums ${(cashFlowData?.netCashflow ?? 0) >= 0 ? 'text-indigo-800' : 'text-rose-700'}`}
                    style={{ fontFamily: "'IBM Plex Serif', serif" }}>
                    {formatRp(cashFlowData?.netCashflow ?? 0)}
                  </p>
                  <p className="text-[12px] text-indigo-600 mt-1">
                    {(cashFlowData?.netCashflow ?? 0) >= 0 ? '✓ Surplus kas operasional' : '⚠ Defisit kas'}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-indigo-600" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Table */}
          <div className="bg-white rounded-xl border border-outline-variant/30 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">receipt_long</span>
                Mutasi Arus Kas Terperinci
              </h2>
              <span className="text-[12px] text-on-surface-variant">
                {cashFlowData?.transactions.length ?? 0} transaksi
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low border-b border-outline-variant/20">
                  <tr>
                    {['Tanggal','Referensi','Deskripsi','Kategori','Unit','Kas Masuk (Rp)','Kas Keluar (Rp)','Saldo Berjalan (Rp)'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(cashFlowData?.transactions ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-on-surface-variant text-sm">
                        <span className="material-symbols-outlined text-[36px] block mb-2 text-outline">inbox</span>
                        Tidak ada transaksi pada periode ini
                      </td>
                    </tr>
                  ) : (
                    cashFlowData?.transactions.map((t, i) => (
                      <tr key={t.id} className={`border-b border-outline-variant/10 hover:bg-surface-container-low/50 transition-colors ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''}`}>
                        <td className="px-4 py-3 text-on-surface-variant text-[13px] whitespace-nowrap">{t.tanggal}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-on-surface-variant">{t.referensi}</td>
                        <td className="px-4 py-3 text-on-surface max-w-[200px] truncate">{t.deskripsi}</td>
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
                    ))
                  )}
                </tbody>
                {(cashFlowData?.transactions.length ?? 0) > 0 && (
                  <tfoot className="bg-primary/5 border-t-2 border-primary/20">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 font-bold text-primary text-sm">TOTAL</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                        {formatRp(cashFlowData?.inflowTotal ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-700 tabular-nums whitespace-nowrap">
                        {formatRp(cashFlowData?.outflowTotal ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-700 tabular-nums whitespace-nowrap">
                        {formatRp(cashFlowData?.netCashflow ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total Omzet', value: shuData.grossSales,  color: 'blue',   icon: 'storefront',    sub: 'Pendapatan kotor penjualan' },
              { label: 'HPP / Modal', value: shuData.cogs,        color: 'orange', icon: 'inventory_2',   sub: 'SUM(qty × buy_price)' },
              { label: 'Laba Kotor',  value: shuData.grossProfit, color: 'emerald',icon: 'trending_up',   sub: 'Omzet − HPP' },
              { label: 'Beban Operasional', value: shuData.opex,  color: 'rose',   icon: 'payments',      sub: 'Listrik, gaji, depresiasi' },
              { label: 'Estimasi SHU Bersih', value: shuData.estimatedShu, color: 'purple', icon: 'stars', sub: `Margin ${shuData.marginPercentage.toFixed(1)}%` },
            ].map((m, i) => {
              const cMap: Record<string, { border: string; bg: string; text: string; accent: string; badge: string }> = {
                blue:   { border: 'border-blue-200',   bg: 'bg-blue-50',   text: 'text-blue-800',   accent: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-800' },
                orange: { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-800', accent: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800' },
                emerald:{ border: 'border-emerald-200',bg: 'bg-emerald-50',text: 'text-emerald-800',accent: 'bg-emerald-500',badge: 'bg-emerald-100 text-emerald-800' },
                rose:   { border: 'border-rose-200',   bg: 'bg-rose-50',   text: 'text-rose-800',   accent: 'bg-rose-500',   badge: 'bg-rose-100 text-rose-800' },
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

          {/* Margin per Kategori Table */}
          <div className="bg-white rounded-xl border border-outline-variant/30 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/20">
              <h2 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">bar_chart</span>
                Rincian Margin Laba per Kategori Produk
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low border-b border-outline-variant/20">
                  <tr>
                    {['Kategori Produk','Omzet (Rp)','HPP (Rp)','Laba Kotor (Rp)','Gross Margin %'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shuData.marginPerKategori.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-on-surface-variant text-sm">
                        Tidak ada data margin pada periode ini
                      </td>
                    </tr>
                  ) : (
                    shuData.marginPerKategori.map((m, i) => (
                      <tr key={i} className={`border-b border-outline-variant/10 hover:bg-surface-container-low/50 ${i % 2 === 1 ? 'bg-[#f8fafc]' : ''}`}>
                        <td className="px-4 py-3 font-semibold text-on-surface">{m.kategori}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-blue-700 font-semibold">{formatRp(m.omzet)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-orange-700 font-semibold">{formatRp(m.hpp)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-semibold">{formatRp(m.laba_kotor)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold ${
                            m.gross_margin_pct >= 20 ? 'bg-emerald-100 text-emerald-800' :
                            m.gross_margin_pct >= 10 ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {m.gross_margin_pct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
    </AdminLayout>
  );
}

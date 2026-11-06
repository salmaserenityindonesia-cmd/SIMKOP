import React, { useState, useEffect, useMemo, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  CreditCard,
  Receipt,
  FileSpreadsheet,
  Printer,
  RotateCw,
  Search,
  Filter,
  ShoppingCart,
  Users,
  Coins,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Loader2,
  Calendar,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Clock,
  Plus
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { useFeedback } from '../../context/FeedbackContext';
import {
  getStoreCreditSummary,
  getStoreCreditLedger,
  exportStoreCreditToExcel,
  StoreCreditSummary,
  StoreCreditLedgerItem,
  StoreCreditFilter
} from '../../services/storeCreditLedgerService';
import { getSaleDetailByInvoice, SaleDetail } from '../../services/shoppingSavingsLedgerService';
import { supabase } from '../../lib/supabaseClient';
import BayarBonModal from '../../components/pos/BayarBonModal';

interface MemberOption {
  id: string;
  nama: string;
  nrp: string;
}

const getInitialMonthRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    startDate: formatYMD(firstDay),
    endDate: formatYMD(lastDay)
  };
};

export default function BukuBesarBonToko() {
  const { showToast } = useFeedback();

  // Summary State
  const [summary, setSummary] = useState<StoreCreditSummary>({
    totalCreditSales: 0,
    totalPaid: 0,
    outstandingDebt: 0,
    activeDebtorCount: 0,
    totalTransactions: 0
  });

  // Master Data & Filter States
  const defaultMonthRange = getInitialMonthRange();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ledger Items & Loading States
  const [ledgerItems, setLedgerItems] = useState<StoreCreditLedgerItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Modal Detail Struk POS State
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<SaleDetail | null>(null);
  const [isLoadingSaleDetail, setIsLoadingSaleDetail] = useState<boolean>(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);

  // Modal Pembayaran Bon State
  const [isPayModalOpen, setIsPayModalOpen] = useState<boolean>(false);
  const [payTargetMember, setPayTargetMember] = useState<{
    id?: string;
    name?: string;
    saleId?: string;
    debt?: number;
    receiptNo?: string;
  } | null>(null);

  // Ref untuk Cetak
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Load members on mount
  useEffect(() => {
    fetchMembers();
  }, []);

  // Fetch ledger data whenever filters change
  useEffect(() => {
    loadLedgerData();
  }, [selectedMemberId, statusFilter, startDate, endDate]);

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('anggota')
        .select('id, nama, nrp')
        .order('nama', { ascending: true });

      if (error) {
        console.warn('Gagal memuat daftar anggota:', error.message);
        return;
      }

      setMembers(
        (data || []).map((m: any) => ({
          id: m.id,
          nama: m.nama || 'Tanpa Nama',
          nrp: m.nrp || '-'
        }))
      );
    } catch (err: any) {
      console.warn('Exception fetchMembers:', err?.message || err);
    }
  };

  const loadLedgerData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Global Summary
      const summaryData = await getStoreCreditSummary();
      setSummary(summaryData);

      // 2. Fetch Filtered Ledger
      const filterPayload: StoreCreditFilter = {
        memberId: selectedMemberId !== 'all' ? selectedMemberId : undefined,
        statusFilter: statusFilter,
        startDate: startDate ? startDate : undefined,
        endDate: endDate ? endDate : undefined,
        searchQuery: searchQuery
      };

      const result = await getStoreCreditLedger(filterPayload);
      setLedgerItems(result.items);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Gagal memuat buku besar bon toko:', err);
      showToast('Gagal memuat buku besar bon toko', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Client-side text search filtering
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return ledgerItems;
    const q = searchQuery.toLowerCase().trim();
    return ledgerItems.filter(item => {
      return (
        item.member_name.toLowerCase().includes(q) ||
        item.member_nrp.toLowerCase().includes(q) ||
        item.reference_no.toLowerCase().includes(q) ||
        (item.notes && item.notes.toLowerCase().includes(q)) ||
        (item.cashier_name && item.cashier_name.toLowerCase().includes(q))
      );
    });
  }, [ledgerItems, searchQuery]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Aggregate totals for visible filtered items
  const aggregatedTotals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    filteredItems.forEach(item => {
      totalDebit += item.debit;
      totalCredit += item.credit;
    });
    return {
      totalDebit,
      totalCredit,
      netOutstanding: Math.max(0, totalDebit - totalCredit)
    };
  }, [filteredItems]);

  // Handle Export Excel
  const handleExportExcel = async () => {
    if (filteredItems.length === 0) {
      showToast('Tidak ada data mutasi piutang untuk diekspor', 'warning');
      return;
    }

    setIsExporting(true);
    try {
      const selectedMember = members.find(m => m.id === selectedMemberId);
      const memberName = selectedMember
        ? `${selectedMember.nama} (${selectedMember.nrp})`
        : 'Semua Anggota';

      let statusLabel = 'Semua Status';
      if (statusFilter === 'UNPAID') statusLabel = 'Belum Lunas / Sebagian';
      if (statusFilter === 'PAID') statusLabel = 'Hanya Lunas';

      await exportStoreCreditToExcel(filteredItems, {
        memberName,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        statusLabel
      });

      showToast('Buku besar bon toko berhasil diekspor ke Excel', 'success');
    } catch (err: any) {
      console.error('Gagal ekspor Excel:', err);
      showToast('Terjadi kesalahan saat mengekspor ke Excel', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  // Handle click on POS Receipt
  const handleOpenReceipt = async (invoiceNo: string) => {
    setIsReceiptModalOpen(true);
    setIsLoadingSaleDetail(true);
    setSelectedSaleDetail(null);
    try {
      const detail = await getSaleDetailByInvoice(invoiceNo);
      if (detail) {
        setSelectedSaleDetail(detail);
      } else {
        showToast('Data rincian struk tidak ditemukan', 'warning');
      }
    } catch (err: any) {
      console.error('Error fetching sale detail:', err);
      showToast('Gagal memuat rincian struk POS', 'error');
    } finally {
      setIsLoadingSaleDetail(false);
    }
  };

  // Open Payment Modal for Row
  const handleOpenPayForRow = (item: StoreCreditLedgerItem) => {
    setPayTargetMember({
      id: item.member_id,
      name: `${item.member_name} (${item.member_nrp})`,
      saleId: item.sale_id,
      debt: item.running_debt,
      receiptNo: item.reference_no
    });
    setIsPayModalOpen(true);
  };

  // Open Generic Payment Modal
  const handleOpenGenericPay = () => {
    setPayTargetMember(null);
    setIsPayModalOpen(true);
  };

  // Quick Date Helpers
  const handleSetToday = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;
    setStartDate(today);
    setEndDate(today);
  };

  const handleSetThisMonth = () => {
    const range = getInitialMonthRange();
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleShowAll = () => {
    setSelectedMemberId('all');
    setStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
  };

  const handleResetFilters = () => {
    setSelectedMemberId('all');
    setStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto print:p-0 print:m-0">
        {/* ========================================================
            HEADER HALAMAN
        ======================================================== */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5 print:hidden">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-800 rounded-xl shadow-sm">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                  Buku Besar Bon Toko (Piutang Kasir)
                </h1>
                <p className="text-sm text-gray-500">
                  Monitoring belanja bon retail anggota, riwayat pelunasan, dan rekapitulasi siap potong gaji dinas
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleOpenGenericPay}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Pelunasan Bon</span>
            </button>

            <button
              onClick={loadLedgerData}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
              title="Muat ulang data"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={isLoading || filteredItems.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              <Printer className="w-4 h-4 text-gray-600" />
              <span>Cetak Rekening Bon</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isExporting || isLoading || filteredItems.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition-colors disabled:opacity-60"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>Ekspor Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* ========================================================
            PRINT ONLY HEADER (Hanya muncul saat cetak kertas)
        ======================================================== */}
        <div className="hidden print:block mb-6 border-b-2 border-gray-800 pb-4">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold uppercase tracking-wider text-black">
              Koperasi Pegawai Republik Indonesia (KPRI)
            </h2>
            <h3 className="text-lg font-semibold text-gray-800">
              BUKU BESAR PEMBANTU PIUTANG BON TOKO (STORE CREDIT)
            </h3>
            <p className="text-xs text-gray-600">
              Dicetak pada: {new Date().toLocaleString('id-ID')} | Filter Anggota: {selectedMemberId !== 'all' ? members.find(m => m.id === selectedMemberId)?.nama : 'Semua Anggota'}
            </p>
          </div>
        </div>

        {/* ========================================================
            TOP KPI CARDS (Metrik Ringkasan Piutang Bon)
        ======================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
          {/* Card 1: Total Sisa Piutang Tertunggak */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Sisa Piutang Bon Belum Lunas
              </span>
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-rose-700">
                {formatCurrency(summary.outstandingDebt)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Total piutang bon yang siap dipotong gaji
              </p>
            </div>
          </div>

          {/* Card 2: Realisasi Pelunasan Masuk */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Realisasi Pelunasan Masuk
              </span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-emerald-700">
                {formatCurrency(summary.totalPaid)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Akumulasi cicilan & pelunasan diterima
              </p>
            </div>
          </div>

          {/* Card 3: Total Belanja Bon Kumulatif */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Belanja Bon Kumulatif
              </span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <ShoppingCart className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(summary.totalCreditSales)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Akumulasi seluruh belanja bon POS kasir
              </p>
            </div>
          </div>

          {/* Card 4: Anggota Berutang Aktif */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Anggota Berutang Aktif
              </span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-indigo-900">
                {summary.activeDebtorCount} <span className="text-sm font-normal text-gray-500">Anggota</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {summary.totalTransactions} transaksi bon & pelunasan
              </p>
            </div>
          </div>
        </div>

        {/* ========================================================
            FILTER & SEARCH BAR
        ======================================================== */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 space-y-4 print:hidden">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Filter className="w-4 h-4 text-rose-600" />
            <span>Filter Mutasi Piutang Bon Toko</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Filter 1: Pilih Anggota */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Pilih Anggota
              </label>
              <select
                value={selectedMemberId}
                onChange={e => setSelectedMemberId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              >
                <option value="all">Semua Anggota</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.nama} ({m.nrp})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 2: Status Pelunasan */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Status Tagihan
              </label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              >
                <option value="ALL">Semua Status Tagihan</option>
                <option value="UNPAID">Belum Lunas / Tertunggak</option>
                <option value="PAID">Hanya Tagihan Lunas</option>
              </select>
            </div>

            {/* Filter 3: Tanggal Mulai */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tanggal Mulai
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            {/* Filter 4: Tanggal Selesai */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tanggal Selesai
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>
          </div>

          {/* Quick Date Presets & Text Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Rentang Cepat:</span>
              <button
                type="button"
                onClick={handleSetToday}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={handleSetThisMonth}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={handleShowAll}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Semua Riwayat
              </button>
              {(selectedMemberId !== 'all' || statusFilter !== 'ALL' || startDate || endDate || searchQuery) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors ml-1"
                >
                  Reset Filter
                </button>
              )}
            </div>

            {/* Search Box */}
            <div className="relative sm:w-80">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama, NRP, no. struk, bukti bayar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================
            TABEL BUKU BESAR MUTASI PIUTANG
        ======================================================== */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" ref={printAreaRef}>
          {/* Table Header Info */}
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Mutasi Piutang Bon Retail Toko
              </h2>
              <p className="text-xs text-gray-500">
                Menampilkan {filteredItems.length} transaksi bon & pelunasan
                {selectedMemberId !== 'all' && (
                  <span className="font-medium text-rose-700 ml-1">
                    (Anggota: {members.find(m => m.id === selectedMemberId)?.nama})
                  </span>
                )}
              </p>
            </div>

            {/* Subtotal ringkasan baris terfilter */}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-600">
                Tambah Utang (+): <strong className="text-rose-700">{formatCurrency(aggregatedTotals.totalDebit)}</strong>
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600">
                Pelunasan (-): <strong className="text-emerald-700">{formatCurrency(aggregatedTotals.totalCredit)}</strong>
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600">
                Sisa Piutang: <strong className="text-rose-900 font-bold">{formatCurrency(aggregatedTotals.netOutstanding)}</strong>
              </span>
            </div>
          </div>

          {/* Table Body */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 border-collapse">
              <thead className="bg-gray-100/75 text-gray-700 font-semibold text-xs uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-3 text-center w-12">No</th>
                  <th scope="col" className="px-4 py-3 whitespace-nowrap">Tanggal & Jam</th>
                  <th scope="col" className="px-4 py-3">Anggota</th>
                  <th scope="col" className="px-4 py-3 text-center">Jenis Mutasi</th>
                  <th scope="col" className="px-4 py-3">No. Bukti / Struk</th>
                  <th scope="col" className="px-4 py-3">Kasir / Petugas</th>
                  <th scope="col" className="px-4 py-3 text-right">Tambah Utang (+)</th>
                  <th scope="col" className="px-4 py-3 text-right">Pelunasan (-)</th>
                  <th scope="col" className="px-4 py-3 text-right">Sisa Utang Anggota</th>
                  <th scope="col" className="px-4 py-3 text-center">Status</th>
                  <th scope="col" className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
                        <span className="text-sm font-medium">Memuat mutasi buku besar bon toko...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                        <div className="p-3 bg-gray-100 rounded-full text-gray-400">
                          <AlertCircle className="w-8 h-8" />
                        </div>
                        <span className="text-base font-semibold text-gray-800">
                          Tidak Ada Transaksi Bon Ditemukan
                        </span>
                        <p className="text-xs text-gray-500">
                          Tidak ada mutasi belanja bon toko yang sesuai dengan filter atau pencarian Anda.
                        </p>
                        <button
                          onClick={handleShowAll}
                          className="mt-2 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                        >
                          Tampilkan Semua Riwayat
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, idx) => {
                    const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                    const isSale = item.source_type === 'sale';

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50/75 transition-colors text-xs sm:text-sm"
                      >
                        {/* No */}
                        <td className="px-4 py-3.5 text-center text-gray-500 font-medium">
                          {rowNumber}
                        </td>

                        {/* Tanggal & Jam */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-900">
                          <div className="font-medium">
                            {new Date(item.date).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(item.date).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })} WIB
                          </div>
                        </td>

                        {/* Anggota (NRP & Nama) */}
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-gray-900">
                            {item.member_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            NRP: {item.member_nrp} {item.member_pangkat ? `| ${item.member_pangkat}` : ''}
                          </div>
                        </td>

                        {/* Jenis Mutasi Badge */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {isSale ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <ShoppingCart className="w-3 h-3 text-rose-600" />
                              Belanja Bon POS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Pelunasan Bon
                            </span>
                          )}
                        </td>

                        {/* No. Bukti / Struk Kasir */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isSale ? (
                            <button
                              type="button"
                              onClick={() => handleOpenReceipt(item.reference_no)}
                              className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 text-rose-800 hover:bg-rose-100 hover:text-rose-900 border border-rose-200 transition-colors text-xs font-medium cursor-pointer"
                              title="Klik untuk melihat rincian barang belanjaan"
                            >
                              <Receipt className="w-3.5 h-3.5 text-rose-600 group-hover:scale-110 transition-transform" />
                              <span className="underline decoration-rose-300 underline-offset-2">
                                {item.reference_no}
                              </span>
                              <Eye className="w-3 h-3 text-rose-500 opacity-60 group-hover:opacity-100" />
                            </button>
                          ) : (
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-gray-800 font-mono">
                                {item.reference_no}
                              </span>
                              <span className="text-[11px] text-gray-500 truncate max-w-[160px]" title={item.notes}>
                                {item.notes}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Kasir / Petugas */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-700">
                          {item.cashier_name || 'Kasir Toko'}
                        </td>

                        {/* Tambah Utang (Debet) */}
                        <td className="px-4 py-3.5 text-right font-semibold text-rose-700 whitespace-nowrap">
                          {item.debit > 0 ? `+${formatCurrency(item.debit)}` : '-'}
                        </td>

                        {/* Pelunasan (Kredit) */}
                        <td className="px-4 py-3.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {item.credit > 0 ? `-${formatCurrency(item.credit)}` : '-'}
                        </td>

                        {/* Sisa Saldo Utang Anggota */}
                        <td className="px-4 py-3.5 text-right font-bold text-gray-900 whitespace-nowrap bg-gray-50/50">
                          {formatCurrency(item.running_debt)}
                        </td>

                        {/* Status Tagihan */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {item.status === 'PAID' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                              <CheckCircle2 className="w-3 h-3 text-green-600" />
                              LUNAS
                            </span>
                          ) : item.status === 'PARTIAL' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              SEBAGIAN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              BELUM LUNAS
                            </span>
                          )}
                        </td>

                        {/* Aksi Bayar */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap print:hidden">
                          {item.running_debt > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleOpenPayForRow(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                              title="Bayar cicilan / lunasi sisa bon anggota ini"
                            >
                              <Coins className="w-3.5 h-3.5 text-rose-600" />
                              <span>Bayar</span>
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 font-medium">Lunas</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Table Footer: Total Akuntansi */}
              {filteredItems.length > 0 && !isLoading && (
                <tfoot className="bg-gray-100 font-semibold text-gray-900 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right uppercase text-xs tracking-wider">
                      Total Periode Ini:
                    </td>
                    <td className="px-4 py-3 text-right text-rose-700 text-sm">
                      {formatCurrency(aggregatedTotals.totalDebit)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700 text-sm">
                      {formatCurrency(aggregatedTotals.totalCredit)}
                    </td>
                    <td className="px-4 py-3 text-right text-rose-900 text-sm font-bold bg-rose-50/50">
                      {formatCurrency(aggregatedTotals.netOutstanding)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr className="bg-rose-50/40 text-xs text-gray-600 border-t border-gray-200">
                    <td colSpan={11} className="px-4 py-2 text-right">
                      <span className="text-gray-500 mr-2">Rekapitulasi Piutang:</span>
                      <span>Total Tambah Bon: <strong className="text-rose-700">{formatCurrency(aggregatedTotals.totalDebit)}</strong></span>
                      <span className="mx-2 text-gray-300">|</span>
                      <span>Total Pelunasan Masuk: <strong className="text-emerald-700">{formatCurrency(aggregatedTotals.totalCredit)}</strong></span>
                      <span className="mx-2 text-gray-300">|</span>
                      <span>Sisa Piutang Mengendap: <strong className="text-rose-900">{formatCurrency(aggregatedTotals.netOutstanding)}</strong></span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredItems.length > 0 && (
            <div className="px-5 py-3.5 border-t border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 print:hidden">
              <div className="flex items-center gap-2">
                <span>Tampilkan</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 bg-white text-gray-900 focus:ring-1 focus:ring-rose-500"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>baris per halaman (Total {filteredItems.length} transaksi)</span>
              </div>

              <div className="flex items-center gap-2">
                <span>
                  Halaman {currentPage} dari {totalPages}
                </span>
                <div className="inline-flex rounded-md shadow-sm">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 border border-gray-300 rounded-l-md bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 border-t border-b border-r border-gray-300 rounded-r-md bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================
            MODAL RINCIAN STRUK KASIR POS
        ======================================================== */}
        {isReceiptModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200">
              <div className="px-6 py-4 bg-rose-800 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-rose-700/60 rounded-lg">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Rincian Struk Pembelian Bon</h3>
                    <p className="text-xs text-rose-200">Bukti Transaksi Belanja Bon Toko</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="text-rose-200 hover:text-white p-1 rounded-lg hover:bg-rose-700/50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
                {isLoadingSaleDetail ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-500">
                    <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
                    <span className="text-sm font-medium">Memuat data struk kasir...</span>
                  </div>
                ) : !selectedSaleDetail ? (
                  <div className="py-8 text-center text-gray-500">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm">Rincian struk kasir tidak ditemukan di database.</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-gray-500">No. Struk Kasir:</span>
                        <span className="font-bold text-gray-900">{selectedSaleDetail.sale_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Waktu Transaksi:</span>
                        <span className="text-gray-900">
                          {new Date(selectedSaleDetail.created_at).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Pembeli (Anggota):</span>
                        <span className="font-semibold text-rose-800">
                          {selectedSaleDetail.member_name} ({selectedSaleDetail.member_nrp || '-'})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Petugas Kasir:</span>
                        <span className="text-gray-900">{selectedSaleDetail.cashier_name}</span>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                        Daftar Barang Belanjaan
                      </h4>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-100 text-gray-700 font-semibold border-b border-gray-200">
                            <tr>
                              <th className="px-3 py-2">Nama Barang</th>
                              <th className="px-2 py-2 text-center w-14">Qty</th>
                              <th className="px-3 py-2 text-right">Harga</th>
                              <th className="px-3 py-2 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedSaleDetail.items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium text-gray-900">
                                  {item.product_name}
                                </td>
                                <td className="px-2 py-2 text-center text-gray-600">
                                  {item.quantity}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600">
                                  {formatCurrency(item.unit_price)}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                  {formatCurrency(item.subtotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-rose-50/60 p-4 rounded-xl border border-rose-200/60 space-y-2 text-xs">
                      <div className="flex justify-between text-gray-600">
                        <span>Total Belanja:</span>
                        <span className="font-semibold">{formatCurrency(selectedSaleDetail.total_amount)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-rose-800 text-sm pt-2 border-t border-rose-200">
                        <span>Dibayar dengan Bon Toko:</span>
                        <span>{formatCurrency(selectedSaleDetail.paid_credit)}</span>
                      </div>
                      {selectedSaleDetail.paid_cash > 0 && (
                        <div className="flex justify-between text-emerald-700 font-medium">
                          <span>Dibayar Tunai Kasir:</span>
                          <span>{formatCurrency(selectedSaleDetail.paid_cash)}</span>
                        </div>
                      )}
                      {selectedSaleDetail.paid_deposit > 0 && (
                        <div className="flex justify-between text-blue-700 font-medium">
                          <span>Potong Simpanan Belanja:</span>
                          <span>{formatCurrency(selectedSaleDetail.paid_deposit)}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL PELUNASAN BON TOKO (BayarBonModal)
        ======================================================== */}
        <BayarBonModal
          isOpen={isPayModalOpen}
          onClose={() => {
            setIsPayModalOpen(false);
            setPayTargetMember(null);
          }}
          onSuccess={() => {
            loadLedgerData();
          }}
          initialMemberId={payTargetMember?.id}
          initialMemberName={payTargetMember?.name}
          initialSaleId={payTargetMember?.saleId}
          initialDebtAmount={payTargetMember?.debt}
          initialReceiptNo={payTargetMember?.receiptNo}
        />
      </div>
    </AdminLayout>
  );
}


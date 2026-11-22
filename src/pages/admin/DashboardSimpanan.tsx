import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  getAggregateSavingsBills,
  paySavingsBillArrears,
  formatShortPeriod,
  SavingsAggregateBillRow,
  SavingsBillingDataset,
  SavingsBillingStatus,
} from '../../services/savingsBillingService';
import { FULL_MONTH_NAMES } from '../../services/setoranService';
import {
  Search,
  Loader2,
  Download,
  FileText,
  Plus,
  ArrowUpDown,
  AlertCircle,
  Users,
  Wallet,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { exportToExcel, exportToPDF } from '../../lib/exportUtils';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatTanggalLahirWithAge } from '../../utils/dateUtils';
import { useFeedback } from '../../context/FeedbackContext';

export type BillingStatusFilter = 'UNPAID_ONLY' | 'ALL' | 'PAID_ONLY';

export interface BillingSummaryStats {
  totalRemainingArrears: number;
  totalCurrentMonthRemaining: number;
  totalPreviousArrears: number;
  delinquentMembersCount: number;
  unpaidItemsCount: number;
  paidItemsCount: number;
  collectedCurrentPeriod: number;
}

export interface FilteredBillsResult {
  baseRows: SavingsAggregateBillRow[];
  filteredRows: SavingsAggregateBillRow[];
  summary: BillingSummaryStats;
}

export interface DashboardSimpananProps {
  initialDataset?: SavingsBillingDataset | null;
  initialStatusFilter?: BillingStatusFilter;
  initialDepositTypeFilter?: string;
  initialTargetMonth?: number;
  initialTargetYear?: number;
}

export function formatBillStatusLabel(row: SavingsAggregateBillRow): string {
  switch (row.status) {
    case 'LUNAS':
      return 'Lunas';
    case 'PARSIAL':
      return row.unpaidMonthsCount > 1 ? `Parsial (${row.unpaidMonthsCount} Bln)` : 'Parsial';
    case 'BELUM_BAYAR':
      return 'Belum Bayar';
    case 'MENUNGGAK':
    default:
      return row.isPokok ? 'Belum Lunas' : `Menunggak (${row.unpaidMonthsCount} Bln)`;
  }
}

function getStatusBadgeClass(status: SavingsBillingStatus): string {
  switch (status) {
    case 'LUNAS':
      return 'bg-emerald-100 text-emerald-700';
    case 'PARSIAL':
      return 'bg-amber-100 text-amber-800';
    case 'BELUM_BAYAR':
      return 'bg-red-100 text-red-700';
    case 'MENUNGGAK':
    default:
      return 'bg-rose-100 text-rose-700';
  }
}

export function filterAndSummarizeBills(
  rows: SavingsAggregateBillRow[],
  options: {
    search?: string;
    depositTypeFilter?: string;
    statusFilter?: BillingStatusFilter;
    sortConfig?: { key: string; direction: 'asc' | 'desc' } | null;
  } = {}
): FilteredBillsResult {
  const searchTerm = (options.search || '').trim().toLowerCase();
  const depositTypeFilter = options.depositTypeFilter || 'ALL';
  const statusFilter: BillingStatusFilter = options.statusFilter || 'UNPAID_ONLY';
  const sortConfig = options.sortConfig || null;

  const baseRows = rows.filter((r) => {
    if (depositTypeFilter !== 'ALL' && r.deposit_code !== depositTypeFilter) {
      return false;
    }
    if (!searchTerm) return true;
    const nama = (r.anggota?.nama || '').toLowerCase();
    const nrp = (r.anggota?.nrp || '').toLowerCase();
    const depositName = (r.deposit_name || '').toLowerCase();
    const unpaidList = (r.unpaidMonthsFullList || '').toLowerCase();
    return (
      nama.includes(searchTerm) ||
      nrp.includes(searchTerm) ||
      depositName.includes(searchTerm) ||
      unpaidList.includes(searchTerm)
    );
  });

  let totalRemainingArrears = 0;
  let totalCurrentMonthRemaining = 0;
  let totalPreviousArrears = 0;
  let unpaidItemsCount = 0;
  let paidItemsCount = 0;
  let collectedCurrentPeriod = 0;
  const delinquentMemberIds = new Set<string>();

  for (const r of baseRows) {
    collectedCurrentPeriod += Number(r.currentMonthPaid || 0);
    if (r.remainingArrears > 0) {
      totalRemainingArrears += r.remainingArrears;
      totalCurrentMonthRemaining += r.currentMonthRemaining;
      totalPreviousArrears += r.previousArrearsAmount;
      unpaidItemsCount += 1;
      delinquentMemberIds.add(r.member_id);
    } else {
      paidItemsCount += 1;
    }
  }

  let filteredRows = baseRows.filter((r) => {
    if (statusFilter === 'UNPAID_ONLY') return r.remainingArrears > 0;
    if (statusFilter === 'PAID_ONLY') return r.remainingArrears === 0;
    return true;
  });

  if (sortConfig !== null) {
    filteredRows = [...filteredRows].sort((a, b) => {
      let aValue: any = '';
      let bValue: any = '';

      switch (sortConfig.key) {
        case 'anggota':
          aValue = (a.anggota?.nama || '').toLowerCase();
          bValue = (b.anggota?.nama || '').toLowerCase();
          break;
        case 'jenis':
          aValue = a.deposit_name.toLowerCase();
          bValue = b.deposit_name.toLowerCase();
          break;
        case 'tagihan_bulan_ini':
          aValue = a.currentMonthDue;
          bValue = b.currentMonthDue;
          break;
        case 'tunggakan_lalu':
          aValue = a.previousArrearsAmount;
          bValue = b.previousArrearsAmount;
          break;
        case 'sisa_tagihan':
          aValue = a.remainingArrears;
          bValue = b.remainingArrears;
          break;
        case 'status':
          aValue = a.unpaidMonthsCount;
          bValue = b.unpaidMonthsCount;
          break;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  return {
    baseRows,
    filteredRows,
    summary: {
      totalRemainingArrears,
      totalCurrentMonthRemaining,
      totalPreviousArrears,
      delinquentMembersCount: delinquentMemberIds.size,
      unpaidItemsCount,
      paidItemsCount,
      collectedCurrentPeriod,
    },
  };
}

export default function DashboardSimpanan({
  initialDataset = null,
  initialStatusFilter = 'UNPAID_ONLY',
  initialDepositTypeFilter = 'ALL',
  initialTargetMonth,
  initialTargetYear,
}: DashboardSimpananProps = {}) {
  const { showToast } = useFeedback();
  const now = new Date();
  const currentYear = now.getFullYear();

  const [dataset, setDataset] = useState<SavingsBillingDataset | null>(initialDataset);
  const [loading, setLoading] = useState(initialDataset === null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BillingStatusFilter>(initialStatusFilter);
  const [depositTypeFilter, setDepositTypeFilter] = useState<string>(initialDepositTypeFilter);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
    null
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [targetMonth, setTargetMonth] = useState<number>(
    initialTargetMonth ?? now.getMonth() + 1
  );
  const [targetYear, setTargetYear] = useState<number>(initialTargetYear ?? currentYear);

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<SavingsAggregateBillRow | null>(null);
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<string[]>([]);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'tunai' | 'transfer_bank'>('tunai');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (
      initialDataset !== null &&
      targetMonth === (initialTargetMonth ?? now.getMonth() + 1) &&
      targetYear === (initialTargetYear ?? currentYear)
    ) {
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMonth, targetYear]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const result = await getAggregateSavingsBills(targetMonth, targetYear);
      setDataset(result);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat data tagihan simpanan');
    } finally {
      setLoading(false);
    }
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const yearOptions = useMemo(() => {
    const startYear = Math.min(2026, dataset?.cutoffYear ?? 2026);
    const endYear = Math.max(currentYear + 1, targetYear + 1, 2026);
    const list: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      list.push(y);
    }
    if (targetYear < startYear && !list.includes(targetYear)) {
      list.unshift(targetYear);
    }
    return list;
  }, [currentYear, targetYear, dataset?.cutoffYear]);

  const depositTypeOptions = useMemo(() => {
    if (dataset?.availableDepositTypes && dataset.availableDepositTypes.length > 0) {
      return dataset.availableDepositTypes;
    }
    return [
      { code: 'WAJIB', name: 'Simpanan Wajib' },
      { code: 'BELANJA', name: 'Simpanan Belanja' },
      { code: 'LEBARAN', name: 'Simpanan Hari Raya (Lebaran)' },
      { code: 'POKOK', name: 'Simpanan Pokok' },
    ];
  }, [dataset?.availableDepositTypes]);

  const { filteredRows: filteredList, summary } = useMemo(
    () =>
      filterAndSummarizeBills(dataset?.rows || [], {
        search,
        depositTypeFilter,
        statusFilter,
        sortConfig,
      }),
    [dataset?.rows, search, depositTypeFilter, statusFilter, sortConfig]
  );

  // Reset halaman saat filter atau urutan berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, depositTypeFilter, sortConfig, targetMonth, targetYear]);

  const totalFiltered = filteredList.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const paginatedList = filteredList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleOpenPayment = (bill: SavingsAggregateBillRow) => {
    setSelectedBill(bill);
    if (!bill.isPokok && bill.unpaidMonths.length > 0) {
      const allKeys = bill.unpaidMonths.map((m) => `${m.year}-${m.month}`);
      setSelectedMonthKeys(allKeys);
    } else {
      setSelectedMonthKeys([]);
    }
    setPaymentAmount(bill.remainingArrears > 0 ? bill.remainingArrears : 0);
    setPaymentMethod('tunai');
    setReferenceNo('');
    setNotes('');
    setIsPaymentModalOpen(true);
  };

  const applyMonthSelection = (keys: string[], bill: SavingsAggregateBillRow) => {
    setSelectedMonthKeys(keys);
    const keySet = new Set(keys);
    const total = bill.unpaidMonths
      .filter((m) => keySet.has(`${m.year}-${m.month}`))
      .reduce((s, m) => s + m.remaining, 0);
    setPaymentAmount(total > 0 ? total : bill.remainingArrears);
  };

  const toggleMonthKey = (key: string) => {
    if (!selectedBill) return;
    const exists = selectedMonthKeys.includes(key);
    const next = exists
      ? selectedMonthKeys.filter((k) => k !== key)
      : [...selectedMonthKeys, key];
    if (next.length === 0) {
      setSelectedMonthKeys([]);
      setPaymentAmount(0);
      return;
    }
    applyMonthSelection(next, selectedBill);
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;

    if (paymentAmount <= 0) {
      showToast('Nominal pembayaran harus lebih dari Rp 0', 'warning');
      return;
    }

    const selectedMonthsPayload =
      !selectedBill.isPokok && selectedMonthKeys.length > 0
        ? selectedBill.unpaidMonths
            .filter((m) => selectedMonthKeys.includes(`${m.year}-${m.month}`))
            .map((m) => ({ year: m.year, month: m.month }))
        : undefined;

    try {
      setIsSubmitting(true);
      const res = await paySavingsBillArrears({
        bill: selectedBill,
        paymentAmount,
        selectedMonths: selectedMonthsPayload,
        paymentMethod,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setIsPaymentModalOpen(false);
      await loadData();
      showToast(
        `Pembayaran ${formatCurrency(res.totalAllocated)} untuk ${selectedBill.deposit_name} (${res.insertedCount} periode) berhasil dicatat!`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal memproses pembayaran tagihan simpanan', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    const data = filteredList.map((row) => ({
      NRP: row.anggota?.nrp || '-',
      Nama: row.anggota?.nama || '-',
      'Jenis Simpanan': row.deposit_name,
      'Rincian Tunggakan': row.unpaidMonthsFullList || '-',
      'Tagihan Bulan Ini': row.currentMonthDue,
      'Sudah Bayar Bulan Ini': row.currentMonthPaid,
      'Tunggakan Lalu': row.previousArrearsAmount,
      'Total Sisa Tagihan': row.remainingArrears,
      Status: formatBillStatusLabel(row),
    }));
    exportToExcel(data, `Tagihan_Simpanan_${targetMonth}_${targetYear}`);
  };

  const effectiveCutoffMonth = dataset?.cutoffMonth ?? 1;
  const effectiveCutoffYear = dataset?.cutoffYear ?? targetYear;
  const cutoffTitle = `${
    FULL_MONTH_NAMES[effectiveCutoffMonth - 1] || `Bulan ${effectiveCutoffMonth}`
  } ${effectiveCutoffYear}`;
  const periodTitle = `${FULL_MONTH_NAMES[targetMonth - 1] || `Bulan ${targetMonth}`} ${targetYear}`;

  const handleExportPDF = () => {
    const headers = [
      'NRP',
      'Nama',
      'Jenis Simpanan',
      'Rincian',
      'Tagihan Bln Ini',
      'Tunggakan Lalu',
      'Total Sisa',
      'Status',
    ];
    const data = filteredList.map((row) => [
      row.anggota?.nrp || '-',
      row.anggota?.nama || '-',
      row.deposit_name,
      row.remainingArrears > 0 ? row.unpaidMonthsSummary || '-' : 'Lunas',
      formatCurrency(row.currentMonthDue),
      formatCurrency(row.previousArrearsAmount),
      formatCurrency(row.remainingArrears),
      formatBillStatusLabel(row),
    ]);
    exportToPDF(
      headers,
      data,
      `Tagihan_Simpanan_${targetMonth}_${targetYear}`,
      `Tagihan & Agregat Tunggakan Simpanan — Cut-Off ${cutoffTitle} s/d ${periodTitle}`
    );
  };

  const currentMonthSelectedInBill =
    selectedBill && !selectedBill.isPokok
      ? selectedBill.unpaidMonths.find(
          (m) => m.year === targetYear && m.month === targetMonth
        )
      : undefined;

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            Tagihan &amp; Agregat Tunggakan Simpanan
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            Kontrol tagihan berjalan &amp; akumulasi tunggakan per anggota per jenis simpanan (Cut-Off {cutoffTitle} s/d {periodTitle})
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium text-sm transition-colors"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* 3 Kartu Ringkasan Tagihan */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-rose-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Total Agregat Tagihan &amp; Tunggakan
            </span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600">
            {formatCurrency(summary.totalRemainingArrears)}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Bulan ini: {formatCurrency(summary.totalCurrentMonthRemaining)} • Tunggakan lalu:{' '}
            {formatCurrency(summary.totalPreviousArrears)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-amber-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Anggota Memiliki Tunggakan
            </span>
            <Users className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">
            {summary.delinquentMembersCount} Anggota
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Dari {dataset?.totalActiveMembersCount ?? 0} anggota aktif ({summary.unpaidItemsCount}{' '}
            item tagihan aktif)
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-emerald-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Terkumpul Periode Terpilih
            </span>
            <Wallet className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">
            {formatCurrency(summary.collectedCurrentPeriod)}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Periode {periodTitle} ({summary.paidItemsCount} item lunas)
          </p>
        </div>
      </div>

      {dataset?.isSelectedPeriodBeforeCutoff && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4 shrink-0" />
          <span>
            Periode yang dipilih berada sebelum batas sah cut-off (<strong>{cutoffTitle}</strong>).
            Simpanan rutin bulanan sebelum cut-off telah dirangkum pada Saldo Awal.
          </span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex flex-wrap justify-between items-center bg-gray-50 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama, NRP, atau bulan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-64 bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter Status Tagihan"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BillingStatusFilter)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white font-medium text-gray-700"
            >
              <option value="UNPAID_ONLY">Belum Lunas / Menunggak</option>
              <option value="ALL">Semua Anggota &amp; Simpanan</option>
              <option value="PAID_ONLY">Sudah Lunas</option>
            </select>

            <select
              aria-label="Filter Jenis Simpanan"
              value={depositTypeFilter}
              onChange={(e) => setDepositTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-700"
            >
              <option value="ALL">Semua Jenis</option>
              {depositTypeOptions.map((dt) => (
                <option key={dt.code} value={dt.code}>
                  {dt.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5 ml-1">
              <label className="text-sm font-medium text-gray-700">Periode:</label>
              <select
                aria-label="Filter Bulan"
                value={targetMonth}
                onChange={(e) => setTargetMonth(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
              >
                {FULL_MONTH_NAMES.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter Tahun"
                value={targetYear}
                onChange={(e) => setTargetYear(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider">
                <th
                  className="py-3 px-4 font-semibold border-b border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('anggota')}
                >
                  <div className="flex items-center gap-1">
                    Anggota <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold border-b border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('jenis')}
                >
                  <div className="flex items-center gap-1">
                    Jenis Simpanan <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold border-b border-gray-200 text-right cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('tagihan_bulan_ini')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Tagihan Bulan Ini <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold border-b border-gray-200 text-right cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('tunggakan_lalu')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Tunggakan Lalu <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold border-b border-gray-200 text-right cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('sisa_tagihan')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total Sisa Tagihan <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 font-semibold border-b border-gray-200 text-center cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Status <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold border-b border-gray-200 text-center">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    <p>Menghitung tagihan &amp; tunggakan s/d {periodTitle}...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-500">
                    {statusFilter === 'UNPAID_ONLY'
                      ? `Tidak ada tunggakan atau tagihan belum lunas hingga ${periodTitle}.`
                      : `Tidak ada data tagihan simpanan yang cocok dengan filter aktif.`}
                  </td>
                </tr>
              ) : (
                paginatedList.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm">
                      <div className="font-semibold text-gray-900">{row.anggota?.nama || '-'}</div>
                      <div className="text-gray-500 text-xs">
                        NRP: {row.anggota?.nrp || '-'}
                        {row.anggota?.tanggal_lahir ? ` • Tgl Lahir: ${formatTanggalLahirWithAge(row.anggota.tanggal_lahir)}` : ''}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-sm">
                      <div className="font-medium text-gray-800">{row.deposit_name}</div>
                      {row.remainingArrears > 0 ? (
                        row.isPokok ? (
                          <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
                            Kewajiban Awal Keanggotaan
                            {row.totalPaidAllUnpaid > 0
                              ? ` • Terbayar ${formatCurrency(row.totalPaidAllUnpaid)}`
                              : ''}
                          </div>
                        ) : (
                          <div
                            title={row.unpaidMonthsFullList}
                            className="mt-1 inline-flex items-center px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium"
                          >
                            Menunggak {row.unpaidMonthsCount} bln: {row.unpaidMonthsSummary}
                          </div>
                        )
                      ) : (
                        <div className="mt-0.5 text-[11px] text-emerald-600 font-medium">
                          {row.isPokok
                            ? 'Kewajiban Awal Lunas'
                            : `Lunas s/d ${formatShortPeriod(targetYear, targetMonth)}`}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-sm text-right">
                      <div className="text-gray-700 font-medium">
                        {formatCurrency(row.currentMonthDue)}
                      </div>
                      {row.isPokok ? (
                        <div className="text-[11px] text-gray-400">Sekali Bayar</div>
                      ) : row.currentMonthPaid > 0 ? (
                        <div className="text-[11px] text-emerald-600">
                          Terbayar {formatCurrency(row.currentMonthPaid)}
                        </div>
                      ) : null}
                    </td>

                    <td className="py-3 px-4 text-sm text-right">
                      <div
                        className={
                          row.previousArrearsAmount > 0
                            ? 'font-medium text-amber-700'
                            : 'text-gray-400'
                        }
                      >
                        {formatCurrency(row.previousArrearsAmount)}
                      </div>
                      {!row.isPokok && row.previousArrearsMonthsCount > 0 && (
                        <div className="text-[11px] text-amber-600">
                          {row.previousArrearsMonthsCount} bln lalu
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-sm text-right">
                      <span
                        className={
                          row.remainingArrears > 0
                            ? 'font-bold text-rose-600'
                            : 'font-medium text-emerald-600'
                        }
                      >
                        {formatCurrency(row.remainingArrears)}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-sm text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(
                          row.status
                        )}`}
                      >
                        {formatBillStatusLabel(row)}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-sm text-center">
                      {row.remainingArrears > 0 ? (
                        <button
                          onClick={() => handleOpenPayment(row)}
                          className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Bayar
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Lunas
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 text-sm bg-gray-50">
          <div className="flex items-center gap-2 text-gray-600">
            <span>
              Menampilkan {totalFiltered === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
              {Math.min(currentPage * itemsPerPage, totalFiltered)} dari {totalFiltered} data
            </span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ml-2 border border-gray-300 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-white"
            >
              <option value={10}>10 / halaman</option>
              <option value={25}>25 / halaman</option>
              <option value={50}>50 / halaman</option>
              <option value={100}>100 / halaman</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="font-medium px-2 text-gray-700">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="font-semibold text-gray-800">Bayar Tagihan &amp; Tunggakan Simpanan</h2>
                <p className="text-xs text-gray-500">
                  Mencatat setoran ke buku besar simpanan &amp; arus kas masuk koperasi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessPayment} className="p-5 overflow-y-auto space-y-4">
              <div className="bg-blue-50 p-3.5 rounded-lg border border-blue-100 text-sm">
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                  <span className="text-gray-600">Anggota:</span>
                  <span className="font-semibold text-gray-900">
                    {selectedBill.anggota?.nama} ({selectedBill.anggota?.nrp})
                  </span>

                  <span className="text-gray-600">Jenis Simpanan:</span>
                  <span className="font-semibold text-gray-900">{selectedBill.deposit_name}</span>

                  <span className="text-gray-600">Tagihan Bulan Ini:</span>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(selectedBill.currentMonthDue)}
                  </span>

                  <span className="text-gray-600">Tunggakan Lalu:</span>
                  <span className="font-medium text-amber-700">
                    {formatCurrency(selectedBill.previousArrearsAmount)}
                  </span>

                  <span className="text-gray-600">Total Sisa Tagihan:</span>
                  <span className="font-bold text-rose-600">
                    {formatCurrency(selectedBill.remainingArrears)}
                  </span>
                </div>
              </div>

              {!selectedBill.isPokok && selectedBill.unpaidMonths.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Pilih Bulan yang Dibayar ({selectedMonthKeys.length}/
                      {selectedBill.unpaidMonths.length} dipilih)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          applyMonthSelection(
                            selectedBill.unpaidMonths.map((m) => `${m.year}-${m.month}`),
                            selectedBill
                          )
                        }
                        className="px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 rounded"
                      >
                        Lunasi Semua ({selectedBill.unpaidMonths.length} Bln)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          applyMonthSelection(
                            [
                              `${selectedBill.unpaidMonths[0].year}-${selectedBill.unpaidMonths[0].month}`,
                            ],
                            selectedBill
                          )
                        }
                        className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded"
                      >
                        1 Bln Tertua
                      </button>
                      {selectedBill.unpaidMonths.length >= 3 && (
                        <button
                          type="button"
                          onClick={() =>
                            applyMonthSelection(
                              selectedBill.unpaidMonths
                                .slice(0, 3)
                                .map((m) => `${m.year}-${m.month}`),
                              selectedBill
                            )
                          }
                          className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded"
                        >
                          3 Bln Tertua
                        </button>
                      )}
                      {currentMonthSelectedInBill && (
                        <button
                          type="button"
                          onClick={() =>
                            applyMonthSelection(
                              [
                                `${currentMonthSelectedInBill.year}-${currentMonthSelectedInBill.month}`,
                              ],
                              selectedBill
                            )
                          }
                          className="px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 rounded"
                        >
                          Bulan Ini Saja
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {selectedBill.unpaidMonths.map((m) => {
                      const key = `${m.year}-${m.month}`;
                      const checked = selectedMonthKeys.includes(key);
                      return (
                        <label
                          key={key}
                          className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMonthKey(key)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="font-medium text-gray-800">{m.fullLabel}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                m.isArrears
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {m.isArrears ? 'Tunggakan' : 'Bulan Ini'}
                            </span>
                          </div>
                          <span className="font-medium text-gray-700">
                            {formatCurrency(m.remaining)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nominal Pembayaran (Rp)
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedBill.remainingArrears}
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseInt(e.target.value, 10) || 0)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-semibold text-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Dialokasikan secara kronologis (FIFO) ke bulan yang dipilih; mendukung setoran
                  penuh maupun sebagian (parsial).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Metode Pembayaran
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as 'tunai' | 'transfer_bank')
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="tunai">Tunai (Kas Brankas)</option>
                    <option value="transfer_bank">Transfer Bank</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    No. Referensi (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Otomatis jika dikosongkan"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Catatan (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Misal: Pelunasan tunggakan via transfer"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  disabled={isSubmitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  disabled={isSubmitting || paymentAmount <= 0}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? 'Memproses...' : 'Proses Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

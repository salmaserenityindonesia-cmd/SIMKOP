import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { loanService, LoanApplicationStatusTab, LoanType, isGoodsMarkupLoan } from '../../services/loanService';
import { Loader2, CheckCircle, XCircle, Download, FileText, Eye, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import StatusBadge, { StatusType } from '../../components/ui/StatusBadge';
import { exportToExcel, exportToPDF } from '../../lib/exportUtils';
import { useFeedback } from '../../context/FeedbackContext';
import LoanDetailModal from '../../components/loans/LoanDetailModal';

const defaultFormatRupiah = (amount: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);

export function buildApprovalConfirmMessage(
  loan: any,
  action: 'approved' | 'rejected',
  formatRupiahFn: (n: number) => string = defaultFormatRupiah
): string {
  const isApprove = action === 'approved';
  if (isApprove && isGoodsMarkupLoan(loan)) {
    const totalAkad = Number(loan?.amount || loan?.principal_amount || 0);
    const markupAmt = Number(loan?.markup_amount || 0);
    const costPrice = Number(loan?.cost_price || Math.max(0, totalAkad - markupAmt));
    const itemDesc = String(loan?.item_description || loan?.notes || 'Barang').trim();
    return `Apakah Anda yakin ingin MENYETUJUI pembiayaan barang ini? Barang: ${itemDesc} | Harga Modal Supplier: ${formatRupiahFn(costPrice)} | Margin Markup: ${formatRupiahFn(markupAmt)} | Harga Jual Akad: ${formatRupiahFn(totalAkad)}. Kas keluar koperasi akan dicatat sebesar Harga Modal Supplier (${formatRupiahFn(costPrice)}).`;
  }

  const settlementAmt = Number(loan?.topup_settlement_amount || 0);
  const principalAmt = Number(loan?.amount || loan?.principal_amount || 0);
  const netDisbursedAmt = Math.max(0, principalAmt - settlementAmt);
  const topupConfirmDetail =
    isApprove && settlementAmt > 0
      ? ` Pinjaman lama akan otomatis dilunasi sebesar ${formatRupiahFn(settlementAmt)} (Cair Bersih ke Anggota: ${formatRupiahFn(netDisbursedAmt)}).`
      : '';

  return `Apakah Anda yakin ingin ${isApprove ? 'MENYETUJUI' : 'MENOLAK'} pinjaman ini?${topupConfirmDetail}`;
}

interface ApprovalPinjamanProps {
  initialTab?: LoanApplicationStatusTab;
  initialPinjamanList?: any[];
  initialCounts?: { pending: number; approved: number };
}

export default function ApprovalPinjaman({
  initialTab = 'PENDING',
  initialPinjamanList,
  initialCounts
}: ApprovalPinjamanProps = {}) {
  const { showToast, showConfirm } = useFeedback();
  const [pinjamanList, setPinjamanList] = useState<any[]>(initialPinjamanList || []);
  const [loading, setLoading] = useState(initialPinjamanList === undefined);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LoanApplicationStatusTab>(initialTab);
  const [counts, setCounts] = useState<{ pending: number; approved: number }>(
    initialCounts || { pending: 0, approved: 0 }
  );
  const [selectedLoanIdForModal, setSelectedLoanIdForModal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLoanTypeFilter, setSelectedLoanTypeFilter] = useState<string>('ALL');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [activeLoanTypes, setActiveLoanTypes] = useState<LoanType[]>([]);

  useEffect(() => {
    if (initialPinjamanList === undefined) {
      loadData(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (initialCounts === undefined && initialPinjamanList === undefined) {
      loanService.getLoanApplications('APPROVED')
        .then(res => {
          if (res) setCounts(prev => ({ ...prev, approved: res.length }));
        })
        .catch(() => {});
    }
    if (initialPinjamanList === undefined && typeof loanService.getActiveLoanTypes === 'function') {
      loanService.getActiveLoanTypes()
        .then(types => {
          if (Array.isArray(types)) setActiveLoanTypes(types);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, selectedLoanTypeFilter, startDateFilter, endDateFilter, pageSize]);

  async function loadData(tab: LoanApplicationStatusTab = activeTab) {
    try {
      setLoading(true);
      setError(null);
      const data = await loanService.getLoanApplications(tab);
      setPinjamanList(data || []);
      setError(null);

      if (tab === 'PENDING') {
        setCounts(prev => ({ ...prev, pending: (data || []).length }));
      } else if (tab === 'APPROVED') {
        setCounts(prev => ({ ...prev, approved: (data || []).length }));
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data persetujuan');
    } finally {
      setLoading(false);
    }
  }

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    const isApprove = action === 'approved';
    const targetLoan = pinjamanList.find((item) => String(item.id) === String(id));
    const confirmMessage = buildApprovalConfirmMessage(targetLoan, action, formatRupiah);

    const confirmed = await showConfirm({
      title: isApprove ? 'Setujui Pinjaman' : 'Tolak Pinjaman',
      message: confirmMessage,
      confirmText: isApprove ? 'Setujui' : 'Tolak',
      variant: isApprove ? 'primary' : 'danger',
    });
    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(id);
      if (action === 'approved') {
        const now = new Date();
        const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        await loanService.approveLoan(id, todayDate);
        showToast('Pengajuan pinjaman berhasil disetujui dan diaktifkan.', 'success');
      } else {
        await loanService.rejectLoan(id);
        showToast('Pinjaman berhasil ditolak', 'success');
      }
      const refreshPromises: Promise<any>[] = [loadData(activeTab)];
      if (activeTab !== 'PENDING') {
        refreshPromises.push(
          loanService.getLoanApplications('PENDING')
            .then(res => {
              if (res) setCounts(prev => ({ ...prev, pending: res.length }));
            })
            .catch(() => {})
        );
      }
      if (activeTab !== 'APPROVED') {
        refreshPromises.push(
          loanService.getLoanApplications('APPROVED')
            .then(res => {
              if (res) setCounts(prev => ({ ...prev, approved: res.length }));
            })
            .catch(() => {})
        );
      }
      await Promise.all(refreshPromises);
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const trimmed = dateStr.trim();
      const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : trimmed;
      const parsed = new Date(normalized);
      if (isNaN(parsed.getTime())) return dateStr;
      return parsed.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getMappedStatus = (status?: string): StatusType => {
    const s = (status || 'draft').toLowerCase();
    if (s === 'active' || s === 'approved') return 'approved';
    if (s === 'completed' || s === 'paid_off' || s === 'lunas' || s === 'paid') return 'lunas';
    if (s === 'rejected' || s === 'ditolak') return 'rejected';
    return 'pending';
  };

  const toDateInputValue = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    const trimmed = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const loanTypeOptions = useMemo(() => {
    const map = new Map<string, { id: string; code?: string; name: string }>();
    for (const lt of activeLoanTypes) {
      if (lt?.id && lt?.name) {
        map.set(String(lt.id), { id: String(lt.id), code: lt.code, name: lt.name });
      }
    }
    for (const item of pinjamanList) {
      const lt = item?.loan_types;
      const ltId = lt?.id || item?.loan_type_id;
      if (ltId && lt?.name && !map.has(String(ltId))) {
        map.set(String(ltId), { id: String(ltId), code: lt.code, name: lt.name });
      }
    }
    return Array.from(map.values());
  }, [activeLoanTypes, pinjamanList]);

  const filteredApplications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return pinjamanList.filter((item) => {
      if (q) {
        const nrp = String(item.anggota?.nrp || '').toLowerCase();
        const noAnggota = String(item.anggota?.no_anggota || '').toLowerCase();
        const nama = String(item.anggota?.nama || '').toLowerCase();
        const loanNumber = String(item.loan_number || '').toLowerCase();
        if (!nrp.includes(q) && !noAnggota.includes(q) && !nama.includes(q) && !loanNumber.includes(q)) {
          return false;
        }
      }

      if (selectedLoanTypeFilter !== 'ALL') {
        const matchId = String(item.loan_type_id || '') === selectedLoanTypeFilter;
        const matchRelId = String(item.loan_types?.id || '') === selectedLoanTypeFilter;
        const matchCode = String(item.loan_types?.code || '') === selectedLoanTypeFilter;
        if (!matchId && !matchRelId && !matchCode) {
          return false;
        }
      }

      if (startDateFilter || endDateFilter) {
        const rawDate =
          activeTab === 'APPROVED'
            ? item.approved_at || item.disbursed_at || item.created_at
            : item.created_at;
        const dateKey = toDateInputValue(rawDate);
        if (!dateKey) return false;
        if (startDateFilter && dateKey < startDateFilter) return false;
        if (endDateFilter && dateKey > endDateFilter) return false;
      }

      return true;
    });
  }, [pinjamanList, searchQuery, selectedLoanTypeFilter, startDateFilter, endDateFilter, activeTab]);

  const totalFilteredItems = filteredApplications.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFilteredItems);
  const paginatedApplications = filteredApplications.slice(startIndex, endIndex);

  const hasActiveFilters = Boolean(
    searchQuery || selectedLoanTypeFilter !== 'ALL' || startDateFilter || endDateFilter
  );

  const handleExportExcel = () => {
    const data = filteredApplications.map(p => ({
      'No. Anggota': p.anggota?.no_anggota || p.anggota?.nrp || '-',
      'Nama Anggota': p.anggota?.nama || '-',
      'Tanggal Pengajuan': formatDate(p.created_at),
      'Tanggal Disetujui': formatDate(p.disbursed_at),
      'Jumlah Pinjaman': p.amount || p.principal_amount || 0,
      'Tenor (Bulan)': p.tenor || p.agreed_tenor_months || 0,
      'Status': p.status || 'draft'
    }));
    const tabSuffix = activeTab === 'PENDING' ? 'Menunggu' : activeTab === 'APPROVED' ? 'Disetujui' : 'Semua';
    exportToExcel(data, `Data_Pinjaman_${tabSuffix}`);
  };

  const handleExportPDF = () => {
    const headers = ['No. Anggota', 'Nama Anggota', 'Tgl Pengajuan', 'Tgl Disetujui', 'Jumlah', 'Tenor', 'Status'];
    const data = filteredApplications.map(p => [
      p.anggota?.no_anggota || p.anggota?.nrp || '-',
      p.anggota?.nama || '-',
      formatDate(p.created_at),
      formatDate(p.disbursed_at),
      formatRupiah(p.amount || p.principal_amount || 0),
      `${p.tenor || p.agreed_tenor_months || 0} Bulan`,
      p.status || 'draft'
    ]);
    const tabTitle = activeTab === 'PENDING' ? 'Menunggu Persetujuan' : activeTab === 'APPROVED' ? 'Sudah Disetujui' : 'Semua Riwayat';
    exportToPDF(headers, data, `Data_Pinjaman_${activeTab}`, `Laporan Persetujuan Pinjaman (${tabTitle})`);
  };

  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'APPROVED':
        return 'Belum ada riwayat permohonan pinjaman yang disetujui.';
      case 'ALL':
        return 'Tidak ada riwayat permohonan pinjaman.';
      case 'PENDING':
      default:
        return 'Tidak ada pengajuan pinjaman yang menunggu persetujuan.';
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Persetujuan Pinjaman</h1>
          <p className="text-[var(--color-text-secondary)]">Kelola persetujuan pinjaman anggota (Khusus Admin)</p>
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

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-3 gap-2">
          <button
            type="button"
            data-testid="tab-pending"
            onClick={() => {
              setActiveTab('PENDING');
              loadData('PENDING');
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'PENDING'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Menunggu Persetujuan
            {counts.pending > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                {counts.pending}
              </span>
            )}
          </button>
          <button
            type="button"
            data-testid="tab-approved"
            onClick={() => {
              setActiveTab('APPROVED');
              loadData('APPROVED');
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'APPROVED'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Sudah Disetujui
            {counts.approved > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                {counts.approved}
              </span>
            )}
          </button>
          <button
            type="button"
            data-testid="tab-all"
            onClick={() => {
              setActiveTab('ALL');
              loadData('ALL');
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'ALL'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Semua Riwayat
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3">
          {/* Pencarian NRP / Nama / No Pinjaman */}
          <div className="flex-1 min-w-[220px]">
            <label
              htmlFor="approval-search-input"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              Cari Anggota / Kontrak
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="approval-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari NRP, Nama Anggota, atau No. Pinjaman..."
                className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Filter Jenis Pinjaman */}
          <div className="min-w-[190px]">
            <label
              htmlFor="approval-loan-type-filter"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              Jenis Pinjaman
            </label>
            <select
              id="approval-loan-type-filter"
              value={selectedLoanTypeFilter}
              onChange={(e) => setSelectedLoanTypeFilter(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Semua Jenis Pinjaman</option>
              {loanTypeOptions.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Rentang Tanggal */}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label
                htmlFor="approval-start-date-filter"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                {activeTab === 'APPROVED' ? 'Tgl Disetujui (Dari)' : 'Dari Tanggal'}
              </label>
              <input
                id="approval-start-date-filter"
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label
                htmlFor="approval-end-date-filter"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                {activeTab === 'APPROVED' ? 'Tgl Disetujui (Sampai)' : 'Sampai Tanggal'}
              </label>
              <input
                id="approval-end-date-filter"
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedLoanTypeFilter('ALL');
                  setStartDateFilter('');
                  setEndDateFilter('');
                }}
                className="h-9 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="py-3 px-4 font-medium border-b border-gray-200">No. Anggota</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Nama Anggota</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Tgl Pengajuan</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Tgl Disetujui</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-right">Jumlah Pinjaman</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Tenor</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Status</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    <p>Memuat data...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : filteredApplications.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    {pinjamanList.length > 0 && hasActiveFilters
                      ? 'Tidak ada data pinjaman yang sesuai dengan filter pencarian.'
                      : getEmptyMessage()}
                  </td>
                </tr>
              ) : (
                paginatedApplications.map((p) => {
                  const isPending = !p.status || p.status === 'draft' || p.status === 'pending';
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-900">
                        <div>{p.anggota?.no_anggota || p.anggota?.nrp || '-'}</div>
                        {p.loan_number && (
                          <div className="text-[11px] font-mono text-slate-400">{p.loan_number}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{p.anggota?.nama || '-'}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {p.loan_types?.name && (
                            <span className="inline-block rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              {p.loan_types.name}
                            </span>
                          )}
                          {isGoodsMarkupLoan(p) && (
                            <span className="inline-block rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                              Pembiayaan Barang (Markup)
                            </span>
                          )}
                        </div>
                        {isGoodsMarkupLoan(p) && p.item_description && (
                          <div className="mt-1 text-xs font-medium text-teal-800">
                            Barang: {p.item_description}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{formatDate(p.created_at)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{formatDate(p.disbursed_at)}</td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 text-right">
                        <div>{formatRupiah(p.amount || p.principal_amount || 0)}</div>
                        {isGoodsMarkupLoan(p) && (
                          <div className="mt-1 inline-block rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-[11px] font-medium text-teal-800 text-right">
                            Modal Supplier: {formatRupiah(Number(p.cost_price || 0))} • Margin:{' '}
                            {formatRupiah(Number(p.markup_amount || 0))} • Harga Jual Akad:{' '}
                            {formatRupiah(Number(p.amount || p.principal_amount || 0))}
                          </div>
                        )}
                        {Number(p.topup_settlement_amount || 0) > 0 && (
                          <div className="mt-1 inline-block rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-medium text-indigo-800 text-right">
                            Top-Up • Potong Lama: {formatRupiah(Number(p.topup_settlement_amount))} • Cair Bersih:{' '}
                            {formatRupiah(Math.max(0, Number(p.amount || p.principal_amount || 0) - Number(p.topup_settlement_amount)))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 text-center">
                        {p.tenor || p.agreed_tenor_months || 0} Bulan
                      </td>
                      <td className="py-3 px-4 text-sm text-center">
                        <StatusBadge status={getMappedStatus(p.status)} />
                      </td>
                      <td className="py-3 px-4 text-sm text-center">
                        <div className="flex justify-center gap-2">
                          {isPending && (
                            <>
                              <button 
                                onClick={() => handleAction(p.id, 'approved')}
                                disabled={actionLoading === p.id}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-md text-xs font-medium disabled:opacity-50"
                              >
                                {actionLoading === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                Setujui
                              </button>
                              <button 
                                onClick={() => handleAction(p.id, 'rejected')}
                                disabled={actionLoading === p.id}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-md text-xs font-medium disabled:opacity-50"
                              >
                                {actionLoading === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                Tolak
                              </button>
                            </>
                          )}
                          <a 
                            href={`/admin/pinjaman/${p.id}`}
                            onClick={(e) => {
                              if (!e.ctrlKey && !e.metaKey && e.button === 0) {
                                e.preventDefault();
                                setSelectedLoanIdForModal(p.id);
                              }
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md text-xs font-medium"
                          >
                            <Eye className="w-3 h-3" />
                            Detail
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Tampilkan</span>
            <select
              aria-label="Baris per halaman"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>/ halaman</span>
            <span className="ml-2 text-slate-500">
              Menampilkan{' '}
              <span className="font-semibold text-slate-700">
                {totalFilteredItems === 0 ? 0 : startIndex + 1}-{endIndex}
              </span>{' '}
              dari <span className="font-semibold text-slate-700">{totalFilteredItems}</span> data
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safeCurrentPage <= 1}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <span className="px-2 font-medium text-slate-700">
              Halaman {safeCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <LoanDetailModal
        isOpen={selectedLoanIdForModal !== null}
        loanId={selectedLoanIdForModal}
        onClose={() => setSelectedLoanIdForModal(null)}
        onSuccess={() => loadData(activeTab)}
      />
    </AdminLayout>
  );
}

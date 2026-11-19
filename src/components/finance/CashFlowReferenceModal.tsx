import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  BookOpen,
  X,
  Search,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  Wallet,
  CreditCard,
  Clock,
  FileText,
  RefreshCw,
  Landmark,
  Users,
} from 'lucide-react';
import {
  getCashFlowReferenceBreakdown,
  type CashFlowReferenceBreakdown,
} from '../../services/cashFlowAuditService';

export interface CashFlowReferenceModalItem {
  id: string;
  tanggal: string;
  referensi: string;
  deskripsi: string;
  kategori: string;
  unit_usaha: string;
  kas_masuk: number;
  kas_keluar: number;
  reference_id?: string | null;
  direction?: 'in' | 'out';
  created_at?: string;
}

export interface CashFlowReferenceModalProps {
  cashFlowItem: CashFlowReferenceModalItem | null;
  onClose: () => void;
  /** Optional preloaded breakdown for deterministic SSR unit testing */
  initialBreakdown?: CashFlowReferenceBreakdown | null;
}

const formatRp = (n: number): string =>
  'Rp ' + Math.round(n).toLocaleString('id-ID');

const LONG_MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const formatDateLongId = (raw?: string | null): string => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '-';
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${day} ${LONG_MONTH_NAMES_ID[month - 1]} ${year}`;
    }
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return trimmed;
  return `${parsed.getDate()} ${LONG_MONTH_NAMES_ID[parsed.getMonth()]} ${parsed.getFullYear()}`;
};

const formatDateTimeId = (raw?: string | null): string => {
  if (!raw) return '-';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatPaymentMethodLabel = (method?: string | null): string => {
  const m = String(method || '').trim().toLowerCase();
  if (!m) return '-';
  if (m === 'transfer' || m === 'transfer_bank') return 'Transfer Bank';
  if (m === 'tunai') return 'Tunai Kasir';
  if (m === 'potong_gaji') return 'Potong Gaji';
  return String(method);
};

export default function CashFlowReferenceModal({
  cashFlowItem,
  onClose,
  initialBreakdown = null,
}: CashFlowReferenceModalProps) {
  const [breakdown, setBreakdown] = useState<CashFlowReferenceBreakdown | null>(
    initialBreakdown
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [copied, setCopied] = useState<boolean>(false);

  const loadBreakdown = useCallback(async () => {
    if (!cashFlowItem) return;
    setLoading(true);
    setError(null);
    try {
      const amount =
        cashFlowItem.kas_masuk > 0
          ? cashFlowItem.kas_masuk
          : cashFlowItem.kas_keluar;
      const direction: 'in' | 'out' =
        cashFlowItem.direction ?? (cashFlowItem.kas_keluar > 0 ? 'out' : 'in');
      const data = await getCashFlowReferenceBreakdown({
        id: cashFlowItem.id,
        category: cashFlowItem.kategori,
        amount,
        direction,
        description: cashFlowItem.deskripsi,
        reference_id: cashFlowItem.reference_id ?? null,
        referensi: cashFlowItem.referensi,
        unit_usaha: cashFlowItem.unit_usaha,
        created_at: cashFlowItem.created_at || cashFlowItem.tanggal,
      });
      setBreakdown(data);
    } catch (err: any) {
      setError(
        err?.message || 'Gagal memuat rincian buku pembantu untuk referensi ini.'
      );
    } finally {
      setLoading(false);
    }
  }, [cashFlowItem]);

  useEffect(() => {
    setSearchQuery('');
    setPage(1);
    setCopied(false);

    if (!cashFlowItem) {
      setBreakdown(null);
      setError(null);
      return;
    }

    if (initialBreakdown) {
      setBreakdown(initialBreakdown);
      setLoading(false);
      setError(null);
      return;
    }

    loadBreakdown();
  }, [cashFlowItem, initialBreakdown, loadBreakdown]);

  useEffect(() => {
    if (!cashFlowItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cashFlowItem, onClose]);

  const filteredMemberRows = useMemo(() => {
    if (!breakdown || breakdown.kind !== 'opening_savings') return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return breakdown.openingSavings.memberRows;
    return breakdown.openingSavings.memberRows.filter(
      (r) =>
        r.nrp.toLowerCase().includes(q) ||
        r.nama.toLowerCase().includes(q) ||
        r.pangkat.toLowerCase().includes(q)
    );
  }, [breakdown, searchQuery]);

  const filteredBulkRecipients = useMemo(() => {
    if (!breakdown || breakdown.kind !== 'bulk_lebaran_withdrawal') return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return breakdown.bulkLebaranWithdrawal.recipients;
    return breakdown.bulkLebaranWithdrawal.recipients.filter(
      (r) =>
        r.nrp.toLowerCase().includes(q) ||
        r.nama.toLowerCase().includes(q) ||
        r.pangkat.toLowerCase().includes(q) ||
        r.bankAccountNumber.toLowerCase().includes(q) ||
        r.bankName.toLowerCase().includes(q) ||
        (r.referenceNo || '').toLowerCase().includes(q)
    );
  }, [breakdown, searchQuery]);

  if (!cashFlowItem) return null;

  const nominal =
    cashFlowItem.kas_masuk > 0 ? cashFlowItem.kas_masuk : cashFlowItem.kas_keluar;
  const isOutflow =
    cashFlowItem.direction === 'out' || cashFlowItem.kas_keluar > 0;

  const isBulkLebaran = breakdown?.kind === 'bulk_lebaran_withdrawal';
  const totalMembers = isBulkLebaran
    ? filteredBulkRecipients.length
    : filteredMemberRows.length;
  const totalPages = Math.max(1, Math.ceil(totalMembers / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalMembers);
  const paginatedMembers = filteredMemberRows.slice(startIdx, endIdx);
  const paginatedBulkRecipients = filteredBulkRecipients.slice(startIdx, endIdx);
  const filteredBulkTotal = filteredBulkRecipients.reduce(
    (sum, r) => sum + r.amount,
    0
  );

  const hasLainnyaColumn =
    breakdown?.kind === 'opening_savings' &&
    breakdown.openingSavings.byDepositType.lainnya > 0;

  const handleCopyRef = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cashFlowItem.referensi);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Non-blocking clipboard error
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashflow-ref-modal-title"
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-indigo-200/80"
      >
        {/* ── HEADER ── */}
        <div className="px-6 py-4 bg-slate-900 text-white border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3
                  id="cashflow-ref-modal-title"
                  className="text-base sm:text-lg font-bold tracking-tight text-white"
                >
                  Bukti Jurnal &amp; Buku Pembantu Referensi
                </h3>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-indigo-500/30 border border-indigo-400/40 font-mono text-xs font-bold text-indigo-100 tracking-wide">
                  {cashFlowItem.referensi}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>Tanggal: {cashFlowItem.tanggal}</span>
                <span className="text-slate-500">•</span>
                <span>Kategori: {cashFlowItem.kategori}</span>
                <span className="text-slate-500">•</span>
                <span className={isOutflow ? 'text-rose-300 font-semibold' : 'text-emerald-300 font-semibold'}>
                  {isOutflow ? 'Kas Keluar' : 'Kas Masuk'}: {formatRp(nominal)}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/70">
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-600">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="text-sm font-medium">Memuat rincian buku pembantu...</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold">Gagal Memuat Rincian</p>
                  <p className="text-xs mt-0.5 text-rose-700">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadBreakdown}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Coba Lagi
              </button>
            </div>
          )}

          {/* ── KONTEN A: SALDO AWAL SIMPANAN ── */}
          {!loading && !error && breakdown?.kind === 'opening_savings' && (
            <div className="space-y-4">
              {/* 4 Kartu Rekapitulasi Pembentuk Agregat */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Simpanan Pokok
                  </p>
                  <p className="text-lg font-bold text-emerald-900 mt-1 tabular-nums">
                    {formatRp(breakdown.openingSavings.byDepositType.pokok)}
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    Simpanan Wajib
                  </p>
                  <p className="text-lg font-bold text-blue-900 mt-1 tabular-nums">
                    {formatRp(breakdown.openingSavings.byDepositType.wajib)}
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-purple-200 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                    Simpanan Belanja
                  </p>
                  <p className="text-lg font-bold text-purple-900 mt-1 tabular-nums">
                    {formatRp(breakdown.openingSavings.byDepositType.belanja)}
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    Simpanan Lebaran
                  </p>
                  <p className="text-lg font-bold text-amber-900 mt-1 tabular-nums">
                    {formatRp(breakdown.openingSavings.byDepositType.lebaran)}
                  </p>
                </div>
              </div>

              {hasLainnyaColumn && (
                <div className="px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                  <span className="font-semibold">Simpanan Lainnya / Tambahan (Cut-Off)</span>
                  <span className="font-bold tabular-nums">
                    {formatRp(breakdown.openingSavings.byDepositType.lainnya)}
                  </span>
                </div>
              )}

              {/* Indikator Verifikasi Kecocokan */}
              <div
                className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs ${
                  breakdown.openingSavings.isMatched
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {breakdown.openingSavings.isMatched ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span>
                    Total Rincian Anggota ={' '}
                    <strong className="font-bold tabular-nums">
                      {formatRp(breakdown.openingSavings.calculatedTotal)}
                    </strong>{' '}
                    ({breakdown.openingSavings.memberRows.length} anggota,{' '}
                    {breakdown.openingSavings.transactionCount} mutasi)
                  </span>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                    breakdown.openingSavings.isMatched
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {breakdown.openingSavings.isMatched
                    ? '✓ Cocok dengan Jurnal Kas'
                    : `Selisih ${formatRp(Math.abs(breakdown.openingSavings.difference))}`}
                </span>
              </div>

              {/* Kotak Pencarian & Tabel Rincian per Anggota */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Cari NRP atau Nama Anggota..."
                      className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                  </div>
                  <div className="text-xs text-slate-500">
                    Menampilkan <strong>{filteredMemberRows.length}</strong> anggota
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold w-12">No</th>
                        <th className="px-3 py-2.5 font-semibold">NRP</th>
                        <th className="px-3 py-2.5 font-semibold">Nama Anggota</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Pokok</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Wajib</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Belanja</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Lebaran</th>
                        {hasLainnyaColumn && (
                          <th className="px-3 py-2.5 font-semibold text-right">Lainnya</th>
                        )}
                        <th className="px-3 py-2.5 font-semibold text-right">Total Saldo Awal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedMembers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={hasLainnyaColumn ? 9 : 8}
                            className="py-8 text-center text-slate-500"
                          >
                            Tidak ada data anggota yang cocok dengan pencarian.
                          </td>
                        </tr>
                      ) : (
                        paginatedMembers.map((row, idx) => (
                          <tr
                            key={row.member_id}
                            className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                          >
                            <td className="px-3 py-2 text-slate-500 tabular-nums">
                              {startIdx + idx + 1}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-800 whitespace-nowrap">
                              {row.nrp}
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {row.nama}
                              {row.pangkat ? (
                                <span className="ml-1.5 text-[11px] text-slate-500 font-normal">
                                  ({row.pangkat})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                              {formatRp(row.pokok)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-blue-700">
                              {formatRp(row.wajib)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-purple-700">
                              {formatRp(row.belanja)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                              {formatRp(row.lebaran)}
                            </td>
                            {hasLainnyaColumn && (
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                {formatRp(row.lainnya)}
                              </td>
                            )}
                            <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">
                              {formatRp(row.total)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                  <div className="flex items-center gap-3">
                    <span>
                      Menampilkan{' '}
                      <strong className="text-slate-800">
                        {totalMembers > 0 ? startIdx + 1 : 0}-{endIdx}
                      </strong>{' '}
                      dari <strong className="text-slate-800">{totalMembers}</strong> anggota
                    </span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      aria-label="Jumlah anggota per halaman"
                      className="px-2 py-1 rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-medium"
                    >
                      <option value={10}>10 / halaman</option>
                      <option value={25}>25 / halaman</option>
                      <option value={50}>50 / halaman</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="px-2 font-semibold text-slate-800">
                      Halaman {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── KONTEN B: PENJUALAN POS ── */}
          {!loading && !error && breakdown?.kind === 'pos_sale' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-slate-900">
                      Struk Penjualan POS: {breakdown.posSale.saleNumber}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Skema: {breakdown.posSale.paymentScheme}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500">Pembeli / Anggota</p>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      {breakdown.posSale.member
                        ? `${breakdown.posSale.member.nama} (${breakdown.posSale.member.nrp})`
                        : 'Pembeli Umum / Tunai'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Waktu Transaksi</p>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      {formatDateTimeId(breakdown.posSale.createdAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Total Struk</p>
                    <p className="font-bold text-emerald-700 mt-0.5 tabular-nums">
                      {formatRp(breakdown.posSale.totalAmount)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-slate-500">Bayar Tunai</p>
                    <p className="font-bold text-slate-800 tabular-nums mt-0.5">
                      {formatRp(breakdown.posSale.paidCash)}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-slate-500">Potong Simpanan</p>
                    <p className="font-bold text-slate-800 tabular-nums mt-0.5">
                      {formatRp(breakdown.posSale.paidDeposit)}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-slate-500">Bon / Kredit Toko</p>
                    <p className="font-bold text-slate-800 tabular-nums mt-0.5">
                      {formatRp(breakdown.posSale.paidCredit)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-4 py-3 border-b border-slate-200 text-xs font-bold text-slate-800">
                  Daftar Item Belanja ({breakdown.posSale.items.length} item)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Produk</th>
                        <th className="px-4 py-2 font-semibold text-right">Qty</th>
                        <th className="px-4 py-2 font-semibold text-right">Harga</th>
                        <th className="px-4 py-2 font-semibold text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {breakdown.posSale.items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                            Rincian item produk tidak tersedia.
                          </td>
                        </tr>
                      ) : (
                        breakdown.posSale.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-2 font-medium text-slate-800">{item.productName}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-slate-700">{item.qty}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-slate-700">{formatRp(item.price)}</td>
                            <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">{formatRp(item.subtotal)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── KONTEN C: PELUNASAN BON TOKO ── */}
          {!loading && !error && breakdown?.kind === 'store_credit_payment' && (() => {
            const scp = breakdown.storeCreditPayment;
            const paidAmount = Math.round(Number(scp.amount || 0));
            const beforeBalance =
              scp.beforeBalance !== undefined
                ? Math.round(scp.beforeBalance)
                : Math.max(
                    paidAmount,
                    Math.round(Number(scp.salePaidCredit ?? scp.saleTotal ?? paidAmount))
                  );
            const afterBalance =
              scp.afterBalance !== undefined
                ? Math.round(scp.afterBalance)
                : Math.max(0, beforeBalance - paidAmount);
            const relatedSales = scp.relatedSales || [];

            return (
              <div className="space-y-4">
                {/* Header Bukti Pelunasan */}
                <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Bukti Pelunasan Bon Toko ({scp.receiptNumber})
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Pelunasan mengurangi piutang bon anggota dan menambah saldo kas masuk koperasi
                      </p>
                    </div>
                  </div>
                  <span className="text-base font-bold text-emerald-700 tabular-nums">
                    +{formatRp(paidAmount)}
                  </span>
                </div>

                {/* 2 Kartu Pergerakan Akuntansi Berdampingan */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Kartu Kiri: Aset Piutang Bon Berkurang */}
                  <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-xs relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                        Aset Piutang Bon Berkurang
                      </span>
                      <Receipt className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Piutang Awal (Sebelum Bayar)</span>
                        <span className="font-semibold text-slate-800 tabular-nums">
                          {formatRp(beforeBalance)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Dikurangi Pelunasan</span>
                        <span className="font-bold text-rose-600 tabular-nums">
                          -{formatRp(paidAmount)}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="font-semibold text-slate-800">Sisa Piutang Anggota</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 tabular-nums">
                            {formatRp(afterBalance)}
                          </span>
                          {afterBalance === 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Lunas
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Kartu Kanan: Kas Koperasi Bertambah */}
                  <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        Kas Koperasi Bertambah
                      </span>
                      <Wallet className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Kas Masuk Diterima</span>
                        <span className="text-sm font-bold text-emerald-700 tabular-nums">
                          +{formatRp(paidAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Metode Bayar</span>
                        <span className="font-semibold text-slate-800">
                          {formatPaymentMethodLabel(scp.paymentMethod || 'potong_gaji')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">No. Bukti Pelunasan</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {scp.receiptNumber}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Tanggal Pembayaran</span>
                        <span className="font-semibold text-slate-800">
                          {formatDateLongId(scp.paymentDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Identitas Anggota & Referensi Nota Belanja */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500">Anggota</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {scp.member
                          ? `${scp.member.nama} (${scp.member.nrp})${
                              scp.member.pangkat ? ` • ${scp.member.pangkat}` : ''
                            }`
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">No. Struk Terkait</p>
                      <p className="font-mono font-semibold text-slate-800 mt-0.5">
                        {scp.saleNumber || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Catatan</p>
                      <p className="font-medium text-slate-700 mt-0.5">{scp.notes || '-'}</p>
                    </div>
                  </div>

                  {relatedSales.length > 0 && (
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Daftar Nota Belanja Bon Terkait ({relatedSales.length} struk)
                      </p>
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-2 font-semibold">No. Struk POS</th>
                              <th className="px-3 py-2 font-semibold">Tanggal Belanja</th>
                              <th className="px-3 py-2 font-semibold text-right">Total Struk</th>
                              <th className="px-3 py-2 font-semibold text-right">Porsi Bon Toko</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {relatedSales.map((rs) => (
                              <tr key={rs.saleId}>
                                <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                                  {rs.saleNumber}
                                </td>
                                <td className="px-3 py-2 text-slate-600">
                                  {rs.createdAt ? formatDateLongId(rs.createdAt) : '-'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                  {formatRp(rs.totalAmount)}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums text-amber-700">
                                  {formatRp(rs.paidCredit)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── KONTEN D: PENARIKAN / PENCAIRAN SIMPANAN PERORANGAN ── */}
          {!loading && !error && breakdown?.kind === 'deposit_withdrawal' && (
            <div className="bg-white rounded-xl border border-rose-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-rose-600" />
                  <h4 className="text-sm font-bold text-slate-900">
                    Bukti Penarikan / Pencairan Simpanan
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    {breakdown.depositWithdrawal.isLebaranPersonal
                      ? 'Simpanan Lebaran (Personal)'
                      : 'Pencairan Perorangan'}
                  </span>
                </div>
                <span className="text-base font-bold text-rose-700 tabular-nums">
                  {formatRp(breakdown.depositWithdrawal.amount)}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">Nama Anggota &amp; NRP</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.depositWithdrawal.member ? (
                      <>
                        {breakdown.depositWithdrawal.member.nama}{' '}
                        <span className="font-mono text-slate-600">
                          ({breakdown.depositWithdrawal.member.nrp})
                        </span>
                      </>
                    ) : (
                      '-'
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Pangkat</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.depositWithdrawal.member?.pangkat || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Jenis Simpanan</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.depositWithdrawal.depositTypeName} ({breakdown.depositWithdrawal.depositTypeCode})
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Metode Penyaluran</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatPaymentMethodLabel(breakdown.depositWithdrawal.paymentMethod)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Rekening Bank Tujuan</p>
                  {breakdown.depositWithdrawal.member?.bankAccountNumber ? (
                    <p className="font-mono font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {breakdown.depositWithdrawal.member.bankName
                          ? `${breakdown.depositWithdrawal.member.bankName} — `
                          : ''}
                        {breakdown.depositWithdrawal.member.bankAccountNumber}
                      </span>
                    </p>
                  ) : (
                    <p className="font-medium text-slate-700 mt-0.5">
                      {String(breakdown.depositWithdrawal.paymentMethod || '').toLowerCase() === 'tunai'
                        ? 'Tunai (Tanpa Rekening)'
                        : '-'}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-slate-500">No. Referensi / Kwitansi</p>
                  <p className="font-mono font-semibold text-slate-800 mt-0.5">
                    {breakdown.depositWithdrawal.referenceNo || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Waktu Pencairan</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatDateTimeId(breakdown.depositWithdrawal.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Nominal Pencairan</p>
                  <p className="font-bold text-rose-700 tabular-nums mt-0.5">
                    {formatRp(breakdown.depositWithdrawal.amount)}
                  </p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-slate-500">Keterangan / Catatan</p>
                  <p className="font-medium text-slate-800 mt-0.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200/70">
                    {breakdown.depositWithdrawal.description}
                    {breakdown.depositWithdrawal.notes &&
                    breakdown.depositWithdrawal.notes !== breakdown.depositWithdrawal.description
                      ? ` — ${breakdown.depositWithdrawal.notes}`
                      : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── KONTEN D2: PENCAIRAN MASSAL SIMPANAN LEBARAN ── */}
          {!loading && !error && breakdown?.kind === 'bulk_lebaran_withdrawal' && (
            <div className="space-y-4">
              {/* 3 Kartu Ringkasan Siklus */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                    Nama Siklus Pencairan
                  </p>
                  <p className="text-sm sm:text-base font-bold text-slate-900 mt-1 leading-snug">
                    {breakdown.bulkLebaranWithdrawal.cycleName}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Tanggal Pencairan: {formatDateLongId(breakdown.bulkLebaranWithdrawal.disbursementDate)}
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    Jumlah Penerima
                  </p>
                  <p className="text-lg font-bold text-blue-900 mt-1 tabular-nums flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{breakdown.bulkLebaranWithdrawal.recipientCount} Anggota</span>
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                    Total Dana Dicairkan
                  </p>
                  <p className="text-lg font-bold text-rose-900 mt-1 tabular-nums">
                    {formatRp(breakdown.bulkLebaranWithdrawal.calculatedTotal)}
                  </p>
                </div>
              </div>

              {/* Indikator Verifikasi Kecocokan Jurnal */}
              <div
                className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs ${
                  breakdown.bulkLebaranWithdrawal.isMatched
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {breakdown.bulkLebaranWithdrawal.isMatched ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span>
                    Total Rincian Penerima ={' '}
                    <strong className="font-bold tabular-nums">
                      {formatRp(breakdown.bulkLebaranWithdrawal.calculatedTotal)}
                    </strong>{' '}
                    ({breakdown.bulkLebaranWithdrawal.recipientCount} anggota)
                  </span>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                    breakdown.bulkLebaranWithdrawal.isMatched
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {breakdown.bulkLebaranWithdrawal.isMatched
                    ? '✓ Cocok dengan Jurnal Kas'
                    : `Selisih ${formatRp(Math.abs(breakdown.bulkLebaranWithdrawal.difference))}`}
                </span>
              </div>

              {/* Kotak Pencarian & Tabel Terpaginasi Penerima Pencairan Massal */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Cari NRP, Nama Anggota, atau Rekening..."
                      className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                  </div>
                  <div className="text-xs text-slate-500">
                    Menampilkan <strong>{filteredBulkRecipients.length}</strong> anggota
                    {searchQuery.trim() !== '' && (
                      <span className="ml-1.5 text-slate-700">
                        (Total {formatRp(filteredBulkTotal)})
                      </span>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold w-12">No</th>
                        <th className="px-3 py-2.5 font-semibold">NRP</th>
                        <th className="px-3 py-2.5 font-semibold">Nama Anggota</th>
                        <th className="px-3 py-2.5 font-semibold">Rekening Tujuan</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Nominal Dicairkan (Rp)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedBulkRecipients.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            Tidak ada data anggota penerima yang cocok dengan pencarian.
                          </td>
                        </tr>
                      ) : (
                        paginatedBulkRecipients.map((row, idx) => (
                          <tr
                            key={row.id || `${row.memberId}-${idx}`}
                            className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                          >
                            <td className="px-3 py-2 text-slate-500 tabular-nums">
                              {startIdx + idx + 1}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-800 whitespace-nowrap">
                              {row.nrp}
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {row.nama}
                              {row.pangkat ? (
                                <span className="ml-1.5 text-[11px] text-slate-500 font-normal">
                                  ({row.pangkat})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                              {row.bankAccountNumber ? (
                                <div className="flex items-center gap-1.5">
                                  <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>
                                    {row.bankName ? `${row.bankName} — ` : ''}
                                    {row.bankAccountNumber}
                                  </span>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums text-rose-700">
                              {formatRp(row.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredBulkRecipients.length > 0 && (
                      <tfoot className="bg-slate-100/90 border-t-2 border-slate-200 font-bold text-slate-900">
                        <tr>
                          <td
                            colSpan={4}
                            className="px-3 py-2.5 text-xs uppercase tracking-wider text-slate-700"
                          >
                            TOTAL KOMPONEN PENERIMA
                            {searchQuery.trim() !== '' ? ' (HASIL FILTER)' : ''}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 whitespace-nowrap">
                            {formatRp(
                              searchQuery.trim() !== ''
                                ? filteredBulkTotal
                                : breakdown.bulkLebaranWithdrawal.calculatedTotal
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                  <div className="flex items-center gap-3">
                    <span>
                      Menampilkan{' '}
                      <strong className="text-slate-800">
                        {totalMembers > 0 ? startIdx + 1 : 0}-{endIdx}
                      </strong>{' '}
                      dari <strong className="text-slate-800">{totalMembers}</strong> anggota
                    </span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      aria-label="Jumlah anggota per halaman"
                      className="px-2 py-1 rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-medium"
                    >
                      <option value={10}>10 / halaman</option>
                      <option value={25}>25 / halaman</option>
                      <option value={50}>50 / halaman</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="px-2 font-semibold text-slate-800">
                      Halaman {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── KONTEN D3: SETORAN SIMPANAN ANGGOTA (MATRIKS) ── */}
          {!loading && !error && breakdown?.kind === 'individual_deposit' && (
            <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-slate-900">
                    Bukti Setoran Simpanan Anggota
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Setoran Simpanan
                  </span>
                  {breakdown.individualDeposit.shortPeriodLabel !== '-' && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {breakdown.individualDeposit.shortPeriodLabel}
                    </span>
                  )}
                </div>
                <span className="text-base font-bold text-emerald-700 tabular-nums">
                  {formatRp(breakdown.individualDeposit.amount)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">No. Kwitansi / Referensi</p>
                  {breakdown.individualDeposit.referenceNo ? (
                    <p className="mt-0.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold">
                        {breakdown.individualDeposit.referenceNo}
                      </span>
                    </p>
                  ) : (
                    <p className="font-mono font-semibold text-slate-700 mt-0.5">-</p>
                  )}
                </div>
                <div>
                  <p className="text-slate-500">Nama Anggota &amp; NRP</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.individualDeposit.nama}{' '}
                    <span className="font-mono text-slate-600">
                      ({breakdown.individualDeposit.nrp})
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Pangkat</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.individualDeposit.pangkat || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Jenis Simpanan</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.individualDeposit.depositTypeName}
                    {breakdown.individualDeposit.depositTypeCode &&
                    breakdown.individualDeposit.depositTypeCode !== '-'
                      ? ` (${breakdown.individualDeposit.depositTypeCode})`
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Periode Bulan Setoran</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.individualDeposit.periodLabel}
                    {breakdown.individualDeposit.shortPeriodLabel !== '-'
                      ? ` (${breakdown.individualDeposit.shortPeriodLabel})`
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Metode Pembayaran</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatPaymentMethodLabel(breakdown.individualDeposit.paymentMethod)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Waktu Pencatatan</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatDateTimeId(breakdown.individualDeposit.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Nominal Setoran</p>
                  <p className="font-bold text-emerald-700 tabular-nums mt-0.5">
                    {formatRp(breakdown.individualDeposit.amount)}
                  </p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-slate-500">Catatan / Keterangan</p>
                  <p className="font-medium text-slate-800 mt-0.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200/70">
                    {breakdown.individualDeposit.notes || breakdown.individualDeposit.description}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── KONTEN E1: SHIFT KASIR ── */}
          {!loading && !error && breakdown?.kind === 'cashier_shift' && (
            <div className="bg-white rounded-xl border border-indigo-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-sm font-bold text-slate-900">
                    Rekonsiliasi Shift Kasir ({breakdown.cashierShift.shiftNumber})
                  </h4>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                  {breakdown.cashierShift.status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-slate-500">Kasir</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.cashierShift.cashierName || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Buka Shift</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatDateTimeId(breakdown.cashierShift.openedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Tutup Shift</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatDateTimeId(breakdown.cashierShift.closedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Modal Awal Kasir</p>
                  <p className="font-bold text-slate-800 tabular-nums mt-0.5">
                    {formatRp(breakdown.cashierShift.initialCash)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Penjualan Tunai</p>
                  <p className="font-bold text-emerald-700 tabular-nums mt-0.5">
                    {formatRp(breakdown.cashierShift.cashSales)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Kas Aktual / Selisih</p>
                  <p className="font-bold text-slate-800 tabular-nums mt-0.5">
                    {formatRp(breakdown.cashierShift.actualCash)} ({formatRp(breakdown.cashierShift.difference)})
                  </p>
                </div>
              </div>
              {breakdown.cashierShift.notes && (
                <p className="text-xs text-slate-600 pt-2 border-t border-slate-100">
                  Catatan: {breakdown.cashierShift.notes}
                </p>
              )}
            </div>
          )}

          {/* ── KONTEN E2: PENCAIRAN PINJAMAN ── */}
          {!loading && !error && breakdown?.kind === 'loan_disbursement' && (
            <div className="bg-white rounded-xl border border-purple-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-purple-600" />
                  <h4 className="text-sm font-bold text-slate-900">
                    Bukti Pencairan Pinjaman Anggota
                  </h4>
                </div>
                <span className="text-sm font-bold text-purple-700 tabular-nums">
                  {formatRp(breakdown.loanDisbursement.amount)}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">Anggota Peminjam</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.loanDisbursement.member
                      ? `${breakdown.loanDisbursement.member.nama} (${breakdown.loanDisbursement.member.nrp})`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Tenor / Status</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.loanDisbursement.tenor} bulan • {breakdown.loanDisbursement.status}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Tanggal Pencairan</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatDateTimeId(breakdown.loanDisbursement.disbursedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">ID Pinjaman</p>
                  <p className="font-mono text-slate-700 mt-0.5">
                    {breakdown.loanDisbursement.loanId}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── KONTEN E3: METADATA JURNAL UMUM ── */}
          {!loading && !error && breakdown?.kind === 'journal_only' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Metadata Lengkap Jurnal Arus Kas
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">Kode Referensi</p>
                  <p className="font-mono font-bold text-indigo-700 mt-0.5">
                    {breakdown.journal.refCode}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">UUID Baris Jurnal (cash_flow.id)</p>
                  <p className="font-mono text-slate-800 mt-0.5 break-all">
                    {breakdown.journal.id}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Waktu Pencatatan</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {formatDateTimeId(breakdown.journal.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Unit Usaha &amp; Kategori</p>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {breakdown.journal.unitUsaha} • {breakdown.journal.category}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Arah &amp; Nominal</p>
                  <p className="font-bold text-slate-900 mt-0.5 tabular-nums">
                    {breakdown.journal.direction === 'out' ? 'Kas Keluar' : 'Kas Masuk'} —{' '}
                    {formatRp(breakdown.journal.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Reference ID Sumber</p>
                  <p className="font-mono text-slate-700 mt-0.5 break-all">
                    {breakdown.journal.referenceId || '-'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-slate-500">Uraian Deskripsi Lengkap</p>
                  <p className="font-medium text-slate-800 mt-0.5 bg-slate-50 rounded-lg p-3 border border-slate-200/70">
                    {breakdown.journal.description}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyRef}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Kode Referensi</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

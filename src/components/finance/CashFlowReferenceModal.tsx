import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
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
  UserX,
  ArrowRight,
  Layers,
  RotateCcw,
} from 'lucide-react';
import {
  getCashFlowReferenceBreakdown,
  isMemberDepositBatchCategory,
  type CashFlowReferenceBreakdown,
} from '../../services/cashFlowAuditService';
import {
  formatPosPaymentSchemeLabel,
  isPosCashSaleCategory,
  sanitizePosTerminology,
} from '../../utils/posCashFlowFormat';
import { isMemberClearanceCategory } from '../../utils/clearanceCashFlowFormat';
import { isCancellationReversalCategory } from '../../utils/depositCashFlowFormat';

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

const SAVINGS_LEDGER_ROUTE = '/admin/compliance-matrix';

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

const formatHeaderCategoryLabel = (category?: string | null): string => {
  if (isPosCashSaleCategory(category)) {
    return 'Penjualan POS';
  }
  if (isMemberDepositBatchCategory(category)) {
    return 'Setoran Anggota';
  }
  if (isMemberClearanceCategory(category)) {
    return 'Kliring Anggota Keluar';
  }
  if (isCancellationReversalCategory(category)) {
    return 'Koreksi / Pembatalan';
  }
  const clean = String(category || '').trim();
  return clean ? sanitizePosTerminology(clean) : '-';
};

const getDepositTypeBadgeClass = (code?: string | null): string => {
  const c = String(code || '').trim().toUpperCase();
  if (c === 'POKOK' || c === 'SP') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (c === 'WAJIB' || c === 'SW') {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
  if (c === 'BELANJA' || c === 'SB') {
    return 'bg-purple-50 text-purple-700 border-purple-200';
  }
  if (c === 'LEBARAN' || c === 'SL' || c === 'SHR') {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (c === 'PINJAMAN') {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

export default function CashFlowReferenceModal({
  cashFlowItem,
  onClose,
  initialBreakdown = null,
}: CashFlowReferenceModalProps) {
  const inRouter = useInRouterContext();
  const [breakdown, setBreakdown] = useState<CashFlowReferenceBreakdown | null>(
    initialBreakdown
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedReceipt, setCopiedReceipt] = useState<boolean>(false);

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
    setCopiedReceipt(false);

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

  const handleCopyReceipt = async (receiptCode: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(receiptCode);
      }
      setCopiedReceipt(true);
      setTimeout(() => setCopiedReceipt(false), 2000);
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
                <span>Kategori: {formatHeaderCategoryLabel(cashFlowItem.kategori)}</span>
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
          {!loading && !error && breakdown?.kind === 'pos_sale' && (() => {
            const posSchemeLabel =
              breakdown.posSale.paymentSchemeLabel ||
              formatPosPaymentSchemeLabel({
                paymentScheme: breakdown.posSale.paymentScheme,
                paidCash: breakdown.posSale.paidCash,
                paidDeposit: breakdown.posSale.paidDeposit,
                paidCredit: breakdown.posSale.paidCredit,
              });

            return (
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
                    Skema: {posSchemeLabel}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500">Pembeli / Anggota</p>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      {breakdown.posSale.member
                        ? `${breakdown.posSale.member.nama} (${breakdown.posSale.member.nrp})`
                        : 'Pelanggan Umum'}
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
            );
          })()}

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
          {!loading && !error && breakdown?.kind === 'individual_deposit' && (() => {
            const ind = breakdown.individualDeposit;
            const rawNrp = String(ind.memberNrp || ind.nrp || '').trim();
            const memberNrp = rawNrp && rawNrp !== '-' ? rawNrp : '';
            const rawPeriodCode = String(ind.periodCode || ind.shortPeriodLabel || '').trim();
            const periodCode = rawPeriodCode && rawPeriodCode !== '-' ? rawPeriodCode : '';
            const rawDepositTypeCode = String(ind.depositTypeCode || '').trim();
            const depositTypeCode =
              rawDepositTypeCode && rawDepositTypeCode !== '-' ? rawDepositTypeCode : '';
            const rawRefNo = String(ind.referenceNo || '').trim();
            const hasReceiptNo = Boolean(rawRefNo && rawRefNo !== '-');
            const rawReceiptNumber = String(ind.receiptNumber || '').trim();
            const traceCode =
              (hasReceiptNo ? rawRefNo : '') ||
              (rawReceiptNumber && rawReceiptNumber !== '-' ? rawReceiptNumber : '') ||
              breakdown.journal.refCode;
            const traceBadgeLabel = hasReceiptNo
              ? rawRefNo
              : memberNrp && periodCode
              ? `${memberNrp} • ${periodCode}`
              : memberNrp || traceCode;

            const traceParams = new URLSearchParams();
            if (memberNrp) {
              traceParams.set('search', memberNrp);
            }
            if (traceCode) {
              traceParams.set('ref', traceCode);
            }
            if (depositTypeCode) {
              traceParams.set('type', depositTypeCode);
            }
            if (periodCode) {
              traceParams.set('period', periodCode);
            }
            const traceQuery = traceParams.toString();
            const traceBackUrl = traceQuery
              ? `${SAVINGS_LEDGER_ROUTE}?${traceQuery}`
              : SAVINGS_LEDGER_ROUTE;

            return (
              <div className="space-y-4">
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
                      {ind.shortPeriodLabel !== '-' && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {ind.shortPeriodLabel}
                        </span>
                      )}
                    </div>
                    <span className="text-base font-bold text-emerald-700 tabular-nums">
                      {formatRp(ind.amount)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-slate-500">No. Kwitansi / Referensi</p>
                      {ind.referenceNo ? (
                        <p className="mt-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold">
                            {ind.referenceNo}
                          </span>
                        </p>
                      ) : (
                        <p className="font-mono font-semibold text-slate-700 mt-0.5">-</p>
                      )}
                    </div>
                    <div>
                      <p className="text-slate-500">Nama Anggota &amp; NRP</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {ind.nama}{' '}
                        <span className="font-mono text-slate-600">
                          ({ind.nrp})
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Pangkat</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {ind.pangkat || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Jenis Simpanan</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {ind.depositTypeName}
                        {ind.depositTypeCode && ind.depositTypeCode !== '-'
                          ? ` (${ind.depositTypeCode})`
                          : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Periode Bulan Setoran</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {ind.periodLabel}
                        {ind.shortPeriodLabel !== '-'
                          ? ` (${ind.shortPeriodLabel})`
                          : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Metode Pembayaran</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatPaymentMethodLabel(ind.paymentMethod)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Waktu Pencatatan</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatDateTimeId(ind.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Nominal Setoran</p>
                      <p className="font-bold text-emerald-700 tabular-nums mt-0.5">
                        {formatRp(ind.amount)}
                      </p>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <p className="text-slate-500">Catatan / Keterangan</p>
                      <p className="font-medium text-slate-800 mt-0.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200/70">
                        {ind.notes || ind.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bilah Audit Dua Arah ke Buku Besar Simpanan */}
                <div
                  data-testid="single-deposit-audit-bar"
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80"
                >
                  <div className="text-xs text-slate-600">
                    <span className="font-bold text-slate-800">Audit Dua Arah:</span>{' '}
                    Lacak pembukuan simpanan anggota ini dengan filter otomatis{' '}
                    <code className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[11px] text-indigo-700 font-semibold">
                      {traceBadgeLabel}
                    </code>
                  </div>
                  {inRouter ? (
                    <Link
                      to={traceBackUrl}
                      onClick={onClose}
                      data-testid="btn-trace-savings-ledger"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
                    >
                      <span>Telusuri di Buku Besar Simpanan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <a
                      href={traceBackUrl}
                      data-testid="btn-trace-savings-ledger"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
                    >
                      <span>Telusuri di Buku Besar Simpanan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── KONTEN D3b: SETORAN ANGGOTA BATCH (TERIMA SETORAN / KW-SETOR) ── */}
          {!loading && !error && breakdown?.kind === 'MEMBER_DEPOSIT_BATCH' && (() => {
            const batch = breakdown.memberDepositBatch;
            const traceParams = new URLSearchParams();
            if (batch.member.nrp && batch.member.nrp !== '-') {
              traceParams.set('search', batch.member.nrp);
            }
            const traceRefValue =
              batch.receiptNumber && batch.receiptNumber !== '-'
                ? batch.receiptNumber
                : breakdown.journal.refCode;
            if (traceRefValue) {
              traceParams.set('ref', traceRefValue);
            }
            const traceBackUrl = `${SAVINGS_LEDGER_ROUTE}?${traceParams.toString()}`;

            return (
              <div className="space-y-4">
                {/* Metadata Lengkap Jurnal Arus Kas */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Metadata Lengkap Jurnal Arus Kas
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500">Kode Referensi</p>
                      <p className="font-mono font-bold text-indigo-700 mt-0.5">
                        {breakdown.journal.refCode}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Waktu Pencatatan</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatDateTimeId(breakdown.journal.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Nominal Jurnal Kas Masuk</p>
                      <p className="font-bold text-emerald-700 mt-0.5 tabular-nums">
                        {formatRp(breakdown.journal.amount)}
                      </p>
                    </div>
                    <div className="sm:col-span-3">
                      <p className="text-slate-500">Uraian Jurnal</p>
                      <p className="font-medium text-slate-800 mt-0.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200/70">
                        {sanitizePosTerminology(breakdown.journal.description)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Banner Asal Menu & Bukti Setoran */}
                <div
                  data-testid="member-deposit-batch-banner"
                  className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-600" />
                      <h4 className="text-sm font-bold text-slate-900">
                        Rincian Asal Setoran Simpanan Anggota
                      </h4>
                    </div>
                    {batch.receiptNumber !== '-' && (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-xs font-bold">
                          {batch.receiptNumber}
                        </span>
                        <button
                          type="button"
                          data-testid="btn-copy-receipt-code"
                          onClick={() => handleCopyReceipt(batch.receiptNumber)}
                          title="Salin nomor kwitansi trace-back"
                          className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
                        >
                          {copiedReceipt ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500">Asal Menu Input</p>
                      <p className="font-semibold text-slate-900 mt-0.5">
                        {batch.sourceMenu}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Identitas Penyetor</p>
                      <p className="font-semibold text-slate-900 mt-0.5">
                        {batch.member.nama}{' '}
                        <span className="font-mono text-slate-600">
                          (NRP: {batch.member.nrp})
                        </span>
                        {batch.member.pangkat ? (
                          <span className="ml-1 text-slate-500 font-normal">
                            • {batch.member.pangkat}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Metode Pembayaran</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatPaymentMethodLabel(batch.paymentMethod)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Indikator Kecocokan Jurnal */}
                <div
                  className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs ${
                    batch.isMatched
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {batch.isMatched ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>
                      Total Rincian Komponen ={' '}
                      <strong className="font-bold tabular-nums">
                        {formatRp(batch.totalAmount)}
                      </strong>{' '}
                      ({batch.items.length} item mutasi)
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                      batch.isMatched
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {batch.isMatched
                      ? '✓ Cocok dengan Jurnal Kas'
                      : batch.items.length === 0
                      ? 'Rincian transaksi tidak ditemukan'
                      : `Selisih ${formatRp(Math.abs(batch.difference))}`}
                  </span>
                </div>

                {/* Tabel Rincian Komponen Setoran Simpanan */}
                <div
                  data-testid="member-deposit-batch-table"
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs"
                >
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Tabel Rincian Komponen Setoran Simpanan
                    </span>
                    <span className="text-xs text-slate-500">
                      {batch.items.length} baris
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold w-12">NO</th>
                          <th className="px-3 py-2.5 font-semibold">JENIS SIMPANAN</th>
                          <th className="px-3 py-2.5 font-semibold">PERIODE / BULAN</th>
                          <th className="px-3 py-2.5 font-semibold">KETERANGAN</th>
                          <th className="px-3 py-2.5 font-semibold text-right">NOMINAL (RP)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {batch.items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                              Belum ada rincian komponen setoran yang terhubung untuk jurnal ini.
                            </td>
                          </tr>
                        ) : (
                          batch.items.map((item, idx) => (
                            <tr
                              key={item.id || `${item.depositTypeCode}-${idx}`}
                              className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                            >
                              <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getDepositTypeBadgeClass(
                                    item.depositTypeCode
                                  )}`}
                                >
                                  <span>{item.depositTypeName}</span>
                                  {item.depositTypeCode && item.depositTypeCode !== '-' && (
                                    <span className="font-mono text-[10px] opacity-80">
                                      ({item.depositTypeCode})
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                                {item.periodLabel}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">
                                {item.notes || item.description}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                                {formatRp(item.amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {batch.items.length > 0 && (
                        <tfoot className="bg-emerald-50/80 border-t-2 border-emerald-200 font-bold text-slate-900">
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-3 text-xs uppercase tracking-wider text-emerald-900"
                            >
                              TOTAL SETORAN MASUK KAS
                            </td>
                            <td className="px-3 py-3 text-right text-sm font-extrabold tabular-nums text-emerald-700 whitespace-nowrap">
                              {formatRp(batch.totalAmount)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Tautan Trace-Back ke Buku Besar Simpanan */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/60 border border-indigo-200 rounded-xl px-4 py-3">
                  <div className="text-xs text-indigo-900">
                    <span className="font-semibold">Audit Dua Arah:</span> Lacak pembukuan simpanan anggota ini dengan filter otomatis kode bukti{' '}
                    <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                      {traceRefValue}
                    </code>
                  </div>
                  {inRouter ? (
                    <Link
                      to={traceBackUrl}
                      onClick={onClose}
                      data-testid="btn-trace-savings-ledger"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs"
                    >
                      <span>Telusuri di Buku Besar Simpanan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <a
                      href={traceBackUrl}
                      data-testid="btn-trace-savings-ledger"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs"
                    >
                      <span>Telusuri di Buku Besar Simpanan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── KONTEN D3c: BUKTI JURNAL BALIK / PEMBATALAN SETORAN ── */}
          {!loading && !error && breakdown?.kind === 'deposit_cancellation_reversal' && (() => {
            const rev = breakdown.cancellationReversal;
            const rawNrp = String(rev.memberNrp || '').trim();
            const memberNrp = rawNrp && rawNrp !== '-' ? rawNrp : '';
            const rawPeriodCode = String(rev.shortPeriodLabel || '').trim();
            const periodCode = rawPeriodCode && rawPeriodCode !== '-' ? rawPeriodCode : '';
            const rawDepositTypeCode = String(rev.depositTypeCode || '').trim();
            const depositTypeCode =
              rawDepositTypeCode && rawDepositTypeCode !== '-' ? rawDepositTypeCode : '';

            const traceParams = new URLSearchParams();
            if (memberNrp) traceParams.set('search', memberNrp);
            if (depositTypeCode) traceParams.set('type', depositTypeCode);
            if (periodCode) traceParams.set('period', periodCode);
            const traceQuery = traceParams.toString();
            const traceBackUrl = traceQuery
              ? `${SAVINGS_LEDGER_ROUTE}?${traceQuery}`
              : SAVINGS_LEDGER_ROUTE;

            return (
              <div className="space-y-4">
                <div
                  data-testid="cancellation-reversal-card"
                  className="bg-white rounded-xl border border-rose-200 p-5 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-600">
                        <RotateCcw className="w-4 h-4" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Bukti Jurnal Balik / Pembatalan Setoran
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        Koreksi / Pembatalan
                      </span>
                      {periodCode && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {periodCode}
                        </span>
                      )}
                    </div>
                    <span className="text-base font-bold text-rose-700 tabular-nums">
                      -{formatRp(rev.amount)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-slate-500">Jenis Simpanan</p>
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getDepositTypeBadgeClass(
                            rev.depositTypeCode
                          )}`}
                        >
                          <span>{rev.depositTypeName}</span>
                          {depositTypeCode && (
                            <span className="font-mono text-[10px] opacity-80">
                              ({depositTypeCode})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-slate-500">Periode Bulan Dibatalkan</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {rev.periodLabel}
                        {periodCode ? ` (${periodCode})` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Nama Anggota &amp; NRP</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {rev.memberName}{' '}
                        <span className="font-mono text-slate-600">
                          ({rev.memberNrp})
                        </span>
                        {rev.pangkat ? (
                          <span className="ml-1 text-slate-500 font-normal">
                            • {rev.pangkat}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Nominal Pengurangan Saldo</p>
                      <p className="font-bold text-rose-700 tabular-nums mt-0.5">
                        -{formatRp(rev.amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Admin Pelaksana</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {rev.adminName || 'Pengelola'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Waktu Pembatalan</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatDateTimeId(rev.canceledAt)}
                      </p>
                    </div>
                    {rev.originalReferenceNo && (
                      <div>
                        <p className="text-slate-500">No. Kwitansi Asli</p>
                        <p className="font-mono font-semibold text-slate-800 mt-0.5">
                          {rev.originalReferenceNo}
                        </p>
                      </div>
                    )}
                    {rev.originalPaymentMethod && (
                      <div>
                        <p className="text-slate-500">Metode Bayar Asli</p>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {formatPaymentMethodLabel(rev.originalPaymentMethod)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div
                    data-testid="cancellation-reason-box"
                    className="rounded-xl bg-rose-50/70 border border-rose-200 p-3.5 text-xs"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 mb-1">
                      Alasan Pembatalan
                    </p>
                    <p className="font-medium text-rose-950 leading-relaxed">
                      "{rev.cancelReason}"
                    </p>
                  </div>
                </div>

                {/* Bilah Audit Dua Arah ke Buku Besar Simpanan */}
                <div
                  data-testid="cancellation-audit-bar"
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80"
                >
                  <div className="text-xs text-slate-600">
                    <span className="font-bold text-slate-800">Audit Dua Arah:</span>{' '}
                    Periksa status periode simpanan anggota di Buku Besar Matriks{' '}
                    {(memberNrp || periodCode) && (
                      <code className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[11px] text-indigo-700 font-semibold">
                        {[memberNrp, periodCode].filter(Boolean).join(' • ')}
                      </code>
                    )}
                  </div>
                  {inRouter ? (
                    <Link
                      to={traceBackUrl}
                      onClick={onClose}
                      data-testid="btn-trace-savings-ledger"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
                    >
                      <span>Telusuri di Buku Besar Simpanan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <a
                      href={traceBackUrl}
                      data-testid="btn-trace-savings-ledger"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
                    >
                      <span>Telusuri di Buku Besar Simpanan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })()}

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

          {/* ── KONTEN E2b: KLIRING ANGGOTA KELUAR ── */}
          {!loading && !error && breakdown?.kind === 'MEMBER_CLEARANCE' && (() => {
            const mc = breakdown.memberClearance;
            const isSurplus = mc.netSettlement >= 0;

            return (
              <div className="space-y-4">
                {/* Kartu Status Anggota Keluar */}
                <div className="bg-white rounded-xl border border-rose-200 p-5 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-600">
                        <UserX className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">
                            Detail Kliring &amp; Pengunduran Diri Anggota
                          </h4>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            RESIGNED / KELUAR
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {isSurplus
                            ? 'Pencairan seluruh hak simpanan setelah kompensasi kewajiban pinjaman/bon'
                            : 'Pelunasan kekurangan utang oleh anggota keluar setelah pemotongan seluruh hak simpanan'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-base font-bold tabular-nums ${
                        isSurplus ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatRp(Math.abs(mc.netSettlement))}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-slate-500">Nama Anggota</p>
                      <p className="font-bold text-slate-900 mt-0.5">{mc.member.nama}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">NRP</p>
                      <p className="font-mono font-semibold text-slate-800 mt-0.5">
                        {mc.member.nrp}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Pangkat</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {mc.member.pangkat || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Status Keanggotaan</p>
                      <p className="mt-0.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          RESIGNED / KELUAR
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Tanggal Kliring</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatDateTimeId(mc.clearanceDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Metode Penyaluran / Pelunasan</p>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {formatPaymentMethodLabel(mc.paymentMethod)}
                      </p>
                    </div>
                    {mc.member.bankAccountNumber && (
                      <div className="sm:col-span-2 lg:col-span-3">
                        <p className="text-slate-500">Rekening Bank Tujuan</p>
                        <p className="font-mono font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {mc.member.bankName ? `${mc.member.bankName} — ` : ''}
                            {mc.member.bankAccountNumber}
                          </span>
                        </p>
                      </div>
                    )}
                    {mc.notes && (
                      <div className="sm:col-span-2 lg:col-span-3">
                        <p className="text-slate-500">Catatan Kliring</p>
                        <p className="font-medium text-slate-800 mt-0.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200/70">
                          {mc.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Indikator Verifikasi Kecocokan Jurnal */}
                <div
                  className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs ${
                    mc.isMatched
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {mc.isMatched ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>
                      Total Kas Kliring ={' '}
                      <strong className="font-bold tabular-nums">
                        {formatRp(Math.abs(mc.netSettlement))}
                      </strong>{' '}
                      ({mc.savingsItems.length} komponen simpanan)
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                      mc.isMatched
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {mc.isMatched
                      ? '✓ Cocok dengan Jurnal Kas'
                      : `Selisih ${formatRp(Math.abs(mc.difference))}`}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Rincian Hak Simpanan yang Dicairkan */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Rincian Hak Simpanan yang Dicairkan
                      </h5>
                      <span className="text-xs font-bold text-emerald-700 tabular-nums">
                        {formatRp(mc.totalSavings)}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Jenis Simpanan</th>
                            <th className="px-4 py-2 font-semibold text-right">Nominal Dicairkan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {mc.savingsItems.length === 0 ? (
                            mc.totalSavings > 0 ? (
                              <tr>
                                <td className="px-4 py-2.5 font-medium text-slate-800">
                                  Akumulasi Hak Simpanan Anggota
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                                  {formatRp(mc.totalSavings)}
                                </td>
                              </tr>
                            ) : (
                              <tr>
                                <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                                  Tidak ada saldo simpanan yang dicairkan.
                                </td>
                              </tr>
                            )
                          ) : (
                            mc.savingsItems.map((item) => (
                              <tr key={item.depositTypeId}>
                                <td className="px-4 py-2.5 font-medium text-slate-800">
                                  <span>{item.name}</span>
                                  {item.code && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                                      {item.code}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                                  {formatRp(item.amount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                          <tr>
                            <td className="px-4 py-2.5">Total Hak Simpanan</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                              {formatRp(mc.totalSavings)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Rincian Potongan Kewajiban & Hasil Akhir */}
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Rincian Potongan Kewajiban (Pinjaman / Bon)
                        </h5>
                        <span className="text-xs font-bold text-amber-700 tabular-nums">
                          {formatRp(mc.totalDebtOffset)}
                        </span>
                      </div>
                      {mc.debtItems.length === 0 ? (
                        <div className="p-4 text-xs text-slate-600 flex items-center justify-between">
                          <span>Tidak ada potongan kewajiban pinjaman / bon</span>
                          <span className="font-bold text-slate-800 tabular-nums">
                            Total Kewajiban Pinjaman / Bon: {formatRp(0)}
                          </span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-2 font-semibold">No. Pinjaman / Keterangan</th>
                                <th className="px-4 py-2 font-semibold text-right">Potongan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {mc.debtItems.map((debt) => (
                                <tr key={debt.loanId}>
                                  <td className="px-4 py-2.5">
                                    <span className="font-mono font-semibold text-slate-800">
                                      {debt.loanNumber}
                                    </span>
                                    <span className="block text-[11px] text-slate-500">
                                      {debt.purpose}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-amber-700">
                                    {formatRp(debt.offsetAmount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                              <tr>
                                <td className="px-4 py-2.5">Total Kewajiban Pinjaman / Bon</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">
                                  {formatRp(mc.totalDebtOffset)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Kartu Hasil Akhir Net Settlement */}
                    <div
                      className={`rounded-xl border p-4 shadow-xs space-y-2 text-xs ${
                        isSurplus
                          ? 'bg-rose-50/70 border-rose-200'
                          : 'bg-emerald-50/70 border-emerald-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-slate-700">
                        <span>Total Hak Simpanan</span>
                        <span className="font-semibold tabular-nums">
                          {formatRp(mc.totalSavings)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-700">
                        <span>Total Kewajiban Pinjaman / Bon</span>
                        <span className="font-semibold tabular-nums">
                          -{formatRp(mc.totalDebtOffset)}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">
                          {isSurplus
                            ? 'Total Kas Bersih Diserahkan ke Anggota'
                            : 'Total Kekurangan Disetor Anggota ke Koperasi'}
                        </span>
                        <span
                          className={`text-sm sm:text-base font-extrabold tabular-nums ${
                            isSurplus ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatRp(Math.abs(mc.netSettlement))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

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
                    {sanitizePosTerminology(breakdown.journal.description)}
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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Calendar,
  User,
  ShieldCheck,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  CheckSquare,
  Square,
  RotateCcw,
  Receipt,
  FileText,
  Loader2,
  AlertTriangle,
  History,
  TrendingUp,
} from 'lucide-react';
import {
  getLoanInteractiveGrid,
  toggleLoanSchedulePaid,
  checkAllLoanUpToCurrentMonth,
  autoReconcileLoanInstallments,
  uncheckAllLoanSchedules,
  calculateRemainingInstallmentDeficit,
  LoanInteractiveGridSummary,
  LoanGridPeriod,
  MONTH_NAMES,
} from '../../services/loanMatrixService';
import { formatCurrency } from '../../utils/formatCurrency';

export interface LoanScheduleModalProps {
  loanId: string;
  memberNrp: string;
  memberName: string;
  onClose: () => void;
  onSuccess?: () => void;
  initialData?: LoanInteractiveGridSummary | null;
  initialLoading?: boolean;
}

/**
 * Format nominal tarif menjadi label ringkas (misal 277000 -> Rp 277k, 1000000 -> Rp 1jt)
 */
export function formatRateBadge(amount: number): string {
  if (amount >= 1000000) {
    const jt = amount / 1000000;
    return `Rp ${jt % 1 === 0 ? jt : jt.toFixed(1)}jt`;
  }
  if (amount >= 1000) {
    const k = amount / 1000;
    return `Rp ${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

/**
 * Format tanggal Indonesia ringkas
 */
export function formatDateIndo(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const monthName = MONTH_NAMES[d.getMonth()] || '';
  return `${d.getDate()} ${monthName} ${d.getFullYear()}`;
}

/**
 * Dapatkan saldo terangsur awal / baseline dari data pinjaman (impor Excel)
 */
export const getImportedRepaidBalance = (loan: any): number => {
  if (!loan) return 0;
  if (loan.jumlah_terangsur && Number(loan.jumlah_terangsur) > 0) {
    return Number(loan.jumlah_terangsur);
  }
  const principal = Number(loan.principal_amount || loan.amount || loan.principalAmount || 0);
  let sisa: number | null = null;
  if (loan.sisa_pinjaman !== undefined && loan.sisa_pinjaman !== null) {
    sisa = Number(loan.sisa_pinjaman);
  } else if (loan.sisaPinjaman !== undefined && loan.sisaPinjaman !== null) {
    sisa = Number(loan.sisaPinjaman);
  } else if (loan.notes && typeof loan.notes === 'string') {
    const match = loan.notes.match(/Sisa:\s*Rp\s*([\d\.,]+)/i);
    if (match && match[1]) {
      const parsed = Number(match[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(parsed)) {
        sisa = parsed;
      }
    }
  }

  if (sisa !== null && !isNaN(sisa)) {
    return Math.max(0, principal - sisa);
  }

  if (loan.totalPaid && Number(loan.totalPaid) > 0) {
    return Number(loan.totalPaid);
  }

  return 0;
};

export default function LoanScheduleModal({
  loanId,
  memberNrp,
  memberName,
  onClose,
  onSuccess,
  initialData = null,
  initialLoading,
}: LoanScheduleModalProps) {
  const [data, setData] = useState<LoanInteractiveGridSummary | null>(initialData);
  const [loading, setLoading] = useState(initialLoading ?? (initialData ? false : true));
  const [syncing, setSyncing] = useState(false);

  // Saldo referensi permanen / baseline saldo terangsur hasil impor yang tidak boleh di-nol-kan
  const baselineRepaidBalanceRef = useRef<number>(
    initialData ? getImportedRepaidBalance(initialData) : 0
  );

  // Sub-modal state: Input Bukti Pelunasan / Setoran Angsuran
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [selectedPeriodForEvidence, setSelectedPeriodForEvidence] = useState<LoanGridPeriod | null>(null);
  const [evidenceAmount, setEvidenceAmount] = useState<number>(0);
  const [evidenceReceiptNo, setEvidenceReceiptNo] = useState('');
  const [evidencePaymentMethod, setEvidencePaymentMethod] = useState('potong_gaji');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [savingEvidence, setSavingEvidence] = useState(false);

  // Sub-modal state: Konfirmasi Pembatalan (Uncheck)
  const [uncheckModalOpen, setUncheckModalOpen] = useState(false);
  const [selectedPeriodForUncheck, setSelectedPeriodForUncheck] = useState<LoanGridPeriod | null>(null);
  const [uncheckReason, setUncheckReason] = useState('');
  const [unchecking, setUnchecking] = useState(false);

  // Sub-modal state: Riwayat Pembayaran / Bukti Kwitansi
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedPeriodForHistory, setSelectedPeriodForHistory] = useState<LoanGridPeriod | null>(null);

  // Reference React untuk kontainer scroll tabel dan kolom bulan berjalan
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const currentMonthColRef = useRef<HTMLTableHeaderCellElement | null>(null);

  // Inisialisasi baseline balance jika initialData tersedia
  useEffect(() => {
    if (initialData && baselineRepaidBalanceRef.current === 0) {
      const initialBaseline = getImportedRepaidBalance(initialData);
      if (initialBaseline > 0) {
        baselineRepaidBalanceRef.current = initialBaseline;
      }
    }
  }, [initialData]);

  // Fetch full data for the loan grid
  const fetchGridData = async () => {
    try {
      const summary = await getLoanInteractiveGrid(loanId);
      setData(summary);
      if (baselineRepaidBalanceRef.current === 0) {
        const computedBaseline = getImportedRepaidBalance(summary);
        if (computedBaseline > 0) {
          baselineRepaidBalanceRef.current = computedBaseline;
        }
      }
    } catch (err) {
      console.error('Error fetching loan interactive grid:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialData) {
      fetchGridData();
    } else if (baselineRepaidBalanceRef.current === 0) {
      const computedBaseline = getImportedRepaidBalance(initialData);
      if (computedBaseline > 0) {
        baselineRepaidBalanceRef.current = computedBaseline;
      }
    }
  }, [loanId]);

  // Auto-scroll ke bulan berjalan saat modal selesai dimuat
  useEffect(() => {
    if (!loading && data) {
      const timer = setTimeout(() => {
        if (currentMonthColRef.current) {
          currentMonthColRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
          });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [loading, data]);

  // Quick Action 1: Centang Semua s/d Bulan Ini
  const handleCheckAllUpToNow = async () => {
    setSyncing(true);
    try {
      await checkAllLoanUpToCurrentMonth(loanId);
      await fetchGridData();
      onSuccess?.();
    } catch (err) {
      console.error('Failed to check all loan schedules up to current month:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Quick Action 2: Cocokkan Otomatis dengan Saldo Terangsur (FIFO Reconcile)
  const handleAutoReconcile = async () => {
    setSyncing(true);
    try {
      const availablePaid = baselineRepaidBalanceRef.current > 0
        ? baselineRepaidBalanceRef.current
        : (data?.totalPaid ?? 0);
      await autoReconcileLoanInstallments(loanId, availablePaid);
      await fetchGridData();
      onSuccess?.();
    } catch (err) {
      console.error('Failed to auto reconcile loan installments:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Quick Action 3: Batal Centang Semua
  const handleUncheckAll = async () => {
    setSyncing(true);
    try {
      await uncheckAllLoanSchedules(loanId);
      // Set status lokal semua baris jadwal angsuran menjadi paid_amount = 0, status = 'UNPAID'
      setData(prev => {
        if (!prev) return null;
        return {
          ...prev,
          totalPaid: 0,
          sisaPinjaman: prev.principalAmount,
          isBalanced: false,
          periods: prev.periods.map(p => ({
            ...p,
            paidAmount: 0,
            status: 'UNPAID',
            repayments: []
          }))
        };
      });
      await fetchGridData();
      onSuccess?.();
    } catch (err) {
      console.error('Failed to uncheck all loan schedules:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Toggle single period checkbox
  const handleTogglePeriod = (period: LoanGridPeriod) => {
    if (period.status === 'PAID') {
      // Buka modal uncheck
      setSelectedPeriodForUncheck(period);
      setUncheckReason('');
      setUncheckModalOpen(true);
    } else {
      // Buka modal bukti pelunasan
      setSelectedPeriodForEvidence(period);
      const target = Number(period.targetAmount || 0);
      const paid = Number(period.paidAmount || 0);
      const remainingDeficit = calculateRemainingInstallmentDeficit(target, paid);
      const defaultNominal = remainingDeficit > 0 ? remainingDeficit : target;
      setEvidenceAmount(defaultNominal);
      setEvidenceReceiptNo(`KW-PINJ/${data?.loanNumber || '01'}/B${period.periodNumber}`);
      setEvidencePaymentMethod('potong_gaji');
      if (remainingDeficit > 0 && paid > 0) {
        setEvidenceNotes(`Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-${period.periodNumber}`);
      } else {
        setEvidenceNotes('');
      }
      setEvidenceModalOpen(true);
    }
  };

  // Submit Evidence
  const handleSubmitEvidence = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPeriodForEvidence) return;

    setSavingEvidence(true);
    try {
      await toggleLoanSchedulePaid(selectedPeriodForEvidence.id, true, {
        amount: Number(evidenceAmount) > 0 ? Number(evidenceAmount) : selectedPeriodForEvidence.targetAmount,
        receiptNo: evidenceReceiptNo.trim() || undefined,
        paymentMethod: evidencePaymentMethod,
        notes: evidenceNotes.trim() || undefined,
      });

      setEvidenceModalOpen(false);
      setSelectedPeriodForEvidence(null);
      await fetchGridData();
      onSuccess?.();
    } catch (err) {
      console.error('Gagal menyimpan bukti pelunasan angsuran:', err);
    } finally {
      setSavingEvidence(false);
    }
  };

  // Confirm Uncheck
  const handleConfirmUncheck = async () => {
    if (!selectedPeriodForUncheck) return;
    if (!uncheckReason.trim()) return;

    setUnchecking(true);
    try {
      await toggleLoanSchedulePaid(selectedPeriodForUncheck.id, false);
      setUncheckModalOpen(false);
      setSelectedPeriodForUncheck(null);
      setUncheckReason('');
      await fetchGridData();
      onSuccess?.();
    } catch (err) {
      console.error('Gagal membatalkan pelunasan angsuran:', err);
    } finally {
      setUnchecking(false);
    }
  };

  // Open History Modal
  const handleOpenHistoryModal = (period: LoanGridPeriod) => {
    setSelectedPeriodForHistory(period);
    setHistoryModalOpen(true);
  };

  const principal = data?.principalAmount || 0;
  const totalPaid = data?.totalPaid || 0;
  const sisa = data?.sisaPinjaman || 0;
  const isBalanced = data?.isBalanced || totalPaid >= principal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">
                  Buku Bantu Angsuran Pinjaman (Interactive Grid)
                </h2>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full border border-emerald-300">
                  Real-time
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitoring dan pencocokan pelunasan jadwal angsuran pinjaman per periode tenor secara interaktif.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Member Profile Bar */}
        <div className="px-6 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500">Anggota: </span>
                <span className="font-bold text-slate-800">{memberName || data?.memberName || '-'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500">NRP: </span>
                <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                  {memberNrp || data?.memberNrp || '-'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500">No. Pinjaman: </span>
                <span className="font-semibold text-slate-700">{data?.loanNumber || '-'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500">Tenor: </span>
                <span className="font-semibold text-slate-700">{data ? `${data.tenor} Bulan` : '-'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500">Tgl Pencairan: </span>
                <span className="font-semibold text-slate-700">{formatDateIndo(data?.disbursedAt)}</span>
              </div>
            </div>
          </div>

          {/* Saldo Comparison Header Bar */}
          <div className="flex items-center gap-3 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
            <div>
              <span className="text-[11px] text-slate-500">Total Terbayar: </span>
              <span className="font-bold text-slate-800 font-mono text-xs">{formatCurrency(totalPaid)}</span>
            </div>
            <span className="text-slate-300">vs</span>
            <div>
              <span className="text-[11px] text-slate-500">Total Pinjaman: </span>
              <span className="font-bold text-slate-800 font-mono text-xs">{formatCurrency(principal)}</span>
            </div>
            <div className="ml-1">
              {isBalanced ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Sesuai / Seimbang
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  Sisa Pinjaman: {formatCurrency(sisa)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar Aksi Cepat & Keterangan Status */}
        <div className="px-6 py-2.5 bg-slate-100/60 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Aksi Cepat:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCheckAllUpToNow}
                disabled={syncing || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                Centang Semua s/d Bulan Ini
              </button>
              <button
                type="button"
                onClick={handleAutoReconcile}
                disabled={syncing || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Cocokkan Otomatis dengan Saldo Terangsur
              </button>
              <button
                type="button"
                onClick={handleUncheckAll}
                disabled={syncing || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5" />
                Batal Centang Semua
              </button>
            </div>
          </div>

          {/* Status Legend */}
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Lunas
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span> Parsial
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-300 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span> Menunggak
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 text-slate-500 border border-dashed border-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Proyeksi
            </span>
          </div>
        </div>

        {/* Modal Main Content: Horizontal Checkbox Grid */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Memuat data buku bantu angsuran pinjaman...</p>
            </div>
          ) : !data || data.periods.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200 text-slate-500">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">Tidak ada jadwal angsuran ditemukan</p>
              <p className="text-xs text-slate-400 mt-1">Jadwal angsuran untuk pinjaman ini belum digenerate.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Header Grid Summary */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
                <span className="font-medium">
                  Grid Jadwal Angsuran (Periode 1 s/d {data.tenor})
                </span>
                <div className="text-[11px] text-slate-500">
                  Target Angsuran per Bulan: <strong className="font-mono text-slate-800">{formatCurrency(data.monthlyTarget)}</strong>
                </div>
              </div>

              {/* Table Grid Horizontal */}
              <div ref={scrollContainerRef} className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="sticky left-0 bg-slate-100 z-10 py-2.5 px-3 text-left border-r border-slate-200 min-w-[140px]">
                        Periode &amp; Item
                      </th>
                      {data.periods.map(period => (
                        <th
                          key={period.id}
                          ref={period.isCurrentMonth ? currentMonthColRef : null}
                          data-testid={period.isCurrentMonth ? 'current-month-col' : undefined}
                          className={`py-2.5 px-2 border-r border-slate-200 min-w-[84px] whitespace-nowrap transition-colors ${
                            period.isCurrentMonth
                              ? 'bg-emerald-50/80 ring-2 ring-inset ring-emerald-500 font-extrabold text-emerald-950'
                              : ''
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <div>{period.label}</div>
                            {period.isCurrentMonth && (
                              <span className="inline-block px-1 py-0.2 text-[9px] font-bold rounded bg-emerald-600 text-white uppercase tracking-wider">
                                BULAN INI
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="sticky left-0 bg-white z-10 py-4 px-3 text-left font-semibold text-slate-800 border-r border-b border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">
                        <div>
                          <span>Angsuran Pokok</span>
                          <div className="text-[10px] text-slate-400 font-normal">Centang jika lunas</div>
                        </div>
                      </td>

                      {data.periods.map(period => {
                        const isPaid = period.status === 'PAID';
                        const isPartial = period.status === 'PARTIAL';
                        const isUnpaid = period.status === 'UNPAID';
                        const isProjected = period.status === 'PROJECTED';

                        let cellBg = 'bg-white';
                        let badgeClass = 'bg-slate-100 text-slate-600 border-slate-300 font-semibold';
                        let badgeLabel = formatRateBadge(period.targetAmount);

                        if (isPaid) {
                          cellBg = 'bg-emerald-50/60 ring-1 ring-inset ring-emerald-500/40';
                          badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
                        } else if (isPartial) {
                          cellBg = 'bg-amber-50/60 ring-1 ring-inset ring-amber-500/40';
                          badgeClass = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
                          badgeLabel = `${formatRateBadge(period.paidAmount)} / ${formatRateBadge(period.targetAmount)}`;
                        } else if (isUnpaid) {
                          cellBg = 'bg-rose-50/40 ring-1 ring-inset ring-rose-400/40';
                          badgeClass = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
                        } else if (isProjected) {
                          cellBg = 'bg-slate-50/40 border-dashed';
                          badgeClass = 'bg-slate-100 text-slate-400 border-dashed border-slate-300 font-medium';
                        }

                        if (period.isCurrentMonth && !isPaid && !isPartial) {
                          cellBg = 'bg-emerald-50/20 ring-1 ring-inset ring-emerald-400/30';
                        }

                        return (
                          <td
                            key={period.id}
                            className={`py-3 px-1 border-r border-b border-slate-100 align-middle transition-colors ${cellBg}`}
                          >
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={isPaid}
                                  onChange={() => handleTogglePeriod(period)}
                                  className={`w-4 h-4 rounded cursor-pointer transition-transform hover:scale-110 ${
                                    isPaid
                                      ? 'text-emerald-600 accent-emerald-600 border-emerald-400 focus:ring-emerald-500'
                                      : isPartial
                                      ? 'text-amber-600 accent-amber-600 border-amber-400 focus:ring-amber-500'
                                      : 'text-slate-400 accent-emerald-600 border-slate-300 focus:ring-emerald-500'
                                  }`}
                                  aria-label={`Checkbox ${period.label}`}
                                  title={
                                    isPaid
                                      ? `Lunas (${period.label}). Klik untuk membatalkan pelunasan.`
                                      : isPartial
                                      ? `Parsial: Rp ${period.paidAmount.toLocaleString('id-ID')} dari Rp ${period.targetAmount.toLocaleString('id-ID')}. Klik untuk pelunasan.`
                                      : `Belum lunas (${period.label}). Klik untuk input bukti pelunasan.`
                                  }
                                  data-testid={`checkbox-period-${period.periodNumber}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleOpenHistoryModal(period)}
                                  className="p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors"
                                  title={`Riwayat Pembayaran & Bukti (${period.label})`}
                                  data-testid={`history-btn-period-${period.periodNumber}`}
                                  aria-label={`Riwayat Pembayaran ${period.label}`}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded border leading-none font-mono ${badgeClass}`}
                                title={`Target Angsuran: ${formatCurrency(period.targetAmount)} (Terbayar: ${formatCurrency(period.paidAmount)})`}
                                data-testid={`badge-period-${period.periodNumber}`}
                              >
                                {badgeLabel}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500">
            Perubahan checkbox angsuran langsung disimpan dan menyelaraskan status pinjaman secara otomatis.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-xl transition-colors shadow-sm"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Sub-Modal 1: Form Bukti Pelunasan / Setoran Angsuran */}
      {evidenceModalOpen && selectedPeriodForEvidence && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div data-testid="loan-evidence-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Dokumentasi Bukti Pelunasan Angsuran</h3>
                  <p className="text-xs text-slate-500">
                    {data?.loanNumber} • {selectedPeriodForEvidence.label}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEvidenceModalOpen(false);
                  setSelectedPeriodForEvidence(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitEvidence} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nominal Pembayaran (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  value={evidenceAmount}
                  onChange={e => setEvidenceAmount(Number(e.target.value))}
                  min={1}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                  data-testid="evidence-amount-input"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Target angsuran periode ini: {formatCurrency(selectedPeriodForEvidence.targetAmount)}
                </p>
                {selectedPeriodForEvidence.paidAmount > 0 && (
                  <p
                    data-testid="evidence-deficit-info"
                    className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 rounded px-2.5 py-1.5 mt-1.5 flex items-center justify-between"
                  >
                    <span>
                      Sudah terbayar: {formatCurrency(selectedPeriodForEvidence.paidAmount)}
                    </span>
                    <span className="text-amber-400">|</span>
                    <span>
                      Sisa kekurangan: {formatCurrency(calculateRemainingInstallmentDeficit(selectedPeriodForEvidence.targetAmount, selectedPeriodForEvidence.paidAmount))}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor Kwitansi / Referensi
                </label>
                <input
                  type="text"
                  value={evidenceReceiptNo}
                  onChange={e => setEvidenceReceiptNo(e.target.value)}
                  placeholder="Contoh: KW-PINJ/2026/01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                  data-testid="evidence-receipt-input"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Metode Pembayaran <span className="text-rose-500">*</span>
                </label>
                <select
                  value={evidencePaymentMethod}
                  onChange={e => setEvidencePaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  data-testid="evidence-method-select"
                >
                  <option value="potong_gaji">Potong Gaji</option>
                  <option value="tunai">Tunai Kasir</option>
                  <option value="transfer">Transfer Bank</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Catatan / Keterangan Tambahan
                </label>
                <textarea
                  value={evidenceNotes}
                  onChange={e => setEvidenceNotes(e.target.value)}
                  placeholder="Catatan kwitansi atau bukti transaksi..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  data-testid="evidence-notes-input"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEvidenceModalOpen(false);
                    setSelectedPeriodForEvidence(null);
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEvidence || evidenceAmount <= 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold shadow-xs disabled:opacity-50"
                  data-testid="submit-evidence-btn"
                >
                  {savingEvidence ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Simpan &amp; Lunas
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Modal 2: Konfirmasi Pembatalan Pelunasan (Uncheck) */}
      {uncheckModalOpen && selectedPeriodForUncheck && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div data-testid="loan-uncheck-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-rose-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-600 text-white rounded-lg shadow-xs">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Batalkan Pelunasan Angsuran</h3>
                  <p className="text-xs text-slate-500">{selectedPeriodForUncheck.label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUncheckModalOpen(false);
                  setSelectedPeriodForUncheck(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
                <p className="font-semibold">Perhatian:</p>
                <p className="text-[11px] mt-0.5">
                  Tindakan ini akan membatalkan status pelunasan periode ini dan menghapus catatan pembayaran terkait pada jadwal ini.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alasan Pembatalan <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={uncheckReason}
                  onChange={e => setUncheckReason(e.target.value)}
                  placeholder="Contoh: Koreksi kekeliruan centang angsuran / pembayaran batal..."
                  rows={3}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500 outline-none resize-none"
                  data-testid="uncheck-reason-input"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setUncheckModalOpen(false);
                    setSelectedPeriodForUncheck(null);
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUncheck}
                  disabled={unchecking || !uncheckReason.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-semibold shadow-xs disabled:opacity-50"
                  data-testid="confirm-uncheck-btn"
                >
                  {unchecking ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Membatalkan...
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      Batalkan Pelunasan
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal 3: Riwayat Pembayaran & Kwitansi */}
      {historyModalOpen && selectedPeriodForHistory && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div data-testid="loan-history-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-xs">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Riwayat Pembayaran Angsuran</h3>
                  <p className="text-xs text-slate-500">{selectedPeriodForHistory.label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryModalOpen(false);
                  setSelectedPeriodForHistory(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs max-h-[60vh] overflow-y-auto">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 text-slate-500">
                <span>Target: <strong className="text-slate-800 font-mono">{formatCurrency(selectedPeriodForHistory.targetAmount)}</strong></span>
                <span>Terbayar: <strong className="text-emerald-700 font-mono">{formatCurrency(selectedPeriodForHistory.paidAmount)}</strong></span>
              </div>

              {selectedPeriodForHistory.repayments.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <Receipt className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                  Belum ada catatan mutasi pembayaran untuk periode ini.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedPeriodForHistory.repayments.map((rep, idx) => (
                    <div
                      key={rep.id || idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-emerald-700 font-mono text-sm">
                          {formatCurrency(rep.amountPaid)}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {new Date(rep.paymentDate).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] uppercase font-semibold">
                          {rep.paymentMethod || 'transfer'}
                        </span>
                        {rep.notes && <span className="text-slate-500 truncate">{rep.notes}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setHistoryModalOpen(false);
                  setSelectedPeriodForHistory(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

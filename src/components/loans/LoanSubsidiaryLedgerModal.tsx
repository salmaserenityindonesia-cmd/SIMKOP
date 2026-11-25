import { useEffect, useMemo } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  X,
  ExternalLink,
  CheckCircle2,
  Clock,
  Package,
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
} from 'lucide-react';
import { calculateRepaymentPortions } from '../../services/loanService';
import { filterRedundantLegacySaldoAwalRepayments } from '../../services/orphanAuditService';
import {
  formatReportDate,
  type PaidOffLoanReportRow,
} from '../../services/paidOffLoansReportService';
import { formatTanggalLahirWithAge } from '../../utils/dateUtils';

export interface LoanSubsidiaryLedgerEntry {
  id: string;
  kind: 'disbursement' | 'repayment';
  date: string | null;
  referenceNumber: string;
  description: string;
  subDescription?: string | null;
  periodNumber?: number | null;
  paymentMethod?: string | null;
  principalPortion: number;
  marginPortion: number;
  debit: number;
  credit: number;
  runningBalance: number;
  notes?: string | null;
}

export interface LoanSubsidiaryLedgerSummary {
  isGoodsMarkup: boolean;
  costPrice: number;
  markupAmount: number;
  totalContractAmount: number;
  totalDebit: number;
  totalCredit: number;
  endingBalance: number;
  entries: LoanSubsidiaryLedgerEntry[];
}

export interface LoanSubsidiaryLedgerModalProps {
  loanRecord: PaidOffLoanReportRow | null;
  onClose: () => void;
  onOpenInMatrix?: (loanNumber: string) => void;
  onInspectInFinancialReport?: (targetUrl: string) => void;
}

const formatRp = (amount: number = 0): string =>
  'Rp ' + Math.round(Number(amount) || 0).toLocaleString('id-ID');

function toTimestamp(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const parsed = new Date(dateStr).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function resolvePortions(params: {
  amountPaid: number;
  targetAmount: number;
  explicitPrincipal?: number | null;
  explicitMargin?: number | null;
  schedulePrincipal?: number | null;
  scheduleMargin?: number | null;
  costPrice: number;
  markupAmount: number;
  totalContractAmount: number;
  isGoodsMarkup: boolean;
}): { principalPortion: number; marginPortion: number } {
  const paid = Math.max(0, Math.round(Number(params.amountPaid) || 0));
  if (paid <= 0) {
    return { principalPortion: 0, marginPortion: 0 };
  }
  if (!params.isGoodsMarkup) {
    return { principalPortion: paid, marginPortion: 0 };
  }

  const expPrincipal = Math.max(0, Math.round(Number(params.explicitPrincipal || 0)));
  const expMargin = Math.max(0, Math.round(Number(params.explicitMargin || 0)));
  if (expPrincipal + expMargin > 0) {
    return { principalPortion: expPrincipal, marginPortion: expMargin };
  }

  return calculateRepaymentPortions({
    amountPaid: paid,
    targetAmount: params.targetAmount,
    schedulePrincipalPortion: params.schedulePrincipal,
    scheduleMarginPortion: params.scheduleMargin,
    loanCostPrice: params.costPrice,
    loanMarkupAmount: params.markupAmount,
    loanTotalAmount: params.totalContractAmount,
  });
}

/**
 * Menyusun kronologi buku pembantu piutang pinjaman dari pencairan/akad awal (Debit)
 * hingga seluruh mutasi pelunasan angsuran (Kredit) beserta saldo utang berjalan.
 */
export function buildLoanSubsidiaryLedger(
  loanRecord: PaidOffLoanReportRow
): LoanSubsidiaryLedgerSummary {
  const loanTypeCodeUpper = String(loanRecord.loanTypeCode || '').trim().toUpperCase();
  const rawCost = Math.max(0, Math.round(Number(loanRecord.costPrice || 0)));
  const rawMarkup = Math.max(0, Math.round(Number(loanRecord.markupAmount || 0)));
  const isGoodsMarkup =
    loanRecord.financingScheme === 'GOODS_MARKUP' ||
    rawCost > 0 ||
    rawMarkup > 0 ||
    Boolean(loanRecord.itemDescription?.trim()) ||
    loanTypeCodeUpper === 'PEMBIAYAAN_BARANG' ||
    loanTypeCodeUpper === 'GOODS_MARKUP';

  const totalContractAmount = Math.max(
    Math.round(Number(loanRecord.principalAmount || 0)),
    rawCost + rawMarkup
  );

  let costPrice = totalContractAmount;
  let markupAmount = 0;

  if (isGoodsMarkup) {
    if (rawCost > 0 && rawMarkup === 0 && totalContractAmount >= rawCost) {
      costPrice = rawCost;
      markupAmount = totalContractAmount - rawCost;
    } else if (rawMarkup > 0 && rawCost === 0 && totalContractAmount >= rawMarkup) {
      costPrice = totalContractAmount - rawMarkup;
      markupAmount = rawMarkup;
    } else {
      costPrice = rawCost > 0 ? rawCost : totalContractAmount;
      markupAmount = rawMarkup;
    }
  }

  const disbursementEntry: LoanSubsidiaryLedgerEntry = {
    id: `disbursement-${loanRecord.loanId || loanRecord.id}`,
    kind: 'disbursement',
    date: loanRecord.disbursedAt,
    referenceNumber: loanRecord.loanNumber,
    description: isGoodsMarkup
      ? 'Realisasi Akad Pembiayaan Barang / Pencairan Pinjaman'
      : 'Realisasi Akad / Pencairan Pinjaman',
    subDescription: isGoodsMarkup
      ? `Harga Modal ${formatRp(costPrice)} + Margin ${formatRp(markupAmount)}${
          loanRecord.itemDescription ? ` • ${loanRecord.itemDescription}` : ''
        }`
      : `${loanRecord.loanTypeName} • Tenor ${loanRecord.tenor} Bln • Bunga 0%`,
    periodNumber: null,
    paymentMethod: null,
    principalPortion: isGoodsMarkup ? costPrice : totalContractAmount,
    marginPortion: isGoodsMarkup ? markupAmount : 0,
    debit: totalContractAmount,
    credit: 0,
    runningBalance: totalContractAmount,
    notes: loanRecord.notes || null,
  };

  const positiveRepayments = (loanRecord.repayments || []).filter(
    (r) => Number(r.amountPaid || 0) > 0
  );
  const { cleaned: validRepayments } =
    filterRedundantLegacySaldoAwalRepayments(positiveRepayments);
  const paidSchedules = (loanRecord.schedules || [])
    .filter(
      (s) =>
        Number(s.paidAmount || 0) > 0 ||
        String(s.status || '').toLowerCase() === 'paid'
    )
    .slice()
    .sort((a, b) => Number(a.periodNumber || 0) - Number(b.periodNumber || 0));

  const repaymentsBySchedule = new Map<string, typeof validRepayments>();
  validRepayments.forEach((r) => {
    if (!r.scheduleId) return;
    const list = repaymentsBySchedule.get(r.scheduleId) || [];
    list.push(r);
    repaymentsBySchedule.set(r.scheduleId, list);
  });

  const creditEntries: LoanSubsidiaryLedgerEntry[] = [];
  const consumedRepaymentIds = new Set<string>();

  if (paidSchedules.length > 0) {
    paidSchedules.forEach((sched) => {
      const schedRepays = (repaymentsBySchedule.get(sched.id) || [])
        .slice()
        .sort((a, b) => toTimestamp(a.paymentDate) - toTimestamp(b.paymentDate));

      if (schedRepays.length > 0) {
        schedRepays.forEach((repay) => {
          consumedRepaymentIds.add(repay.id);
          const creditAmount = Math.round(Number(repay.amountPaid || 0));
          const portions = resolvePortions({
            amountPaid: creditAmount,
            targetAmount: Number(sched.targetAmount || creditAmount),
            explicitPrincipal: repay.principalPortion,
            explicitMargin: repay.marginPortion,
            schedulePrincipal: sched.principalPortion,
            scheduleMargin: sched.marginPortion,
            costPrice,
            markupAmount,
            totalContractAmount,
            isGoodsMarkup,
          });

          creditEntries.push({
            id: `repay-${repay.id}`,
            kind: 'repayment',
            date: repay.paymentDate || sched.paymentDate || sched.dueDate || null,
            referenceNumber: repay.receiptNumber || sched.receiptNumber || '-',
            description: `Angsuran Ke-${sched.periodNumber}`,
            subDescription: sched.dueDate
              ? `Jatuh tempo ${formatReportDate(sched.dueDate)}`
              : null,
            periodNumber: sched.periodNumber,
            paymentMethod: repay.paymentMethod || sched.paymentMethod || null,
            principalPortion: portions.principalPortion,
            marginPortion: portions.marginPortion,
            debit: 0,
            credit: creditAmount,
            runningBalance: 0,
            notes: repay.notes || sched.notes || null,
          });
        });
      } else {
        const creditAmount = Math.round(
          Number(sched.paidAmount || sched.targetAmount || 0)
        );
        const portions = resolvePortions({
          amountPaid: creditAmount,
          targetAmount: Number(sched.targetAmount || creditAmount),
          explicitPrincipal: sched.principalPortion,
          explicitMargin: sched.marginPortion,
          costPrice,
          markupAmount,
          totalContractAmount,
          isGoodsMarkup,
        });

        creditEntries.push({
          id: `sched-${sched.id}`,
          kind: 'repayment',
          date: sched.paymentDate || sched.dueDate || null,
          referenceNumber: sched.receiptNumber || '-',
          description: `Angsuran Ke-${sched.periodNumber}`,
          subDescription: sched.dueDate
            ? `Jatuh tempo ${formatReportDate(sched.dueDate)}`
            : null,
          periodNumber: sched.periodNumber,
          paymentMethod: sched.paymentMethod || null,
          principalPortion: portions.principalPortion,
          marginPortion: portions.marginPortion,
          debit: 0,
          credit: creditAmount,
          runningBalance: 0,
          notes: sched.notes || null,
        });
      }
    });

    const unlinkedRepayments = validRepayments
      .filter((r) => !consumedRepaymentIds.has(r.id))
      .sort((a, b) => toTimestamp(a.paymentDate) - toTimestamp(b.paymentDate));

    unlinkedRepayments.forEach((repay, idx) => {
      const creditAmount = Math.round(Number(repay.amountPaid || 0));
      const portions = resolvePortions({
        amountPaid: creditAmount,
        targetAmount: creditAmount,
        explicitPrincipal: repay.principalPortion,
        explicitMargin: repay.marginPortion,
        costPrice,
        markupAmount,
        totalContractAmount,
        isGoodsMarkup,
      });

      creditEntries.push({
        id: `repay-unlinked-${repay.id}`,
        kind: 'repayment',
        date: repay.paymentDate || null,
        referenceNumber: repay.receiptNumber || '-',
        description: repay.periodNumber
          ? `Angsuran Ke-${repay.periodNumber}`
          : `Pelunasan Angsuran #${idx + 1}`,
        subDescription: repay.notes || null,
        periodNumber: repay.periodNumber ?? null,
        paymentMethod: repay.paymentMethod || null,
        principalPortion: portions.principalPortion,
        marginPortion: portions.marginPortion,
        debit: 0,
        credit: creditAmount,
        runningBalance: 0,
        notes: repay.notes || null,
      });
    });
  } else if (validRepayments.length > 0) {
    validRepayments
      .slice()
      .sort((a, b) => toTimestamp(a.paymentDate) - toTimestamp(b.paymentDate))
      .forEach((repay, idx) => {
        const creditAmount = Math.round(Number(repay.amountPaid || 0));
        const portions = resolvePortions({
          amountPaid: creditAmount,
          targetAmount: creditAmount,
          explicitPrincipal: repay.principalPortion,
          explicitMargin: repay.marginPortion,
          costPrice,
          markupAmount,
          totalContractAmount,
          isGoodsMarkup,
        });

        creditEntries.push({
          id: `repay-${repay.id}`,
          kind: 'repayment',
          date: repay.paymentDate || null,
          referenceNumber: repay.receiptNumber || '-',
          description: repay.periodNumber
            ? `Angsuran Ke-${repay.periodNumber}`
            : `Pelunasan Angsuran #${idx + 1}`,
          subDescription: repay.notes || null,
          periodNumber: repay.periodNumber ?? null,
          paymentMethod: repay.paymentMethod || null,
          principalPortion: portions.principalPortion,
          marginPortion: portions.marginPortion,
          debit: 0,
          credit: creditAmount,
          runningBalance: 0,
          notes: repay.notes || null,
        });
      });
  } else if (totalContractAmount > 0) {
    const settledAmount = Math.round(
      loanRecord.totalPaid !== undefined && loanRecord.totalPaid !== null
        ? Number(loanRecord.totalPaid)
        : totalContractAmount
    );
    if (settledAmount > 0) {
      const portions = resolvePortions({
        amountPaid: settledAmount,
        targetAmount: totalContractAmount,
        explicitPrincipal: isGoodsMarkup ? costPrice : settledAmount,
        explicitMargin: isGoodsMarkup ? markupAmount : 0,
        costPrice,
        markupAmount,
        totalContractAmount,
        isGoodsMarkup,
      });

      creditEntries.push({
        id: `settlement-${loanRecord.loanId || loanRecord.id}`,
        kind: 'repayment',
        date: loanRecord.paidOffDate,
        referenceNumber: loanRecord.loanNumber,
        description:
          settledAmount >= totalContractAmount - 5
            ? 'Pelunasan Penuh Pinjaman'
            : 'Akumulasi Angsuran Terbayar',
        subDescription: `Akumulasi ${loanRecord.paidPeriodsCount || loanRecord.tenor} periode angsuran terbayar`,
        periodNumber: null,
        paymentMethod: null,
        principalPortion: portions.principalPortion,
        marginPortion: portions.marginPortion,
        debit: 0,
        credit: settledAmount,
        runningBalance: 0,
        notes: null,
      });
    }
  }

  let runningBalance = totalContractAmount;
  creditEntries.forEach((entry, idx) => {
    runningBalance = runningBalance - entry.credit;
    if (
      runningBalance < 0 ||
      (idx === creditEntries.length - 1 && Math.abs(runningBalance) <= 5)
    ) {
      runningBalance = 0;
    }
    entry.runningBalance = runningBalance;
  });

  const entries = [disbursementEntry, ...creditEntries];
  const totalCredit = creditEntries.reduce((sum, item) => sum + item.credit, 0);
  const endingBalance = entries[entries.length - 1]?.runningBalance ?? 0;

  return {
    isGoodsMarkup,
    costPrice,
    markupAmount,
    totalContractAmount,
    totalDebit: totalContractAmount,
    totalCredit,
    endingBalance,
    entries,
  };
}

/**
 * Menyusun URL deep-link ke /admin/laporan-keuangan berdasarkan komponen margin angsuran.
 */
export function buildFinancialReportUrl(
  loanNumber: string,
  entry: Pick<LoanSubsidiaryLedgerEntry, 'marginPortion' | 'date' | 'referenceNumber'>
): string {
  const hasMargin = Number(entry.marginPortion || 0) > 0;
  const targetTab = hasMargin ? 'shu' : 'cashflow';
  const rawDate = entry.date ? String(entry.date).trim() : '';
  const dateMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
  const txDate = dateMatch ? dateMatch[1] : '';
  const refNum = String(entry.referenceNumber || '').trim();

  const params = new URLSearchParams({
    tab: targetTab,
    ref: loanNumber,
  });
  if (refNum && refNum !== '-' && refNum !== loanNumber) {
    params.set('receipt', refNum);
  }
  if (txDate) {
    params.set('date', txDate);
  }
  return `/admin/laporan-keuangan?${params.toString()}`;
}

function ReceiptBadgeButton({
  entry,
  loanNumber,
  onSelect,
}: {
  entry: LoanSubsidiaryLedgerEntry;
  loanNumber: string;
  onSelect: (targetUrl: string) => void;
}) {
  const targetUrl = buildFinancialReportUrl(loanNumber, entry);
  const hasMargin = Number(entry.marginPortion || 0) > 0;
  const tooltip = hasMargin
    ? 'Klik untuk menelusuri baris referensi di Estimasi SHU Berjalan (/admin/laporan-keuangan)'
    : 'Klik untuk menelusuri mutasi kas angsuran di Laporan Keuangan (/admin/laporan-keuangan)';

  return (
    <button
      type="button"
      onClick={() => onSelect(targetUrl)}
      data-testid={`inspect-receipt-${entry.id}`}
      data-report-url={targetUrl}
      title={tooltip}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] font-semibold hover:underline transition-colors cursor-pointer group ${
        hasMargin
          ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
      }`}
    >
      <span>{entry.referenceNumber}</span>
      <ExternalLink className="w-3 h-3 shrink-0 opacity-75 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function ReceiptNavigateButton({
  entry,
  loanNumber,
  onClose,
}: {
  entry: LoanSubsidiaryLedgerEntry;
  loanNumber: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  return (
    <ReceiptBadgeButton
      entry={entry}
      loanNumber={loanNumber}
      onSelect={(targetUrl) => {
        onClose();
        navigate(targetUrl);
      }}
    />
  );
}

function MatrixNavigateButton({
  loanNumber,
  onClose,
}: {
  loanNumber: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    const targetUrl = `/admin/loan-matrix?search=${encodeURIComponent(loanNumber)}`;
    onClose();
    navigate(targetUrl);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="open-in-loan-matrix-btn"
      title="Buka kontrak pinjaman ini di halaman Matriks Pinjaman (/admin/loan-matrix)"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
    >
      <span>Buka di Matriks Pinjaman</span>
      <span className="text-[11px] font-mono opacity-85">(/admin/loan-matrix)</span>
      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
    </button>
  );
}

export default function LoanSubsidiaryLedgerModal({
  loanRecord,
  onClose,
  onOpenInMatrix,
  onInspectInFinancialReport,
}: LoanSubsidiaryLedgerModalProps) {
  const inRouter = useInRouterContext();

  useEffect(() => {
    if (!loanRecord) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loanRecord, onClose]);

  const summary = useMemo(
    () => (loanRecord ? buildLoanSubsidiaryLedger(loanRecord) : null),
    [loanRecord]
  );

  if (!loanRecord || !summary) return null;

  const totalAkad = summary.totalContractAmount;
  const totalPaid = summary.totalCredit;
  const remainingReceivable = Math.max(0, totalAkad - totalPaid);
  const paidPct = totalAkad > 0 ? Math.min(100, Math.round((totalPaid / totalAkad) * 100)) : 0;
  const isFullyPaid = totalAkad > 0 && totalPaid >= totalAkad - 5;

  const schemeBadgeLabel = summary.isGoodsMarkup
    ? 'Pembiayaan Barang (Markup Margin)'
    : 'Pinjaman Tunai 0%';

  const handleFallbackOpenInMatrix = () => {
    onClose();
    if (onOpenInMatrix) {
      onOpenInMatrix(loanRecord.loanNumber);
    } else if (typeof window !== 'undefined') {
      window.location.assign(
        `/admin/loan-matrix?search=${encodeURIComponent(loanRecord.loanNumber)}`
      );
    }
  };

  const handleFallbackInspectInReport = (targetUrl: string) => {
    onClose();
    if (onInspectInFinancialReport) {
      onInspectInFinancialReport(targetUrl);
    } else if (typeof window !== 'undefined') {
      window.location.assign(targetUrl);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      data-testid="loan-subsidiary-ledger-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loan-subsidiary-ledger-title"
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
                <h2
                  id="loan-subsidiary-ledger-title"
                  className="text-base sm:text-lg font-bold tracking-tight text-white"
                >
                  Buku Pembantu Piutang &amp; Mutasi Angsuran
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-indigo-500/30 border border-indigo-400/40 font-mono text-xs font-bold text-indigo-100 tracking-wide">
                  {loanRecord.loanNumber}
                </span>
                {isFullyPaid ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>✓ Lunas Penuh</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-200 border border-amber-400/40">
                    <Clock className="w-3 h-3" />
                    <span>Berjalan ({paidPct}% Terbayar)</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold text-white">{loanRecord.memberName}</span>
                <span className="text-slate-500">•</span>
                <span>
                  NRP: <span className="font-mono">{loanRecord.nrp}</span>
                </span>
                {loanRecord.tanggal_lahir && (
                  <>
                    <span className="text-slate-500">•</span>
                    <span>Tgl Lahir: {formatTanggalLahirWithAge(loanRecord.tanggal_lahir)}</span>
                  </>
                )}
                <span className="text-slate-500">•</span>
                <span className="text-indigo-200 font-medium">{schemeBadgeLabel}</span>
                <span className="text-slate-400">({loanRecord.loanTypeName})</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal buku pembantu piutang"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/70">
          {/* Uraian Barang Pembiayaan (khusus GOODS_MARKUP) */}
          {summary.isGoodsMarkup && loanRecord.itemDescription && (
            <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl px-4 py-3 flex items-start gap-3 text-xs text-indigo-950">
              <Package className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold uppercase tracking-wider text-[10px] text-indigo-700 block">
                  Uraian Barang Pembiayaan
                </span>
                <p className="font-semibold text-sm text-indigo-950 mt-0.5">
                  {loanRecord.itemDescription}
                </p>
              </div>
            </div>
          )}

          {/* Kartu Ringkasan Kontrak & Struktur Kewajiban */}
          {summary.isGoodsMarkup ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-slate-500" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Harga Modal Supplier
                </p>
                <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums font-mono">
                  {formatRp(summary.costPrice)}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                  Margin Markup
                </p>
                <p className="text-lg font-bold text-indigo-900 mt-1 tabular-nums font-mono">
                  {formatRp(summary.markupAmount)}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                  Total Akad Piutang
                </p>
                <p className="text-lg font-bold text-amber-900 mt-1 tabular-nums font-mono">
                  {formatRp(summary.totalContractAmount)}
                </p>
              </div>

              <div className={`bg-white rounded-xl border ${isFullyPaid ? 'border-emerald-200' : 'border-amber-200'} p-4 shadow-xs relative overflow-hidden`}>
                <div className={`absolute top-0 left-0 right-0 h-1 ${isFullyPaid ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <p className={`text-[11px] font-bold uppercase tracking-wider ${isFullyPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                  Total Terbayar
                </p>
                <p className={`text-lg font-bold ${isFullyPaid ? 'text-emerald-800' : 'text-amber-900'} mt-1 tabular-nums font-mono`}>
                  {formatRp(summary.totalCredit)}
                </p>
                {isFullyPaid ? (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                    100% Lunas • {loanRecord.tenor} Bln
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-amber-700 font-semibold mt-0.5">
                      Berjalan ({paidPct}% Terbayar) • {loanRecord.tenor} Bln
                    </p>
                    <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                      Sisa Piutang: {formatRp(remainingReceivable)}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Plafon Pokok
                </p>
                <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums font-mono">
                  {formatRp(summary.totalContractAmount)}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-sky-200 p-4 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
                  Bunga / Jasa
                </p>
                <p className="text-lg font-bold text-sky-900 mt-1 tabular-nums font-mono">
                  0%
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Pinjaman Tunai 0%</p>
              </div>

              <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                  Tenor
                </p>
                <p className="text-lg font-bold text-amber-900 mt-1 tabular-nums">
                  {loanRecord.tenor} Bulan
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                  {formatRp(loanRecord.monthlyInstallment)} / bln
                </p>
              </div>

              <div className={`bg-white rounded-xl border ${isFullyPaid ? 'border-emerald-200' : 'border-amber-200'} p-4 shadow-xs relative overflow-hidden`}>
                <div className={`absolute top-0 left-0 right-0 h-1 ${isFullyPaid ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <p className={`text-[11px] font-bold uppercase tracking-wider ${isFullyPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                  Total Terbayar
                </p>
                <p className={`text-lg font-bold ${isFullyPaid ? 'text-emerald-800' : 'text-amber-900'} mt-1 tabular-nums font-mono`}>
                  {formatRp(summary.totalCredit)}
                </p>
                {isFullyPaid ? (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                    100% Lunas • {loanRecord.tenor} Bln
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-amber-700 font-semibold mt-0.5">
                      Berjalan ({paidPct}% Terbayar)
                    </p>
                    <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                      Sisa Piutang: {formatRp(remainingReceivable)}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tabel Kronologis Buku Pembantu Kartu Piutang */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-800">
                  Mutasi Kartu Piutang Kronologis (Debit / Kredit / Saldo Berjalan)
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {summary.entries.length} baris mutasi
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Tanggal</th>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                      No. Kwitansi / Ref
                    </th>
                    <th className="px-3 py-2.5 font-semibold min-w-[210px]">
                      Uraian &amp; Rincian Porsi
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-center whitespace-nowrap">
                      Metode
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">
                      Debit (+)
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">
                      Kredit (-)
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">
                      Saldo Piutang
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.entries.map((entry) => {
                    const isDisbursement = entry.kind === 'disbursement';
                    const isZeroEnding = entry.runningBalance === 0;
                    const methodLabel = entry.paymentMethod
                      ? String(entry.paymentMethod).trim().toUpperCase()
                      : null;

                    return (
                      <tr
                        key={entry.id}
                        className={
                          isDisbursement
                            ? 'bg-indigo-50/40'
                            : 'hover:bg-slate-50/80 transition-colors'
                        }
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                          {formatReportDate(entry.date)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {!isDisbursement &&
                          entry.referenceNumber &&
                          entry.referenceNumber !== '-' ? (
                            inRouter ? (
                              <ReceiptNavigateButton
                                entry={entry}
                                loanNumber={loanRecord.loanNumber}
                                onClose={onClose}
                              />
                            ) : (
                              <ReceiptBadgeButton
                                entry={entry}
                                loanNumber={loanRecord.loanNumber}
                                onSelect={handleFallbackInspectInReport}
                              />
                            )
                          ) : (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                                isDisbursement
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {entry.referenceNumber}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            {isDisbursement ? (
                              <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            ) : (
                              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            )}
                            <span>{entry.description}</span>
                          </div>
                          {entry.subDescription && (
                            <div className="text-[11px] text-slate-500 mt-0.5 pl-5">
                              {entry.subDescription}
                            </div>
                          )}
                          {!isDisbursement && (
                            <div className="text-[11px] text-slate-500 mt-0.5 pl-5 font-mono">
                              Pokok: {formatRp(entry.principalPortion)} • Margin:{' '}
                              {formatRp(entry.marginPortion)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {methodLabel ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                              {methodLabel}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap text-indigo-700 tabular-nums">
                          {entry.debit > 0 ? `+${formatRp(entry.debit)}` : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap text-emerald-700 tabular-nums">
                          {entry.credit > 0 ? formatRp(entry.credit) : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap tabular-nums">
                          {isZeroEnding ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-700">
                              <span>{formatRp(0)}</span>
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-sans font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Lunas
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-800">
                              {formatRp(entry.runningBalance)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100/90 border-t-2 border-slate-200 font-bold text-slate-900">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-2.5 text-[11px] uppercase tracking-wider text-slate-700"
                    >
                      TOTAL MUTASI KARTU PIUTANG
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-indigo-700 whitespace-nowrap">
                      {formatRp(summary.totalDebit)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                      {formatRp(summary.totalCredit)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${isFullyPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {formatRp(summary.endingBalance)}{' '}
                      {summary.endingBalance === 0 ? '(Lunas)' : ''}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {inRouter ? (
            <MatrixNavigateButton loanNumber={loanRecord.loanNumber} onClose={onClose} />
          ) : (
            <button
              type="button"
              onClick={handleFallbackOpenInMatrix}
              data-testid="open-in-loan-matrix-btn"
              title="Buka kontrak pinjaman ini di halaman Matriks Pinjaman (/admin/loan-matrix)"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <span>Buka di Matriks Pinjaman</span>
              <span className="text-[11px] font-mono opacity-85">(/admin/loan-matrix)</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { loanService, isGoodsMarkupLoan } from '../../services/loanService';
import { supabase } from '../../lib/supabaseClient';
import { X, Loader2, DollarSign, BookOpen } from 'lucide-react';
import StatusBadge, { StatusType } from '../ui/StatusBadge';
import { useFeedback } from '../../context/FeedbackContext';

const COMPLETED_CONTRACT_STATUSES = new Set(['completed', 'paid_off', 'lunas', 'paid']);
const PAID_SCHEDULE_STATUSES = new Set(['paid', 'lunas', 'completed', 'settled', 'finished']);

export function mapLoanModalStatus(status?: string | null): StatusType {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'active' || s === 'approved' || s === 'berjalan' || s === 'disbursed') {
    return 'berjalan';
  }
  if (COMPLETED_CONTRACT_STATUSES.has(s)) {
    return 'lunas';
  }
  if (s === 'rejected' || s === 'ditolak') {
    return 'rejected';
  }
  return 'pending';
}

export function isSchedulePeriodPaid(sched: any): boolean {
  if (!sched) return false;
  const rawStatus = String(sched.status || '').trim().toLowerCase();
  const targetAmt = Number(sched.target_amount ?? sched.targetAmount ?? 0);
  const paidAmt = Number(sched.paid_amount ?? sched.paidAmount ?? 0);
  return (
    PAID_SCHEDULE_STATUSES.has(rawStatus) ||
    sched.is_paid === true ||
    (targetAmt > 0 && paidAmt >= targetAmt)
  );
}

export function resolveLoanContractStatus(
  pinjaman: any,
  schedules: any[] = [],
  sisaPinjaman?: number
): StatusType {
  const rawStatus = String(pinjaman?.status || '').trim().toLowerCase();
  if (['pending', 'draft', 'rejected', 'ditolak', 'suspended'].includes(rawStatus)) {
    return mapLoanModalStatus(pinjaman?.status);
  }

  const list = Array.isArray(schedules) ? schedules : [];
  const totalTenor = Number(pinjaman?.tenor || pinjaman?.agreed_tenor_months || list.length || 0);
  const effectiveSisa =
    sisaPinjaman !== undefined
      ? sisaPinjaman
      : pinjaman?.sisa_pinjaman !== null && pinjaman?.sisa_pinjaman !== undefined
        ? Number(pinjaman.sisa_pinjaman)
        : 0;

  if (list.length > 0) {
    const paidPeriodsCount = list.filter(isSchedulePeriodPaid).length;
    const hasUnpaidSchedules = paidPeriodsCount < list.length;

    if (effectiveSisa <= 0 && !hasUnpaidSchedules && (totalTenor <= 0 || paidPeriodsCount >= totalTenor)) {
      return 'lunas';
    }
    if (effectiveSisa > 0 || hasUnpaidSchedules || (totalTenor > 0 && paidPeriodsCount < totalTenor)) {
      return 'berjalan';
    }
  } else if (
    pinjaman?.sisa_pinjaman !== null &&
    pinjaman?.sisa_pinjaman !== undefined &&
    Number(pinjaman.sisa_pinjaman) > 0 &&
    COMPLETED_CONTRACT_STATUSES.has(rawStatus)
  ) {
    return 'berjalan';
  }

  return mapLoanModalStatus(pinjaman?.status);
}

export interface InstallmentPeriodStatusInfo {
  label: 'Terbayar' | 'Terbayar Sebagian' | 'Menunggak' | 'Belum Jatuh Tempo';
  className: string;
  isPaid: boolean;
}

function getTodayLocalYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getInstallmentPeriodStatus(
  item: any,
  todayYmd: string = getTodayLocalYmd()
): InstallmentPeriodStatusInfo {
  const targetAmt = Number(item?.target_amount ?? item?.targetAmount ?? 0);
  const paidAmt = Number(item?.paid_amount ?? item?.paidAmount ?? 0);
  const rawStatus = String(item?.status || '').trim().toLowerCase();

  if (
    PAID_SCHEDULE_STATUSES.has(rawStatus) ||
    item?.is_paid === true ||
    (targetAmt > 0 && paidAmt >= targetAmt)
  ) {
    return {
      label: 'Terbayar',
      className: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200',
      isPaid: true,
    };
  }

  if ((paidAmt > 0 && (targetAmt <= 0 || paidAmt < targetAmt)) || rawStatus === 'partial') {
    return {
      label: 'Terbayar Sebagian',
      className: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200',
      isPaid: false,
    };
  }

  const dueDateStr = item?.due_date ? String(item.due_date).trim().slice(0, 10) : '';
  if (dueDateStr && /^\d{4}-\d{2}-\d{2}$/.test(dueDateStr) && dueDateStr < todayYmd) {
    return {
      label: 'Menunggak',
      className: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-rose-50 text-rose-700 border-rose-200',
      isPaid: false,
    };
  }

  return {
    label: 'Belum Jatuh Tempo',
    className: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-slate-100 text-slate-600 border-slate-200',
    isPaid: false,
  };
}

// Helper modal for partial payments
function PartialPaymentModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  defaultAmount, 
  title, 
  description,
  scheduleId
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSubmit: (amount: number, scheduleId?: string) => Promise<void>; 
  defaultAmount: number;
  title: string;
  description: string;
  scheduleId?: string;
}) {
  const { showToast } = useFeedback();
  const [amountStr, setAmountStr] = useState(defaultAmount.toString());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmountStr(defaultAmount.toString());
    }
  }, [isOpen, defaultAmount]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(amountStr.replace(/[^0-9]/g, ''), 10);
    if (isNaN(val) || val <= 0) {
      showToast('Jumlah tidak valid', 'warning');
      return;
    }
    setLoading(true);
    try {
      await onSubmit(val, scheduleId);
      showToast('Pembayaran berhasil disimpan', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan pembayaran', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setAmountStr(val);
  };

  const formatRupiah = (val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num).replace('Rp', '').trim();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-md text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-sm text-gray-600">{description}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Bayar (Rp)</label>
            <input
              type="text"
              required
              value={formatRupiah(amountStr)}
              onChange={handleAmountChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !amountStr || parseInt(amountStr, 10) <= 0}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-md hover:bg-opacity-90 font-medium flex items-center disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
              Proses Bayar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export interface LoanDetailModalProps {
  isOpen: boolean;
  loanId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
  initialPinjaman?: any;
  initialSchedules?: any[];
  onOpenCashFlowJournal?: (loan: any) => void;
  loadingJournal?: boolean;
}

export default function LoanDetailModal({
  isOpen,
  loanId,
  onClose,
  onSuccess,
  initialPinjaman = null,
  initialSchedules = [],
  onOpenCashFlowJournal,
  loadingJournal = false,
}: LoanDetailModalProps) {
  const [pinjaman, setPinjaman] = useState<any>(initialPinjaman);
  const [schedules, setSchedules] = useState<any[]>(initialSchedules);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePayment, setActivePayment] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen && loanId) {
      loadData(loanId);
    } else {
      setPinjaman(null);
      setSchedules([]);
      setError(null);
      setActivePayment(null);
    }
  }, [isOpen, loanId]);

  const loadData = async (targetId: string) => {
    try {
      setLoading(true);
      setError(null);
      const [pinjamanData, schedulesData] = await Promise.all([
        loanService.getLoanById(targetId),
        loanService.getLoanSchedules(targetId)
      ]);
      const safeSchedules = schedulesData || [];
      let normalizedPinjaman = pinjamanData;

      if (pinjamanData && safeSchedules.length > 0) {
        const rawStatus = String(pinjamanData.status || '').trim().toLowerCase();
        const totalPaidAmt = safeSchedules.reduce((sum: number, s: any) => sum + Number(s.paid_amount || 0), 0);
        const totalTargetAmt = safeSchedules.reduce((sum: number, s: any) => sum + Number(s.target_amount || 0), 0);
        const principalAmt = Number(pinjamanData.principal_amount || pinjamanData.amount || totalTargetAmt);
        const computedSisa = Math.max(0, principalAmt - totalPaidAmt);

        if (
          COMPLETED_CONTRACT_STATUSES.has(rawStatus) &&
          resolveLoanContractStatus(pinjamanData, safeSchedules, computedSisa) === 'berjalan'
        ) {
          normalizedPinjaman = {
            ...pinjamanData,
            status: 'active',
            sisa_pinjaman: computedSisa,
          };
          try {
            const loansTable: any = supabase.from('loans');
            if (loansTable && typeof loansTable.update === 'function') {
              await loansTable
                .update({ status: 'active', sisa_pinjaman: computedSisa })
                .eq('id', targetId);
            }
          } catch {
            // Non-blocking auto-repair fallback
          }
        }
      }

      setPinjaman(normalizedPinjaman);
      setSchedules(safeSchedules);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat detail pinjaman');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async (amount: number, scheduleId?: string) => {
    if (!loanId) return;
    const targetScheduleId = scheduleId || activePayment?.schedule_id;
    if (targetScheduleId) {
      await loanService.paySchedule(loanId, targetScheduleId, amount, 'CASH', 'Pelunasan parsial jadwal periode terkait');
    } else {
      await loanService.makePayment(loanId, amount, 'CASH', 'Pembayaran cicilan pinjaman (Admin)');
    }

    // Refresh UI & Parent
    await loadData(loanId);
    onSuccess?.();
  };

  if (!isOpen) return null;

  const schedule = schedules;
  const lunasCount = schedules.filter(s => getInstallmentPeriodStatus(s).isPaid).length;
  const sisaCicilan = Math.max(0, (pinjaman?.tenor || 0) - lunasCount);
  const totalPaid = schedules.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0);
  const totalTarget = schedules.reduce((sum, s) => sum + Number(s.target_amount || 0), 0);
  const principalAmount = Number(pinjaman?.principal_amount || pinjaman?.amount || totalTarget);
  const sisaPinjaman = Math.max(0, principalAmount - totalPaid);
  const contractStatus = resolveLoanContractStatus(pinjaman, schedule, sisaPinjaman);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center gap-3 bg-gray-50">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">Detail Pinjaman</h2>
              {pinjaman?.loan_number && (
                <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-mono text-xs font-semibold">
                  {pinjaman.loan_number}
                </span>
              )}
            </div>
            {pinjaman?.anggota && (
              <p className="text-sm text-gray-500">
                {pinjaman.anggota?.nama} ({pinjaman.anggota?.no_anggota || pinjaman.anggota?.nrp})
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pinjaman &&
              (contractStatus === 'berjalan' || contractStatus === 'lunas') &&
              onOpenCashFlowJournal && (
                <button
                  type="button"
                  data-testid="btn-open-loan-journal"
                  onClick={() => onOpenCashFlowJournal(pinjaman)}
                  disabled={loadingJournal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {loadingJournal ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <BookOpen className="w-3.5 h-3.5" />
                  )}
                  <span>Buka Bukti Jurnal &amp; Buku Pembantu</span>
                </button>
              )}
            <button 
              onClick={onClose} 
              className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
          ) : error || !pinjaman ? (
            <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg">
              {error || 'Data pinjaman tidak ditemukan'}
            </div>
          ) : (
            <>
              {/* Ringkasan Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Status Pinjaman</p>
                    <StatusBadge status={contractStatus} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Jenis Pinjaman</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {pinjaman.loan_types?.name || 'Reguler'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Total Pinjaman</p>
                    <p className="text-base font-bold text-gray-900">
                      Rp {principalAmount.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Tenor</p>
                    <p className="text-base font-bold text-gray-900">
                      {pinjaman.tenor} Bulan
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Sisa Cicilan</p>
                    <p className="text-base font-bold text-gray-900">
                      Rp {sisaPinjaman.toLocaleString('id-ID')}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {sisaCicilan} Bulan tersisa
                    </p>
                  </div>
                </div>
              </div>

              {/* Ringkasan Pembiayaan Barang (Murabahah) jika berlaku */}
              {isGoodsMarkupLoan(pinjaman) && (
                <div className="bg-teal-50/70 rounded-xl border border-teal-200 p-4 space-y-2 text-xs sm:text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-teal-900">
                      Rincian Pembiayaan Barang (Markup Margin — 0% Bunga)
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-semibold border border-teal-200">
                      Murabahah
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                    <div>
                      <p className="text-teal-700 text-xs">Nama Barang</p>
                      <p className="font-semibold text-teal-950">{pinjaman.item_description || '-'}</p>
                    </div>
                    <div>
                      <p className="text-teal-700 text-xs">Harga Modal Supplier</p>
                      <p className="font-semibold text-teal-950">
                        Rp {Number(pinjaman.cost_price || 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div>
                      <p className="text-teal-700 text-xs">Margin Markup</p>
                      <p className="font-semibold text-teal-950">
                        Rp {Number(pinjaman.markup_amount || 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div>
                      <p className="text-teal-700 text-xs">Harga Jual Akad</p>
                      <p className="font-bold text-teal-950">
                        Rp {principalAmount.toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Ringkasan Kompensasi Pelunasan Pinjaman Lama Sejenis jika berlaku */}
              {Number(pinjaman.topup_settlement_amount || 0) > 0 && (() => {
                const settlementAmt = Number(pinjaman.topup_settlement_amount || 0);
                const grossBase = isGoodsMarkupLoan(pinjaman)
                  ? Number(
                      pinjaman.cost_price ??
                        Math.max(0, principalAmount - Number(pinjaman.markup_amount || 0))
                    )
                  : principalAmount;
                const netCash = Math.max(0, grossBase - settlementAmt);
                return (
                  <div className="bg-indigo-50/70 rounded-xl border border-indigo-200 p-4 space-y-2 text-xs sm:text-sm">
                    <div className="font-bold text-indigo-900">
                      Rincian Kompensasi Pelunasan Pinjaman Lama Sejenis
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <p className="text-indigo-700 text-xs">Nilai Pencairan</p>
                        <p className="font-semibold text-indigo-950">
                          Rp {grossBase.toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div>
                        <p className="text-rose-700 text-xs">Potongan Pelunasan Pinjaman Lama</p>
                        <p className="font-semibold text-rose-800">
                          - Rp {settlementAmt.toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div>
                        <p className="text-emerald-700 text-xs">Sisa Uang Diterima Peminjam</p>
                        <p className="font-bold text-emerald-900">
                          Rp {netCash.toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Catatan / Keterangan Kontrak */}
              {pinjaman.notes && String(pinjaman.notes).trim().length > 0 && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs sm:text-sm">
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    Catatan / Keterangan Kontrak
                  </p>
                  <p className="text-slate-800 leading-relaxed">{pinjaman.notes}</p>
                </div>
              )}

              {/* Jadwal Angsuran Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <h3 className="text-base font-semibold text-gray-900">Jadwal Angsuran</h3>
                  <span className="text-xs text-gray-500">
                    {lunasCount} dari {schedule.length} periode terbayar
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-4 py-3 font-medium text-center">Bulan Ke</th>
                        <th className="px-4 py-3 font-medium">Periode</th>
                        <th className="px-4 py-3 font-medium">Tagihan</th>
                        <th className="px-4 py-3 font-medium">Total Dibayar</th>
                        <th className="px-4 py-3 font-medium">Sisa Tagihan</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {schedule.map((item) => {
                        const statusInfo = getInstallmentPeriodStatus(item);
                        return (
                        <tr key={item.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-gray-900 font-medium text-center">
                            {item.period_number}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {item.due_date}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            <div>Rp {Number(item.target_amount).toLocaleString('id-ID')}</div>
                            {Number(item.margin_portion || 0) > 0 && (
                              <div className="text-[11px] text-teal-700">
                                Pokok Rp {Number(item.principal_portion || 0).toLocaleString('id-ID')} + Margin Rp {Number(item.margin_portion || 0).toLocaleString('id-ID')}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-green-600 font-medium">
                            Rp {Number(item.paid_amount).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3 text-red-500 font-medium">
                            Rp {Math.max(0, Math.round(Number(item.target_amount) - Number(item.paid_amount))).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3">
                            <span className={statusInfo.className}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!statusInfo.isPaid && (
                              <button
                                onClick={() => setActivePayment({ 
                                  schedule_id: item.id, 
                                  remaining: Math.max(0, Math.round(Number(item.target_amount) - Number(item.paid_amount))) 
                                })}
                                className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                Bayar Parsial
                              </button>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                      {schedule.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                            Jadwal angsuran tidak tersedia.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <PartialPaymentModal 
        isOpen={activePayment !== null}
        onClose={() => setActivePayment(null)}
        onSubmit={handleProcessPayment}
        defaultAmount={activePayment ? activePayment.remaining : 0}
        scheduleId={activePayment?.schedule_id}
        title="Pembayaran Cicilan Pinjaman"
        description={activePayment ? `Pembayaran cicilan untuk tagihan Rp ${activePayment.remaining.toLocaleString('id-ID')}` : ''}
      />
    </div>
  );
}


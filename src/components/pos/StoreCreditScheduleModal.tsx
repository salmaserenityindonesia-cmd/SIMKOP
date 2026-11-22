import React, { useState } from 'react';
import {
  X,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Coins,
  Receipt,
  Loader2,
  Wallet,
  Building2,
  User,
  Layers,
  ArrowRight
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatTanggalLahirWithAge } from '../../utils/dateUtils';
import { useFeedback } from '../../context/FeedbackContext';
import {
  payStoreCreditSchedule,
  StoreCreditPlanWithSchedules,
  StoreCreditSchedule
} from '../../services/storeCreditLedgerService';

export interface StoreCreditScheduleModalProps {
  isOpen: boolean;
  plan: StoreCreditPlanWithSchedules | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StoreCreditScheduleModal({
  isOpen,
  plan,
  onClose,
  onSuccess
}: StoreCreditScheduleModalProps) {
  const { showToast } = useFeedback();

  const [paymentMethod, setPaymentMethod] = useState<'potong_gaji' | 'tunai' | 'transfer'>('potong_gaji');
  const generateReceiptNo = () => `KWT-ANGS-${Date.now().toString().slice(-6)}`;
  const [receiptNo, setReceiptNo] = useState<string>(generateReceiptNo);
  const [notes, setNotes] = useState<string>('');
  const [submittingScheduleId, setSubmittingScheduleId] = useState<string | null>(null);
  const [isPayingAll, setIsPayingAll] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [customAmounts, setCustomAmounts] = useState<{ [scheduleId: string]: string }>({});

  if (!isOpen || !plan) return null;

  const schedules = (plan.schedules || []).slice().sort((a, b) => (a.period_number || 0) - (b.period_number || 0));
  const unpaidSchedules = schedules.filter(
    (s) => s.status !== 'paid' && Math.max(0, s.target_amount - (s.paid_amount || 0)) > 0
  );

  const handleAmountChange = (scheduleId: string, val: string) => {
    setCustomAmounts((prev) => ({
      ...prev,
      [scheduleId]: val
    }));
  };

  const handlePaySchedule = async (schedule: StoreCreditSchedule) => {
    const remaining = Math.max(0, schedule.target_amount - (schedule.paid_amount || 0));
    const inputVal = customAmounts[schedule.id];
    const amountToPay = inputVal !== undefined && inputVal !== '' ? Number(inputVal) : remaining;

    if (isNaN(amountToPay) || amountToPay <= 0) {
      showToast('Nominal angsuran harus lebih besar dari 0', 'error');
      return;
    }

    if (amountToPay > remaining) {
      showToast('Nominal melebihi sisa tagihan periode ini', 'warning');
      return;
    }

    setPaymentError(null);
    setSubmittingScheduleId(schedule.id);
    try {
      const res = await payStoreCreditSchedule({
        scheduleId: schedule.id,
        amount: amountToPay,
        paymentMethod,
        receiptNo: receiptNo.trim() || undefined,
        notes: notes.trim() || undefined
      });

      if (res.success) {
        setReceiptNo(generateReceiptNo());
        showToast('Angsuran bon toko berhasil dibayar & tercatat', 'success');
        onSuccess();
      } else {
        const errMsg = res.error || 'Gagal memproses pembayaran angsuran';
        setPaymentError(errMsg);
        showToast(errMsg, 'error');
      }
    } catch (err: any) {
      console.error('Error payStoreCreditSchedule:', err);
      const errMsg = err?.message || 'Terjadi kesalahan sistem saat memproses angsuran';
      setPaymentError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setSubmittingScheduleId(null);
    }
  };

  const handlePayAllRemaining = async () => {
    if (unpaidSchedules.length === 0 || isPayingAll || submittingScheduleId !== null) return;

    setPaymentError(null);
    setIsPayingAll(true);
    let paidCount = 0;

    try {
      for (const s of unpaidSchedules) {
        const remaining = Math.max(0, s.target_amount - (s.paid_amount || 0));
        if (remaining <= 0) continue;

        const currentReceipt = receiptNo.trim() || generateReceiptNo();
        const res = await payStoreCreditSchedule({
          scheduleId: s.id,
          amount: remaining,
          paymentMethod,
          receiptNo: currentReceipt,
          notes: notes.trim() || undefined
        });

        setReceiptNo(generateReceiptNo());

        if (!res.success) {
          const errMsg = res.error || `Gagal melunasi angsuran Periode Ke-${s.period_number}`;
          setPaymentError(errMsg);
          showToast(errMsg, 'error');
          if (paidCount > 0) {
            onSuccess();
          }
          return;
        }

        paidCount += 1;
      }

      if (paidCount > 0) {
        showToast(`Berhasil melunasi ${paidCount} periode sisa angsuran bon toko`, 'success');
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error handlePayAllRemaining:', err);
      const errMsg = err?.message || 'Terjadi kesalahan sistem saat melunasi seluruh sisa periode';
      setPaymentError(errMsg);
      showToast(errMsg, 'error');
      if (paidCount > 0) {
        onSuccess();
      }
    } finally {
      setIsPayingAll(false);
    }
  };

  const getStatusBadge = (status: 'unpaid' | 'partial' | 'paid', paid: number, target: number) => {
    if (status === 'paid' || paid >= target) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-emerald-950/90 text-emerald-300 border border-emerald-700/70 font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          LUNAS
        </span>
      );
    }
    if (status === 'partial' || (paid > 0 && paid < target)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-amber-950/90 text-amber-300 border border-amber-700/70 font-semibold">
          <Clock className="w-3.5 h-3.5" />
          SEBAGIAN
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-rose-950/90 text-rose-300 border border-rose-700/70 font-semibold">
        <AlertCircle className="w-3.5 h-3.5" />
        BELUM BAYAR
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      data-testid="store-credit-schedule-modal"
    >
      <div className="bg-slate-900 rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-700/80 max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/80 flex items-center justify-between bg-gradient-to-r from-emerald-800 to-teal-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Buku Bantu Angsuran Bon Toko</h2>
              <p className="text-xs text-emerald-100">
                Jadwal angsuran potong gaji & penagihan kredit bon toko anggota
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-900 text-slate-100 text-sm">
          {/* 1. Ringkasan Identitas Anggota & Rencana Konsolidasi */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Profil Anggota */}
            <div className="bg-slate-800/80 border border-emerald-700/50 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-2 text-emerald-300 font-semibold">
                <User className="w-4 h-4" />
                <span>Identitas Anggota</span>
              </div>
              <div>
                <p className="text-base font-bold text-white">
                  {plan.anggota?.nama || 'Anggota'}
                </p>
                <p className="text-xs text-slate-300">
                  NRP: <span className="font-semibold text-white">{plan.anggota?.nrp || '-'}</span>
                </p>
                {plan.anggota?.tanggal_lahir && (
                  <p className="text-xs text-slate-300">
                    Tgl Lahir: <span className="font-semibold text-white">{formatTanggalLahirWithAge(plan.anggota.tanggal_lahir)}</span>
                  </p>
                )}
              </div>
              <div className="mt-3 pt-2 border-t border-slate-700/80 flex items-center justify-between text-xs">
                <span className="text-slate-400">Status Rencana:</span>
                <span className="font-bold uppercase text-emerald-400">
                  {plan.status === 'active' ? 'Aktif' : plan.status === 'paid_off' ? 'Lunas' : 'Ditimpa'}
                </span>
              </div>
            </div>

            {/* Rincian Akumulasi Konsolidasi */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2 text-slate-200 font-semibold">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Rincian Akumulasi Bon</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-300">Sisa Bon Lama:</span>
                  <span className="font-medium text-slate-100">
                    {formatCurrency(plan.previous_unpaid_balance || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Nota Baru:</span>
                  <span className="font-medium text-emerald-400">
                    + {formatCurrency(plan.new_credit_amount || 0)}
                  </span>
                </div>
                <div className="pt-1.5 border-t border-slate-700 flex justify-between font-bold text-white">
                  <span>Total Konsolidasi:</span>
                  <span className="text-emerald-400">
                    {formatCurrency(plan.total_consolidated_debt || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Tenor & Angsuran Bulanan */}
            <div className="bg-slate-800/80 border border-teal-700/50 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-2 text-teal-300 font-semibold">
                <Coins className="w-4 h-4" />
                <span>Tenor & Skema</span>
              </div>
              <div>
                <p className="text-xs text-slate-300">Tenor Aktif</p>
                <p className="text-base font-bold text-white">
                  {plan.tenor_months} Bulan
                </p>
                <p className="text-xs text-slate-300 mt-1">Angsuran Potong Gaji / Bulan</p>
                <p className="text-lg font-black text-emerald-400">
                  {formatCurrency(plan.monthly_installment || 0)}
                </p>
              </div>
              <div className="mt-2 text-[11px] text-teal-300/90">
                Terbagi ke dalam {schedules.length} periode tagihan bulanan
              </div>
            </div>
          </div>

          {/* 2. Form Penagihan Angsuran (Metode Bayar, No. Kwitansi, Catatan) */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              Pengaturan Penagihan / Pembayaran
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Pilihan Metode Bayar */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Metode Pembayaran
                </label>
                <div className="flex rounded-lg border border-slate-600 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('potong_gaji')}
                    className={`flex-1 py-1.5 px-2 font-medium flex items-center justify-center gap-1 transition-colors ${
                      paymentMethod === 'potong_gaji'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Potong Gaji
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('tunai')}
                    className={`flex-1 py-1.5 px-2 font-medium flex items-center justify-center gap-1 transition-colors border-l border-slate-600 ${
                      paymentMethod === 'tunai'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    Tunai
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('transfer')}
                    className={`flex-1 py-1.5 px-2 font-medium flex items-center justify-center gap-1 transition-colors border-l border-slate-600 ${
                      paymentMethod === 'transfer'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Transfer
                  </button>
                </div>
              </div>

              {/* No Kwitansi */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  No. Bukti / Kwitansi
                </label>
                <input
                  type="text"
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  placeholder="KWT-ANGS-..."
                  className="w-full text-xs px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder-slate-400"
                />
              </div>

              {/* Catatan */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Catatan (Opsional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Keterangan penagihan..."
                  className="w-full text-xs px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Alert Error Penyimpanan Backend */}
          {paymentError && (
            <div
              role="alert"
              className="bg-rose-950/80 border border-rose-700/80 text-rose-200 rounded-xl px-4 py-3 text-xs flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-rose-300">Gagal Menyimpan Pembayaran Angsuran</p>
                <p className="mt-0.5">{paymentError}</p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentError(null)}
                className="text-rose-300 hover:text-white"
                title="Tutup pesan error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 3. Grid / Tabel Jadwal Angsuran */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                Daftar Jadwal Angsuran Periode ({schedules.length} Periode)
              </h3>
              {unpaidSchedules.length > 0 && (
                <button
                  type="button"
                  onClick={handlePayAllRemaining}
                  disabled={isPayingAll || submittingScheduleId !== null}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  {isPayingAll ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Melunasi Semua Periode...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Lunasi Semua Sisa Periode ({unpaidSchedules.length})</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse text-xs bg-slate-900">
                <thead className="bg-slate-800/95 border-b border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-200">
                  <tr>
                    <th className="py-3 px-3 font-bold">Periode</th>
                    <th className="py-3 px-3 font-bold">Jatuh Tempo</th>
                    <th className="py-3 px-3 font-bold text-right">Target Angsuran</th>
                    <th className="py-3 px-3 font-bold text-right">Terbayar</th>
                    <th className="py-3 px-3 font-bold text-right">Sisa Tagihan</th>
                    <th className="py-3 px-3 font-bold text-center">Status</th>
                    <th className="py-3 px-3 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-slate-900">
                  {schedules.map((s) => {
                    const remaining = Math.max(0, s.target_amount - (s.paid_amount || 0));
                    const isFullyPaid = s.status === 'paid' || remaining <= 0;
                    const isSubmitting = submittingScheduleId === s.id;
                    const customVal = customAmounts[s.id] ?? String(remaining);

                    return (
                      <tr
                        key={s.id}
                        className="bg-slate-900 hover:bg-slate-800/80 border-b border-slate-800 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-bold text-white">
                          Periode Ke-{s.period_number}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-medium">
                          {formatDate(s.due_date)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-100">
                          {formatCurrency(s.target_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-400">
                          {formatCurrency(s.paid_amount || 0)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold ${remaining > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                          {formatCurrency(remaining)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {getStatusBadge(s.status, s.paid_amount || 0, s.target_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isFullyPaid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Lunas
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min="1"
                                max={remaining}
                                value={customVal}
                                onChange={(e) => handleAmountChange(s.id, e.target.value)}
                                className="w-28 text-right bg-slate-800 border border-slate-600 text-white font-semibold rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                title="Nominal yang akan ditagih / dibayarkan"
                              />
                              <button
                                type="button"
                                onClick={() => handlePaySchedule(s)}
                                disabled={isSubmitting || isPayingAll}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium text-xs flex items-center gap-1 transition-colors shadow-sm"
                              >
                                {isSubmitting ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Memproses...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>Tagih / Lunasi Angsuran</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {schedules.length === 0 && (
                    <tr className="bg-slate-900">
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Tidak ada data jadwal angsuran untuk rencana ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-700/80 bg-slate-800/90 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Penagihan angsuran terisolasi khusus di Buku Besar Bon Toko.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl font-medium text-xs transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

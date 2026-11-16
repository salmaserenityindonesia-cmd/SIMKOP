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
  const [receiptNo, setReceiptNo] = useState<string>(`KWT-ANGS-${Date.now().toString().slice(-6)}`);
  const [notes, setNotes] = useState<string>('');
  const [submittingScheduleId, setSubmittingScheduleId] = useState<string | null>(null);
  const [customAmounts, setCustomAmounts] = useState<{ [scheduleId: string]: string }>({});

  if (!isOpen || !plan) return null;

  const schedules = (plan.schedules || []).slice().sort((a, b) => (a.period_number || 0) - (b.period_number || 0));

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
        showToast('Angsuran bon toko berhasil dibayar & tercatat', 'success');
        onSuccess();
      } else {
        showToast(res.error || 'Gagal memproses pembayaran angsuran', 'error');
      }
    } catch (err: any) {
      console.error('Error payStoreCreditSchedule:', err);
      showToast(err?.message || 'Terjadi kesalahan sistem saat memproses angsuran', 'error');
    } finally {
      setSubmittingScheduleId(null);
    }
  };

  const getStatusBadge = (status: 'unpaid' | 'partial' | 'paid', paid: number, target: number) => {
    if (status === 'paid' || paid >= target) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" />
          LUNAS
        </span>
      );
    }
    if (status === 'partial' || (paid > 0 && paid < target)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          <Clock className="w-3.5 h-3.5" />
          SEBAGIAN
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full shadow-2xl border border-gray-100 dark:border-gray-700 max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-emerald-700 to-teal-800 text-white">
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
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-gray-800 dark:text-gray-100 text-sm">
          {/* 1. Ringkasan Identitas Anggota & Rencana Konsolidasi */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Profil Anggota */}
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-2 text-emerald-800 dark:text-emerald-300 font-semibold">
                <User className="w-4 h-4" />
                <span>Identitas Anggota</span>
              </div>
              <div>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {plan.anggota?.nama || 'Anggota'}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  NRP: <span className="font-semibold text-gray-800 dark:text-gray-200">{plan.anggota?.nrp || '-'}</span>
                </p>
                {plan.anggota?.pangkat && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Pangkat: <span className="font-semibold text-gray-800 dark:text-gray-200">{plan.anggota.pangkat}</span>
                  </p>
                )}
              </div>
              <div className="mt-3 pt-2 border-t border-emerald-200/50 dark:border-emerald-800/30 flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Status Rencana:</span>
                <span className="font-semibold uppercase text-emerald-700 dark:text-emerald-400">
                  {plan.status === 'active' ? 'Aktif' : plan.status === 'paid_off' ? 'Lunas' : 'Ditimpa'}
                </span>
              </div>
            </div>

            {/* Rincian Akumulasi Konsolidasi */}
            <div className="bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300 font-semibold">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Rincian Akumulasi Bon</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Sisa Bon Lama:</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {formatCurrency(plan.previous_unpaid_balance || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Nota Baru:</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    + {formatCurrency(plan.new_credit_amount || 0)}
                  </span>
                </div>
                <div className="pt-1.5 border-t border-gray-200 dark:border-gray-600 flex justify-between font-bold text-gray-900 dark:text-gray-100">
                  <span>Total Konsolidasi:</span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(plan.total_consolidated_debt || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Tenor & Angsuran Bulanan */}
            <div className="bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/40 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-2 text-teal-800 dark:text-teal-300 font-semibold">
                <Coins className="w-4 h-4" />
                <span>Tenor & Skema</span>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tenor Aktif</p>
                <p className="text-base font-bold text-teal-900 dark:text-teal-200">
                  {plan.tenor_months} Bulan
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Angsuran Potong Gaji / Bulan</p>
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(plan.monthly_installment || 0)}
                </p>
              </div>
              <div className="mt-2 text-[11px] text-teal-700/80 dark:text-teal-400/80">
                Terbagi ke dalam {schedules.length} periode tagihan bulanan
              </div>
            </div>
          </div>

          {/* 2. Form Penagihan Angsuran (Metode Bayar, No. Kwitansi, Catatan) */}
          <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Pengaturan Penagihan / Pembayaran
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Pilihan Metode Bayar */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Metode Pembayaran
                </label>
                <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('potong_gaji')}
                    className={`flex-1 py-1.5 px-2 font-medium flex items-center justify-center gap-1 transition-colors ${
                      paymentMethod === 'potong_gaji'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Potong Gaji
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('tunai')}
                    className={`flex-1 py-1.5 px-2 font-medium flex items-center justify-center gap-1 transition-colors border-l border-gray-300 dark:border-gray-600 ${
                      paymentMethod === 'tunai'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    Tunai
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('transfer')}
                    className={`flex-1 py-1.5 px-2 font-medium flex items-center justify-center gap-1 transition-colors border-l border-gray-300 dark:border-gray-600 ${
                      paymentMethod === 'transfer'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Transfer
                  </button>
                </div>
              </div>

              {/* No Kwitansi */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  No. Bukti / Kwitansi
                </label>
                <input
                  type="text"
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  placeholder="KWT-ANGS-..."
                  className="w-full text-xs px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Catatan */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Catatan (Opsional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Keterangan penagihan..."
                  className="w-full text-xs px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          {/* 3. Grid / Tabel Jadwal Angsuran */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Daftar Jadwal Angsuran Periode ({schedules.length} Periode)
              </h3>
            </div>

            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-750 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2.5 px-3 font-semibold">Periode</th>
                    <th className="py-2.5 px-3 font-semibold">Jatuh Tempo</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Target Angsuran</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Terbayar</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Sisa Tagihan</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {schedules.map((s) => {
                    const remaining = Math.max(0, s.target_amount - (s.paid_amount || 0));
                    const isFullyPaid = s.status === 'paid' || remaining <= 0;
                    const isSubmitting = submittingScheduleId === s.id;
                    const customVal = customAmounts[s.id] ?? String(remaining);

                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors ${
                          isFullyPaid
                            ? 'bg-emerald-50/20 dark:bg-emerald-950/10'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-750/50'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-gray-100">
                          Periode Ke-{s.period_number}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300">
                          {formatDate(s.due_date)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-gray-800 dark:text-gray-200">
                          {formatCurrency(s.target_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                          {formatCurrency(s.paid_amount || 0)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrency(remaining)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {getStatusBadge(s.status, s.paid_amount || 0, s.target_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isFullyPaid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
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
                                className="w-24 text-right px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs focus:ring-1 focus:ring-emerald-500"
                                title="Nominal yang akan ditagih / dibayarkan"
                              />
                              <button
                                type="button"
                                onClick={() => handlePaySchedule(s)}
                                disabled={isSubmitting}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded font-medium text-xs flex items-center gap-1 transition-colors shadow-sm"
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
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-gray-500 dark:text-gray-400">
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
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Penagihan angsuran terisolasi khusus di Buku Besar Bon Toko.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-medium text-xs transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

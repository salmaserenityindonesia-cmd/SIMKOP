import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Building2,
  Wallet,
  X,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { useFeedback } from '../../context/FeedbackContext';
import { supabase } from '../../lib/supabaseClient';
import {
  AdditionalDepositProduct,
  getMemberActiveLoanSummary,
  MemberActiveLoanSummary,
  MemberAdditionalSavingsSummary,
  recordVoluntaryWithdrawal,
} from '../../services/voluntarySavingsService';

interface VoluntaryWithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  member: MemberAdditionalSavingsSummary;
  product: AdditionalDepositProduct;
  availableBalance: number;
}

export default function VoluntaryWithdrawalModal({
  isOpen,
  onClose,
  onSuccess,
  member,
  product,
  availableBalance,
}: VoluntaryWithdrawalModalProps) {
  const { showToast } = useFeedback();

  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'tunai' | 'transfer'>('tunai');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [loanSummary, setLoanSummary] = useState<MemberActiveLoanSummary>({
    activeLoanCount: 0,
    totalRemainingDebt: 0,
  });
  const [loadingLoanSummary, setLoadingLoanSummary] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setAmount('');
    setPaymentMethod('tunai');
    setReferenceNo(`KW-TARIK-MANDIRI-${Date.now()}`);
    setNotes('');
    setSubmitting(false);

    let active = true;
    setLoadingLoanSummary(true);
    getMemberActiveLoanSummary(member.memberId)
      .then((res) => {
        if (active) setLoanSummary(res);
      })
      .finally(() => {
        if (active) setLoadingLoanSummary(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, member.memberId, product.id]);

  if (!isOpen) return null;

  const numericAmount = Number(amount);
  const isValidNumber = Number.isFinite(numericAmount) && numericAmount > 0;
  const isExceedingBalance = isValidNumber && numericAmount > availableBalance;
  const remainingBalance = isValidNumber
    ? Math.max(0, availableBalance - numericAmount)
    : availableBalance;

  const handleWithdrawAll = () => {
    if (availableBalance > 0) {
      setAmount(String(availableBalance));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidNumber) {
      showToast('Nominal pencairan harus lebih besar dari Rp 0.', 'error');
      return;
    }
    if (isExceedingBalance) {
      showToast('Nominal pencairan melebihi saldo tersedia.', 'error');
      return;
    }
    if (!notes.trim()) {
      showToast('Alasan / keperluan pencairan wajib diisi.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      await recordVoluntaryWithdrawal({
        memberId: member.memberId,
        memberName: member.nama,
        memberNrp: member.nrp,
        depositTypeId: product.id,
        depositTypeName: product.name,
        amount: numericAmount,
        paymentMethod,
        bankAccountNumber: member.bank_account_number || undefined,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim(),
        userId: userData?.user?.id,
      });

      showToast(
        `Pencairan ${product.name} sebesar ${formatCurrency(numericAmount)} berhasil dicatat.`,
        'success'
      );
      await onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Gagal memproses pencairan simpanan.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Cairkan / Tarik Simpanan Tambahan
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {member.nama} (<span className="font-mono">{member.nrp}</span>) — {product.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Tutup modal pencairan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Kartu Saldo Produk */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                  Saldo Tersedia Saat Ini ({product.code})
                </div>
                <div className="text-xs text-slate-600 mt-0.5">{product.name}</div>
              </div>
            </div>
            <div className="text-lg font-extrabold text-emerald-700 tabular-nums">
              {formatCurrency(availableBalance)}
            </div>
          </div>

          {/* Banner Pengawasan Kewajiban Pinjaman */}
          {!loadingLoanSummary && loanSummary.totalRemainingDebt > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Catatan Pengawasan:</span> Anggota ini masih
                memiliki {loanSummary.activeLoanCount} pinjaman aktif dengan sisa kewajiban{' '}
                <strong className="tabular-nums">
                  {formatCurrency(loanSummary.totalRemainingDebt)}
                </strong>
                . Pastikan pencairan ini telah disetujui pengurus.
              </div>
            </div>
          )}

          {/* Nominal Pencairan */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Nominal Pencairan (Rp) *
              </label>
              <button
                type="button"
                onClick={handleWithdrawAll}
                disabled={availableBalance <= 0}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-40 cursor-pointer"
              >
                Cairkan Semua
              </button>
            </div>
            <input
              type="number"
              min="1"
              max={availableBalance > 0 ? availableBalance : undefined}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Contoh: 150000"
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 ${
                isExceedingBalance
                  ? 'border-rose-400 text-rose-700 focus:ring-rose-500/30 focus:border-rose-500'
                  : 'border-slate-200 text-slate-900 focus:ring-rose-500/30 focus:border-rose-500'
              }`}
            />
            <div className="mt-1.5 flex items-center justify-between text-xs">
              {isExceedingBalance ? (
                <span className="text-rose-600 font-semibold">
                  Nominal melebihi saldo tersedia ({formatCurrency(availableBalance)})
                </span>
              ) : (
                <span className="text-slate-500">
                  Saldo Tersisa:{' '}
                  <strong className="text-slate-800 tabular-nums">
                    {formatCurrency(remainingBalance)}
                  </strong>
                </span>
              )}
            </div>
          </div>

          {/* Metode Pencairan */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Metode Pencairan *
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentMethod('tunai')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  paymentMethod === 'tunai'
                    ? 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4" />
                Tunai (Kas Loket)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  paymentMethod === 'transfer'
                    ? 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-4 h-4" />
                Transfer Bank
              </button>
            </div>

            {paymentMethod === 'transfer' && (
              <div className="mt-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-center justify-between gap-2">
                <span className="text-blue-700 font-medium">Rekening Bank Anggota:</span>
                <span className="font-mono font-bold">
                  {member.bank_account_number || 'Belum terdaftar di profil anggota'}
                </span>
              </div>
            )}
          </div>

          {/* Nomor Bukti / Referensi */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nomor Bukti / Referensi
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="KW-TARIK-MANDIRI-..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
            />
          </div>

          {/* Alasan / Keperluan Pencairan */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Alasan / Keperluan Pencairan *
            </label>
            <textarea
              rows={2}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Keperluan mendesak / Penarikan tabungan sukarela"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || !isValidNumber || isExceedingBalance || !notes.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4" />
              {submitting ? 'Memproses...' : 'Cairkan Dana'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

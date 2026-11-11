import React, { useState, useEffect, useContext } from 'react';
import { X, ShieldCheck, Wallet, Banknote, CreditCard, AlertCircle, Loader2 } from 'lucide-react';
import FeedbackContext from '../../context/FeedbackContext';
import { getActivePokokTariff, payMemberPrincipalSavings } from '../../services/complianceService';

export interface PelunasanPokokModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  member: {
    id: string;
    nama: string;
    nrp: string;
    status?: string;
    membership_status?: string;
  } | null;
}

export const PelunasanPokokModal: React.FC<PelunasanPokokModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  member,
}) => {
  const feedback = useContext(FeedbackContext);

  const [amount, setAmount] = useState<number>(10000);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [notes, setNotes] = useState<string>('Pelunasan Simpanan Pokok Anggota');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetchingTariff, setIsFetchingTariff] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch active pokok tariff when modal opens for a member
  useEffect(() => {
    if (isOpen && member) {
      let isMounted = true;
      setIsFetchingTariff(true);
      setError(null);
      setPaymentMethod('cash');
      setNotes('Pelunasan Simpanan Pokok Anggota');

      getActivePokokTariff()
        .then((tariff) => {
          if (isMounted) {
            setAmount(tariff > 0 ? tariff : 10000);
          }
        })
        .catch((err) => {
          console.warn('Gagal memuat tarif simpanan pokok:', err);
          if (isMounted) {
            setAmount(10000);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsFetchingTariff(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, member]);

  if (!isOpen || !member) {
    return null;
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, '');
    const num = parseInt(rawVal, 10);
    setAmount(isNaN(num) ? 0 : num);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member?.id) {
      setError('Data anggota tidak valid.');
      return;
    }
    if (amount <= 0) {
      setError('Nominal simpanan pokok harus lebih dari Rp 0.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const res = await payMemberPrincipalSavings({
        memberId: member.id,
        amount,
        paymentMethod,
        notes: notes.trim() || 'Pelunasan Simpanan Pokok Anggota',
      });

      if (!res.success) {
        throw new Error(res.error || 'Gagal menyimpan transaksi simpanan pokok');
      }

      if (feedback?.showToast) {
        feedback.showToast(
          `Simpanan pokok ${member.nama} sebesar Rp ${amount.toLocaleString('id-ID')} berhasil dilunasi.`,
          'success'
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saat submit pelunasan pokok:', err);
      setError(err?.message || 'Terjadi kesalahan sistem saat memproses pelunasan');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-pokok-title"
      data-testid="pelunasan-pokok-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="modal-pokok-title" className="font-bold text-slate-800 text-base">
                Pelunasan Simpanan Pokok
              </h3>
              <p className="text-xs text-slate-500">
                Pencatatan setoran simpanan pokok anggota koperasi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div
              data-testid="pokok-modal-error"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Member Summary Card */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Identitas Anggota
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div data-testid="member-name" className="font-bold text-slate-800 text-sm">
                  {member.nama}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    data-testid="member-nrp"
                    className="text-xs font-mono text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded"
                  >
                    NRP: {member.nrp}
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-300 px-2.5 py-1 rounded-full shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                Pokok: Belum Lunas
              </span>
            </div>
          </div>

          {/* Nominal Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nominal Simpanan Pokok (Rp) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                Rp
              </div>
              <input
                type="text"
                data-testid="amount-input"
                disabled={isLoading || isFetchingTariff}
                value={amount > 0 ? amount.toLocaleString('id-ID') : ''}
                onChange={handleAmountChange}
                placeholder="10.000"
                className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold text-base focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                required
              />
              {isFetchingTariff && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 italic">
              Nominal ditarik otomatis dari Konfigurasi Tarif Iuran Simpanan Pokok Aktif.
            </p>
          </div>

          {/* Metode Pembayaran */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Metode Pembayaran
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                disabled={isLoading}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'bg-emerald-50/80 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/10'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xs">Tunai (Kasir/Kantor)</div>
                  <div className="text-[10px] text-slate-400 font-normal">Setor langsung</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                disabled={isLoading}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                  paymentMethod === 'transfer'
                    ? 'bg-emerald-50/80 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/10'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xs">Transfer Bank</div>
                  <div className="text-[10px] text-slate-400 font-normal">Rekening Koperasi</div>
                </div>
              </button>
            </div>
          </div>

          {/* Catatan / Keterangan */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Catatan / Keterangan (Opsional)
            </label>
            <input
              type="text"
              data-testid="notes-input"
              disabled={isLoading}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Pelunasan Simpanan Pokok Anggota Baru"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              data-testid="cancel-pelunasan-btn"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              data-testid="submit-pelunasan-btn"
              disabled={isLoading || amount <= 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Konfirmasi &amp; Lunaskan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PelunasanPokokModal;

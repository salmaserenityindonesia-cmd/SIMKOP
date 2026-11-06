import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Coins,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wallet,
  Building2,
  Receipt
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { useFeedback } from '../../context/FeedbackContext';
import {
  settleStoreCredit,
  getMemberActiveDebt,
  getMembersWithDebt
} from '../../services/storeCreditLedgerService';

interface MemberOption {
  id: string;
  nama: string;
  nrp: string;
  debt: number;
}

interface BayarBonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialMemberId?: string;
  initialSaleId?: string;
  initialDebtAmount?: number;
  initialReceiptNo?: string;
  initialMemberName?: string;
}

export default function BayarBonModal({
  isOpen,
  onClose,
  onSuccess,
  initialMemberId,
  initialSaleId,
  initialDebtAmount,
  initialReceiptNo,
  initialMemberName
}: BayarBonModalProps) {
  const { showToast } = useFeedback();

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>(initialMemberId || '');
  const [currentDebt, setCurrentDebt] = useState<number>(initialDebtAmount || 0);
  const [amount, setAmount] = useState<string>(initialDebtAmount ? String(initialDebtAmount) : '');
  const [paymentMethod, setPaymentMethod] = useState<'potong_gaji' | 'tunai' | 'transfer'>('potong_gaji');
  const [referenceNo, setReferenceNo] = useState<string>(`BYR-${Date.now().toString().slice(-6)}`);
  const [notes, setNotes] = useState<string>(
    initialReceiptNo ? `Pelunasan Bon Struk #${initialReceiptNo}` : 'Pelunasan Bon Toko Kasir'
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      if (initialMemberId) {
        setSelectedMemberId(initialMemberId);
        if (initialDebtAmount !== undefined) {
          setCurrentDebt(initialDebtAmount);
          setAmount(String(initialDebtAmount));
        } else {
          loadMemberDebt(initialMemberId);
        }
      } else {
        loadDebtorMembers();
      }
      setReferenceNo(`BYR-${Date.now().toString().slice(-6)}`);
    }
  }, [isOpen, initialMemberId, initialDebtAmount]);

  const loadDebtorMembers = async () => {
    setIsLoadingMembers(true);
    try {
      const data = await getMembersWithDebt();
      setMembers(data);
      if (data.length > 0 && !selectedMemberId) {
        setSelectedMemberId(data[0].id);
        setCurrentDebt(data[0].debt);
        setAmount(String(data[0].debt));
      }
    } catch (err) {
      console.warn('Gagal memuat daftar anggota berutang:', err);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const loadMemberDebt = async (memberId: string) => {
    try {
      const debt = await getMemberActiveDebt(memberId);
      setCurrentDebt(debt);
      setAmount(String(debt));
    } catch (err) {
      console.warn('Gagal memuat sisa utang:', err);
    }
  };

  const handleMemberChange = async (memberId: string) => {
    setSelectedMemberId(memberId);
    const found = members.find(m => m.id === memberId);
    if (found) {
      setCurrentDebt(found.debt);
      setAmount(String(found.debt));
    } else {
      await loadMemberDebt(memberId);
    }
  };

  const handlePayFull = () => {
    setAmount(String(currentDebt));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMemberId) {
      showToast('Pilih anggota yang akan melunasi bon.', 'warning');
      return;
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showToast('Nominal pelunasan harus lebih dari Rp 0.', 'warning');
      return;
    }

    if (numericAmount > currentDebt && currentDebt > 0) {
      showToast(`Nominal pelunasan melebihi sisa utang (${formatCurrency(currentDebt)}).`, 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const res = await settleStoreCredit({
        memberId: selectedMemberId,
        saleId: initialSaleId || null,
        amount: numericAmount,
        paymentMethod: paymentMethod,
        referenceNo: referenceNo,
        notes: notes
      });

      if (res.success) {
        showToast(`Pelunasan bon sebesar ${formatCurrency(numericAmount)} berhasil dicatat.`, 'success');
        onSuccess();
        onClose();
      } else {
        showToast(res.error || 'Gagal menyimpan pelunasan bon toko.', 'error');
      }
    } catch (err: any) {
      console.error('Error bayar bon:', err);
      showToast(err.message || 'Terjadi kesalahan sistem saat memproses pelunasan.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 bg-rose-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-rose-600/70 rounded-lg">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Catat Pelunasan Bon Toko</h3>
              <p className="text-xs text-rose-200">Pembayaran Piutang Belanja Kasir Anggota</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-rose-200 hover:text-white p-1 rounded-lg hover:bg-rose-600/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs sm:text-sm">
          {/* Member Selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Anggota Peminjam (Debitur)
            </label>
            {initialMemberId ? (
              <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg font-medium text-gray-800">
                {initialMemberName || 'Anggota Terpilih'}
              </div>
            ) : (
              <select
                value={selectedMemberId}
                onChange={e => handleMemberChange(e.target.value)}
                disabled={isLoadingMembers || members.length === 0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              >
                {members.length === 0 ? (
                  <option value="">Tidak ada anggota dengan utang aktif</option>
                ) : (
                  members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nama} ({m.nrp}) — Sisa Bon: {formatCurrency(m.debt)}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Sisa Utang Bon Aktif Info Card */}
          <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs text-rose-800 font-medium">Total Sisa Bon Tertunggak:</span>
              <div className="text-xl font-bold text-rose-900 mt-0.5">
                {formatCurrency(currentDebt)}
              </div>
            </div>
            {currentDebt > 0 && (
              <button
                type="button"
                onClick={handlePayFull}
                className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-white border border-rose-300 hover:bg-rose-100 rounded-lg shadow-sm transition-colors"
              >
                Lunasi Semua
              </button>
            )}
          </div>

          {/* Nominal Pelunasan */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Nominal Pelunasan (Rp)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                Rp
              </span>
              <input
                type="number"
                min="1"
                max={currentDebt > 0 ? currentDebt : undefined}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                required
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg font-semibold text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>
            {/* Quick buttons */}
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[11px] text-gray-500">Preset:</span>
              {[50000, 100000, 200000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(String(Math.min(currentDebt || val, val)))}
                  className="px-2 py-0.5 text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                >
                  {formatCurrency(val)}
                </button>
              ))}
            </div>
          </div>

          {/* Metode Pembayaran */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Metode Pembayaran
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                  paymentMethod === 'potong_gaji'
                    ? 'border-rose-600 bg-rose-50/50 text-rose-900 font-semibold'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="potong_gaji"
                  checked={paymentMethod === 'potong_gaji'}
                  onChange={() => setPaymentMethod('potong_gaji')}
                  className="sr-only"
                />
                <Building2 className="w-4 h-4 mb-1 text-rose-600" />
                <span>Potong Gaji</span>
              </label>

              <label
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                  paymentMethod === 'tunai'
                    ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 font-semibold'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="tunai"
                  checked={paymentMethod === 'tunai'}
                  onChange={() => setPaymentMethod('tunai')}
                  className="sr-only"
                />
                <Coins className="w-4 h-4 mb-1 text-emerald-600" />
                <span>Tunai Kasir</span>
              </label>

              <label
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                  paymentMethod === 'transfer'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="transfer"
                  checked={paymentMethod === 'transfer'}
                  onChange={() => setPaymentMethod('transfer')}
                  className="sr-only"
                />
                <Wallet className="w-4 h-4 mb-1 text-blue-600" />
                <span>Transfer Bank</span>
              </label>
            </div>
            {paymentMethod === 'tunai' && (
              <p className="text-[11px] text-emerald-700 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Otomatis dicatat ke buku arus kas (cash flow) kategori penjualan/pelunasan toko.
              </p>
            )}
          </div>

          {/* No. Kwitansi / Referensi */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Nomor Bukti / Referensi
            </label>
            <div className="relative">
              <Receipt className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={referenceNo}
                onChange={e => setReferenceNo(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-xs font-mono"
              />
            </div>
          </div>

          {/* Catatan Pelunasan */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Catatan / Keterangan
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Keterangan tambahan pelunasan..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-xs"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading || currentDebt <= 0}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm transition-colors disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Pelunasan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


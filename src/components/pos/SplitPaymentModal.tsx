import React, { useState, useEffect, useRef } from 'react';
import { UserCheck, User } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import MemberCreditBadge from './MemberCreditBadge';

export interface MemberInfo {
  id: string;
  nama?: string;
  name?: string;
  nrp?: string;
  member_number?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cart: any[];
  total: number;
  memberId?: string | null;
  selectedMember?: MemberInfo | null;
  isNonMember?: boolean;
  initialMethod?: string;
  onConfirm: (payload: { paidCash: number; paidDeposit: number; paidCredit: number; scheme: string }) => void;
}

export default function SplitPaymentModal({
  isOpen,
  onClose,
  cart,
  total,
  memberId,
  selectedMember,
  isNonMember: propIsNonMember,
  initialMethod = 'Tunai',
  onConfirm
}: Props) {
  const effectiveMemberId = selectedMember?.id || memberId || null;
  const isNonMember = propIsNonMember ?? !effectiveMemberId;
  const [paidCash, setPaidCash] = useState<string>('');
  const [paidDeposit, setPaidDeposit] = useState<string>('');
  const [paidCredit, setPaidCredit] = useState<string>('');
  
  const [financials, setFinancials] = useState<any>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (isNonMember) {
        setPaidCash(total.toString());
        setPaidDeposit('');
        setPaidCredit('');
        setFinancials(null);
      } else if (initialMethod === 'Potong Simpanan') {
        setPaidDeposit(total.toString());
        setPaidCash('');
        setPaidCredit('');
      } else if (initialMethod === 'Bon Toko') {
        setPaidCredit(total.toString());
        setPaidCash('');
        setPaidDeposit('');
      } else {
        setPaidCash(total.toString());
        setPaidDeposit('');
        setPaidCredit('');
      }

      if (effectiveMemberId) {
        import('../../services/posCreditService').then(s => {
          s.getMemberFinancials(effectiveMemberId).then(setFinancials);
        });
      } else {
        setFinancials(null);
      }

      // Auto-focus and select cash input
      const timer = setTimeout(() => {
        if (cashInputRef.current) {
          cashInputRef.current.focus();
          cashInputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, effectiveMemberId, isNonMember, total, initialMethod]);

  if (!isOpen) return null;

  const cashAmount = Number(paidCash) || 0;
  const depositAmount = isNonMember ? 0 : (Number(paidDeposit) || 0);
  const creditAmount = isNonMember ? 0 : (Number(paidCredit) || 0);

  const totalPaid = cashAmount + depositAmount + creditAmount;
  const remaining = Math.max(0, total - totalPaid);
  const change = Math.max(0, totalPaid - total);

  // Validations
  let error = '';
  if (isNonMember && (depositAmount > 0 || creditAmount > 0 || Number(paidDeposit) > 0 || Number(paidCredit) > 0)) {
    error = 'Pembeli Non-Anggota hanya diperbolehkan menggunakan metode Tunai.';
  } else if (totalPaid < total) {
    error = 'Total pembayaran belum mencukupi.';
  } else if (financials) {
    if (depositAmount > financials.belanjaBalance) {
      error = 'Saldo Simpanan Belanja tidak mencukupi.';
    } else if (creditAmount > financials.remainingCreditLimit) {
      error = 'Nominal Bon Toko melebihi Sisa Limit Bon Aman (THP).';
    }
  } else if (!effectiveMemberId && (depositAmount > 0 || creditAmount > 0)) {
    error = 'Pilih anggota terlebih dahulu untuk menggunakan Simpanan / Bon.';
  }

  const handleQuickCash = (amount: number) => {
    setPaidCash(amount.toString());
  };

  const handleConfirm = () => {
    if (isNonMember && (depositAmount > 0 || creditAmount > 0 || Number(paidDeposit) > 0 || Number(paidCredit) > 0)) {
      return;
    }
    if (error || remaining > 0) return;
    
    let scheme = 'cash';
    if (isNonMember) {
      scheme = 'cash';
    } else if (creditAmount > 0 && (cashAmount > 0 || depositAmount > 0)) {
      scheme = 'split';
    } else if (creditAmount > 0) {
      scheme = 'store_credit';
    } else if (depositAmount > 0 && cashAmount > 0) {
      scheme = 'split';
    } else if (depositAmount > 0) {
      scheme = 'split';
    } else {
      scheme = 'cash';
    }

    onConfirm({
      paidCash: cashAmount,
      paidDeposit: isNonMember ? 0 : depositAmount,
      paidCredit: isNonMember ? 0 : creditAmount,
      scheme
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (!error && remaining === 0) {
        handleConfirm();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/70 backdrop-blur-sm flex items-center justify-center p-3 lg:p-4">
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in duration-150">
        <div className="bg-primary-container text-surface-container-lowest px-4 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed text-[20px]">payments</span>
            <span className="font-title-md text-title-md">Pembayaran (Split Payment)</span>
          </div>
          <button className="text-surface-container-lowest/80 hover:text-surface-container-lowest" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <div className="p-5 flex-1 overflow-y-auto" onKeyDown={handleKeyDown}>
          <div className="text-center mb-6">
            <p className="text-label-lg text-on-surface-variant">Total Tagihan</p>
            <p className="text-[32px] font-black text-primary tracking-tight leading-none mt-1">
              {formatCurrency(total)}
            </p>
          </div>

          {!isNonMember && (selectedMember || effectiveMemberId) ? (
            <div className="bg-blue-50/80 border-2 border-blue-200 rounded-xl p-3.5 mb-4 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    Transaksi Atas Nama Anggota:
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">
                    {selectedMember?.nama || selectedMember?.name || 'Anggota Koperasi'}
                  </div>
                  <div className="text-xs font-medium text-slate-600 font-mono">
                    NRP / ID: {selectedMember?.nrp || selectedMember?.member_number || selectedMember?.id || effectiveMemberId}
                  </div>
                </div>
              </div>
              <span className="shrink-0 ml-2 px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                Anggota Koperasi
              </span>
            </div>
          ) : isNonMember ? (
            <div className="bg-slate-100 border-2 border-slate-300 text-slate-800 rounded-xl p-3.5 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Identitas Pembeli:
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    Transaksi Non-Anggota (Pelanggan Umum)
                  </div>
                </div>
              </div>
              <span className="shrink-0 ml-2 px-3 py-1 text-xs font-semibold rounded-full bg-slate-200 text-slate-700 border border-slate-300 shadow-xs">
                Umum
              </span>
            </div>
          ) : null}

          {effectiveMemberId ? (
            <MemberCreditBadge memberId={effectiveMemberId} onFinancialsLoaded={setFinancials} />
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3 mt-2">
              <span className="material-symbols-outlined text-amber-500 text-[22px] shrink-0 mt-0.5">info</span>
              <div className="text-left">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-on-surface text-sm">Pembeli Non-Anggota / Umum</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                    Khusus Tunai
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Non-anggota tidak memiliki saldo simpanan belanja atau fasilitas bon toko koperasi. Semua transaksi diselesaikan secara tunai.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4 mt-6">
            {/* Input Simpanan */}
            <div className={isNonMember ? "opacity-60" : ""}>
              <div className="flex justify-between items-center text-sm font-semibold text-on-surface mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span>Potong Simpanan Belanja</span>
                  {isNonMember && (
                    <span className="text-[10px] bg-surface-variant text-on-surface-variant px-1.5 py-0.5 rounded font-medium border border-outline-variant/40">
                      Khusus Anggota
                    </span>
                  )}
                </div>
                {!isNonMember && financials && (
                  <button 
                    type="button"
                    onClick={() => setPaidDeposit(Math.min(total, financials.belanjaBalance).toString())}
                    className="text-primary hover:underline text-xs"
                  >
                    Gunakan Maksimal
                  </button>
                )}
              </div>
              <input 
                type="number" 
                disabled={isNonMember}
                readOnly={isNonMember}
                value={isNonMember ? 0 : paidDeposit}
                onChange={e => !isNonMember && setPaidDeposit(e.target.value)}
                placeholder="Rp 0"
                className={`w-full border rounded-lg p-2.5 text-lg font-mono focus:ring-2 focus:ring-primary ${
                  isNonMember 
                    ? 'bg-surface-container-high/50 border-outline-variant/40 text-on-surface-variant/60 cursor-not-allowed select-none' 
                    : 'border-outline-variant bg-surface'
                }`}
              />
              {isNonMember && (
                <p className="text-[11px] text-on-surface-variant/70 mt-1 italic">
                  * Tidak tersedia untuk Non-Anggota
                </p>
              )}
            </div>

            {/* Input Bon */}
            <div className={isNonMember ? "opacity-60" : ""}>
              <div className="flex justify-between items-center text-sm font-semibold text-on-surface mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span>Catat Bon Toko (Potong Gaji)</span>
                  {isNonMember && (
                    <span className="text-[10px] bg-surface-variant text-on-surface-variant px-1.5 py-0.5 rounded font-medium border border-outline-variant/40">
                      Khusus Anggota
                    </span>
                  )}
                </div>
              </div>
              <input 
                type="number" 
                disabled={isNonMember}
                readOnly={isNonMember}
                value={isNonMember ? 0 : paidCredit}
                onChange={e => !isNonMember && setPaidCredit(e.target.value)}
                placeholder="Rp 0"
                className={`w-full border rounded-lg p-2.5 text-lg font-mono focus:ring-2 focus:ring-primary ${
                  isNonMember 
                    ? 'bg-surface-container-high/50 border-outline-variant/40 text-on-surface-variant/60 cursor-not-allowed select-none' 
                    : financials && creditAmount > financials.remainingCreditLimit 
                      ? 'border-error text-error bg-error/10' 
                      : 'border-outline-variant bg-surface'
                }`}
              />
              {isNonMember && (
                <p className="text-[11px] text-on-surface-variant/70 mt-1 italic">
                  * Tidak tersedia untuk Non-Anggota
                </p>
              )}
            </div>

            {/* Input Tunai */}
            <div>
              <div className="flex justify-between items-center text-sm font-semibold text-on-surface mb-1.5">
                <span>Tunai Diterima</span>
                {isNonMember && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded font-bold border border-emerald-500/20">
                    Wajib Tunai
                  </span>
                )}
              </div>
              <input 
                ref={cashInputRef}
                type="number" 
                value={paidCash}
                onChange={e => setPaidCash(e.target.value)}
                placeholder="Rp 0"
                className="w-full border border-outline-variant rounded-lg p-2.5 text-lg font-mono focus:ring-2 focus:ring-primary bg-surface"
              />
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1 custom-scrollbar">
                {[total, 50000, 100000, 200000].filter((amt, idx, arr) => arr.indexOf(amt) === idx).map((amt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickCash(amt)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded text-sm font-medium transition-colors border ${
                      amt === total
                        ? 'bg-primary/10 text-primary border-primary/30 font-bold hover:bg-primary/20'
                        : 'bg-surface-container border-outline-variant/30 text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {amt === total ? `Uang Pas (${formatCurrency(amt)})` : formatCurrency(amt)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <div className="flex justify-between items-center text-sm mb-1 text-on-surface-variant">
              <span>Total Dibayar:</span>
              <span className="font-semibold text-on-surface">{formatCurrency(totalPaid)}</span>
            </div>
            {remaining > 0 ? (
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline-variant/30 text-error">
                <span className="font-bold">Kurang:</span>
                <span className="font-bold text-lg">{formatCurrency(remaining)}</span>
              </div>
            ) : (
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline-variant/30 text-emerald-600">
                <span className="font-bold">Kembalian:</span>
                <span className="font-bold text-lg">{formatCurrency(change)}</span>
              </div>
            )}
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-error-container text-on-error-container rounded-lg text-sm flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="p-4 bg-surface border-t border-outline-variant/30 flex gap-3 shrink-0">
          <button 
            type="button"
            className="flex-1 py-3 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl font-label-lg transition-colors border border-outline-variant/50" 
            onClick={onClose}
          >
            Batal
          </button>
          <button 
            type="button"
            disabled={!!error || remaining > 0}
            className="flex-[2] py-3 bg-primary text-on-primary rounded-xl font-label-lg flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm" 
            onClick={handleConfirm}
          >
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span>Konfirmasi & Cetak Struk</span>
          </button>
        </div>
      </div>
    </div>
  );
}

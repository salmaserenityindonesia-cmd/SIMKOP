import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatCurrency';
import MemberCreditBadge from './MemberCreditBadge';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cart: any[];
  total: number;
  memberId: string | null;
  initialMethod?: string;
  onConfirm: (payload: { paidCash: number; paidDeposit: number; paidCredit: number; scheme: string }) => void;
}

export default function SplitPaymentModal({ isOpen, onClose, cart, total, memberId, initialMethod = 'Tunai', onConfirm }: Props) {
  const [paidCash, setPaidCash] = useState<string>('');
  const [paidDeposit, setPaidDeposit] = useState<string>('');
  const [paidCredit, setPaidCredit] = useState<string>('');
  
  const [financials, setFinancials] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialMethod === 'Potong Simpanan') {
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
      import('../../services/posCreditService').then(s => {
        if (memberId) {
          s.getMemberFinancials(memberId).then(setFinancials);
        } else {
          setFinancials(null);
        }
      });
    }
  }, [isOpen, memberId, total, initialMethod]);

  if (!isOpen) return null;

  const cashAmount = Number(paidCash) || 0;
  const depositAmount = Number(paidDeposit) || 0;
  const creditAmount = Number(paidCredit) || 0;

  const totalPaid = cashAmount + depositAmount + creditAmount;
  const remaining = Math.max(0, total - totalPaid);
  const change = Math.max(0, totalPaid - total);

  // Validations
  let error = '';
  if (totalPaid < total) {
    error = 'Total pembayaran belum mencukupi.';
  } else if (financials) {
    if (depositAmount > financials.belanjaBalance) {
      error = 'Saldo Simpanan Belanja tidak mencukupi.';
    } else if (creditAmount > financials.remainingCreditLimit) {
      error = 'Nominal Bon Toko melebihi Sisa Limit Bon Aman (THP).';
    }
  } else if (!memberId && (depositAmount > 0 || creditAmount > 0)) {
    error = 'Pilih anggota terlebih dahulu untuk menggunakan Simpanan / Bon.';
  }

  const handleQuickCash = (amount: number) => {
    setPaidCash(amount.toString());
  };

  const handleConfirm = () => {
    if (error) return;
    
    let scheme = 'cash';
    if (depositAmount > 0 && creditAmount === 0 && cashAmount === 0) scheme = 'split'; // simple mapping
    else if (creditAmount > 0) scheme = 'store_credit';
    else if (depositAmount > 0 || cashAmount > 0) scheme = 'split';

    onConfirm({
      paidCash: cashAmount,
      paidDeposit: depositAmount,
      paidCredit: creditAmount,
      scheme
    });
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
        
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="text-center mb-6">
            <p className="text-label-lg text-on-surface-variant">Total Tagihan</p>
            <p className="text-[32px] font-black text-primary tracking-tight leading-none mt-1">
              {formatCurrency(total)}
            </p>
          </div>

          {memberId ? (
             <MemberCreditBadge memberId={memberId} onFinancialsLoaded={setFinancials} />
          ) : (
             <div className="bg-surface-variant/30 p-3 rounded-lg text-sm text-on-surface-variant mb-4 text-center italic">
               Pembeli Umum (Hanya Pembayaran Tunai)
             </div>
          )}

          <div className="space-y-4 mt-6">
            {/* Input Simpanan */}
            {memberId && (
              <div>
                <label className="flex justify-between text-sm font-semibold text-on-surface mb-1.5">
                  <span>Potong Simpanan Belanja</span>
                  {financials && (
                    <button 
                      onClick={() => setPaidDeposit(Math.min(total, financials.belanjaBalance).toString())}
                      className="text-primary hover:underline text-xs"
                    >
                      Gunakan Maksimal
                    </button>
                  )}
                </label>
                <input 
                  type="number" 
                  value={paidDeposit}
                  onChange={e => setPaidDeposit(e.target.value)}
                  placeholder="Rp 0"
                  className="w-full border border-outline-variant rounded-lg p-2.5 text-lg font-mono focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {/* Input Bon */}
            {memberId && (
              <div>
                <label className="flex justify-between text-sm font-semibold text-on-surface mb-1.5">
                  <span>Catat Bon Toko (Potong Gaji)</span>
                </label>
                <input 
                  type="number" 
                  value={paidCredit}
                  onChange={e => setPaidCredit(e.target.value)}
                  placeholder="Rp 0"
                  className={`w-full border rounded-lg p-2.5 text-lg font-mono focus:ring-2 focus:ring-primary ${
                    financials && creditAmount > financials.remainingCreditLimit ? 'border-error text-error bg-error/10' : 'border-outline-variant'
                  }`}
                />
              </div>
            )}

            {/* Input Tunai */}
            <div>
              <label className="block text-sm font-semibold text-on-surface mb-1.5">Tunai Diterima</label>
              <input 
                type="number" 
                value={paidCash}
                onChange={e => setPaidCash(e.target.value)}
                placeholder="Rp 0"
                className="w-full border border-outline-variant rounded-lg p-2.5 text-lg font-mono focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1 custom-scrollbar">
                {[50000, 100000, total].map((amt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickCash(amt)}
                    className="whitespace-nowrap px-3 py-1.5 rounded bg-surface-container border border-outline-variant/30 text-sm font-medium hover:bg-surface-container-high transition-colors"
                  >
                    {amt === total ? 'Uang Pas' : formatCurrency(amt)}
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
            className="flex-1 py-3 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl font-label-lg transition-colors border border-outline-variant/50" 
            onClick={onClose}
          >
            Batal
          </button>
          <button 
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

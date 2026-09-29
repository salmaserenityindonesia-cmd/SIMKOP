import React, { useState } from 'react';

export default function SummaryPanel({ cart, onPay, onHold, onReset, members = [], selectedMember, onSelectMember }) {
  const [isMemberMode, setIsMemberMode] = useState(selectedMember !== null || true);
  const [paymentType, setPaymentType] = useState('Tunai');
  
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const discount = isMemberMode ? subtotal * 0.05 : 0;
  const total = subtotal - discount;

  // Sync selectedMember when switching modes
  const handleSetMemberMode = (mode: boolean) => {
    setIsMemberMode(mode);
    if (mode && !selectedMember && members.length > 0) {
      onSelectMember(members[0]);
    } else if (!mode) {
      onSelectMember(null);
    }
  };

  return (
    <aside className="lg:col-span-4 flex flex-col gap-3 sticky top-16">
      <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary text-[20px]">badge</span>
            <span className="font-title-sm text-title-sm text-primary">Identitas Anggota Koperasi</span>
          </div>
          <div className="inline-flex rounded-lg p-0.5 bg-surface-container border border-outline-variant/30 text-label-sm font-label-sm">
            <button className={`px-2.5 py-1 rounded ${isMemberMode ? 'bg-surface-container-lowest text-primary font-bold shadow-xs' : 'text-on-surface-variant hover:text-primary'}`} onClick={() => handleSetMemberMode(true)}>Anggota</button>
            <button className={`px-2.5 py-1 rounded ${!isMemberMode ? 'bg-surface-container-lowest text-primary font-bold shadow-xs' : 'text-on-surface-variant hover:text-primary'}`} onClick={() => handleSetMemberMode(false)}>Non-Anggota</button>
          </div>
        </div>
        <div className={`p-3 rounded-lg bg-surface-container-low border border-secondary/30 relative ${!isMemberMode ? 'opacity-40' : ''}`}>
          <div className="flex items-start justify-between">
            <div className="w-full">
              {isMemberMode ? (
                <>
                  <select 
                    className="w-full bg-surface border border-outline-variant rounded p-1 text-sm mb-2"
                    value={selectedMember?.id || ''}
                    onChange={e => onSelectMember(members.find(m => m.id === e.target.value) || null)}
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.nrp} - {m.nama}</option>
                    ))}
                  </select>
                  <div className="mt-1 pt-2 border-t border-outline-variant/40 text-[11px] text-outline">
                    Pilih anggota untuk memuat limit & saldo.
                  </div>
                </>
              ) : (
                <div className="text-sm italic text-on-surface-variant py-2 text-center">Pembeli Umum</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-primary-container text-surface-container-lowest rounded-xl p-4 shadow-lg border border-outline-variant/30 flex flex-col justify-between">
        <div className="my-2">
          <div className="text-label-md font-label-md tracking-widest uppercase text-secondary-fixed font-bold">TOTAL TAGIHAN</div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="font-mono text-headline-sm text-secondary-fixed">Rp</span>
            <span className="font-mono text-[42px] leading-tight font-extrabold tracking-tight text-surface-container-lowest">{total.toLocaleString('id-ID')}</span>
          </div>
          {isMemberMode && <div className="text-[12px] text-on-primary-container mt-1 font-mono">Hemat Rp {discount.toLocaleString('id-ID')} via Diskon Anggota (5%)</div>}
        </div>
        <div className="space-y-1.5 pt-3 border-t border-surface-container-lowest/15 text-body-sm font-mono text-surface-container-lowest/90">
          <div className="flex justify-between">
            <span className="text-on-primary-container">Subtotal Kotor ({cart.length} Item):</span>
            <span>Rp {subtotal.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between text-secondary-fixed">
            <span>Diskon Member:</span>
            <span>- Rp {discount.toLocaleString('id-ID')}</span>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-3.5 shadow-sm">
        <div className="text-title-sm font-title-sm text-primary mb-2">Metode Pembayaran Cepat</div>
        <div className="grid grid-cols-2 gap-2">
          {['Tunai', 'Potong Saldo', 'QRIS', 'Transfer'].map(type => (
            <button 
              key={type}
              className={`p-2.5 rounded-lg border flex items-center gap-2 font-title-sm text-left transition-all ${paymentType === type ? 'border-2 border-secondary bg-surface-container-low text-primary' : 'border-outline-variant/60 bg-surface-container-lowest text-primary hover:border-secondary'}`} 
              onClick={() => setPaymentType(type)}>
              <span className="material-symbols-outlined text-secondary text-[22px]">{type === 'Tunai' ? 'payments' : type === 'Potong Saldo' ? 'account_balance_wallet' : type === 'QRIS' ? 'qr_code_2' : 'account_balance'}</span>
              <div className="font-bold leading-tight">{type}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 mt-2">
        <button className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-headline-sm text-headline-sm flex items-center justify-center gap-2.5 shadow-md transition-all active:scale-[0.98]" onClick={onPay}>
          <span className="material-symbols-outlined text-[26px]">point_of_sale</span>
          <span>Bayar Transaksi [F9 / Space]</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button className="py-2.5 px-3 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container text-primary rounded-lg font-title-sm flex items-center justify-center gap-1.5 transition-colors" onClick={onHold}>
            <span className="material-symbols-outlined text-[18px]">pause_circle</span>
            <span>Tahan [F12]</span>
          </button>
          <button className="py-2.5 px-3 bg-surface-container-lowest border border-error/40 hover:bg-error-container/30 text-error rounded-lg font-title-sm flex items-center justify-center gap-1.5 transition-colors" onClick={onReset}>
            <span className="material-symbols-outlined text-[18px]">cancel</span>
            <span>Batal [Esc]</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
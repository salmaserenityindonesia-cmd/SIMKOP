import React from 'react';

export default function CartTable({ cart, onUpdateQty, onRemoveItem, onClear }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-sm overflow-hidden flex flex-col flex-1 mt-3">
      <div className="px-4 py-3 bg-surface-container-low/60 border-b border-outline-variant/30 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-headline-sm text-headline-sm text-primary">Daftar Belanja Transaksi</span>
          <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-surface-container-lowest text-label-sm font-semibold">{cart.length} Baris Produk</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-error hover:bg-error-container/40 px-2.5 py-1 rounded text-body-sm font-medium flex items-center gap-1 transition-colors" onClick={onClear}>
            <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
            <span>Kosongkan Keranjang</span>
          </button>
        </div>
      </div>
      
      <div className="overflow-y-auto custom-scrollbar flex-1 max-h-[580px]">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead className="bg-surface sticky top-0 z-10 text-on-surface-variant text-label-md font-label-md uppercase tracking-wider border-b border-outline-variant/40">
            <tr>
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              <th className="py-2.5 px-3 w-36">Barcode / SKU</th>
              <th className="py-2.5 px-3">Nama Produk</th>
              <th className="py-2.5 px-3 w-28">Satuan</th>
              <th className="py-2.5 px-3 w-32 text-right">Harga (Rp)</th>
              <th className="py-2.5 px-3 w-36 text-center">Qty</th>
              <th className="py-2.5 px-3 w-36 text-right">Subtotal (Rp)</th>
              <th className="py-2.5 px-3 w-12 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/25 text-body-md font-body-md">
            {cart.map((item, idx) => (
              <tr key={item.barcode + idx} className="hover:bg-surface-container-low/40 transition-colors group">
                <td className="py-3 px-3 text-center text-outline font-mono text-body-sm">{idx + 1}</td>
                <td className="py-3 px-3 font-mono text-body-sm font-semibold text-primary">{item.barcode}</td>
                <td className="py-3 px-3">
                  <div className="font-title-sm text-title-sm text-on-surface leading-snug">{item.name}</div>
                </td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-[11px] font-mono">{item.unit}</span>
                </td>
                <td className="py-3 px-3 text-right font-mono font-medium text-on-surface">{item.price.toLocaleString('id-ID')}</td>
                <td className="py-3 px-3">
                  <div className="flex items-center justify-center gap-1">
                    <button className="w-7 h-7 rounded border border-outline-variant hover:bg-surface-container-high flex items-center justify-center text-primary font-bold text-body-lg active:scale-95 transition-all" onClick={() => onUpdateQty(idx, item.qty - 1)}>-</button>
                    <input className="w-12 py-1 text-center font-mono font-bold text-title-sm border border-outline-variant/60 rounded focus:ring-1 focus:ring-secondary focus:border-secondary p-0" type="number" min="1" value={item.qty} onChange={(e) => onUpdateQty(idx, parseInt(e.target.value) || 1)} />
                    <button className="w-7 h-7 rounded border border-outline-variant hover:bg-surface-container-high flex items-center justify-center text-primary font-bold text-body-lg active:scale-95 transition-all" onClick={() => onUpdateQty(idx, item.qty + 1)}>+</button>
                  </div>
                </td>
                <td className="py-3 px-3 text-right font-mono font-bold text-primary">{(item.price * item.qty).toLocaleString('id-ID')}</td>
                <td className="py-3 px-3 text-center">
                  <button className="text-outline hover:text-error p-1 rounded hover:bg-error-container/20 transition-colors" onClick={() => onRemoveItem(idx)}>
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </td>
              </tr>
            ))}
            {cart.length === 0 && (
              <tr>
                <td colSpan="8" className="py-10 text-center text-outline">Keranjang belanja kosong. Scan barcode untuk memulai.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const fs = require('fs');
const path = require('path');

const posDir = 'c:/SIMKOP/src/components/pos';
const pagesDir = 'c:/SIMKOP/src/pages/pos';

if (!fs.existsSync(posDir)) fs.mkdirSync(posDir, { recursive: true });
if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });

const files = {
  'POSHeader.tsx': `import React, { useState, useEffect } from 'react';

export default function POSHeader({ onOpenQty, onOpenReceipt, onOpenCamera, onReset }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = time.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';

  return (
    <header className="bg-primary-container text-surface-container-lowest border-b border-outline-variant/20 sticky top-0 z-30 shadow-md">
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 pr-4 border-r border-outline-variant/30">
            <img alt="SIMKOP Emblem Logo" className="w-8 h-8 rounded-lg object-contain shadow-sm bg-primary/40 p-0.5" src="https://lh3.googleusercontent.com/aida/AEtjO1Whd4pgw9HaEqo5kTz-K1k9wAvARqNSndzwEF2qeSixP4bMzxmHYzGOt6aEnmKBK8UFFm9gdbBNTQj-IuYT58Ddl5IQ6REz9WEwXGClnIFa7IZl8SDyxhhuVOlHgmjGlVz639yNipzdPHtO0O5MR5zs9Nx8ldeOQinwmXp6WGmdP7ezP_u7f0o1KunLV1IAW1e6DjC2FeGWQlQqVqZzqndr2T83WCMDpTUp4oZgCj8jZyDPhGzVa-SwGEuM"/>
            <div>
              <div className="font-title-md text-title-md tracking-tight text-surface-container-lowest leading-tight">SIMKOP Enterprise</div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-secondary-fixed">POS Kasir Toko v3.4</div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded bg-surface-container-lowest/10 border border-surface-container-lowest/15 text-body-sm font-body-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-secondary-fixed animate-pulse"></span>
            <span className="font-medium text-surface-container-lowest">Kasir 01 - Siti Rohmah</span>
            <span className="text-on-primary-container">|</span>
            <span className="text-secondary-fixed">Shift Pagi</span>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <div className="hidden lg:flex items-center gap-1.5 text-body-sm text-surface-container-lowest/90 font-mono pr-2 border-r border-outline-variant/20">
            <span className="material-symbols-outlined text-secondary-fixed text-[18px]">schedule</span>
            <span>{timeString}</span>
          </div>
          <div className="flex items-center gap-1.5 text-label-sm font-label-sm">
            <span className="px-2 py-0.5 rounded bg-surface-container-lowest/15 border border-surface-container-lowest/20 font-mono text-secondary-fixed cursor-pointer hover:bg-surface-container-lowest/25" title="Cari Barcode (Ctrl+K/F2)">Ctrl+K/F2 Cari</span>
            <span className="px-2 py-0.5 rounded bg-surface-container-lowest/15 border border-surface-container-lowest/20 font-mono text-secondary-fixed cursor-pointer hover:bg-surface-container-lowest/25" onClick={onOpenQty} title="Ubah Qty (F4)">F4 Qty</span>
            <span className="px-2 py-0.5 rounded bg-surface-container-lowest/15 border border-surface-container-lowest/20 font-mono text-secondary-fixed cursor-pointer hover:bg-surface-container-lowest/25" title="Diskon Transaksi (F8)">F8 Diskon</span>
            <span className="px-2 py-0.5 rounded bg-secondary-fixed text-primary font-mono font-bold cursor-pointer hover:bg-secondary-fixed-dim" onClick={onOpenReceipt} title="Buka Pembayaran (F9 / Space)">F9/Space Bayar</span>
          </div>
          <div className="flex items-center gap-1 pl-2 border-l border-outline-variant/20">
            <button className="flex items-center gap-1 px-2.5 py-1 bg-secondary text-surface-container-lowest hover:bg-secondary/90 rounded text-label-sm font-label-sm transition-transform active:scale-95 shadow-sm" onClick={onOpenCamera}>
              <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
              <span className="hidden md:inline">Scan Kamera</span>
            </button>
            <button className="p-1 rounded text-on-primary-container hover:text-surface-container-lowest hover:bg-surface-container-lowest/10 transition-colors" onClick={onReset} title="Batal Transaksi (Esc)">
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}`,
  'ProductSearchInput.tsx': `import React, { useState, useEffect, useRef } from 'react';

// Mock data
const mockProducts = [
  { barcode: '8999908123', name: 'Beras Ramos Premium 5kg', unit: 'Karung', price: 74500, stock: 48 },
  { barcode: '8992753123', name: 'Minyak Goreng Sania 2L', unit: 'Pouch', price: 34000, stock: 120 },
  { barcode: '8996001410', name: 'Gula Pasir Gulaku Premium 1kg', unit: 'Bungkus', price: 17500, stock: 85 },
];

export default function ProductSearchInput({ onSelectProduct, onOpenCamera, searchRef }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);

  const filtered = query.length > 0 
    ? mockProducts.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.barcode.includes(query))
    : [];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if (!isOpen) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        handleSelect(filtered[activeIndex]);
      } else if (filtered.length === 1) {
        handleSelect(filtered[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (product) => {
    onSelectProduct(product);
    setQuery('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-3 shadow-sm relative" ref={containerRef}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-outline">
            <span className="material-symbols-outlined text-[24px]">barcode_scanner</span>
          </div>
          <input
            ref={searchRef}
            autoComplete="off"
            className="w-full pl-12 pr-28 py-3 bg-surface border border-outline-variant/80 rounded-lg text-title-md font-title-md text-primary placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all font-mono tracking-tight"
            placeholder="Scan Barcode EAN-13 atau Ketik SKU / Nama Produk (Tekan Ctrl+K / F2)..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); setActiveIndex(-1); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
            <span className="px-2 py-1 rounded bg-surface-container text-on-surface-variant text-[11px] font-mono border border-outline-variant/40">ENTER ↵</span>
          </div>
        </div>
        <button className="px-4 py-3 bg-surface-container-low hover:bg-surface-container text-primary font-title-sm border border-outline-variant/60 rounded-lg flex items-center justify-center gap-2 transition-colors shrink-0" onClick={onOpenCamera}>
          <span className="material-symbols-outlined text-secondary text-[20px]">photo_camera</span>
          <span>Scan Kamera</span>
        </button>
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute left-3 right-3 top-full mt-1.5 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl z-20 overflow-hidden divide-y divide-outline-variant/30">
          <div className="px-3.5 py-1.5 bg-surface-container-low flex justify-between items-center text-label-sm font-label-sm text-on-surface-variant">
            <span>Hasil Pencarian Cepat Produk (Gunakan Panah ↑ ↓ dan Enter)</span>
            <span className="font-mono text-secondary">{filtered.length} Produk</span>
          </div>
          {filtered.map((item, idx) => (
            <div 
              key={item.barcode}
              className={\`p-3 cursor-pointer flex items-center justify-between transition-colors \${idx === activeIndex ? 'bg-surface-container-low' : 'hover:bg-surface-container-low/50'}\`}
              onClick={() => handleSelect(item)}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-body-sm text-outline">{item.barcode}</span>
                    <span className="font-title-sm text-title-sm text-on-surface">{item.name}</span>
                  </div>
                  <div className="text-body-sm text-outline">Satuan: {item.unit}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-title-md font-bold text-primary font-mono">Rp {item.price.toLocaleString('id-ID')}</div>
                <div className="text-label-sm text-secondary font-medium">Stok: {item.stock} {item.unit}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}`,
  'CartTable.tsx': `import React from 'react';

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
}`,
  'SummaryPanel.tsx': `import React, { useState } from 'react';

export default function SummaryPanel({ cart, onPay, onHold, onReset }) {
  const [isMember, setIsMember] = useState(true);
  const [paymentType, setPaymentType] = useState('Tunai');
  
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const discount = isMember ? subtotal * 0.05 : 0;
  const total = subtotal - discount;

  return (
    <aside className="lg:col-span-4 flex flex-col gap-3 sticky top-16">
      <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary text-[20px]">badge</span>
            <span className="font-title-sm text-title-sm text-primary">Identitas Anggota Koperasi</span>
          </div>
          <div className="inline-flex rounded-lg p-0.5 bg-surface-container border border-outline-variant/30 text-label-sm font-label-sm">
            <button className={\`px-2.5 py-1 rounded \${isMember ? 'bg-surface-container-lowest text-primary font-bold shadow-xs' : 'text-on-surface-variant hover:text-primary'}\`} onClick={() => setIsMember(true)}>Anggota</button>
            <button className={\`px-2.5 py-1 rounded \${!isMember ? 'bg-surface-container-lowest text-primary font-bold shadow-xs' : 'text-on-surface-variant hover:text-primary'}\`} onClick={() => setIsMember(false)}>Non-Anggota</button>
          </div>
        </div>
        <div className={\`p-3 rounded-lg bg-surface-container-low border border-secondary/30 relative \${!isMember ? 'opacity-40' : ''}\`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-primary-container text-secondary-fixed text-[11px] font-mono font-bold">NIA: 2024-0012</span>
                <span className="font-title-sm text-title-sm text-primary font-bold">Bambang Sutrisno</span>
              </div>
              <div className="mt-2.5 pt-2 border-t border-outline-variant/40 flex items-center justify-between">
                <span className="text-[12px] text-outline">Saldo Simpanan Sukarela:</span>
                <span className="font-mono text-body-md font-bold text-secondary">Rp 1.450.000</span>
              </div>
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
          {isMember && <div className="text-[12px] text-on-primary-container mt-1 font-mono">Hemat Rp {discount.toLocaleString('id-ID')} via Diskon Anggota (5%)</div>}
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
              className={\`p-2.5 rounded-lg border flex items-center gap-2 font-title-sm text-left transition-all \${paymentType === type ? 'border-2 border-secondary bg-surface-container-low text-primary' : 'border-outline-variant/60 bg-surface-container-lowest text-primary hover:border-secondary'}\`} 
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
}`,
  'QuantityModal.tsx': `import React, { useState, useEffect, useRef } from 'react';

export default function QuantityModal({ isOpen, item, onClose, onConfirm }) {
  const [qty, setQty] = useState(1);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQty(1);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (qty > 0) onConfirm(qty);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="bg-primary-container text-surface-container-lowest px-5 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed text-[22px]">format_list_numbered</span>
            <span className="font-title-md text-title-md">Kuantitas (Qty)</span>
          </div>
          <button className="text-surface-container-lowest/80 hover:text-surface-container-lowest" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 text-center">
          <div className="font-headline-sm text-headline-sm text-primary mt-0.5">{item.name}</div>
          <div className="my-6 flex items-center justify-center gap-3">
            <button className="w-14 h-14 rounded-xl border border-outline-variant hover:bg-surface-container font-headline-md text-primary flex items-center justify-center shadow-xs" onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
            <input 
              ref={inputRef}
              className="w-28 h-14 text-center font-mono font-extrabold text-[32px] border-2 border-secondary rounded-xl text-primary focus:outline-none focus:ring-4 focus:ring-secondary/20" 
              type="number" min="1" value={qty} 
              onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              onKeyDown={handleKeyDown}
            />
            <button className="w-14 h-14 rounded-xl border border-outline-variant hover:bg-surface-container font-headline-md text-primary flex items-center justify-center shadow-xs" onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-3 bg-surface-container text-primary font-title-sm rounded-lg hover:bg-surface-container-high transition-colors" onClick={onClose}>
              Batalkan [Esc]
            </button>
            <button className="flex-1 py-3 bg-secondary text-on-secondary font-title-sm rounded-lg hover:bg-secondary/90 transition-all shadow-sm" onClick={() => qty > 0 && onConfirm(qty)}>
              Simpan [Enter]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}`,
  'CameraScannerModal.tsx': `import React, { useEffect } from 'react';
// Requires html5-qrcode installed. 
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function CameraScannerModal({ isOpen, onClose, onScanSuccess }) {
  useEffect(() => {
    if (isOpen) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
      scanner.render((text) => {
        scanner.clear();
        onScanSuccess(text);
      }, (err) => {
        // ignore errors during scanning
      });

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [isOpen, onScanSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-primary/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="bg-primary-container text-surface-container-lowest px-5 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed text-[22px]">photo_camera</span>
            <span className="font-title-md text-title-md">Pemindai Barcode Kamera HD</span>
          </div>
          <button className="text-surface-container-lowest/80 hover:text-surface-container-lowest" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5 flex flex-col items-center">
          <div id="reader" className="w-full"></div>
          <div className="text-[12px] text-outline text-center mt-3">
            Arahkan barcode produk ke dalam kotak bidik. Mendukung EAN-13, QR Code.
          </div>
        </div>
      </div>
    </div>
  );
}`,
  'ReceiptModal.tsx': `import React from 'react';

export default function ReceiptModal({ isOpen, cart, onClose, subtotal, discount, total }) {
  if (!isOpen) return null;

  const handleWA = () => {
    let text = \`KOPERASI KONSUMEN SEJAHTERA MANDIRI\\n\\n\`;
    cart.forEach(c => text += \`- \${c.name} (x\${c.qty}): Rp \${(c.qty*c.price).toLocaleString('id-ID')}\\n\`);
    text += \`\\nTotal: Rp \${total.toLocaleString('id-ID')}\\n\`;
    window.open(\`https://wa.me/?text=\${encodeURIComponent(text)}\`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePDF = () => {
    alert("Fitur PDF akan memanfaatkan jsPDF (Placeholder)");
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/70 backdrop-blur-sm flex items-center justify-center p-3 lg:p-4">
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in duration-150">
        <div className="bg-primary-container text-surface-container-lowest px-4 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed text-[20px]">receipt_long</span>
            <span className="font-title-md text-title-md">Struk Transaksi Selesai</span>
          </div>
          <button className="text-surface-container-lowest/80 hover:text-surface-container-lowest" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <div id="printable-receipt" className="p-4 bg-surface-container-low/50 overflow-y-auto custom-scrollbar flex-1 print:bg-white print:p-0">
          <div className="bg-surface-container-lowest p-5 rounded-lg border border-outline-variant/40 shadow-xs font-mono text-[12px] text-primary print:shadow-none print:border-none">
            <div className="text-center pb-3 border-b border-dashed border-outline-variant/80">
              <div className="font-bold text-[14px] leading-tight">KOPERASI KONSUMEN SEJAHTERA MANDIRI</div>
              <div className="text-[11px] text-outline">Gedung Pusat SIMKOP, Jl. Merdeka No. 45 Jakarta</div>
            </div>
            
            <div className="py-3 border-b border-dashed border-outline-variant/80 space-y-2">
              {cart.map((item, idx) => (
                <div key={idx}>
                  <div className="font-bold">{item.name}</div>
                  <div className="flex justify-between text-[11px] text-outline">
                    <span>{item.qty} {item.unit} x Rp {item.price.toLocaleString('id-ID')}</span>
                    <span className="font-bold text-primary">Rp {(item.qty*item.price).toLocaleString('id-ID')}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="py-2.5 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Subtotal Kotor:</span>
                <span>Rp {subtotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Diskon Anggota (5%):</span>
                <span>- Rp {discount.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between font-extrabold text-[13px] pt-1 border-t border-outline-variant/40 text-primary">
                <span>TOTAL AKHIR:</span>
                <span>Rp {total.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-surface border-t border-outline-variant/30 flex flex-col gap-2 shrink-0 print:hidden">
          <button className="w-full py-2.5 bg-primary text-surface-container-lowest rounded-lg font-title-sm flex items-center justify-center gap-2 hover:bg-primary-container transition-colors shadow-sm" onClick={handlePrint}>
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Direct Thermal Print (58/80mm)</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-title-sm text-[13px] flex items-center justify-center gap-1.5 transition-colors" onClick={handleWA}>
              <span className="material-symbols-outlined text-[16px]">chat</span>
              <span>Kirim WhatsApp</span>
            </button>
            <button className="py-2 bg-surface-container-lowest border border-outline-variant text-primary hover:bg-surface-container rounded-lg font-title-sm text-[13px] flex items-center justify-center gap-1.5 transition-colors" onClick={handlePDF}>
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>Download PDF</span>
            </button>
          </div>
          <button className="text-center text-label-md text-outline hover:text-primary py-1" onClick={onClose}>
            Selesai & Buka Transaksi Baru
          </button>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: \`
        @media print {
          body * { visibility: hidden; }
          #receiptModal { position: absolute; left: 0; top: 0; background: white; }
          #printable-receipt, #printable-receipt * { visibility: visible; }
        }
      \`}} />
    </div>
  );
}`,
  '../pages/pos/index.tsx': `import React, { useState, useRef, useEffect } from 'react';
import POSHeader from '../../components/pos/POSHeader';
import ProductSearchInput from '../../components/pos/ProductSearchInput';
import CartTable from '../../components/pos/CartTable';
import SummaryPanel from '../../components/pos/SummaryPanel';
import QuantityModal from '../../components/pos/QuantityModal';
import CameraScannerModal from '../../components/pos/CameraScannerModal';
import ReceiptModal from '../../components/pos/ReceiptModal';

export default function POSPage() {
  const [cart, setCart] = useState([]);
  const [activeItemForQty, setActiveItemForQty] = useState(null);
  
  const [modals, setModals] = useState({
    qty: false,
    camera: false,
    receipt: false,
  });

  const searchInputRef = useRef(null);

  const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const discount = subtotal * 0.05; // assuming member
  const total = subtotal - discount;

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeydown = (e) => {
      // Don't trigger if a modal is open
      if (modals.qty || modals.camera || modals.receipt) return;
      
      if ((e.ctrlKey && e.key === 'k') || e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F9' || (e.key === ' ' && e.target.tagName !== 'INPUT')) {
        if (cart.length > 0) {
          e.preventDefault();
          setModals(m => ({ ...m, receipt: true }));
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [modals, cart]);

  const handleSelectProduct = (product) => {
    setActiveItemForQty(product);
    setModals(m => ({ ...m, qty: true }));
  };

  const handleConfirmQty = (qty) => {
    setModals(m => ({ ...m, qty: false }));
    if (!activeItemForQty) return;
    
    setCart(prev => {
      const existing = prev.findIndex(p => p.barcode === activeItemForQty.barcode);
      if (existing >= 0) {
        const next = [...prev];
        next[existing].qty += qty;
        return next;
      }
      return [...prev, { ...activeItemForQty, qty }];
    });
    
    // focus back to search after small delay
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  return (
    <div className="bg-background text-on-surface antialiased font-body-md select-none min-h-screen flex flex-col">
      <POSHeader 
        onOpenQty={() => { if(cart.length>0) setModals(m => ({...m, qty: true})) }}
        onOpenReceipt={() => { if(cart.length>0) setModals(m => ({...m, receipt: true})) }}
        onOpenCamera={() => setModals(m => ({...m, camera: true}))}
        onReset={() => setCart([])}
      />
      
      <main className="w-full max-w-[1720px] mx-auto p-3 lg:p-4 flex-1 flex flex-col gap-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start flex-1">
          <section className="lg:col-span-8 flex flex-col gap-3 h-full">
            <ProductSearchInput 
              searchRef={searchInputRef}
              onSelectProduct={handleSelectProduct}
              onOpenCamera={() => setModals(m => ({...m, camera: true}))}
            />
            <CartTable 
              cart={cart}
              onUpdateQty={(idx, q) => {
                if (q < 1) return;
                const next = [...cart];
                next[idx].qty = q;
                setCart(next);
              }}
              onRemoveItem={(idx) => {
                const next = [...cart];
                next.splice(idx, 1);
                setCart(next);
              }}
              onClear={() => setCart([])}
            />
          </section>
          
          <SummaryPanel 
            cart={cart}
            onPay={() => { if(cart.length>0) setModals(m => ({...m, receipt: true})) }}
            onHold={() => alert('Fitur Tahan Transaksi (Placeholder)')}
            onReset={() => setCart([])}
          />
        </div>
      </main>

      <QuantityModal 
        isOpen={modals.qty}
        item={activeItemForQty}
        onClose={() => {
          setModals(m => ({...m, qty: false}));
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }}
        onConfirm={handleConfirmQty}
      />
      
      <CameraScannerModal 
        isOpen={modals.camera}
        onClose={() => setModals(m => ({...m, camera: false}))}
        onScanSuccess={(text) => {
          setModals(m => ({...m, camera: false}));
          // Mock fetch product by barcode
          handleSelectProduct({ barcode: text, name: 'Hasil Scan ('+text+')', unit: 'Pcs', price: 10000, stock: 10 });
        }}
      />
      
      <ReceiptModal 
        isOpen={modals.receipt}
        cart={cart}
        subtotal={subtotal}
        discount={discount}
        total={total}
        onClose={() => {
          setModals(m => ({...m, receipt: false}));
          setCart([]);
          setTimeout(() => searchInputRef.current?.focus(), 100);
        }}
      />
    </div>
  );
}`
};

Object.keys(files).forEach(file => {
  const filePath = file.startsWith('../') ? path.join(pagesDir, file.replace('../pages/pos/', '')) : path.join(posDir, file);
  fs.writeFileSync(filePath, files[file]);
});

console.log("Successfully generated POS components.");

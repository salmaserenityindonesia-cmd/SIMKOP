import React, { useState, useEffect } from 'react';

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
            <button 
              aria-label="Logout" 
              className="px-3 py-1.5 rounded-xl bg-surface-container text-secondary hover:text-error hover:bg-error-container/40 border border-outline-variant/40 hover:border-error/30 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition active:scale-95 ml-1" 
              title="Keluar / Logout"
              onClick={() => {
                import('../../lib/supabaseClient').then(({ supabase }) => {
                  supabase.auth.signOut().then(() => window.location.href = '/login');
                });
              }}
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
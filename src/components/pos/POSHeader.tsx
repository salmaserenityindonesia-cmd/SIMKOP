import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { CashierShift } from '../../services/cashierShiftService';

interface POSHeaderProps {
  onOpenQty?: () => void;
  onOpenReceipt?: () => void;
  onOpenCamera?: () => void;
  onReset?: () => void;
  onHold?: () => void;
  onOpenParked?: () => void;
  parkedCount?: number;
  activeShift?: CashierShift | null;
  onOpenBukaKasir?: () => void;
  onOpenTutupKasir?: () => void;
}

export default function POSHeader({
  onOpenQty,
  onOpenReceipt,
  onOpenCamera,
  onReset,
  onHold,
  onOpenParked,
  parkedCount = 0,
  activeShift = null,
  onOpenBukaKasir,
  onOpenTutupKasir,
}: POSHeaderProps) {
  const [time, setTime] = useState(new Date());
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingRole, setLoadingRole] = useState(true);
  const [kasirName, setKasirName] = useState('Kasir POS');
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function checkAdminRole() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: pengelola, error } = await supabase
            .from('pengelola')
            .select('nama, role')
            .eq('id', user.id)
            .single();

          if (!error && pengelola) {
            if (pengelola.nama) {
              setKasirName(pengelola.nama);
            }
            if (pengelola.role === 'admin') {
              setIsAdmin(true);
            }
          }
        }
      } catch (err) {
        console.error('Gagal memverifikasi role pengelola:', err);
      } finally {
        setLoadingRole(false);
      }
    }

    checkAdminRole();
  }, []);

  const timeString =
    time.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' WIB';

  return (
    <header className="bg-primary-container text-surface-container-lowest border-b border-outline-variant/20 sticky top-0 z-30 shadow-md">
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 pr-4 border-r border-outline-variant/30">
            <img
              alt="SIMKOP Emblem Logo"
              className="w-8 h-8 rounded-lg object-contain shadow-sm bg-primary/40 p-0.5"
              src="https://lh3.googleusercontent.com/aida/AEtjO1Whd4pgw9HaEqo5kTz-K1k9wAvARqNSndzwEF2qeSixP4bMzxmHYzGOt6aEnmKBK8UFFm9gdbBNTQj-IuYT58Ddl5IQ6REz9WEwXGClnIFa7IZl8SDyxhhuVOlHgmjGlVz639yNipzdPHtO0O5MR5zs9Nx8ldeOQinwmXp6WGmdP7ezP_u7f0o1KunLV1IAW1e6DjC2FeGWQlQqVqZzqndr2T83WCMDpTUp4oZgCj8jZyDPhGzVa-SwGEuM"
            />
            <div>
              <div className="font-title-md text-title-md tracking-tight text-surface-container-lowest leading-tight">
                SIMKOP Enterprise
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-secondary-fixed">
                POS Kasir Toko v3.4
              </div>
            </div>
          </div>
          {activeShift ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-container-lowest/10 border border-surface-container-lowest/15 text-body-sm font-body-sm">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-medium text-surface-container-lowest">
                  {activeShift.cashier_name || kasirName}
                </span>
                <span className="text-on-primary-container">|</span>
                <span className="font-mono text-emerald-300 text-xs font-semibold">
                  {activeShift.shift_number} (Rp {activeShift.initial_cash.toLocaleString('id-ID')})
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenTutupKasir}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-label-sm font-label-sm font-semibold transition active:scale-95 shadow-sm cursor-pointer"
                title="Tutup Shift & Rekonsiliasi Kasir"
              >
                <span className="material-symbols-outlined text-[16px]">lock_clock</span>
                <span className="hidden md:inline">Tutup Kasir</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenBukaKasir}
                className="flex items-center gap-2 px-3 py-1 rounded-lg bg-rose-500/85 hover:bg-rose-500 text-white border border-rose-300/40 text-body-sm transition cursor-pointer active:scale-95 shadow-sm"
                title="Klik untuk membuka shift kasir baru"
              >
                <span className="inline-block w-2 h-2 rounded-full bg-white animate-ping"></span>
                <span className="font-semibold text-xs">Kasir Belum Buka</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/25 font-mono">Buka Shift</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <div className="hidden lg:flex items-center gap-1.5 text-body-sm text-surface-container-lowest/90 font-mono pr-2 border-r border-outline-variant/20">
            <span className="material-symbols-outlined text-secondary-fixed text-[18px]">
              schedule
            </span>
            <span>{timeString}</span>
          </div>

          <div className="flex items-center gap-1.5 text-label-sm font-label-sm">
            <span
              className="px-2 py-0.5 rounded bg-surface-container-lowest/15 border border-surface-container-lowest/20 font-mono text-secondary-fixed cursor-pointer hover:bg-surface-container-lowest/25"
              title="Cari Barcode (Ctrl+K/F2)"
            >
              Ctrl+K/F2 Cari
            </span>
            <span
              className="px-2 py-0.5 rounded bg-surface-container-lowest/15 border border-surface-container-lowest/20 font-mono text-secondary-fixed cursor-pointer hover:bg-surface-container-lowest/25"
              onClick={onOpenQty}
              title="Ubah Qty (F4)"
            >
              F4 Qty
            </span>
            <span
              className="px-2 py-0.5 rounded bg-surface-container-lowest/15 border border-surface-container-lowest/20 font-mono text-secondary-fixed cursor-pointer hover:bg-surface-container-lowest/25"
              onClick={onHold}
              title="Tahan Transaksi (F8)"
            >
              F8 Tahan
            </span>
            <button
              type="button"
              className={`px-2 py-0.5 rounded font-mono text-label-sm font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                parkedCount > 0
                  ? 'bg-amber-400 text-slate-900 shadow-sm'
                  : 'bg-surface-container-lowest/15 border border-surface-container-lowest/20 text-surface-container-lowest/80 hover:bg-surface-container-lowest/25'
              }`}
              onClick={onOpenParked}
              title="Lihat Daftar Belanja Ditahan"
            >
              <span>Ditahan</span>
              <span className={`px-1 rounded-full text-[10px] ${parkedCount > 0 ? 'bg-slate-950 text-white font-bold' : 'bg-surface-container-lowest/20'}`}>
                {parkedCount}
              </span>
            </button>
            <span
              className="px-2 py-0.5 rounded bg-secondary-fixed text-primary font-mono font-bold cursor-pointer hover:bg-secondary-fixed-dim"
              onClick={onOpenReceipt}
              title="Buka Pembayaran (F9 / Space)"
            >
              F9/Space Bayar
            </span>
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-outline-variant/20">
            <button
              className="flex items-center gap-1 px-2.5 py-1 bg-secondary text-surface-container-lowest hover:bg-secondary/90 rounded text-label-sm font-label-sm transition-transform active:scale-95 shadow-sm"
              onClick={onOpenCamera}
            >
              <span className="material-symbols-outlined text-[16px]">
                qr_code_scanner
              </span>
              <span className="hidden md:inline">Scan Kamera</span>
            </button>

            <button
              className="p-1 rounded text-on-primary-container hover:text-surface-container-lowest hover:bg-surface-container-lowest/10 transition-colors"
              onClick={onReset}
              title="Batal Transaksi (Esc)"
            >
              <span className="material-symbols-outlined text-[18px]">
                refresh
              </span>
            </button>

            {/* Tombol Conditional: Hanya Tampil jika user memiliki role admin */}
            {!loadingRole && isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm active:scale-95 ml-1"
                title="Kembali ke Dashboard Admin"
              >
                <LayoutDashboard size={14} className="shrink-0" />
                <span className="hidden sm:inline">Dashboard Admin</span>
              </button>
            )}

            <button
              aria-label="Logout"
              className="px-3 py-1.5 rounded-xl bg-surface-container text-secondary hover:text-error hover:bg-error-container/40 border border-outline-variant/40 hover:border-error/30 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition active:scale-95 ml-1"
              title="Keluar / Logout"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/login';
              }}
            >
              <span className="material-symbols-outlined text-[16px]">
                logout
              </span>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

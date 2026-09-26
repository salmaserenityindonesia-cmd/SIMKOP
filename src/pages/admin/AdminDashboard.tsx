import { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getDashboardStats, DashboardStats } from '../../services/koperasiService';
import { useCart } from '../../lib/cartStore';
import { Link } from 'react-router-dom';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { parkedTransactions } = useCart();

  useEffect(() => {
    getDashboardStats()
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Failed to load dashboard stats:', error);
        setLoading(false);
      });
  }, []);

  return (
    <AdminLayout>
      {/* DASHBOARD HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-label-sm font-label-sm bg-surface-container text-on-surface-variant">Tahun Buku 2026</span>
            <span className="text-label-sm font-label-sm text-outline">• Harian Operasional</span>
          </div>
          <h1 className="text-headline-md font-headline-md text-primary tracking-tight">Dashboard Operasional</h1>
          <p className="text-body-md font-body-md text-on-surface-variant">Ringkasan aktivitas unit Simpan Pinjam dan unit Retail (POS)</p>
        </div>
      </div>

      {/* KPI SUMMARY CARDS */}
      {loading ? (
        <div className="py-12 text-center text-on-surface-variant">Memuat data dashboard...</div>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {/* Card 1: Penjualan Hari Ini */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#10B981]"></div>
            <div>
              <div className="flex items-center justify-between text-on-surface-variant mb-2">
                <span className="text-label-md font-label-md">Omset POS Hari Ini</span>
                <span className="p-2 rounded-lg bg-[#ECFDF5] text-[#047857]">
                  <span className="material-symbols-outlined text-[20px]">shopping_cart_checkout</span>
                </span>
              </div>
              <div className="text-headline-md font-headline-md text-primary font-semibold tracking-tight">
                Rp {stats?.totalPenjualanHariIni.toLocaleString('id-ID')}
              </div>
              <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Penjualan retail berjalan</div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
              <Link to="/kasir" className="text-primary hover:underline flex items-center gap-1 font-medium">
                Buka Kasir <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Card 2: Pinjaman Aktif */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
            <div>
              <div className="flex items-center justify-between text-on-surface-variant mb-2">
                <span className="text-label-md font-label-md">Pinjaman Aktif</span>
                <span className="p-2 rounded-lg bg-surface-container-low text-primary">
                  <span className="material-symbols-outlined text-[20px]">request_quote</span>
                </span>
              </div>
              <div className="text-headline-md font-headline-md text-primary font-semibold tracking-tight">
                {stats?.totalPinjamanAktif}
              </div>
              <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Berkas pinjaman berjalan</div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
               <Link to="/admin/approval" className="text-primary hover:underline flex items-center gap-1 font-medium">
                Kelola Pinjaman <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Card 3: Stok Kritis */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-error"></div>
            <div>
              <div className="flex items-center justify-between text-on-surface-variant mb-2">
                <span className="text-label-md font-label-md">Stok Kritis</span>
                <span className="p-2 rounded-lg bg-error/10 text-error">
                  <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                </span>
              </div>
              <div className="text-headline-md font-headline-md text-error font-semibold tracking-tight">
                {stats?.stokKritis}
              </div>
              <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Produk butuh restock</div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
               <Link to="/admin/produk" className="text-primary hover:underline flex items-center gap-1 font-medium">
                Cek Inventori <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Card 4: Transaksi Tersimpan */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-secondary"></div>
            <div>
              <div className="flex items-center justify-between text-on-surface-variant mb-2">
                <span className="text-label-md font-label-md">Transaksi Tersimpan</span>
                <span className="p-2 rounded-lg bg-secondary-container/30 text-secondary">
                  <span className="material-symbols-outlined text-[20px]">pause_circle</span>
                </span>
              </div>
              <div className="text-headline-md font-headline-md text-primary font-semibold tracking-tight">
                {parkedTransactions.length}
              </div>
              <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Catatan kasir diparkir</div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
               <Link to="/kasir" className="text-primary hover:underline flex items-center gap-1 font-medium">
                Buka Kasir <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>
        </section>
      )}
    </AdminLayout>
  );
}

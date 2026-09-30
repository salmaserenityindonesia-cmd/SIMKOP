import { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getDashboardStats, DashboardStats, getCommitmentStats, CommitmentStats } from '../../services/koperasiService';
import { useCart } from '../../lib/cartStore';
import { Link } from 'react-router-dom';
import { generateDatabaseBackup } from '../../services/backupService';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [commitmentStats, setCommitmentStats] = useState<CommitmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const { parkedTransactions } = useCart();

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getCommitmentStats(currentMonth, currentYear)
    ]).then(([dashboardData, commitmentData]) => {
      setStats(dashboardData);
      setCommitmentStats(commitmentData);
      setLoading(false);
    }).catch(error => {
      console.error('Failed to load dashboard stats:', error);
      setLoading(false);
    });
  }, [currentMonth, currentYear]);

  const handleBackup = async () => {
    if (!window.confirm('Apakah Anda yakin ingin membackup seluruh database? Proses ini mungkin memerlukan waktu beberapa saat.')) {
      return;
    }
    
    setIsBackingUp(true);
    try {
      const url = await generateDatabaseBackup();
      const a = document.createElement('a');
      a.href = url;
      a.download = `simkop_backup_${new Date().toISOString().replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert('Backup berhasil diunduh!');
    } catch (error: any) {
      alert('Terjadi kesalahan saat backup: ' + error.message);
    } finally {
      setIsBackingUp(false);
    }
  };

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
        
        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-3">
          <button 
            onClick={handleBackup} 
            disabled={isBackingUp}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isBackingUp ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[20px]">cloud_download</span>
            )}
            {isBackingUp ? 'Proses Backup...' : 'Backup Database'}
          </button>
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

      {/* COMMITMENT STATS (PHASE 8 Analytics) */}
      {!loading && (
        <section className="mt-8">
          <h2 className="text-title-lg font-title-lg text-primary mb-4">Status Komitmen Bulan Ini ({currentMonth}/{currentYear})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Deposit Commitments */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm">
              <h3 className="text-title-md font-title-md text-on-surface mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">savings</span>
                Simpanan Wajib
              </h3>
              <div className="flex gap-4 items-center">
                <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                  <div className="text-headline-sm font-semibold text-[#10B981]">{commitmentStats?.deposit.lunas || 0}</div>
                  <div className="text-label-sm text-on-surface-variant">Sudah Lunas</div>
                </div>
                <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                  <div className="text-headline-sm font-semibold text-error">{commitmentStats?.deposit.belum_lunas || 0}</div>
                  <div className="text-label-sm text-on-surface-variant">Belum Lunas</div>
                </div>
              </div>
            </div>

            {/* Loan Commitments */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm">
              <h3 className="text-title-md font-title-md text-on-surface mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
                Cicilan Pinjaman
              </h3>
              <div className="flex gap-4 items-center">
                <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                  <div className="text-headline-sm font-semibold text-[#10B981]">{commitmentStats?.loan.lunas || 0}</div>
                  <div className="text-label-sm text-on-surface-variant">Sudah Lunas</div>
                </div>
                <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                  <div className="text-headline-sm font-semibold text-error">{commitmentStats?.loan.belum_lunas || 0}</div>
                  <div className="text-label-sm text-on-surface-variant">Belum Lunas</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </AdminLayout>
  );
}

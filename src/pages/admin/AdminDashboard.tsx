import React from 'react';
import AdminLayout from '../../components/layout/AdminLayout';

export default function AdminDashboard() {
  return (
    <AdminLayout>
      {/* DASHBOARD HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-label-sm font-label-sm bg-surface-container text-on-surface-variant">Tahun Buku 2025</span>
            <span className="text-label-sm font-label-sm text-outline">• Periode Berjalan Q1</span>
          </div>
          <h1 className="text-headline-md font-headline-md text-primary tracking-tight">Ringkasan Eksekutif & Likuiditas</h1>
          <p className="text-body-md font-body-md text-on-surface-variant">Laporan konsolidasi unit Simpan Pinjam dan unit Retail Toko Koperasi</p>
        </div>
      </div>

      {/* KPI SUMMARY CARDS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary-container"></div>
          <div>
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-label-md font-label-md">Total Anggota Aktif</span>
              <span className="p-2 rounded-lg bg-surface-container-low text-primary">
                <span className="material-symbols-outlined text-[20px]">groups</span>
              </span>
            </div>
            <div className="text-headline-md font-headline-md text-primary font-semibold">1,428</div>
            <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Anggota Terdaftar Resmi</div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
            <span className="inline-flex items-center gap-1 text-[#047857] font-semibold bg-[#ECFDF5] px-1.5 py-0.5 rounded">
              <span className="material-symbols-outlined text-[14px]">trending_up</span> +4.2% MoM
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 right-0 h-1 bg-secondary"></div>
          <div>
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-label-md font-label-md">Kas & Likuiditas Total</span>
              <span className="p-2 rounded-lg bg-secondary-container/30 text-secondary">
                <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
              </span>
            </div>
            <div className="text-headline-md font-headline-md text-primary font-semibold tracking-tight">Rp 3.845.290.000</div>
            <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Kas Bank & Kas Tunai Fisik</div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
            <span className="inline-flex items-center gap-1 text-[#047857] font-semibold bg-[#ECFDF5] px-1.5 py-0.5 rounded">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span> +8.7%
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
          <div>
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-label-md font-label-md">Portofolio Pinjaman Aktif</span>
              <span className="p-2 rounded-lg bg-surface-container-low text-primary">
                <span className="material-symbols-outlined text-[20px]">request_quote</span>
              </span>
            </div>
            <div className="text-headline-md font-headline-md text-primary font-semibold tracking-tight">Rp 2.150.800.000</div>
            <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">182 Berkas Berjalan</div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
            <span className="inline-flex items-center gap-1 text-secondary font-semibold bg-secondary-container/20 px-1.5 py-0.5 rounded">
              NPL: 0.8% Sehat
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#10B981]"></div>
          <div>
            <div className="flex items-center justify-between text-on-surface-variant mb-2">
              <span className="text-label-md font-label-md">Omset POS Retail Hari Ini</span>
              <span className="p-2 rounded-lg bg-surface-container-low text-[#047857]">
                <span className="material-symbols-outlined text-[20px]">shopping_cart_checkout</span>
              </span>
            </div>
            <div className="text-headline-md font-headline-md text-primary font-semibold tracking-tight">Rp 48.720.500</div>
            <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Toko Sembako & ATK Anggota</div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
            <span className="inline-flex items-center gap-1 text-[#047857] font-semibold bg-[#ECFDF5] px-1.5 py-0.5 rounded">
              <span className="material-symbols-outlined text-[14px]">trending_up</span> +12.3%
            </span>
          </div>
        </div>
      </section>

      {/* TRANSACTIONS TABLE */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-title-md font-title-md text-primary">Aktivitas Transaksi Finansial Terkini</h2>
            <p className="text-body-sm font-body-sm text-on-surface-variant">Log audit transaksi kas masuk, pencairan, dan struk penjualan harian</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/40 text-on-surface-variant text-label-sm font-label-sm uppercase tracking-wider">
                <th className="py-3 px-6">ID Transaksi & Waktu</th>
                <th className="py-3 px-6">Deskripsi & Nama Anggota</th>
                <th className="py-3 px-6 text-right">Nominal (IDR)</th>
                <th className="py-3 px-6 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 text-body-sm font-body-sm">
              <tr className="hover:bg-surface-container-low/60 transition-colors">
                <td className="py-3.5 px-6">
                  <div className="font-title-sm text-primary font-semibold">TRX-2025-0891</div>
                  <div className="text-outline text-label-sm">Hari ini, 10:45 WIB</div>
                </td>
                <td className="py-3.5 px-6">
                  <div className="font-title-sm text-on-surface">Penyetoran Simpanan Wajib Bulanan</div>
                  <div className="text-on-surface-variant text-label-sm">Nia Marlina (NIA: 0942)</div>
                </td>
                <td className="py-3.5 px-6 text-right font-headline-sm font-bold text-[#047857]">+ Rp 250.000</td>
                <td className="py-3.5 px-6 text-center">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-label-sm font-semibold bg-[#ECFDF5] text-[#047857]">Sukses</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}

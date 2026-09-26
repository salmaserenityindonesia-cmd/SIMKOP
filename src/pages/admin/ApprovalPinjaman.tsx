import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getPendingPinjaman, updateStatusPinjaman } from '../../services/koperasiService';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function ApprovalPinjaman() {
  const [pinjamanList, setPinjamanList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const data = await getPendingPinjaman();
      setPinjamanList(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data persetujuan');
    } finally {
      setLoading(false);
    }
  }

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    if (!window.confirm(`Apakah Anda yakin ingin ${action === 'approved' ? 'MENYETUJUI' : 'MENOLAK'} pinjaman ini?`)) {
      return;
    }

    try {
      setActionLoading(id);
      await updateStatusPinjaman(id, action);
      // Remove from list or refresh
      setPinjamanList(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan');
    } finally {
      setActionLoading(null);
    }
  };

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Persetujuan Pinjaman</h1>
        <p className="text-[var(--color-text-secondary)]">Kelola persetujuan pinjaman anggota (Khusus Admin)</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="py-3 px-4 font-medium border-b border-gray-200">No. Anggota</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Nama Anggota</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-right">Jumlah Pinjaman</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Tenor</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    <p>Memuat data...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : pinjamanList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    Tidak ada pengajuan pinjaman yang menunggu persetujuan.
                  </td>
                </tr>
              ) : (
                pinjamanList.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{p.anggota?.no_anggota || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{p.anggota?.nama || '-'}</td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900 text-right">{formatRupiah(p.jumlah)}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-center">{p.tenor_bulan} Bulan</td>
                    <td className="py-3 px-4 text-sm text-center">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => handleAction(p.id, 'approved')}
                          disabled={actionLoading === p.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-md text-xs font-medium disabled:opacity-50"
                        >
                          {actionLoading === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          Setujui
                        </button>
                        <button 
                          onClick={() => handleAction(p.id, 'rejected')}
                          disabled={actionLoading === p.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-md text-xs font-medium disabled:opacity-50"
                        >
                          {actionLoading === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                          Tolak
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

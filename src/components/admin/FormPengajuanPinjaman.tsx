import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ajukanPinjaman } from '../../services/koperasiService';

interface FormPengajuanPinjamanProps {
  isOpen: boolean;
  onClose: () => void;
  anggota: { id: string; nama: string; no_anggota: string } | null;
  onSuccess: () => void;
}

export default function FormPengajuanPinjaman({ isOpen, onClose, anggota, onSuccess }: FormPengajuanPinjamanProps) {
  const [jumlah, setJumlah] = useState<string>('');
  const [tenor, setTenor] = useState<number>(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !anggota) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedJumlah = parseInt(jumlah.replace(/[^0-9]/g, ''), 10);
    
    if (isNaN(parsedJumlah) || parsedJumlah <= 0) {
      setError('Jumlah pinjaman tidak valid');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await ajukanPinjaman({
        anggota_id: anggota.id,
        jumlah: parsedJumlah,
        tenor_bulan: tenor
      });
      onSuccess();
      onClose();
      setJumlah('');
      setTenor(3);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat mengajukan pinjaman');
    } finally {
      setLoading(false);
    }
  };

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const handleJumlahChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setJumlah(value);
  };

  const parsedJumlah = parseInt(jumlah, 10) || 0;
  const cicilanPerBulan = parsedJumlah / tenor;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Pengajuan Pinjaman</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Anggota</label>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-gray-800">
              <span className="font-semibold">{anggota.nama}</span> ({anggota.no_anggota})
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Pinjaman (Rp)</label>
            <input
              type="text"
              required
              value={jumlah ? formatRupiah(parseInt(jumlah, 10)).replace('Rp', '').trim() : ''}
              onChange={handleJumlahChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenor Cicilan</label>
            <select
              value={tenor}
              onChange={(e) => setTenor(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-white"
            >
              <option value={3}>3 Bulan</option>
              <option value={6}>6 Bulan</option>
              <option value={12}>12 Bulan</option>
            </select>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-blue-700">Bunga Pinjaman:</span>
              <span className="font-semibold text-blue-900">0%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">Cicilan per Bulan:</span>
              <span className="font-bold text-blue-900">{formatRupiah(cicilanPerBulan)}</span>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || parsedJumlah <= 0}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-md hover:bg-opacity-90 font-medium flex items-center justify-center min-w-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Ajukan Pinjaman'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

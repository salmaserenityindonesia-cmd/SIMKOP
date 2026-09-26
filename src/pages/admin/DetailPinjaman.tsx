import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import { 
  getPinjamanById, 
  getJadwalAngsuran, 
  bayarAngsuran, 
  Angsuran, 
  Pinjaman 
} from '../../services/koperasiService';
import { ArrowLeft, CheckCircle, Clock } from 'lucide-react';
import StatusBadge from '../../components/ui/StatusBadge';

export default function DetailPinjaman() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [pinjaman, setPinjaman] = useState<any>(null);
  const [jadwal, setJadwal] = useState<Angsuran[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (pinjamanId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const pinjamanData = await getPinjamanById(pinjamanId);
      setPinjaman(pinjamanData);
      
      const jadwalData = await getJadwalAngsuran(
        pinjamanId, 
        pinjamanData.jumlah, 
        pinjamanData.tenor_bulan
      );
      setJadwal(jadwalData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBayar = async (angsuranId: string, jumlah: number) => {
    if (!window.confirm(`Konfirmasi pembayaran angsuran sebesar Rp ${jumlah.toLocaleString('id-ID')}?`)) return;
    
    try {
      setIsPaying(angsuranId);
      await bayarAngsuran(angsuranId, jumlah);
      // Reload schedule
      if (id) {
        const jadwalData = await getJadwalAngsuran(id, pinjaman.jumlah, pinjaman.tenor_bulan);
        setJadwal(jadwalData);
      }
    } catch (err: any) {
      alert(`Gagal membayar: ${err.message}`);
    } finally {
      setIsPaying(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !pinjaman) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg">
        {error || 'Data pinjaman tidak ditemukan'}
      </div>
    );
  }

  const lunasCount = jadwal.filter(j => j.status === 'lunas').length;
  const sisaCicilan = pinjaman.tenor_bulan - lunasCount;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          title="Kembali"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Detail Pinjaman</h1>
          <p className="text-gray-500">
            {pinjaman.anggota?.nama} ({pinjaman.anggota?.no_anggota})
          </p>
        </div>
      </div>

      {/* Ringkasan Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-500 mb-1">Status Pinjaman</p>
            <StatusBadge status={pinjaman.status} />
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Total Pinjaman</p>
            <p className="text-xl font-bold text-gray-900">
              Rp {pinjaman.jumlah.toLocaleString('id-ID')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Tenor</p>
            <p className="text-xl font-bold text-gray-900">
              {pinjaman.tenor_bulan} Bulan
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Sisa Cicilan</p>
            <p className="text-xl font-bold text-gray-900">
              {sisaCicilan} Bulan
            </p>
          </div>
        </div>
      </div>

      {/* Jadwal Angsuran Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Jadwal Angsuran</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">Bulan Ke</th>
                <th className="px-6 py-4 font-medium">Jumlah Bayar</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Tanggal Bayar</th>
                <th className="px-6 py-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jadwal.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    {item.bulan_ke}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    Rp {item.jumlah_bayar.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {item.tanggal_bayar ? new Date(item.tanggal_bayar).toLocaleDateString('id-ID') : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {item.status === 'belum' && (
                      <button
                        onClick={() => handleBayar(item.id, item.jumlah_bayar)}
                        disabled={isPaying === item.id}
                        className="inline-flex items-center px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPaying === item.id ? 'Memproses...' : 'Bayar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {jadwal.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Jadwal angsuran tidak tersedia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>
    </AdminLayout>
  );
}

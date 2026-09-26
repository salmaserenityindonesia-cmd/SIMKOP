import { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAnggota, Anggota } from '../../services/koperasiService';
import { Search, Loader2 } from 'lucide-react';

export default function ManajemenAnggota() {
  const [anggotaList, setAnggotaList] = useState<Anggota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const data = await getAnggota();
      setAnggotaList(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }

  const filteredList = anggotaList.filter(a => 
    a.nama.toLowerCase().includes(search.toLowerCase()) || 
    a.no_anggota.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Manajemen Anggota</h1>
        <p className="text-[var(--color-text-secondary)]">Kelola data induk anggota koperasi</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari anggota..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-64"
            />
          </div>
          {/* Aksi Tambah Anggota nantinya bisa ditambahkan di Plan 6.3 */}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="py-3 px-4 font-medium border-b border-gray-200">No. Anggota</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Nama</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Telepon</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Alamat</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Tanggal Bergabung</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    <p>Memuat data...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    Tidak ada data anggota.
                  </td>
                </tr>
              ) : (
                filteredList.map((anggota) => (
                  <tr key={anggota.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{anggota.no_anggota}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.nama}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.telepon || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 max-w-[200px] truncate" title={anggota.alamat}>{anggota.alamat || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.tanggal_bergabung ? new Date(anggota.tanggal_bergabung).toLocaleDateString('id-ID') : '-'}</td>
                    <td className="py-3 px-4 text-sm text-center">
                      {/* Placeholder untuk Edit/Delete yang akan ditambahkan di Plan 6.3 */}
                      <span className="text-gray-400 italic text-xs">...</span>
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

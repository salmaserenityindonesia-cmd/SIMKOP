import { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAnggota, addAnggota, updateAnggota, deleteAnggota, Anggota } from '../../services/koperasiService';
import { Search, Loader2, Plus, Edit2, Trash2, X, Download } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../../lib/exportUtils';

export default function ManajemenAnggota() {
  const [anggotaList, setAnggotaList] = useState<Anggota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingAnggota, setEditingAnggota] = useState<Anggota | null>(null);
  const [formData, setFormData] = useState({
    nrp: '',
    nama: '',
    pangkat: '',
    status: 'aktif',
    master_thp: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleOpenAddModal = () => {
    setEditingAnggota(null);
    setFormData({ nrp: '', nama: '', pangkat: '', status: 'aktif', master_thp: 0 });
    setShowModal(true);
  };

  const handleOpenEditModal = (anggota: Anggota) => {
    setEditingAnggota(anggota);
    setFormData({
      nrp: anggota.nrp || '',
      nama: anggota.nama,
      pangkat: anggota.pangkat || '',
      status: anggota.status || 'aktif',
      master_thp: anggota.master_thp || 0
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string, nama: string) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus anggota "${nama}"?`)) {
      try {
        setLoading(true);
        await deleteAnggota(id);
        await loadData();
      } catch (err: any) {
        alert(err.message || 'Gagal menghapus anggota');
        setLoading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      if (editingAnggota) {
        await updateAnggota(editingAnggota.id, formData);
      } else {
        await addAnggota(formData);
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan anggota');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredList = anggotaList.filter(a => 
    a.nama.toLowerCase().includes(search.toLowerCase()) || 
    (a.nrp && a.nrp.toLowerCase().includes(search.toLowerCase()))
  );

  const handleExportExcel = () => {
    exportToExcel(filteredList, 'Data_Anggota');
  };

  const handleExportPDF = () => {
    const headers = ['NRP', 'Nama', 'Pangkat', 'Gaji Pokok (THP)', 'Status', 'Terdaftar'];
    const data = filteredList.map(a => [
      a.nrp || '-',
      a.nama,
      a.pangkat || '-',
      new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(a.master_thp || 0),
      a.status === 'aktif' ? 'Aktif' : 'Nonaktif',
      a.created_at ? new Date(a.created_at).toLocaleDateString('id-ID') : '-'
    ]);
    exportToPDF(headers, data, 'Data_Anggota', 'Laporan Data Anggota Koperasi');
  };

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
              placeholder="Cari anggota (Nama / NRP)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-64"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4 mr-2" />
              Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4 mr-2" />
              PDF
            </button>
            <button
              onClick={handleOpenAddModal}
              className="flex items-center px-4 py-2 bg-[var(--color-primary)] text-white rounded-md hover:bg-[var(--color-primary-hover)] transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              Tambah Anggota
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="py-3 px-4 font-medium border-b border-gray-200">NRP</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Nama</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Pangkat</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Gaji Pokok (THP)</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Status</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Terdaftar</th>
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
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{anggota.nrp}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.nama}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.pangkat || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 font-medium text-green-700">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(anggota.master_thp || 0)}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        anggota.status === 'aktif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {anggota.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.created_at ? new Date(anggota.created_at).toLocaleDateString('id-ID') : '-'}</td>
                    <td className="py-3 px-4 text-sm text-center">
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={() => handleOpenEditModal(anggota)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(anggota.id, anggota.nama)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="font-semibold text-lg text-gray-900">
                {editingAnggota ? 'Edit Anggota' : 'Tambah Anggota Baru'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    NRP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nrp}
                    onChange={(e) => setFormData({...formData, nrp: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Masukkan NRP anggota"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nama}
                    onChange={(e) => setFormData({...formData, nama: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Masukkan nama lengkap"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pangkat
                  </label>
                  <input
                    type="text"
                    value={formData.pangkat}
                    onChange={(e) => setFormData({...formData, pangkat: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Contoh: Sertu, Kopda, dll"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gaji Pokok (Master THP) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.master_thp}
                    onChange={(e) => setFormData({...formData, master_thp: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Contoh: 5000000"
                  />
                  <p className="text-xs text-gray-500 mt-1">Gaji pokok akan digunakan untuk memvalidasi kelayakan limit pemotongan saat pengajuan pinjaman.</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-md hover:bg-[var(--color-primary-hover)] transition-colors text-sm font-medium flex items-center"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

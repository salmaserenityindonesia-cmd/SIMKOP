import { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAnggota, addAnggota, updateAnggota, deleteAnggota, Anggota } from '../../services/koperasiService';
import { Search, Loader2, Plus, Edit2, Trash2, X } from 'lucide-react';

export default function ManajemenAnggota() {
  const [anggotaList, setAnggotaList] = useState<Anggota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingAnggota, setEditingAnggota] = useState<Anggota | null>(null);
  const [formData, setFormData] = useState({
    nama: '',
    telepon: '',
    alamat: ''
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
    setFormData({ nama: '', telepon: '', alamat: '' });
    setShowModal(true);
  };

  const handleOpenEditModal = (anggota: Anggota) => {
    setEditingAnggota(anggota);
    setFormData({
      nama: anggota.nama,
      telepon: anggota.telepon || '',
      alamat: anggota.alamat || ''
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
        await addAnggota({
          ...formData,
          tanggal_bergabung: new Date().toISOString().split('T')[0]
        });
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
          <button
            onClick={handleOpenAddModal}
            className="flex items-center px-4 py-2 bg-[var(--color-primary)] text-white rounded-md hover:bg-[var(--color-primary-hover)] transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            Tambah Anggota
          </button>
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
                    Nomor Telepon
                  </label>
                  <input
                    type="tel"
                    value={formData.telepon}
                    onChange={(e) => setFormData({...formData, telepon: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Contoh: 081234567890"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alamat Lengkap
                  </label>
                  <textarea
                    rows={3}
                    value={formData.alamat}
                    onChange={(e) => setFormData({...formData, alamat: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Masukkan alamat domisili"
                  />
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

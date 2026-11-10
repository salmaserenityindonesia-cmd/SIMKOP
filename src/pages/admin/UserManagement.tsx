import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { createSystemUser, deleteSystemUser, updateSystemUserRole } from '../../services/userService';
import { getPengelolaList, Pengelola } from '../../services/koperasiService';
import { useFeedback } from '../../context/FeedbackContext';

export default function UserManagement() {
  const { showToast, showConfirm } = useFeedback();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [role, setRole] = useState<'admin' | 'operator'>('operator');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [users, setUsers] = useState<Pengelola[]>([]);
  const [isFetching, setIsFetching] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const fetchUsers = async () => {
    setIsFetching(true);
    try {
      const { data } = await getPengelolaList(100, 0);
      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Kata sandi minimal 6 karakter.' });
      return;
    }

    setIsLoading(true);

    try {
      const res = await createSystemUser({ email, password, nama, role });
      if (!res.success) {
        throw new Error(res.error || 'Gagal mendaftarkan user');
      }

      setMessage({ type: 'success', text: `User ${nama} berhasil didaftarkan sebagai ${role}.` });
      setEmail('');
      setPassword('');
      setNama('');
      setRole('operator');
      
      // Refresh the user list
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal mendaftarkan user' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (id: string, namaUser: string) => {
    const confirmed = await showConfirm({
      title: 'Hapus Pengelola',
      message: `Apakah Anda yakin ingin menghapus pengelola "${namaUser}" secara permanen?`,
      confirmText: 'Hapus',
      variant: 'danger',
    });

    if (confirmed) {
      try {
        const res = await deleteSystemUser(id);
        if (!res.success) {
          throw new Error(res.error || 'Gagal menghapus user');
        }
        
        showToast(`Pengelola "${namaUser}" berhasil dihapus.`, 'success');
        // Trigger refetch
        fetchUsers();
      } catch (err: any) {
        showToast(`Gagal menghapus user: ${err.message}`, 'error');
      }
    }
  };

  const handleToggleRole = async (user: Pengelola) => {
    const newRole = user.role === 'admin' ? 'operator' : 'admin';
    const confirmed = await showConfirm({
      title: 'Ubah Hak Akses',
      message: `Ubah hak akses "${user.nama}" menjadi ${newRole.toUpperCase()}?`,
      confirmText: 'Ubah',
    });

    if (confirmed) {
      try {
        const res = await updateSystemUserRole(user.id, newRole);
        if (!res.success) {
          throw new Error(res.error || 'Gagal mengubah role');
        }

        showToast(`Hak akses "${user.nama}" berhasil diubah menjadi ${newRole.toUpperCase()}.`, 'success');
        fetchUsers();
      } catch (err: any) {
        showToast(`Gagal mengubah role: ${err.message}`, 'error');
      }
    }
  };

  const totalPages = Math.ceil(users.length / itemsPerPage);
  const paginatedUsers = users.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-headline-md font-headline-md text-primary tracking-tight">Manajemen User Sistem</h1>
          <p className="text-body-md font-body-md text-on-surface-variant">Kelola akses operator dan admin aplikasi SIMKOP</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Registrasi User */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm overflow-hidden lg:col-span-1">
          <div className="p-4 border-b border-outline-variant/30 bg-surface-container-low/30">
            <h2 className="text-title-md font-title-md text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">person_add</span>
              Registrasi User Baru
            </h2>
          </div>
          <form onSubmit={handleRegister} className="p-5 space-y-4">
            {message.text && (
              <div className={`p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-error-container text-on-error-container' : 'bg-[#ECFDF5] text-[#047857]'}`}>
                {message.text}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-label-sm font-label-sm text-on-surface-variant font-semibold">
                Nama Lengkap
              </label>
              <input 
                type="text"
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-md focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50" 
                placeholder="Masukkan nama pengguna" 
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-label-sm font-label-sm text-on-surface-variant font-semibold">
                Email
              </label>
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-md focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50" 
                placeholder="email@koperasi.com" 
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-label-sm font-label-sm text-on-surface-variant font-semibold">
                Kata Sandi Sementara
              </label>
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-md focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50" 
                placeholder="Minimal 6 karakter" 
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-label-sm font-label-sm text-on-surface-variant font-semibold">
                Role Akses
              </label>
              <select 
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'operator')}
                className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-md focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50"
              >
                <option value="operator">Operator (Kasir / Staff)</option>
                <option value="admin">Admin (Akses Penuh)</option>
              </select>
            </div>

            <div className="pt-2">
              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-surface-container-lowest font-title-sm shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-70"
              >
                {isLoading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-surface-container-lowest border-t-transparent rounded-full"></div>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">add</span>
                )}
                <span>Daftarkan User</span>
              </button>
            </div>
          </form>
        </div>

        {/* Tabel Daftar User */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm overflow-hidden lg:col-span-2">
          <div className="p-4 border-b border-outline-variant/30 bg-surface-container-low/30">
            <h2 className="text-title-md font-title-md text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
              Daftar Pengelola Sistem
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm text-on-surface">
              <thead className="bg-surface-container-low/20 text-label-sm font-label-sm text-on-surface-variant uppercase border-b border-outline-variant/40">
                <tr>
                  <th className="px-6 py-4 font-semibold">Nama</th>
                  <th className="px-6 py-4 font-semibold">Role</th>
                  <th className="px-6 py-4 font-semibold">Tgl Terdaftar</th>
                  <th className="px-6 py-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {isFetching ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant">
                      <div className="flex flex-col items-center justify-center">
                        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mb-3"></div>
                        <span>Memuat data...</span>
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant">
                      Tidak ada data pengelola.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-surface-container-lowest/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-title-sm text-primary mb-0.5">{user.nama}</div>
                        <div className="text-label-sm text-on-surface-variant">{user.id.substring(0,8)}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                          user.role === 'admin' 
                            ? 'bg-[#FEF2F2] text-[#B91C1C]' 
                            : 'bg-[#F0F9FF] text-[#0369A1]'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-on-surface-variant text-[13px]">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString('id-ID') : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            className="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-secondary/10 rounded-md transition-colors" 
                            title="Ubah Role (Admin/Operator)"
                            onClick={() => handleToggleRole(user)}
                          >
                            <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                          </button>
                          <button 
                            className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-md transition-colors" 
                            title="Hapus Pengelola"
                            onClick={() => handleDeleteUser(user.id, user.nama)}
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm p-4 border-t border-outline-variant/40 bg-surface-container-low/10">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span>
                Menampilkan {users.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
                {Math.min(currentPage * itemsPerPage, users.length)} dari {users.length} pengelola
              </span>
              <select 
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="ml-2 bg-transparent border-none font-medium text-on-surface outline-none cursor-pointer focus:ring-0"
              >
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm bg-surface-container-lowest border border-outline-variant/50 hover:bg-surface-container-low text-on-surface rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-sm font-medium px-2 text-on-surface">
                {currentPage} / {totalPages || 1}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1 text-sm bg-surface-container-lowest border border-outline-variant/50 hover:bg-surface-container-low text-on-surface rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

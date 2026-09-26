import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { supabaseAdmin } from '../../lib/supabaseClient';
import { getPengelolaList, Pengelola } from '../../services/koperasiService';

export default function UserManagement() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [role, setRole] = useState<'admin' | 'operator'>('operator');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [users, setUsers] = useState<Pengelola[]>([]);
  const [isFetching, setIsFetching] = useState(true);

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

    if (!supabaseAdmin) {
      setMessage({ type: 'error', text: 'Service Role Key tidak dikonfigurasi. Tidak dapat membuat user baru.' });
      return;
    }

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Kata sandi minimal 6 karakter.' });
      return;
    }

    setIsLoading(true);

    try {
      // 1. Create user in auth.users
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nama },
        app_metadata: { role }
      });

      if (authError) throw authError;

      if (authData.user) {
        // 2. Insert into public.pengelola using supabaseAdmin
        const { error: dbError } = await supabaseAdmin
          .from('pengelola')
          .insert([
            { id: authData.user.id, nama, role }
          ]);
        
        if (dbError) {
          console.error('Error inserting into pengelola:', dbError);
          const { error: upsertError } = await supabaseAdmin
            .from('pengelola')
            .upsert([
              { id: authData.user.id, nama, role }
            ]);
            
          if(upsertError) {
            console.error('Upsert failed:', upsertError);
          }
        }
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
    if (!supabaseAdmin) {
      alert('Service Role Key tidak dikonfigurasi.');
      return;
    }
    
    if (window.confirm(`Apakah Anda yakin ingin menghapus pengelola "${namaUser}" secara permanen?`)) {
      try {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
        if (error) throw error;
        
        // Trigger refetch
        fetchUsers();
      } catch (err: any) {
        alert(`Gagal menghapus user: ${err.message}`);
      }
    }
  };

  const handleToggleRole = async (user: Pengelola) => {
    if (!supabaseAdmin) {
      alert('Service Role Key tidak dikonfigurasi.');
      return;
    }

    const newRole = user.role === 'admin' ? 'operator' : 'admin';
    if (window.confirm(`Ubah hak akses "${user.nama}" menjadi ${newRole.toUpperCase()}?`)) {
      try {
        // 1. Update auth.users metadata
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
          app_metadata: { role: newRole }
        });
        if (authError) throw authError;

        // 2. Update pengelola table
        const { error: dbError } = await supabaseAdmin
          .from('pengelola')
          .update({ role: newRole })
          .eq('id', user.id);
        
        if (dbError) throw dbError;

        fetchUsers();
      } catch (err: any) {
        alert(`Gagal mengubah role: ${err.message}`);
      }
    }
  };

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
                  users.map((user) => (
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
        </div>
      </div>
    </AdminLayout>
  );
}

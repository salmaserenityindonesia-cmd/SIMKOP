import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  createSystemUser,
  deactivateSystemUser,
  deleteSystemUser,
  getPengelolaWithEmails,
  getUserActivitySummaryMap,
  reactivateSystemUser,
  resetSystemUserPassword,
  updateSystemUserRole,
  type UserActivitySummary,
} from '../../services/userService';
import { type Pengelola } from '../../services/koperasiService';
import { useFeedback } from '../../context/FeedbackContext';
import { supabase } from '../../lib/supabaseClient';
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';

const DEACTIVATION_REASON_PRESETS = [
  'Resign / Mengundurkan Diri',
  'Pindah Tugas / Mutasi',
  'Kontrak Berakhir',
];

export default function UserManagement() {
  const { showToast, showConfirm } = useFeedback();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [role, setRole] = useState<'admin' | 'operator'>('operator');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [users, setUsers] = useState<Pengelola[]>([]);
  const [activityMap, setActivityMap] = useState<Record<string, UserActivitySummary>>({});
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [isFetching, setIsFetching] = useState(true);
  const [statusTab, setStatusTab] = useState<'active' | 'inactive'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modal Nonaktifkan Akun
  const [deactivateTarget, setDeactivateTarget] = useState<Pengelola | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('');
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Modal Reset Kata Sandi
  const [passwordModalUser, setPasswordModalUser] = useState<Pengelola | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [savedResetPassword, setSavedResetPassword] = useState<string | null>(null);
  const [copiedResetPassword, setCopiedResetPassword] = useState(false);

  const fetchUsers = async () => {
    setIsFetching(true);
    try {
      const [userList, summaryMap] = await Promise.all([
        getPengelolaWithEmails(),
        getUserActivitySummaryMap(),
      ]);
      setUsers(userList);
      setActivityMap(summaryMap);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) {
        setCurrentUserId(data.user.id);
      }
    });
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

  const handleOpenDeactivateModal = (user: Pengelola) => {
    setDeactivateTarget(user);
    setDeactivationReason('');
  };

  const handleConfirmDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deactivateTarget) return;
    const trimmed = deactivationReason.trim();
    if (!trimmed) {
      showToast('Harap isi alasan penonaktifan akun.', 'warning');
      return;
    }

    setIsDeactivating(true);
    try {
      const res = await deactivateSystemUser(deactivateTarget.id, trimmed);
      if (!res.success) {
        throw new Error(res.error || 'Gagal menonaktifkan akun');
      }

      const handoverParts: string[] = [];
      if ((res.reassignedCount || 0) > 0) {
        handoverParts.push(`${res.reassignedCount} tugas opname dialihkan ke operator aktif`);
      }
      if ((res.returnedToQueueCount || 0) > 0) {
        handoverParts.push(`${res.returnedToQueueCount} tugas dikembalikan ke antrean`);
      }
      const handoverNote = handoverParts.length > 0 ? ` (${handoverParts.join(', ')})` : '';

      showToast(
        `Akun "${deactivateTarget.nama}" berhasil dinonaktifkan${handoverNote}.`,
        'success'
      );
      setDeactivateTarget(null);
      setDeactivationReason('');
      await fetchUsers();
    } catch (err: any) {
      showToast(`Gagal menonaktifkan user: ${err.message}`, 'error');
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleReactivateUser = async (user: Pengelola) => {
    const confirmed = await showConfirm({
      title: 'Aktifkan Kembali Akun',
      message: `Aktifkan kembali akun "${user.nama}"? Akun akan mendapat akses login standar dan dapat diatur ulang hak akses POS/Opname-nya.`,
      confirmText: 'Aktifkan Kembali',
    });

    if (!confirmed) return;

    try {
      const res = await reactivateSystemUser(user.id);
      if (!res.success) {
        throw new Error(res.error || 'Gagal mengaktifkan kembali akun');
      }
      showToast(`Akun "${user.nama}" telah diaktifkan kembali.`, 'success');
      await fetchUsers();
    } catch (err: any) {
      showToast(`Gagal mengaktifkan kembali user: ${err.message}`, 'error');
    }
  };

  const handleCopyEmail = async (userId: string, userEmail: string) => {
    try {
      await navigator.clipboard.writeText(userEmail);
      setCopiedUserId(userId);
      showToast(`Email ${userEmail} disalin`, 'success');
      setTimeout(() => {
        setCopiedUserId((prev) => (prev === userId ? null : prev));
      }, 1500);
    } catch {
      showToast('Gagal menyalin email ke clipboard.', 'error');
    }
  };

  const handleOpenPasswordModal = (user: Pengelola) => {
    setPasswordModalUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setSavedResetPassword(null);
    setCopiedResetPassword(false);
  };

  const handleClosePasswordModal = () => {
    if (isUpdatingPassword) return;
    setPasswordModalUser(null);
    setNewPassword('');
    setConfirmPassword('');
    setSavedResetPassword(null);
    setCopiedResetPassword(false);
  };

  const handleGenerateRandomPassword = () => {
    const prefixes = ['Kasir', 'Simkop', 'Staf'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const digits = Math.floor(1000 + Math.random() * 9000);
    const generated = `${prefix}#${digits}`;
    setNewPassword(generated);
    setConfirmPassword(generated);
    setShowNewPassword(true);
  };

  const handleSubmitPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser) return;

    const cleanPassword = newPassword.trim();
    if (cleanPassword.length < 6) {
      showToast('Kata sandi baru minimal harus terdiri dari 6 karakter.', 'warning');
      return;
    }
    if (cleanPassword !== confirmPassword.trim()) {
      showToast('Konfirmasi kata sandi tidak cocok.', 'warning');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await resetSystemUserPassword(passwordModalUser.id, cleanPassword);
      if (!res.success) {
        throw new Error(res.error || 'Gagal mengganti kata sandi.');
      }

      showToast(
        res.message || `Kata sandi untuk "${passwordModalUser.nama}" berhasil diperbarui.`,
        'success'
      );
      setSavedResetPassword(cleanPassword);
    } catch (err: any) {
      showToast(`Gagal mengganti kata sandi: ${err.message}`, 'error');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleCopyResetPassword = async () => {
    if (!savedResetPassword) return;
    try {
      await navigator.clipboard.writeText(savedResetPassword);
      setCopiedResetPassword(true);
      showToast('Kata sandi baru disalin ke clipboard.', 'success');
      setTimeout(() => setCopiedResetPassword(false), 1500);
    } catch {
      showToast('Gagal menyalin kata sandi.', 'error');
    }
  };

  const activeUsers = useMemo(
    () => users.filter((u) => u.is_active !== false),
    [users]
  );
  const inactiveUsers = useMemo(
    () => users.filter((u) => u.is_active === false),
    [users]
  );
  const filteredUsers = useMemo(() => {
    const base = statusTab === 'active' ? activeUsers : inactiveUsers;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (u) =>
        (u.nama || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
  }, [statusTab, activeUsers, inactiveUsers, searchQuery]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const safePage = totalPages === 0 ? 1 : Math.min(currentPage, totalPages);
  const paginatedUsers = filteredUsers.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage
  );

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
          <div className="p-4 border-b border-outline-variant/30 bg-surface-container-low/30 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-title-md font-title-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
                Daftar Pengelola Sistem
              </h2>

              <div className="inline-flex p-1 rounded-lg bg-surface-container-low border border-outline-variant/40 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setStatusTab('active');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                    statusTab === 'active'
                      ? 'bg-primary text-surface-container-lowest shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>Aktif</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      statusTab === 'active'
                        ? 'bg-white/20 text-white'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {activeUsers.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusTab('inactive');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                    statusTab === 'inactive'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>Nonaktif / Keluar</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      statusTab === 'inactive'
                        ? 'bg-white/20 text-white'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {inactiveUsers.length}
                  </span>
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari nama atau email pengelola..."
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-surface-container-lowest border border-outline-variant/60 rounded-lg focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  aria-label="Hapus pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm text-on-surface">
              <thead className="bg-surface-container-low/20 text-label-sm font-label-sm text-on-surface-variant uppercase border-b border-outline-variant/40">
                <tr>
                  <th className="px-6 py-4 font-semibold">Nama</th>
                  <th className="px-6 py-4 font-semibold">Role</th>
                  <th className="px-6 py-4 font-semibold">
                    {statusTab === 'inactive' ? 'Info Keluar / Nonaktif' : 'Tgl Terdaftar'}
                  </th>
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
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant">
                      {statusTab === 'active'
                        ? 'Tidak ada data pengelola aktif.'
                        : 'Tidak ada pengelola yang berstatus nonaktif / keluar.'}
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user) => {
                    const isSelf = user.id === currentUserId;
                    const activity = activityMap[user.id];
                    const hasHistory = Boolean(activity?.hasHistory);

                    return (
                      <tr key={user.id} className="hover:bg-surface-container-lowest/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className="font-title-sm text-primary">{user.nama}</span>
                            {isSelf && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Anda
                              </span>
                            )}
                            {hasHistory && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600"
                                title={`Memiliki riwayat (${activity.salesCount} penjualan, ${activity.shiftsCount} shift, ${activity.opnameTasksCount} opname)`}
                              >
                                Ada Riwayat
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs font-mono text-slate-600 select-all">
                              {user.email || 'Email tidak tersedia'}
                            </span>
                            {user.email && (
                              <button
                                type="button"
                                onClick={() => handleCopyEmail(user.id, user.email!)}
                                title="Salin alamat email login"
                                aria-label={`Salin email ${user.email}`}
                                className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                              >
                                {copiedUserId === user.id ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
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
                          {statusTab === 'inactive' ? (
                            <div className="space-y-0.5">
                              <div className="font-medium text-slate-700">
                                {user.deactivated_at
                                  ? new Date(user.deactivated_at).toLocaleDateString('id-ID')
                                  : '-'}
                              </div>
                              {user.deactivation_reason && (
                                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded px-2 py-0.5 inline-block max-w-[220px] truncate" title={user.deactivation_reason}>
                                  {user.deactivation_reason}
                                </div>
                              )}
                            </div>
                          ) : user.created_at ? (
                            new Date(user.created_at).toLocaleDateString('id-ID')
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            {statusTab === 'active' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isSelf}
                                  className="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-secondary/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                  title="Ubah Role (Admin/Operator)"
                                  onClick={() => handleToggleRole(user)}
                                >
                                  <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenPasswordModal(user)}
                                  title="Ganti / Reset Kata Sandi User"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  <span>Password</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isSelf}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                  title={isSelf ? 'Tidak dapat menonaktifkan akun sendiri' : 'Nonaktifkan Akun Karyawan Keluar'}
                                  onClick={() => handleOpenDeactivateModal(user)}
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                  <span>Nonaktifkan</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors cursor-pointer"
                                title="Aktifkan Kembali Akun"
                                onClick={() => handleReactivateUser(user)}
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Aktifkan Kembali</span>
                              </button>
                            )}

                            {!hasHistory && !isSelf && (
                              <button
                                type="button"
                                className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-md transition-colors cursor-pointer"
                                title="Hapus Permanen (hanya untuk akun tanpa riwayat transaksi/opname)"
                                onClick={() => handleDeleteUser(user.id, user.nama)}
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm p-4 border-t border-outline-variant/40 bg-surface-container-low/10">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span>
                Menampilkan {filteredUsers.length === 0 ? 0 : (safePage - 1) * itemsPerPage + 1}-
                {Math.min(safePage * itemsPerPage, filteredUsers.length)} dari {filteredUsers.length} pengelola
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
                disabled={safePage === 1}
                className="px-3 py-1 text-sm bg-surface-container-lowest border border-outline-variant/50 hover:bg-surface-container-low text-on-surface rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-sm font-medium px-2 text-on-surface">
                {safePage} / {totalPages || 1}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages || totalPages === 0}
                className="px-3 py-1 text-sm bg-surface-container-lowest border border-outline-variant/50 hover:bg-surface-container-low text-on-surface rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Nonaktifkan Akun */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold">Nonaktifkan Akun Pengelola</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeactivateTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDeactivate} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                <p className="font-semibold">
                  Akun: {deactivateTarget.nama} ({deactivateTarget.role.toUpperCase()})
                </p>
                <p>
                  Menonaktifkan akun akan langsung mencabut akses login, Kasir POS, dan Cek Fisik Inventory, serta mengalihkan seluruh tugas stock opname yang masih tertunda ke operator aktif. Riwayat transaksi &amp; audit masa lalu tetap aman terjaga.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Alasan Penonaktifan / Karyawan Keluar
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DEACTIVATION_REASON_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDeactivationReason(preset)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                        deactivationReason === preset
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  value={deactivationReason}
                  onChange={(e) => setDeactivationReason(e.target.value)}
                  placeholder="Misal: Resign / Pindah Tugas per Nov 2026"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeactivateTarget(null)}
                  disabled={isDeactivating}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isDeactivating || !deactivationReason.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isDeactivating ? 'Menonaktifkan...' : 'Ya, Nonaktifkan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reset / Ganti Kata Sandi Pengguna */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-300" />
                <h3 className="text-base font-bold">Reset Kata Sandi Pengguna</h3>
              </div>
              <button
                type="button"
                onClick={handleClosePasswordModal}
                disabled={isUpdatingPassword}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {savedResetPassword ? (
              <div className="p-5 space-y-4">
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <p className="font-bold">
                    Kata sandi baru untuk {passwordModalUser.nama} berhasil disimpan!
                  </p>
                  <p>
                    Berikan kata sandi di bawah ini kepada petugas terkait agar dapat langsung masuk kembali ke sistem.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="font-mono text-sm font-bold text-slate-900 select-all">
                    {savedResetPassword}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyResetPassword}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {copiedResetPassword ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Sandi</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleClosePasswordModal}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitPasswordReset} className="p-5 space-y-4">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-0.5">
                  <div className="font-bold text-slate-900">
                    {passwordModalUser.nama} ({passwordModalUser.role.toUpperCase()})
                  </div>
                  <div className="font-mono text-slate-500">
                    {passwordModalUser.email || `${passwordModalUser.id.substring(0, 8)}...`}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Kata Sandi Baru (Minimal 6 karakter)
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateRandomPassword}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Generate Sandi Acak</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Masukkan kata sandi baru"
                      className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      aria-label={showNewPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Ulangi Kata Sandi Baru
                  </label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi baru"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600"
                  />
                  {confirmPassword && newPassword.trim() !== confirmPassword.trim() && (
                    <p className="text-[11px] text-rose-600 font-medium">
                      Konfirmasi kata sandi belum cocok.
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleClosePasswordModal}
                    disabled={isUpdatingPassword}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isUpdatingPassword ||
                      newPassword.trim().length < 6 ||
                      newPassword.trim() !== confirmPassword.trim()
                    }
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {isUpdatingPassword ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

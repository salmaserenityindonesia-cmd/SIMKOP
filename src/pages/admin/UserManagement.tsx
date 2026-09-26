import React, { useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { supabaseAdmin, supabase } from '../../lib/supabaseClient';

export default function UserManagement() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [role, setRole] = useState<'admin' | 'operator'>('operator');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

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
        // 2. Insert into public.anggota using supabaseAdmin to bypass RLS if any, 
        // or let the trigger do it? The DB trigger only sets raw_app_meta_data for the first user.
        // Let's manually insert into public.anggota
        const { error: dbError } = await supabaseAdmin
          .from('anggota')
          .insert([
            { id: authData.user.id, nama, role }
          ]);
        
        // Sometimes the trigger handles role, but we explicitly inserted it
        if (dbError) {
          console.error('Error inserting into anggota:', dbError);
          // Don't throw here to avoid failing if the trigger already inserted it, 
          // but we can check if it already exists or upsert it.
          const { error: upsertError } = await supabaseAdmin
            .from('anggota')
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
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal mendaftarkan user' });
    } finally {
      setIsLoading(false);
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

        {/* Tabel Daftar User akan ditaruh di sini nantinya (Plan 2.4) */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-sm overflow-hidden lg:col-span-2 flex items-center justify-center p-8 text-on-surface-variant text-center">
          <div>
            <span className="material-symbols-outlined text-[48px] text-outline-variant mb-2">group</span>
            <h3 className="text-title-md font-title-md text-primary mb-1">Daftar User Sistem</h3>
            <p className="text-body-sm">Fitur manajemen daftar user (CRUD) akan diimplementasikan pada Plan 2.4.</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

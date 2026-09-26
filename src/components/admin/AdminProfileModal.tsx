import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userName: string;
}

export default function AdminProfileModal({ isOpen, onClose, userEmail, userName }: AdminProfileModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Close on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Konfirmasi kata sandi baru tidak cocok.' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }

    setIsLoading(true);
    // Direct password update
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Kata sandi berhasil diperbarui.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Auto close after 2s
      setTimeout(() => onClose(), 2000);
    }
    setIsLoading(false);
  };

  const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AD';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F2942]/50 backdrop-blur-sm transition-all duration-200" id="adminProfileModal">
      <div className="bg-surface-container-lowest w-full max-w-2xl rounded-2xl border border-outline-variant/40 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-5 bg-surface-container-lowest border-b border-outline-variant/30 flex items-start justify-between relative">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-primary-container text-secondary-fixed flex items-center justify-center shadow-sm border border-secondary-fixed/20">
              <span className="material-symbols-outlined text-[24px]">admin_panel_settings</span>
            </div>
            <div>
              <h2 className="text-headline-sm font-headline-sm text-primary font-semibold tracking-tight">Manajemen Profil & Keamanan Admin</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">Kelola kredensial akun dan keamanan akses sistem SIMKOP</p>
            </div>
          </div>
          <button onClick={onClose} className="text-outline hover:text-primary p-1.5 rounded-lg hover:bg-surface-container-low transition-colors" title="Tutup Modal">
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          
          {/* SECTION 1: PROFIL ADMIN */}
          <div className="p-4 rounded-xl bg-surface-container-low/70 border border-outline-variant/40 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-outline-variant/30">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-primary-container text-secondary-fixed font-title-md text-title-md flex items-center justify-center border-2 border-secondary font-bold shadow-sm">
                    {initials}
                  </div>
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#10B981] border-2 border-surface-container-lowest" title="Sesi Berjalan"></span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-title-md font-title-md text-primary font-bold">{userName}</h3>
                    <span className="px-2 py-0.5 rounded text-[11px] font-title-sm bg-secondary-container/40 text-on-secondary-container border border-secondary/20">Super Admin</span>
                  </div>
                  <div className="text-label-sm font-label-sm text-outline mt-0.5">Role Admin • Hak Akses: Penuh</div>
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#ECFDF5] text-[#047857] text-label-sm font-semibold border border-[#10B981]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
                Aktif - Sesi Berjalan
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
              <div>
                <span className="text-label-sm font-label-sm text-outline block">Email Terdaftar</span>
                <span className="font-title-sm text-primary">{userEmail}</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: FORM UBAH KATA SANDI */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="flex items-center justify-between pb-1 border-b border-outline-variant/30">
              <h4 className="text-title-sm font-title-sm text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[18px]">lock_reset</span>
                Pembaruan Kata Sandi
              </h4>
            </div>

            {message.text && (
              <div className={`p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-error-container text-on-error-container' : 'bg-[#ECFDF5] text-[#047857]'}`}>
                {message.text}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-label-sm font-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
                Kata Sandi Baru <span className="text-error">*</span>
              </label>
              <div className="relative">
                <input 
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-md text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20" 
                  placeholder="Masukkan kata sandi baru" 
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary">
                  <span className="material-symbols-outlined text-[18px]">{showNew ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-label-sm font-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
                Konfirmasi Kata Sandi Baru <span className="text-error">*</span>
              </label>
              <div className="relative">
                <input 
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-body-md text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20" 
                  placeholder="Ulangi kata sandi baru" 
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary">
                  <span className="material-symbols-outlined text-[18px]">{showConfirm ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-outline-variant/30">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-title-sm font-title-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">
                Batal
              </button>
              <button 
                type="submit" 
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-surface-container-lowest font-title-sm shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-70"
              >
                {isLoading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-surface-container-lowest border-t-transparent rounded-full"></div>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">save</span>
                )}
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import AdminProfileModal from '../admin/AdminProfileModal';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('pengelola')
          .select('nama')
          .eq('id', user.id)
          .single();
        
        setUser({
          email: user.email || '',
          name: profile?.nama || user.user_metadata?.nama || 'Admin SIMKOP'
        });
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const initials = user?.name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'AD';

  return (
    <div className="bg-background text-on-surface antialiased font-body-md text-body-md overflow-x-hidden min-h-screen">
      {/* SIDEBAR NAVIGATION */}
      <aside className="fixed top-0 left-0 h-screen w-72 flex flex-col z-30 bg-primary-container text-on-primary-container shadow-md border-r border-outline-variant/20">
        <div className="w-72 h-full flex flex-col justify-between p-4">
          <div className="space-y-6">
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="w-10 h-10 rounded-lg bg-surface-container-lowest p-1 shadow-sm flex items-center justify-center text-primary font-bold text-xl">S</div>
              <div className="flex flex-col">
                <span className="text-title-md font-title-md text-surface-container-lowest tracking-tight leading-tight">SIMKOP Enterprise</span>
                <span className="text-label-sm font-label-sm text-secondary-fixed tracking-normal">Koperasi Digital Mandiri</span>
              </div>
            </div>
            
            <div>
              <NavLink 
                to="/admin/kasir"
                className={({ isActive }) => 
                  `w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-title-sm text-title-sm shadow transition-all duration-150 active:scale-[0.98] ${
                    isActive 
                      ? 'bg-secondary-fixed text-on-secondary-fixed' 
                      : 'bg-secondary text-on-secondary hover:bg-secondary/90'
                  }`
                }
              >
                <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
                <span>Kasir (POS)</span>
              </NavLink>
            </div>

            <nav className="space-y-1">
              <NavLink 
                to="/admin" 
                end
                className={({ isActive }) => 
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg font-title-sm transition-colors ${
                    isActive 
                      ? 'bg-surface-container-lowest/10 text-surface-container-lowest border-l-4 border-secondary-fixed' 
                      : 'text-on-primary-container hover:text-surface-container-lowest hover:bg-surface-container-lowest/5 font-label-md border-l-4 border-transparent'
                  }`
                }
              >
                <span className="material-symbols-outlined text-secondary-fixed" style={{fontVariationSettings: "'FILL' 1"}}>dashboard</span>
                <span>Dashboard</span>
              </NavLink>
              <NavLink 
                to="/admin/simpan-pinjam"
                className={({ isActive }) => 
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg font-title-sm transition-colors ${
                    isActive 
                      ? 'bg-surface-container-lowest/10 text-surface-container-lowest border-l-4 border-secondary-fixed' 
                      : 'text-on-primary-container hover:text-surface-container-lowest hover:bg-surface-container-lowest/5 font-label-md border-l-4 border-transparent'
                  }`
                }
              >
                <span className="material-symbols-outlined">account_balance</span>
                <span>Simpan Pinjam</span>
              </NavLink>
              <NavLink 
                to="/admin/users"
                className={({ isActive }) => 
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg font-title-sm transition-colors ${
                    isActive 
                      ? 'bg-surface-container-lowest/10 text-surface-container-lowest border-l-4 border-secondary-fixed' 
                      : 'text-on-primary-container hover:text-surface-container-lowest hover:bg-surface-container-lowest/5 font-label-md border-l-4 border-transparent'
                  }`
                }
              >
                <span className="material-symbols-outlined">group</span>
                <span>Manajemen User</span>
              </NavLink>
            </nav>
          </div>

          <div className="space-y-3 pt-4 border-t border-outline-variant/15">
            <nav className="space-y-1">
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-on-primary-container hover:text-error-container hover:bg-surface-container-lowest/5 font-label-md transition-colors">
                <span className="material-symbols-outlined text-[18px]">logout</span>
                <span>Log Keluar</span>
              </button>
            </nav>
            <div className="px-4 py-2 bg-surface-container-lowest/5 rounded-lg flex items-center justify-between text-[11px] text-on-primary-container/80">
              <span>SIMKOP v1.0.0</span>
              <span className="inline-flex items-center gap-1 text-secondary-fixed">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed animate-pulse"></span> Online
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* TOP APP BAR */}
      <header className="sticky top-0 right-0 h-16 w-full z-20 bg-surface-container-lowest shadow-sm border-b border-outline-variant/40">
        <div className="flex justify-between items-center h-16 px-6 ml-72">
          <div className="flex items-center gap-6 flex-1 max-w-2xl">
            <div className="hidden xl:flex items-center gap-2 text-label-md font-label-md text-on-surface-variant">
              <span className="font-title-sm text-primary">SIMKOP</span>
              <span className="text-outline-variant">/</span>
              <span className="text-on-surface font-title-sm">Dashboard Eksekutif</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setProfileModalOpen(true)}
              className="flex items-center gap-3 pl-2 pr-3 py-1.5 rounded-lg border border-secondary/30 bg-surface-container-low hover:bg-surface-container-high transition-colors text-left ring-2 ring-secondary/20"
            >
              <div className="w-8 h-8 rounded-full bg-primary-container text-secondary-fixed font-title-sm flex items-center justify-center border border-secondary-fixed/30 shadow-sm">
                {initials}
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-title-sm font-title-sm text-primary leading-tight">{user?.name || 'Admin'}</span>
                <span className="text-label-sm font-label-sm text-secondary font-medium">Super Admin</span>
              </div>
              <span className="material-symbols-outlined text-outline text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="ml-72 p-8 max-w-[1440px] space-y-8">
        {children}
      </main>

      {/* Admin Profile Modal */}
      {user && (
        <AdminProfileModal 
          isOpen={isProfileModalOpen} 
          onClose={() => setProfileModalOpen(false)} 
          userEmail={user.email}
          userName={user.name}
        />
      )}
    </div>
  );
}

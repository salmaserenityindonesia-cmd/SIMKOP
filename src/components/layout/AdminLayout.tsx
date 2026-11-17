import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, X, LogOut, Menu } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import AdminProfileModal from '../admin/AdminProfileModal';
import Sidebar, {
  saveSidebarScrollTop,
  restoreSidebarScroll,
} from './Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [user, setUser] = useState<{ email: string; name: string; role: string } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const navContainerRef = useRef<HTMLDivElement | null>(null);

  const handleNavScroll = (e: React.UIEvent<HTMLDivElement>) => {
    saveSidebarScrollTop(e.currentTarget.scrollTop);
  };

  useLayoutEffect(() => {
    try {
      const activeItem = navContainerRef.current?.querySelector(
        '[aria-current="page"]'
      ) as HTMLElement | null;
      restoreSidebarScroll(navContainerRef.current, activeItem);
    } catch {
      // ignore errors
    }
  }, [location.pathname]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('pengelola')
          .select('nama, role')
          .eq('id', user.id)
          .single();
        
        setUser({
          email: user.email || '',
          name: profile?.nama || user.user_metadata?.nama || 'Admin SIMKOP',
          role: profile?.role || 'operator'
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
  const desktopMarginClass = isCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64';

  return (
    <div className="bg-background text-on-surface antialiased font-body-md text-body-md overflow-x-hidden min-h-screen">
      {/* Mobile & Tablet Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 z-30 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside
        className={`fixed top-0 left-0 h-screen flex flex-col z-40 bg-[#0F1E36] text-slate-300 shadow-xl border-r border-[#1E3252] transition-all duration-300 ease-in-out w-72 ${
          isCollapsed ? 'lg:w-[72px]' : 'lg:w-64'
        } ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="w-full h-full flex flex-col justify-between">
          {/* Top Brand Header */}
          <div
            className={`h-16 flex items-center shrink-0 border-b border-[#1E3252] ${
              isCollapsed ? 'lg:justify-center lg:px-2 px-4 justify-between' : 'justify-between px-4'
            }`}
          >
            <div className={`flex items-center gap-2.5 min-w-0 ${isCollapsed ? 'lg:justify-center' : ''}`}>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-extrabold text-sm shrink-0 shadow-inner">
                SK
              </div>
              <div className={`flex flex-col leading-tight min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
                <span className="text-sm font-bold text-white tracking-tight truncate">
                  SIMKOP Enterprise
                </span>
                <span className="text-[11px] font-medium text-emerald-400 tracking-wide truncate">
                  Koperasi Digital Mandiri
                </span>
              </div>
            </div>

            {/* Desktop Collapse Toggle */}
            {!isCollapsed && (
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                title="Ciutkan Sidebar"
                aria-label="Ciutkan Sidebar"
                className="hidden lg:flex w-8 h-8 rounded-lg items-center justify-center text-slate-300 hover:text-white hover:bg-[#1E3252]/70 transition-colors cursor-pointer shrink-0"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}

            {/* Mobile Close Drawer Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              title="Tutup Menu"
              aria-label="Tutup Menu"
              className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1E3252]/70 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Expand button when collapsed on desktop */}
          {isCollapsed && (
            <div className="hidden lg:flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setIsCollapsed(false)}
                title="Lebarkan Sidebar"
                aria-label="Lebarkan Sidebar"
                className="w-11 h-9 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#1E3252]/70 transition-colors cursor-pointer"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Scrollable Accordion Navigation */}
          <div
            ref={navContainerRef}
            onScroll={handleNavScroll}
            className="flex-1 overflow-y-auto px-3 py-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            <Sidebar
              userRole={user?.role}
              isCollapsed={isCollapsed && !isMobileMenuOpen}
              onItemClick={() => {
                if (window.innerWidth < 1024) setIsMobileMenuOpen(false);
              }}
            />
          </div>

          {/* Pinned Footer */}
          <div className="p-3 space-y-2 border-t border-[#1E3252] bg-[#0C182C] shrink-0">
            <div
              title="SIMKOP v1.0.0 • Online"
              className={`px-3 py-1.5 rounded-lg bg-[#162846] border border-[#1E3252] flex items-center text-[11px] text-slate-300 ${
                isCollapsed ? 'lg:justify-center lg:px-0 justify-between' : 'justify-between'
              }`}
            >
              <span className={isCollapsed ? 'lg:hidden' : ''}>SIMKOP v1.0.0</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className={isCollapsed ? 'lg:hidden' : ''}>Online</span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title="Log Keluar"
              className={`w-full flex items-center gap-2.5 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:text-white hover:bg-rose-500/20 border border-transparent hover:border-rose-500/30 transition-colors cursor-pointer ${
                isCollapsed ? 'lg:justify-center lg:px-0' : ''
              }`}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className={isCollapsed ? 'lg:hidden' : ''}>Log Keluar</span>
            </button>
          </div>
        </div>
      </aside>

      {/* TOP APP BAR */}
      <header className="sticky top-0 right-0 h-16 w-full z-20 bg-surface-container-lowest shadow-sm border-b border-outline-variant/40">
        <div className={`flex justify-between items-center h-16 px-4 lg:px-6 transition-all duration-300 ${desktopMarginClass}`}>
          <div className="flex items-center gap-4 flex-1 max-w-2xl">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  setIsCollapsed((prev) => !prev);
                } else {
                  setIsMobileMenuOpen((prev) => !prev);
                }
              }}
              aria-label="Toggle Menu Navigasi"
              className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors flex items-center justify-center cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
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
                <span className="text-label-sm font-label-sm text-secondary font-medium capitalize">{user?.role || 'Admin'}</span>
              </div>
              <span className="material-symbols-outlined text-outline text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className={`p-4 lg:p-8 max-w-[1440px] space-y-8 transition-all duration-300 ${desktopMarginClass}`}>
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

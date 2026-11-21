import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Boxes,
  Wallet,
  Receipt,
  ArrowUpRight,
  FileText,
  CheckSquare,
  Grid,
  BarChart,
  BarChart3,
  Upload,
  RefreshCw,
  UserCheck,
  ShoppingCart,
  Tags,
  Truck,
  Package,
  Users,
  ShieldCheck,
  FileSpreadsheet,
  TrendingUp,
  Settings,
  SlidersHorizontal,
  RotateCcw,
  ArrowLeftRight,
  ShoppingBag,
  CreditCard,
  CheckCircle2,
  BookOpen,
  Banknote,
  ChevronDown,
  Landmark,
} from 'lucide-react';

export interface NavigationItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  adminOnly?: boolean;
}

export interface NavigationGroup {
  id: string;
  groupName: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavigationItem[];
}

export const SIDEBAR_SCROLL_STORAGE_KEY = 'simkop_sidebar_scroll_top';

export function saveSidebarScrollTop(scrollTop: number): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(scrollTop));
    }
  } catch {
    // ignore
  }
}

export function getSavedSidebarScrollTop(): number | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = window.sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY);
      return saved !== null && !isNaN(Number(saved)) ? Number(saved) : null;
    }
  } catch {
    // ignore
  }
  return null;
}

export function restoreSidebarScroll(
  container: HTMLElement | null,
  activeItem?: HTMLElement | null
): boolean {
  if (!container) return false;
  const saved = getSavedSidebarScrollTop();
  if (saved !== null) {
    container.scrollTop = saved;
    return true;
  }
  if (activeItem && typeof activeItem.scrollIntoView === 'function') {
    activeItem.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    return true;
  }
  return false;
}

export function handleSidebarItemClick(
  e: { currentTarget: { closest?: (selector: string) => HTMLElement | Element | null } },
  onItemClick?: () => void
): void {
  try {
    const container = e.currentTarget.closest?.('.overflow-y-auto') as HTMLElement | null;
    if (container && typeof container.scrollTop === 'number') {
      saveSidebarScrollTop(container.scrollTop);
    }
  } catch {
    // ignore
  }
  if (onItemClick) {
    onItemClick();
  }
}

export const topDashboardItem: NavigationItem = {
  label: 'Dashboard Operasional',
  icon: LayoutDashboard,
  href: '/admin',
};

export const navigationGroups: NavigationGroup[] = [
  {
    id: 'retail',
    groupName: 'Toko Retail & POS',
    icon: ShoppingCart,
    items: [
      { label: 'Kasir (POS)', icon: ShoppingCart, href: '/admin/kasir' },
      { label: 'Inventori Produk', icon: Package, href: '/admin/produk' },
      { label: 'Kategori Produk', icon: Tags, href: '/admin/kategori' },
      { label: 'Manajemen Pembelian', icon: Truck, href: '/admin/pembelian' },
      { label: 'Retur Pembelian', icon: RotateCcw, href: '/admin/retur-pembelian' },
      { label: 'Buku Besar Bon Toko', icon: CreditCard, href: '/admin/buku-besar-bon-toko' },
      { label: 'Pengaturan Kasir', icon: SlidersHorizontal, href: '/admin/pengaturan-kasir', adminOnly: true },
      { label: 'Laporan Retail & Stok', icon: TrendingUp, href: '/admin/laporan-retail' },
      { label: 'Laporan Mutasi Barang', icon: ArrowLeftRight, href: '/admin/laporan-mutasi' },
    ],
  },
  {
    id: 'simpanan',
    groupName: 'Simpanan & Buku Besar',
    icon: Wallet,
    items: [
      { label: 'Pusat Terima Setoran', icon: Wallet, href: '/admin/setoran' },
      { label: 'Tagihan Simpanan', icon: Receipt, href: '/admin/simpanan' },
      { label: 'Matriks Simpanan', icon: Grid, href: '/admin/compliance-matrix' },
      { label: 'Rekening Koran Simpanan', icon: BookOpen, href: '/admin/rekening-koran-simpanan' },
      { label: 'Pencairan Simpanan', icon: ArrowUpRight, href: '/admin/penarikan-simpanan' },
      { label: 'Laporan Pencairan', icon: FileSpreadsheet, href: '/admin/laporan-penarikan' },
      { label: 'Buku Besar Simp. Belanja', icon: ShoppingBag, href: '/admin/buku-besar-belanja' },
    ],
  },
  {
    id: 'pinjaman',
    groupName: 'Pinjaman & Pembiayaan',
    icon: CreditCard,
    items: [
      { label: 'Pengajuan Pinjaman', icon: FileText, href: '/admin/pengajuan-pinjaman' },
      { label: 'Approval Pinjaman', icon: CheckSquare, href: '/admin/approval', adminOnly: true },
      { label: 'Matriks Pinjaman', icon: BarChart, href: '/admin/loan-matrix' },
      { label: 'Laporan Pinjaman Lunas', icon: CheckCircle2, href: '/admin/laporan-pinjaman-lunas' },
    ],
  },
  {
    id: 'gaji',
    groupName: 'Gaji & Kliring',
    icon: Banknote,
    items: [
      { label: 'Import Gaji & Rekening', icon: Upload, href: '/admin/import-gaji', adminOnly: true },
      { label: 'Update Massal Bulanan', icon: RefreshCw, href: '/admin/batch-update', adminOnly: true },
      { label: 'Kliring & Clearance Anggota', icon: UserCheck, href: '/admin/clearance', adminOnly: true },
    ],
  },
  {
    id: 'laporan',
    groupName: 'Laporan & Keuangan',
    icon: BarChart3,
    items: [
      { label: 'Laporan Keuangan Terpadu', icon: FileSpreadsheet, href: '/admin/laporan-keuangan', adminOnly: true },
      { label: 'Tutup Buku & SHU RAT', icon: Landmark, href: '/admin/tutup-buku', adminOnly: true },
    ],
  },
  {
    id: 'master',
    groupName: 'Master & Pengaturan',
    icon: Settings,
    items: [
      { label: 'Master Produk Koperasi', icon: Boxes, href: '/admin/master-simpan-pinjam', adminOnly: true },
      { label: 'Manajemen Anggota', icon: Users, href: '/admin/anggota' },
      { label: 'Manajemen User', icon: ShieldCheck, href: '/admin/users', adminOnly: true },
      { label: 'Pengaturan Koperasi', icon: Settings, href: '/admin/pengaturan', adminOnly: true },
    ],
  },
];

export function findActiveGroupId(pathname: string): string | null {
  const match = navigationGroups.find((group) =>
    group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
  );
  return match?.id ?? null;
}

interface SidebarProps {
  userRole?: string;
  isCollapsed?: boolean;
  onItemClick?: () => void;
}

export default function Sidebar({ userRole, isCollapsed = false, onItemClick }: SidebarProps) {
  const location = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const activeId = findActiveGroupId(location.pathname);
    return activeId ? { [activeId]: true } : { retail: true };
  });

  const [popoverGroupId, setPopoverGroupId] = useState<string | null>(null);
  const [popoverTop, setPopoverTop] = useState<number>(80);

  // Auto-expand the parent group whenever the active route changes
  useEffect(() => {
    const activeId = findActiveGroupId(location.pathname);
    if (activeId) {
      setOpenGroups((prev) => (prev[activeId] ? prev : { ...prev, [activeId]: true }));
    }
    setPopoverGroupId(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!isCollapsed) {
      setPopoverGroupId(null);
    }
  }, [isCollapsed]);

  useLayoutEffect(() => {
    try {
      const container = navRef.current?.closest('.overflow-y-auto') as HTMLElement | null;
      const activeItem = navRef.current?.querySelector(
        '[aria-current="page"]'
      ) as HTMLElement | null;
      restoreSidebarScroll(container, activeItem);
    } catch {
      // ignore errors
    }
  }, [location.pathname]);

  const handleItemClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    setPopoverGroupId(null);
    handleSidebarItemClick(e, onItemClick);
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const clearPopoverCloseTimer = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const schedulePopoverClose = () => {
    clearPopoverCloseTimer();
    closeTimeoutRef.current = window.setTimeout(() => {
      setPopoverGroupId(null);
    }, 150);
  };

  const openPopoverForGroup = (groupId: string, targetEl: HTMLElement) => {
    clearPopoverCloseTimer();
    const rect = targetEl.getBoundingClientRect();
    const maxTop = typeof window !== 'undefined' ? Math.max(16, window.innerHeight - 320) : rect.top;
    setPopoverTop(Math.min(rect.top, maxTop));
    setPopoverGroupId(groupId);
  };

  const DashboardIcon = topDashboardItem.icon;

  // Visible groups filtered by userRole
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      visibleItems: group.items.filter((item) => !item.adminOnly || userRole === 'admin'),
    }))
    .filter((group) => group.visibleItems.length > 0);

  if (isCollapsed) {
    const activePopoverGroup = visibleGroups.find((g) => g.id === popoverGroupId) || null;

    return (
      <nav
        ref={navRef}
        className="flex flex-col items-center space-y-2 py-1 relative"
        onMouseLeave={schedulePopoverClose}
      >
        {/* Top Single Dashboard Icon */}
        <NavLink
          to={topDashboardItem.href}
          end
          title={topDashboardItem.label}
          onClick={handleItemClick}
          className={({ isActive }) =>
            `w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 ${
              isActive
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-950/40'
                : 'text-slate-300 hover:text-white hover:bg-[#1E3252]/80'
            }`
          }
        >
          <DashboardIcon className="w-5 h-5 shrink-0" />
        </NavLink>

        <div className="w-8 border-t border-[#1E3252] my-1" />

        {/* Group Icons */}
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isGroupActive = group.visibleItems.some(
            (item) => location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
          );
          const isPopoverOpen = popoverGroupId === group.id;

          return (
            <button
              key={group.id}
              type="button"
              title={group.groupName}
              aria-label={group.groupName}
              onMouseEnter={(e) => openPopoverForGroup(group.id, e.currentTarget)}
              onClick={(e) => {
                if (isPopoverOpen) {
                  setPopoverGroupId(null);
                } else {
                  openPopoverForGroup(group.id, e.currentTarget);
                }
              }}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer ${
                isGroupActive || isPopoverOpen
                  ? 'bg-[#172B4D] text-emerald-400 ring-1 ring-emerald-500/40'
                  : 'text-slate-300 hover:text-white hover:bg-[#1E3252]/80'
              }`}
            >
              {isGroupActive && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-emerald-500" />
              )}
              <GroupIcon className="w-5 h-5 shrink-0" />
            </button>
          );
        })}

        {/* Floating Sub-Menu Popover Card */}
        {activePopoverGroup && (
          <div
            style={{ top: `${popoverTop}px` }}
            onMouseEnter={clearPopoverCloseTimer}
            onMouseLeave={schedulePopoverClose}
            className="fixed left-[76px] z-50 min-w-[236px] max-w-[270px] rounded-xl bg-[#0F1E36] border border-[#1E3252] shadow-2xl p-2"
          >
            <div className="px-2.5 py-2 mb-1 border-b border-[#1E3252] flex items-center gap-2">
              <activePopoverGroup.icon className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-white truncate">
                {activePopoverGroup.groupName}
              </span>
            </div>
            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
              {activePopoverGroup.visibleItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={handleItemClick}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        isActive
                          ? 'bg-emerald-500 text-white font-semibold shadow-xs'
                          : 'text-slate-300 hover:text-white hover:bg-[#1E3252]'
                      }`
                    }
                  >
                    <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav ref={navRef} className="space-y-1.5">
      {/* Top Single Item: Dashboard Operasional */}
      <NavLink
        to={topDashboardItem.href}
        end
        onClick={handleItemClick}
        className={({ isActive }) =>
          `flex items-center gap-3 min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
            isActive
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-950/40'
              : 'text-slate-300 hover:text-white hover:bg-[#1E3252]/70'
          }`
        }
      >
        <DashboardIcon className="w-4 h-4 shrink-0" />
        <span className="truncate">{topDashboardItem.label}</span>
      </NavLink>

      <div className="my-2 border-t border-[#1E3252]" />

      {/* 6 Nested Accordion Groups */}
      {visibleGroups.map((group) => {
        const GroupIcon = group.icon;
        const isOpen = !!openGroups[group.id];
        const isGroupActive = group.visibleItems.some(
          (item) => location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
        );

        return (
          <div key={group.id} className="space-y-1">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggleGroup(group.id)}
              className={`w-full flex items-center justify-between gap-2 min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                isGroupActive || isOpen
                  ? 'bg-[#172B4D] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-[#1E3252]/60'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <GroupIcon
                  className={`w-4 h-4 shrink-0 ${
                    isGroupActive ? 'text-emerald-400' : 'text-slate-300'
                  }`}
                />
                <span className="truncate">{group.groupName}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                {isGroupActive && !isOpen && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-white' : ''
                  }`}
                />
              </span>
            </button>

            {isOpen && (
              <div className="ml-4 pl-3 border-l border-slate-700/80 space-y-0.5 py-0.5">
                {group.visibleItems.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      onClick={handleItemClick}
                      className={({ isActive }) =>
                        `relative flex items-center gap-2.5 min-h-[42px] lg:min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 ${
                          isActive
                            ? 'bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30'
                            : 'text-slate-300 hover:text-white hover:bg-[#1E3252]/50 font-medium border border-transparent'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full bg-emerald-500" />
                          )}
                          <ItemIcon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-emerald-400' : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

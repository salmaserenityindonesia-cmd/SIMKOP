import React from 'react';
import { NavLink } from 'react-router-dom';
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
} from 'lucide-react';

export interface NavigationItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  adminOnly?: boolean;
}

export interface NavigationGroup {
  groupName: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    groupName: 'OPERASIONAL',
    items: [
      { label: 'Dashboard Operasional', icon: LayoutDashboard, href: '/admin' },
    ],
  },
  {
    groupName: 'TOKO RETAIL & INVENTORI',
    items: [
      { label: 'Kasir (POS)', icon: ShoppingCart, href: '/admin/kasir' },
      { label: 'Inventori Produk', icon: Package, href: '/admin/produk' },
      { label: 'Kategori Produk', icon: Tags, href: '/admin/kategori' },
      { label: 'Manajemen Pembelian', icon: Truck, href: '/admin/pembelian' },
      { label: 'Retur Pembelian', icon: RotateCcw, href: '/admin/retur-pembelian' },
      { label: 'Pengaturan Kasir', icon: SlidersHorizontal, href: '/admin/pengaturan-kasir', adminOnly: true },
      { label: 'Laporan Retail & Stok', icon: TrendingUp, href: '/admin/laporan-retail' },
    ],
  },
  {
    groupName: 'SIMPAN PINJAM (KSP / USP)',
    items: [
      { label: 'Master Produk Koperasi', icon: Boxes, href: '/admin/master-simpan-pinjam', adminOnly: true },
      { label: 'Pusat Terima Setoran', icon: Wallet, href: '/admin/setoran' },
      { label: 'Tagihan Simpanan', icon: Receipt, href: '/admin/simpanan' },
      { label: 'Penarikan Simpanan', icon: ArrowUpRight, href: '/admin/penarikan-simpanan' },
      { label: 'Pengajuan Pinjaman', icon: FileText, href: '/admin/pengajuan-pinjaman' },
      { label: 'Approval Pinjaman', icon: CheckSquare, href: '/admin/approval', adminOnly: true },
      { label: 'Matriks Simpanan', icon: Grid, href: '/admin/compliance-matrix' },
      { label: 'Matriks Pinjaman', icon: BarChart, href: '/admin/loan-matrix' },
    ],
  },
  {
    groupName: 'UTILITY & REKONSILIASI GAJI',
    items: [
      { label: 'Import Gaji & Rekening', icon: Upload, href: '/admin/import-gaji', adminOnly: true },
      { label: 'Update Massal Bulanan', icon: RefreshCw, href: '/admin/batch-update', adminOnly: true },
      { label: 'Kliring & Clearance Anggota', icon: UserCheck, href: '/admin/clearance', adminOnly: true },
    ],
  },
  {
    groupName: 'MANAJEMEN & AKSES',
    items: [
      { label: 'Manajemen Anggota', icon: Users, href: '/admin/anggota' },
      { label: 'Manajemen User', icon: ShieldCheck, href: '/admin/users', adminOnly: true },
      { label: 'Pengaturan Koperasi', icon: Settings, href: '/admin/pengaturan', adminOnly: true },
    ],
  },
  {
    groupName: 'LAPORAN & ANALITIK',
    items: [
      { label: 'Laporan Keuangan', icon: FileSpreadsheet, href: '/admin/laporan-keuangan', adminOnly: true },
    ],
  },
];

interface SidebarProps {
  userRole?: string;
  onItemClick?: () => void;
}

export default function Sidebar({ userRole, onItemClick }: SidebarProps) {
  return (
    <nav className="space-y-6">
      {navigationGroups.map((group) => {
        // Filter items based on user role (if adminOnly, only render for admin)
        const visibleItems = group.items.filter(
          (item) => !item.adminOnly || userRole === 'admin'
        );

        if (visibleItems.length === 0) return null;

        return (
          <div key={group.groupName} className="space-y-1.5">
            {/* Domain-Driven Group Header */}
            <div className="px-3 py-1 flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-wider text-on-primary-container/60 uppercase">
                {group.groupName}
              </span>
              <div className="h-[1px] flex-1 bg-outline-variant/15" />
            </div>

            {/* Menu Items */}
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.href === '/admin'}
                    onClick={onItemClick}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-xs transition-all duration-150 ${
                        isActive
                          ? 'bg-surface-container-lowest/15 text-surface-container-lowest font-semibold shadow-sm border-l-4 border-secondary-fixed pl-2'
                          : 'text-on-primary-container/80 hover:text-surface-container-lowest hover:bg-surface-container-lowest/8 border-l-4 border-transparent pl-2'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <IconComponent
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive
                              ? 'text-secondary-fixed'
                              : 'text-on-primary-container/70 group-hover:text-surface-container-lowest'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}


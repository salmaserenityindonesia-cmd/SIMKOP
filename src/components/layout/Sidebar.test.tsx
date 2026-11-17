import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Sidebar, {
  topDashboardItem,
  navigationGroups,
  findActiveGroupId,
  SIDEBAR_SCROLL_STORAGE_KEY,
  saveSidebarScrollTop,
  getSavedSidebarScrollTop,
  restoreSidebarScroll,
  handleSidebarItemClick,
} from './Sidebar';

describe('Sidebar Nested Accordion Navigation Hierarchy', () => {
  it('defines Dashboard Operasional as the single top item and 6 nested accordion groups', () => {
    expect(topDashboardItem.label).toBe('Dashboard Operasional');
    expect(topDashboardItem.href).toBe('/admin');

    expect(navigationGroups.map((g) => g.groupName)).toEqual([
      'Toko Retail & POS',
      'Simpanan & Buku Besar',
      'Pinjaman & Pembiayaan',
      'Gaji & Kliring',
      'Laporan & Keuangan',
      'Master & Pengaturan',
    ]);
  });

  it('preserves all 9 retail routes in Toko Retail & POS', () => {
    const retailGroup = navigationGroups.find((g) => g.id === 'retail');
    expect(retailGroup).toBeDefined();

    expect(retailGroup!.items.map((i) => i.href)).toEqual([
      '/admin/kasir',
      '/admin/produk',
      '/admin/kategori',
      '/admin/pembelian',
      '/admin/retur-pembelian',
      '/admin/buku-besar-bon-toko',
      '/admin/pengaturan-kasir',
      '/admin/laporan-retail',
      '/admin/laporan-mutasi',
    ]);
  });

  it('preserves all Simpanan, Pinjaman, Gaji, Laporan, and Master routes', () => {
    const allHrefs = navigationGroups.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).toContain('/admin/setoran');
    expect(allHrefs).toContain('/admin/simpanan');
    expect(allHrefs).toContain('/admin/compliance-matrix');
    expect(allHrefs).toContain('/admin/rekening-koran-simpanan');
    expect(allHrefs).toContain('/admin/penarikan-simpanan');
    expect(allHrefs).toContain('/admin/laporan-penarikan');

    const simpananGroup = navigationGroups.find((g) => g.id === 'simpanan');
    const simpananLabels = simpananGroup!.items.map((i) => i.label);
    expect(simpananLabels).toContain('Pencairan Simpanan');
    expect(simpananLabels).toContain('Laporan Pencairan');
    expect(allHrefs).toContain('/admin/buku-besar-belanja');
    expect(allHrefs).toContain('/admin/pengajuan-pinjaman');
    expect(allHrefs).toContain('/admin/approval');
    expect(allHrefs).toContain('/admin/loan-matrix');
    expect(allHrefs).toContain('/admin/laporan-pinjaman-lunas');
    expect(allHrefs).toContain('/admin/import-gaji');
    expect(allHrefs).toContain('/admin/batch-update');
    expect(allHrefs).toContain('/admin/clearance');
    expect(allHrefs).toContain('/admin/laporan-keuangan');
    expect(allHrefs).toContain('/admin/master-simpan-pinjam');
    expect(allHrefs).toContain('/admin/anggota');
    expect(allHrefs).toContain('/admin/users');
    expect(allHrefs).toContain('/admin/pengaturan');
  });

  it('auto-detects the active parent group from pathname', () => {
    expect(findActiveGroupId('/admin/approval')).toBe('pinjaman');
    expect(findActiveGroupId('/admin/kasir')).toBe('retail');
    expect(findActiveGroupId('/admin/rekening-koran-simpanan')).toBe('simpanan');
    expect(findActiveGroupId('/admin/clearance')).toBe('gaji');
    expect(findActiveGroupId('/admin/laporan-keuangan')).toBe('laporan');
    expect(findActiveGroupId('/admin/anggota')).toBe('master');
    expect(findActiveGroupId('/admin')).toBeNull();
  });

  it('auto-expands the group matching the active route and renders its children', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin/loan-matrix']}>
        <Sidebar userRole="admin" />
      </MemoryRouter>
    );

    expect(html).toContain('Pinjaman &amp; Pembiayaan');
    expect(html).toContain('/admin/loan-matrix');
    expect(html).toContain('Matriks Pinjaman');
  });

  it('hides adminOnly items and empty adminOnly groups when user role is not admin', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin/kasir']}>
        <Sidebar userRole="staff" />
      </MemoryRouter>
    );

    // Pengaturan Kasir is adminOnly
    expect(html).not.toContain('/admin/pengaturan-kasir');
    // Kasir (POS) is visible
    expect(html).toContain('/admin/kasir');
    // Gaji & Kliring has only adminOnly items, so the entire group is hidden for staff
    expect(html).not.toContain('Gaji &amp; Kliring');
  });

  it('renders icon-only rail buttons when isCollapsed is true', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin']}>
        <Sidebar userRole="admin" isCollapsed={true} />
      </MemoryRouter>
    );

    expect(html).toContain('title="Dashboard Operasional"');
    expect(html).toContain('title="Toko Retail &amp; POS"');
    expect(html).toContain('title="Pinjaman &amp; Pembiayaan"');
    // Sub-item labels should not be inline in collapsed rail until hovered/clicked
    expect(html).not.toContain('aria-expanded');
  });
});

describe('Sidebar Scroll Persistence & Contextual Focus', () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
    const mockSessionStorage = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = String(value);
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };

    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = {};
    }
    (globalThis.window as any).sessionStorage = mockSessionStorage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the canonical key simkop_sidebar_scroll_top', () => {
    expect(SIDEBAR_SCROLL_STORAGE_KEY).toBe('simkop_sidebar_scroll_top');
  });

  it('saves scroll position to sessionStorage via saveSidebarScrollTop', () => {
    saveSidebarScrollTop(320);
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith('simkop_sidebar_scroll_top', '320');
    expect(getSavedSidebarScrollTop()).toBe(320);
  });

  it('captures scroll position and calls onItemClick when handleSidebarItemClick is invoked', () => {
    const mockContainer = {
      scrollTop: 450,
    } as unknown as HTMLElement;

    const mockEvent = {
      currentTarget: {
        closest: vi.fn((selector: string) => {
          if (selector === '.overflow-y-auto') return mockContainer;
          return null;
        }),
      },
    };

    const onItemClickMock = vi.fn();
    handleSidebarItemClick(mockEvent, onItemClickMock);

    expect(mockEvent.currentTarget.closest).toHaveBeenCalledWith('.overflow-y-auto');
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith('simkop_sidebar_scroll_top', '450');
    expect(onItemClickMock).toHaveBeenCalledTimes(1);
  });

  it('restores scroll position from sessionStorage when savedScrollTop is present', () => {
    window.sessionStorage.setItem('simkop_sidebar_scroll_top', '560');

    const mockContainer = { scrollTop: 0 } as unknown as HTMLElement;
    const mockActiveItem = {
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement;

    const restored = restoreSidebarScroll(mockContainer, mockActiveItem);

    expect(restored).toBe(true);
    expect(mockContainer.scrollTop).toBe(560);
    expect(mockActiveItem.scrollIntoView).not.toHaveBeenCalled();
  });

  it('falls back to scrollIntoView on active element when savedScrollTop is null', () => {
    const mockContainer = { scrollTop: 0 } as unknown as HTMLElement;
    const mockActiveItem = {
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement;

    const restored = restoreSidebarScroll(mockContainer, mockActiveItem);

    expect(restored).toBe(true);
    expect(mockContainer.scrollTop).toBe(0);
    expect(mockActiveItem.scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'instant',
    });
  });

  it('returns false safely when container is null', () => {
    const mockActiveItem = {
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement;

    const restored = restoreSidebarScroll(null, mockActiveItem);
    expect(restored).toBe(false);
  });
});

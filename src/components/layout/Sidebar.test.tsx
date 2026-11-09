import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Sidebar, {
  navigationGroups,
  SIDEBAR_SCROLL_STORAGE_KEY,
  saveSidebarScrollTop,
  getSavedSidebarScrollTop,
  restoreSidebarScroll,
  handleSidebarItemClick,
} from './Sidebar';

describe('Sidebar Navigation Hierarchy & Ordering', () => {
  it('places TOKO RETAIL & INVENTORI group directly above SIMPAN PINJAM (KSP / USP)', () => {
    const groupNames = navigationGroups.map((g) => g.groupName);
    
    expect(groupNames).toEqual([
      'OPERASIONAL',
      'TOKO RETAIL & INVENTORI',
      'SIMPAN PINJAM (KSP / USP)',
      'UTILITY & REKONSILIASI GAJI',
      'MANAJEMEN & AKSES',
      'LAPORAN & ANALITIK',
    ]);

    const operasionalIndex = groupNames.indexOf('OPERASIONAL');
    const retailIndex = groupNames.indexOf('TOKO RETAIL & INVENTORI');
    const kspIndex = groupNames.indexOf('SIMPAN PINJAM (KSP / USP)');

    expect(operasionalIndex).toBe(0);
    expect(retailIndex).toBe(1);
    expect(kspIndex).toBe(2);
    expect(retailIndex).toBeLessThan(kspIndex);
    expect(retailIndex).toBe(operasionalIndex + 1);
  });

  it('contains all required items in TOKO RETAIL & INVENTORI', () => {
    const retailGroup = navigationGroups.find((g) => g.groupName === 'TOKO RETAIL & INVENTORI');
    expect(retailGroup).toBeDefined();

    const items = retailGroup!.items;
    expect(items.map((i) => i.label)).toEqual([
      'Kasir (POS)',
      'Inventori Produk',
      'Kategori Produk',
      'Manajemen Pembelian',
      'Retur Pembelian',
      'Pengaturan Kasir',
      'Laporan Retail & Stok',
      'Laporan Mutasi Barang',
      'Buku Besar Bon Toko',
    ]);

    expect(items.map((i) => i.href)).toEqual([
      '/admin/kasir',
      '/admin/produk',
      '/admin/kategori',
      '/admin/pembelian',
      '/admin/retur-pembelian',
      '/admin/pengaturan-kasir',
      '/admin/laporan-retail',
      '/admin/laporan-mutasi',
      '/admin/buku-besar-bon-toko',
    ]);
  });

  it('contains all required items in SIMPAN PINJAM (KSP / USP)', () => {
    const kspGroup = navigationGroups.find((g) => g.groupName === 'SIMPAN PINJAM (KSP / USP)');
    expect(kspGroup).toBeDefined();

    const items = kspGroup!.items;
    expect(items.map((i) => i.label)).toEqual([
      'Master Produk Koperasi',
      'Pusat Terima Setoran',
      'Tagihan Simpanan',
      'Penarikan Simpanan',
      'Laporan Penarikan',
      'Pengajuan Pinjaman',
      'Approval Pinjaman',
      'Matriks Simpanan',
      'Matriks Pinjaman',
      'Buku Besar Belanja',
    ]);
  });

  it('renders correctly for admin user with both groups in proper DOM sequence', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin']}>
        <Sidebar userRole="admin" />
      </MemoryRouter>
    );

    const retailPos = html.indexOf('TOKO RETAIL &amp; INVENTORI');
    const kspPos = html.indexOf('SIMPAN PINJAM (KSP / USP)');

    expect(retailPos).toBeGreaterThan(-1);
    expect(kspPos).toBeGreaterThan(-1);
    expect(retailPos).toBeLessThan(kspPos);
  });

  it('hides adminOnly items when user role is not admin', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin']}>
        <Sidebar userRole="staff" />
      </MemoryRouter>
    );

    // Pengaturan Kasir is adminOnly
    expect(html).not.toContain('/admin/pengaturan-kasir');
    // Kasir (POS) is visible
    expect(html).toContain('/admin/kasir');
  });

  it('renders Laporan Mutasi Barang route for admin and staff users', () => {
    const adminHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin']}>
        <Sidebar userRole="admin" />
      </MemoryRouter>
    );
    expect(adminHtml).toContain('/admin/laporan-mutasi');
    expect(adminHtml).toContain('Laporan Mutasi Barang');

    const staffHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin']}>
        <Sidebar userRole="staff" />
      </MemoryRouter>
    );
    expect(staffHtml).toContain('/admin/laporan-mutasi');
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
    (globalThis as any).sessionStorage = mockSessionStorage;
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

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import Sidebar, { navigationGroups } from './Sidebar';

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
    ]);

    expect(items.map((i) => i.href)).toEqual([
      '/admin/kasir',
      '/admin/produk',
      '/admin/kategori',
      '/admin/pembelian',
      '/admin/retur-pembelian',
      '/admin/pengaturan-kasir',
      '/admin/laporan-retail',
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
      'Pengajuan Pinjaman',
      'Approval Pinjaman',
      'Matriks Simpanan',
      'Matriks Pinjaman',
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
});

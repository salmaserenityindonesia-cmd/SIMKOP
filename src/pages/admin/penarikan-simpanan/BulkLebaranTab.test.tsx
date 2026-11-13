import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BulkLebaranTab from './BulkLebaranTab';

// Mock Supabase
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-001' } }, error: null })
    }
  }
}));

describe('BulkLebaranTab Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders clean focused UI: banner, metrics, action buttons, and nominatif recipient table', () => {
    const html = renderToStaticMarkup(<BulkLebaranTab />);

    // Top Banner
    expect(html).toContain('Status Siklus Terakhir');
    expect(html).toContain('Segarkan');

    // Metric Cards
    expect(html).toContain('Total Anggota Penerima');
    expect(html).toContain('Total Dana Lebaran Siap Cair');
    expect(html).toContain('Rata-Rata Tabungan / Anggota');

    // Filters & Actions
    expect(html).toContain('Refresh Simulasi');
    expect(html).toContain('Ekspor Nominatif');
    expect(html).toContain('Eksekusi Pencairan Massal');

    // Table Headers
    expect(html).toContain('Daftar Nominatif Penerima Pencairan Simpanan Lebaran');

    // Verify Tab 2 is clean: historical date form & replay controls are moved out
    expect(html).not.toContain('Tambah Tanggal Pencairan Terlewat / Historis');
    expect(html).not.toContain('Kosongkan Ulang Sesuai Semua Tanggal');
    expect(html).not.toContain('Riwayat Tanggal Pencairan &amp; Simulasi Pengosongan Ulang');
  });
});

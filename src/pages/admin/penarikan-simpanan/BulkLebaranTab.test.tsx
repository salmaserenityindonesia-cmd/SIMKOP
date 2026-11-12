import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BulkLebaranTab from './BulkLebaranTab';
import * as bulkWithdrawalServiceModule from '../../../services/bulkWithdrawalService';

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

  it('renders summary metric cards, action buttons, and table headers correctly', () => {
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
    expect(html).toContain('Riwayat Siklus Pencairan Massal Simpanan Lebaran');

    // Historical Dates Form & Replay Controls
    expect(html).toContain('Riwayat Tanggal Pencairan');
    expect(html).toContain('Simulasi Pengosongan Ulang');
    expect(html).toContain('Kosongkan Ulang Sesuai Semua Tanggal');
    expect(html).toContain('Tambah Tanggal Pencairan Terlewat / Historis');
    expect(html).toContain('+ Tambah Tanggal');
  });
});

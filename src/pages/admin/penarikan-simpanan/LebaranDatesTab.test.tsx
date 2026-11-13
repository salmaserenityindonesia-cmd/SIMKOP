import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LebaranDatesTab from './LebaranDatesTab';

// Mock Supabase
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-001' } }, error: null })
    }
  }
}));

describe('LebaranDatesTab Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header with replay button, 1-by-1 date input form without bulk textarea, and table headers', () => {
    const html = renderToStaticMarkup(<LebaranDatesTab />);

    // Header & Replay button
    expect(html).toContain('Daftar Tanggal Pencairan Simpanan Lebaran');
    expect(html).toContain('Kosongkan Ulang Sesuai Semua Tanggal');

    // 1-by-1 Form
    expect(html).toContain('Tambah Tanggal Pencairan (1 per 1)');
    expect(html).toContain('Tanggal Pencairan');
    expect(html).toContain('Keterangan / Nama Siklus (Opsional)');
    expect(html).toContain('+ Tambah Tanggal');

    // Confirm bulk textarea is NOT present
    expect(html).not.toContain('Input Banyak Sekaligus (Bulk)');
    expect(html).not.toContain('Tempel Daftar Tanggal');

    // History Table
    expect(html).toContain('Riwayat Seluruh Tanggal Pencairan Lebaran');
    expect(html).toContain('Refresh Riwayat');
  });
});


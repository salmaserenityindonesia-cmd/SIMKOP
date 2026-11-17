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

  it('renders automatic cycle history table without manual date input form or replay button', () => {
    const html = renderToStaticMarkup(<LebaranDatesTab />);

    // Confirm manual date form and replay button are NOT present
    expect(html).not.toContain('Daftar Tanggal Pencairan Simpanan Lebaran');
    expect(html).not.toContain('Kosongkan Ulang Sesuai Semua Tanggal');
    expect(html).not.toContain('Tambah Tanggal Pencairan (1 per 1)');
    expect(html).not.toContain('+ Tambah Tanggal');
    expect(html).not.toContain('Input Banyak Sekaligus (Bulk)');
    expect(html).not.toContain('Tempel Daftar Tanggal');

    // History Table
    expect(html).toContain('Riwayat Seluruh Tanggal Pencairan Lebaran');
    expect(html).toContain('Tanggal pencairan tercatat secara otomatis');
    expect(html).toContain('Refresh Riwayat');
  });
});


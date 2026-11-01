import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import ManajemenAnggota from './ManajemenAnggota';

// Mock dependencies
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout">{children}</div>
}));

vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    showAlert: vi.fn()
  })
}));

vi.mock('../../services/koperasiService', () => ({
  getAnggota: vi.fn().mockResolvedValue([
    {
      id: 'member-1',
      nrp: '12345678',
      nama: 'Budi Santoso',
      pangkat: 'Bripka',
      status: 'aktif',
      master_thp: 5000000,
      bank_account_number: '1234567890'
    }
  ]),
  addAnggota: vi.fn(),
  updateAnggota: vi.fn()
}));

vi.mock('../../lib/exportUtils', () => ({
  exportToExcel: vi.fn(),
  exportToPDF: vi.fn()
}));

vi.mock('../../services/memberExcelService', () => ({
  exportMemberTemplate: vi.fn(),
  parseMemberUpload: vi.fn(),
  executeMigration: vi.fn()
}));

describe('ManajemenAnggota Page - Action Buttons Verification', () => {
  it('renders page layout, table headers, and action column without Delete button', () => {
    const html = renderToStaticMarkup(<ManajemenAnggota />);

    // Basic structure
    expect(html).toContain('Manajemen Anggota');
    expect(html).toContain('Kelola data induk anggota koperasi');
    expect(html).toContain('NRP');
    expect(html).toContain('Nama');
    expect(html).toContain('Pangkat');
    expect(html).toContain('Nomor Rekening');
    expect(html).toContain('Status');
    expect(html).toContain('Terdaftar');
    expect(html).toContain('Aksi');

    // Verification: Hapus button is completely removed
    expect(html).not.toContain('title="Hapus"');
    expect(html).not.toContain('title="Hapus Anggota"');
    expect(html).not.toContain('handleDelete');
    expect(html).not.toContain('lucide-trash');
  });

  it('contains Import, Template, and Tambah Anggota actions', () => {
    const html = renderToStaticMarkup(<ManajemenAnggota />);

    // Verification: Actions supported
    expect(html).toContain('Template');
    expect(html).toContain('Import');
    expect(html).toContain('Tambah Anggota');
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalaryImport from './SalaryImport';

// Mock layout
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock FeedbackContext
vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
}));

// Mock salaryTemplateService
vi.mock('../../services/salaryTemplateService', () => ({
  downloadSalaryTemplate: vi.fn().mockResolvedValue(true),
}));

const { mockMemberList } = vi.hoisted(() => ({
  mockMemberList: [
    {
      id: 'm-1',
      nrp: '12345',
      nama: 'Budi Santoso',
      pangkat: 'Sertu',
      bank_account_number: '987654321',
      take_home_pay: 5500000,
      master_thp: 5500000,
    },
    {
      id: 'm-2',
      nrp: '67890',
      nama: 'Ahmad Yani',
      pangkat: 'Kopda',
      bank_account_number: null,
      take_home_pay: 4200000,
      master_thp: 4200000,
    },
  ],
}));

vi.mock('../../services/salaryImportService', () => ({
  parseSalaryReconciliationFile: vi.fn().mockResolvedValue([]),
  confirmSalaryReconciliation: vi.fn().mockResolvedValue(true),
  fetchMembersSalaryAndAccounts: vi.fn().mockResolvedValue(mockMemberList),
}));

describe('SalaryImport Page Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, upload form, and master table container correctly', () => {
    const html = renderToStaticMarkup(<SalaryImport initialMembers={mockMemberList} />);

    expect(html).toContain('Import Gaji &amp; Rekening');
    expect(html).toContain('Unduh Template');
    expect(html).toContain('Unggah File Rekonsiliasi');
    expect(html).toContain('Daftar Data Gaji &amp; Rekening Anggota');
    expect(html).toContain('No. Rekening Bank');
    expect(html).toContain('Status Rekening');
    expect(html).toContain('Budi Santoso');
    expect(html).toContain('987654321');
    expect(html).toContain('Lengkap');
    expect(html).toContain('Ahmad Yani');
    expect(html).toContain('Belum Ada Rekening');
  });

  it('renders search autocomplete input field and pagination dropdown options', () => {
    const html = renderToStaticMarkup(<SalaryImport initialMembers={mockMemberList} />);

    expect(html).toContain('Cari nama atau NRP anggota...');
    expect(html).toContain('10 / halaman');
    expect(html).toContain('25 / halaman');
    expect(html).toContain('50 / halaman');
    expect(html).toContain('100 / halaman');
    expect(html).toContain('Menampilkan 1-2 dari 2 data');
  });

  it('renders empty state when there are no members', () => {
    const html = renderToStaticMarkup(<SalaryImport initialMembers={[]} />);

    expect(html).toContain('Tidak ada data anggota yang ditemukan.');
  });
});

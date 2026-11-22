import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SalaryImport, { ImportGajiRekening } from './SalaryImport';
import ImportGajiRekeningPage from './ImportGajiRekening';

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
      tanggal_lahir: '1985-05-20',
      bank_account_number: '987654321',
      take_home_pay: 5500000,
      master_thp: 5500000,
    },
    {
      id: 'm-2',
      nrp: '67890',
      nama: 'Ahmad Yani',
      tanggal_lahir: '1988-11-10',
      bank_account_number: null,
      take_home_pay: 4200000,
      master_thp: 4200000,
    },
  ],
}));

vi.mock('../../services/salaryImportService', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    parseSalaryReconciliationFile: vi.fn().mockResolvedValue([]),
    confirmSalaryReconciliation: vi.fn().mockResolvedValue(true),
    applySalaryReconciliation: vi.fn().mockResolvedValue(true),
    fetchMembersSalaryAndAccounts: vi.fn().mockResolvedValue(mockMemberList),
    fetchMemberSalaryData: vi.fn().mockResolvedValue(mockMemberList),
  };
});

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
    expect(html).toContain('NRP, Nama Lengkap, Nomor Rekening, Gaji Pokok, Angsuran Lain-lain');
    expect(html).toContain('No. Rekening Bank');
    expect(html).toContain('Gaji Pokok (Rp)');
    expect(html).toContain('Angsuran Lain-lain (Rp)');
    expect(html).toContain('Status Rekening');
    expect(html).not.toContain('Take Home Pay (THP)');
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

  it('renders fallback formatting for members without tanggal_lahir and with only master_thp', () => {
    const customMembers = [
      {
        id: 'm-3',
        nrp: '112233',
        nama: 'Siti Rahma',
        tanggal_lahir: null,
        bank_account_number: '   ',
        take_home_pay: null,
        master_thp: 3800000,
      },
      {
        id: 'm-4',
        nrp: '445566',
        nama: 'Dewi Lestari',
        tanggal_lahir: '',
        bank_account_number: undefined,
        take_home_pay: null,
        master_thp: null,
      },
    ];

    const html = renderToStaticMarkup(<SalaryImport initialMembers={customMembers} />);

    expect(html).toContain('Siti Rahma');
    expect(html).toContain('Rp 3.800.000');
    expect(html).toContain('Belum Ada Rekening');
    expect(html).toContain('Dewi Lestari');
    expect(html).toContain('Menampilkan 1-2 dari 2 data');
  });

  it('renders correctly using ImportGajiRekening alias and ImportGajiRekeningPage re-export', () => {
    const html1 = renderToStaticMarkup(<ImportGajiRekening initialMembers={mockMemberList} />);
    const html2 = renderToStaticMarkup(<ImportGajiRekeningPage initialMembers={mockMemberList} />);

    expect(html1).toContain('Import Gaji &amp; Rekening');
    expect(html2).toContain('Import Gaji &amp; Rekening');
  });

  it('renders salary fallback priority: take_home_pay > master_thp > salary', () => {
    const fallbackMembers = [
      {
        id: 'm-only-salary',
        nrp: '778899',
        nama: 'Agus Pramono',
        tanggal_lahir: '1988-11-10',
        bank_account_number: '112233',
        take_home_pay: null,
        master_thp: null,
        salary: 5000000,
      },
    ];

    const html = renderToStaticMarkup(<SalaryImport initialMembers={fallbackMembers} />);
    expect(html).toContain('Agus Pramono');
    expect(html).toContain('Rp 5.000.000');
  });

  it('renders Gaji Pokok and Angsuran Lain-lain values in master table', () => {
    const membersWithExternalInstallments = [
      {
        id: 'm-agus',
        nrp: '95168420',
        nama: 'Agus Susanto',
        tanggal_lahir: '1984-03-22',
        bank_account_number: '1122334455',
        take_home_pay: 6000000,
        master_thp: 6000000,
        angsuran_lain_lain: 1000000,
      },
    ];

    const html = renderToStaticMarkup(<SalaryImport initialMembers={membersWithExternalInstallments} />);
    expect(html).toContain('Agus Susanto');
    expect(html).toContain('Rp 6.000.000');
    expect(html).toContain('Rp 1.000.000');
  });

  it('displays Rp 4.000.000 when master_thp is 4000000 even if take_home_pay is 0 (anggota tes 1 / 99999999)', () => {
    const members = [
      {
        id: 'm-tes-1',
        nrp: '99999999',
        nama: 'anggota tes 1',
        tanggal_lahir: null,
        bank_account_number: '11223344',
        master_thp: 4000000,
        take_home_pay: 0,
      },
    ];

    const html = renderToStaticMarkup(<SalaryImport initialMembers={members} />);
    expect(html).toContain('anggota tes 1');
    expect(html).toContain('99999999');
    expect(html).toContain('Rp 4.000.000');
  });

  it('displays Rp 4.500.000 when master_thp is 0 and take_home_pay is 4500000', () => {
    const members = [
      {
        id: 'm-thp-fallback',
        nrp: '88888888',
        nama: 'Anggota Fallback THP',
        tanggal_lahir: null,
        bank_account_number: null,
        master_thp: 0,
        take_home_pay: 4500000,
      },
    ];

    const html = renderToStaticMarkup(<SalaryImport initialMembers={members} />);
    expect(html).toContain('Anggota Fallback THP');
    expect(html).toContain('Rp 4.500.000');
  });
});

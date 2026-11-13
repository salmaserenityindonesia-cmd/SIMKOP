import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ManajemenAnggota, {
  triggerMemberExportExcel,
  triggerMemberExportPdf,
  triggerResetAllMembers,
} from './ManajemenAnggota';
import {
  getMembersComprehensiveReport,
  resetAllMembersData,
} from '../../services/memberService';
import { exportMembersToExcel, exportMembersToPdf } from '../../services/memberExporter';
import { getKoperasiProfile } from '../../services/settingsService';

// Mock layout & feedback
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

const mockShowToast = vi.fn();
vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: mockShowToast,
    showConfirm: vi.fn(),
    showAlert: vi.fn(),
  }),
}));

vi.mock('../../services/koperasiService', () => {
  const dummyMembers = [
    {
      id: 'member-1',
      nrp: '12345678',
      nama: 'Budi Santoso',
      pangkat: 'Bripka',
      status: 'aktif',
      master_thp: 5000000,
      bank_account_number: '1234567890',
    },
  ];
  return {
    getAnggota: vi.fn().mockResolvedValue(dummyMembers),
    fetchAllAnggotaPaged: vi.fn().mockResolvedValue(dummyMembers),
    fetchAnggota: vi.fn().mockResolvedValue(dummyMembers),
    addAnggota: vi.fn(),
    updateAnggota: vi.fn(),
  };
});

vi.mock('../../services/memberExcelService', () => ({
  exportMemberTemplate: vi.fn(),
  parseMemberUpload: vi.fn(),
  executeMigration: vi.fn(),
}));

vi.mock('../../services/memberService', () => ({
  createMember: vi.fn().mockResolvedValue({
    id: 'member-created-1',
    nrp: '12345678',
    nama: 'Budi Santoso',
    pangkat: 'Bripka',
    status: 'aktif',
    master_thp: 5000000,
    bank_account_number: '1234567890',
  }),
  getMembersComprehensiveReport: vi.fn().mockResolvedValue([
    {
      nrp: '12345678',
      nama: 'Budi Santoso',
      pangkat: 'Bripka',
      bank_account_number: '1234567890',
      membership_status: 'ACTIVE',
      tgl_awal_anggota: '2023-01-01',
      jumlah_simpanan_pokok: 100000,
      jumlah_simpanan_wajib: 200000,
      jumlah_simpanan_belanja: 50000,
      jumlah_simpanan_lebaran: 75000,
      jumlah_pinjaman: 5000000,
      tgl_awal_pinjaman: '2024-01-01',
      tenor: 10,
      sisa_pinjaman: 2500000,
    },
  ]),
  resetAllMembersData: vi.fn().mockResolvedValue({
    success: true,
    members_deleted: 1,
    loans_deleted: 0,
    deposits_deleted: 1,
    message: 'Seluruh data anggota, simpanan, dan pinjaman berhasil dikosongkan.',
  }),
  syncInitialSavingsBalances: vi.fn().mockResolvedValue({
    updatedCount: 1,
    skippedNrps: [],
    effectiveDate: '2026-01-01',
  }),
}));

vi.mock('../../services/loanService', () => ({
  getActiveLoanTypes: vi.fn().mockResolvedValue([
    { id: 'lt-1', code: 'REG', name: 'Pinjaman Reguler', max_duration_months: 12, is_active: true },
  ]),
  syncInitialLoanBalances: vi.fn().mockResolvedValue({
    insertedCount: 1,
    skippedCount: 0,
    skippedNrps: [],
    effectiveDate: '2026-03-01',
  }),
}));

vi.mock('../../services/memberExporter', () => ({
  exportMembersToExcel: vi.fn().mockResolvedValue({}),
  exportMembersToPdf: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../services/settingsService', () => ({
  getKoperasiProfile: vi.fn().mockResolvedValue({
    nama_koperasi: 'PRIMKOPPOL POLRES NGAWI',
    alamat: 'Jl. Jaksa Agung Suprapto No. 10',
    telepon: '08123456789',
  }),
}));

describe('ManajemenAnggota Page - Component & Comprehensive Export Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Static UI Structure & Toolbar Buttons', () => {
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

    it('contains Import Data Anggota, Tambah Anggota, Excel, and PDF toolbar buttons without standalone Template button', () => {
      const html = renderToStaticMarkup(<ManajemenAnggota />);

      // Verification: Toolbar buttons present and standalone Template button removed
      expect(html).not.toContain('Template</button>');
      expect(html).toContain('Import Data Anggota');
      expect(html).toContain('whitespace-nowrap');
      expect(html).toContain('Saldo Awal Simpanan');
      expect(html).toContain('Saldo Awal Pinjaman');
      expect(html).toContain('border-amber-300');
      expect(html).toContain('bg-amber-50');
      expect(html).toContain('text-amber-800');
      expect(html).toContain('Tambah Anggota');
      expect(html).toContain('Excel');
      expect(html).toContain('PDF');

      // Check button styling and icons
      expect(html).toContain('bg-green-600');
      expect(html).toContain('bg-red-600');
      expect(html).toContain('lucide-download');
    });

    it('contains Reset Data toolbar button with rose styling and rotate-ccw icon', () => {
      const html = renderToStaticMarkup(<ManajemenAnggota />);

      expect(html).toContain('Reset Data');
      expect(html).toContain('lucide-rotate-ccw');
      expect(html).toContain('bg-rose-50');
      expect(html).toContain('border-rose-300');
      expect(html).toContain('text-rose-700');
      expect(html).toContain('title="Kosongkan seluruh data anggota, simpanan, dan pinjaman"');
    });
  });

  describe('Add Member Modal Form Fields', () => {
    it('renders Add Member modal with bank_account_number and tgl_awal_anggota fields', () => {
      const html = renderToStaticMarkup(<ManajemenAnggota initialShowModal={true} />);

      // Modal title
      expect(html).toContain('Tambah Anggota Baru');

      // Bank Account Number input & label
      expect(html).toContain('Nomor Rekening Bank (Opsional)');
      expect(html).toContain('placeholder="Contoh: 115738953714"');

      // Join Date input & label
      expect(html).toContain('Tanggal Bergabung');
      expect(html).toContain('type="date"');

      // Existing required fields remain intact
      expect(html).toContain('NRP');
      expect(html).toContain('Nama Lengkap');
      expect(html).toContain('Pangkat');
      expect(html).toContain('Gaji Pokok (Master THP)');

      // Simpanan Pokok info banner
      expect(html).toContain('Inisialisasi Simpanan Anggota');
      expect(html).toContain('Simpanan Pokok');
    });

    it('renders Add Member modal with active Pokok rate when initialActivePokokRate is supplied', () => {
      const html = renderToStaticMarkup(
        <ManajemenAnggota initialShowModal={true} initialActivePokokRate={150000} />
      );

      expect(html).toContain('Inisialisasi Simpanan Anggota');
      expect(html).toContain('150.000');
    });
  });

  describe('Excel Export Flow (14 Kolom Komprehensif)', () => {
    it('triggers Excel export: fetches comprehensive report and calls exportMembersToExcel with success toast', async () => {
      const showToast = vi.fn();
      const setIsExporting = vi.fn();
      const targetMemberIds = ['member-1', 'member-2'];

      await triggerMemberExportExcel(targetMemberIds, showToast, setIsExporting);

      // Verify loading state cycle
      expect(setIsExporting).toHaveBeenCalledWith(true);
      expect(setIsExporting).toHaveBeenLastCalledWith(false);

      // Verify data fetcher called with selected member IDs
      expect(getMembersComprehensiveReport).toHaveBeenCalledTimes(1);
      expect(getMembersComprehensiveReport).toHaveBeenCalledWith(targetMemberIds);

      // Verify exporter called with returned data
      expect(exportMembersToExcel).toHaveBeenCalledTimes(1);
      expect(exportMembersToExcel).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            nrp: '12345678',
            nama: 'Budi Santoso',
            jumlah_simpanan_pokok: 100000,
          }),
        ])
      );

      // Verify success toast
      expect(showToast).toHaveBeenCalledWith(
        'Laporan Excel 14 kolom berhasil diunduh.',
        'success'
      );
    });

    it('handles Excel export failure: shows error toast and resets exporting state', async () => {
      const showToast = vi.fn();
      const setIsExporting = vi.fn();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (getMembersComprehensiveReport as any).mockRejectedValueOnce(
        new Error('Network timeout during query')
      );

      await triggerMemberExportExcel(['m-1'], showToast, setIsExporting);

      expect(setIsExporting).toHaveBeenCalledWith(true);
      expect(setIsExporting).toHaveBeenLastCalledWith(false);
      expect(showToast).toHaveBeenCalledWith(
        'Network timeout during query',
        'error'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('PDF Export Flow (Landscape 14 Kolom Komprehensif)', () => {
    it('triggers PDF export: fetches report & profile, calls exportMembersToPdf with success toast', async () => {
      const showToast = vi.fn();
      const setIsExporting = vi.fn();
      const targetMemberIds = ['member-1'];

      await triggerMemberExportPdf(targetMemberIds, showToast, setIsExporting);

      // Verify loading state cycle
      expect(setIsExporting).toHaveBeenCalledWith(true);
      expect(setIsExporting).toHaveBeenLastCalledWith(false);

      // Verify data and profile fetchers called
      expect(getMembersComprehensiveReport).toHaveBeenCalledTimes(1);
      expect(getMembersComprehensiveReport).toHaveBeenCalledWith(targetMemberIds);
      expect(getKoperasiProfile).toHaveBeenCalledTimes(1);

      // Verify PDF exporter called with comprehensive rows and profile
      expect(exportMembersToPdf).toHaveBeenCalledTimes(1);
      expect(exportMembersToPdf).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            nrp: '12345678',
            nama: 'Budi Santoso',
          }),
        ]),
        expect.objectContaining({
          nama_koperasi: 'PRIMKOPPOL POLRES NGAWI',
        })
      );

      // Verify success toast
      expect(showToast).toHaveBeenCalledWith(
        'Laporan PDF Landscape 14 kolom berhasil diunduh.',
        'success'
      );
    });

    it('handles PDF export failure: shows error toast and resets exporting state', async () => {
      const showToast = vi.fn();
      const setIsExporting = vi.fn();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (exportMembersToPdf as any).mockRejectedValueOnce(
        new Error('jsPDF rendering crashed')
      );

      await triggerMemberExportPdf(['m-1'], showToast, setIsExporting);

      expect(setIsExporting).toHaveBeenCalledWith(true);
      expect(setIsExporting).toHaveBeenLastCalledWith(false);
      expect(showToast).toHaveBeenCalledWith(
        'jsPDF rendering crashed',
        'error'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Reset Data Modal UI Structure', () => {
    it('renders DangerConfirmModal when initialResetModalOpen is true', () => {
      const html = renderToStaticMarkup(<ManajemenAnggota initialResetModalOpen={true} />);

      expect(html).toContain('Reset Seluruh Data Anggota');
      expect(html).toContain(
        'PERINGATAN: Tindakan ini akan mengosongkan seluruh master data anggota, rekening simpanan, pinjaman, dan riwayat mutasi terkait secara permanen.'
      );
      expect(html).toContain('sales.member_id = NULL');
      expect(html).toContain('HAPUS SEMUA DATA ANGGOTA');
      expect(html).toContain('Ya, Kosongkan Sekarang');
      expect(html).toContain('Batal');
    });
  });

  describe('Reset All Members Flow (triggerResetAllMembers)', () => {
    it('triggers reset: calls resetAllMembersData, shows success toast, and executes onSuccess callback', async () => {
      const showToast = vi.fn();
      const setIsResetting = vi.fn();
      const onSuccess = vi.fn();

      const result = await triggerResetAllMembers(showToast, setIsResetting, onSuccess);

      expect(setIsResetting).toHaveBeenCalledWith(true);
      expect(setIsResetting).toHaveBeenLastCalledWith(false);
      expect(resetAllMembersData).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(
        'Seluruh data anggota, simpanan, dan pinjaman berhasil dikosongkan.',
        'success'
      );
      expect(result.success).toBe(true);
    });

    it('handles reset failure: shows error toast, resets loading state, and throws error', async () => {
      const showToast = vi.fn();
      const setIsResetting = vi.fn();
      const onSuccess = vi.fn();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (resetAllMembersData as any).mockRejectedValueOnce(
        new Error('Database RPC timeout error')
      );

      await expect(
        triggerResetAllMembers(showToast, setIsResetting, onSuccess)
      ).rejects.toThrow('Database RPC timeout error');

      expect(setIsResetting).toHaveBeenCalledWith(true);
      expect(setIsResetting).toHaveBeenLastCalledWith(false);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        'Database RPC timeout error',
        'error'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Import Data Induk Anggota Modal UI Structure', () => {
    it('renders Import Data Induk Anggota modal with Indigo palette, 6-column description, template button, and disabled submit button', () => {
      const html = renderToStaticMarkup(<ManajemenAnggota initialMemberImportModalOpen={true} />);

      expect(html).toContain('Import Data Induk Anggota');
      expect(html).toContain('Unduh Template Data Anggota (.xlsx)');
      expect(html).toContain('nrp');
      expect(html).toContain('bank_account_number');
      expect(html).toContain('membership_status');
      expect(html).toContain('tgl_awal_anggota');
      expect(html).toContain('Saldo Awal: Rp 0 (Default Anggota Baru)');
      expect(html).toContain('Simpan &amp; Impor Data Anggota');
      expect(html).toContain('bg-indigo-600');
      expect(html).toContain('disabled=""');
    });
  });

  describe('Upload Saldo Awal Simpanan Modal UI Structure', () => {
    it('renders Upload Saldo Awal Simpanan modal with template button, effective date input, verification checkbox, and disabled submit button', () => {
      const html = renderToStaticMarkup(<ManajemenAnggota initialSavingsModalOpen={true} />);

      expect(html).toContain('Upload Saldo Awal Simpanan');
      expect(html).toContain('Unduh Template Saldo Awal (.xlsx)');
      expect(html).toContain('Tanggal Saldo Awal Dinyatakan Aktif');
      expect(html).toContain('type="date"');
      expect(html).toContain('Pernyataan Verifikasi Saldo Awal:');
      expect(html).toContain('type="checkbox"');
      expect(html).toContain('Simpan &amp; Aktifkan Saldo Awal');
      expect(html).toContain('disabled=""');
    });
  });

  describe('Upload Saldo Awal Pinjaman Modal UI Structure', () => {
    it('renders Upload Saldo Awal Pinjaman modal with Amber palette, template button, cut-off date input, confirmation checkbox, and disabled submit button', () => {
      const html = renderToStaticMarkup(<ManajemenAnggota initialLoansModalOpen={true} />);

      expect(html).toContain('Upload Saldo Awal Pinjaman');
      expect(html).toContain('Unduh Template Saldo Awal Pinjaman (.xlsx)');
      expect(html).toContain('Tanggal Saldo Awal Pinjaman Dinyatakan Aktif');
      expect(html).toContain('type="date"');
      expect(html).toContain('Pernyataan Konfirmasi Saldo Awal Pinjaman:');
      expect(html).toContain('type="checkbox"');
      expect(html).toContain('Simpan &amp; Aktifkan Saldo Awal Pinjaman');
      expect(html).toContain('bg-amber-600');
      expect(html).toContain('disabled=""');
    });
  });
});

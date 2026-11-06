import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BukuBesarBelanja from './BukuBesarBelanja';

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
    showConfirm: vi.fn(),
    showAlert: vi.fn()
  }),
}));

// Mock Supabase
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: 'm-1', nama: 'Sertu Budi', nrp: '12345' },
            { id: 'm-2', nama: 'Kopda Joko', nrp: '67890' }
          ],
          error: null
        })
      })
    })
  }
}));

// Mock shoppingSavingsLedgerService
vi.mock('../../services/shoppingSavingsLedgerService', () => ({
  getShoppingSavingsSummary: vi.fn().mockResolvedValue({
    totalDeposit: 5000000,
    totalWithdrawal: 1250000,
    currentBalance: 3750000,
    activeMemberCount: 15,
    totalTransactions: 30
  }),
  getMemberShoppingLedger: vi.fn().mockResolvedValue({
    items: [],
    openingBalance: 0,
    totalItems: 0
  }),
  getSaleDetailByInvoice: vi.fn().mockResolvedValue(null),
  exportShoppingLedgerToExcel: vi.fn().mockResolvedValue(undefined)
}));

describe('BukuBesarBelanja Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page layout, header, and action buttons', () => {
    const html = renderToStaticMarkup(<BukuBesarBelanja />);

    expect(html).toContain('Buku Besar Simpanan Belanja');
    expect(html).toContain('Buku pembantu mutasi saldo simpanan belanja');
    expect(html).toContain('Ekspor Excel (.xlsx)');
    expect(html).toContain('Cetak Rekening Koran');
    expect(html).toContain('Segarkan');
  });

  it('renders 4 Top KPI Cards correctly', () => {
    const html = renderToStaticMarkup(<BukuBesarBelanja />);

    expect(html).toContain('Total Setoran Masuk');
    expect(html).toContain('Total Belanja Kasir POS');
    expect(html).toContain('Sisa Saldo Mengendap');
    expect(html).toContain('Anggota Pemilik Rekening');
  });

  it('renders filter bar with Member dropdown, Mutation type, and Date inputs', () => {
    const html = renderToStaticMarkup(<BukuBesarBelanja />);

    expect(html).toContain('Pilih Anggota');
    expect(html).toContain('Semua Anggota');
    expect(html).toContain('Jenis Mutasi');
    expect(html).toContain('Semua Mutasi (Masuk &amp; Keluar)');
    expect(html).toContain('Hanya Belanja Kasir POS (-)');
    expect(html).toContain('Tanggal Mulai');
    expect(html).toContain('Tanggal Selesai');
    expect(html).toContain('Hari Ini');
    expect(html).toContain('Bulan Ini');
    expect(html).toContain('Semua Riwayat');
    expect(html).toContain('Cari nama, NRP, no. struk...');

    // Verifikasi default filter jenis mutasi adalah withdrawal (Hanya Belanja Kasir POS)
    expect(html).toContain('value="withdrawal" selected=""');
  });

  it('renders table columns for accounting subsidiary ledger format', () => {
    const html = renderToStaticMarkup(<BukuBesarBelanja />);

    expect(html).toContain('Tanggal &amp; Jam');
    expect(html).toContain('Anggota');
    expect(html).toContain('Jenis Mutasi');
    expect(html).toContain('No. Bukti / Struk');
    expect(html).toContain('Kasir / Petugas');
    expect(html).toContain('Masuk (+)');
    expect(html).toContain('Keluar (-)');
    expect(html).toContain('Saldo Berjalan');
  });

  it('renders initial empty state or loading correctly', () => {
    const html = renderToStaticMarkup(<BukuBesarBelanja />);

    // In static initial render (before useEffect completes), loading spinner is rendered
    expect(html).toContain('Memuat mutasi buku besar belanja...');
  });
});


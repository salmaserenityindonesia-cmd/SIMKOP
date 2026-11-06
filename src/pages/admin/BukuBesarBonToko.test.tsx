import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BukuBesarBonToko from './BukuBesarBonToko';

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
    showAlert: vi.fn(),
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
            { id: 'm-2', nama: 'Kopda Joko', nrp: '67890' },
          ],
          error: null,
        }),
      }),
    }),
  },
}));

// Mock storeCreditLedgerService
vi.mock('../../services/storeCreditLedgerService', () => ({
  getStoreCreditSummary: vi.fn().mockResolvedValue({
    totalCreditSales: 2500000,
    totalPaid: 1000000,
    outstandingDebt: 1500000,
    activeDebtorCount: 3,
    totalTransactions: 12,
  }),
  getStoreCreditLedger: vi.fn().mockResolvedValue([]),
  exportStoreCreditToExcel: vi.fn().mockResolvedValue(undefined),
  getMemberActiveDebt: vi.fn().mockResolvedValue(500000),
  getMembersWithDebt: vi.fn().mockResolvedValue([]),
  settleStoreCredit: vi.fn().mockResolvedValue({ id: 'scp-1' }),
}));

// Mock shoppingSavingsLedgerService
vi.mock('../../services/shoppingSavingsLedgerService', () => ({
  getSaleDetailByInvoice: vi.fn().mockResolvedValue(null),
}));

describe('BukuBesarBonToko Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page layout, header title, and action buttons', () => {
    const html = renderToStaticMarkup(<BukuBesarBonToko />);

    expect(html).toContain('Buku Besar Bon Toko');
    expect(html).toContain('Ekspor Excel (.xlsx)');
    expect(html).toContain('Cetak Rekening Bon');
    expect(html).toContain('Segarkan');
    expect(html).toContain('Catat Pelunasan Bon');
  });

  it('renders 4 Top KPI Cards correctly', () => {
    const html = renderToStaticMarkup(<BukuBesarBonToko />);

    expect(html).toContain('Sisa Piutang Bon Belum Lunas');
    expect(html).toContain('Realisasi Pelunasan Masuk');
    expect(html).toContain('Total Belanja Bon Kumulatif');
    expect(html).toContain('Anggota Berutang Aktif');
  });

  it('renders filter bar with Member selector, Status filter, and Date inputs', () => {
    const html = renderToStaticMarkup(<BukuBesarBonToko />);

    expect(html).toContain('Pilih Anggota');
    expect(html).toContain('Semua Anggota');
    expect(html).toContain('Status Tagihan');
    expect(html).toContain('Semua Status Tagihan');
    expect(html).toContain('Belum Lunas / Tertunggak');
    expect(html).toContain('Hanya Tagihan Lunas');
    expect(html).toContain('Tanggal Mulai');
    expect(html).toContain('Tanggal Selesai');
    expect(html).toContain('Hari Ini');
    expect(html).toContain('Bulan Ini');
    expect(html).toContain('Semua Riwayat');
    expect(html).toContain('Cari nama, NRP, no. struk, bukti bayar...');
  });

  it('renders table columns for store credit ledger format', () => {
    const html = renderToStaticMarkup(<BukuBesarBonToko />);

    expect(html).toContain('No');
    expect(html).toContain('Tanggal &amp; Jam');
    expect(html).toContain('Anggota');
    expect(html).toContain('Jenis Mutasi');
    expect(html).toContain('No. Bukti / Struk');
    expect(html).toContain('Kasir / Petugas');
    expect(html).toContain('Tambah Utang (+)');
    expect(html).toContain('Pelunasan (-)');
    expect(html).toContain('Sisa Utang Anggota');
    expect(html).toContain('Status');
    expect(html).toContain('Aksi');
  });

  it('renders loading state on initial render', () => {
    const html = renderToStaticMarkup(<BukuBesarBonToko />);

    expect(html).toContain('Memuat mutasi buku besar bon toko...');
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PengajuanPinjaman, { SimulationPanel, formatCurrency } from './PengajuanPinjaman';
import { MIN_REMAINING_THP } from '../../services/loanService';

// Mock AdminLayout
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock supabaseClient
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: 'm-1', nrp: '11111', nama: 'Sertu Bambang' },
          { id: 'm-2', nrp: '22222', nama: 'Kopda Suryo' }
        ],
        error: null
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null })
    }))
  }
}));

describe('PengajuanPinjaman Page & SimulationPanel Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatCurrency helper', () => {
    it('formats positive, zero, and negative values to IDR currency format', () => {
      const formattedPositive = formatCurrency(1500000);
      expect(formattedPositive).toContain('1.500.000');

      const formattedZero = formatCurrency(0);
      expect(formattedZero).toContain('0');

      const formattedNegative = formatCurrency(-500000);
      expect(formattedNegative).toContain('500.000');
    });
  });

  describe('Full Page Initial Rendering', () => {
    it('renders page layout, title, form inputs, and prompt to select member', () => {
      const html = renderToStaticMarkup(<PengajuanPinjaman />);

      expect(html).toContain('Pengajuan Pinjaman Baru');
      expect(html).toContain('Ajukan pinjaman dengan validasi sisa THP otomatis.');
      expect(html).toContain('Anggota Pemohon');
      expect(html).toContain('-- Pilih Anggota --');
      expect(html).toContain('Keperluan Pinjaman (Tujuan Pembelian)');
      expect(html).toContain('Plafon Pinjaman (Rp)');
      expect(html).toContain('Tenor (Bulan)');
      expect(html).toContain('Simulasi &amp; Kelayakan');
      expect(html).toContain('Pilih anggota terlebih dahulu untuk melihat kelayakan THP.');
      expect(html).toContain('Ajukan Pinjaman');
    });

    it('renders with populated member and pre-calculated loan input values', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialSelectedAnggota="m-1"
          initialAnggotaList={[{ id: 'm-1', nrp: '11111', nama: 'Sertu Bambang' }]}
          initialPurpose="Beli Laptop"
          initialAmount={12000000}
          initialTenor={12}
          initialThpData={{
            master_thp: 5000000,
            active_installments: 1000000,
            remaining_thp: 4000000
          }}
        />
      );

      expect(html).toContain('Sertu Bambang');
      expect(html).toContain('Beli Laptop');
      expect(html).toContain('Memenuhi Syarat');
      expect(html).toContain('Sisa THP Akhir');
    });
  });

  describe('SimulationPanel Component Tests', () => {
    it('renders empty guide state when thpData is null', () => {
      const html = renderToStaticMarkup(<SimulationPanel thpData={null} newInstallment={0} />);

      expect(html).toContain('Simulasi &amp; Kelayakan');
      expect(html).toContain('Pilih anggota terlebih dahulu untuk melihat kelayakan THP.');
      expect(html).not.toContain('Sisa THP Akhir');
    });

    it('renders Memenuhi Syarat banner when remaining THP after deduction exceeds MIN_REMAINING_THP', () => {
      const thpData = {
        master_thp: 6000000,
        active_installments: 1000000,
        remaining_thp: 5000000
      };
      // Monthly installment = 1,000,000 -> final remaining = 4,000,000 (>= 1,500,000)
      const html = renderToStaticMarkup(<SimulationPanel thpData={thpData} newInstallment={1000000} />);

      expect(html).toContain('Gaji Pokok (Master THP)');
      expect(html).toContain('Cicilan Berjalan');
      expect(html).toContain('Sisa THP Saat Ini');
      expect(html).toContain('Estimasi Cicilan Baru');
      expect(html).toContain('Sisa THP Akhir');
      expect(html).toContain('text-green-600');
      expect(html).toContain('Memenuhi Syarat');
      expect(html).toContain('berada di atas batas minimum');
      expect(html).not.toContain('Tidak Memenuhi Syarat Batas Minimum THP');
    });

    it('renders Tidak Memenuhi Syarat banner with exact shortfall deficit when remaining THP is below threshold', () => {
      const thpData = {
        master_thp: 4000000,
        active_installments: 1500000,
        remaining_thp: 2500000
      };
      // Monthly installment = 1,500,000 -> final remaining = 1,000,000 (shortfall = 500,000)
      const html = renderToStaticMarkup(<SimulationPanel thpData={thpData} newInstallment={1500000} />);

      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).toContain('Sisa THP setelah pemotongan diperkirakan hanya');
      expect(html).toContain('kurang');
      expect(html).toContain('dari batas minimum');
      expect(html).toContain('text-red-600');
      // Master THP is 4,000,000 > 0, so zero THP advisory note must NOT be shown
      expect(html).not.toContain('Data Master THP anggota ini masih Rp 0 di sistem');
    });

    it('renders zero-THP advisory note when member master_thp is Rp 0', () => {
      const zeroThpData = {
        master_thp: 0,
        active_installments: 0,
        remaining_thp: 0
      };
      // Monthly installment = 500,000 -> final remaining = -500,000 (shortfall = 2,000,000)
      const html = renderToStaticMarkup(<SimulationPanel thpData={zeroThpData} newInstallment={500000} />);

      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).toContain('kurang');
      expect(html).toContain('* Catatan: Data Master THP anggota ini masih Rp 0 di sistem. Silakan update THP anggota terlebih dahulu melalui menu Import Gaji atau Manajemen Anggota.');
    });

    it('renders zero-THP advisory note when master_thp is Rp 0 even before loan amount/tenor is filled', () => {
      const zeroThpData = {
        master_thp: 0,
        active_installments: 0,
        remaining_thp: 0
      };
      // Installment = 0 -> final remaining = 0 (shortfall = 1,500,000)
      const html = renderToStaticMarkup(<SimulationPanel thpData={zeroThpData} newInstallment={0} />);

      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).toContain('* Catatan: Data Master THP anggota ini masih Rp 0 di sistem. Silakan update THP anggota terlebih dahulu melalui menu Import Gaji atau Manajemen Anggota.');
    });
  });
});

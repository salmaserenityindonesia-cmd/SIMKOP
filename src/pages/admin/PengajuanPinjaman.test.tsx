import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PengajuanPinjaman, { SimulationPanel, formatCurrency, calculateAvailableTenors } from './PengajuanPinjaman';
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

    it('renders imported THP member (e.g. Wawan Gunawan) with Rp 5.000.000 THP and active status', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialSelectedAnggota="m-wawan"
          initialAnggotaList={[
            {
              id: 'm-wawan',
              nrp: '123456',
              nama: 'Wawan Gunawan',
              master_thp: 0,
              take_home_pay: 5000000,
              salary: null
            }
          ]}
        />
      );

      // Anggota terpilih
      expect(html).toContain('Wawan Gunawan');
      // Gaji Pokok (Master THP) langsung menampilkan Rp 5.000.000
      expect(html).toContain('5.000.000');
      // Memenuhi syarat & Sisa THP Akhir menampilkan Rp 5.000.000
      expect(html).toContain('Memenuhi Syarat');
      // Kotak merah tidak muncul
      expect(html).not.toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).not.toContain('Data Master THP anggota ini masih Rp 0 di sistem');
    });

    it('renders member with formatted string salary and cleans non-numeric characters', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialSelectedAnggota="m-str"
          initialAnggotaList={[
            {
              id: 'm-str',
              nrp: '99999',
              nama: 'Prajurit Teguh',
              master_thp: 0,
              take_home_pay: null,
              salary: 'Rp 4.500.000'
            }
          ]}
        />
      );

      expect(html).toContain('Prajurit Teguh');
      expect(html).toContain('4.500.000');
      expect(html).toContain('Memenuhi Syarat');
      expect(html).not.toContain('Tidak Memenuhi Syarat Batas Minimum THP');
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

    it('renders Iuran Simpanan Rutin line in simulation breakdown', () => {
      const thpData = {
        master_thp: 5000000,
        active_installments: 1000000,
        savings_deduction: 225000,
        remaining_thp: 3775000
      };
      const html = renderToStaticMarkup(<SimulationPanel thpData={thpData} newInstallment={1000000} />);

      expect(html).toContain('Iuran Simpanan Rutin');
      expect(html).toContain('225.000');
      expect(html).toContain('text-rose-600');
      expect(html).toContain('3.775.000');
    });

    it('renders tenor recommendation when current tenor causes THP deficit but longer tenor is viable', () => {
      const thpData = {
        master_thp: 5000000,
        active_installments: 2000000,
        savings_deduction: 200000,
        remaining_thp: 2800000
      };
      // Plafon 20M, Tenor 10 Bulan -> Cicilan 2M -> Sisa THP akhir 800k (Defisit 700k)
      // Tenor 18 Bulan -> Cicilan 1.11M -> Sisa THP akhir 1.68M (>= 1.5M, Memenuhi Syarat!)
      const html = renderToStaticMarkup(
        <SimulationPanel
          thpData={thpData}
          newInstallment={2000000}
          amount={20000000}
          tenor={10}
        />
      );

      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).toContain('Rekomendasi:');
      expect(html).toContain('Pilih tenor 18 bulan atau lebih agar cicilan per bulan menjadi lebih ringan');
      expect(html).toContain('memenuhi syarat sisa THP minimal');
    });

    it('renders interactive apply recommendation button when onSelectTenor is provided', () => {
      const thpData = {
        master_thp: 5000000,
        active_installments: 2000000,
        savings_deduction: 200000,
        remaining_thp: 2800000
      };
      const html = renderToStaticMarkup(
        <SimulationPanel
          thpData={thpData}
          newInstallment={2000000}
          amount={20000000}
          tenor={10}
          onSelectTenor={() => {}}
        />
      );

      expect(html).toContain('Terapkan Tenor 18 Bulan');
    });

    it('does not render recommendation when loan is already eligible', () => {
      const thpData = {
        master_thp: 5000000,
        active_installments: 1000000,
        savings_deduction: 200000,
        remaining_thp: 3800000
      };
      // Plafon 12M, Tenor 12 -> Cicilan 1M -> Sisa 2.8M (Memenuhi Syarat)
      const html = renderToStaticMarkup(
        <SimulationPanel
          thpData={thpData}
          newInstallment={1000000}
          amount={12000000}
          tenor={12}
        />
      );

      expect(html).toContain('Memenuhi Syarat');
      expect(html).not.toContain('Rekomendasi:');
    });

    it('does not render recommendation when loan principal is too large for any tenor to qualify', () => {
      const thpData = {
        master_thp: 4000000,
        active_installments: 2000000,
        savings_deduction: 200000,
        remaining_thp: 1800000
      };
      // Plafon 50M -> at tenor 36 = 1.38M/bln -> Sisa = 411k (< 1.5M, no tenor viable)
      const html = renderToStaticMarkup(
        <SimulationPanel
          thpData={thpData}
          newInstallment={5000000}
          amount={50000000}
          tenor={10}
        />
      );

      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).not.toContain('Rekomendasi:');
    });

    it('respects maxTenor limit and does not recommend tenor exceeding maxTenor', () => {
      const thpData = {
        master_thp: 5000000,
        active_installments: 2000000,
        savings_deduction: 200000,
        remaining_thp: 2800000
      };
      // Plafon 20M, Tenor 10 Bulan -> cicilan 2M -> sisa 800k (< 1.5M).
      // Normal recommendation would be 18 Bulan, but maxTenor is 12 Bulan.
      // Since no tenor <= 12 can satisfy THP >= 1.5M, no recommendation should be rendered.
      const html = renderToStaticMarkup(
        <SimulationPanel
          thpData={thpData}
          newInstallment={2000000}
          amount={20000000}
          tenor={10}
          maxTenor={12}
        />
      );

      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).not.toContain('Rekomendasi:');
      expect(html).not.toContain('18 bulan');
    });
  });

  describe('calculateAvailableTenors helper', () => {
    it('returns empty array when maxTenor is undefined', () => {
      expect(calculateAvailableTenors()).toEqual([]);
    });

    it('filters tenor list up to 6 months for emergency loan', () => {
      expect(calculateAvailableTenors(6)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('filters tenor list up to 12 months for regular loan', () => {
      expect(calculateAvailableTenors(12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it('filters tenor list up to 36 months for long term loan', () => {
      expect(calculateAvailableTenors(36)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 30, 36]);
    });
  });
});

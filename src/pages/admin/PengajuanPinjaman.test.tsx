import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PengajuanPinjaman, { SimulationPanel, formatCurrency, calculateAvailableTenors, submitLoanApplication } from './PengajuanPinjaman';
import { loanService, MIN_REMAINING_THP } from '../../services/loanService';
import { LoanType } from '../../services/koperasiService';

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

  describe('Dynamic Loan Types & Tenor Filtering Form Integration', () => {
    const mockLoanTypes: LoanType[] = [
      {
        id: 'lt-darurat',
        code: 'DARURAT',
        name: 'Pinjaman Darurat',
        max_duration_months: 6,
        is_active: true
      },
      {
        id: 'lt-reguler',
        code: 'REGULER',
        name: 'Pinjaman Reguler',
        max_duration_months: 12,
        is_active: true
      },
      {
        id: 'lt-konsumtif',
        code: 'KONSUMTIF',
        name: 'Pinjaman Konsumtif',
        max_duration_months: 36,
        is_active: true
      }
    ];

    it('renders loan types dropdown with correct options', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman initialLoanTypes={mockLoanTypes} />
      );

      expect(html).toContain('Jenis Pinjaman');
      expect(html).toContain('-- Pilih Jenis Pinjaman --');
      expect(html).toContain('Pinjaman Darurat (Maks. 6 Bulan)');
      expect(html).toContain('Pinjaman Reguler (Maks. 12 Bulan)');
      expect(html).toContain('Pinjaman Konsumtif (Maks. 36 Bulan)');
    });

    it('disables tenor dropdown and prompts to select loan type when no loan type is selected', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman initialLoanTypes={mockLoanTypes} initialSelectedLoanTypeId="" />
      );

      expect(html).toContain('-- Pilih Jenis Pinjaman Terlebih Dahulu --');
      expect(html).toMatch(/<select[^>]*disabled=""[^>]*>/);
    });

    it('enables tenor dropdown and restricts options to max 6 months when DARURAT loan type is selected', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialLoanTypes={mockLoanTypes}
          initialSelectedLoanTypeId="lt-darurat"
        />
      );

      expect(html).toContain('-- Pilih Tenor --');
      expect(html).not.toContain('-- Pilih Jenis Pinjaman Terlebih Dahulu --');
      expect(html).toContain('<option value="1">1 Bulan</option>');
      expect(html).toContain('<option value="6">6 Bulan</option>');
      expect(html).not.toContain('<option value="7">7 Bulan</option>');
      expect(html).not.toContain('<option value="10">10 Bulan</option>');
      expect(html).not.toContain('<option value="12">12 Bulan</option>');
      expect(html).not.toContain('<option value="18">18 Bulan</option>');
      expect(html).not.toContain('<option value="24">24 Bulan</option>');
      expect(html).not.toContain('<option value="36">36 Bulan</option>');
    });

    it('restricts options to max 12 months when REGULER loan type is selected (no 18, 24, 30, 36)', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialLoanTypes={mockLoanTypes}
          initialSelectedLoanTypeId="lt-reguler"
        />
      );

      expect(html).toContain('-- Pilih Tenor --');
      expect(html).toContain('<option value="12">12 Bulan</option>');
      expect(html).not.toContain('<option value="18">18 Bulan</option>');
      expect(html).not.toContain('<option value="24">24 Bulan</option>');
      expect(html).not.toContain('<option value="30">30 Bulan</option>');
      expect(html).not.toContain('<option value="36">36 Bulan</option>');
    });

    it('ensures simulation panel does not recommend tenor exceeding selected product maxTenor', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialSelectedAnggota="m-1"
          initialAnggotaList={[{ id: 'm-1', nrp: '11111', nama: 'Sertu Bambang' }]}
          initialLoanTypes={mockLoanTypes}
          initialSelectedLoanTypeId="lt-darurat"
          initialAmount={20000000}
          initialTenor={4}
          initialThpData={{
            master_thp: 5000000,
            active_installments: 2000000,
            savings_deduction: 200000,
            remaining_thp: 2800000
          }}
        />
      );

      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).not.toContain('Rekomendasi:');
      expect(html).not.toContain('18 bulan');
    });

    it('disables submit button if loan type is not selected', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialSelectedAnggota="m-1"
          initialAnggotaList={[{ id: 'm-1', nrp: '11111', nama: 'Sertu Bambang' }]}
          initialLoanTypes={mockLoanTypes}
          initialSelectedLoanTypeId=""
          initialPurpose="Beli Laptop"
          initialAmount={5000000}
          initialTenor={5}
          initialThpData={{
            master_thp: 5000000,
            active_installments: 0,
            remaining_thp: 4800000
          }}
        />
      );

      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*<svg[^>]*>.*?<\/svg>\s*Ajukan Pinjaman/s);
    });

    it('enables submit button when all fields including loan type are valid and THP eligible', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialSelectedAnggota="m-1"
          initialAnggotaList={[{ id: 'm-1', nrp: '11111', nama: 'Sertu Bambang' }]}
          initialLoanTypes={mockLoanTypes}
          initialSelectedLoanTypeId="lt-darurat"
          initialPurpose="Beli Laptop"
          initialAmount={5000000}
          initialTenor={5}
          initialThpData={{
            master_thp: 5000000,
            active_installments: 0,
            remaining_thp: 4800000
          }}
        />
      );

      expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>\s*<svg[^>]*>.*?<\/svg>\s*Ajukan Pinjaman/s);
      expect(html).toContain('Ajukan Pinjaman');
    });

    it('submits loan application with selected loan_type_id via submitLoanApplication', async () => {
      const spyApplyLoan = vi.spyOn(loanService, 'applyLoan').mockResolvedValueOnce({
        id: 'loan-xyz',
        loan_number: 'LOAN-123',
        status: 'draft'
      } as any);

      const result = await submitLoanApplication(
        'm-1',
        'Beli Komputer',
        6000000,
        6,
        'lt-darurat',
        6
      );

      expect(spyApplyLoan).toHaveBeenCalledWith(
        'm-1',
        'Beli Komputer',
        6000000,
        6,
        'lt-darurat'
      );
      expect(result.id).toBe('loan-xyz');
    });

    it('rejects submitLoanApplication when loan_type_id is missing', async () => {
      await expect(
        submitLoanApplication('m-1', 'Beli Komputer', 6000000, 6, '', 6)
      ).rejects.toThrow('Silakan lengkapi seluruh kolom formulir termasuk jenis pinjaman.');
    });

    it('rejects submitLoanApplication when tenor exceeds maxTenor', async () => {
      await expect(
        submitLoanApplication('m-1', 'Beli Komputer', 6000000, 10, 'lt-darurat', 6)
      ).rejects.toThrow('Tenor yang dipilih (10 bulan) melebihi batas maksimal 6 bulan untuk jenis pinjaman ini.');
    });
  });

  describe('Dynamic Minimum Remaining THP Configuration & Eligibility Integration', () => {
    const mockLoanTypes: LoanType[] = [
      {
        id: 'lt-darurat',
        code: 'DARURAT',
        name: 'Pinjaman Darurat',
        max_duration_months: 6,
        is_active: true
      },
      {
        id: 'lt-reguler',
        code: 'REGULER',
        name: 'Pinjaman Reguler',
        max_duration_months: 12,
        is_active: true
      }
    ];

    it('SimulationPanel respects custom minRemainingThp (e.g. Rp 2.000.000) when rendering Memenuhi Syarat', () => {
      const thpData = {
        master_thp: 5000000,
        active_installments: 0,
        savings_deduction: 200000,
        remaining_thp: 4800000
      };
      // Installment 2,000,000 -> final remaining = 2,800,000 (>= 2,000,000)
      const html = renderToStaticMarkup(
        <SimulationPanel
          thpData={thpData}
          newInstallment={2000000}
          minRemainingThp={2000000}
        />
      );

      expect(html).toContain('Memenuhi Syarat');
      expect(html).toContain('berada di atas batas minimum');
      expect(html).toContain('2.000.000');
      expect(html).not.toContain('Tidak Memenuhi Syarat Batas Minimum THP');
    });

    it('SimulationPanel marks loan as Tidak Memenuhi Syarat when remaining THP is between default 1.5M and RAT threshold 2.0M', () => {
      const thpData = {
        master_thp: 4000000,
        active_installments: 500000,
        savings_deduction: 200000,
        remaining_thp: 3300000
      };
      // Installment 1,550,000 -> final remaining = 1,750,000.
      // Under old default 1.500.000, this was eligible.
      // Under RAT threshold 2.000.000, it is INELIGIBLE with shortfall 250.000.
      const html = renderToStaticMarkup(
        <SimulationPanel
          thpData={thpData}
          newInstallment={1550000}
          minRemainingThp={2000000}
        />
      );

      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).toContain('250.000');
      expect(html).toContain('2.000.000');
      expect(html).toContain('text-red-600');
      expect(html).not.toContain('text-green-600');
      expect(html).not.toContain('Memenuhi Syarat</p>');
    });

    it('SimulationPanel adjusts recommendation tenor to satisfy custom threshold (e.g. Rp 1.750.000)', () => {
      const thpData = {
        master_thp: 4500000,
        active_installments: 1000000,
        savings_deduction: 200000,
        remaining_thp: 3300000
      };
      // Principal 18,000,000, Tenor 6 -> Monthly = 3,000,000 -> Final THP = 300,000 (< 1,750,000)
      // Tenor 10 -> Monthly = 1,800,000 -> Final THP = 1,500,000 (Passes 1.5M, but FAILS 1.75M)
      // Tenor 12 -> Monthly = 1,500,000 -> Final THP = 1,800,000 (>= 1,750,000 -> VIABLE!)
      const html = renderToStaticMarkup(
        <SimulationPanel
          thpData={thpData}
          newInstallment={3000000}
          amount={18000000}
          tenor={6}
          minRemainingThp={1750000}
          onSelectTenor={() => {}}
        />
      );

      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).toContain('Rekomendasi:');
      expect(html).toContain('Pilih tenor 12 bulan atau lebih agar cicilan per bulan menjadi lebih ringan');
      expect(html).toContain('1.750.000');
      expect(html).toContain('Terapkan Tenor 12 Bulan');
    });

    it('PengajuanPinjaman page disables submit button when remaining THP fails custom threshold (Rp 2.000.000)', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialSelectedAnggota="m-1"
          initialAnggotaList={[{ id: 'm-1', nrp: '11111', nama: 'Sertu Bambang' }]}
          initialLoanTypes={mockLoanTypes}
          initialSelectedLoanTypeId="lt-reguler"
          initialPurpose="Renovasi Dapur"
          initialAmount={12000000}
          initialTenor={12}
          initialMinRemainingThp={2000000}
          initialThpData={{
            master_thp: 4000000,
            active_installments: 1200000,
            savings_deduction: 200000,
            remaining_thp: 2600000
          }}
        />
      );

      // Monthly installment = 1,000,000 -> Final THP = 1,600,000
      // 1,600,000 < 2,000,000 -> Ineligible, shortfall 400,000
      expect(html).toContain('Tidak Memenuhi Syarat Batas Minimum THP');
      expect(html).toContain('400.000');
      expect(html).toContain('2.000.000');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*<svg[^>]*>.*?<\/svg>\s*Ajukan Pinjaman/s);
    });

    it('PengajuanPinjaman page enables submit button when remaining THP meets custom threshold (Rp 2.000.000)', () => {
      const html = renderToStaticMarkup(
        <PengajuanPinjaman
          initialSelectedAnggota="m-1"
          initialAnggotaList={[{ id: 'm-1', nrp: '11111', nama: 'Sertu Bambang' }]}
          initialLoanTypes={mockLoanTypes}
          initialSelectedLoanTypeId="lt-reguler"
          initialPurpose="Renovasi Dapur"
          initialAmount={6000000}
          initialTenor={12}
          initialMinRemainingThp={2000000}
          initialThpData={{
            master_thp: 4000000,
            active_installments: 1200000,
            savings_deduction: 200000,
            remaining_thp: 2600000
          }}
        />
      );

      // Monthly installment = 500,000 -> Final THP = 2,100,000 >= 2,000,000
      expect(html).toContain('Memenuhi Syarat');
      expect(html).toContain('2.000.000');
      expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>\s*<svg[^>]*>.*?<\/svg>\s*Ajukan Pinjaman/s);
      expect(html).toContain('Ajukan Pinjaman');
    });

    it('submitLoanApplication forwards custom dynamic threshold to loanService.applyLoan', async () => {
      const spyApplyLoan = vi.spyOn(loanService, 'applyLoan').mockResolvedValueOnce({
        id: 'loan-dynamic-1',
        loan_number: 'LOAN-DYN-001',
        status: 'draft'
      } as any);

      const result = await submitLoanApplication(
        'm-1',
        'Beli Kebutuhan RAT',
        5000000,
        5,
        'lt-darurat',
        6,
        2000000
      );

      expect(spyApplyLoan).toHaveBeenCalledWith(
        'm-1',
        'Beli Kebutuhan RAT',
        5000000,
        5,
        'lt-darurat',
        2000000
      );
      expect(result.id).toBe('loan-dynamic-1');
    });
  });
});

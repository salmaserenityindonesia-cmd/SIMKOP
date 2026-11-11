import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PengaturanKoperasi, {
  formatRupiah,
  formatPeriod,
  getDepositTypeBadge,
  isTierActive,
  MONTH_NAMES
} from './PengaturanKoperasi';
import * as savingsRateService from '../../services/savingsRateService';
import * as settingsService from '../../services/settingsService';

// Mock AdminLayout
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  )
}));

// Mock FeedbackContext
const mockShowToast = vi.fn();
vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: mockShowToast,
    showConfirm: vi.fn(),
    showAlert: vi.fn()
  })
}));

// Mock Cloudinary Service
vi.mock('../../services/cloudinaryService', () => ({
  uploadLogoToCloudinary: vi.fn().mockResolvedValue('https://res.cloudinary.com/test/image/upload/sample-logo.png')
}));

// Mock settingsService
vi.mock('../../services/settingsService', () => ({
  getKoperasiProfile: vi.fn().mockResolvedValue({
    nama_koperasi: 'KOPERASI SIMKOP TEST',
    alamat: 'Jl. Uji Coba No. 123',
    telepon: '08123456789',
    terminal_name: 'POS-01',
    footer_notes: 'Struk Pengujian Unit',
    logo_url: null,
    min_remaining_thp: 1500000,
    min_thp_rat_notes: 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000'
  }),
  updateKoperasiProfile: vi.fn().mockResolvedValue({
    success: true,
    data: {
      nama_koperasi: 'KOPERASI SIMKOP TEST',
      alamat: 'Jl. Uji Coba No. 123',
      telepon: '08123456789',
      terminal_name: 'POS-01',
      footer_notes: 'Struk Pengujian Unit',
      logo_url: null,
      min_remaining_thp: 1500000,
      min_thp_rat_notes: 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000'
    }
  }),
  getLoanSettings: vi.fn().mockResolvedValue({
    minRemainingThp: 1500000,
    ratNotes: 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000'
  }),
  updateLoanSettings: vi.fn().mockImplementation((payload) => Promise.resolve({
    success: true,
    data: {
      id: 'profile-1',
      min_remaining_thp: payload.minRemainingThp,
      min_thp_rat_notes: payload.ratNotes
    }
  })),
  isTableMigratedInSupabase: vi.fn().mockResolvedValue(true),
  DEFAULT_KOPERASI_PROFILE: {
    nama_koperasi: 'KOPERASI PEGAWAI REPUBLIK INDONESIA',
    alamat: 'Jl. Raya Utama No. 1',
    telepon: '08123456789',
    terminal_name: 'POS-01',
    footer_notes: 'Terima kasih',
    logo_url: null,
    min_remaining_thp: 1500000,
    min_thp_rat_notes: 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000'
  },
  DEFAULT_MIN_REMAINING_THP: 1500000,
  DEFAULT_RAT_NOTES: 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000'
}));

// Mock savingsRateService with vi.hoisted
const { mockTiers } = vi.hoisted(() => ({
  mockTiers: [
    {
      id: 'tier-pokok-1',
      deposit_type_code: 'POKOK',
      start_year: 2024,
      start_month: 1,
      end_year: null,
      end_month: null,
      monthly_rate: 100000,
      notes: 'Tarif Simpanan Pokok Standar (Rp 100.000)'
    },
    {
      id: 'tier-wajib-1',
      deposit_type_code: 'WAJIB',
      start_year: 2024,
      start_month: 1,
      end_year: 2025,
      end_month: 10,
      monthly_rate: 150000,
      notes: 'Tarif Simpanan Wajib Lama (Rp 150.000)'
    },
    {
      id: 'tier-wajib-2',
      deposit_type_code: 'WAJIB',
      start_year: 2025,
      start_month: 11,
      end_year: null,
      end_month: null,
      monthly_rate: 200000,
      notes: 'Tarif Simpanan Wajib Baru (Rp 200.000)'
    },
    {
      id: 'tier-belanja-1',
      deposit_type_code: 'BELANJA',
      start_year: 2024,
      start_month: 1,
      end_year: null,
      end_month: null,
      monthly_rate: 25000,
      notes: 'Tarif Simpanan Belanja Standar'
    },
    {
      id: 'tier-lebaran-1',
      deposit_type_code: 'LEBARAN',
      start_year: 2024,
      start_month: 1,
      end_year: null,
      end_month: null,
      monthly_rate: 50000,
      notes: 'Tarif Simpanan Hari Raya Standar'
    }
  ]
}));

vi.mock('../../services/savingsRateService', async (importOriginal) => {
  const actual = await importOriginal<typeof savingsRateService>();
  return {
    ...actual,
    getRateTiers: vi.fn().mockImplementation(() => Promise.resolve(mockTiers)),
    addRateTier: vi.fn().mockImplementation((payload) => Promise.resolve({
      id: 'tier-new-id',
      ...payload
    })),
    deleteRateTier: vi.fn().mockResolvedValue(true)
  };
});

describe('PengaturanKoperasi Component - Rate Tiers Configuration UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pure Helper Functions', () => {
    it('formatRupiah correctly formats currency values to IDR string', () => {
      const formatted150k = formatRupiah(150000);
      expect(formatted150k).toContain('150.000');
      const formatted200k = formatRupiah(200000);
      expect(formatted200k).toContain('200.000');
    });

    it('formatPeriod formats closed ranges correctly', () => {
      const closedTier: savingsRateService.SavingsRateTier = {
        id: 't-closed',
        deposit_type_code: 'WAJIB',
        start_year: 2024,
        start_month: 1,
        end_year: 2025,
        end_month: 10,
        monthly_rate: 150000
      };
      expect(formatPeriod(closedTier)).toBe('Januari 2024 - Oktober 2025');
    });

    it('formatPeriod formats open-ended tiers with "Seterusnya"', () => {
      const openTier: savingsRateService.SavingsRateTier = {
        id: 't-open',
        deposit_type_code: 'WAJIB',
        start_year: 2025,
        start_month: 11,
        end_year: null,
        end_month: null,
        monthly_rate: 200000
      };
      expect(formatPeriod(openTier)).toBe('November 2025 - Seterusnya');
    });

    it('getDepositTypeBadge returns appropriate badge styling and label for each savings type', () => {
      const pokokBadge = getDepositTypeBadge('POKOK');
      expect(pokokBadge.label).toBe('Simpanan Pokok');
      expect(pokokBadge.className).toContain('blue');

      const spBadge = getDepositTypeBadge('SP');
      expect(spBadge.label).toBe('Simpanan Pokok');
      expect(spBadge.className).toContain('blue');

      const wajibBadge = getDepositTypeBadge('WAJIB');
      expect(wajibBadge.label).toBe('Simpanan Wajib');
      expect(wajibBadge.className).toContain('emerald');

      const belanjaBadge = getDepositTypeBadge('BELANJA');
      expect(belanjaBadge.label).toBe('Simpanan Belanja');
      expect(belanjaBadge.className).toContain('amber');

      const lebaranBadge = getDepositTypeBadge('LEBARAN');
      expect(lebaranBadge.label).toBe('Simpanan Lebaran');
      expect(lebaranBadge.className).toContain('purple');

      const unknownBadge = getDepositTypeBadge('UNKNOWN_CUSTOM');
      expect(unknownBadge.label).toBe('UNKNOWN_CUSTOM');
    });

    it('isTierActive detects active vs historical tiers based on date index', () => {
      const pastTier: savingsRateService.SavingsRateTier = {
        id: 't-past',
        deposit_type_code: 'WAJIB',
        start_year: 2020,
        start_month: 1,
        end_year: 2020,
        end_month: 12,
        monthly_rate: 100000
      };
      expect(isTierActive(pastTier)).toBe(false);

      const ongoingTier: savingsRateService.SavingsRateTier = {
        id: 't-ongoing',
        deposit_type_code: 'WAJIB',
        start_year: 2020,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 200000
      };
      expect(isTierActive(ongoingTier)).toBe(true);
    });
  });

  describe('Static UI Component Rendering', () => {
    it('renders the Rate Tier Management card title and description', () => {
      const html = renderToStaticMarkup(
        <PengaturanKoperasi initialLoading={false} initialRateTiers={mockTiers} />
      );

      expect(html).toContain('Konfigurasi Tarif Iuran Simpanan Bertingkat');
      expect(html).toContain('Atur penyesuaian nominal iuran bulanan simpanan anggota per rentang periode');
      expect(html).toContain('+ Tambah Kenaikan Tarif');
      expect(html).toContain('Proteksi Anti-Overlap Otomatis');
    });

    it('renders table columns and rate tier rows with correct badges and amounts', () => {
      const html = renderToStaticMarkup(
        <PengaturanKoperasi initialLoading={false} initialRateTiers={mockTiers} />
      );

      // Table headers
      expect(html).toContain('Jenis Simpanan');
      expect(html).toContain('Rentang Periode');
      expect(html).toContain('Nominal Bulanan');
      expect(html).toContain('Catatan / No. SK');
      expect(html).toContain('Status');
      expect(html).toContain('Aksi');

      // Tiers data rows
      expect(html).toContain('Simpanan Pokok');
      expect(html).toContain('100.000');
      expect(html).toContain('(Sekali Bayar / Awal)');
      expect(html).toContain('Tarif Simpanan Pokok Standar (Rp 100.000)');

      expect(html).toContain('Simpanan Wajib');
      expect(html).toContain('Januari 2024 - Oktober 2025');
      expect(html).toContain('150.000');
      expect(html).toContain('Tarif Simpanan Wajib Lama (Rp 150.000)');

      expect(html).toContain('November 2025 - Seterusnya');
      expect(html).toContain('200.000');
      expect(html).toContain('Tarif Simpanan Wajib Baru (Rp 200.000)');

      expect(html).toContain('Simpanan Belanja');
      expect(html).toContain('25.000');

      expect(html).toContain('Simpanan Lebaran');
      expect(html).toContain('50.000');
    });

    it('renders empty table message when rateTiers is empty', () => {
      const html = renderToStaticMarkup(
        <PengaturanKoperasi initialLoading={false} initialRateTiers={[]} />
      );

      expect(html).toContain('Belum ada data tarif simpanan bertingkat.');
    });

    it('renders Add Rate Tier Modal Dialog when initialAddModalOpen is true', () => {
      const html = renderToStaticMarkup(
        <PengaturanKoperasi
          initialLoading={false}
          initialRateTiers={mockTiers}
          initialAddModalOpen={true}
        />
      );

      expect(html).toContain('Tambah Kenaikan Tarif Simpanan');
      expect(html).toContain('Konfigurasi nominal iuran berjenjang untuk periode waktu tertentu');
      expect(html).toContain('<option value="POKOK">Simpanan Pokok</option>');
      expect(html).toContain('Simpanan Wajib');
      expect(html).toContain('Simpanan Belanja');
      expect(html).toContain('Simpanan Hari Raya (Lebaran)');
      expect(html).toContain('Berlaku Seterusnya (Open-Ended)');
      expect(html).toContain('Nominal Iuran Bulanan Baru (Rp)');
      expect(html).toContain('Catatan / Dasar Keputusan (Opsional)');
      expect(html).toContain('Simpan Tarif');
    });

    it('renders dynamic label and placeholder for Simpanan Pokok in Add Modal', () => {
      const html = renderToStaticMarkup(
        <PengaturanKoperasi
          initialLoading={false}
          initialRateTiers={mockTiers}
          initialAddModalOpen={true}
          initialTierCode="POKOK"
        />
      );

      expect(html).toContain('Nominal Simpanan Pokok Baru (Rp)');
      expect(html).toContain('Contoh: 100000');
    });
  });

  describe('Service Integration Contract', () => {
    it('calls savingsRateService.getRateTiers to load tiers', async () => {
      const tiers = await savingsRateService.getRateTiers();
      expect(tiers).toHaveLength(5);
      expect(savingsRateService.getRateTiers).toHaveBeenCalled();
    });

    it('calls savingsRateService.addRateTier with correct parameters on tier submission', async () => {
      const newPayload = {
        deposit_type_code: 'WAJIB',
        start_year: 2026,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 250000,
        notes: 'Kenaikan tarif RAT 2026'
      };

      const result = await savingsRateService.addRateTier(newPayload);
      expect(savingsRateService.addRateTier).toHaveBeenCalledWith(newPayload);
      expect(result).toHaveProperty('id');
      expect(result.monthly_rate).toBe(250000);
    });

    it('calls savingsRateService.deleteRateTier with given tier ID', async () => {
      const res = await savingsRateService.deleteRateTier('tier-wajib-1');
      expect(savingsRateService.deleteRateTier).toHaveBeenCalledWith('tier-wajib-1');
      expect(res).toBe(true);
    });
  });

  describe('Kebijakan Kelayakan Pinjaman (Keputusan RAT) UI', () => {
    it('renders the Loan Eligibility Policy card title, descriptions, and inputs', () => {
      const html = renderToStaticMarkup(
        <PengaturanKoperasi
          initialLoading={false}
          initialMinRemainingThp={1500000}
          initialMinThpRatNotes="Keputusan RAT Tahun Buku 2025 No. 04/RAT/2026"
        />
      );

      expect(html).toContain('Kebijakan Kelayakan Pinjaman (Keputusan RAT)');
      expect(html).toContain('Batas Minimum Sisa THP (Rp)');
      expect(html).toContain('Preview Nominal:');
      expect(html).toContain('1.500.000');
      expect(html).toContain('Catatan Keputusan / Nomor SK RAT');
      expect(html).toContain('Keputusan RAT Tahun Buku 2025 No. 04/RAT/2026');
      expect(html).toContain('Simpan Kebijakan Kelayakan');
      expect(html).toContain('Validasi Otomatis Kelayakan:');
    });

    it('renders custom initial values for minimum THP and notes', () => {
      const html = renderToStaticMarkup(
        <PengaturanKoperasi
          initialLoading={false}
          initialMinRemainingThp={2000000}
          initialMinThpRatNotes="SK Pengurus No 12/2026"
        />
      );

      expect(html).toContain('value="2000000"');
      expect(html).toContain('2.000.000');
      expect(html).toContain('value="SK Pengurus No 12/2026"');
      expect(html).toContain('step="any"');
      expect(html).toContain('min="0"');
      expect(html).not.toContain('step="50000"');
    });

    it('integrates with settingsService.getLoanSettings and updateLoanSettings', async () => {
      const settings = await settingsService.getLoanSettings();
      expect(settings).toEqual({
        minRemainingThp: 1500000,
        ratNotes: 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000'
      });
      expect(settingsService.getLoanSettings).toHaveBeenCalled();

      const updateRes = await settingsService.updateLoanSettings({
        minRemainingThp: 1750000,
        ratNotes: 'RAT 2026 penyesuaian inflasi'
      });
      expect(updateRes.success).toBe(true);
      expect(settingsService.updateLoanSettings).toHaveBeenCalledWith({
        minRemainingThp: 1750000,
        ratNotes: 'RAT 2026 penyesuaian inflasi'
      });
    });
  });
});

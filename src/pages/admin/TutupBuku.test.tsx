import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import TutupBuku from './TutupBuku';
import {
  createDefaultRatSettings,
  type YearEndClosingPreview,
} from '../../services/yearEndClosingService';
import {
  MONTH_NAMES_ID,
  type MonthlyClosingRecord,
} from '../../services/monthlyClosingService';

vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
}));

const samplePreview: YearEndClosingPreview = {
  fiscalYear: 2026,
  closingDate: '2026-12-31',
  openingNextYearDate: '2027-01-01',
  isClosed: false,
  closingRecord: null,
  closingCashBalance: 75_000_000,
  postShuCashBalance: 69_000_000,
  closingLoanReceivable: 18_000_000,
  closingStoreReceivable: 4_500_000,
  closingMemberSavings: 60_000_000,
  postShuMemberSavings: 60_000_000,
  grossSales: 90_000_000,
  cogs: 70_000_000,
  grossProfit: 20_000_000,
  goodsFinancingMargin: 3_000_000,
  opex: 13_000_000,
  netShuAmount: 10_000_000,
  reserveFundAmount: 2_000_000,
  memberBorrowerPool: 3_000_000,
  memberDepositorPool: 2_500_000,
  managementFundAmount: 1_000_000,
  employeeFundAmount: 500_000,
  socialFundAmount: 500_000,
  educationFundAmount: 500_000,
  otherFundAmount: 2_500_000,
  memberShuTotal: 5_500_000,
  jasaUsahaPool: 3_000_000,
  jasaModalPool: 2_500_000,
  totalDistributedToMembers: 6_000_000,
  totalAllMembersSavings: 60_000_000,
  totalAllMembersTransactions: 20_000_000,
  memberRows: [
    {
      memberId: 'm-1',
      nrp: '000101',
      nama: 'Budi Santoso',
      totalSavingsContribution: 40_000_000,
      totalTransactionContribution: 15_000_000,
      jasaModalAmount: 1_200_000,
      jasaUsahaAmount: 3_150_000,
      totalShuReceived: 4_350_000,
    },
    {
      memberId: 'm-2',
      nrp: '000102',
      nama: 'Ani Wijaya',
      totalSavingsContribution: 20_000_000,
      totalTransactionContribution: 5_000_000,
      jasaModalAmount: 600_000,
      jasaUsahaAmount: 1_050_000,
      totalShuReceived: 1_650_000,
    },
  ],
};

describe('TutupBuku Page Component (SSR)', () => {
  it('renders inline RAT settings panel, validation badges, 4 real-account cards, and member SHU rows', () => {
    const html = renderToStaticMarkup(
      <TutupBuku
        initialFiscalYear={2026}
        initialSettings={createDefaultRatSettings(2026)}
        initialPreview={samplePreview}
      />
    );

    expect(html).toContain('Tutup Buku Akhir Tahun &amp; Pembagian SHU (RAT)');
    expect(html).toContain('TAHUN BUKU AKTIF / TERBUKA');
    expect(html).toContain('1. ALOKASI SHU SESUAI AD/ART (TOTAL HARUS 100%)');
    expect(html).toContain('Total Alokasi: 100%');
    expect(html).toContain('Cadangan Modal (%)');
    expect(html).toContain('Anggota Peminjam (%)');
    expect(html).toContain('Anggota Penyimpan (%)');
    expect(html).toContain('Dana Pengurus (%)');
    expect(html).toContain('Dana Karyawan (%)');
    expect(html).toContain('Dana Sosial (%)');
    expect(html).toContain('Dana Pendidikan (%)');
    expect(html).toContain('Dibayarkan Tunai / Transfer (Kas Keluar)');
    expect(html).toContain('Dikreditkan ke Simpanan Anggota (Non-Tunai)');

    expect(html).toContain('Saldo Kas Akhir Brankas');
    expect(html).toContain('Saldo Simpanan Anggota');
    expect(html).toContain('Sisa Piutang Pinjaman');
    expect(html).toContain('Sisa Piutang Bon Toko');
    expect(html).toContain('75.000.000');
    expect(html).toContain('60.000.000');

    expect(html).toContain('Budi Santoso');
    expect(html).toContain('Ani Wijaya');
    expect(html).toContain('Eksekusi Tutup Buku Tahun 2026 &amp; Buka Saldo Awal 2027');
  });

  it('displays red validation alert and disables execution when RAT percentages do not total 100%', () => {
    const invalidSettings = {
      ...createDefaultRatSettings(2026),
      reserve_fund_pct: 35, // 35+30+25+10+5+5+5 = 115%
    };

    const html = renderToStaticMarkup(
      <TutupBuku
        initialFiscalYear={2026}
        initialSettings={invalidSettings}
        initialPreview={samplePreview}
      />
    );

    expect(html).toContain('Total Alokasi: 115%');
    expect(html).toContain('data-testid="rat-validation-error"');
    expect(html).toMatch(/data-testid="execute-closing-cta-btn"[^>]*disabled=""/);
  });

  it('renders confirmation modal when initialConfirmModalOpen is true', () => {
    const html = renderToStaticMarkup(
      <TutupBuku
        initialFiscalYear={2026}
        initialSettings={createDefaultRatSettings(2026)}
        initialPreview={samplePreview}
        initialConfirmModalOpen={true}
      />
    );

    expect(html).toContain('Konfirmasi Tutup Buku Tahun 2026 &amp; Buka Saldo Awal 2027');
    expect(html).toContain('Ya, Eksekusi Tutup Buku Sekarang');
    expect(html).toContain('69.500.000');
  });

  it('renders CLOSED locked banner and history table when fiscal year is already closed', () => {
    const closedRecord = {
      id: 'closing-2026',
      fiscal_year: 2026,
      closing_date: '2026-12-31',
      opening_next_year_date: '2027-01-01',
      closing_cash_balance: 75_000_000,
      closing_loan_receivable: 18_000_000,
      closing_store_receivable: 4_500_000,
      closing_member_savings: 60_000_000,
      net_shu_amount: 10_000_000,
      reserve_fund_amount: 4_000_000,
      member_shu_total: 6_000_000,
      other_fund_amount: 0,
      payout_method: 'CASH_PAYOUT' as const,
      status: 'CLOSED' as const,
      post_shu_cash_balance: 69_000_000,
      executed_at: '2026-12-31T23:59:00Z',
    };

    const html = renderToStaticMarkup(
      <TutupBuku
        initialFiscalYear={2026}
        initialSettings={createDefaultRatSettings(2026)}
        initialPreview={{ ...samplePreview, isClosed: true, closingRecord: closedRecord }}
        initialClosingsHistory={[closedRecord]}
      />
    );

    expect(html).toContain('SUDAH TUTUP BUKU (TERKUNCI)');
    expect(html).toContain('data-testid="year-closed-lock-banner"');
    expect(html).toContain('Tahun Buku 2026');
    expect(html).not.toContain('data-testid="execute-closing-cta-btn"');
  });

  it('renders 12-month Rekap Akhir Bulan reference table with partial archive soft-check and full 12/12 completeness badge', () => {
    const buildArchive = (month: number, overrides: Partial<MonthlyClosingRecord> = {}): MonthlyClosingRecord => ({
      id: `mc-${month}`,
      fiscal_year: 2026,
      period_month: month,
      cutoff_date: `2026-${String(month).padStart(2, '0')}-28`,
      opening_cash_balance: 50_000_000,
      monthly_cash_in: 10_000_000,
      monthly_cash_out: 5_000_000,
      closing_cash_balance: 75_000_000,
      total_savings_balance: 60_000_000,
      savings_pokok: 10_000_000,
      savings_wajib: 30_000_000,
      savings_belanja: 15_000_000,
      savings_lebaran: 5_000_000,
      active_loan_count: 5,
      total_loan_receivable: 18_000_000,
      total_store_credit_receivable: 4_500_000,
      inventory_valuation: 20_000_000,
      monthly_revenue: 8_000_000,
      monthly_cogs: 6_000_000,
      monthly_financing_margin: 300_000,
      monthly_opex: 1_100_000,
      monthly_net_shu: 1_200_000,
      ytd_net_shu: month * 1_200_000,
      minutes_number: `BA-EVAL/2026/${String(month).padStart(2, '0')}`,
      meeting_date: `2026-${String(month).padStart(2, '0')}-28`,
      attendees: 'Ketua, Bendahara',
      evaluation_notes: 'Evaluasi rutin',
      approved_by: 'admin-1',
      approved_at: '2026-12-31T10:00:00Z',
      updated_at: '2026-12-31T10:00:00Z',
      ...overrides,
    });

    const partialHtml = renderToStaticMarkup(
      <TutupBuku
        initialFiscalYear={2026}
        initialSettings={createDefaultRatSettings(2026)}
        initialPreview={samplePreview}
        initialMonthlyArchives={[buildArchive(1), buildArchive(12)]}
      />
    );

    expect(partialHtml).toContain('Referensi Pemeriksaan: Arsip Rekap Akhir Bulan (2026)');
    expect(partialHtml).toContain('2 / 12 Bulan Disahkan');
    expect(partialHtml).toContain('Kelola Rekap Bulanan');
    expect(partialHtml).toContain('BA-EVAL/2026/01');
    expect(partialHtml).toContain('BA-EVAL/2026/12');
    expect(partialHtml).toContain('Disahkan ✓');
    expect(partialHtml).toContain('Belum Direkap');
    expect(partialHtml).toContain('/admin/tutup-bulan?year=2026&amp;month=2');
    expect(partialHtml).toContain('Saldo Kas Desember Konsisten dengan Neraca Akhir Tahun (Selisih Rp 0)');
    expect(partialHtml).not.toMatch(/data-testid="execute-closing-cta-btn"[^>]*disabled=""/);
    for (const monthName of MONTH_NAMES_ID) {
      expect(partialHtml).toContain(`${monthName} 2026`);
    }

    const all12 = Array.from({ length: 12 }, (_, i) => buildArchive(i + 1));
    const fullHtml = renderToStaticMarkup(
      <TutupBuku
        initialFiscalYear={2026}
        initialSettings={createDefaultRatSettings(2026)}
        initialPreview={samplePreview}
        initialMonthlyArchives={all12}
      />
    );

    expect(fullHtml).toContain('12 / 12 Bulan Lengkap Disahkan');
    expect(fullHtml).not.toContain('Belum Direkap');
  });
});

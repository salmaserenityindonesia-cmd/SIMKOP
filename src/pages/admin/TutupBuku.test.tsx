import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import TutupBuku from './TutupBuku';
import {
  createDefaultRatSettings,
  type YearEndClosingPreview,
} from '../../services/yearEndClosingService';

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
  reserveFundAmount: 4_000_000,
  otherFundAmount: 0,
  memberShuTotal: 6_000_000,
  jasaUsahaPool: 4_200_000,
  jasaModalPool: 1_800_000,
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
    expect(html).toContain('Total Alokasi: 100%');
    expect(html).toContain('Sub-Rasio Anggota: 100%');
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
      reserve_fund_pct: 55,
      member_shu_pct: 60,
      other_fund_pct: 0,
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
    expect(html).toContain('69.000.000');
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
});

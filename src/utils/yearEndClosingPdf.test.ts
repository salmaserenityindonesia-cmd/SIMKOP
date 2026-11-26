import { describe, it, expect } from 'vitest';
import { exportYearEndClosingPdf } from './yearEndClosingPdf';
import { exportYearEndRatBeritaAcaraPdf } from './yearEndClosingPdfExporter';
import {
  createDefaultRatSettings,
  type YearEndClosingPreview,
} from '../services/yearEndClosingService';
import type { MonthlyClosingRecord } from '../services/monthlyClosingService';

const buildPreview = (
  overrides: Partial<YearEndClosingPreview> = {}
): YearEndClosingPreview => ({
  fiscalYear: 2026,
  closingDate: '2026-12-31',
  openingNextYearDate: '2027-01-01',
  isClosed: true,
  closingRecord: {
    id: 'closing-1',
    fiscal_year: 2026,
    closing_date: '2026-12-31',
    opening_next_year_date: '2027-01-01',
    closing_cash_balance: 50_000_000,
    closing_loan_receivable: 15_000_000,
    closing_store_receivable: 3_000_000,
    closing_member_savings: 45_000_000,
    net_shu_amount: 10_000_000,
    reserve_fund_amount: 4_000_000,
    member_shu_total: 6_000_000,
    other_fund_amount: 0,
    payout_method: 'CASH_PAYOUT',
    status: 'CLOSED',
    notes: 'Keputusan RAT No. 01/RAT/2026',
    executed_at: '2026-12-31T23:59:00Z',
  },
  closingCashBalance: 50_000_000,
  postShuCashBalance: 44_000_000,
  closingLoanReceivable: 15_000_000,
  closingStoreReceivable: 3_000_000,
  closingMemberSavings: 45_000_000,
  postShuMemberSavings: 45_000_000,
  grossSales: 80_000_000,
  cogs: 60_000_000,
  grossProfit: 20_000_000,
  goodsFinancingMargin: 2_000_000,
  opex: 12_000_000,
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
  totalAllMembersSavings: 45_000_000,
  totalAllMembersTransactions: 20_000_000,
  memberRows: [
    {
      memberId: 'm-1',
      nrp: '000101',
      nama: 'Budi Santoso',
      totalSavingsContribution: 25_000_000,
      totalTransactionContribution: 12_000_000,
      jasaModalAmount: 1_000_000,
      jasaUsahaAmount: 2_520_000,
      totalShuReceived: 3_520_000,
    },
    {
      memberId: 'm-2',
      nrp: '000102',
      nama: 'Ani Wijaya',
      totalSavingsContribution: 20_000_000,
      totalTransactionContribution: 8_000_000,
      jasaModalAmount: 800_000,
      jasaUsahaAmount: 1_680_000,
      totalShuReceived: 2_480_000,
    },
  ],
  ...overrides,
});

const buildMonthlyArchive = (month: number): MonthlyClosingRecord => ({
  id: `mc-${month}`,
  fiscal_year: 2026,
  period_month: month,
  cutoff_date: `2026-${String(month).padStart(2, '0')}-28`,
  opening_cash_balance: 40_000_000,
  monthly_cash_in: 12_000_000,
  monthly_cash_out: 8_000_000,
  closing_cash_balance: 44_000_000 + month * 500_000,
  total_savings_balance: 45_000_000,
  savings_pokok: 10_000_000,
  savings_wajib: 20_000_000,
  savings_belanja: 10_000_000,
  savings_lebaran: 5_000_000,
  active_loan_count: 4,
  total_loan_receivable: 15_000_000,
  total_store_credit_receivable: 3_000_000,
  inventory_valuation: 18_000_000,
  monthly_revenue: 6_500_000,
  monthly_cogs: 5_000_000,
  monthly_financing_margin: 200_000,
  monthly_opex: 900_000,
  monthly_net_shu: 800_000,
  ytd_net_shu: month * 800_000,
  minutes_number: `BA-EVAL/2026/${String(month).padStart(2, '0')}`,
  meeting_date: `2026-${String(month).padStart(2, '0')}-28`,
  attendees: 'Ketua, Bendahara, Pengawas',
  evaluation_notes: 'Rapat evaluasi berjalan lancar.',
  approved_by: 'admin-1',
  approved_at: '2026-12-31T10:00:00Z',
  updated_at: '2026-12-31T10:00:00Z',
});

describe('yearEndClosingPdfExporter', () => {
  it('generates multi-page Berita Acara RAT PDF with Main Sheet, Appendix I (12-month archive), and Appendix II (Member SHU)', () => {
    const settings = createDefaultRatSettings(2026);
    const preview = buildPreview();
    const partialArchives = [buildMonthlyArchive(1), buildMonthlyArchive(12)];

    const doc = exportYearEndRatBeritaAcaraPdf({
      preview,
      settings,
      monthlyArchives: partialArchives,
      closingNotes: 'Keputusan RAT No. 01/RAT/2026',
      autoSave: false,
    });

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect((doc as any).lastAutoTable).toBeDefined();
  });

  it('handles full 12/12 monthly archives, DRAFT status, and CREDIT_SAVINGS payout method cleanly', () => {
    const settings = {
      ...createDefaultRatSettings(2026),
      payout_method: 'CREDIT_SAVINGS' as const,
      target_deposit_type_code: 'LEBARAN',
    };
    const preview = buildPreview({
      isClosed: false,
      closingRecord: null,
      postShuCashBalance: 50_000_000,
      postShuMemberSavings: 51_000_000,
    });
    const fullArchives = Array.from({ length: 12 }, (_, idx) =>
      buildMonthlyArchive(idx + 1)
    );

    const doc = exportYearEndRatBeritaAcaraPdf({
      preview,
      settings,
      monthlyArchives: fullArchives,
      profile: {
        nama_koperasi: 'Koperasi Tes Sejahtera',
        alamat: 'Jl. Merdeka No. 10',
        telepon: '021-5551234',
      },
      autoSave: false,
    });

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
  });

  it('keeps exportYearEndClosingPdf backwards compatible', () => {
    const settings = createDefaultRatSettings(2026);
    const preview = buildPreview();

    const doc = exportYearEndClosingPdf({
      preview,
      settings,
      autoSave: false,
    });

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
  });
});

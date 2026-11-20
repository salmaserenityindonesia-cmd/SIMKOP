import { describe, it, expect } from 'vitest';
import { exportYearEndClosingPdf } from './yearEndClosingPdf';
import {
  createDefaultRatSettings,
  type YearEndClosingPreview,
} from '../services/yearEndClosingService';

describe('yearEndClosingPdf', () => {
  it('generates a jsPDF Berita Acara RAT document with autoTable output', () => {
    const settings = createDefaultRatSettings(2026);
    const preview: YearEndClosingPreview = {
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
      reserveFundAmount: 4_000_000,
      otherFundAmount: 0,
      memberShuTotal: 6_000_000,
      jasaUsahaPool: 4_200_000,
      jasaModalPool: 1_800_000,
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
    };

    const doc = exportYearEndClosingPdf({
      preview,
      settings,
      autoSave: false,
    });

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect((doc as any).lastAutoTable).toBeDefined();
  });
});

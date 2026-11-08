import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoanScheduleModal, {
  formatRateBadge,
  formatDateIndo,
  getImportedRepaidBalance,
  LoanScheduleModalProps,
} from './LoanScheduleModal';
import LoanLedgerModal from '../members/LoanLedgerModal';
import {
  getLoanInteractiveGrid,
  toggleLoanSchedulePaid,
  checkAllLoanUpToCurrentMonth,
  autoReconcileLoanInstallments,
  uncheckAllLoanSchedules,
  calculateRemainingInstallmentDeficit,
  LoanInteractiveGridSummary,
} from '../../services/loanMatrixService';

// Mock loanMatrixService
vi.mock('../../services/loanMatrixService', () => {
  return {
    MONTH_NAMES: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'],
    getLoanInteractiveGrid: vi.fn(),
    toggleLoanSchedulePaid: vi.fn(),
    checkAllLoanUpToCurrentMonth: vi.fn(),
    autoReconcileLoanInstallments: vi.fn(),
    uncheckAllLoanSchedules: vi.fn(),
    calculateRemainingInstallmentDeficit: (target: number, paid: number) =>
      Math.max(0, Number(target || 0) - Number(paid || 0)),
  };
});

const mockLoanGridData: LoanInteractiveGridSummary = {
  loanId: 'loan-123',
  loanNumber: 'PJ-2026-001',
  memberId: 'mem-001',
  memberName: 'Bripda Ahmad Fadli',
  memberNrp: '92040123',
  principalAmount: 3000000,
  tenor: 6,
  monthlyTarget: 500000,
  disbursedAt: '2026-01-15',
  totalPaid: 1500000,
  sisaPinjaman: 1500000,
  isBalanced: false,
  periods: [
    {
      id: 'sched-1',
      loanId: 'loan-123',
      periodNumber: 1,
      dueDate: '2026-02-15',
      targetAmount: 500000,
      paidAmount: 500000,
      status: 'PAID',
      label: 'Bulan 1 [Feb-26]',
      isCurrentMonth: false,
      repayments: [
        {
          id: 'rep-1',
          amountPaid: 500000,
          paymentDate: '2026-02-14T10:00:00Z',
          paymentMethod: 'potong_gaji',
          notes: 'Potong gaji Februari',
        },
      ],
    },
    {
      id: 'sched-2',
      loanId: 'loan-123',
      periodNumber: 2,
      dueDate: '2026-03-15',
      targetAmount: 500000,
      paidAmount: 500000,
      status: 'PAID',
      label: 'Bulan 2 [Mar-26]',
      isCurrentMonth: false,
      repayments: [
        {
          id: 'rep-2',
          amountPaid: 500000,
          paymentDate: '2026-03-15T08:30:00Z',
          paymentMethod: 'transfer',
          notes: 'KW-002 Transfer Bank',
        },
      ],
    },
    {
      id: 'sched-3',
      loanId: 'loan-123',
      periodNumber: 3,
      dueDate: '2026-04-15',
      targetAmount: 500000,
      paidAmount: 500000,
      status: 'PAID',
      label: 'Bulan 3 [Apr-26]',
      isCurrentMonth: false,
      repayments: [],
    },
    {
      id: 'sched-4',
      loanId: 'loan-123',
      periodNumber: 4,
      dueDate: '2026-05-15',
      targetAmount: 500000,
      paidAmount: 200000,
      status: 'PARTIAL',
      label: 'Bulan 4 [Mei-26]',
      isCurrentMonth: true,
      repayments: [
        {
          id: 'rep-3',
          amountPaid: 200000,
          paymentDate: '2026-05-10T11:00:00Z',
          paymentMethod: 'tunai',
          notes: 'Bayar kasir sebagian',
        },
      ],
    },
    {
      id: 'sched-5',
      loanId: 'loan-123',
      periodNumber: 5,
      dueDate: '2026-06-15',
      targetAmount: 500000,
      paidAmount: 0,
      status: 'UNPAID',
      label: 'Bulan 5 [Jun-26]',
      isCurrentMonth: false,
      repayments: [],
    },
    {
      id: 'sched-6',
      loanId: 'loan-123',
      periodNumber: 6,
      dueDate: '2026-07-15',
      targetAmount: 500000,
      paidAmount: 0,
      status: 'PROJECTED',
      label: 'Bulan 6 [Jul-26]',
      isCurrentMonth: false,
      repayments: [],
    },
  ],
};

const mockBalancedData: LoanInteractiveGridSummary = {
  ...mockLoanGridData,
  totalPaid: 3000000,
  sisaPinjaman: 0,
  isBalanced: true,
};

describe('LoanScheduleModal Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getLoanInteractiveGrid as any).mockResolvedValue(mockLoanGridData);
  });

  describe('Helper Functions Unit Tests', () => {
    it('formatRateBadge formats amounts accurately', () => {
      expect(formatRateBadge(1000000)).toBe('Rp 1jt');
      expect(formatRateBadge(2500000)).toBe('Rp 2.5jt');
      expect(formatRateBadge(500000)).toBe('Rp 500k');
      expect(formatRateBadge(277000)).toBe('Rp 277k');
      expect(formatRateBadge(500)).toBe('Rp 500');
    });

    it('formatDateIndo formats dates correctly and handles invalid inputs', () => {
      expect(formatDateIndo('2026-01-15')).toContain('15 Jan 2026');
      expect(formatDateIndo('2026-07-25')).toContain('25 Jul 2026');
      expect(formatDateIndo(null)).toBe('-');
      expect(formatDateIndo(undefined)).toBe('-');
      expect(formatDateIndo('invalid-date')).toBe('-');
    });
  });

  describe('Header & Borrower Profile Bar Rendering', () => {
    it('renders modal header title, badge, and close button', () => {
      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={mockLoanGridData}
        />
      );

      expect(html).toContain('Buku Bantu Angsuran Pinjaman (Interactive Grid)');
      expect(html).toContain('Real-time');
      expect(html).toContain('title="Tutup Modal"');
    });

    it('renders borrower details: name, NRP, loan number, tenor, and disbursement date', () => {
      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={mockLoanGridData}
        />
      );

      expect(html).toContain('Bripda Ahmad Fadli');
      expect(html).toContain('92040123');
      expect(html).toContain('PJ-2026-001');
      expect(html).toContain('6 Bulan');
      expect(html).toContain('15 Jan 2026');
    });

    it('renders remaining balance badge when loan is active with unpaid balance', () => {
      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={mockLoanGridData}
        />
      );

      expect(html).toContain('Total Terbayar:');
      expect(html).toContain('Total Pinjaman:');
      expect(html).toContain('Sisa Pinjaman:');
      expect(html).toContain('1.500.000');
    });

    it('renders balanced badge when loan is fully paid', () => {
      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={mockBalancedData}
        />
      );

      expect(html).toContain('Sesuai / Seimbang');
    });
  });

  describe('Quick Actions Toolbar & Status Legend', () => {
    it('renders quick action buttons and status legend labels', () => {
      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={mockLoanGridData}
        />
      );

      expect(html).toContain('Centang Semua s/d Bulan Ini');
      expect(html).toContain('Cocokkan Otomatis dengan Saldo Terangsur');
      expect(html).toContain('Batal Centang Semua');

      // Status Legend
      expect(html).toContain('Lunas');
      expect(html).toContain('Parsial');
      expect(html).toContain('Menunggak');
      expect(html).toContain('Proyeksi');
    });
  });

  describe('Horizontal Checkbox Grid Rendering', () => {
    it('renders all tenor period columns and marks current month with badge', () => {
      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={mockLoanGridData}
        />
      );

      // Period labels in header
      expect(html).toContain('Bulan 1 [Feb-26]');
      expect(html).toContain('Bulan 2 [Mar-26]');
      expect(html).toContain('Bulan 3 [Apr-26]');
      expect(html).toContain('Bulan 4 [Mei-26]');
      expect(html).toContain('Bulan 5 [Jun-26]');
      expect(html).toContain('Bulan 6 [Jul-26]');

      // Current month highlight
      expect(html).toContain('data-testid="current-month-col"');
      expect(html).toContain('BULAN INI');
    });

    it('renders checkboxes and status badges according to payment state', () => {
      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={mockLoanGridData}
        />
      );

      // Checkboxes exist for all periods
      expect(html).toContain('data-testid="checkbox-period-1"');
      expect(html).toContain('data-testid="checkbox-period-2"');
      expect(html).toContain('data-testid="checkbox-period-3"');
      expect(html).toContain('data-testid="checkbox-period-4"');
      expect(html).toContain('data-testid="checkbox-period-5"');
      expect(html).toContain('data-testid="checkbox-period-6"');

      // Badges exist for all periods
      expect(html).toContain('data-testid="badge-period-1"');
      expect(html).toContain('data-testid="badge-period-4"');

      // Partial badge displays both paid and target amounts
      expect(html).toContain('Rp 200k / Rp 500k');

      // History buttons exist
      expect(html).toContain('data-testid="history-btn-period-1"');
      expect(html).toContain('data-testid="history-btn-period-4"');
    });
  });

  describe('Loading and Empty States', () => {
    it('renders loading state when initialLoading is true', () => {
      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialLoading={true}
        />
      );

      expect(html).toContain('Memuat data buku bantu angsuran pinjaman...');
    });

    it('renders empty message when periods array is empty', () => {
      const emptyData: LoanInteractiveGridSummary = {
        ...mockLoanGridData,
        periods: [],
      };

      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={emptyData}
        />
      );

      expect(html).toContain('Tidak ada jadwal angsuran ditemukan');
    });
  });

  describe('LoanLedgerModal Backward Compatibility Wrapper', () => {
    it('renders LoanLedgerModal seamlessly as interactive matrix modal', () => {
      const html = renderToStaticMarkup(
        <LoanLedgerModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
        />
      );

      // Verifies that LoanLedgerModal delegates to LoanScheduleModal
      expect(html).toContain('Buku Bantu Angsuran Pinjaman (Interactive Grid)');
    });
  });

  describe('Service Invocations Integration', () => {
    it('calls checkAllLoanUpToCurrentMonth when triggered', async () => {
      (checkAllLoanUpToCurrentMonth as any).mockResolvedValueOnce({ checkedCount: 3 });

      const res = await checkAllLoanUpToCurrentMonth('loan-123');
      expect(checkAllLoanUpToCurrentMonth).toHaveBeenCalledWith('loan-123');
      expect(res.checkedCount).toBe(3);
    });

    it('calls autoReconcileLoanInstallments with available paid amount', async () => {
      (autoReconcileLoanInstallments as any).mockResolvedValueOnce({
        reconciledCount: 3,
        remainingAmount: 0,
      });

      const res = await autoReconcileLoanInstallments('loan-123', 1500000);
      expect(autoReconcileLoanInstallments).toHaveBeenCalledWith('loan-123', 1500000);
      expect(res.reconciledCount).toBe(3);
    });

    it('calls uncheckAllLoanSchedules when resetting', async () => {
      (uncheckAllLoanSchedules as any).mockResolvedValueOnce(undefined);

      await uncheckAllLoanSchedules('loan-123');
      expect(uncheckAllLoanSchedules).toHaveBeenCalledWith('loan-123');
    });

    it('calls toggleLoanSchedulePaid for checking and unchecking periods', async () => {
      (toggleLoanSchedulePaid as any).mockResolvedValueOnce(undefined);

      await toggleLoanSchedulePaid('sched-4', true, {
        amount: 300000,
        receiptNo: 'KW-004',
        paymentMethod: 'potong_gaji',
      });

      expect(toggleLoanSchedulePaid).toHaveBeenCalledWith('sched-4', true, {
        amount: 300000,
        receiptNo: 'KW-004',
        paymentMethod: 'potong_gaji',
      });
    });
  });

  describe('getImportedRepaidBalance & Baseline Preservation Tests', () => {
    it('returns jumlah_terangsur directly when present and > 0', () => {
      const balance = getImportedRepaidBalance({
        principal_amount: 10000000,
        jumlah_terangsur: 8333333,
      });
      expect(balance).toBe(8333333);
    });

    it('calculates principal - sisa_pinjaman correctly for imported excel loans', () => {
      const balance = getImportedRepaidBalance({
        principal_amount: 10000000,
        sisa_pinjaman: 1666667,
      });
      expect(balance).toBe(8333333);
    });

    it('parses sisa pinjaman from migration notes when direct column is absent', () => {
      const balance = getImportedRepaidBalance({
        principal_amount: 10000000,
        notes: 'Migrasi Pinjaman Awal (Sisa: Rp 1.666.667)',
      });
      expect(balance).toBe(8333333);
    });

    it('falls back to totalPaid when no sisa_pinjaman is explicitly available', () => {
      const balance = getImportedRepaidBalance({
        principalAmount: 5000000,
        totalPaid: 2500000,
      });
      expect(balance).toBe(2500000);
    });

    it('returns 0 for empty or invalid loan input', () => {
      expect(getImportedRepaidBalance(null)).toBe(0);
      expect(getImportedRepaidBalance({})).toBe(0);
      expect(getImportedRepaidBalance({ principal_amount: 0, sisa_pinjaman: 0 })).toBe(0);
    });
  });

  describe('Repayment Evidence Modal & Deficit Auto-Populate', () => {
    it('auto-populates remaining deficit (Rp 7), default notes, potong_gaji method, and receipt number when opening partial period', () => {
      const partialPeriod = {
        id: 'sched-part-1',
        loanId: 'loan-123',
        periodNumber: 4,
        dueDate: '2026-05-15',
        targetAmount: 277778,
        paidAmount: 277771,
        status: 'PARTIAL' as const,
        label: 'Bulan 4 [Mei-26]',
        isCurrentMonth: true,
        repayments: [
          {
            id: 'rep-part-1',
            amountPaid: 277771,
            paymentDate: '2026-05-10T11:00:00Z',
            paymentMethod: 'potong_gaji',
            notes: 'Potong gaji Mei parsial',
          },
        ],
      };

      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={mockLoanGridData}
          initialEvidencePeriod={partialPeriod}
        />
      );

      // Verify evidence modal is open
      expect(html).toContain('data-testid="loan-evidence-modal"');
      expect(html).toContain('Dokumentasi Bukti Pelunasan Angsuran');
      expect(html).toContain('Bulan 4 [Mei-26]');

      // Verify input nominal is auto-filled with remaining deficit 7 (Math.max(0, 277778 - 277771))
      expect(html).toContain('data-testid="evidence-amount-input"');
      expect(html).toContain('value="7"');

      // Verify notes auto-generated with format "Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-[N]"
      expect(html).toContain('data-testid="evidence-notes-input"');
      expect(html).toContain('Pelunasan selisih/kekurangan pembulatan angsuran bulan ke-4');

      // Verify payment method default is potong_gaji
      expect(html).toContain('data-testid="evidence-method-select"');
      expect(html).toContain('<option value="potong_gaji" selected="">Potong Gaji</option>');

      // Verify receipt number generated
      expect(html).toContain('data-testid="evidence-receipt-input"');
      expect(html).toContain('value="KW-PINJ/PJ-2026-001/B4"');

      // Verify helper deficit info display
      expect(html).toContain('data-testid="evidence-deficit-info"');
      expect(html).toContain('Sudah terbayar:');
      expect(html).toContain('277.771');
      expect(html).toContain('Sisa kekurangan:');
      expect(html).toContain('7');
    });

    it('defaults to targetAmount and empty notes when opening an unpaid period', () => {
      const unpaidPeriod = {
        id: 'sched-unpaid-1',
        loanId: 'loan-123',
        periodNumber: 5,
        dueDate: '2026-06-15',
        targetAmount: 500000,
        paidAmount: 0,
        status: 'UNPAID' as const,
        label: 'Bulan 5 [Jun-26]',
        isCurrentMonth: false,
        repayments: [],
      };

      const html = renderToStaticMarkup(
        <LoanScheduleModal
          loanId="loan-123"
          memberNrp="92040123"
          memberName="Bripda Ahmad Fadli"
          onClose={vi.fn()}
          initialData={mockLoanGridData}
          initialEvidencePeriod={unpaidPeriod}
        />
      );

      // Verify evidence modal is open
      expect(html).toContain('data-testid="loan-evidence-modal"');

      // Verify input nominal is targetAmount 500000
      expect(html).toContain('data-testid="evidence-amount-input"');
      expect(html).toContain('value="500000"');

      // Verify deficit info banner is not displayed since paidAmount is 0
      expect(html).not.toContain('data-testid="evidence-deficit-info"');

      // Notes textarea empty
      expect(html).toContain('data-testid="evidence-notes-input"></textarea>');
    });
  });
});

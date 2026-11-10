import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoanDetailModal from './LoanDetailModal';
import { loanService } from '../../services/loanService';

// Mock FeedbackContext
vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
}));

describe('LoanDetailModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders null when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={false}
        loanId="loan-asep"
        onClose={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('renders modal markup with loan header and close button when open', () => {
    const html = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={true}
        loanId="loan-asep"
        onClose={vi.fn()}
      />
    );
    expect(html).toContain('Detail Pinjaman');
    expect(html).toContain('Tutup');
  });

  it('delegates repayment to paySchedule when scheduleId is provided to makePayment', async () => {
    const payScheduleSpy = vi.spyOn(loanService, 'paySchedule').mockResolvedValueOnce({
      success: true,
      newStatus: 'paid',
      newPaidTotal: 555556,
      sisaPinjaman: 1666667,
      isAllPaid: false
    });

    // Test service delegation
    const res = await loanService.makePayment('loan-asep', 6222, 'CASH', 'Pelunasan parsial', 'sch-14');
    expect(payScheduleSpy).toHaveBeenCalledWith('loan-asep', 'sch-14', 6222, 'CASH', 'Pelunasan parsial');
    expect(res.success).toBe(true);
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoanDetailModal, { mapLoanModalStatus } from './LoanDetailModal';
import { loanService } from '../../services/loanService';
import StatusBadge from '../ui/StatusBadge';

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

  it('renders Berjalan badge (never Pending) when loan status is active, berjalan, approved, or disbursed', () => {
    for (const rawStatus of ['active', 'berjalan', 'approved', 'disbursed']) {
      expect(mapLoanModalStatus(rawStatus)).toBe('berjalan');

      const modalHtml = renderToStaticMarkup(
        <LoanDetailModal
          isOpen={true}
          loanId="loan-1795334228834"
          onClose={vi.fn()}
          initialPinjaman={{
            id: 'loan-1795334228834',
            loan_number: 'LOAN-1795334228834',
            status: rawStatus,
            principal_amount: 3450000,
            tenor: 6,
            anggota: { nama: 'Anggota Tes 2', nrp: '99999998' },
          }}
        />
      );
      expect(modalHtml).toContain('Status Pinjaman');
      expect(modalHtml).toContain('Berjalan');
      expect(modalHtml).not.toContain('>Pending<');

      const badgeHtml = renderToStaticMarkup(<StatusBadge status={rawStatus as any} />);
      expect(badgeHtml).toContain('Berjalan');
      expect(badgeHtml).not.toContain('Pending');
    }
  });

  it('maps completed/paid_off/lunas to Lunas and draft to Pending in LoanDetailModal', () => {
    expect(mapLoanModalStatus('paid_off')).toBe('lunas');
    expect(mapLoanModalStatus('completed')).toBe('lunas');
    expect(mapLoanModalStatus('draft')).toBe('pending');
    expect(mapLoanModalStatus('rejected')).toBe('rejected');

    const paidHtml = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={true}
        loanId="loan-paid"
        onClose={vi.fn()}
        initialPinjaman={{
          id: 'loan-paid',
          status: 'paid_off',
          principal_amount: 1000000,
          tenor: 2,
        }}
      />
    );
    expect(paidHtml).toContain('Lunas');
    expect(paidHtml).not.toContain('>Pending<');
  });
});

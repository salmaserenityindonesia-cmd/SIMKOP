import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoanDetailModal, {
  mapLoanModalStatus,
  resolveLoanContractStatus,
  getInstallmentPeriodStatus,
} from './LoanDetailModal';
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

  it('renders top-up compensation breakdown and contract notes on both old and new loans', () => {
    const newLoanHtml = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={true}
        loanId="loan-new-tes1"
        onClose={vi.fn()}
        initialPinjaman={{
          id: 'loan-new-tes1',
          loan_number: 'LOAN-1795422216507',
          status: 'active',
          principal_amount: 5000000,
          tenor: 10,
          topup_settlement_amount: 2000000,
          notes: '[KOMPENSASI PELUNASAN SEJENIS] Pencairan Rp 5.000.000 dipotong pelunasan LOAN-1795333396946 sebesar Rp 2.000.000 • Sisa uang diterima peminjam: Rp 3.000.000',
        }}
      />
    );
    expect(newLoanHtml).toContain('Rincian Kompensasi Pelunasan Pinjaman Lama Sejenis');
    expect(newLoanHtml).toContain('5.000.000');
    expect(newLoanHtml).toContain('2.000.000');
    expect(newLoanHtml).toContain('3.000.000');
    expect(newLoanHtml).toContain('Catatan / Keterangan Kontrak');
    expect(newLoanHtml).toContain('[KOMPENSASI PELUNASAN SEJENIS]');

    const oldLoanHtml = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={true}
        loanId="loan-old-tes1"
        onClose={vi.fn()}
        initialPinjaman={{
          id: 'loan-old-tes1',
          loan_number: 'LOAN-1795333396946',
          status: 'paid_off',
          principal_amount: 2200000,
          tenor: 11,
          notes: '[LUNAS KOMPENSASI] Dilunasi penuh s/d angsuran terakhir sebesar Rp 2.000.000 dari pencairan pinjaman baru LOAN-1795422216507',
        }}
      />
    );
    expect(oldLoanHtml).toContain('Lunas');
    expect(oldLoanHtml).toContain('[LUNAS KOMPENSASI]');
    expect(oldLoanHtml).toContain('LOAN-1795422216507');
  });

  it('displays Status Pinjaman: Berjalan (not Lunas) when contract has unpaid schedules or remaining balance despite raw paid_off/completed status', () => {
    const schedules = [
      { id: 's-1', period_number: 1, due_date: '2026-01-01', target_amount: 875000, paid_amount: 875000, status: 'paid' },
      { id: 's-2', period_number: 2, due_date: '2026-12-01', target_amount: 875000, paid_amount: 0, status: 'unpaid' },
    ];
    const loan = {
      id: 'loan-yuswan',
      loan_number: 'LOAN-YUSWAN-001',
      status: 'paid_off',
      principal_amount: 64750000,
      tenor: 74,
      sisa_pinjaman: 55125000,
      anggota: { nama: 'YUSWAN EFENDI', nrp: '83010313' },
    };

    expect(resolveLoanContractStatus(loan, schedules, 55125000)).toBe('berjalan');

    const html = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={true}
        loanId="loan-yuswan"
        onClose={vi.fn()}
        initialPinjaman={loan}
        initialSchedules={schedules}
      />
    );
    expect(html).toContain('Status Pinjaman');
    expect(html).toContain('Berjalan');
    expect(html).toContain('1 dari 2 periode terbayar');
  });

  it('renders accurate installment period statuses (Terbayar, Terbayar Sebagian, Menunggak, Belum Jatuh Tempo) in Jadwal Angsuran', () => {
    expect(
      getInstallmentPeriodStatus({ target_amount: 875000, paid_amount: 875000, status: 'paid', due_date: '2026-01-01' }, '2026-11-24').label
    ).toBe('Terbayar');
    expect(
      getInstallmentPeriodStatus({ target_amount: 875000, paid_amount: 300000, status: 'partial', due_date: '2026-02-01' }, '2026-11-24').label
    ).toBe('Terbayar Sebagian');
    expect(
      getInstallmentPeriodStatus({ target_amount: 875000, paid_amount: 0, status: 'unpaid', due_date: '2026-10-01' }, '2026-11-24').label
    ).toBe('Menunggak');
    expect(
      getInstallmentPeriodStatus({ target_amount: 875000, paid_amount: 0, status: 'unpaid', due_date: '2099-12-01' }, '2026-11-24').label
    ).toBe('Belum Jatuh Tempo');

    const html = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={true}
        loanId="loan-sched-terms"
        onClose={vi.fn()}
        initialPinjaman={{
          id: 'loan-sched-terms',
          status: 'active',
          principal_amount: 3500000,
          tenor: 4,
        }}
        initialSchedules={[
          { id: 'st-1', period_number: 1, due_date: '2026-01-01', target_amount: 875000, paid_amount: 875000, status: 'paid' },
          { id: 'st-2', period_number: 2, due_date: '2026-02-01', target_amount: 875000, paid_amount: 400000, status: 'partial' },
          { id: 'st-3', period_number: 3, due_date: '2026-03-01', target_amount: 875000, paid_amount: 0, status: 'unpaid' },
          { id: 'st-4', period_number: 4, due_date: '2099-12-01', target_amount: 875000, paid_amount: 0, status: 'unpaid' },
        ]}
      />
    );
    expect(html).toContain('Terbayar');
    expect(html).toContain('Terbayar Sebagian');
    expect(html).toContain('Menunggak');
    expect(html).toContain('Belum Jatuh Tempo');
    expect(html).not.toContain('Belum Lunas');
  });

  it('renders Buka Bukti Jurnal & Buku Pembantu button when onOpenCashFlowJournal is provided for active or paid-off loans', () => {
    const htmlActive = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={true}
        loanId="loan-journal-1"
        onClose={vi.fn()}
        onOpenCashFlowJournal={vi.fn()}
        initialPinjaman={{
          id: 'loan-journal-1',
          loan_number: 'LOAN-2026-900',
          status: 'active',
          principal_amount: 4000000,
          tenor: 4,
        }}
        initialSchedules={[]}
      />
    );
    expect(htmlActive).toContain('data-testid="btn-open-loan-journal"');
    expect(htmlActive).toContain('Buka Bukti Jurnal &amp; Buku Pembantu');

    const htmlPending = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={true}
        loanId="loan-journal-pending"
        onClose={vi.fn()}
        onOpenCashFlowJournal={vi.fn()}
        initialPinjaman={{
          id: 'loan-journal-pending',
          loan_number: 'LOAN-2026-901',
          status: 'pending',
          principal_amount: 4000000,
          tenor: 4,
        }}
        initialSchedules={[]}
      />
    );
    expect(htmlPending).not.toContain('data-testid="btn-open-loan-journal"');
  });

  it('displays accurate overpayment paid_amount, remaining balance, and proportional Pokok/Margin breakdown for LN2611-0002', () => {
    const html = renderToStaticMarkup(
      <LoanDetailModal
        isOpen={true}
        loanId="loan-ln2611"
        onClose={vi.fn()}
        initialPinjaman={{
          id: 'loan-ln2611',
          loan_number: 'LN2611-0002',
          status: 'active',
          principal_amount: 2020000,
          amount: 2020000,
          cost_price: 2000000,
          markup_amount: 20000,
          tenor: 3,
          sisa_pinjaman: 1020000,
          item_description: 'Kulkas',
        }}
        initialSchedules={[
          {
            id: 'sch-1',
            period_number: 1,
            due_date: '2026-12-24',
            target_amount: 673334,
            principal_portion: 666667,
            margin_portion: 6667,
            paid_amount: 1000000,
            status: 'paid',
          },
          {
            id: 'sch-2',
            period_number: 2,
            due_date: '2027-01-24',
            target_amount: 673334,
            principal_portion: 666667,
            margin_portion: 6667,
            paid_amount: 0,
            status: 'unpaid',
          },
          {
            id: 'sch-3',
            period_number: 3,
            due_date: '2027-02-24',
            target_amount: 346666,
            principal_portion: 666666,
            margin_portion: 6666,
            paid_amount: 0,
            status: 'unpaid',
          },
        ]}
      />
    );

    expect(html).toContain('Rp 1.020.000');
    expect(html).toContain('Rp 1.000.000');
    expect(html).toContain('Rp 346.666');
    expect(html).toContain('Pokok Rp 343.234 + Margin Rp 3.432');
  });
});

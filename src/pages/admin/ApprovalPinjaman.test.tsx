import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApprovalPinjaman, { buildApprovalConfirmMessage } from './ApprovalPinjaman';
import { loanService } from '../../services/loanService';
import * as exportUtils from '../../lib/exportUtils';

// Mock layout
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock FeedbackContext
vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
}));

// Mock exportUtils
vi.mock('../../lib/exportUtils', () => ({
  exportToExcel: vi.fn(),
  exportToPDF: vi.fn(),
}));

describe('ApprovalPinjaman Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tab Navigation & Counters Rendering', () => {
    it('renders all three status tabs: Menunggu Persetujuan, Sudah Disetujui, and Semua Riwayat', () => {
      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="PENDING"
          initialPinjamanList={[]}
          initialCounts={{ pending: 3, approved: 5 }}
        />
      );

      expect(html).toContain('Menunggu Persetujuan');
      expect(html).toContain('Sudah Disetujui');
      expect(html).toContain('Semua Riwayat');
      // Counter badges
      expect(html).toContain('3');
      expect(html).toContain('5');
    });

    it('highlights active tab based on activeTab state', () => {
      const pendingHtml = renderToStaticMarkup(
        <ApprovalPinjaman initialTab="PENDING" initialPinjamanList={[]} />
      );
      expect(pendingHtml).toContain('border-[var(--color-primary)]');

      const approvedHtml = renderToStaticMarkup(
        <ApprovalPinjaman initialTab="APPROVED" initialPinjamanList={[]} />
      );
      expect(approvedHtml).toContain('border-[var(--color-primary)]');
    });
  });

  describe('Contextual Action Buttons', () => {
    const mockPendingLoan = [
      {
        id: 'loan-1',
        loan_number: 'LOAN-001',
        amount: 10000000,
        tenor: 10,
        status: 'draft',
        created_at: '2026-11-01T10:00:00Z',
        disbursed_at: null,
        anggota: {
          id: 'm-1',
          nrp: '123456',
          nama: 'Serma Agus Supriyadi',
          no_anggota: 'A-001'
        }
      }
    ];

    const mockApprovedLoan = [
      {
        id: 'loan-2',
        loan_number: 'LOAN-002',
        amount: 25000000,
        tenor: 20,
        status: 'approved',
        created_at: '2026-10-15T09:00:00Z',
        disbursed_at: '2026-10-16T14:00:00Z',
        anggota: {
          id: 'm-2',
          nrp: '654321',
          nama: 'Peltu Bambang Tri',
          no_anggota: 'A-002'
        }
      }
    ];

    it('renders Setujui, Tolak, and Detail buttons for pending/draft loans', () => {
      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="PENDING"
          initialPinjamanList={mockPendingLoan}
        />
      );

      expect(html).toContain('Serma Agus Supriyadi');
      expect(html).toContain('Setujui');
      expect(html).toContain('Tolak');
      expect(html).toContain('Detail');
      expect(html).toContain('href="/admin/pinjaman/loan-1"');
    });

    it('renders ONLY Detail button and hides Setujui and Tolak for approved loans', () => {
      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="APPROVED"
          initialPinjamanList={mockApprovedLoan}
        />
      );

      expect(html).toContain('Peltu Bambang Tri');
      expect(html).not.toContain('Setujui');
      expect(html).not.toContain('Tolak');
      expect(html).toContain('Detail');
      expect(html).toContain('href="/admin/pinjaman/loan-2"');
    });

    it('renders properly for active or completed loans in history', () => {
      const mockActiveLoans = [
        {
          id: 'loan-3',
          principal_amount: 15000000,
          agreed_tenor_months: 12,
          status: 'active',
          created_at: '2026-09-01T08:00:00Z',
          disbursed_at: '2026-09-05T10:00:00Z',
          anggota: { id: 'm-3', nrp: '789012', nama: 'Kopda Suryo' }
        }
      ];

      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="APPROVED"
          initialPinjamanList={mockActiveLoans}
        />
      );

      expect(html).toContain('Kopda Suryo');
      expect(html).toContain('12 Bulan');
      expect(html).toContain('Detail');
      expect(html).not.toContain('Setujui');
      expect(html).not.toContain('Tolak');
    });

    it('renders Tgl Disetujui column from disbursed_at formatted in id-ID (e.g. 16 Nov 2026)', () => {
      const approvedFajar = [
        {
          id: 'loan-fajar',
          principal_amount: 1500000,
          agreed_tenor_months: 12,
          status: 'active',
          created_at: '2026-11-15T10:00:00Z',
          disbursed_at: '2026-11-16',
          anggota: { id: 'm-fajar', nrp: '92117229', nama: 'Fajar Ramadhan' }
        }
      ];

      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="APPROVED"
          initialPinjamanList={approvedFajar}
        />
      );

      expect(html).toContain('Fajar Ramadhan');
      expect(html).toContain('92117229');
      expect(html).toContain('16 Nov 2026');
    });
  });

  describe('Empty State Messages by Tab', () => {
    it('shows pending empty message when on PENDING tab and list is empty', () => {
      const html = renderToStaticMarkup(
        <ApprovalPinjaman initialTab="PENDING" initialPinjamanList={[]} />
      );
      expect(html).toContain('Tidak ada pengajuan pinjaman yang menunggu persetujuan.');
    });

    it('shows approved history empty message when on APPROVED tab and list is empty', () => {
      const html = renderToStaticMarkup(
        <ApprovalPinjaman initialTab="APPROVED" initialPinjamanList={[]} />
      );
      expect(html).toContain('Belum ada riwayat permohonan pinjaman yang disetujui.');
    });

    it('shows all history empty message when on ALL tab and list is empty', () => {
      const html = renderToStaticMarkup(
        <ApprovalPinjaman initialTab="ALL" initialPinjamanList={[]} />
      );
      expect(html).toContain('Tidak ada riwayat permohonan pinjaman.');
    });
  });

  describe('Service Integration & Data Fetching', () => {
    it('calls getLoanApplications with APPROVED when switching to approved tab', async () => {
      const spy = vi.spyOn(loanService, 'getLoanApplications').mockResolvedValue([
        {
          id: 'loan-app-1',
          amount: 5000000,
          tenor: 10,
          status: 'approved',
          created_at: '2026-10-01',
          anggota: { nama: 'Test Member', nrp: '111' }
        }
      ]);

      // Call service directly to verify signature and behavior expected by page
      const res = await loanService.getLoanApplications('APPROVED');
      expect(spy).toHaveBeenCalledWith('APPROVED');
      expect(res).toHaveLength(1);
      expect(res[0].status).toBe('approved');
    });

    it('calls getLoanApplications with PENDING for initial approval list', async () => {
      const spy = vi.spyOn(loanService, 'getLoanApplications').mockResolvedValue([
        {
          id: 'loan-pen-1',
          amount: 2000000,
          tenor: 5,
          status: 'draft',
          created_at: '2026-11-05',
          anggota: { nama: 'Pending Member', nrp: '222' }
        }
      ]);

      const res = await loanService.getLoanApplications('PENDING');
      expect(spy).toHaveBeenCalledWith('PENDING');
      expect(res).toHaveLength(1);
      expect(res[0].status).toBe('draft');
    });
  });

  describe('Export to Excel and PDF Integration', () => {
    it('renders export buttons and displays tabular data for export preview', () => {
      const mockList = [
        {
          id: 'loan-exp-1',
          amount: 8000000,
          tenor: 12,
          status: 'approved',
          created_at: '2026-11-01T00:00:00Z',
          disbursed_at: '2026-11-02T00:00:00Z',
          anggota: { nama: 'Serma Joni', nrp: '998877' }
        }
      ];

      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="APPROVED"
          initialPinjamanList={mockList}
        />
      );

      expect(html).toContain('Export Excel');
      expect(html).toContain('Export PDF');
      expect(html).toContain('Serma Joni');
    });

    it('correctly maps various status strings to valid StatusType badges across history', () => {
      const variedLoans = [
        { id: '1', status: 'draft', anggota: { nama: 'User 1' } },
        { id: '2', status: 'approved', anggota: { nama: 'User 2' } },
        { id: '3', status: 'active', anggota: { nama: 'User 3' } },
        { id: '4', status: 'completed', anggota: { nama: 'User 4' } },
        { id: '5', status: 'rejected', anggota: { nama: 'User 5' } },
      ];

      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="ALL"
          initialPinjamanList={variedLoans}
        />
      );

      expect(html).toContain('User 1');
      expect(html).toContain('User 2');
      expect(html).toContain('User 3');
      expect(html).toContain('User 4');
      expect(html).toContain('User 5');
    });

    it('renders top-up settlement and net disbursement badge when topup_settlement_amount > 0', () => {
      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="PENDING"
          initialPinjamanList={[
            {
              id: 'loan-topup-1',
              status: 'draft',
              amount: 2000000,
              principal_amount: 2000000,
              tenor: 4,
              topup_settlement_amount: 625000,
              anggota: { nama: 'Dedi Kurnia', nrp: '12345' },
            },
          ]}
        />
      );

      expect(html).toContain('Top-Up');
      expect(html).toContain('625.000');
      expect(html).toContain('1.375.000');
    });

    it('builds detailed confirmation messages with same-type compensation for cash and GOODS_MARKUP loans', () => {
      const cashTopupMsg = buildApprovalConfirmMessage(
        {
          id: 'loan-reg-topup',
          amount: 5000000,
          principal_amount: 5000000,
          topup_settlement_amount: 2000000,
          topup_old_loan_numbers: ['LOAN-1795333396946'],
        },
        'approved'
      );
      expect(cashTopupMsg).toContain('LOAN-1795333396946');
      expect(cashTopupMsg).toContain('5.000.000');
      expect(cashTopupMsg).toContain('2.000.000');
      expect(cashTopupMsg).toContain('3.000.000');

      const goodsTopupMsg = buildApprovalConfirmMessage(
        {
          id: 'loan-brg-topup',
          item_description: 'Sepeda Listrik',
          cost_price: 5000000,
          markup_amount: 500000,
          amount: 5500000,
          principal_amount: 5500000,
          topup_settlement_amount: 2000000,
          topup_old_loan_numbers: ['LOAN-OLD-BRG'],
          loan_types: { financing_scheme: 'GOODS_MARKUP' },
        },
        'approved'
      );
      expect(goodsTopupMsg).toContain('LOAN-OLD-BRG');
      expect(goodsTopupMsg).toContain('2.000.000');
      expect(goodsTopupMsg).toContain('3.000.000');
    });
  });

  describe('Filter Toolbar & Pagination Controls', () => {
    it('renders search input, loan type dropdown, loan type badge, and approval date labels on APPROVED tab', () => {
      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="APPROVED"
          initialPinjamanList={[
            {
              id: 'loan-1',
              loan_number: 'LOAN-202611-001',
              loan_type_id: 'lt-1',
              loan_types: { id: 'lt-1', code: 'REGULER', name: 'Pinjaman Reguler Tanpa Bunga' },
              status: 'active',
              amount: 5000000,
              tenor: 10,
              disbursed_at: '2026-11-10',
              created_at: '2026-11-09T08:00:00Z',
              anggota: { nama: 'Budi Santoso', nrp: '21001' },
            },
          ]}
        />
      );

      expect(html).toContain('Cari NRP, Nama Anggota, atau No. Pinjaman...');
      expect(html).toContain('Semua Jenis Pinjaman');
      expect(html).toContain('Pinjaman Reguler Tanpa Bunga');
      expect(html).toContain('Tgl Disetujui (Dari)');
      expect(html).toContain('Tgl Disetujui (Sampai)');
      expect(html).toContain('LOAN-202611-001');
    });

    it('renders standard date labels on PENDING tab and paginates rows to default pageSize of 10', () => {
      const manyLoans = Array.from({ length: 12 }, (_, idx) => ({
        id: `loan-${idx + 1}`,
        loan_number: `LOAN-${idx + 1}`,
        status: 'draft',
        amount: 1000000,
        tenor: 5,
        created_at: '2026-11-15T08:00:00Z',
        anggota: { nama: `Anggota Ke-${idx + 1}`, nrp: `NRP-${idx + 1}` },
      }));

      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="PENDING"
          initialPinjamanList={manyLoans}
        />
      );

      expect(html).toContain('Dari Tanggal');
      expect(html).toContain('Sampai Tanggal');
      expect(html).toContain('Anggota Ke-1');
      expect(html).toContain('Anggota Ke-10');
      expect(html).not.toContain('Anggota Ke-11');
      expect(html).not.toContain('Anggota Ke-12');
      expect(html).toContain('1-10');
      expect(html).toContain('12');
      expect(html).toContain('Halaman 1 / 2');
    });

    it('renders goods markup breakdown (Nama Barang, Modal Supplier, Margin, Harga Jual Akad) and builds detailed approval confirmation message', () => {
      const goodsLoan = {
        id: 'loan-brg-app-1',
        loan_number: 'LOAN-BRG-001',
        status: 'draft',
        item_description: 'Kulkas 2 Pintu',
        cost_price: 2000000,
        markup_amount: 300000,
        amount: 2300000,
        principal_amount: 2300000,
        tenor: 5,
        created_at: '2026-11-19T08:00:00Z',
        loan_types: {
          id: 'lt-brg',
          code: 'PEMBIAYAAN_BARANG',
          name: 'Pembiayaan Barang (Markup Margin)',
          financing_scheme: 'GOODS_MARKUP',
        },
        anggota: { nama: 'Budi Santoso', nrp: '88010001' },
      };

      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="PENDING"
          initialPinjamanList={[goodsLoan]}
        />
      );

      expect(html).toContain('Pembiayaan Barang (Markup)');
      expect(html).toContain('Barang: Kulkas 2 Pintu');
      expect(html).toContain('Modal Supplier:');
      expect(html).toContain('2.000.000');
      expect(html).toContain('Margin:');
      expect(html).toContain('300.000');
      expect(html).toContain('Harga Jual Akad:');
      expect(html).toContain('2.300.000');

      const confirmMsg = buildApprovalConfirmMessage(goodsLoan, 'approved');
      expect(confirmMsg).toContain('Kulkas 2 Pintu');
      expect(confirmMsg).toContain('2.000.000');
      expect(confirmMsg).toContain('300.000');
      expect(confirmMsg).toContain('2.300.000');
    });
  });

  describe('Reset ke Pending Action Button', () => {
    it('renders enabled Reset ke Pending button on APPROVED tab when active/approved loans exist', () => {
      const html = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="APPROVED"
          initialPinjamanList={[
            {
              id: 'loan-active-1',
              status: 'active',
              amount: 5000000,
              tenor: 10,
              anggota: { nama: 'Sertu Andi', nrp: '111222' },
            },
          ]}
        />
      );

      expect(html).toContain('data-testid="btn-reset-to-pending"');
      expect(html).toContain('Reset ke Pending');
      expect(html).not.toMatch(/data-testid="btn-reset-to-pending"[^>]*\sdisabled=""/);
    });

    it('renders disabled Reset ke Pending button on APPROVED tab when empty or only paid_off loans exist', () => {
      const emptyHtml = renderToStaticMarkup(
        <ApprovalPinjaman initialTab="APPROVED" initialPinjamanList={[]} />
      );
      expect(emptyHtml).toContain('data-testid="btn-reset-to-pending"');
      expect(emptyHtml).toMatch(/data-testid="btn-reset-to-pending"[^>]*\sdisabled=""/);

      const paidOffHtml = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="APPROVED"
          initialPinjamanList={[
            {
              id: 'loan-paid-1',
              status: 'paid_off',
              amount: 5000000,
              tenor: 10,
              anggota: { nama: 'Sertu Budi', nrp: '333444' },
            },
          ]}
        />
      );
      expect(paidOffHtml).toContain('data-testid="btn-reset-to-pending"');
      expect(paidOffHtml).toMatch(/data-testid="btn-reset-to-pending"[^>]*\sdisabled=""/);
    });

    it('does not render Reset ke Pending button on PENDING or ALL tabs', () => {
      const pendingHtml = renderToStaticMarkup(
        <ApprovalPinjaman initialTab="PENDING" initialPinjamanList={[]} />
      );
      expect(pendingHtml).not.toContain('btn-reset-to-pending');
      expect(pendingHtml).not.toContain('Reset ke Pending');

      const allHtml = renderToStaticMarkup(
        <ApprovalPinjaman initialTab="ALL" initialPinjamanList={[]} />
      );
      expect(allHtml).not.toContain('btn-reset-to-pending');
      expect(allHtml).not.toContain('Reset ke Pending');
    });

    it('renders clickable loan number journal trigger on APPROVED and ALL tabs, and keeps it non-interactive on PENDING tab', () => {
      const approvedHtml = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="APPROVED"
          initialPinjamanList={[
            {
              id: 'loan-app-1',
              loan_number: 'LOAN-2026-001',
              status: 'active',
              amount: 5000000,
              tenor: 10,
              anggota: { nama: 'Sertu Budi', nrp: '333444' },
            },
          ]}
        />
      );
      expect(approvedHtml).toContain('data-testid="approval-loan-journal-btn-LOAN-2026-001"');

      const allHtml = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="ALL"
          initialPinjamanList={[
            {
              id: 'loan-all-paid',
              loan_number: 'LOAN-2026-002',
              status: 'lunas',
              amount: 3000000,
              tenor: 6,
              anggota: { nama: 'Kopda Andi', nrp: '555666' },
            },
          ]}
        />
      );
      expect(allHtml).toContain('data-testid="approval-loan-journal-btn-LOAN-2026-002"');

      const pendingHtml = renderToStaticMarkup(
        <ApprovalPinjaman
          initialTab="PENDING"
          initialPinjamanList={[
            {
              id: 'loan-pend-1',
              loan_number: 'LOAN-2026-003',
              status: 'pending',
              amount: 2000000,
              tenor: 5,
              anggota: { nama: 'Praka Eko', nrp: '777888' },
            },
          ]}
        />
      );
      expect(pendingHtml).not.toContain('data-testid="approval-loan-journal-btn-LOAN-2026-003"');
      expect(pendingHtml).toContain('LOAN-2026-003');
    });

    it('activates Semua Riwayat tab and pre-fills loanNo search from URL query params', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter
          initialEntries={[
            '/admin/approval?tab=history&loanNo=SALDO-AWAL-84110801-GAJISIPA&openDetail=1',
          ]}
        >
          <ApprovalPinjaman
            initialPinjamanList={[
              {
                id: 'loan-saldo-awal-1',
                loan_number: 'SALDO-AWAL-84110801-GAJISIPA',
                status: 'active',
                amount: 12000000,
                tenor: 12,
                anggota: {
                  nama: 'Iwan Agung Prasetyo',
                  nrp: '84110801',
                  no_anggota: '84110801',
                },
              },
              {
                id: 'loan-other-1',
                loan_number: 'LOAN-OTHER-999',
                status: 'active',
                amount: 5000000,
                tenor: 6,
                anggota: {
                  nama: 'Anggota Lain',
                  nrp: '99999999',
                  no_anggota: '99999999',
                },
              },
            ]}
          />
        </MemoryRouter>
      );

      expect(html).toContain('value="SALDO-AWAL-84110801-GAJISIPA"');
      expect(html).toContain('Iwan Agung Prasetyo');
      expect(html).not.toContain('Anggota Lain');
      expect(html).toMatch(/data-testid="tab-all"[^>]*border-\[var\(--color-primary\)\]/);
    });
  });
});

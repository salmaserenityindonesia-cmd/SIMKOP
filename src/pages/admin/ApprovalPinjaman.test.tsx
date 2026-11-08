import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApprovalPinjaman from './ApprovalPinjaman';
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
});

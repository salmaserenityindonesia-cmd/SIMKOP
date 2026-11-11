import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LaporanKeuangan from './index';
import LaporanKeuanganReexport from '../LaporanKeuangan';
import * as cashFlowService from '../../../services/cashFlowService';

// Mock AdminLayout
vi.mock('../../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock FeedbackContext
vi.mock('../../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
}));

// Mock Supabase
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'admin-test-user-id' } },
      }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: {
        success: true,
        message: 'Seluruh transaksi kas keuangan berhasil di-reset.',
      },
      error: null,
    }),
  },
}));

describe('LaporanKeuangan Page Component & Reset Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-exports default component from src/pages/admin/LaporanKeuangan.tsx', () => {
    expect(LaporanKeuanganReexport).toBeDefined();
    expect(LaporanKeuanganReexport).toBe(LaporanKeuangan);
  });

  it('renders "Reset Transaksi Kas" button on the action toolbar', () => {
    const html = renderToStaticMarkup(<LaporanKeuangan />);

    expect(html).toContain('Reset Transaksi Kas');
    expect(html).toContain('history_toggle_off');
    expect(html).toContain('Download PDF');
    expect(html).toContain('Export Excel');
  });

  it('renders danger confirmation modal when isResetModalOpen is true', () => {
    const html = renderToStaticMarkup(
      <LaporanKeuangan initialResetModalOpen={true} />
    );

    // Modal Title and Badges
    expect(html).toContain('Reset Transaksi Kas Keuangan');
    expect(html).toContain('Aksi Destruktif');
    expect(html).toContain('Tindakan ini permanen');

    // Affected tables explanation
    expect(html).toContain('cash_flow');
    expect(html).toContain('sales');
    expect(html).toContain('sale_items');
    expect(html).toContain('cashier_shifts');
    expect(html).toContain('deposit_transactions');
    expect(html).toContain('Saldo kas brankas berjalan akan kembali ke');

    // Master data security guarantee
    expect(html).toContain('Penegasan Keamanan Data Master:');
    expect(html).toContain('Master produk, harga modal (HPP), dan simpanan pokok anggota tetap aman');

    // Verification keyword prompt
    expect(html).toContain('RESET KAS KEUANGAN');
    expect(html).toContain('Konfirmasi Reset');
  });

  it('disables submit button when verification keyword does not match', () => {
    const html = renderToStaticMarkup(
      <LaporanKeuangan initialResetModalOpen={true} initialConfirmText="RESET SALAH" />
    );

    // Button should be disabled
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Konfirmasi Reset/);
  });

  it('enables submit button when verification keyword matches "RESET KAS KEUANGAN"', () => {
    const html = renderToStaticMarkup(
      <LaporanKeuangan initialResetModalOpen={true} initialConfirmText="RESET KAS KEUANGAN" />
    );

    // Button should NOT have disabled attribute
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Konfirmasi Reset/);
    expect(html).toContain('Konfirmasi Reset');
  });
});

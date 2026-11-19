import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LaporanKeuangan, { KategoriBadge, getCashFlowReport, getShuEstimation } from './index';
import LaporanKeuanganReexport from '../LaporanKeuangan';
import * as cashFlowService from '../../../services/cashFlowService';
import { supabase } from '../../../lib/supabaseClient';

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
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*?Konfirmasi Reset/);
  });

  it('enables submit button when verification keyword matches "RESET KAS KEUANGAN"', () => {
    const html = renderToStaticMarkup(
      <LaporanKeuangan initialResetModalOpen={true} initialConfirmText="RESET KAS KEUANGAN" />
    );

    // Button should NOT have disabled attribute
    expect(html).not.toMatch(/<button type="submit"[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*?Konfirmasi Reset/);
    expect(html).toContain('Konfirmasi Reset');
  });

  it('renders pagination controls (10/25/50/100 rows, Prev/Next) for Mutasi Arus Kas Terperinci', () => {
    const html = renderToStaticMarkup(<LaporanKeuangan />);

    expect(html).toContain('Mutasi Arus Kas Terperinci');
    expect(html).toContain('Menampilkan');
    expect(html).toContain('10 / halaman');
    expect(html).toContain('25 / halaman');
    expect(html).toContain('50 / halaman');
    expect(html).toContain('100 / halaman');
    expect(html).toContain('Prev');
    expect(html).toContain('Next');
    expect(html).toContain('Halaman 1 / 1');
  });

  it('renders SALDO_AWAL_SIMPANAN category badge cleanly as "Saldo Awal Simpanan (Cut-Off)" with indigo styling', () => {
    const html = renderToStaticMarkup(<KategoriBadge kategori="SALDO_AWAL_SIMPANAN" />);

    expect(html).toContain('Saldo Awal Simpanan (Cut-Off)');
    expect(html).toContain('bg-indigo-50');
    expect(html).toContain('text-indigo-700');
    expect(html).toContain('border-indigo-200');
  });

  it('getCashFlowReport syncs opening savings and maps SALDO_AWAL_SIMPANAN to inflowTotal with default description', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'tx-open-1',
                  member_deposit_id: 'md-1',
                  transaction_type: 'deposit',
                  amount: 1250000,
                  for_year: 2026,
                  for_month: 2,
                  description: 'Saldo Awal Cut-Off (s/d Feb 2026)',
                  created_at: '2026-03-01T00:00:00.000Z',
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'member_deposits') {
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        }
        if (table === 'cash_flow') {
          const cfRows = [
            {
              id: 'cf-open-1111',
              created_at: '2026-03-01T00:00:00.000Z',
              category: 'SALDO_AWAL_SIMPANAN',
              direction: 'in',
              amount: 1250000,
            },
          ];
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return {
                  eq: vi.fn().mockResolvedValue({ data: cfRows, error: null }),
                };
              }
              return {
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: cfRows, error: null }),
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    gt: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const report = await getCashFlowReport('2026-01-01', '2026-03-18', 'all');
      expect(report.inflowTotal).toBe(1250000);
      expect(report.outflowTotal).toBe(0);
      expect(report.netCashflow).toBe(1250000);
      expect(report.transactions).toHaveLength(1);
      expect(report.transactions[0]).toMatchObject({
        kategori: 'SALDO_AWAL_SIMPANAN',
        kas_masuk: 1250000,
        deskripsi: 'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)',
      });
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('getShuEstimation excludes SALDO_AWAL_SIMPANAN and deposit_transactions so SHU remains Rp 0 when sales are empty', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    const queriedTables: string[] = [];
    try {
      (supabase.from as any).mockImplementation((table: string) => {
        queriedTables.push(table);
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({
                      // Simulasikan apabila backend/mock mengembalikan baris SALDO_AWAL_SIMPANAN bersama hasil
                      data: [
                        { amount: 50000000, category: 'SALDO_AWAL_SIMPANAN', direction: 'in' },
                        { amount: 2500000, category: 'SETORAN_ANGGOTA', direction: 'in' },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const shu = await getShuEstimation('2026-01-01', '2026-11-19');

      expect(queriedTables).not.toContain('deposit_transactions');
      expect(shu).toEqual({
        grossSales: 0,
        cogs: 0,
        grossProfit: 0,
        opex: 0,
        estimatedShu: 0,
        marginPercentage: 0,
        marginPerKategori: [],
      });
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });
});

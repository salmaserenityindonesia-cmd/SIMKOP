import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LaporanKeuangan, {
  KategoriBadge,
  getCashFlowReport,
  getShuEstimation,
  extractReceiptPeriodNumber,
  getHighlightedShuRowIds,
  getHighlightedCashFlowRowIds,
  buildCashFlowCategoryOptions,
  filterCashFlowTransactions,
  sortCashFlowTransactionsByDate,
  buildCashFlowExportSheetRows,
  getNormalizedCategoryLabel,
  buildStartDateBoundaryIso,
  formatDateDdMmYyyy,
  computeOpeningBalanceFromRows,
  type CashFlowTransaction,
} from './index';
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
              reference_id: 'ref-opening-01',
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
        reference_id: 'ref-opening-01',
        direction: 'in',
        created_at: '2026-03-01T00:00:00.000Z',
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
        goodsFinancingMargin: 0,
        opex: 0,
        estimatedShu: 0,
        marginPercentage: 0,
        marginPerKategori: [],
        shuReferenceRows: [],
      });
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('renders CashFlowReferenceModal when initialSelectedCashFlowRef is provided', () => {
    const html = renderToStaticMarkup(
      <LaporanKeuangan
        initialSelectedCashFlowRef={{
          id: 'b27310a3-0000-0000-0000-000000000001',
          tanggal: '1/3/2026',
          referensi: 'CF-B27310A3',
          deskripsi: 'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)',
          kategori: 'SALDO_AWAL_SIMPANAN',
          unit_usaha: 'Umum',
          kas_masuk: 26840000,
          kas_keluar: 0,
          saldo_berjalan: 26840000,
          reference_id: null,
          direction: 'in',
          created_at: '2026-03-01T00:00:00.000Z',
        }}
      />
    );

    expect(html).toContain('Bukti Jurnal &amp; Buku Pembantu Referensi');
    expect(html).toContain('CF-B27310A3');
  });

  it('renders PENARIKAN_SIMPANAN and Penarikan Simpanan badges cleanly with rose styling', () => {
    const htmlUpper = renderToStaticMarkup(<KategoriBadge kategori="PENARIKAN_SIMPANAN" />);
    const htmlTitle = renderToStaticMarkup(<KategoriBadge kategori="Penarikan Simpanan" />);

    expect(htmlUpper).toContain('Penarikan Simpanan');
    expect(htmlUpper).toContain('bg-rose-50');
    expect(htmlUpper).toContain('text-rose-800');
    expect(htmlTitle).toContain('Penarikan Simpanan');
    expect(htmlTitle).toContain('bg-rose-50');
  });

  it('getCashFlowReport dynamically enriches legacy dash/null descriptions for withdrawal rows', async () => {
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
        if (table === 'cash_flow') {
          const cfRows = [
            {
              id: 'cf-wd-ind-1',
              created_at: '2026-03-10T09:00:00.000Z',
              category: 'penarikan_simpanan',
              direction: 'out',
              amount: 500000,
              description: '-',
              reference_id: 'tx-wd-1',
            },
            {
              id: 'cf-wd-bulk-1',
              created_at: '2026-03-20T10:00:00.000Z',
              category: 'penarikan_simpanan',
              direction: 'out',
              amount: 12000000,
              description: null,
              reference_id: 'cycle-thr-1',
            },
          ];
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return {
                  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
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
        if (table === 'lebaran_disbursement_cycles') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'cycle-thr-1',
                    cycle_name: 'THR Idul Fitri 2026',
                    total_members: 10,
                    total_amount: 12000000,
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockImplementation(() => ({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'tx-wd-1',
                    member_deposit_id: 'md-1',
                    transaction_type: 'withdrawal',
                    amount: 500000,
                    description: 'Penarikan Simpanan Wajib',
                    created_at: '2026-03-10T09:00:00.000Z',
                  },
                ],
                error: null,
              }),
            })),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockImplementation(() => ({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'md-1', member_id: 'mem-1', deposit_type_id: 'dt-wajib' }],
                error: null,
              }),
            })),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'mem-1', nrp: '88010001', nama: 'Budi Santoso' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'dt-wajib', code: 'SW', name: 'Simpanan Wajib' }],
                error: null,
              }),
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

      const report = await getCashFlowReport('2026-03-01', '2026-03-31', 'all');
      expect(report.outflowTotal).toBe(12500000);
      expect(report.transactions).toHaveLength(2);
      expect(report.transactions[0].deskripsi).toBe(
        'Pencairan Simpanan Wajib — 88010001 - Budi Santoso (Rp 500.000)'
      );
      expect(report.transactions[1].deskripsi).toBe(
        'Pencairan Massal Simpanan Lebaran (THR Idul Fitri 2026) — 10 Anggota (Rp 12.000.000)'
      );
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('getCashFlowReport consolidates split bulk Lebaran rows before loading cash_flow so 4 split rows appear as 1 aggregated CF-... row of Rp 10.800.000', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cfRows: any[] = [
        {
          id: 'cf-nov-1111',
          created_at: '2026-11-19T02:00:00.000Z',
          category: 'penarikan_simpanan',
          direction: 'out',
          amount: 2400000,
          description: null,
          reference_id: 'tx-nov-1',
        },
        {
          id: 'cf-nov-2222',
          created_at: '2026-11-19T02:00:01.000Z',
          category: 'penarikan_simpanan',
          direction: 'out',
          amount: 2400000,
          description: null,
          reference_id: 'tx-nov-2',
        },
        {
          id: 'cf-nov-3333',
          created_at: '2026-11-19T02:00:02.000Z',
          category: 'penarikan_simpanan',
          direction: 'out',
          amount: 2400000,
          description: null,
          reference_id: 'tx-nov-3',
        },
        {
          id: 'cf-nov-4444',
          created_at: '2026-11-19T02:00:03.000Z',
          category: 'penarikan_simpanan',
          direction: 'out',
          amount: 3600000,
          description: null,
          reference_id: 'tx-nov-4',
        },
      ];

      const cycleRow = {
        id: 'cycle-nov-2026',
        cycle_name: 'Pencairan THR Idul Fitri 2026',
        disbursement_date: '2026-11-19',
        source_type: 'MASSAL',
        total_members: 4,
        total_amount: 10800000,
        status: 'COMPLETED',
      };

      const txRows = [
        { id: 'tx-nov-1', transaction_type: 'withdrawal', amount: 2400000, description: 'Pencairan Massal Simpanan Lebaran - Pencairan THR Idul Fitri 2026', reference_no: 'KW-THR-2026-01', transaction_date: '2026-11-19' },
        { id: 'tx-nov-2', transaction_type: 'withdrawal', amount: 2400000, description: 'Pencairan Massal Simpanan Lebaran - Pencairan THR Idul Fitri 2026', reference_no: 'KW-THR-2026-02', transaction_date: '2026-11-19' },
        { id: 'tx-nov-3', transaction_type: 'withdrawal', amount: 2400000, description: 'Pencairan Massal Simpanan Lebaran - Pencairan THR Idul Fitri 2026', reference_no: 'KW-THR-2026-03', transaction_date: '2026-11-19' },
        { id: 'tx-nov-4', transaction_type: 'withdrawal', amount: 3600000, description: 'Pencairan Massal Simpanan Lebaran - Pencairan THR Idul Fitri 2026', reference_no: 'KW-THR-2026-04', transaction_date: '2026-11-19' },
      ];

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
            select: vi.fn().mockImplementation(() => ({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
              in: vi.fn(async (_col: string, ids: string[]) => ({
                data: txRows.filter((tx) => ids.includes(tx.id)),
                error: null,
              })),
            })),
          };
        }
        if (table === 'member_deposits') {
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        }
        if (table === 'lebaran_disbursement_cycles') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: [cycleRow], error: null }),
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return {
                  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                };
              }
              return {
                range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                  data: cfRows.slice(from, to + 1),
                  error: null,
                })),
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockImplementation(async () => ({
                      data: [...cfRows],
                      error: null,
                    })),
                  }),
                }),
              };
            }),
            update: vi.fn((payload: any) => ({
              eq: vi.fn(async (_col: string, id: string) => {
                const idx = cfRows.findIndex((r) => r.id === id);
                if (idx >= 0) cfRows[idx] = { ...cfRows[idx], ...payload };
                return { data: null, error: null };
              }),
            })),
            delete: vi.fn(() => ({
              in: vi.fn(async (_col: string, ids: string[]) => {
                for (const id of ids) {
                  const idx = cfRows.findIndex((r) => r.id === id);
                  if (idx >= 0) cfRows.splice(idx, 1);
                }
                return { data: null, error: null };
              }),
            })),
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

      const report = await getCashFlowReport('2026-11-01', '2026-11-30', 'all');
      expect(report.outflowTotal).toBe(10800000);
      expect(report.transactions).toHaveLength(1);
      expect(report.transactions[0]).toMatchObject({
        referensi: 'CF-CF-NOV-1',
        kas_keluar: 10800000,
        reference_id: 'cycle-nov-2026',
        deskripsi:
          'Pencairan Massal Simpanan Lebaran (Pencairan THR Idul Fitri 2026) — 4 Anggota (Rp 10.800.000)',
      });
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('renders Setoran Simpanan badge cleanly with emerald styling', () => {
    const html = renderToStaticMarkup(<KategoriBadge kategori="Setoran Simpanan" />);

    expect(html).toContain('Setoran Simpanan');
    expect(html).toContain('bg-emerald-50');
    expect(html).toContain('text-emerald-700');
    expect(html).toContain('border-emerald-200');
  });

  it('getCashFlowReport calls syncMatrixDepositsToCashFlow so checked matrix deposits like KW-2026/03/00050543 appear in Mutasi Arus Kas and inflowTotal', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cfRows: any[] = [];
      const depositTxs = [
        {
          id: 'tx-bagus-mar26',
          member_deposit_id: 'md-bagus',
          transaction_type: 'deposit',
          amount: 200000,
          for_month: 3,
          for_year: 2026,
          description: 'Setoran Matriks WAJIB Mar 2026',
          reference_no: 'KW-2026/03/00050543',
          payment_method: 'tunai',
          created_at: '2026-11-19T08:30:00.000Z',
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'system_settings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { key: 'initial_savings_effective_date', value: '2026-03-01' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockImplementation(() => ({
              range: vi.fn().mockResolvedValue({ data: depositTxs, error: null }),
            })),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockImplementation(() => ({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'md-bagus', member_id: 'm-bagus', deposit_type_id: 'dt-wajib' }],
                error: null,
              }),
            })),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'm-bagus', nrp: '00050543', nama: 'BAGUS BUDI PRASETYO' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'lebaran_disbursement_cycles') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return {
                  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                };
              }
              return {
                range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                  data: cfRows.slice(from, to + 1),
                  error: null,
                })),
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockImplementation(async () => ({
                      data: [...cfRows],
                      error: null,
                    })),
                  }),
                }),
              };
            }),
            insert: vi.fn().mockImplementation(async (rows: any[]) => {
              const items = Array.isArray(rows) ? rows : [rows];
              for (const r of items) {
                cfRows.push({ id: `cf-bagus-${cfRows.length + 1}`, ...r });
              }
              return { data: items, error: null };
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

      const report = await getCashFlowReport('2026-11-01', '2026-11-30', 'all');
      expect(report.inflowTotal).toBe(200000);
      expect(report.outflowTotal).toBe(0);
      expect(report.netCashflow).toBe(200000);
      expect(report.transactions).toHaveLength(1);
      expect(report.transactions[0]).toMatchObject({
        kategori: 'Setoran Simpanan',
        kas_masuk: 200000,
        reference_id: 'tx-bagus-mar26',
        deskripsi:
          'Setoran Simpanan Wajib [Mar 2026] — 00050543 - BAGUS BUDI PRASETYO (KW-2026/03/00050543)',
      });
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('renders 4-column KPI grid with SISA PIUTANG BON TOKO (POTONG GAJI) card and link to /admin/buku-besar-bon-toko', () => {
    const html = renderToStaticMarkup(
      <LaporanKeuangan
        initialStoreCreditSummary={{
          totalOutstandingReceivable: 100000,
          activeDebtorsCount: 1,
          totalCreditSales: 250000,
          totalRepaid: 150000,
        }}
      />
    );

    expect(html).toContain('xl:grid-cols-4');
    expect(html).toContain('Saldo Kas Bersih Brankas');
    expect(html).toContain('SISA PIUTANG BON TOKO (POTONG GAJI)');
    expect(html).toContain('100.000');
    expect(html).toContain('1 anggota berutang aktif');
    expect(html).toContain('Lihat Buku Bon');
    expect(html).toContain('/admin/buku-besar-bon-toko');
  });

  it('renders PELUNASAN_BON_TOKO badge cleanly with emerald styling and syncs store credit payments in getCashFlowReport', async () => {
    const badgeHtml = renderToStaticMarkup(<KategoriBadge kategori="PELUNASAN_BON_TOKO" />);
    expect(badgeHtml).toContain('Pelunasan Bon Toko');
    expect(badgeHtml).toContain('bg-emerald-50');
    expect(badgeHtml).toContain('text-emerald-700');
    expect(badgeHtml).toContain('border-emerald-200');

    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cfRows: any[] = [];
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'scp-sync-1',
                    sale_id: 'sale-sync-1',
                    amount: 100000,
                    payment_date: '2026-11-19',
                    receipt_number: 'BYR-SYNC-01',
                    notes: '[Potong Gaji] Pelunasan',
                    created_at: '2026-11-19T09:00:00.000Z',
                  },
                ],
                error: null,
              }),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'scp-sync-1',
                    sale_id: 'sale-sync-1',
                    amount: 100000,
                    payment_date: '2026-11-19',
                    receipt_number: 'BYR-SYNC-01',
                    notes: '[Potong Gaji] Pelunasan',
                    created_at: '2026-11-19T09:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'sale-sync-1', member_id: 'm-1', paid_credit: 100000 }],
                error: null,
              }),
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
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'm-1', nrp: '88010001', nama: 'Budi Santoso' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'deposit_transactions' || table === 'member_deposits' || table === 'lebaran_disbursement_cycles') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === 'reference_id') {
                return { in: vi.fn().mockResolvedValue({ data: [], error: null }) };
              }
              if (cols === '*') {
                return { eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
              }
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
                range: vi.fn().mockResolvedValue({ data: cfRows, error: null }),
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockImplementation(async () => ({ data: [...cfRows], error: null })),
                  }),
                }),
              };
            }),
            insert: vi.fn().mockImplementation(async (payload: any) => {
              const items = Array.isArray(payload) ? payload : [payload];
              for (const item of items) {
                cfRows.push({ id: `cf-bon-${cfRows.length + 1}`, ...item });
              }
              return { data: items, error: null };
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const report = await getCashFlowReport('2026-11-01', '2026-11-30', 'all');
      expect(report.inflowTotal).toBe(100000);
      expect(report.transactions).toHaveLength(1);
      expect(report.transactions[0]).toMatchObject({
        kategori: 'PELUNASAN_BON_TOKO',
        kas_masuk: 100000,
        reference_id: 'scp-sync-1',
        deskripsi:
          'Pelunasan Bon Toko (Potong Gaji • BYR-SYNC-01) — 88010001 - Budi Santoso | Piutang -Rp 100.000 (Sisa Piutang: Rp 0)',
      });
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('getShuEstimation recognizes ONLY margin_portion from goods financing repayments and excludes principal', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      (supabase.from as any).mockImplementation((table: string) => {
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
                    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  data: [
                    // 1x angsuran pembiayaan barang Rp 460.000 (Pokok Rp 400.000 + Margin Rp 60.000)
                    {
                      id: 'rep-brg-1',
                      loan_id: 'loan-brg-1',
                      schedule_id: 'sch-brg-1',
                      amount_paid: 460000,
                      principal_portion: 400000,
                      margin_portion: 60000,
                      payment_date: '2026-11-19T09:00:00.000Z',
                      payment_method: 'POTONG_GAJI',
                    },
                    // 1x angsuran pinjaman tunai 0% bunga Rp 500.000 (Margin Rp 0)
                    {
                      id: 'rep-cash-1',
                      loan_id: 'loan-cash-1',
                      schedule_id: 'sch-cash-1',
                      amount_paid: 500000,
                      principal_portion: 500000,
                      margin_portion: 0,
                      payment_date: '2026-11-19T10:00:00.000Z',
                      payment_method: 'POTONG_GAJI',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const shu = await getShuEstimation('2026-11-01', '2026-11-30');
      expect(shu.goodsFinancingMargin).toBe(60000);
      expect(shu.estimatedShu).toBe(60000);
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('renders Pendapatan Margin Pembiayaan Barang card on Estimasi SHU tab and pembiayaan_barang badge', () => {
    const badgeHtml = renderToStaticMarkup(<KategoriBadge kategori="pembiayaan_barang" />);
    expect(badgeHtml).toContain('Pembiayaan Barang');
    expect(badgeHtml).toContain('bg-teal-50');

    const html = renderToStaticMarkup(
      <LaporanKeuangan
        initialActiveTab="shu"
        initialShuData={{
          grossSales: 1000000,
          cogs: 700000,
          grossProfit: 300000,
          goodsFinancingMargin: 60000,
          opex: 50000,
          estimatedShu: 310000,
          marginPercentage: 29.2,
          marginPerKategori: [],
        }}
      />
    );

    expect(html).toContain('Pendapatan Margin Pembiayaan Barang');
    expect(html).toContain('60.000');
    expect(html).toContain('310.000');
  });

  it('getShuEstimation aggregates POS sales by reference number with payment classification, member lookup, DESC order, and line items', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const mockSales = [
        // Deliberately out of chronological order to verify JS DESC sorting
        {
          id: 'sale-3',
          sale_number: 'INV-1795063690932',
          member_id: 'mem-1',
          subtotal: 120000,
          discount: 0,
          total_amount: 120000,
          paid_cash: 0,
          paid_deposit: 0,
          paid_credit: 120000,
          payment_scheme: 'store_credit',
          created_at: '2026-11-19T10:00:00.000Z',
        },
        {
          id: 'sale-1',
          sale_number: 'INV-1795079184845',
          member_id: 'mem-1',
          subtotal: 150000,
          discount: 0,
          total_amount: 150000,
          paid_cash: 150000,
          paid_deposit: 0,
          paid_credit: 0,
          payment_scheme: 'cash',
          created_at: '2026-11-19T14:00:00.000Z',
        },
        {
          id: 'sale-4',
          sale_number: 'INV-1795050000999',
          member_id: null,
          subtotal: 80000,
          discount: 0,
          total_amount: 80000,
          paid_cash: 30000,
          paid_deposit: 50000,
          paid_credit: 0,
          payment_scheme: 'split',
          created_at: '2026-11-19T08:00:00.000Z',
        },
        {
          id: 'sale-2',
          sale_number: 'INV-1795078441001',
          member_id: 'mem-2',
          subtotal: 100000,
          discount: 0,
          total_amount: 100000,
          paid_cash: 0,
          paid_deposit: 100000,
          paid_credit: 0,
          payment_scheme: 'split',
          created_at: '2026-11-19T12:00:00.000Z',
        },
      ];

      const mockSaleItems = [
        {
          sale_id: 'sale-1',
          product_id: 'prod-atk',
          product_name: 'Kertas HVS A4',
          quantity: 2,
          unit_price: 75000,
        },
        {
          sale_id: 'sale-2',
          product_id: 'prod-kanebo',
          product_name: 'Kanebo Serbaguna',
          quantity: 1,
          unit_price: 100000,
        },
        {
          sale_id: 'sale-3',
          product_id: 'prod-fd',
          product_name: 'Flashdisk 32GB',
          quantity: 3,
          unit_price: 40000,
        },
        {
          sale_id: 'sale-4',
          product_id: 'prod-umum',
          product_name: 'Pulpen Gel Pack',
          quantity: 1,
          unit_price: 80000,
        },
      ];

      const mockProducts = [
        { id: 'prod-atk', name: 'Kertas HVS A4', buy_price: 60000, category_id: 'cat-1' },
        { id: 'prod-kanebo', name: 'Kanebo Serbaguna', buy_price: 80195, category_id: 'cat-2' },
        { id: 'prod-fd', name: 'Flashdisk 32GB', buy_price: 35000, category_id: 'cat-3' },
        { id: 'prod-umum', name: 'Pulpen Gel Pack', buy_price: 65000, category_id: 'cat-1' },
      ];

      const mockCategories = [
        { id: 'cat-1', name: 'ATK/HVS WARNA' },
        { id: 'cat-2', name: 'KANEBO' },
        { id: 'cat-3', name: 'FLASHDISK' },
      ];

      const mockMembers = [
        { id: 'mem-1', nrp: '88010001', nama: 'Budi Santoso' },
        { id: 'mem-2', nrp: '91020002', nama: 'Siti Aminah' },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: mockSales, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'sale_items') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockSaleItems, error: null }),
            }),
          };
        }
        if (table === 'products') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockProducts, error: null }),
            }),
          };
        }
        if (table === 'product_categories') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockCategories, error: null }),
            }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const shu = await getShuEstimation('2026-11-01', '2026-11-30');

      expect(shu.grossSales).toBe(450000);
      expect(shu.cogs).toBe(370195);
      expect(shu.grossProfit).toBe(79805);
      expect(shu.shuReferenceRows).toHaveLength(4);

      const rows = shu.shuReferenceRows!;
      // Sorted newest first (created_at DESC)
      expect(rows.map((r) => r.referenceNumber)).toEqual([
        'INV-1795079184845',
        'INV-1795078441001',
        'INV-1795063690932',
        'INV-1795050000999',
      ]);

      expect(rows[0]).toMatchObject({
        referenceNumber: 'INV-1795079184845',
        sourceType: 'pos_cash',
        paymentMethodLabel: 'POS • Tunai',
        memberName: 'Budi Santoso',
        memberNrp: '88010001',
        omzet: 150000,
        hpp: 120000,
        grossProfit: 30000,
        marginPercent: 20,
      });
      expect(rows[0].items).toEqual([
        {
          productName: 'Kertas HVS A4',
          categoryName: 'ATK/HVS WARNA',
          qty: 2,
          sellPrice: 75000,
          buyPrice: 60000,
          subtotalOmzet: 150000,
          subtotalHpp: 120000,
          subtotalProfit: 30000,
        },
      ]);

      expect(rows[1]).toMatchObject({
        referenceNumber: 'INV-1795078441001',
        sourceType: 'pos_deposit',
        paymentMethodLabel: 'POS • Potong Simpanan',
        memberName: 'Siti Aminah',
        memberNrp: '91020002',
        omzet: 100000,
        hpp: 80195,
        grossProfit: 19805,
      });

      expect(rows[2]).toMatchObject({
        referenceNumber: 'INV-1795063690932',
        sourceType: 'pos_credit',
        paymentMethodLabel: 'POS • Bon Toko',
        memberName: 'Budi Santoso',
        memberNrp: '88010001',
        omzet: 120000,
        hpp: 105000,
        grossProfit: 15000,
      });

      expect(rows[3]).toMatchObject({
        referenceNumber: 'INV-1795050000999',
        sourceType: 'pos_split',
        paymentMethodLabel: 'POS • Campuran',
        memberName: 'Pelanggan Umum',
        memberNrp: '',
        omzet: 80000,
        hpp: 65000,
        grossProfit: 15000,
      });
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('getShuEstimation includes goods financing repayments with margin_portion > 0 in shuReferenceRows and excludes 0%-margin loans', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      (supabase.from as any).mockImplementation((table: string) => {
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
                    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'rep-brg-1',
                      loan_id: 'loan-brg-1',
                      schedule_id: 'sch-brg-1',
                      amount_paid: 460000,
                      principal_portion: 400000,
                      margin_portion: 60000,
                      payment_date: '2026-11-19T09:00:00.000Z',
                      payment_method: 'POTONG_GAJI',
                      receipt_number: 'PAY-BRG-001',
                    },
                    {
                      id: 'rep-cash-1',
                      loan_id: 'loan-cash-1',
                      schedule_id: 'sch-cash-1',
                      amount_paid: 500000,
                      principal_portion: 500000,
                      margin_portion: 0,
                      payment_date: '2026-11-19T10:00:00.000Z',
                      payment_method: 'POTONG_GAJI',
                      receipt_number: 'PAY-CASH-001',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'loans') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'loan-brg-1',
                    loan_number: 'LOAN-BRG-001',
                    member_id: 'mem-1',
                    amount: 4600000,
                    principal_amount: 4600000,
                    cost_price: 4000000,
                    markup_amount: 600000,
                    item_description: 'Kulkas 2 Pintu',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'mem-1', nrp: '88010001', nama: 'Budi Santoso' }],
                error: null,
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const shu = await getShuEstimation('2026-11-01', '2026-11-30');
      expect(shu.goodsFinancingMargin).toBe(60000);
      expect(shu.shuReferenceRows).toHaveLength(1);
      expect(shu.shuReferenceRows![0]).toMatchObject({
        referenceNumber: 'PAY-BRG-001',
        sourceType: 'goods_financing',
        paymentMethodLabel: 'Margin Pembiayaan',
        memberName: 'Budi Santoso',
        memberNrp: '88010001',
        omzet: 60000,
        hpp: 0,
        grossProfit: 60000,
        marginPercent: 100,
        repaymentAmount: 460000,
        principalPortion: 400000,
        loanNumber: 'LOAN-BRG-001',
      });
      expect(shu.shuReferenceRows![0].items[0].productName).toContain('Kulkas 2 Pintu');
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('renders reference-based SHU breakdown table with clickable INV badges, TOTAL row matching KPIs, search, and pagination', () => {
    const sampleShuRows = [
      {
        id: 'pos-1',
        referenceNumber: 'INV-1795079184845',
        sourceType: 'pos_cash' as const,
        transactionDate: '19/11/2026',
        rawDate: '2026-11-19T14:00:00.000Z',
        memberName: 'Budi Santoso',
        memberNrp: '88010001',
        paymentMethodLabel: 'POS • Tunai',
        omzet: 150000,
        hpp: 120000,
        grossProfit: 30000,
        marginPercent: 20,
        items: [],
      },
      {
        id: 'pos-2',
        referenceNumber: 'INV-1795078441001',
        sourceType: 'pos_deposit' as const,
        transactionDate: '19/11/2026',
        rawDate: '2026-11-19T12:00:00.000Z',
        memberName: 'Siti Aminah',
        memberNrp: '91020002',
        paymentMethodLabel: 'POS • Potong Simpanan',
        omzet: 180000,
        hpp: 145195,
        grossProfit: 34805,
        marginPercent: 19.3,
        items: [],
      },
      {
        id: 'pos-3',
        referenceNumber: 'INV-1795063690932',
        sourceType: 'pos_credit' as const,
        transactionDate: '19/11/2026',
        rawDate: '2026-11-19T10:00:00.000Z',
        memberName: 'Andi Wijaya',
        memberNrp: '92030003',
        paymentMethodLabel: 'POS • Bon Toko',
        omzet: 120000,
        hpp: 105000,
        grossProfit: 15000,
        marginPercent: 12.5,
        items: [],
      },
    ];

    const html = renderToStaticMarkup(
      <LaporanKeuangan
        initialActiveTab="shu"
        initialShuData={{
          grossSales: 450000,
          cogs: 370195,
          grossProfit: 79805,
          goodsFinancingMargin: 0,
          opex: 0,
          estimatedShu: 79805,
          marginPercentage: 17.7,
          marginPerKategori: [],
          shuReferenceRows: sampleShuRows,
        }}
      />
    );

    // New table heading replaces category table heading
    expect(html).toContain('Rincian Sumber Laba &amp; Margin per Nomor Referensi');
    expect(html).not.toContain('Rincian Margin Laba per Kategori Produk');

    // Columns & clickable INV-... references
    expect(html).toContain('NO. REFERENSI');
    expect(html).toContain('SUMBER / METODE');
    expect(html).toContain('ANGGOTA / PEMBELI');
    expect(html).toContain('INV-1795079184845');
    expect(html).toContain('INV-1795078441001');
    expect(html).toContain('INV-1795063690932');
    expect(html).toContain('POS • Tunai');
    expect(html).toContain('POS • Potong Simpanan');
    expect(html).toContain('POS • Bon Toko');
    expect(html).toContain('NRP: 88010001');

    // TOTAL row matches KPI cards
    expect(html).toContain('TOTAL');
    expect(html).toContain('450.000');
    expect(html).toContain('370.195');
    expect(html).toContain('79.805');

    // Search input & pagination controls
    expect(html).toContain('Cari No. Referensi (INV-...), NRP, atau Nama...');
    expect(html).toContain('10 / halaman');
    expect(html).toContain('25 / halaman');
    expect(html).toContain('50 / halaman');
    expect(html).toContain('Prev');
    expect(html).toContain('Next');
    expect(html).toContain('1-3');
  });

  it('filters SHU reference rows by initialShuSearchQuery and shows empty search message when unmatched', () => {
    const sampleShuRows = [
      {
        id: 'pos-1',
        referenceNumber: 'INV-1795079184845',
        sourceType: 'pos_cash' as const,
        transactionDate: '19/11/2026',
        rawDate: '2026-11-19T14:00:00.000Z',
        memberName: 'Budi Santoso',
        memberNrp: '88010001',
        paymentMethodLabel: 'POS • Tunai',
        omzet: 150000,
        hpp: 120000,
        grossProfit: 30000,
        marginPercent: 20,
        items: [],
      },
      {
        id: 'pos-2',
        referenceNumber: 'INV-1795078441001',
        sourceType: 'pos_deposit' as const,
        transactionDate: '19/11/2026',
        rawDate: '2026-11-19T12:00:00.000Z',
        memberName: 'Siti Aminah',
        memberNrp: '91020002',
        paymentMethodLabel: 'POS • Potong Simpanan',
        omzet: 180000,
        hpp: 145195,
        grossProfit: 34805,
        marginPercent: 19.3,
        items: [],
      },
    ];

    const matchedHtml = renderToStaticMarkup(
      <LaporanKeuangan
        initialActiveTab="shu"
        initialShuSearchQuery="INV-1795078441001"
        initialShuData={{
          grossSales: 330000,
          cogs: 265195,
          grossProfit: 64805,
          goodsFinancingMargin: 0,
          opex: 0,
          estimatedShu: 64805,
          marginPercentage: 19.6,
          marginPerKategori: [],
          shuReferenceRows: sampleShuRows,
        }}
      />
    );

    expect(matchedHtml).toContain('INV-1795078441001');
    expect(matchedHtml).toContain('Siti Aminah');
    expect(matchedHtml).not.toContain('INV-1795079184845');
    expect(matchedHtml).not.toContain('Budi Santoso');

    const unmatchedHtml = renderToStaticMarkup(
      <LaporanKeuangan
        initialActiveTab="shu"
        initialShuSearchQuery="TIDAK-ADA-999"
        initialShuData={{
          grossSales: 330000,
          cogs: 265195,
          grossProfit: 64805,
          goodsFinancingMargin: 0,
          opex: 0,
          estimatedShu: 64805,
          marginPercentage: 19.6,
          marginPerKategori: [],
          shuReferenceRows: sampleShuRows,
        }}
      />
    );

    expect(unmatchedHtml).toContain('Tidak ada transaksi yang cocok dengan pencarian');
  });

  it('renders ShuReferenceDetailModal when initialSelectedShuRef is provided', () => {
    const html = renderToStaticMarkup(
      <LaporanKeuangan
        initialActiveTab="shu"
        initialSelectedShuRef={{
          id: 'pos-1',
          referenceNumber: 'INV-1795079184845',
          sourceType: 'pos_cash',
          transactionDate: '19/11/2026',
          rawDate: '2026-11-19T14:00:00.000Z',
          memberName: 'Budi Santoso',
          memberNrp: '88010001',
          paymentMethodLabel: 'POS • Tunai',
          omzet: 150000,
          hpp: 120000,
          grossProfit: 30000,
          marginPercent: 20,
          items: [
            {
              productName: 'Kertas HVS A4 70gr',
              categoryName: 'ATK/HVS WARNA',
              qty: 2,
              sellPrice: 75000,
              buyPrice: 60000,
              subtotalOmzet: 150000,
              subtotalHpp: 120000,
              subtotalProfit: 30000,
            },
          ],
        }}
      />
    );

    expect(html).toContain('Rincian Bukti Transaksi Pembentuk SHU');
    expect(html).toContain('INV-1795079184845');
    expect(html).toContain('Kertas HVS A4 70gr');
    expect(html).toContain('ATK/HVS WARNA');
  });

  it('renders Penjualan POS badge cleanly across penjualan_tunai, PENJUALAN_POS, and Penjualan POS variants', () => {
    for (const key of ['penjualan_tunai', 'PENJUALAN_TUNAI', 'PENJUALAN_POS', 'Penjualan POS']) {
      const badgeHtml = renderToStaticMarkup(<KategoriBadge kategori={key} />);
      expect(badgeHtml).toContain('Penjualan POS');
      expect(badgeHtml).toContain('bg-emerald-50');
      expect(badgeHtml).toContain('text-emerald-800');
    }
  });

  it('getCashFlowReport calls syncPosCashSalesToCashFlow and enriches CF-6D78C2A5 with "Penjualan Tunai (INV-...) — NRP - Nama (Rp ...)"', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cfRows: any[] = [
        {
          id: '6d78c2a5-c33f-4ada-a9e1-022ca199e11e',
          created_at: '2026-11-19T08:54:02.742888+00:00',
          category: 'penjualan_tunai',
          direction: 'in',
          amount: 100000,
          description: null,
          reference_id: 'f9dec14d-7519-4195-a98d-41cc559ef386',
        },
      ];

      const salesRows = [
        {
          id: 'f9dec14d-7519-4195-a98d-41cc559ef386',
          sale_number: 'INV-1795078441001',
          member_id: 'a6f5448c-e539-4426-aeaa-4e804054b894',
          paid_cash: 100000,
          total_amount: 100000,
          payment_scheme: 'cash',
          sale_status: 'completed',
          created_at: '2026-11-19T08:54:01.438882+00:00',
        },
      ];

      const members = [
        {
          id: 'a6f5448c-e539-4426-aeaa-4e804054b894',
          nrp: '00010062',
          nama: 'MOCH. ALIF NURSYARIFUDDIN',
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'deposit_transactions' || table === 'member_deposits' || table === 'lebaran_disbursement_cycles') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn(async (_col: string, ids: string[]) => ({
                data: members.filter((m) => ids.includes(m.id)),
                error: null,
              })),
            }),
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockImplementation(() => ({
              range: vi.fn(async (from: number, to: number) => ({
                data: salesRows.slice(from, to + 1),
                error: null,
              })),
              in: vi.fn(async (_col: string, ids: string[]) => ({
                data: salesRows.filter((s) => ids.includes(s.id)),
                error: null,
              })),
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    gt: vi.fn().mockResolvedValue({ data: salesRows, error: null }),
                  }),
                }),
              }),
            })),
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return { eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
              }
              return {
                range: vi.fn(async (from: number, to: number) => ({
                  data: cfRows.slice(from, to + 1),
                  error: null,
                })),
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn(async () => ({ data: [...cfRows], error: null })),
                  }),
                }),
              };
            }),
            update: vi.fn((payload: any) => ({
              eq: vi.fn(async (_col: string, id: string) => {
                const idx = cfRows.findIndex((r) => r.id === id);
                if (idx >= 0) cfRows[idx] = { ...cfRows[idx], ...payload };
                return { error: null };
              }),
            })),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const report = await getCashFlowReport('2026-11-01', '2026-11-30', 'all');

      expect(report.inflowTotal).toBe(100000);
      expect(report.transactions).toHaveLength(1);
      expect(report.transactions[0]).toMatchObject({
        referensi: 'CF-6D78C2A5',
        kategori: 'penjualan_tunai',
        kas_masuk: 100000,
        deskripsi:
          'Penjualan Tunai (INV-1795078441001) — 00010062 - MOCH. ALIF NURSYARIFUDDIN (Rp 100.000)',
      });
      expect(cfRows[0].description).toBe(
        'Penjualan Tunai (INV-1795078441001) — 00010062 - MOCH. ALIF NURSYARIFUDDIN (Rp 100.000)'
      );
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });
});

describe('Deep-Link Navigation (?tab=, ?ref=, ?receipt=, ?date=) & Highlighting', () => {
  it('extracts installment period from KW-PINJ/... receipts and matches SHU & Cash Flow target rows accurately', () => {
    expect(extractReceiptPeriodNumber('KW-PINJ/LOAN-1795088101742/B1/20261119-HXO')).toBe('1');
    expect(extractReceiptPeriodNumber('KW-PINJ/PINJ-MIGRASI-97109810/B24')).toBe('24');
    expect(extractReceiptPeriodNumber('INV-12345')).toBeNull();

    const shuIds = getHighlightedShuRowIds(
      [
        {
          id: 'loan-repay-1',
          referenceNumber: 'PAY-BRG-001',
          loanNumber: 'LOAN-1795083121561',
          sourceType: 'goods_financing',
          transactionDate: '19/11/2026',
          rawDate: '2026-11-19T08:00:00.000Z',
          memberName: 'Surya Pratama',
          memberNrp: '87010011',
          paymentMethodLabel: 'Margin Pembiayaan',
          omzet: 100000,
          hpp: 0,
          grossProfit: 100000,
          marginPercent: 100,
          items: [],
        },
        {
          id: 'pos-99',
          referenceNumber: 'INV-9999999',
          sourceType: 'pos_cash',
          transactionDate: '19/11/2026',
          rawDate: '2026-11-19T09:00:00.000Z',
          memberName: 'Pelanggan Umum',
          memberNrp: '',
          paymentMethodLabel: 'POS • Tunai',
          omzet: 50000,
          hpp: 40000,
          grossProfit: 10000,
          marginPercent: 20,
          items: [],
        },
      ],
      'LOAN-1795083121561',
      'KW-PINJ/LOAN-1795083121561/B1/20261119-TCD'
    );
    expect(Array.from(shuIds)).toEqual(['loan-repay-1']);

    const cfIds = getHighlightedCashFlowRowIds(
      [
        {
          id: 'cf-disb',
          tanggal: '19/10/2026',
          referensi: 'CF-11111111',
          deskripsi: 'Pencairan Pinjaman (LOAN-1795088101742) — 88010001 - Budi',
          kategori: 'pencairan_pinjaman',
          unit_usaha: 'Umum',
          kas_masuk: 0,
          kas_keluar: 2000000,
          saldo_berjalan: -2000000,
          created_at: '2026-10-19T08:00:00.000Z',
        },
        {
          id: 'cf-b1',
          tanggal: '19/11/2026',
          referensi: 'CF-50196D6C',
          deskripsi: 'Angsuran Pinjaman (LOAN-1795088101742) Bln ke-1 — 88010001 - Budi',
          kategori: 'angsuran_pinjaman',
          unit_usaha: 'Umum',
          kas_masuk: 1000000,
          kas_keluar: 0,
          saldo_berjalan: -1000000,
          created_at: '2026-11-19T10:15:00.000Z',
        },
        {
          id: 'cf-b2',
          tanggal: '19/12/2026',
          referensi: 'CF-60207E7D',
          deskripsi: 'Angsuran Pinjaman (LOAN-1795088101742) Bln ke-2 — 88010001 - Budi',
          kategori: 'angsuran_pinjaman',
          unit_usaha: 'Umum',
          kas_masuk: 1000000,
          kas_keluar: 0,
          saldo_berjalan: 0,
          created_at: '2026-12-19T10:15:00.000Z',
        },
      ],
      'LOAN-1795088101742',
      'KW-PINJ/LOAN-1795088101742/B1/20261119-HXO',
      '2026-11-19'
    );
    expect(Array.from(cfIds)).toEqual(['cf-b1']);
  });

  it('activates Estimasi SHU Berjalan tab, expands startDate, filters by ref/loanNumber, highlights matched row, and shows Reset Filter Referensi', () => {
    const shuData = {
      grossSales: 150000,
      cogs: 120000,
      grossProfit: 30000,
      goodsFinancingMargin: 100000,
      opex: 0,
      estimatedShu: 130000,
      marginPercentage: 52,
      marginPerKategori: [],
      shuReferenceRows: [
        {
          id: 'loan-repay-goods-1',
          referenceNumber: 'PAY-GOODS-001',
          loanNumber: 'LOAN-1795083121561',
          sourceType: 'goods_financing' as const,
          transactionDate: '15/8/2026',
          rawDate: '2026-08-15T08:00:00.000Z',
          memberName: 'Surya Pratama',
          memberNrp: '87010011',
          paymentMethodLabel: 'Margin Pembiayaan',
          omzet: 100000,
          hpp: 0,
          grossProfit: 100000,
          marginPercent: 100,
          items: [],
        },
        {
          id: 'pos-other-1',
          referenceNumber: 'INV-OTHER-999',
          sourceType: 'pos_cash' as const,
          transactionDate: '19/11/2026',
          rawDate: '2026-11-19T09:00:00.000Z',
          memberName: 'Andi Wijaya',
          memberNrp: '92030003',
          paymentMethodLabel: 'POS • Tunai',
          omzet: 150000,
          hpp: 120000,
          grossProfit: 30000,
          marginPercent: 20,
          items: [],
        },
      ],
    };

    const html = renderToStaticMarkup(
      <MemoryRouter
        initialEntries={[
          '/admin/laporan-keuangan?tab=shu&ref=LOAN-1795083121561&receipt=KW-PINJ/LOAN-1795083121561/B1/20261119-TCD&date=2026-08-15',
        ]}
      >
        <LaporanKeuangan initialShuData={shuData} />
      </MemoryRouter>
    );

    expect(html).toContain('Rincian Sumber Laba &amp; Margin per Nomor Referensi');
    expect(html).toContain('value="2026-08-15"');
    expect(html).toContain('data-testid="shu-search-input"');
    expect(html).toContain('value="LOAN-1795083121561"');
    expect(html).toContain('PAY-GOODS-001');
    expect(html).toContain('Surya Pratama');
    expect(html).not.toContain('INV-OTHER-999');
    expect(html).toContain('data-highlighted-ref="true"');
    expect(html).toContain('bg-amber-50/90 ring-2 ring-amber-400/70');
    expect(html).toContain('data-testid="reset-ref-filter-btn"');
    expect(html).toContain('Reset Filter Referensi');
  });

  it('activates Arus Kas tab, populates cashflow search with ref, filters unrelated rows, and highlights only matching installment row', () => {
    const cashFlowData = {
      inflowTotal: 2150000,
      outflowTotal: 0,
      netCashflow: 2150000,
      transactions: [
        {
          id: '50196d6c-0000-0000-0000-000000000001',
          tanggal: '19/11/2026',
          referensi: 'CF-50196D6C',
          deskripsi: 'Angsuran Pinjaman (LOAN-1795088101742) Bln ke-1 — 88010001 - Budi',
          kategori: 'angsuran_pinjaman',
          unit_usaha: 'Umum',
          kas_masuk: 1000000,
          kas_keluar: 0,
          saldo_berjalan: 1000000,
          created_at: '2026-11-19T10:15:00.000Z',
        },
        {
          id: '60207e7d-0000-0000-0000-000000000002',
          tanggal: '19/12/2026',
          referensi: 'CF-60207E7D',
          deskripsi: 'Angsuran Pinjaman (LOAN-1795088101742) Bln ke-2 — 88010001 - Budi',
          kategori: 'angsuran_pinjaman',
          unit_usaha: 'Umum',
          kas_masuk: 1000000,
          kas_keluar: 0,
          saldo_berjalan: 2000000,
          created_at: '2026-12-19T10:15:00.000Z',
        },
        {
          id: '99999999-0000-0000-0000-000000000003',
          tanggal: '19/11/2026',
          referensi: 'CF-99999999',
          deskripsi: 'Penjualan Tunai (INV-8888) — Pelanggan Umum',
          kategori: 'penjualan_tunai',
          unit_usaha: 'Retail Toko',
          kas_masuk: 150000,
          kas_keluar: 0,
          saldo_berjalan: 2150000,
          created_at: '2026-11-19T11:00:00.000Z',
        },
      ],
    };

    const html = renderToStaticMarkup(
      <MemoryRouter
        initialEntries={[
          '/admin/laporan-keuangan?tab=cashflow&ref=LOAN-1795088101742&receipt=KW-PINJ/LOAN-1795088101742/B1/20261119-HXO&date=2026-11-19',
        ]}
      >
        <LaporanKeuangan initialCashFlowData={cashFlowData} />
      </MemoryRouter>
    );

    expect(html).toContain('Mutasi Arus Kas Terperinci');
    expect(html).toContain('data-testid="cashflow-search-input"');
    expect(html).toContain('value="LOAN-1795088101742"');
    expect(html).toContain('CF-50196D6C');
    expect(html).toContain('Angsuran Pinjaman (LOAN-1795088101742) Bln ke-1');
    expect(html).not.toContain('CF-99999999');
    expect(html).toContain('data-testid="reset-ref-filter-btn"');
    expect(html).toContain('Reset Filter Referensi');

    // Only 1 row (CF-50196D6C) should carry data-highlighted-ref="true", not Bln ke-2
    const highlightedMatches = html.match(/data-highlighted-ref="true"/g) ?? [];
    expect(highlightedMatches).toHaveLength(1);
    expect(html).toMatch(
      /data-highlighted-ref="true"[\s\S]*?CF-50196D6C/
    );
  });

  it('renders KLIRING_ANGGOTA_KELUAR category badge as "Kliring Anggota Keluar" with rose styling', () => {
    const html = renderToStaticMarkup(<KategoriBadge kategori="KLIRING_ANGGOTA_KELUAR" />);

    expect(html).toContain('Kliring Anggota Keluar');
    expect(html).toContain('bg-rose-50');
    expect(html).toContain('text-rose-700');
    expect(html).toContain('border-rose-200');
  });

  it('getCashFlowReport syncs resigned member clearance (MOCH. ALIF NURSYARIFUDDIN Rp 10.460.000) and maps it to kas_keluar and outflowTotal', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cashFlowStore: any[] = [];
      const anggotaRows = [
        {
          id: 'mem-alif',
          nrp: '(lama 1) 00010062',
          nama: 'MOCH. ALIF NURSYARIFUDDIN',
          pangkat: 'BRIPTU',
          status: 'nonaktif',
          membership_status: 'RESIGNED',
          updated_at: '2026-11-19T14:20:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
        },
      ];
      const depositTypes = [
        { id: 'dt-w', code: 'WAJIB', name: 'Simpanan Wajib' },
        { id: 'dt-p', code: 'POKOK', name: 'Simpanan Pokok' },
        { id: 'dt-b', code: 'BELANJA', name: 'Simpanan Belanja' },
        { id: 'dt-l', code: 'LEBARAN', name: 'Simpanan Lebaran' },
      ];
      const memberDeposits = [
        { id: 'md-w', member_id: 'mem-alif', deposit_type_id: 'dt-w' },
        { id: 'md-p', member_id: 'mem-alif', deposit_type_id: 'dt-p' },
        { id: 'md-b', member_id: 'mem-alif', deposit_type_id: 'dt-b' },
        { id: 'md-l', member_id: 'mem-alif', deposit_type_id: 'dt-l' },
      ];
      const depositTransactions = [
        { id: 'tx-w', member_deposit_id: 'md-w', transaction_type: 'deposit', amount: 5000000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)', created_at: '2026-03-01T00:00:00.000Z' },
        { id: 'tx-p', member_deposit_id: 'md-p', transaction_type: 'deposit', amount: 10000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)', created_at: '2026-03-01T00:00:00.000Z' },
        { id: 'tx-b', member_deposit_id: 'md-b', transaction_type: 'deposit', amount: 1250000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)', created_at: '2026-03-01T00:00:00.000Z' },
        { id: 'tx-l', member_deposit_id: 'md-l', transaction_type: 'deposit', amount: 4200000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)', created_at: '2026-03-01T00:00:00.000Z' },
      ];
      const clearanceLogs = [
        {
          id: 'mcl-alif',
          anggota_id: 'mem-alif',
          settlement_type: 'SURPLUS_PAYOUT',
          total_savings: 10460000,
          total_loans: 0,
          net_amount: 10460000,
          payment_method: 'Transfer Bank',
          created_at: '2026-11-19T14:20:00.000Z',
        },
      ];

      const makePagedSelect = (rows: any[]) => ({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation(async (col: string, vals: any[]) => ({
            data: rows.filter((r) => vals.includes(r[col])),
            error: null,
          })),
          range: vi.fn().mockImplementation(async (from: number, to: number) => ({
            data: rows.slice(from, to + 1),
            error: null,
          })),
        }),
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') return makePagedSelect(anggotaRows);
        if (table === 'deposit_types') return makePagedSelect(depositTypes);
        if (table === 'member_deposits') return makePagedSelect(memberDeposits);
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation(async (col: string, vals: any[]) => ({
                data: depositTransactions.filter((r: any) => vals.includes(r[col])),
                error: null,
              })),
              range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                data: depositTransactions.slice(from, to + 1),
                error: null,
              })),
            }),
          };
        }
        if (table === 'member_clearance_logs') return makePagedSelect(clearanceLogs);
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(async (col: string, val: any) => ({
                data: cashFlowStore.filter((r) => r[col] === val),
                error: null,
              })),
              range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                data: cashFlowStore.slice(from, to + 1),
                error: null,
              })),
              gte: vi.fn().mockImplementation((_col: string, sVal: string) => ({
                lte: vi.fn().mockImplementation((_col2: string, eVal: string) => ({
                  order: vi.fn().mockImplementation(async () => ({
                    data: cashFlowStore.filter(
                      (r) => String(r.created_at || '') >= sVal && String(r.created_at || '') <= eVal
                    ),
                    error: null,
                  })),
                })),
              })),
            }),
            insert: vi.fn().mockImplementation(async (payload: any) => {
              const items = Array.isArray(payload) ? payload : [payload];
              const created: any[] = [];
              for (const item of items) {
                const inserted = {
                  id: `cf-alif-clearance-${cashFlowStore.length + 1}`,
                  ...item,
                };
                cashFlowStore.push(inserted);
                created.push(inserted);
              }
              return { data: Array.isArray(payload) ? created : created[0], error: null };
            }),
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
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
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return makePagedSelect([]);
      });

      const report = await getCashFlowReport('2026-11-01', '2026-11-30', 'all');
      expect(report.outflowTotal).toBe(10460000);
      expect(report.inflowTotal).toBe(0);
      expect(report.netCashflow).toBe(-10460000);
      expect(report.transactions).toHaveLength(1);
      expect(report.transactions[0]).toMatchObject({
        kategori: 'KLIRING_ANGGOTA_KELUAR',
        kas_masuk: 0,
        kas_keluar: 10460000,
        reference_id: 'mem-alif',
        direction: 'out',
        deskripsi:
          'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
      });
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('getShuEstimation excludes KLIRING_ANGGOTA_KELUAR so member resignation clearance does not reduce SHU', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      (supabase.from as any).mockImplementation((table: string) => {
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
                      data: [
                        { amount: 10460000, category: 'KLIRING_ANGGOTA_KELUAR', direction: 'out' },
                        { amount: 150000, category: 'beban_operasional', direction: 'out' },
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

      const shu = await getShuEstimation('2026-11-01', '2026-11-30');
      expect(shu.opex).toBe(150000);
      expect(shu.estimatedShu).toBe(-150000);
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('getCashFlowReport deduplicates duplicate CF-13BA88C2 & CF-2A2CEE11 clearance rows and ensures parallel StrictMode calls produce 1 entry', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cashFlowStore: any[] = [
        {
          id: '13ba88c2-0000-4000-8000-000000000001',
          category: 'KLIRING_ANGGOTA_KELUAR',
          direction: 'out',
          amount: 10460000,
          reference_id: 'mem-alif',
          description:
            'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
          created_at: '2026-11-19T14:20:00.000Z',
        },
        {
          id: '2a2cee11-0000-4000-8000-000000000002',
          category: 'KLIRING_ANGGOTA_KELUAR',
          direction: 'out',
          amount: 10460000,
          reference_id: 'mem-alif',
          description:
            'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
          created_at: '2026-11-19T14:20:00.000Z',
        },
      ];
      const anggotaRows = [
        {
          id: 'mem-alif',
          nrp: '(lama 1) 00010062',
          nama: 'MOCH. ALIF NURSYARIFUDDIN',
          status: 'nonaktif',
          membership_status: 'RESIGNED',
          updated_at: '2026-11-19T14:20:00.000Z',
        },
      ];

      const makePagedSelect = (rows: any[]) => ({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation(async (col: string, vals: any[]) => ({
            data: rows.filter((r) => vals.includes(r[col])),
            error: null,
          })),
          range: vi.fn().mockImplementation(async (from: number, to: number) => ({
            data: rows.slice(from, to + 1),
            error: null,
          })),
        }),
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') return makePagedSelect(anggotaRows);
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(async (col: string, val: any) => ({
                data: cashFlowStore.filter((r) => r[col] === val),
                error: null,
              })),
              range: vi.fn().mockImplementation(async (from: number, to: number) => {
                await new Promise((r) => setTimeout(r, 10));
                return { data: cashFlowStore.slice(from, to + 1), error: null };
              }),
              gte: vi.fn().mockImplementation((_col: string, sVal: string) => ({
                lte: vi.fn().mockImplementation((_col2: string, eVal: string) => ({
                  order: vi.fn().mockImplementation(async () => ({
                    data: cashFlowStore.filter(
                      (r) => String(r.created_at || '') >= sVal && String(r.created_at || '') <= eVal
                    ),
                    error: null,
                  })),
                })),
              })),
            }),
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation(async (_col: string, ids: string[]) => {
                for (const id of ids) {
                  const idx = cashFlowStore.findIndex((r) => r.id === id);
                  if (idx >= 0) cashFlowStore.splice(idx, 1);
                }
                return { data: null, error: null };
              }),
            }),
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
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
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return makePagedSelect([]);
      });

      const [reportA, reportB] = await Promise.all([
        getCashFlowReport('2026-11-01', '2026-11-30', 'all'),
        getCashFlowReport('2026-11-01', '2026-11-30', 'all'),
      ]);

      expect(cashFlowStore).toHaveLength(1);
      expect(cashFlowStore[0].id).toBe('13ba88c2-0000-4000-8000-000000000001');

      for (const report of [reportA, reportB]) {
        expect(report.transactions).toHaveLength(1);
        expect(report.transactions[0].referensi).toBe('CF-13BA88C2');
        expect(report.transactions[0].kas_keluar).toBe(10460000);
        expect(report.outflowTotal).toBe(10460000);
        expect(report.netCashflow).toBe(-10460000);
      }
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('applies in-memory deduplication guard in getCashFlowReport when DB delete fails and in LaporanKeuangan component UI', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cashFlowStore: any[] = [
        {
          id: '13ba88c2-0000-4000-8000-000000000001',
          category: 'KLIRING_ANGGOTA_KELUAR',
          direction: 'out',
          amount: 10460000,
          reference_id: 'mem-alif',
          description:
            'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
          created_at: '2026-11-19T14:20:00.000Z',
        },
        {
          id: '2a2cee11-0000-4000-8000-000000000002',
          category: 'KLIRING_ANGGOTA_KELUAR',
          direction: 'out',
          amount: 10460000,
          reference_id: 'mem-alif',
          description:
            'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
          created_at: '2026-11-19T14:20:00.000Z',
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                data: cashFlowStore.slice(from, to + 1),
                error: null,
              })),
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: cashFlowStore, error: null }),
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } }),
            }),
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
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
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      });

      const report = await getCashFlowReport('2026-11-01', '2026-11-30', 'all');
      expect(report.transactions).toHaveLength(1);
      expect(report.transactions[0].referensi).toBe('CF-13BA88C2');
      expect(report.outflowTotal).toBe(10460000);

      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LaporanKeuangan
            initialActiveTab="cashflow"
            initialCashFlowData={{
              inflowTotal: 0,
              outflowTotal: 20920000,
              netCashflow: -20920000,
              transactions: [
                {
                  id: '13ba88c2-0000-4000-8000-000000000001',
                  tanggal: '19/11/2026',
                  referensi: 'CF-13BA88C2',
                  deskripsi:
                    'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
                  kategori: 'KLIRING_ANGGOTA_KELUAR',
                  unit_usaha: 'Umum',
                  kas_masuk: 0,
                  kas_keluar: 10460000,
                  saldo_berjalan: -10460000,
                  reference_id: 'mem-alif',
                  direction: 'out',
                  created_at: '2026-11-19T14:20:00.000Z',
                },
                {
                  id: '2a2cee11-0000-4000-8000-000000000002',
                  tanggal: '19/11/2026',
                  referensi: 'CF-2A2CEE11',
                  deskripsi:
                    'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
                  kategori: 'KLIRING_ANGGOTA_KELUAR',
                  unit_usaha: 'Umum',
                  kas_masuk: 0,
                  kas_keluar: 10460000,
                  saldo_berjalan: -20920000,
                  reference_id: 'mem-alif',
                  direction: 'out',
                  created_at: '2026-11-19T14:20:00.000Z',
                },
              ],
            }}
          />
        </MemoryRouter>
      );

      expect(html).toContain('CF-13BA88C2');
      expect(html).not.toContain('CF-2A2CEE11');
      expect(html).toContain('10.460.000');
      expect(html).not.toContain('20.920.000');
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });
});

describe('Multi-Category Filter on Mutasi Arus Kas Terperinci', () => {
  const sampleTransactions: CashFlowTransaction[] = [
    {
      id: 'cf-1',
      tanggal: '18/11/2026',
      referensi: 'CF-POS-001',
      deskripsi: 'Penjualan Tunai POS INV-001',
      kategori: 'penjualan_tunai',
      unit_usaha: 'Retail Toko',
      kas_masuk: 120000,
      kas_keluar: 0,
      saldo_berjalan: 120000,
      reference_id: 'sale-1',
      direction: 'in',
    },
    {
      id: 'cf-2',
      tanggal: '18/11/2026',
      referensi: 'CF-POS-002',
      deskripsi: 'Penjualan Tunai POS INV-002',
      kategori: 'PENJUALAN_POS',
      unit_usaha: 'Retail Toko',
      kas_masuk: 80000,
      kas_keluar: 0,
      saldo_berjalan: 200000,
      reference_id: 'sale-2',
      direction: 'in',
    },
    {
      id: 'cf-3',
      tanggal: '19/11/2026',
      referensi: 'CF-ANG-001',
      deskripsi: 'Angsuran Pinjaman LOAN-001 bln ke-2',
      kategori: 'angsuran_pinjaman',
      unit_usaha: 'Simpan Pinjam',
      kas_masuk: 550000,
      kas_keluar: 0,
      saldo_berjalan: 750000,
      reference_id: 'loan-1',
      direction: 'in',
    },
    {
      id: 'cf-4',
      tanggal: '19/11/2026',
      referensi: 'CF-KLR-001',
      deskripsi: 'Kliring Pengunduran Diri Anggota',
      kategori: 'KLIRING_ANGGOTA_KELUAR',
      unit_usaha: 'Simpan Pinjam',
      kas_masuk: 0,
      kas_keluar: 420000,
      saldo_berjalan: 330000,
      reference_id: 'mem-1',
      direction: 'out',
    },
  ];

  const sampleCashFlowData = {
    inflowTotal: 750000,
    outflowTotal: 420000,
    netCashflow: 330000,
    transactions: sampleTransactions,
  };

  it('merges raw category variants into normalized options with summed counts, badge styling, and alphabetical sorting', () => {
    expect(getNormalizedCategoryLabel('penjualan_tunai')).toBe('Penjualan POS');
    expect(getNormalizedCategoryLabel('PENJUALAN_POS')).toBe('Penjualan POS');
    expect(getNormalizedCategoryLabel('angsuran_pinjaman')).toBe('Angsuran Pinjaman');
    expect(getNormalizedCategoryLabel('KLIRING_ANGGOTA_KELUAR')).toBe('Kliring Anggota Keluar');

    const options = buildCashFlowCategoryOptions(sampleTransactions);

    expect(options).toEqual([
      {
        label: 'Angsuran Pinjaman',
        count: 1,
        bg: 'bg-amber-50',
        text: 'text-amber-800',
      },
      {
        label: 'Kliring Anggota Keluar',
        count: 1,
        bg: 'bg-rose-50 border border-rose-200',
        text: 'text-rose-700',
      },
      {
        label: 'Penjualan POS',
        count: 2,
        bg: 'bg-emerald-50',
        text: 'text-emerald-800',
      },
    ]);
  });

  it('filters cash flow transactions by multiple selected categories and combines with search query', () => {
    expect(filterCashFlowTransactions(sampleTransactions, '', [])).toHaveLength(4);

    const multiCategoryFiltered = filterCashFlowTransactions(sampleTransactions, '', [
      'Angsuran Pinjaman',
      'Kliring Anggota Keluar',
    ]);
    expect(multiCategoryFiltered.map((t) => t.referensi)).toEqual([
      'CF-ANG-001',
      'CF-KLR-001',
    ]);

    // Combines multi-category filter with search query matching normalized label or description
    const combinedWithDesc = filterCashFlowTransactions(
      sampleTransactions,
      'LOAN-001',
      ['Angsuran Pinjaman', 'Kliring Anggota Keluar']
    );
    expect(combinedWithDesc.map((t) => t.referensi)).toEqual(['CF-ANG-001']);

    const combinedWithNormalizedCat = filterCashFlowTransactions(
      sampleTransactions,
      'Penjualan POS',
      ['Penjualan POS', 'Angsuran Pinjaman']
    );
    expect(combinedWithNormalizedCat.map((t) => t.referensi)).toEqual([
      'CF-POS-001',
      'CF-POS-002',
    ]);
  });

  it('builds Excel export sheet rows reflecting filtered transactions, metadata row, normalized category, and filtered TOTAL', () => {
    const filtered = filterCashFlowTransactions(sampleTransactions, '', [
      'Angsuran Pinjaman',
      'Kliring Anggota Keluar',
    ]);

    const rows = buildCashFlowExportSheetRows({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      transactions: filtered,
      inflowTotal: 550000,
      outflowTotal: 420000,
      netCashflow: 130000,
      selectedCategories: ['Angsuran Pinjaman', 'Kliring Anggota Keluar'],
      searchQuery: '',
    });

    expect(rows[0]).toEqual(['LAPORAN ARUS KAS SIMKOP']);
    expect(rows[1]).toEqual(['Periode: 2026-11-01 s/d 2026-11-30']);
    expect(rows[2]).toEqual(['Filter Kategori: Angsuran Pinjaman, Kliring Anggota Keluar']);
    expect(rows[3]).toEqual([]);
    expect(rows[4]).toEqual([
      'Tanggal',
      'Referensi',
      'Deskripsi',
      'Kategori',
      'Unit',
      'Kas Masuk',
      'Kas Keluar',
      'Saldo Berjalan',
    ]);
    expect(rows[5][1]).toBe('CF-ANG-001');
    expect(rows[5][3]).toBe('Angsuran Pinjaman');
    expect(rows[6][1]).toBe('CF-KLR-001');
    expect(rows[6][3]).toBe('Kliring Anggota Keluar');
    expect(rows).toHaveLength(8);
    expect(rows[7]).toEqual(['', '', '', '', 'TOTAL', 550000, 420000, 130000]);
  });

  it('renders "Semua Kategori" dropdown trigger by default without active filter chips', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialActiveTab="cashflow"
          initialCashFlowData={sampleCashFlowData}
        />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="cashflow-category-filter-trigger"');
    expect(html).toContain('Semua Kategori');
    expect(html).not.toContain('data-testid="cashflow-category-filter-menu"');
    expect(html).not.toContain('data-testid="cashflow-active-category-chips"');
    expect(html).toContain('4 transaksi');
    expect(html).toContain('CF-POS-001');
    expect(html).toContain('CF-POS-002');
    expect(html).toContain('CF-ANG-001');
    expect(html).toContain('CF-KLR-001');
  });

  it('renders category checkbox dropdown menu with Pilih Semua, normalized labels, and counts when open', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialActiveTab="cashflow"
          initialCashFlowData={sampleCashFlowData}
          initialCategoryDropdownOpen={true}
          initialSelectedCategories={['Penjualan POS']}
        />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="cashflow-category-filter-menu"');
    expect(html).toContain('Pilih Kategori Mutasi');
    expect(html).toContain('Pilih Semua');
    expect(html).toContain('Reset');
    expect(html).toContain('1 Kategori Dipilih');
    expect(html).toContain('Angsuran Pinjaman');
    expect(html).toContain('Kliring Anggota Keluar');
    expect(html).toContain('Penjualan POS');
    expect(html).toContain('>2</span>');
    expect(html).toContain('>1</span>');
  });

  it('filters table rows, renders active category chips, and updates tfoot TOTAL while keeping overall KPI cards', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialActiveTab="cashflow"
          initialCashFlowData={sampleCashFlowData}
          initialSelectedCategories={['Angsuran Pinjaman', 'Kliring Anggota Keluar']}
        />
      </MemoryRouter>
    );

    expect(html).toContain('2 Kategori Dipilih');
    expect(html).toContain('2 / 4 transaksi');
    expect(html).toContain('data-testid="cashflow-active-category-chips"');
    expect(html).toContain('Hapus Semua Filter');
    expect(html).toContain('Hapus filter kategori Angsuran Pinjaman');
    expect(html).toContain('Hapus filter kategori Kliring Anggota Keluar');

    // Only matching transactions appear in table
    expect(html).toContain('CF-ANG-001');
    expect(html).toContain('CF-KLR-001');
    expect(html).not.toContain('CF-POS-001');
    expect(html).not.toContain('CF-POS-002');

    // Top KPI cards continue displaying overall period totals
    expect(html).toContain('750.000');
    expect(html).toContain('330.000');

    // Table footer TOTAL displays filtered totals
    const tfootMatch = html.match(/<tfoot[\s\S]*?<\/tfoot>/);
    expect(tfootMatch).not.toBeNull();
    const tfootHtml = tfootMatch![0];
    expect(tfootHtml).toContain('TOTAL');
    expect(tfootHtml).toContain('(Terfilter — 2 transaksi)');
    expect(tfootHtml).toContain('550.000');
    expect(tfootHtml).toContain('420.000');
    expect(tfootHtml).toContain('130.000');
  });

  it('renders category-specific empty state and omits tfoot when selected categories match zero rows', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialActiveTab="cashflow"
          initialCashFlowData={sampleCashFlowData}
          initialSelectedCategories={['Beban Operasional']}
        />
      </MemoryRouter>
    );

    expect(html).toContain('1 Kategori Dipilih');
    expect(html).toContain('0 / 4 transaksi');
    expect(html).toContain('Tidak ada mutasi arus kas untuk kategori yang dipilih');
    expect(html).not.toMatch(/<tfoot[\s\S]*?<\/tfoot>/);
  });
});

describe('Pre-Period Opening Balance & Cumulative Vault Balance', () => {
  const createStatefulMockFrom = (
    allCfRows: any[],
    depositTxs: any[] = [],
    allSalesRows: any[] = []
  ) => {
    return (table: string) => {
      if (table === 'store_credit_payments') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockImplementation(() => ({
            range: vi.fn().mockResolvedValue({ data: depositTxs, error: null }),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === 'member_deposits' || table === 'lebaran_disbursement_cycles') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [], error: null }),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [], error: null }),
            lt: vi.fn().mockImplementation((_col: string, boundary: string) => {
              const filtered = allSalesRows.filter(
                (r) =>
                  String(r.created_at || '') < boundary &&
                  r.sale_status === 'completed' &&
                  Number(r.paid_cash || 0) > 0
              );
              const builder: any = {
                eq: vi.fn().mockReturnThis(),
                gt: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                  data: filtered.slice(from, to + 1),
                  error: null,
                })),
              };
              return builder;
            }),
            gte: vi.fn().mockImplementation((_col: string, sVal: string) => ({
              lte: vi.fn().mockImplementation((_col2: string, eVal: string) => ({
                eq: vi.fn().mockReturnValue({
                  gt: vi.fn().mockResolvedValue({
                    data: allSalesRows.filter(
                      (r) =>
                        String(r.created_at || '') >= sVal &&
                        String(r.created_at || '') <= eVal &&
                        r.sale_status === 'completed' &&
                        Number(r.paid_cash || 0) > 0
                    ),
                    error: null,
                  }),
                }),
              })),
            })),
          }),
        };
      }
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === '*') {
              return {
                eq: vi.fn().mockImplementation((col: string, val: any) => {
                  const matched = allCfRows.filter((r) => r[col] === val);
                  return {
                    order: vi.fn().mockResolvedValue({ data: matched, error: null }),
                    then: (resolve: any) => resolve({ data: matched, error: null }),
                  };
                }),
              };
            }
            return {
              range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                data: allCfRows.slice(from, to + 1),
                error: null,
              })),
              lt: vi.fn().mockImplementation((_col: string, boundary: string) => {
                const prior = allCfRows.filter((r) => String(r.created_at || '') < boundary);
                return {
                  order: vi.fn().mockReturnValue({
                    range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                      data: prior.slice(from, to + 1),
                      error: null,
                    })),
                  }),
                };
              }),
              gte: vi.fn().mockImplementation((_col: string, sVal: string) => ({
                lte: vi.fn().mockImplementation((_col2: string, eVal: string) => ({
                  order: vi.fn().mockImplementation(async () => ({
                    data: allCfRows.filter(
                      (r) =>
                        String(r.created_at || '') >= sVal &&
                        String(r.created_at || '') <= eVal
                    ),
                    error: null,
                  })),
                })),
              })),
            };
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    };
  };

  it('computes pure helpers buildStartDateBoundaryIso, formatDateDdMmYyyy, and computeOpeningBalanceFromRows accurately', () => {
    expect(buildStartDateBoundaryIso('2026-11-01')).toBe('2026-11-01T00:00:00.000Z');
    expect(buildStartDateBoundaryIso('2026-11-01T00:00:00.000Z')).toBe('2026-11-01T00:00:00.000Z');
    expect(buildStartDateBoundaryIso('')).toBe('');

    expect(formatDateDdMmYyyy('2026-11-01')).toBe('01/11/2026');
    expect(formatDateDdMmYyyy('2026-03-01T00:00:00.000Z')).toBe('01/03/2026');

    const opening = computeOpeningBalanceFromRows(
      [
        {
          id: 'cf-open',
          direction: 'in',
          category: 'SALDO_AWAL_SIMPANAN',
          amount: 25640000,
          created_at: '2026-03-01T00:00:00.000Z',
        },
        {
          id: 'cf-dup-1',
          direction: 'out',
          category: 'KLIRING_ANGGOTA_KELUAR',
          amount: 5000000,
          reference_id: 'mem-1',
          created_at: '2026-06-10T10:00:00.000Z',
        },
        {
          id: 'cf-dup-2',
          direction: 'out',
          category: 'KLIRING_ANGGOTA_KELUAR',
          amount: 5000000,
          reference_id: 'mem-1',
          created_at: '2026-06-10T10:00:00.000Z',
        },
      ],
      [
        { id: 'sale-unsynced', paid_cash: 150000 },
      ]
    );
    expect(opening).toBe(20790000);
  });

  it('Scenario 1 (cut-off date 2026-03-01..2026-03-01): keeps SALDO_AWAL_SIMPANAN inside period inflow with openingBalance 0 and closingBalance Rp 25.640.000', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cfRows = [
        {
          id: 'cf-cutoff-mar',
          created_at: '2026-03-01T00:00:00.000Z',
          category: 'SALDO_AWAL_SIMPANAN',
          direction: 'in',
          amount: 25640000,
          reference_id: null,
        },
      ];
      const depositTxs = [
        {
          id: 'tx-open-mar',
          member_deposit_id: 'md-1',
          transaction_type: 'deposit',
          amount: 25640000,
          for_year: 2026,
          for_month: 2,
          description: 'Saldo Awal Cut-Off (s/d Feb 2026)',
          created_at: '2026-03-01T00:00:00.000Z',
        },
      ];
      (supabase.from as any).mockImplementation(createStatefulMockFrom(cfRows, depositTxs));

      const report = await getCashFlowReport('2026-03-01', '2026-03-01', 'all');
      expect(report.openingBalance).toBe(0);
      expect(report.inflowTotal).toBe(25640000);
      expect(report.outflowTotal).toBe(0);
      expect(report.netCashflow).toBe(25640000);
      expect(report.closingBalance).toBe(25640000);
      expect(report.transactions).toHaveLength(1);
      expect(report.transactions[0].saldo_berjalan).toBe(25640000);
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('Scenario 2 (2026-11-01..2026-11-20 with empty period): carries forward Rp 25.640.000 openingBalance so closingBalance stays Rp 25.640.000', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cfRows = [
        {
          id: 'cf-cutoff-mar',
          created_at: '2026-03-01T00:00:00.000Z',
          category: 'SALDO_AWAL_SIMPANAN',
          direction: 'in',
          amount: 25640000,
          reference_id: null,
        },
      ];
      const depositTxs = [
        {
          id: 'tx-open-mar',
          member_deposit_id: 'md-1',
          transaction_type: 'deposit',
          amount: 25640000,
          for_year: 2026,
          for_month: 2,
          description: 'Saldo Awal Cut-Off (s/d Feb 2026)',
          created_at: '2026-03-01T00:00:00.000Z',
        },
      ];
      (supabase.from as any).mockImplementation(createStatefulMockFrom(cfRows, depositTxs));

      const report = await getCashFlowReport('2026-11-01', '2026-11-20', 'all');
      expect(report.openingBalance).toBe(25640000);
      expect(report.inflowTotal).toBe(0);
      expect(report.outflowTotal).toBe(0);
      expect(report.netCashflow).toBe(0);
      expect(report.closingBalance).toBe(25640000);
      expect(report.transactions).toEqual([]);
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('Scenario 3 (period mutations + prior clearance dedup): starts saldo_berjalan from deduplicated openingBalance and updates closingBalance', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cfRows = [
        {
          id: 'cf-cutoff-mar',
          created_at: '2026-03-01T00:00:00.000Z',
          category: 'SALDO_AWAL_SIMPANAN',
          direction: 'in',
          amount: 25640000,
          reference_id: null,
        },
        {
          id: 'cf-prior-kliring-1',
          created_at: '2026-06-15T10:00:00.000Z',
          category: 'KLIRING_ANGGOTA_KELUAR',
          direction: 'out',
          amount: 5000000,
          reference_id: 'mem-resign-1',
        },
        {
          id: 'cf-prior-kliring-2',
          created_at: '2026-06-15T10:00:00.000Z',
          category: 'KLIRING_ANGGOTA_KELUAR',
          direction: 'out',
          amount: 5000000,
          reference_id: 'mem-resign-1',
        },
        {
          id: 'cf-nov-in-1',
          created_at: '2026-11-05T09:00:00.000Z',
          category: 'angsuran_pinjaman',
          direction: 'in',
          amount: 1000000,
          description: 'Angsuran Pinjaman Nov',
          reference_id: 'loan-nov-1',
        },
        {
          id: 'cf-nov-out-1',
          created_at: '2026-11-10T11:00:00.000Z',
          category: 'beban_operasional',
          direction: 'out',
          amount: 400000,
          description: 'Listrik & Operasional Nov',
          reference_id: null,
        },
      ];
      const depositTxs = [
        {
          id: 'tx-open-mar',
          member_deposit_id: 'md-1',
          transaction_type: 'deposit',
          amount: 25640000,
          for_year: 2026,
          for_month: 2,
          description: 'Saldo Awal Cut-Off (s/d Feb 2026)',
          created_at: '2026-03-01T00:00:00.000Z',
        },
      ];
      (supabase.from as any).mockImplementation(createStatefulMockFrom(cfRows, depositTxs));

      const report = await getCashFlowReport('2026-11-01', '2026-11-20', 'all');
      expect(report.openingBalance).toBe(20640000);
      expect(report.inflowTotal).toBe(1000000);
      expect(report.outflowTotal).toBe(400000);
      expect(report.netCashflow).toBe(600000);
      expect(report.closingBalance).toBe(21240000);
      expect(report.transactions).toHaveLength(2);
      expect(report.transactions[0].saldo_berjalan).toBe(21640000);
      expect(report.transactions[1].saldo_berjalan).toBe(21240000);
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('UI SSR (empty November period): renders Rp 0 period totals alongside Rp 25.640.000 Vault Balance, opening subtext, badge, and empty-state note', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialActiveTab="cashflow"
          initialStartDate="2026-11-01"
          initialEndDate="2026-11-20"
          initialCashFlowData={{
            openingBalance: 25640000,
            inflowTotal: 0,
            outflowTotal: 0,
            netCashflow: 0,
            closingBalance: 25640000,
            transactions: [],
          }}
        />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="vault-balance-value"');
    expect(html).toContain('Rp 25.640.000');
    expect(html).toContain('data-testid="vault-opening-balance-subtext"');
    expect(html).toContain('Saldo awal s/d 01/11/2026: Rp 25.640.000');
    expect(html).toContain('data-testid="cashflow-opening-balance-badge"');
    expect(html).toContain('Saldo Awal Sebelum Periode: Rp 25.640.000');
    expect(html).toContain('data-testid="cashflow-empty-vault-note"');
    expect(html).toContain('Tidak ada transaksi pada periode ini — Saldo Kas Brankas tetap Rp 25.640.000');
  });

  it('UI SSR (transactions present & negative balance styling): renders carry-forward row on page 1, cumulative tfoot, and rose colors when deficit', () => {
    const positiveHtml = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialActiveTab="cashflow"
          initialStartDate="2026-11-01"
          initialEndDate="2026-11-20"
          initialCashFlowData={{
            openingBalance: 20640000,
            inflowTotal: 1000000,
            outflowTotal: 400000,
            netCashflow: 600000,
            closingBalance: 21240000,
            transactions: [
              {
                id: 'tx-nov-1',
                tanggal: '5/11/2026',
                referensi: 'CF-NOV1',
                deskripsi: 'Angsuran Pinjaman Nov',
                kategori: 'angsuran_pinjaman',
                unit_usaha: 'Umum',
                kas_masuk: 1000000,
                kas_keluar: 0,
                saldo_berjalan: 21640000,
                direction: 'in',
                created_at: '2026-11-05T09:00:00.000Z',
              },
              {
                id: 'tx-nov-2',
                tanggal: '10/11/2026',
                referensi: 'CF-NOV2',
                deskripsi: 'Listrik & Operasional Nov',
                kategori: 'beban_operasional',
                unit_usaha: 'Umum',
                kas_masuk: 0,
                kas_keluar: 400000,
                saldo_berjalan: 21240000,
                direction: 'out',
                created_at: '2026-11-10T11:00:00.000Z',
              },
            ],
          }}
        />
      </MemoryRouter>
    );

    expect(positiveHtml).toContain('data-testid="cashflow-opening-balance-row"');
    expect(positiveHtml).toContain('SALDO-AWAL');
    expect(positiveHtml).toContain('Saldo Awal Kumulatif Sebelum Periode (01/11/2026)');
    expect(positiveHtml).toContain('Rp 20.640.000');
    const tfootMatch = positiveHtml.match(/<tfoot[\s\S]*?<\/tfoot>/);
    expect(tfootMatch).not.toBeNull();
    expect(tfootMatch![0]).toContain('Rp 21.240.000');

    const negativeHtml = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialActiveTab="cashflow"
          initialStartDate="2026-11-01"
          initialEndDate="2026-11-20"
          initialCashFlowData={{
            openingBalance: 1000000,
            inflowTotal: 0,
            outflowTotal: 2500000,
            netCashflow: -2500000,
            closingBalance: -1500000,
            transactions: [
              {
                id: 'tx-def-1',
                tanggal: '10/11/2026',
                referensi: 'CF-DEF1',
                deskripsi: 'Penarikan Simpanan Besar',
                kategori: 'penarikan_simpanan',
                unit_usaha: 'Umum',
                kas_masuk: 0,
                kas_keluar: 2500000,
                saldo_berjalan: -1500000,
                direction: 'out',
                created_at: '2026-11-10T11:00:00.000Z',
              },
            ],
          }}
        />
      </MemoryRouter>
    );

    expect(negativeHtml).toContain('border-rose-200');
    expect(negativeHtml).toContain('text-rose-700');
    expect(negativeHtml).toContain('text-rose-600');
    expect(negativeHtml).toContain('-1.500.000');
  });

  it('Excel export helper includes opening balance metadata and SALDO-AWAL carry-forward row when openingBalance is non-zero', () => {
    const rows = buildCashFlowExportSheetRows({
      startDate: '2026-11-01',
      endDate: '2026-11-20',
      openingBalance: 25640000,
      transactions: [
        {
          id: 'cf-nov-1',
          tanggal: '5/11/2026',
          referensi: 'CF-NOV1',
          deskripsi: 'Angsuran Pinjaman Nov',
          kategori: 'angsuran_pinjaman',
          unit_usaha: 'Umum',
          kas_masuk: 1000000,
          kas_keluar: 0,
          saldo_berjalan: 26640000,
        },
      ],
      inflowTotal: 1000000,
      outflowTotal: 0,
      netCashflow: 26640000,
    });

    expect(rows[0]).toEqual(['LAPORAN ARUS KAS SIMKOP']);
    expect(rows[1]).toEqual(['Periode: 2026-11-01 s/d 2026-11-20']);
    expect(rows[2]).toEqual(['Saldo Awal Sebelum Periode (< 01/11/2026): Rp 25.640.000']);
    expect(rows[3]).toEqual([]);
    expect(rows[4]).toEqual([
      'Tanggal',
      'Referensi',
      'Deskripsi',
      'Kategori',
      'Unit',
      'Kas Masuk',
      'Kas Keluar',
      'Saldo Berjalan',
    ]);
    expect(rows[5]).toEqual([
      '< 01/11/2026',
      'SALDO-AWAL',
      'Saldo Awal Kumulatif Sebelum Periode (01/11/2026)',
      'Saldo Bawaan',
      'Semua Unit',
      0,
      0,
      25640000,
    ]);
    expect(rows[6][1]).toBe('CF-NOV1');
    expect(rows[7]).toEqual(['', '', '', '', 'TOTAL', 1000000, 0, 26640000]);
  });

  it('renders PEMBAGIAN_SHU_RAT category badge as "Pembagian SHU (RAT)"', () => {
    const html = renderToStaticMarkup(<KategoriBadge kategori="PEMBAGIAN_SHU_RAT" />);
    expect(html).toContain('Pembagian SHU (RAT)');
    expect(html).toContain('bg-purple-50');
    expect(html).toContain('text-purple-800');
  });

  it('renders CLOSED fiscal year lock badge & banner when initialClosedFiscalYear is provided', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialStartDate="2026-01-01"
          initialEndDate="2026-12-31"
          initialClosedFiscalYear={{
            id: 'close-2026',
            fiscal_year: 2026,
            closing_date: '2026-12-31',
            opening_next_year_date: '2027-01-01',
            closing_cash_balance: 50_000_000,
            closing_loan_receivable: 15_000_000,
            closing_store_receivable: 2_000_000,
            closing_member_savings: 40_000_000,
            net_shu_amount: 10_000_000,
            reserve_fund_amount: 4_000_000,
            member_shu_total: 6_000_000,
            other_fund_amount: 0,
            payout_method: 'CASH_PAYOUT',
            status: 'CLOSED',
            executed_at: '2026-12-31T23:59:00Z',
          }}
        />
      </MemoryRouter>
    );

    expect(html).toContain('Periode Fiskal: Tahun Buku 2026');
    expect(html).toContain('CLOSED');
    expect(html).toContain('data-testid="fiscal-year-closed-banner"');
    expect(html).toContain('/admin/tutup-buku');
  });

  it('renders KOREKSI_PEMBATALAN badge as "Koreksi / Pembatalan" with rose styling and integrates into multi-category filter', () => {
    const html = renderToStaticMarkup(<KategoriBadge kategori="KOREKSI_PEMBATALAN" />);
    expect(html).toContain('Koreksi / Pembatalan');
    expect(html).toContain('bg-rose-50');
    expect(html).toContain('text-rose-700');
    expect(html).toContain('border-rose-200');
    expect(getNormalizedCategoryLabel('KOREKSI_PEMBATALAN')).toBe('Koreksi / Pembatalan');
    expect(getNormalizedCategoryLabel('koreksi_pembatalan')).toBe('Koreksi / Pembatalan');

    const sampleTxs: CashFlowTransaction[] = [
      {
        id: 'cf-setoran-1',
        tanggal: '20/11/2026',
        referensi: 'CF-SET00001',
        deskripsi: 'Setoran Simpanan Wajib [Nov 2026] — 00060019 - DONNY ILHAM PAMBUDI',
        kategori: 'Setoran Simpanan',
        unit_usaha: 'Umum',
        kas_masuk: 200000,
        kas_keluar: 0,
        saldo_berjalan: 17840000,
        direction: 'in',
        created_at: '2026-11-20T09:00:00.000Z',
      },
      {
        id: 'cf-batal-1',
        tanggal: '21/11/2026',
        referensi: 'CF-BAT00001',
        deskripsi:
          'Pembatalan Setoran Simpanan Wajib [Nov 2026] — 00060019 - DONNY ILHAM PAMBUDI | Alasan: "Salah input bulan" (Oleh: Admin)',
        kategori: 'KOREKSI_PEMBATALAN',
        unit_usaha: 'Umum',
        kas_masuk: 0,
        kas_keluar: 200000,
        saldo_berjalan: 17640000,
        direction: 'out',
        created_at: '2026-11-21T10:00:00.000Z',
      },
    ];

    const options = buildCashFlowCategoryOptions(sampleTxs);
    expect(options.map((o) => o.label)).toContain('Koreksi / Pembatalan');

    const filtered = filterCashFlowTransactions(sampleTxs, '', ['Koreksi / Pembatalan']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('cf-batal-1');
  });

  it('getCashFlowReport preserves original Setoran Simpanan row alongside KOREKSI_PEMBATALAN reversal entry and updates running balance', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const priorCfRows = [
        {
          id: 'cf-open-base',
          created_at: '2026-03-01T00:00:00.000Z',
          category: 'SALDO_AWAL_SIMPANAN',
          direction: 'in',
          amount: 17640000,
          reference_id: null,
        },
      ];
      const periodCfRows = [
        {
          id: 'cf-setoran-nov26',
          created_at: '2026-11-20T08:00:00.000Z',
          category: 'Setoran Simpanan',
          direction: 'in',
          amount: 200000,
          reference_id: 'tx-donny-nov26',
          description: 'Setoran Simpanan Wajib [Nov 2026] — 00060019 - DONNY ILHAM PAMBUDI',
        },
        {
          id: 'cf-reversal-nov26',
          created_at: '2026-11-21T10:00:00.000Z',
          category: 'KOREKSI_PEMBATALAN',
          direction: 'out',
          amount: 200000,
          reference_id: 'tx-donny-nov26',
          description:
            'Pembatalan Setoran Simpanan Wajib [Nov 2026] — 00060019 - DONNY ILHAM PAMBUDI | Alasan: "Salah input bulan" (Oleh: Admin)',
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return { eq: vi.fn().mockResolvedValue({ data: priorCfRows, error: null }) };
              }
              return {
                lt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: priorCfRows, error: null }),
                }),
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: periodCfRows, error: null }),
                  }),
                }),
                range: vi.fn().mockResolvedValue({ data: [...priorCfRows, ...periodCfRows], error: null }),
              };
            }),
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              lt: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gt: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
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
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'tx-open-1',
                    member_deposit_id: 'md-1',
                    transaction_type: 'deposit',
                    amount: 17640000,
                    for_year: 2026,
                    for_month: 2,
                    description: 'Saldo Awal Cut-Off (s/d Feb 2026)',
                    created_at: '2026-03-01T00:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const report = await getCashFlowReport('2026-11-01', '2026-11-30', 'all');
      expect(report.openingBalance).toBe(17640000);
      expect(report.inflowTotal).toBe(200000);
      expect(report.outflowTotal).toBe(200000);
      expect(report.closingBalance).toBe(17640000);
      expect(report.transactions).toHaveLength(2);
      expect(report.transactions[0]).toMatchObject({
        kategori: 'Setoran Simpanan',
        kas_masuk: 200000,
        saldo_berjalan: 17840000,
      });
      expect(report.transactions[1]).toMatchObject({
        kategori: 'KOREKSI_PEMBATALAN',
        kas_keluar: 200000,
        saldo_berjalan: 17640000,
      });
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('getShuEstimation excludes KOREKSI_PEMBATALAN from opex calculation', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      (supabase.from as any).mockImplementation((table: string) => {
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
                      data: [
                        { amount: 200000, category: 'KOREKSI_PEMBATALAN', direction: 'out' },
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

      const shu = await getShuEstimation('2026-11-01', '2026-11-30');
      expect(shu.opex).toBe(0);
      expect(shu.estimatedShu).toBe(0);
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('getCashFlowReport backfills SETORAN_ANGGOTA (CF-CF7E7572) with deposit type components, supports search & Excel export, and renders components cleanly without ellipsis truncation', async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cfRows = [
        {
          id: 'cf7e7572-1111-4000-8000-000000000001',
          created_at: '2026-11-21T08:00:05.000Z',
          category: 'SETORAN_ANGGOTA',
          direction: 'in',
          amount: 350000,
          reference_id: 'KW-SETOR-20261121-1837',
          description:
            'Setoran Anggota ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]',
        },
      ];
      const depositTxs = [
        {
          id: 'tx-zuh-w',
          member_deposit_id: 'md-zuh-w',
          transaction_type: 'deposit',
          amount: 200000,
          reference_no: 'KW-SETOR-20261121-1837',
          payment_method: 'tunai',
          description: 'Setoran Simpanan Wajib (Nov 2026)',
          created_at: '2026-11-21T08:00:00.000Z',
        },
        {
          id: 'tx-zuh-b',
          member_deposit_id: 'md-zuh-b',
          transaction_type: 'deposit',
          amount: 50000,
          reference_no: 'KW-SETOR-20261121-1837',
          payment_method: 'tunai',
          description: 'Setoran Simpanan Belanja (Nov 2026)',
          created_at: '2026-11-21T08:00:01.000Z',
        },
        {
          id: 'tx-zuh-l',
          member_deposit_id: 'md-zuh-l',
          transaction_type: 'deposit',
          amount: 100000,
          reference_no: 'KW-SETOR-20261121-1837',
          payment_method: 'tunai',
          description: 'Setoran Simpanan Lebaran (Nov 2026)',
          created_at: '2026-11-21T08:00:02.000Z',
        },
      ];
      const memberDeposits = [
        { id: 'md-zuh-w', member_id: 'mem-zuh', deposit_type_id: 'dt-wajib' },
        { id: 'md-zuh-b', member_id: 'mem-zuh', deposit_type_id: 'dt-belanja' },
        { id: 'md-zuh-l', member_id: 'mem-zuh', deposit_type_id: 'dt-lebaran' },
      ];
      const depositTypes = [
        { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
        { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' },
        { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Lebaran' },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return { eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
              }
              return {
                range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                  data: cfRows.slice(from, to + 1),
                  error: null,
                })),
                lt: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    range: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockImplementation(async () => ({
                      data: [...cfRows],
                      error: null,
                    })),
                  }),
                }),
              };
            }),
            update: vi.fn((payload: any) => ({
              eq: vi.fn(async (_col: string, id: string) => {
                const row = cfRows.find((r) => r.id === id);
                if (row && typeof payload.description === 'string') {
                  row.description = payload.description;
                }
                return { data: null, error: null };
              }),
            })),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockImplementation(() => ({
              in: vi.fn().mockImplementation(async (col: string, vals: any[]) => ({
                data: depositTxs.filter((tx: any) => vals.includes(tx[col])),
                error: null,
              })),
              range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                data: depositTxs.slice(from, to + 1),
                error: null,
              })),
            })),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockImplementation(() => ({
              in: vi.fn().mockImplementation(async (col: string, vals: any[]) => ({
                data: memberDeposits.filter((md: any) => vals.includes(md[col])),
                error: null,
              })),
              range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                data: memberDeposits.slice(from, to + 1),
                error: null,
              })),
            })),
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockImplementation(() => ({
              in: vi.fn().mockImplementation(async (col: string, vals: any[]) => ({
                data: depositTypes.filter((dt: any) => vals.includes(dt[col])),
                error: null,
              })),
              range: vi.fn().mockResolvedValue({ data: depositTypes, error: null }),
            })),
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              lt: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gt: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
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
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [], error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      });

      const report = await getCashFlowReport('2026-11-01', '2026-11-30', 'all');
      expect(report.transactions).toHaveLength(1);
      const expectedDesc =
        'Setoran Anggota (Wajib, Belanja, Lebaran) — ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]';
      expect(report.transactions[0]).toMatchObject({
        referensi: 'CF-CF7E7572',
        kategori: 'SETORAN_ANGGOTA',
        deskripsi: expectedDesc,
      });

      // Search box filtering matches deposit type component keywords
      expect(filterCashFlowTransactions(report.transactions, 'Lebaran', [])).toHaveLength(1);
      expect(filterCashFlowTransactions(report.transactions, 'Belanja', [])).toHaveLength(1);
      expect(filterCashFlowTransactions(report.transactions, 'Pokok', [])).toHaveLength(0);

      // Excel export outputs full enriched description
      const sheetRows = buildCashFlowExportSheetRows({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        transactions: report.transactions,
        inflowTotal: report.inflowTotal,
        outflowTotal: report.outflowTotal,
        netCashflow: report.netCashflow,
      });
      const txRow = sheetRows.find((r) => r[1] === 'CF-CF7E7572');
      expect(txRow?.[2]).toBe(expectedDesc);

      // UI SSR renders full description with line-clamp-2 (not truncate on td), tooltip title, and deposit component badges
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LaporanKeuangan
            initialActiveTab="cashflow"
            initialStartDate="2026-11-01"
            initialEndDate="2026-11-30"
            initialCashFlowData={report}
          />
        </MemoryRouter>
      );

      expect(html).toContain('CF-CF7E7572');
      expect(html).toContain(`title="${expectedDesc}"`);
      expect(html).toContain('line-clamp-2');
      expect(html).toContain('data-testid="cashflow-deposit-components"');
      expect(html).toContain('Jenis Simpanan:');
      expect(html).toContain('>Wajib</span>');
      expect(html).toContain('>Belanja</span>');
      expect(html).toContain('>Lebaran</span>');
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it("getCashFlowReport('2026-01-01', '2026-12-31', 'all') backfills missed Jan-26 Rp 200.000 matrix deposit for BAGUS BUDI PRASETYO (00050543) alongside SALDO_AWAL_SIMPANAN Rp 24.040.000 totaling Rp 24.240.000", async () => {
    const defaultFromImpl = (supabase.from as any).getMockImplementation();
    try {
      const cfRows: any[] = [
        {
          id: 'cf-saldo-awal-1',
          created_at: '2026-03-01T00:00:00.000Z',
          category: 'SALDO_AWAL_SIMPANAN',
          direction: 'in',
          amount: 24040000,
          reference_id: null,
          description:
            'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)',
        },
      ];
      const depositTxs = [
        {
          id: 'tx-opening-all',
          member_deposit_id: 'md-bagus-wajib',
          transaction_type: 'deposit',
          amount: 24040000,
          for_month: 2,
          for_year: 2026,
          description: 'Saldo Awal Cut-Off (s/d Feb 2026)',
          created_at: '2026-03-01T00:00:00.000Z',
        },
        {
          id: 'tx-bagus-jan26',
          member_deposit_id: 'md-bagus-wajib',
          transaction_type: 'deposit',
          amount: 200000,
          for_month: 1,
          for_year: 2026,
          description: 'Setoran Matriks WAJIB Jan 2026',
          reference_no: null,
          payment_method: 'tunai',
          created_at: '2026-11-21T10:00:00.000Z',
        },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'system_settings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { key: 'initial_savings_effective_date', value: '2026-03-01' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return {
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: cfRows.filter((r) => r.category === 'SALDO_AWAL_SIMPANAN'),
                      error: null,
                    }),
                  }),
                };
              }
              return {
                range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                  data: cfRows.slice(from, to + 1),
                  error: null,
                })),
                lt: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    range: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockImplementation(async () => ({
                      data: [...cfRows],
                      error: null,
                    })),
                  }),
                }),
              };
            }),
            insert: vi.fn().mockImplementation(async (rows: any[]) => {
              const items = Array.isArray(rows) ? rows : [rows];
              for (const r of items) {
                cfRows.push({ id: `cf-inserted-${cfRows.length + 1}`, ...r });
              }
              return { data: items, error: null };
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockImplementation(async (from: number, to: number) => ({
                data: depositTxs.slice(from, to + 1),
                error: null,
              })),
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({
                data: [{ id: 'md-bagus-wajib', balance: 3400000 }],
                error: null,
              }),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'md-bagus-wajib',
                    member_id: 'm-bagus',
                    deposit_type_id: 'dt-wajib',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'm-bagus', nrp: '00050543', nama: 'BAGUS BUDI PRASETYO' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              lt: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gt: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
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
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [], error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      });

      const report = await getCashFlowReport('2026-01-01', '2026-12-31', 'all');
      expect(report.transactions).toHaveLength(2);
      expect(report.transactions[0]).toMatchObject({
        kategori: 'SALDO_AWAL_SIMPANAN',
        kas_masuk: 24040000,
      });
      expect(report.transactions[1]).toMatchObject({
        kategori: 'Setoran Simpanan',
        deskripsi: 'Setoran Simpanan Wajib [Jan 2026] — 00050543 - BAGUS BUDI PRASETYO',
        kas_masuk: 200000,
        saldo_berjalan: 24240000,
      });
      expect(report.inflowTotal).toBe(24240000);
      expect(report.outflowTotal).toBe(0);
      expect(report.netCashflow).toBe(24240000);
      expect(report.closingBalance).toBe(24240000);
    } finally {
      if (defaultFromImpl) {
        (supabase.from as any).mockImplementation(defaultFromImpl);
      }
    }
  });

  it('sortCashFlowTransactionsByDate sorts ASC/DESC by timestamp and id without mutating input or changing chronological saldo_berjalan', () => {
    const baseRows: CashFlowTransaction[] = [
      {
        id: 'tx-2',
        tanggal: '10/11/2026',
        referensi: 'CF-TX02',
        deskripsi: 'Transaksi Kedua (same timestamp tie-break)',
        kategori: 'penjualan_tunai',
        unit_usaha: 'Retail Toko',
        kas_masuk: 500000,
        kas_keluar: 0,
        saldo_berjalan: 2500000,
        direction: 'in',
        created_at: '2026-11-10T09:00:00.000Z',
      },
      {
        id: 'tx-1',
        tanggal: '10/11/2026',
        referensi: 'CF-TX01',
        deskripsi: 'Transaksi Pertama (same timestamp tie-break)',
        kategori: 'penjualan_tunai',
        unit_usaha: 'Retail Toko',
        kas_masuk: 1000000,
        kas_keluar: 0,
        saldo_berjalan: 2000000,
        direction: 'in',
        created_at: '2026-11-10T09:00:00.000Z',
      },
      {
        id: 'tx-3',
        tanggal: '15/11/2026',
        referensi: 'CF-TX03',
        deskripsi: 'Transaksi Terbaru',
        kategori: 'beban_operasional',
        unit_usaha: 'Umum',
        kas_masuk: 0,
        kas_keluar: 300000,
        saldo_berjalan: 2200000,
        direction: 'out',
        created_at: '2026-11-15T14:30:00.000Z',
      },
    ];
    const snapshotIds = baseRows.map((r) => r.id);

    const asc = sortCashFlowTransactionsByDate(baseRows, 'asc');
    expect(asc.map((r) => r.id)).toEqual(['tx-1', 'tx-2', 'tx-3']);
    expect(asc.map((r) => r.saldo_berjalan)).toEqual([2000000, 2500000, 2200000]);

    const desc = sortCashFlowTransactionsByDate(baseRows, 'desc');
    expect(desc.map((r) => r.id)).toEqual(['tx-3', 'tx-2', 'tx-1']);
    expect(desc.map((r) => r.saldo_berjalan)).toEqual([2200000, 2500000, 2000000]);

    // Original array must not be mutated
    expect(baseRows.map((r) => r.id)).toEqual(snapshotIds);

    // Fallback parsing using dd/mm/yyyy tanggal when created_at is absent
    const fallbackRows: CashFlowTransaction[] = [
      {
        id: 'fb-b',
        tanggal: '20/11/2026',
        referensi: 'CF-FB2',
        deskripsi: 'Tanggal lebih baru tanpa created_at',
        kategori: 'penjualan_tunai',
        unit_usaha: 'Umum',
        kas_masuk: 100000,
        kas_keluar: 0,
        saldo_berjalan: 1100000,
      },
      {
        id: 'fb-a',
        tanggal: '5/11/2026',
        referensi: 'CF-FB1',
        deskripsi: 'Tanggal lebih lama tanpa created_at',
        kategori: 'penjualan_tunai',
        unit_usaha: 'Umum',
        kas_masuk: 1000000,
        kas_keluar: 0,
        saldo_berjalan: 1000000,
      },
    ];
    expect(sortCashFlowTransactionsByDate(fallbackRows, 'asc').map((r) => r.id)).toEqual([
      'fb-a',
      'fb-b',
    ]);
    expect(sortCashFlowTransactionsByDate(fallbackRows, 'desc').map((r) => r.id)).toEqual([
      'fb-b',
      'fb-a',
    ]);
  });

  it('UI SSR (TANGGAL sort header): renders ASC badge by default and DESC ordering with pinned SALDO-AWAL and accurate running balance', () => {
    const sampleData = {
      openingBalance: 20640000,
      inflowTotal: 1000000,
      outflowTotal: 400000,
      netCashflow: 600000,
      closingBalance: 21240000,
      transactions: [
        {
          id: 'tx-sort-1',
          tanggal: '5/11/2026',
          referensi: 'CF-SORT-1',
          deskripsi: 'Angsuran Pinjaman Awal',
          kategori: 'angsuran_pinjaman',
          unit_usaha: 'Umum',
          kas_masuk: 1000000,
          kas_keluar: 0,
          saldo_berjalan: 21640000,
          direction: 'in' as const,
          created_at: '2026-11-05T09:00:00.000Z',
        },
        {
          id: 'tx-sort-2',
          tanggal: '20/11/2026',
          referensi: 'CF-SORT-2',
          deskripsi: 'Biaya Operasional Terbaru',
          kategori: 'beban_operasional',
          unit_usaha: 'Umum',
          kas_masuk: 0,
          kas_keluar: 400000,
          saldo_berjalan: 21240000,
          direction: 'out' as const,
          created_at: '2026-11-20T15:00:00.000Z',
        },
      ],
    };

    const ascHtml = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialActiveTab="cashflow"
          initialStartDate="2026-11-01"
          initialEndDate="2026-11-30"
          initialCashFlowData={sampleData}
        />
      </MemoryRouter>
    );

    expect(ascHtml).toContain('data-testid="cashflow-sort-date-btn"');
    expect(ascHtml).toContain('aria-sort="ascending"');
    expect(ascHtml).toContain('TANGGAL');
    expect(ascHtml).toContain('>ASC<');
    expect(ascHtml.indexOf('CF-SORT-1')).toBeLessThan(ascHtml.indexOf('CF-SORT-2'));

    const descHtml = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanKeuangan
          initialActiveTab="cashflow"
          initialStartDate="2026-11-01"
          initialEndDate="2026-11-30"
          initialDateSortOrder="desc"
          initialCashFlowData={sampleData}
        />
      </MemoryRouter>
    );

    expect(descHtml).toContain('data-testid="cashflow-sort-date-btn"');
    expect(descHtml).toContain('aria-sort="descending"');
    expect(descHtml).toContain('>DESC<');

    // SALDO-AWAL remains pinned at the top above transaction rows even in DESC mode
    const idxOpening = descHtml.indexOf('SALDO-AWAL');
    const idxNewest = descHtml.indexOf('CF-SORT-2');
    const idxOldest = descHtml.indexOf('CF-SORT-1');
    expect(idxOpening).toBeGreaterThan(-1);
    expect(idxOpening).toBeLessThan(idxNewest);
    expect(idxNewest).toBeLessThan(idxOldest);

    // Chronological running balances remain attached to their respective rows
    const newestRowSegment = descHtml.slice(idxNewest, idxOldest);
    expect(newestRowSegment).toContain('Rp 21.240.000');
    const oldestRowSegment = descHtml.slice(idxOldest);
    expect(oldestRowSegment).toContain('Rp 21.640.000');
  });
});

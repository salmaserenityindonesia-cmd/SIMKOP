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
});

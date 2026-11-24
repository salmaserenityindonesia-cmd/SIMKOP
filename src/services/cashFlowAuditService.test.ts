import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  consolidateBulkLebaranCashFlow,
  deduplicateClearanceCashFlow,
  enrichDepositCashFlowDescriptions,
  enrichMemberClearanceCashFlowDescriptions,
  enrichMemberDepositCashFlowDescriptions,
  enrichPosCashFlowDescriptions,
  enrichStoreCreditCashFlowDescriptions,
  extractMemberNameFromDepositDescription,
  extractPaymentMethodFromDepositDescription,
  getCashFlowReferenceBreakdown,
  enrichWithdrawalCashFlowDescriptions,
  findAllCashFlowsByLoan,
  findCashFlowByLoanInstallment,
  getTraceBackDepositRows,
  syncApprovedLoansToCashFlow,
  syncMatrixDepositsToCashFlow,
  syncPosCashSalesToCashFlow,
  syncResignedMemberClearanceToCashFlow,
} from './cashFlowAuditService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('cashFlowAuditService - getCashFlowReferenceBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates SALDO_AWAL_SIMPANAN across Pokok, Wajib, Belanja, Lebaran, excludes post-cutoff txs, and checks journal parity', async () => {
    const depositTypes = [
      { id: 'dt-p', code: 'SP', name: 'Simpanan Pokok' },
      { id: 'dt-w', code: 'SW', name: 'Simpanan Wajib' },
      { id: 'dt-b', code: 'SB', name: 'Simpanan Belanja' },
      { id: 'dt-l', code: 'SL', name: 'Simpanan Lebaran' },
    ];
    const members = [
      { id: 'm-1', nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15' },
      { id: 'm-2', nrp: '88010002', nama: 'Siti Aminah', tanggal_lahir: '1985-05-20' },
    ];
    const memberDeposits = [
      { id: 'md-1p', member_id: 'm-1', deposit_type_id: 'dt-p' },
      { id: 'md-1w', member_id: 'm-1', deposit_type_id: 'dt-w' },
      { id: 'md-1b', member_id: 'm-1', deposit_type_id: 'dt-b' },
      { id: 'md-1l', member_id: 'm-1', deposit_type_id: 'dt-l' },
      { id: 'md-2p', member_id: 'm-2', deposit_type_id: 'dt-p' },
      { id: 'md-2w', member_id: 'm-2', deposit_type_id: 'dt-w' },
    ];
    const depositTransactions = [
      // Opening m-1: 100k + 500k + 250k + 150k = 1.000.000
      { id: 'tx-1', member_deposit_id: 'md-1p', transaction_type: 'deposit', amount: 100000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      { id: 'tx-2', member_deposit_id: 'md-1w', transaction_type: 'deposit', amount: 500000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      { id: 'tx-3', member_deposit_id: 'md-1b', transaction_type: 'deposit', amount: 250000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      { id: 'tx-4', member_deposit_id: 'md-1l', transaction_type: 'deposit', amount: 150000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      // Opening m-2: 100k + 400k = 500.000
      { id: 'tx-5', member_deposit_id: 'md-2p', transaction_type: 'deposit', amount: 100000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      { id: 'tx-6', member_deposit_id: 'md-2w', transaction_type: 'deposit', amount: 400000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      // Excluded: post-cutoff monthly deposit
      { id: 'tx-7', member_deposit_id: 'md-1w', transaction_type: 'deposit', amount: 50000, for_year: 2026, for_month: 3, description: 'Setoran Rutin Bulanan' },
      // Excluded: post-cutoff Setoran Simpanan Pokok
      { id: 'tx-8', member_deposit_id: 'md-2p', transaction_type: 'deposit', amount: 100000, for_year: null, for_month: null, description: 'Setoran Simpanan Pokok' },
    ];

    const tables: Record<string, any[]> = {
      deposit_transactions: depositTransactions,
      member_deposits: memberDeposits,
      deposit_types: depositTypes,
      anggota: members,
    };

    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        range: vi.fn().mockImplementation(async (from: number, to: number) => ({
          data: (tables[table] || []).slice(from, to + 1),
          error: null,
        })),
      }),
    }));

    const matchedRes = await getCashFlowReferenceBreakdown({
      id: 'b27310a3-0000-0000-0000-000000000001',
      category: 'SALDO_AWAL_SIMPANAN',
      amount: 1500000,
      direction: 'in',
      description: 'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)',
      created_at: '2026-03-01T00:00:00.000Z',
    });

    expect(matchedRes.kind).toBe('opening_savings');
    if (matchedRes.kind === 'opening_savings') {
      expect(matchedRes.journal.refCode).toBe('CF-B27310A3');
      expect(matchedRes.openingSavings.byDepositType).toMatchObject({
        pokok: 200000,
        wajib: 900000,
        belanja: 250000,
        lebaran: 150000,
        lainnya: 0,
      });
      expect(matchedRes.openingSavings.calculatedTotal).toBe(1500000);
      expect(matchedRes.openingSavings.journalAmount).toBe(1500000);
      expect(matchedRes.openingSavings.difference).toBe(0);
      expect(matchedRes.openingSavings.isMatched).toBe(true);
      expect(matchedRes.openingSavings.transactionCount).toBe(6);
      expect(matchedRes.openingSavings.memberRows).toHaveLength(2);
      expect(matchedRes.openingSavings.memberRows[0]).toMatchObject({
        nrp: '88010001',
        nama: 'Budi Santoso',
        pokok: 100000,
        wajib: 500000,
        belanja: 250000,
        lebaran: 150000,
        total: 1000000,
      });
      expect(matchedRes.openingSavings.memberRows[1]).toMatchObject({
        nrp: '88010002',
        nama: 'Siti Aminah',
        pokok: 100000,
        wajib: 400000,
        belanja: 0,
        lebaran: 0,
        total: 500000,
      });
    }

    // Mismatch detection
    const mismatchRes = await getCashFlowReferenceBreakdown({
      id: 'b27310a3-0000-0000-0000-000000000001',
      category: 'SALDO_AWAL_SIMPANAN',
      amount: 1400000,
      direction: 'in',
      created_at: '2026-03-01T00:00:00.000Z',
    });
    expect(mismatchRes.kind).toBe('opening_savings');
    if (mismatchRes.kind === 'opening_savings') {
      expect(mismatchRes.openingSavings.isMatched).toBe(false);
      expect(mismatchRes.openingSavings.difference).toBe(100000);
    }
  });

  it('supports paged fetching beyond 1,000 rows for SALDO_AWAL_SIMPANAN', async () => {
    const dtRows = Array.from({ length: 1250 }, (_, idx) => ({
      id: `tx-${idx + 1}`,
      member_deposit_id: `md-${idx + 1}`,
      transaction_type: 'deposit',
      amount: 10000,
      for_year: 2026,
      for_month: 2,
      description: 'Saldo Awal Cut-Off (s/d Feb 2026)',
    }));
    const mdRows = Array.from({ length: 1250 }, (_, idx) => ({
      id: `md-${idx + 1}`,
      member_id: `m-${idx + 1}`,
      deposit_type_id: 'dt-w',
    }));
    const members = Array.from({ length: 1250 }, (_, idx) => ({
      id: `m-${idx + 1}`,
      nrp: String(10000 + idx + 1),
      nama: `Anggota ${idx + 1}`,
      tanggal_lahir: '1990-02-10',
    }));
    const tables: Record<string, any[]> = {
      deposit_transactions: dtRows,
      member_deposits: mdRows,
      deposit_types: [{ id: 'dt-w', code: 'SW', name: 'Simpanan Wajib' }],
      anggota: members,
    };

    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        range: vi.fn().mockImplementation(async (from: number, to: number) => ({
          data: (tables[table] || []).slice(from, to + 1),
          error: null,
        })),
      }),
    }));

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-paged-1',
      category: 'SALDO_AWAL_SIMPANAN',
      amount: 12500000,
      created_at: '2026-03-01T00:00:00.000Z',
    });

    expect(res.kind).toBe('opening_savings');
    if (res.kind === 'opening_savings') {
      expect(res.openingSavings.transactionCount).toBe(1250);
      expect(res.openingSavings.memberRows).toHaveLength(1250);
      expect(res.openingSavings.calculatedTotal).toBe(12500000);
      expect(res.openingSavings.isMatched).toBe(true);
    }
  });

  it('loads POS sale details and normalizes both qty/price and quantity/unit_price sale_items', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'sale-uuid-1',
                  sale_number: 'POS-20261119-001',
                  member_id: 'm-1',
                  subtotal: 45000,
                  discount: 0,
                  total_amount: 45000,
                  paid_cash: 45000,
                  paid_deposit: 0,
                  paid_credit: 0,
                  payment_scheme: 'cash',
                  created_at: '2026-11-19T08:00:00.000Z',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'sale_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'si-1', product_name: 'Beras 5kg', qty: 1, price: 35000, subtotal: 35000 },
                { id: 'si-2', product_name: 'Gula 1kg', quantity: 1, unit_price: 10000 },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'm-1', nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-pos-1111',
      category: 'penjualan_tunai',
      amount: 45000,
      reference_id: 'sale-uuid-1',
      created_at: '2026-11-19T08:00:00.000Z',
    });

    expect(res.kind).toBe('pos_sale');
    if (res.kind === 'pos_sale') {
      expect(res.posSale.saleNumber).toBe('POS-20261119-001');
      expect(res.posSale.member?.nama).toBe('Budi Santoso');
      expect(res.posSale.items).toEqual([
        { id: 'si-1', productName: 'Beras 5kg', qty: 1, price: 35000, subtotal: 35000 },
        { id: 'si-2', productName: 'Gula 1kg', qty: 1, price: 10000, subtotal: 10000 },
      ]);
    }
  });

  it('loads PELUNASAN_BON_TOKO details with linked sales and member info', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'store_credit_payments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'scp-1',
                  sale_id: 'sale-credit-1',
                  amount: 150000,
                  payment_date: '2026-11-18',
                  receipt_number: 'KW-BON-001',
                  notes: 'Lunas tunai',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'sale-credit-1', sale_number: 'POS-BON-99', member_id: 'm-1', total_amount: 150000 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'm-1', nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-bon-1111',
      category: 'PELUNASAN_BON_TOKO',
      amount: 150000,
      reference_id: 'scp-1',
      created_at: '2026-11-18T10:00:00.000Z',
    });

    expect(res.kind).toBe('store_credit_payment');
    if (res.kind === 'store_credit_payment') {
      expect(res.storeCreditPayment.receiptNumber).toBe('KW-BON-001');
      expect(res.storeCreditPayment.saleNumber).toBe('POS-BON-99');
      expect(res.storeCreditPayment.member?.nrp).toBe('88010001');
    }
  });

  it('loads PENARIKAN_SIMPANAN details with member and deposit type info', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'dtx-w-1',
                  member_deposit_id: 'md-1b',
                  transaction_type: 'withdrawal',
                  amount: 200000,
                  description: 'Penarikan Simpanan Belanja',
                  reference_no: 'KW-WD-10',
                  payment_method: 'tunai',
                  notes: 'Keperluan keluarga',
                  created_at: '2026-11-15T09:00:00.000Z',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'md-1b', member_id: 'm-1', deposit_type_id: 'dt-b' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'm-1', nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'dt-b', code: 'SB', name: 'Simpanan Belanja' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-wd-1111',
      category: 'penarikan_simpanan',
      amount: 200000,
      direction: 'out',
      reference_id: 'dtx-w-1',
      created_at: '2026-11-15T09:00:00.000Z',
    });

    expect(res.kind).toBe('deposit_withdrawal');
    if (res.kind === 'deposit_withdrawal') {
      expect(res.depositWithdrawal.depositTypeName).toBe('Simpanan Belanja');
      expect(res.depositWithdrawal.depositTypeCode).toBe('SB');
      expect(res.depositWithdrawal.member?.nama).toBe('Budi Santoso');
      expect(res.depositWithdrawal.referenceNo).toBe('KW-WD-10');
    }
  });

  it('loads MODAL_KASIR_AWAL shift details with cashier name', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'cashier_shifts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'shift-1',
                  shift_number: 'SHIFT-20261119-01',
                  cashier_id: 'staff-1',
                  opened_at: '2026-11-19T07:00:00.000Z',
                  closed_at: null,
                  initial_cash: 500000,
                  cash_sales: 0,
                  expected_cash: 500000,
                  actual_cash: 500000,
                  difference: 0,
                  status: 'open',
                  notes: 'Modal awal pagi',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'pengelola') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'staff-1', nama: 'Kasir Dewi' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-shift-1',
      category: 'MODAL_KASIR_AWAL',
      amount: 500000,
      direction: 'out',
      reference_id: 'shift-1',
      created_at: '2026-11-19T07:00:00.000Z',
    });

    expect(res.kind).toBe('cashier_shift');
    if (res.kind === 'cashier_shift') {
      expect(res.cashierShift.shiftNumber).toBe('SHIFT-20261119-01');
      expect(res.cashierShift.cashierName).toBe('Kasir Dewi');
      expect(res.cashierShift.initialCash).toBe(500000);
    }
  });

  it('returns journal_only metadata cleanly for generic categories or missing reference_id', async () => {
    const res = await getCashFlowReferenceBreakdown({
      id: '99887766-1111-2222-3333-444455556666',
      category: 'beban_operasional',
      amount: 120000,
      direction: 'out',
      description: 'Pembayaran listrik kantor koperasi',
      reference_id: null,
      created_at: '2026-11-10T11:00:00.000Z',
    });

    expect(res.kind).toBe('journal_only');
    expect(res.journal).toMatchObject({
      id: '99887766-1111-2222-3333-444455556666',
      refCode: 'CF-99887766',
      category: 'beban_operasional',
      direction: 'out',
      amount: 120000,
      description: 'Pembayaran listrik kantor koperasi',
    });
  });

  it('loads bulk_lebaran_withdrawal breakdown by cycle reference_id with bank details and mismatch check', async () => {
    const cycleRow = {
      id: 'cycle-thr-2026',
      cycle_name: 'Pencairan THR Idul Fitri 2026',
      disbursement_date: '2026-03-20',
      source_type: 'MASSAL',
      total_members: 2,
      total_amount: 3000000,
      status: 'COMPLETED',
    };
    const itemRows = [
      {
        id: 'item-2',
        cycle_id: 'cycle-thr-2026',
        member_id: 'm-2',
        nrp: '88010002',
        member_name: 'Siti Aminah',
        bank_account: '222333444',
        amount_disbursed: 1800000,
      },
      {
        id: 'item-1',
        cycle_id: 'cycle-thr-2026',
        member_id: 'm-1',
        nrp: '88010001',
        member_name: 'Budi Santoso',
        bank_account: '111222333',
        amount_disbursed: 1200000,
      },
    ];
    const anggotaRows = [
      { id: 'm-1', nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15', bank_account_number: '111222333' },
      { id: 'm-2', nrp: '88010002', nama: 'Siti Aminah', tanggal_lahir: '1985-05-20', bank_account_number: '222333444' },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'lebaran_disbursement_cycles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: cycleRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'lebaran_disbursement_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: itemRows, error: null }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockImplementation((cols: string) => ({
            in: vi.fn().mockImplementation(async () => {
              if (cols.includes('bank_name')) {
                return {
                  data: null,
                  error: { code: '42703', message: 'column anggota.bank_name does not exist' },
                };
              }
              return { data: anggotaRows, error: null };
            }),
          })),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-bulk-1',
      category: 'penarikan_simpanan',
      amount: 3000000,
      direction: 'out',
      description: 'Pencairan Massal Simpanan Lebaran (Pencairan THR Idul Fitri 2026) — 2 Anggota (Rp 3.000.000)',
      reference_id: 'cycle-thr-2026',
      created_at: '2026-03-20T10:00:00.000Z',
    });

    expect(res.kind).toBe('bulk_lebaran_withdrawal');
    if (res.kind === 'bulk_lebaran_withdrawal') {
      expect(res.bulkLebaranWithdrawal.cycleName).toBe('Pencairan THR Idul Fitri 2026');
      expect(res.bulkLebaranWithdrawal.recipientCount).toBe(2);
      expect(res.bulkLebaranWithdrawal.calculatedTotal).toBe(3000000);
      expect(res.bulkLebaranWithdrawal.isMatched).toBe(true);
      expect(res.bulkLebaranWithdrawal.recipients[0]).toMatchObject({
        nrp: '88010001',
        nama: 'Budi Santoso',
        tanggal_lahir: '1983-08-15',
        bankAccountNumber: '111222333',
        amount: 1200000,
      });
    }
  });

  it('resolves individual deposit_withdrawal bank info with bank_name column fallback and legacy missing reference_id', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'lebaran_disbursement_cycles') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'dtx-legacy-1',
                  member_deposit_id: 'md-leb-1',
                  transaction_type: 'withdrawal',
                  amount: 750000,
                  description: 'Penarikan Simpanan Lebaran - Budi Santoso',
                  reference_no: 'KW-WD-99',
                  payment_method: 'transfer',
                  created_at: '2026-11-15T09:05:00.000Z',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'md-leb-1', member_id: 'm-1', deposit_type_id: 'dt-leb' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockImplementation((cols: string) => ({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockImplementation(async () => {
                if (cols.includes('bank_name')) {
                  return {
                    data: null,
                    error: { code: '42703', message: 'column bank_name does not exist' },
                  };
                }
                return {
                  data: {
                    id: 'm-1',
                    nrp: '88010001',
                    nama: 'Budi Santoso',
                    tanggal_lahir: '1983-08-15',
                    bank_account_number: '0099887766',
                  },
                  error: null,
                };
              }),
            }),
          })),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'dt-leb', code: 'LEBARAN', name: 'Simpanan Lebaran' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-legacy-1',
      category: 'penarikan_simpanan',
      amount: 750000,
      direction: 'out',
      description: '-',
      reference_id: null,
      created_at: '2026-11-15T09:00:00.000Z',
    });

    expect(res.kind).toBe('deposit_withdrawal');
    if (res.kind === 'deposit_withdrawal') {
      expect(res.journal.description).toBe(
        'Pencairan Simpanan Lebaran (Personal) — 88010001 - Budi Santoso (Rp 750.000)'
      );
      expect(res.depositWithdrawal.isLebaranPersonal).toBe(true);
      expect(res.depositWithdrawal.member?.bankAccountNumber).toBe('0099887766');
    }
  });

  it('enrichWithdrawalCashFlowDescriptions resolves dash descriptions for individual and bulk rows and skips DB when unnecessary', async () => {
    // 1. No queries if no withdrawal row has blank/dash description
    const alreadyRich = [
      {
        id: 'cf-1',
        kategori: 'penarikan_simpanan',
        deskripsi: 'Pencairan Simpanan Wajib — 88010001 - Budi Santoso (Rp 200.000)',
        kas_keluar: 200000,
        reference_id: 'tx-1',
        created_at: '2026-11-10T00:00:00Z',
      },
    ];
    const untouched = await enrichWithdrawalCashFlowDescriptions(alreadyRich);
    expect(untouched).toBe(alreadyRich);
    expect(supabase.from).not.toHaveBeenCalled();

    // 2. Batch enrichment for legacy '-' rows
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'lebaran_disbursement_cycles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'cycle-1',
                  cycle_name: 'THR 2026',
                  total_members: 15,
                  total_amount: 15000000,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'tx-ind-1',
                  member_deposit_id: 'md-1',
                  transaction_type: 'withdrawal',
                  amount: 350000,
                  description: 'Penarikan Simpanan Belanja',
                  created_at: '2026-11-12T10:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'md-1', member_id: 'm-1', deposit_type_id: 'dt-b' }],
              error: null,
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
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'dt-b', code: 'SB', name: 'Simpanan Belanja' }],
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    const enriched = await enrichWithdrawalCashFlowDescriptions([
      {
        id: 'cf-ind',
        kategori: 'penarikan_simpanan',
        deskripsi: '-',
        kas_keluar: 350000,
        reference_id: 'tx-ind-1',
        created_at: '2026-11-12T10:00:00Z',
      },
      {
        id: 'cf-bulk',
        kategori: 'Penarikan Simpanan',
        deskripsi: '',
        kas_keluar: 15000000,
        reference_id: 'cycle-1',
        created_at: '2026-03-20T10:00:00Z',
      },
    ]);

    expect(enriched[0].deskripsi).toBe(
      'Pencairan Simpanan Belanja — 88010001 - Budi Santoso (Rp 350.000)'
    );
    expect(enriched[1].deskripsi).toBe(
      'Pencairan Massal Simpanan Lebaran (THR 2026) — 15 Anggota (Rp 15.000.000)'
    );
  });

  it('consolidateBulkLebaranCashFlow merges 4 split legacy bulk rows into 1 aggregate row and preserves individual withdrawals', async () => {
    const cfRows: any[] = [
      {
        id: 'cf-split-1',
        created_at: '2026-11-19T02:00:00.000Z',
        description: null,
        category: 'penarikan_simpanan',
        direction: 'out',
        amount: 2400000,
        reference_id: 'tx-bulk-1',
      },
      {
        id: 'cf-split-2',
        created_at: '2026-11-19T02:00:01.000Z',
        description: null,
        category: 'penarikan_simpanan',
        direction: 'out',
        amount: 2400000,
        reference_id: 'tx-bulk-2',
      },
      {
        id: 'cf-ind-same-day',
        created_at: '2026-11-19T03:00:00.000Z',
        description: 'Pencairan Simpanan Wajib — 88010099 - Hendra (Rp 500.000)',
        category: 'penarikan_simpanan',
        direction: 'out',
        amount: 500000,
        reference_id: 'tx-ind-same-day',
      },
      {
        id: 'cf-split-3',
        created_at: '2026-11-19T02:00:02.000Z',
        description: null,
        category: 'penarikan_simpanan',
        direction: 'out',
        amount: 2400000,
        reference_id: 'tx-bulk-3',
      },
      {
        id: 'cf-split-4',
        created_at: '2026-11-19T02:00:03.000Z',
        description: null,
        category: 'penarikan_simpanan',
        direction: 'out',
        amount: 3600000,
        reference_id: 'tx-bulk-4',
      },
    ];

    const cycleRow = {
      id: 'cycle-thr-2026',
      cycle_name: 'Pencairan THR Idul Fitri 2026',
      disbursement_date: '2026-11-19',
      cut_off_date: '2026-11-19T00:00:00.000Z',
      source_type: 'MASSAL',
      total_members: 4,
      total_amount: 10800000,
      status: 'COMPLETED',
    };

    const depositTxs = [
      {
        id: 'tx-bulk-1',
        transaction_type: 'withdrawal',
        amount: 2400000,
        description: 'Pencairan Massal Simpanan Lebaran - Pencairan THR Idul Fitri 2026',
        reference_no: 'KW-THR-2026-001',
        notes: 'Pencairan Massal Simpanan Lebaran',
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T02:00:00.000Z',
      },
      {
        id: 'tx-bulk-2',
        transaction_type: 'withdrawal',
        amount: 2400000,
        description: 'Pencairan Massal Simpanan Lebaran - Pencairan THR Idul Fitri 2026',
        reference_no: 'KW-THR-2026-002',
        notes: 'Pencairan Massal Simpanan Lebaran',
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T02:00:01.000Z',
      },
      {
        id: 'tx-bulk-3',
        transaction_type: 'withdrawal',
        amount: 2400000,
        description: 'Pencairan Massal Simpanan Lebaran - Pencairan THR Idul Fitri 2026',
        reference_no: 'KW-THR-2026-003',
        notes: 'Pencairan Massal Simpanan Lebaran',
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T02:00:02.000Z',
      },
      {
        id: 'tx-bulk-4',
        transaction_type: 'withdrawal',
        amount: 3600000,
        description: 'Pencairan Massal Simpanan Lebaran - Pencairan THR Idul Fitri 2026',
        reference_no: 'KW-THR-2026-004',
        notes: 'Pencairan Massal Simpanan Lebaran',
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T02:00:03.000Z',
      },
      {
        id: 'tx-ind-same-day',
        transaction_type: 'withdrawal',
        amount: 500000,
        description: 'Penarikan Simpanan Wajib - Hendra',
        reference_no: 'KW-WD-099',
        notes: 'Keperluan pribadi',
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T03:00:00.000Z',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async (from: number, to: number) => ({
              data: cfRows.slice(from, to + 1),
              error: null,
            })),
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
      if (table === 'lebaran_disbursement_cycles') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [cycleRow], error: null }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn(async (_col: string, ids: string[]) => ({
              data: depositTxs.filter((tx) => ids.includes(tx.id)),
              error: null,
            })),
          }),
        };
      }
      return {};
    });

    const firstRun = await consolidateBulkLebaranCashFlow();
    expect(firstRun).toEqual({
      consolidatedGroups: 1,
      mergedRows: 3,
      updatedRows: 1,
    });
    expect(cfRows).toHaveLength(2);

    const consolidated = cfRows.find((r) => r.id === 'cf-split-1');
    expect(consolidated).toMatchObject({
      amount: 10800000,
      reference_id: 'cycle-thr-2026',
      description:
        'Pencairan Massal Simpanan Lebaran (Pencairan THR Idul Fitri 2026) — 4 Anggota (Rp 10.800.000)',
    });

    const individual = cfRows.find((r) => r.id === 'cf-ind-same-day');
    expect(individual).toMatchObject({
      amount: 500000,
      reference_id: 'tx-ind-same-day',
    });

    // Second run must be a no-op (idempotent)
    const secondRun = await consolidateBulkLebaranCashFlow();
    expect(secondRun).toEqual({
      consolidatedGroups: 0,
      mergedRows: 0,
      updatedRows: 0,
    });
  });

  it('consolidateBulkLebaranCashFlow handles (Massal) descriptions without reference_id, 42703 column fallback, and rollback guard when delete fails', async () => {
    // Part A: legacy "(Massal)" description rows + 42703 description column fallback
    const noDescRows: any[] = [
      {
        id: 'cf-m-1',
        created_at: '2026-11-19T08:00:00.000Z',
        description: 'Pencairan Simpanan Hari Raya (Lebaran) (Massal)',
        category: 'Penarikan Simpanan',
        direction: 'out',
        amount: 2400000,
        reference_id: null,
      },
      {
        id: 'cf-m-2',
        created_at: '2026-11-19T08:01:00.000Z',
        description: 'Pencairan Simpanan Hari Raya (Lebaran) (Massal)',
        category: 'Penarikan Simpanan',
        direction: 'out',
        amount: 3600000,
        reference_id: null,
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async (from: number, to: number) => ({
              data: noDescRows.slice(from, to + 1),
              error: null,
            })),
          }),
          update: vi.fn((payload: any) => ({
            eq: vi.fn(async (_col: string, id: string) => {
              if (payload.description !== undefined) {
                return {
                  data: null,
                  error: { code: '42703', message: 'column cash_flow.description does not exist' },
                };
              }
              const idx = noDescRows.findIndex((r) => r.id === id);
              if (idx >= 0) noDescRows[idx] = { ...noDescRows[idx], ...payload };
              return { data: null, error: null };
            }),
          })),
          delete: vi.fn(() => ({
            in: vi.fn(async (_col: string, ids: string[]) => {
              for (const id of ids) {
                const idx = noDescRows.findIndex((r) => r.id === id);
                if (idx >= 0) noDescRows.splice(idx, 1);
              }
              return { data: null, error: null };
            }),
          })),
        };
      }
      if (table === 'lebaran_disbursement_cycles') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'cycle-nov',
                  cycle_name: 'Pencairan THR Idul Fitri 2026',
                  disbursement_date: '2026-11-19',
                  source_type: 'MASSAL',
                  total_members: 2,
                  total_amount: 6000000,
                  status: 'COMPLETED',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    const fallbackRes = await consolidateBulkLebaranCashFlow();
    expect(fallbackRes).toEqual({
      consolidatedGroups: 1,
      mergedRows: 1,
      updatedRows: 1,
    });
    expect(noDescRows).toHaveLength(1);
    expect(noDescRows[0].amount).toBe(6000000);
    expect(noDescRows[0].reference_id).toBe('cycle-nov');

    // Part B: Rollback guard when delete fails
    const rollbackRows: any[] = [
      {
        id: 'cf-rb-1',
        created_at: '2026-11-19T08:00:00.000Z',
        description: 'Pencairan Simpanan Hari Raya (Lebaran) (Massal)',
        category: 'penarikan_simpanan',
        direction: 'out',
        amount: 2400000,
        reference_id: 'tx-1',
      },
      {
        id: 'cf-rb-2',
        created_at: '2026-11-19T08:01:00.000Z',
        description: 'Pencairan Simpanan Hari Raya (Lebaran) (Massal)',
        category: 'penarikan_simpanan',
        direction: 'out',
        amount: 3600000,
        reference_id: 'tx-2',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async (from: number, to: number) => ({
              data: rollbackRows.slice(from, to + 1),
              error: null,
            })),
          }),
          update: vi.fn((payload: any) => ({
            eq: vi.fn(async (_col: string, id: string) => {
              const idx = rollbackRows.findIndex((r) => r.id === id);
              if (idx >= 0) rollbackRows[idx] = { ...rollbackRows[idx], ...payload };
              return { data: null, error: null };
            }),
          })),
          delete: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: null,
              error: { message: 'RLS denied delete' },
            })),
          })),
        };
      }
      if (table === 'lebaran_disbursement_cycles') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    const rbRes = await consolidateBulkLebaranCashFlow();
    expect(rbRes).toEqual({
      consolidatedGroups: 0,
      mergedRows: 0,
      updatedRows: 0,
    });
    expect(rollbackRows).toHaveLength(2);
    expect(rollbackRows[0]).toMatchObject({
      amount: 2400000,
      reference_id: 'tx-1',
      description: 'Pencairan Simpanan Hari Raya (Lebaran) (Massal)',
    });
  });

  it('getCashFlowReferenceBreakdown falls back to LEBARAN deposit_transactions on the same date when lebaran_disbursement_items is empty', async () => {
    const cycleRow = {
      id: 'cycle-nov-19',
      cycle_name: 'Pencairan THR Idul Fitri 2026',
      disbursement_date: '2026-11-19',
      source_type: 'MASSAL',
      total_members: 4,
      total_amount: 10800000,
      status: 'COMPLETED',
    };

    const depositTypes = [
      { id: 'dt-leb', code: 'SL', name: 'Simpanan Lebaran' },
      { id: 'dt-wjb', code: 'SW', name: 'Simpanan Wajib' },
    ];
    const memberDeposits = [
      { id: 'md-1', member_id: 'm-1', deposit_type_id: 'dt-leb' },
      { id: 'md-2', member_id: 'm-2', deposit_type_id: 'dt-leb' },
      { id: 'md-3', member_id: 'm-3', deposit_type_id: 'dt-leb' },
      { id: 'md-4', member_id: 'm-4', deposit_type_id: 'dt-leb' },
      { id: 'md-wjb', member_id: 'm-1', deposit_type_id: 'dt-wjb' },
    ];
    const depositTxs = [
      {
        id: 'tx-1',
        member_deposit_id: 'md-1',
        transaction_type: 'withdrawal',
        amount: 2400000,
        description: 'Pencairan THR',
        reference_no: null,
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T09:00:00.000Z',
      },
      {
        id: 'tx-2',
        member_deposit_id: 'md-2',
        transaction_type: 'withdrawal',
        amount: 2400000,
        description: 'Pencairan THR',
        reference_no: null,
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T09:00:01.000Z',
      },
      {
        id: 'tx-3',
        member_deposit_id: 'md-3',
        transaction_type: 'withdrawal',
        amount: 2400000,
        description: 'Pencairan THR',
        reference_no: null,
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T09:00:02.000Z',
      },
      {
        id: 'tx-4',
        member_deposit_id: 'md-4',
        transaction_type: 'withdrawal',
        amount: 3600000,
        description: 'Pencairan THR',
        reference_no: null,
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T09:00:03.000Z',
      },
      // Non-Lebaran withdrawal on same date must be excluded
      {
        id: 'tx-wjb',
        member_deposit_id: 'md-wjb',
        transaction_type: 'withdrawal',
        amount: 500000,
        description: 'Penarikan Simpanan Wajib',
        reference_no: 'KW-WD-1',
        transaction_date: '2026-11-19',
        created_at: '2026-11-19T10:00:00.000Z',
      },
    ];
    const anggotaRows = [
      { id: 'm-1', nrp: '88010001', nama: 'Anggota 1', tanggal_lahir: '1983-08-15', bank_name: 'BRI', bank_account_number: '111001' },
      { id: 'm-2', nrp: '88010002', nama: 'Anggota 2', tanggal_lahir: '1985-05-20', bank_name: 'BRI', bank_account_number: '111002' },
      { id: 'm-3', nrp: '88010003', nama: 'Anggota 3', tanggal_lahir: '1990-02-10', bank_name: 'BRI', bank_account_number: '111003' },
      { id: 'm-4', nrp: '88010004', nama: 'Anggota 4', tanggal_lahir: '1994-03-12', bank_name: 'Mandiri', bank_account_number: '222004' },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'lebaran_disbursement_cycles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: cycleRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'lebaran_disbursement_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: depositTxs, error: null }),
          }),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: depositTypes, error: null }),
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: memberDeposits, error: null }),
            in: vi.fn(async (_col: string, ids: string[]) => ({
              data: memberDeposits.filter((md) => ids.includes(md.id)),
              error: null,
            })),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn(async (_col: string, ids: string[]) => ({
              data: anggotaRows.filter((a) => ids.includes(a.id)),
              error: null,
            })),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-nov-19',
      category: 'Penarikan Simpanan',
      amount: 10800000,
      direction: 'out',
      description:
        'Pencairan Massal Simpanan Lebaran (Pencairan THR Idul Fitri 2026) — 4 Anggota (Rp 10.800.000)',
      reference_id: 'cycle-nov-19',
      created_at: '2026-11-19T09:00:00.000Z',
    });

    expect(res.kind).toBe('bulk_lebaran_withdrawal');
    if (res.kind === 'bulk_lebaran_withdrawal') {
      expect(res.bulkLebaranWithdrawal.recipientCount).toBe(4);
      expect(res.bulkLebaranWithdrawal.calculatedTotal).toBe(10800000);
      expect(res.bulkLebaranWithdrawal.isMatched).toBe(true);
      expect(res.bulkLebaranWithdrawal.recipients.map((r) => r.nrp)).toEqual([
        '88010001',
        '88010002',
        '88010003',
        '88010004',
      ]);
      expect(res.bulkLebaranWithdrawal.recipients[3]).toMatchObject({
        bankName: 'Mandiri',
        bankAccountNumber: '222004',
        amount: 3600000,
      });
    }
  });

  it('loads Setoran Simpanan (individual_deposit) breakdown with receipt KW-2026/03/00050543, period, payment method, and member details', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'tx-bagus-mar26',
                  member_deposit_id: 'md-bagus',
                  transaction_type: 'deposit',
                  amount: 200000,
                  for_month: 3,
                  for_year: 2026,
                  description: 'Setoran Matriks WAJIB Mar 2026',
                  reference_no: 'KW-2026/03/00050543',
                  payment_method: 'tunai',
                  notes: 'Lunas via bendahara',
                  created_at: '2026-11-19T09:15:00.000Z',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'md-bagus', member_id: 'm-bagus', deposit_type_id: 'dt-wajib' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'm-bagus',
                  nrp: '00050543',
                  nama: 'BAGUS BUDI PRASETYO',
                  tanggal_lahir: '1986-07-15',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-setoran-1',
      category: 'Setoran Simpanan',
      amount: 200000,
      direction: 'in',
      description:
        'Setoran Simpanan Wajib [Mar 2026] — 00050543 - BAGUS BUDI PRASETYO (KW-2026/03/00050543)',
      reference_id: 'tx-bagus-mar26',
      created_at: '2026-11-19T09:15:00.000Z',
    });

    expect(res.kind).toBe('individual_deposit');
    if (res.kind === 'individual_deposit') {
      expect(res.individualDeposit).toMatchObject({
        transactionId: 'tx-bagus-mar26',
        memberId: 'm-bagus',
        nrp: '00050543',
        nama: 'BAGUS BUDI PRASETYO',
        memberNrp: '00050543',
        memberName: 'BAGUS BUDI PRASETYO',
        tanggal_lahir: '1986-07-15',
        depositTypeCode: 'WAJIB',
        depositTypeName: 'Simpanan Wajib',
        forMonth: 3,
        forYear: 2026,
        periodLabel: 'Mar 2026',
        shortPeriodLabel: 'Mar-26',
        periodCode: 'Mar-26',
        referenceNo: 'KW-2026/03/00050543',
        receiptNumber: 'KW-2026/03/00050543',
        paymentMethod: 'tunai',
        notes: 'Lunas via bendahara',
        amount: 200000,
      });
    }
  });

  it('enrichDepositCashFlowDescriptions enriches dash descriptions for Setoran Simpanan and skips DB when already populated', async () => {
    const richRows = [
      {
        id: 'cf-1',
        kategori: 'Setoran Simpanan',
        deskripsi:
          'Setoran Simpanan Wajib [Mar 2026] — 00050543 - BAGUS BUDI PRASETYO (KW-2026/03/00050543)',
        kas_masuk: 200000,
        kas_keluar: 0,
        reference_id: 'tx-bagus-mar26',
      },
    ];
    const untouched = await enrichDepositCashFlowDescriptions(richRows);
    expect(untouched).toBe(richRows);
    expect(supabase.from).not.toHaveBeenCalled();

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'tx-bagus-mar26',
                  member_deposit_id: 'md-bagus',
                  amount: 200000,
                  for_month: 3,
                  for_year: 2026,
                  reference_no: 'KW-2026/03/00050543',
                  description: 'Setoran Matriks WAJIB Mar 2026',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'md-bagus', member_id: 'm-bagus', deposit_type_id: 'dt-wajib' }],
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
      return {};
    });

    const enriched = await enrichDepositCashFlowDescriptions([
      {
        id: 'cf-dash',
        kategori: 'Setoran Simpanan',
        deskripsi: '-',
        kas_masuk: 200000,
        kas_keluar: 0,
        reference_id: 'tx-bagus-mar26',
      },
    ]);

    expect(enriched[0].deskripsi).toBe(
      'Setoran Simpanan Wajib [Mar 2026] — 00050543 - BAGUS BUDI PRASETYO (KW-2026/03/00050543)'
    );
  });

  it('computes beforeBalance, afterBalance, paymentMethod, and relatedSales for PELUNASAN_BON_TOKO breakdown', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'store_credit_payments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'scp-2',
                  sale_id: 'sale-2',
                  amount: 100000,
                  payment_date: '2026-11-19',
                  receipt_number: 'BYR-9901',
                  notes: '[Potong Gaji] Potong gaji Nov',
                  created_at: '2026-11-19T08:00:00.000Z',
                },
                error: null,
              }),
            }),
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'scp-1',
                  sale_id: 'sale-1',
                  amount: 50000,
                  created_at: '2026-11-10T08:00:00.000Z',
                },
                {
                  id: 'scp-2',
                  sale_id: 'sale-2',
                  amount: 100000,
                  created_at: '2026-11-19T08:00:00.000Z',
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
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'member_id') {
                return Promise.resolve({
                  data: [
                    {
                      id: 'sale-1',
                      sale_number: 'INV-20261101-01',
                      member_id: 'm-1',
                      total_amount: 150000,
                      paid_credit: 150000,
                      sale_status: 'completed',
                      created_at: '2026-11-01T08:00:00.000Z',
                    },
                    {
                      id: 'sale-2',
                      sale_number: 'INV-20261112-02',
                      member_id: 'm-1',
                      total_amount: 80000,
                      paid_credit: 50000,
                      sale_status: 'completed',
                      created_at: '2026-11-12T08:00:00.000Z',
                    },
                  ],
                  error: null,
                });
              }
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: val,
                    sale_number: 'INV-20261112-02',
                    member_id: 'm-1',
                    total_amount: 80000,
                    paid_credit: 50000,
                    created_at: '2026-11-12T08:00:00.000Z',
                  },
                  error: null,
                }),
              };
            }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'm-1', nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-bon-adv',
      category: 'PELUNASAN_BON_TOKO',
      amount: 100000,
      direction: 'in',
      reference_id: 'scp-2',
      created_at: '2026-11-19T08:00:00.000Z',
    });

    expect(res.kind).toBe('store_credit_payment');
    if (res.kind === 'store_credit_payment') {
      // Total credit = 150k + 50k = 200k; prior paid = 50k -> beforeBalance = 150k, afterBalance = 50k
      expect(res.storeCreditPayment.beforeBalance).toBe(150000);
      expect(res.storeCreditPayment.afterBalance).toBe(50000);
      expect(res.storeCreditPayment.paymentMethod).toBe('potong_gaji');
      expect(res.storeCreditPayment.relatedSales).toHaveLength(2);
      expect(res.storeCreditPayment.relatedSales?.[0].saleNumber).toBe('INV-20261112-02');
      expect(res.storeCreditPayment.relatedSales?.[1].saleNumber).toBe('INV-20261101-01');
    }
  });

  it('enrichStoreCreditCashFlowDescriptions enriches legacy PELUNASAN_BON_TOKO rows with receivable reduction details', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'store_credit_payments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'scp-leg-1',
                  sale_id: 'sale-leg-1',
                  amount: 100000,
                  receipt_number: 'BYR-LEG-01',
                  notes: '[Tunai] Pelunasan kasir',
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
              data: [{ id: 'sale-leg-1', member_id: 'm-1', paid_credit: 100000 }],
              error: null,
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
      return {};
    });

    const enriched = await enrichStoreCreditCashFlowDescriptions([
      {
        id: 'cf-leg-1',
        kategori: 'PELUNASAN_BON_TOKO',
        deskripsi: 'Pelunasan Bon Toko BYR-LEG-01 (Tunai) [Budi Santoso]',
        kas_masuk: 100000,
        reference_id: 'scp-leg-1',
      },
    ]);

    expect(enriched[0].deskripsi).toBe(
      'Pelunasan Bon Toko (Tunai Kasir • BYR-LEG-01) — 88010001 - Budi Santoso | Piutang -Rp 100.000 (Sisa Piutang: Rp 0)'
    );
  });

  it('syncPosCashSalesToCashFlow backfills dash/null rows including CF-6D78C2A5, inserts missing paid_cash sales, and skips populated rows across Penjualan POS variants', async () => {
    const cfRows: any[] = [
      {
        id: '6d78c2a5-c33f-4ada-a9e1-022ca199e11e',
        category: 'penjualan_tunai',
        direction: 'in',
        amount: 100000,
        reference_id: 'sale-alif-1',
        description: null,
        created_at: '2026-11-19T08:54:02.742Z',
      },
      {
        id: 'cf-pos-dash-1',
        category: 'Penjualan POS',
        direction: 'in',
        amount: 45000,
        reference_id: 'sale-siti-2',
        description: '-',
        created_at: '2026-11-19T09:10:00.000Z',
      },
      {
        id: 'cf-pos-populated-1',
        category: 'PENJUALAN_POS',
        direction: 'in',
        amount: 25000,
        reference_id: 'sale-done-3',
        description: 'Penjualan Tunai (INV-DONE-003) — Pelanggan Umum (Rp 25.000)',
        created_at: '2026-11-19T09:20:00.000Z',
      },
    ];

    const salesRows = [
      {
        id: 'sale-alif-1',
        sale_number: 'INV-1795078441001',
        member_id: 'mem-alif',
        paid_cash: 100000,
        total_amount: 100000,
        payment_scheme: 'cash',
        sale_status: 'completed',
        created_at: '2026-11-19T08:54:01.438Z',
      },
      {
        id: 'sale-siti-2',
        sale_number: 'INV-1795078441002',
        member_id: 'mem-siti',
        paid_cash: 45000,
        total_amount: 45000,
        payment_scheme: 'cash',
        sale_status: 'completed',
        created_at: '2026-11-19T09:10:00.000Z',
      },
      {
        id: 'sale-done-3',
        sale_number: 'INV-DONE-003',
        member_id: null,
        paid_cash: 25000,
        total_amount: 25000,
        payment_scheme: 'cash',
        sale_status: 'completed',
        created_at: '2026-11-19T09:20:00.000Z',
      },
      {
        id: 'sale-missing-4',
        sale_number: 'INV-1795078441004',
        member_id: null,
        paid_cash: 30000,
        total_amount: 30000,
        payment_scheme: 'cash',
        sale_status: 'completed',
        created_at: '2026-11-19T09:30:00.000Z',
      },
    ];

    const members = [
      { id: 'mem-alif', nrp: '00010062', nama: 'MOCH. ALIF NURSYARIFUDDIN' },
      { id: 'mem-siti', nrp: '88010002', nama: 'Siti Aminah' },
    ];

    const updateSpy = vi.fn((payload: any) => ({
      eq: vi.fn(async (_col: string, id: string) => {
        const idx = cfRows.findIndex((r) => r.id === id);
        if (idx >= 0) cfRows[idx] = { ...cfRows[idx], ...payload };
        return { error: null };
      }),
    }));
    const insertSpy = vi.fn(async (payload: any) => {
      cfRows.push({ id: `cf-ins-${cfRows.length + 1}`, ...payload });
      return { error: null };
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn(async (from: number, to: number) => ({
              data: salesRows.slice(from, to + 1),
              error: null,
            })),
          }),
        };
      }
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn(async (from: number, to: number) => ({
              data: cfRows.slice(from, to + 1),
              error: null,
            })),
          }),
          update: updateSpy,
          insert: insertSpy,
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
      return {};
    });

    const result = await syncPosCashSalesToCashFlow();

    expect(result).toEqual({
      insertedCount: 1,
      updatedCount: 2,
      skippedCount: 3,
    });
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(cfRows[0].description).toBe(
      'Penjualan Tunai (INV-1795078441001) — 00010062 - MOCH. ALIF NURSYARIFUDDIN (Rp 100.000)'
    );
    expect(cfRows[1].description).toBe(
      'Penjualan Tunai (INV-1795078441002) — 88010002 - Siti Aminah (Rp 45.000)'
    );
    expect(cfRows[2].description).toBe(
      'Penjualan Tunai (INV-DONE-003) — Pelanggan Umum (Rp 25.000)'
    );
    expect(insertSpy).toHaveBeenCalledWith({
      direction: 'in',
      category: 'penjualan_tunai',
      amount: 30000,
      reference_id: 'sale-missing-4',
      description: 'Penjualan Tunai (INV-1795078441004) — Pelanggan Umum (Rp 30.000)',
      created_at: '2026-11-19T09:30:00.000Z',
    });
  });

  it('enrichPosCashFlowDescriptions enriches dash descriptions and skips DB when all POS rows already have valid descriptions', async () => {
    const alreadyValid = await enrichPosCashFlowDescriptions([
      {
        id: 'cf-ok',
        kategori: 'penjualan_tunai',
        deskripsi: 'Penjualan Tunai (INV-001) — Pelanggan Umum (Rp 20.000)',
        kas_masuk: 20000,
        reference_id: 's-ok',
      },
    ]);
    expect(alreadyValid[0].deskripsi).toBe(
      'Penjualan Tunai (INV-001) — Pelanggan Umum (Rp 20.000)'
    );
    expect(supabase.from).not.toHaveBeenCalled();

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'f9dec14d-7519-4195-a98d-41cc559ef386',
                  sale_number: 'INV-1795078441001',
                  member_id: 'mem-alif',
                  paid_cash: 100000,
                  total_amount: 100000,
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
              data: [{ id: 'mem-alif', nrp: '00010062', nama: 'MOCH. ALIF NURSYARIFUDDIN' }],
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    const enriched = await enrichPosCashFlowDescriptions([
      {
        id: '6d78c2a5-c33f-4ada-a9e1-022ca199e11e',
        kategori: 'penjualan_tunai',
        deskripsi: '-',
        kas_masuk: 100000,
        reference_id: 'f9dec14d-7519-4195-a98d-41cc559ef386',
      },
    ]);

    expect(enriched[0].deskripsi).toBe(
      'Penjualan Tunai (INV-1795078441001) — 00010062 - MOCH. ALIF NURSYARIFUDDIN (Rp 100.000)'
    );
  });

  it('getCashFlowReferenceBreakdown returns Penjualan Tunai and Penjualan Campuran paymentSchemeLabel and enriches blank journal description', async () => {
    let schemeMode: 'cash' | 'split' = 'cash';
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data:
                  schemeMode === 'cash'
                    ? {
                        id: 'f9dec14d-7519-4195-a98d-41cc559ef386',
                        sale_number: 'INV-1795078441001',
                        member_id: 'mem-alif',
                        subtotal: 100000,
                        discount: 0,
                        total_amount: 100000,
                        paid_cash: 100000,
                        paid_deposit: 0,
                        paid_credit: 0,
                        payment_scheme: 'cash',
                        created_at: '2026-11-19T08:54:01.438Z',
                      }
                    : {
                        id: 'sale-split-1',
                        sale_number: 'INV-1795078449999',
                        member_id: 'mem-alif',
                        subtotal: 100000,
                        discount: 0,
                        total_amount: 100000,
                        paid_cash: 40000,
                        paid_deposit: 60000,
                        paid_credit: 0,
                        payment_scheme: 'split',
                        created_at: '2026-11-19T09:00:00.000Z',
                      },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'sale_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'mem-alif', nrp: '00010062', nama: 'MOCH. ALIF NURSYARIFUDDIN', tanggal_lahir: '1990-02-10' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const cashBreakdown = await getCashFlowReferenceBreakdown({
      id: '6d78c2a5-c33f-4ada-a9e1-022ca199e11e',
      category: 'penjualan_tunai',
      amount: 100000,
      description: '-',
      reference_id: 'f9dec14d-7519-4195-a98d-41cc559ef386',
      created_at: '2026-11-19T08:54:02.742Z',
    });

    expect(cashBreakdown.kind).toBe('pos_sale');
    if (cashBreakdown.kind === 'pos_sale') {
      expect(cashBreakdown.posSale.paymentSchemeLabel).toBe('Penjualan Tunai');
      expect(cashBreakdown.journal.description).toBe(
        'Penjualan Tunai (INV-1795078441001) — 00010062 - MOCH. ALIF NURSYARIFUDDIN (Rp 100.000)'
      );
    }

    schemeMode = 'split';
    const splitBreakdown = await getCashFlowReferenceBreakdown({
      id: 'cf-split-1',
      category: 'Penjualan POS',
      amount: 40000,
      description: 'Pembelian Tunai (INV-1795078449999)',
      reference_id: 'sale-split-1',
      created_at: '2026-11-19T09:00:00.000Z',
    });

    expect(splitBreakdown.kind).toBe('pos_sale');
    if (splitBreakdown.kind === 'pos_sale') {
      expect(splitBreakdown.posSale.paymentSchemeLabel).toBe('Penjualan Campuran');
      expect(splitBreakdown.journal.description).toBe(
        'Penjualan Tunai (INV-1795078449999) — 00010062 - MOCH. ALIF NURSYARIFUDDIN (Rp 40.000)'
      );
    }
  });
});

describe('cashFlowAuditService - Kliring Anggota Keluar (KLIRING_ANGGOTA_KELUAR)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildPagedTableMock(rows: any[]) {
    return {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockImplementation(async (col: string, vals: any[]) => ({
          data: rows.filter((r) => vals.includes(r[col])),
          error: null,
        })),
        eq: vi.fn().mockImplementation((col: string, val: any) => {
          const filtered = rows.filter((r) => r[col] === val);
          return {
            maybeSingle: vi.fn().mockResolvedValue({ data: filtered[0] ?? null, error: null }),
            single: vi.fn().mockResolvedValue({ data: filtered[0] ?? null, error: null }),
            then: (onRes: any, onRej: any) =>
              Promise.resolve({ data: filtered, error: null }).then(onRes, onRej),
          };
        }),
        range: vi.fn().mockImplementation(async (from: number, to: number) => ({
          data: rows.slice(from, to + 1),
          error: null,
        })),
      }),
    };
  }

  it('syncResignedMemberClearanceToCashFlow backfills RESIGNED member (MOCH. ALIF NURSYARIFUDDIN Rp 10.460.000) idempotently and excludes SUSPENDED/BLOCKED/PENDING_RESIGNED/ACTIVE', async () => {
    const anggotaRows = [
      {
        id: 'mem-alif',
        nrp: '(lama 1) 00010062',
        nama: 'MOCH. ALIF NURSYARIFUDDIN',
        tanggal_lahir: '1990-02-10',
        status: 'nonaktif',
        membership_status: 'RESIGNED',
        updated_at: '2026-11-19T10:00:00.000Z',
        created_at: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'mem-susp',
        nrp: '88010010',
        nama: 'Anggota Beku',
        status: 'nonaktif',
        membership_status: 'SUSPENDED',
      },
      {
        id: 'mem-block',
        nrp: '88010011',
        nama: 'Anggota Diblokir',
        status: 'nonaktif',
        membership_status: 'BLOCKED',
      },
      {
        id: 'mem-pending',
        nrp: '88010012',
        nama: 'Anggota Piutang',
        status: 'aktif',
        membership_status: 'PENDING_RESIGNED',
      },
      {
        id: 'mem-active',
        nrp: '88010013',
        nama: 'Anggota Aktif',
        status: 'aktif',
        membership_status: 'ACTIVE',
      },
    ];

    const depositTypes = [
      { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
      { id: 'dt-pokok', code: 'POKOK', name: 'Simpanan Pokok' },
      { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' },
      { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Lebaran' },
    ];

    const memberDeposits = [
      { id: 'md-alif-w', member_id: 'mem-alif', deposit_type_id: 'dt-wajib' },
      { id: 'md-alif-p', member_id: 'mem-alif', deposit_type_id: 'dt-pokok' },
      { id: 'md-alif-b', member_id: 'mem-alif', deposit_type_id: 'dt-belanja' },
      { id: 'md-alif-l', member_id: 'mem-alif', deposit_type_id: 'dt-lebaran' },
    ];

    const depositTransactions = [
      { id: 'tx-1', member_deposit_id: 'md-alif-w', transaction_type: 'deposit', amount: 5000000, created_at: '2026-03-01T00:00:00.000Z' },
      { id: 'tx-2', member_deposit_id: 'md-alif-p', transaction_type: 'deposit', amount: 10000, created_at: '2026-03-01T00:00:00.000Z' },
      { id: 'tx-3', member_deposit_id: 'md-alif-b', transaction_type: 'deposit', amount: 1250000, created_at: '2026-03-01T00:00:00.000Z' },
      { id: 'tx-4', member_deposit_id: 'md-alif-l', transaction_type: 'deposit', amount: 4200000, created_at: '2026-03-01T00:00:00.000Z' },
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
        notes: 'Pengunduran diri disetujui',
        created_at: '2026-11-19T14:20:00.000Z',
      },
    ];

    const cashFlowRows: any[] = [];
    const insertedCashFlows: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildPagedTableMock(anggotaRows);
      if (table === 'deposit_types') return buildPagedTableMock(depositTypes);
      if (table === 'member_deposits') return buildPagedTableMock(memberDeposits);
      if (table === 'deposit_transactions') return buildPagedTableMock(depositTransactions);
      if (table === 'member_clearance_logs') return buildPagedTableMock(clearanceLogs);
      if (table === 'loans' || table === 'loan_repayments') return buildPagedTableMock([]);
      if (table === 'cash_flow') {
        const mock = buildPagedTableMock(cashFlowRows) as any;
        mock.insert = vi.fn().mockImplementation(async (payload: any) => {
          const row = { id: `cf-clr-${insertedCashFlows.length + 1}`, ...payload };
          cashFlowRows.push(row);
          insertedCashFlows.push(row);
          return { data: row, error: null };
        });
        mock.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
        return mock;
      }
      return buildPagedTableMock([]);
    });

    // Run 1: Backfill inserts exactly 1 row for MOCH. ALIF NURSYARIFUDDIN
    const firstRun = await syncResignedMemberClearanceToCashFlow();
    expect(firstRun.insertedCount).toBe(1);
    expect(insertedCashFlows).toHaveLength(1);
    expect(insertedCashFlows[0]).toMatchObject({
      direction: 'out',
      category: 'KLIRING_ANGGOTA_KELUAR',
      amount: 10460000,
      reference_id: 'mem-alif',
      description:
        'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
      created_at: '2026-11-19T14:20:00.000Z',
    });

    // Run 2: Idempotent — already synced, 0 new inserts
    const secondRun = await syncResignedMemberClearanceToCashFlow();
    expect(secondRun.insertedCount).toBe(0);
    expect(secondRun.skippedCount).toBe(1);
    expect(insertedCashFlows).toHaveLength(1);
  });

  it('syncResignedMemberClearanceToCashFlow handles explicit closing withdrawal rows and deficit INSTANT_PAYOFF (direction = in)', async () => {
    const anggotaRows = [
      {
        id: 'mem-closed-wd',
        nrp: '88010050',
        nama: 'Rina Lestari',
        status: 'nonaktif',
        membership_status: 'RESIGNED',
      },
      {
        id: 'mem-def-paid',
        nrp: '88010051',
        nama: 'Dedi Kurniawan',
        status: 'nonaktif',
        membership_status: 'RESIGNED',
      },
    ];

    const depositTypes = [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }];
    const memberDeposits = [
      { id: 'md-rina-w', member_id: 'mem-closed-wd', deposit_type_id: 'dt-wajib' },
      { id: 'md-dedi-w', member_id: 'mem-def-paid', deposit_type_id: 'dt-wajib' },
    ];
    const depositTransactions = [
      // Rina: ledger netted to 0 by explicit closing withdrawal
      { id: 'tx-r1', member_deposit_id: 'md-rina-w', transaction_type: 'deposit', amount: 3000000, created_at: '2026-03-01T00:00:00.000Z' },
      { id: 'tx-r2', member_deposit_id: 'md-rina-w', transaction_type: 'withdrawal', amount: 3000000, description: 'Pencairan Kliring Pengunduran Diri', created_at: '2026-11-18T11:00:00.000Z' },
      // Dedi: net savings 2.000.000, loan offset 5.500.000 -> net -3.500.000 (kas masuk)
      { id: 'tx-d1', member_deposit_id: 'md-dedi-w', transaction_type: 'deposit', amount: 2000000, created_at: '2026-03-01T00:00:00.000Z' },
    ];
    const loans = [
      { id: 'loan-dedi-1', member_id: 'mem-def-paid', loan_number: 'PJ-2026-77', notes: 'Pinjaman Konsumtif', amount: 5500000, status: 'completed' },
    ];
    const loanRepayments = [
      { id: 'rep-d1', loan_id: 'loan-dedi-1', amount_paid: 5500000, payment_method: 'POTONG_SIMPANAN_KLIRING', notes: 'Pelunasan otomatis melalui kliring anggota keluar', payment_date: '2026-11-19T09:00:00.000Z' },
    ];
    const clearanceLogs = [
      {
        id: 'mcl-dedi',
        anggota_id: 'mem-def-paid',
        settlement_type: 'INSTANT_PAYOFF',
        total_savings: 2000000,
        total_loans: 5500000,
        net_amount: -3500000,
        payment_method: 'Tunai Kasir',
        created_at: '2026-11-19T09:00:00.000Z',
      },
    ];

    const inserted: any[] = [];
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildPagedTableMock(anggotaRows);
      if (table === 'deposit_types') return buildPagedTableMock(depositTypes);
      if (table === 'member_deposits') return buildPagedTableMock(memberDeposits);
      if (table === 'deposit_transactions') return buildPagedTableMock(depositTransactions);
      if (table === 'loans') return buildPagedTableMock(loans);
      if (table === 'loan_repayments') return buildPagedTableMock(loanRepayments);
      if (table === 'member_clearance_logs') return buildPagedTableMock(clearanceLogs);
      if (table === 'cash_flow') {
        const mock = buildPagedTableMock([]) as any;
        mock.insert = vi.fn().mockImplementation(async (payload: any) => {
          inserted.push(payload);
          return { data: payload, error: null };
        });
        return mock;
      }
      return buildPagedTableMock([]);
    });

    const res = await syncResignedMemberClearanceToCashFlow();
    expect(res.insertedCount).toBe(2);

    const rinaRow = inserted.find((r) => r.reference_id === 'mem-closed-wd');
    expect(rinaRow).toMatchObject({
      direction: 'out',
      category: 'KLIRING_ANGGOTA_KELUAR',
      amount: 3000000,
    });
    expect(rinaRow.description).toContain('Kas Dibayarkan: Rp 3.000.000');

    const dediRow = inserted.find((r) => r.reference_id === 'mem-def-paid');
    expect(dediRow).toMatchObject({
      direction: 'in',
      category: 'KLIRING_ANGGOTA_KELUAR',
      amount: 3500000,
    });
    expect(dediRow.description).toContain('Hak Simpanan: Rp 2.000.000, Potong Utang: Rp 5.500.000, Kekurangan Disetor Anggota: Rp 3.500.000');
  });

  it('getCashFlowReferenceBreakdown returns MEMBER_CLEARANCE breakdown with 4 savings types and supports lookup via member_clearance_logs.id', async () => {
    const anggotaRows = [
      {
        id: 'mem-alif',
        nrp: '(lama 1) 00010062',
        nama: 'MOCH. ALIF NURSYARIFUDDIN',
        tanggal_lahir: '1990-02-10',
        status: 'nonaktif',
        membership_status: 'RESIGNED',
        bank_name: 'BRI',
        bank_account_number: '1234567890',
        updated_at: '2026-11-19T14:20:00.000Z',
      },
    ];
    const depositTypes = [
      { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
      { id: 'dt-pokok', code: 'POKOK', name: 'Simpanan Pokok' },
      { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' },
      { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Lebaran' },
    ];
    const memberDeposits = [
      { id: 'md-w', member_id: 'mem-alif', deposit_type_id: 'dt-wajib' },
      { id: 'md-p', member_id: 'mem-alif', deposit_type_id: 'dt-pokok' },
      { id: 'md-b', member_id: 'mem-alif', deposit_type_id: 'dt-belanja' },
      { id: 'md-l', member_id: 'mem-alif', deposit_type_id: 'dt-lebaran' },
    ];
    const depositTransactions = [
      { id: 'tx-w', member_deposit_id: 'md-w', transaction_type: 'deposit', amount: 5000000 },
      { id: 'tx-p', member_deposit_id: 'md-p', transaction_type: 'deposit', amount: 10000 },
      { id: 'tx-b', member_deposit_id: 'md-b', transaction_type: 'deposit', amount: 1250000 },
      { id: 'tx-l', member_deposit_id: 'md-l', transaction_type: 'deposit', amount: 4200000 },
    ];
    const clearanceLogs = [
      {
        id: 'mcl-alif-1',
        anggota_id: 'mem-alif',
        settlement_type: 'SURPLUS_PAYOUT',
        total_savings: 10460000,
        total_loans: 0,
        net_amount: 10460000,
        payment_method: 'Transfer Bank',
        notes: 'Pengunduran diri disetujui penuh',
        created_at: '2026-11-19T14:20:00.000Z',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildPagedTableMock(anggotaRows);
      if (table === 'deposit_types') return buildPagedTableMock(depositTypes);
      if (table === 'member_deposits') return buildPagedTableMock(memberDeposits);
      if (table === 'deposit_transactions') return buildPagedTableMock(depositTransactions);
      if (table === 'member_clearance_logs') return buildPagedTableMock(clearanceLogs);
      if (table === 'loans' || table === 'loan_repayments') return buildPagedTableMock([]);
      return buildPagedTableMock([]);
    });

    // Lookup by member.id
    const breakdownByMember = await getCashFlowReferenceBreakdown({
      id: 'cf-alif-001',
      category: 'KLIRING_ANGGOTA_KELUAR',
      amount: 10460000,
      direction: 'out',
      description: '-',
      reference_id: 'mem-alif',
      created_at: '2026-11-19T14:20:00.000Z',
    });

    expect(breakdownByMember.kind).toBe('MEMBER_CLEARANCE');
    if (breakdownByMember.kind === 'MEMBER_CLEARANCE') {
      expect(breakdownByMember.memberClearance.member.nrp).toBe('00010062');
      expect(breakdownByMember.memberClearance.member.nama).toBe('MOCH. ALIF NURSYARIFUDDIN');
      expect(breakdownByMember.memberClearance.totalSavings).toBe(10460000);
      expect(breakdownByMember.memberClearance.totalDebtOffset).toBe(0);
      expect(breakdownByMember.memberClearance.netSettlement).toBe(10460000);
      expect(breakdownByMember.memberClearance.isMatched).toBe(true);
      expect(breakdownByMember.memberClearance.savingsItems.map((i) => [i.name, i.amount])).toEqual([
        ['Simpanan Wajib', 5000000],
        ['Simpanan Pokok', 10000],
        ['Simpanan Belanja', 1250000],
        ['Simpanan Lebaran', 4200000],
      ]);
      expect(breakdownByMember.journal.description).toBe(
        'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000'
      );
    }

    // Lookup by member_clearance_logs.id
    const breakdownByLog = await getCashFlowReferenceBreakdown({
      id: 'cf-alif-002',
      category: 'KLIRING_ANGGOTA_KELUAR',
      amount: 10460000,
      direction: 'out',
      reference_id: 'mcl-alif-1',
      created_at: '2026-11-19T14:20:00.000Z',
    });
    expect(breakdownByLog.kind).toBe('MEMBER_CLEARANCE');
    if (breakdownByLog.kind === 'MEMBER_CLEARANCE') {
      expect(breakdownByLog.memberClearance.memberId).toBe('mem-alif');
      expect(breakdownByLog.memberClearance.totalSavings).toBe(10460000);
    }

    // enrichMemberClearanceCashFlowDescriptions enriches blank descriptions
    const enriched = await enrichMemberClearanceCashFlowDescriptions([
      {
        id: 'cf-alif-001',
        kategori: 'KLIRING_ANGGOTA_KELUAR',
        deskripsi: '-',
        kas_keluar: 10460000,
        reference_id: 'mem-alif',
      },
    ]);
    expect(enriched[0].deskripsi).toBe(
      'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000'
    );
  });

  it('deduplicateClearanceCashFlow removes CF-2A2CEE11 duplicates (by reference_id or NRP) and keeps CF-13BA88C2', async () => {
    const cashFlowRows: any[] = [
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
        id: '2a2cee11-9999-4000-8000-000000000003',
        category: 'KLIRING_ANGGOTA_KELUAR',
        direction: 'out',
        amount: 10460000,
        reference_id: 'mcl-alif-legacy',
        description:
          'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000',
        created_at: '2026-11-19T14:21:00.000Z',
      },
      {
        id: 'cf-pos-1',
        category: 'penjualan_tunai',
        direction: 'in',
        amount: 50000,
        reference_id: 'sale-1',
        description: 'Penjualan Tunai',
        created_at: '2026-11-19T09:00:00.000Z',
      },
    ];

    const deletedBatches: string[][] = [];
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'cash_flow') {
        const mock = buildPagedTableMock(cashFlowRows) as any;
        mock.delete = vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation(async (_col: string, ids: string[]) => {
            deletedBatches.push(ids);
            for (const id of ids) {
              const idx = cashFlowRows.findIndex((r) => r.id === id);
              if (idx >= 0) cashFlowRows.splice(idx, 1);
            }
            return { data: null, error: null };
          }),
        });
        return mock;
      }
      return buildPagedTableMock([]);
    });

    const result = await deduplicateClearanceCashFlow();
    expect(result.deletedCount).toBe(2);
    expect(result.keptCount).toBe(1);
    expect(result.deletedIds).toEqual([
      '2a2cee11-0000-4000-8000-000000000002',
      '2a2cee11-9999-4000-8000-000000000003',
    ]);
    expect(deletedBatches).toHaveLength(1);
    expect(cashFlowRows.map((r) => r.id)).toEqual([
      '13ba88c2-0000-4000-8000-000000000001',
      'cf-pos-1',
    ]);
  });

  it('syncResignedMemberClearanceToCashFlow uses in-flight mutex lock so concurrent calls insert exactly 1 row', async () => {
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
    const depositTypes = [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }];
    const memberDeposits = [{ id: 'md-alif-w', member_id: 'mem-alif', deposit_type_id: 'dt-wajib' }];
    const depositTransactions = [
      { id: 'tx-1', member_deposit_id: 'md-alif-w', transaction_type: 'deposit', amount: 10460000 },
    ];
    const clearanceLogs = [
      {
        id: 'mcl-alif',
        anggota_id: 'mem-alif',
        settlement_type: 'SURPLUS_PAYOUT',
        total_savings: 10460000,
        total_loans: 0,
        net_amount: 10460000,
        created_at: '2026-11-19T14:20:00.000Z',
      },
    ];

    const cashFlowRows: any[] = [];
    const insertedCashFlows: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildPagedTableMock(anggotaRows);
      if (table === 'deposit_types') return buildPagedTableMock(depositTypes);
      if (table === 'member_deposits') return buildPagedTableMock(memberDeposits);
      if (table === 'deposit_transactions') return buildPagedTableMock(depositTransactions);
      if (table === 'member_clearance_logs') return buildPagedTableMock(clearanceLogs);
      if (table === 'loans' || table === 'loan_repayments') return buildPagedTableMock([]);
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async (from: number, to: number) => {
              await new Promise((r) => setTimeout(r, 15));
              return { data: cashFlowRows.slice(from, to + 1), error: null };
            }),
          }),
          insert: vi.fn().mockImplementation(async (payload: any) => {
            await new Promise((r) => setTimeout(r, 15));
            const row = { id: `13ba88c2-0000-4000-8000-00000000000${insertedCashFlows.length + 1}`, ...payload };
            cashFlowRows.push(row);
            insertedCashFlows.push(row);
            return { data: row, error: null };
          }),
        };
      }
      return buildPagedTableMock([]);
    });

    const [resA, resB] = await Promise.all([
      syncResignedMemberClearanceToCashFlow(),
      syncResignedMemberClearanceToCashFlow(),
    ]);

    expect(resA).toBe(resB);
    expect(resA.insertedCount).toBe(1);
    expect(insertedCashFlows).toHaveLength(1);
    expect(cashFlowRows).toHaveLength(1);
  });

  it('syncResignedMemberClearanceToCashFlow cleans pre-existing CF-2A2CEE11 and skips insert when NRP already exists in description with null reference_id', async () => {
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
    const cashFlowRows: any[] = [
      {
        id: '13ba88c2-0000-4000-8000-000000000001',
        category: 'KLIRING_ANGGOTA_KELUAR',
        direction: 'out',
        amount: 10460000,
        reference_id: null,
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
    const insertedCashFlows: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildPagedTableMock(anggotaRows);
      if (table === 'cash_flow') {
        const mock = buildPagedTableMock(cashFlowRows) as any;
        mock.delete = vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation(async (_col: string, ids: string[]) => {
            for (const id of ids) {
              const idx = cashFlowRows.findIndex((r) => r.id === id);
              if (idx >= 0) cashFlowRows.splice(idx, 1);
            }
            return { data: null, error: null };
          }),
        });
        mock.insert = vi.fn().mockImplementation(async (payload: any) => {
          insertedCashFlows.push(payload);
          return { data: payload, error: null };
        });
        return mock;
      }
      return buildPagedTableMock([]);
    });

    const res = await syncResignedMemberClearanceToCashFlow();
    expect(res.deletedCount).toBe(1);
    expect(res.insertedCount).toBe(0);
    expect(res.skippedCount).toBe(1);
    expect(insertedCashFlows).toHaveLength(0);
    expect(cashFlowRows.map((r) => r.id)).toEqual(['13ba88c2-0000-4000-8000-000000000001']);
  });
});

describe('cashFlowAuditService - SETORAN_ANGGOTA & Trace-Back KW-SETOR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildTableMock(rows: any[]) {
    return {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockImplementation(async (col: string, vals: any[]) => ({
          data: rows.filter((r) => vals.includes(r[col])),
          error: null,
        })),
        eq: vi.fn().mockImplementation((col: string, val: any) => {
          const filtered = rows.filter((r) => r[col] === val);
          return {
            maybeSingle: vi.fn().mockResolvedValue({ data: filtered[0] ?? null, error: null }),
            single: vi.fn().mockResolvedValue({ data: filtered[0] ?? null, error: null }),
            then: (onRes: any, onRej: any) =>
              Promise.resolve({ data: filtered, error: null }).then(onRes, onRej),
          };
        }),
        range: vi.fn().mockImplementation(async (from: number, to: number) => ({
          data: rows.slice(from, to + 1),
          error: null,
        })),
      }),
    };
  }

  it('resolves SETORAN_ANGGOTA CF-EED98D59 (reference_id: null) via [KW-SETOR-20261120-3663] to itemized deposit_transactions totaling Rp 4.050.000', async () => {
    const anggotaRows = [
      { id: 'mem-bagus', nrp: '00050543', nama: 'BAGUS BUDI PRASETYO', tanggal_lahir: '1986-07-15' },
    ];
    const depositTypes = [
      { id: 'dt-pokok', code: 'POKOK', name: 'Simpanan Pokok' },
      { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
      { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' },
      { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Lebaran' },
    ];
    const memberDeposits = [
      { id: 'md-p', member_id: 'mem-bagus', deposit_type_id: 'dt-pokok' },
      { id: 'md-w', member_id: 'mem-bagus', deposit_type_id: 'dt-wajib' },
      { id: 'md-b', member_id: 'mem-bagus', deposit_type_id: 'dt-belanja' },
      { id: 'md-l', member_id: 'mem-bagus', deposit_type_id: 'dt-lebaran' },
    ];
    const depositTransactions = [
      {
        id: 'tx-p-1',
        member_deposit_id: 'md-p',
        transaction_type: 'deposit',
        amount: 500000,
        for_month: null,
        for_year: null,
        reference_no: 'KW-SETOR-20261120-3663',
        payment_method: 'tunai',
        description: 'Setoran Simpanan Pokok',
        notes: 'Metode: Tunai | Kwitansi: KW-SETOR-20261120-3663',
        created_at: '2026-11-20T09:00:00.000Z',
      },
      {
        id: 'tx-w-oct',
        member_deposit_id: 'md-w',
        transaction_type: 'deposit',
        amount: 1500000,
        for_month: 10,
        for_year: 2026,
        reference_no: 'KW-SETOR-20261120-3663',
        payment_method: 'tunai',
        description: 'Setoran Simpanan Wajib (Okt 2026)',
        notes: 'Metode: Tunai | Kwitansi: KW-SETOR-20261120-3663',
        created_at: '2026-11-20T09:00:01.000Z',
      },
      {
        id: 'tx-w-nov',
        member_deposit_id: 'md-w',
        transaction_type: 'deposit',
        amount: 1500000,
        for_month: 11,
        for_year: 2026,
        reference_no: 'KW-SETOR-20261120-3663',
        payment_method: 'tunai',
        description: 'Setoran Simpanan Wajib (Nov 2026)',
        notes: 'Metode: Tunai | Kwitansi: KW-SETOR-20261120-3663',
        created_at: '2026-11-20T09:00:02.000Z',
      },
      {
        id: 'tx-b-nov',
        member_deposit_id: 'md-b',
        transaction_type: 'deposit',
        amount: 250000,
        for_month: 11,
        for_year: 2026,
        reference_no: 'KW-SETOR-20261120-3663',
        payment_method: 'tunai',
        description: 'Setoran Simpanan Belanja (Nov 2026)',
        notes: 'Metode: Tunai | Kwitansi: KW-SETOR-20261120-3663',
        created_at: '2026-11-20T09:00:03.000Z',
      },
      {
        id: 'tx-l-nov',
        member_deposit_id: 'md-l',
        transaction_type: 'deposit',
        amount: 300000,
        for_month: 11,
        for_year: 2026,
        reference_no: 'KW-SETOR-20261120-3663',
        payment_method: 'tunai',
        description: 'Setoran Simpanan Lebaran (Nov 2026)',
        notes: 'Metode: Tunai | Kwitansi: KW-SETOR-20261120-3663',
        created_at: '2026-11-20T09:00:04.000Z',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildTableMock(anggotaRows);
      if (table === 'deposit_types') return buildTableMock(depositTypes);
      if (table === 'member_deposits') return buildTableMock(memberDeposits);
      if (table === 'deposit_transactions') return buildTableMock(depositTransactions);
      return buildTableMock([]);
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'eed98d59-1111-4000-8000-000000000001',
      referensi: 'CF-EED98D59',
      category: 'SETORAN_ANGGOTA',
      amount: 4050000,
      direction: 'in',
      reference_id: null,
      description:
        'Setoran Anggota BAGUS BUDI PRASETYO (00050543) - Tunai [KW-SETOR-20261120-3663]',
      created_at: '2026-11-20T09:00:05.000Z',
    });

    expect(res.kind).toBe('MEMBER_DEPOSIT_BATCH');
    if (res.kind === 'MEMBER_DEPOSIT_BATCH') {
      const b = res.memberDepositBatch;
      expect(b.receiptNumber).toBe('KW-SETOR-20261120-3663');
      expect(b.sourceMenu).toBe('Simpanan & Buku Besar → Setoran Simpanan');
      expect(b.member).toMatchObject({
        id: 'mem-bagus',
        nrp: '00050543',
        nama: 'BAGUS BUDI PRASETYO',
      });
      expect(b.items).toHaveLength(5);
      expect(b.totalAmount).toBe(4050000);
      expect(b.isMatched).toBe(true);
      expect(b.items.map((i) => i.periodLabel)).toEqual([
        'Kewajiban Pokok',
        'Oktober 2026',
        'November 2026',
        'November 2026',
        'November 2026',
      ]);
    }
  });

  it('falls back to matching historical deposit_transactions by member NRP and date when reference_no is missing', async () => {
    const anggotaRows = [
      { id: 'mem-bagus', nrp: '00050543', nama: 'BAGUS BUDI PRASETYO', tanggal_lahir: '1986-07-15' },
    ];
    const depositTypes = [
      { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
      { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' },
    ];
    const memberDeposits = [
      { id: 'md-w', member_id: 'mem-bagus', deposit_type_id: 'dt-wajib' },
      { id: 'md-b', member_id: 'mem-bagus', deposit_type_id: 'dt-belanja' },
    ];
    const depositTransactions = [
      {
        id: 'tx-hist-1',
        member_deposit_id: 'md-w',
        transaction_type: 'deposit',
        amount: 200000,
        for_month: 11,
        for_year: 2026,
        reference_no: null,
        description: 'Setoran Simpanan Wajib (Nov 2026)',
        created_at: '2026-11-20T09:00:00.000Z',
      },
      {
        id: 'tx-hist-2',
        member_deposit_id: 'md-b',
        transaction_type: 'deposit',
        amount: 50000,
        for_month: 11,
        for_year: 2026,
        reference_no: null,
        description: 'Setoran Simpanan Belanja (Nov 2026)',
        created_at: '2026-11-20T09:00:01.000Z',
      },
      {
        id: 'tx-hist-other-day',
        member_deposit_id: 'md-w',
        transaction_type: 'deposit',
        amount: 200000,
        for_month: 10,
        for_year: 2026,
        reference_no: null,
        description: 'Setoran Simpanan Wajib (Okt 2026)',
        created_at: '2026-10-15T09:00:00.000Z',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildTableMock(anggotaRows);
      if (table === 'deposit_types') return buildTableMock(depositTypes);
      if (table === 'member_deposits') return buildTableMock(memberDeposits);
      if (table === 'deposit_transactions') return buildTableMock(depositTransactions);
      return buildTableMock([]);
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'eed98d59-2222-4000-8000-000000000002',
      referensi: 'CF-EED98D59',
      category: 'SETORAN_ANGGOTA',
      amount: 250000,
      direction: 'in',
      reference_id: null,
      description:
        'Setoran Anggota BAGUS BUDI PRASETYO (00050543) - Tunai [KW-SETOR-20261120-9999]',
      created_at: '2026-11-20T09:00:02.000Z',
    });

    expect(res.kind).toBe('MEMBER_DEPOSIT_BATCH');
    if (res.kind === 'MEMBER_DEPOSIT_BATCH') {
      expect(res.memberDepositBatch.items).toHaveLength(2);
      expect(res.memberDepositBatch.totalAmount).toBe(250000);
      expect(res.memberDepositBatch.isMatched).toBe(true);
    }
  });

  it('getTraceBackDepositRows resolves both KW-SETOR-... and CF-... trace-back codes', async () => {
    const anggotaRows = [
      { id: 'mem-bagus', nrp: '00050543', nama: 'BAGUS BUDI PRASETYO', tanggal_lahir: '1986-07-15' },
    ];
    const depositTypes = [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }];
    const memberDeposits = [{ id: 'md-w', member_id: 'mem-bagus', deposit_type_id: 'dt-wajib' }];
    const depositTransactions = [
      {
        id: 'tx-w-nov',
        member_deposit_id: 'md-w',
        transaction_type: 'deposit',
        amount: 200000,
        for_month: 11,
        for_year: 2026,
        reference_no: 'KW-SETOR-20261120-3663',
        description: 'Setoran Simpanan Wajib (Nov 2026)',
        created_at: '2026-11-20T09:00:00.000Z',
      },
    ];
    const cashFlowRows = [
      {
        id: 'eed98d59-1111-4000-8000-000000000001',
        category: 'SETORAN_ANGGOTA',
        direction: 'in',
        amount: 200000,
        reference_id: null,
        description:
          'Setoran Anggota BAGUS BUDI PRASETYO (00050543) - Tunai [KW-SETOR-20261120-3663]',
        created_at: '2026-11-20T09:00:05.000Z',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildTableMock(anggotaRows);
      if (table === 'deposit_types') return buildTableMock(depositTypes);
      if (table === 'member_deposits') return buildTableMock(memberDeposits);
      if (table === 'deposit_transactions') return buildTableMock(depositTransactions);
      if (table === 'cash_flow') return buildTableMock(cashFlowRows);
      return buildTableMock([]);
    });

    const kwRes = await getTraceBackDepositRows('KW-SETOR-20261120-3663');
    expect(kwRes.items).toHaveLength(1);
    expect(kwRes.totalAmount).toBe(200000);
    expect(kwRes.member?.nrp).toBe('00050543');

    const cfRes = await getTraceBackDepositRows('CF-EED98D59');
    expect(cfRes.resolvedCashFlowRef).toBe('CF-EED98D59');
    expect(cfRes.resolvedReceiptCode).toBe('KW-SETOR-20261120-3663');
    expect(cfRes.items).toHaveLength(1);
    expect(cfRes.totalAmount).toBe(200000);
  });

  it('populates structured bidirectional trace fields for single matrix deposit without receipt number (CF-6C928789)', async () => {
    const anggotaRows = [
      { id: 'mem-donny', nrp: '00060019', nama: 'DONNY ILHAM PAMBUDI', tanggal_lahir: '1985-05-20' },
    ];
    const depositTypes = [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }];
    const memberDeposits = [{ id: 'md-donny-w', member_id: 'mem-donny', deposit_type_id: 'dt-wajib' }];
    const depositTransactions = [
      {
        id: 'tx-donny-mar26',
        member_deposit_id: 'md-donny-w',
        transaction_type: 'deposit',
        amount: 200000,
        for_month: 3,
        for_year: 2026,
        reference_no: null,
        payment_method: 'tunai',
        description: 'Setoran Matriks WAJIB Mar 2026',
        notes: 'Setoran Simpanan Wajib Mar-26',
        created_at: '2026-03-10T08:00:00.000Z',
      },
    ];
    const cashFlowRows = [
      {
        id: '6c928789-0000-4000-8000-000000000001',
        category: 'Setoran Simpanan',
        direction: 'in',
        amount: 200000,
        reference_id: 'tx-donny-mar26',
        description: 'Setoran Simpanan Wajib [Mar 2026] — 00060019 - DONNY ILHAM PAMBUDI',
        created_at: '2026-03-10T08:00:00.000Z',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildTableMock(anggotaRows);
      if (table === 'deposit_types') return buildTableMock(depositTypes);
      if (table === 'member_deposits') return buildTableMock(memberDeposits);
      if (table === 'deposit_transactions') return buildTableMock(depositTransactions);
      if (table === 'cash_flow') return buildTableMock(cashFlowRows);
      return buildTableMock([]);
    });

    const breakdownRes = await getCashFlowReferenceBreakdown({
      id: '6c928789-0000-4000-8000-000000000001',
      referensi: 'CF-6C928789',
      category: 'Setoran Simpanan',
      amount: 200000,
      direction: 'in',
      reference_id: 'tx-donny-mar26',
      description: 'Setoran Simpanan Wajib [Mar 2026] — 00060019 - DONNY ILHAM PAMBUDI',
      created_at: '2026-03-10T08:00:00.000Z',
    });

    expect(breakdownRes.kind).toBe('individual_deposit');
    if (breakdownRes.kind === 'individual_deposit') {
      expect(breakdownRes.individualDeposit).toMatchObject({
        transactionId: 'tx-donny-mar26',
        memberId: 'mem-donny',
        nrp: '00060019',
        nama: 'DONNY ILHAM PAMBUDI',
        memberNrp: '00060019',
        memberName: 'DONNY ILHAM PAMBUDI',
        depositTypeCode: 'WAJIB',
        depositTypeName: 'Simpanan Wajib',
        forMonth: 3,
        forYear: 2026,
        periodLabel: 'Mar 2026',
        shortPeriodLabel: 'Mar-26',
        periodCode: 'Mar-26',
        referenceNo: null,
        receiptNumber: 'CF-6C928789',
        amount: 200000,
      });
    }

    const traceRes = await getTraceBackDepositRows('CF-6C928789');
    expect(traceRes.resolvedCashFlowRef).toBe('CF-6C928789');
    expect(traceRes.resolvedReceiptCode).toBeNull();
    expect(traceRes.member).toMatchObject({
      id: 'mem-donny',
      nrp: '00060019',
      nama: 'DONNY ILHAM PAMBUDI',
    });
    expect(traceRes.items).toHaveLength(1);
    expect(traceRes.items[0]).toMatchObject({
      id: 'tx-donny-mar26',
      memberId: 'mem-donny',
      memberNrp: '00060019',
      memberName: 'DONNY ILHAM PAMBUDI',
      depositTypeCode: 'WAJIB',
      forMonth: 3,
      forYear: 2026,
      amount: 200000,
    });
  });

  it('loads KOREKSI_PEMBATALAN (deposit_cancellation_reversal) breakdown from description and enriches original receipt/member info from audit_logs', async () => {
    const auditLogs = [
      {
        id: 'audit-del-1',
        table_name: 'deposit_transactions',
        action: 'DELETE',
        record_id: 'tx-donny-nov26',
        entity_id: 'md-donny-w',
        performer_name: 'Admin Keuangan',
        notes: 'Salah input bulan',
        old_data: {
          id: 'tx-donny-nov26',
          member_deposit_id: 'md-donny-w',
          amount: 200000,
          for_month: 11,
          for_year: 2026,
          reference_no: 'KW-2026/11/00060019',
          payment_method: 'potong_gaji',
          created_at: '2026-11-20T08:00:00.000Z',
        },
        created_at: '2026-11-21T10:00:00.000Z',
      },
    ];
    const memberDeposits = [
      { id: 'md-donny-w', member_id: 'mem-donny', deposit_type_id: 'dt-wajib' },
    ];
    const anggotaRows = [
      { id: 'mem-donny', nrp: '00060019', nama: 'DONNY ILHAM PAMBUDI', tanggal_lahir: '1985-05-20' },
    ];
    const depositTypes = [{ id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' }];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'audit_logs') return buildTableMock(auditLogs);
      if (table === 'member_deposits') return buildTableMock(memberDeposits);
      if (table === 'anggota') return buildTableMock(anggotaRows);
      if (table === 'deposit_types') return buildTableMock(depositTypes);
      return buildTableMock([]);
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'rev-1111-4000-8000-000000000001',
      referensi: 'CF-REV11111',
      category: 'KOREKSI_PEMBATALAN',
      amount: 200000,
      direction: 'out',
      reference_id: 'tx-donny-nov26',
      description:
        'Pembatalan Setoran Simpanan Wajib [Nov 2026] — 00060019 - DONNY ILHAM PAMBUDI | Alasan: "Salah input bulan" (Oleh: Admin Keuangan)',
      created_at: '2026-11-21T10:00:05.000Z',
    });

    expect(res.kind).toBe('deposit_cancellation_reversal');
    if (res.kind === 'deposit_cancellation_reversal') {
      expect(res.cancellationReversal).toMatchObject({
        originalTransactionId: 'tx-donny-nov26',
        memberId: 'mem-donny',
        memberNrp: '00060019',
        memberName: 'DONNY ILHAM PAMBUDI',
        tanggal_lahir: '1985-05-20',
        depositTypeCode: 'WAJIB',
        depositTypeName: 'Simpanan Wajib',
        forMonth: 11,
        forYear: 2026,
        periodLabel: 'Nov 2026',
        shortPeriodLabel: 'Nov-26',
        amount: 200000,
        cancelReason: 'Salah input bulan',
        adminName: 'Admin Keuangan',
        originalReferenceNo: 'KW-2026/11/00060019',
        originalPaymentMethod: 'potong_gaji',
      });
    }

    // Fallback when audit_logs is empty: still parses all fields from description
    (supabase.from as any).mockImplementation(() => buildTableMock([]));
    const fallbackRes = await getCashFlowReferenceBreakdown({
      id: 'rev-2222-4000-8000-000000000002',
      category: 'KOREKSI_PEMBATALAN',
      amount: 50000,
      direction: 'out',
      reference_id: null,
      description:
        'Pembatalan Setoran Simpanan Belanja Bulanan [Okt 2026] — 00060019 - DONNY ILHAM PAMBUDI | Alasan: "Penyesuaian Data" (Oleh: Operator)',
      created_at: '2026-11-21T10:05:00.000Z',
    });

    expect(fallbackRes.kind).toBe('deposit_cancellation_reversal');
    if (fallbackRes.kind === 'deposit_cancellation_reversal') {
      expect(fallbackRes.cancellationReversal).toMatchObject({
        memberNrp: '00060019',
        memberName: 'DONNY ILHAM PAMBUDI',
        depositTypeCode: 'BELANJA',
        depositTypeName: 'Simpanan Belanja Bulanan',
        forMonth: 10,
        forYear: 2026,
        periodLabel: 'Okt 2026',
        shortPeriodLabel: 'Okt-26',
        amount: 50000,
        cancelReason: 'Penyesuaian Data',
        adminName: 'Operator',
      });
    }
  });

  it('enrichDepositCashFlowDescriptions enriches blank KOREKSI_PEMBATALAN descriptions from audit_logs', async () => {
    const auditLogs = [
      {
        id: 'audit-del-2',
        action: 'DELETE',
        record_id: 'tx-rev-99',
        entity_id: 'md-donny-w',
        performer_name: 'Admin Audit',
        notes: 'Salah input bulan',
        old_data: {
          member_deposit_id: 'md-donny-w',
          for_month: 11,
          for_year: 2026,
        },
        created_at: '2026-11-21T10:00:00.000Z',
      },
    ];
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'audit_logs') return buildTableMock(auditLogs);
      if (table === 'member_deposits') {
        return buildTableMock([
          { id: 'md-donny-w', member_id: 'mem-donny', deposit_type_id: 'dt-wajib' },
        ]);
      }
      if (table === 'anggota') {
        return buildTableMock([
          { id: 'mem-donny', nrp: '00060019', nama: 'DONNY ILHAM PAMBUDI' },
        ]);
      }
      if (table === 'deposit_types') {
        return buildTableMock([
          { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
        ]);
      }
      return buildTableMock([]);
    });

    const enriched = await enrichDepositCashFlowDescriptions([
      {
        id: 'cf-rev-blank',
        kategori: 'KOREKSI_PEMBATALAN',
        deskripsi: '-',
        kas_keluar: 200000,
        reference_id: 'tx-rev-99',
      },
    ]);

    expect(enriched[0].deskripsi).toBe(
      'Pembatalan Setoran Simpanan Wajib [Nov 2026] — 00060019 - DONNY ILHAM PAMBUDI | Alasan: "Salah input bulan" (Oleh: Admin Audit)'
    );
  });

  it('extractMemberNameFromDepositDescription and extractPaymentMethodFromDepositDescription support both legacy and enriched formats', () => {
    const legacy =
      'Setoran Anggota ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]';
    const enriched =
      'Setoran Anggota (Wajib, Belanja, Lebaran) — ZUH RISSA NUR (00060124) - Transfer Bank [KW-SETOR-20261121-1837]';

    expect(extractMemberNameFromDepositDescription(legacy)).toBe('ZUH RISSA NUR');
    expect(extractPaymentMethodFromDepositDescription(legacy)).toBe('Tunai');

    expect(extractMemberNameFromDepositDescription(enriched)).toBe('ZUH RISSA NUR');
    expect(extractPaymentMethodFromDepositDescription(enriched)).toBe('Transfer Bank');
  });

  it('enrichMemberDepositCashFlowDescriptions backfills CF-CF7E7572 & CF-A2B66A65 idempotently and handles null reference_no fallback', async () => {
    const anggotaRows = [
      { id: 'mem-zuh', nrp: '00060124', nama: 'ZUH RISSA NUR', tanggal_lahir: '1994-03-12' },
      { id: 'mem-andi', nrp: '00050999', nama: 'ANDI WIJAYA', tanggal_lahir: '1990-02-10' },
      { id: 'mem-hist', nrp: '00040111', nama: 'BUDI HARTO', tanggal_lahir: '1983-08-15' },
    ];
    const depositTypes = [
      { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib' },
      { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' },
      { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Lebaran' },
    ];
    const memberDeposits = [
      { id: 'md-zuh-w', member_id: 'mem-zuh', deposit_type_id: 'dt-wajib' },
      { id: 'md-zuh-b', member_id: 'mem-zuh', deposit_type_id: 'dt-belanja' },
      { id: 'md-zuh-l', member_id: 'mem-zuh', deposit_type_id: 'dt-lebaran' },
      { id: 'md-andi-w', member_id: 'mem-andi', deposit_type_id: 'dt-wajib' },
      { id: 'md-hist-b', member_id: 'mem-hist', deposit_type_id: 'dt-belanja' },
    ];
    const depositTransactions = [
      {
        id: 'tx-zuh-1',
        member_deposit_id: 'md-zuh-w',
        transaction_type: 'deposit',
        amount: 200000,
        reference_no: 'KW-SETOR-20261121-1837',
        payment_method: 'tunai',
        description: 'Setoran Simpanan Wajib (Nov 2026)',
        created_at: '2026-11-21T08:00:00.000Z',
      },
      {
        id: 'tx-zuh-2',
        member_deposit_id: 'md-zuh-b',
        transaction_type: 'deposit',
        amount: 50000,
        reference_no: 'KW-SETOR-20261121-1837',
        payment_method: 'tunai',
        description: 'Setoran Simpanan Belanja (Nov 2026)',
        created_at: '2026-11-21T08:00:01.000Z',
      },
      {
        id: 'tx-zuh-3',
        member_deposit_id: 'md-zuh-l',
        transaction_type: 'deposit',
        amount: 100000,
        reference_no: 'KW-SETOR-20261121-1837',
        payment_method: 'tunai',
        description: 'Setoran Simpanan Lebaran (Nov 2026)',
        created_at: '2026-11-21T08:00:02.000Z',
      },
      {
        id: 'tx-andi-1',
        member_deposit_id: 'md-andi-w',
        transaction_type: 'deposit',
        amount: 200000,
        reference_no: 'KW-SETOR-20261121-1840',
        payment_method: 'transfer_bank',
        description: 'Setoran Simpanan Wajib (Nov 2026)',
        created_at: '2026-11-21T09:00:00.000Z',
      },
      {
        id: 'tx-hist-1',
        member_deposit_id: 'md-hist-b',
        transaction_type: 'deposit',
        amount: 75000,
        reference_no: null,
        payment_method: 'tunai',
        description: 'Setoran Simpanan Belanja (Nov 2026)',
        created_at: '2026-11-19T10:00:00.000Z',
      },
    ];
    const cashFlowRows = [
      {
        id: 'cf7e7572-0000-4000-8000-000000000001',
        category: 'SETORAN_ANGGOTA',
        direction: 'in',
        amount: 350000,
        reference_id: 'KW-SETOR-20261121-1837',
        description:
          'Setoran Anggota ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]',
        created_at: '2026-11-21T08:00:05.000Z',
      },
      {
        id: 'a2b66a65-0000-4000-8000-000000000002',
        category: 'SETORAN_ANGGOTA',
        direction: 'in',
        amount: 200000,
        reference_id: null,
        description:
          'Setoran Anggota ANDI WIJAYA (00050999) - Transfer Bank [KW-SETOR-20261121-1840]',
        created_at: '2026-11-21T09:00:05.000Z',
      },
      {
        id: 'hist-0001-4000-8000-000000000003',
        category: 'SETORAN_ANGGOTA',
        direction: 'in',
        amount: 75000,
        reference_id: null,
        description:
          'Setoran Anggota BUDI HARTO (00040111) - Tunai [KW-SETOR-20261119-7777]',
        created_at: '2026-11-19T10:00:05.000Z',
      },
    ];

    const updatedPayloads: Array<{ id: string; description: string }> = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') return buildTableMock(anggotaRows);
      if (table === 'deposit_types') return buildTableMock(depositTypes);
      if (table === 'member_deposits') return buildTableMock(memberDeposits);
      if (table === 'deposit_transactions') return buildTableMock(depositTransactions);
      if (table === 'cash_flow') {
        const base = buildTableMock(cashFlowRows);
        return {
          ...base,
          update: vi.fn((payload: any) => ({
            eq: vi.fn(async (_col: string, id: string) => {
              const row = cashFlowRows.find((r) => r.id === id);
              if (row && typeof payload.description === 'string') {
                row.description = payload.description;
                updatedPayloads.push({ id, description: payload.description });
              }
              return { data: null, error: null };
            }),
          })),
        };
      }
      return buildTableMock([]);
    });

    const firstRun = await enrichMemberDepositCashFlowDescriptions();
    expect(firstRun.updatedCount).toBe(3);
    expect(firstRun.skippedCount).toBe(0);
    expect(cashFlowRows[0].description).toBe(
      'Setoran Anggota (Wajib, Belanja, Lebaran) — ZUH RISSA NUR (00060124) - Tunai [KW-SETOR-20261121-1837]'
    );
    expect(cashFlowRows[1].description).toBe(
      'Setoran Anggota (Wajib) — ANDI WIJAYA (00050999) - Transfer Bank [KW-SETOR-20261121-1840]'
    );
    expect(cashFlowRows[2].description).toBe(
      'Setoran Anggota (Belanja) — BUDI HARTO (00040111) - Tunai [KW-SETOR-20261119-7777]'
    );
    expect(updatedPayloads).toHaveLength(3);

    // Idempotent second run skips all already-enriched rows
    const secondRun = await enrichMemberDepositCashFlowDescriptions();
    expect(secondRun.updatedCount).toBe(0);
    expect(secondRun.skippedCount).toBe(3);
    expect(updatedPayloads).toHaveLength(3);

    // Verify getCashFlowReferenceBreakdown still resolves MEMBER_DEPOSIT_BATCH with the enriched description
    const breakdown = await getCashFlowReferenceBreakdown({
      id: cashFlowRows[0].id,
      referensi: 'CF-CF7E7572',
      category: cashFlowRows[0].category,
      amount: cashFlowRows[0].amount,
      direction: 'in',
      reference_id: cashFlowRows[0].reference_id,
      description: cashFlowRows[0].description,
      created_at: cashFlowRows[0].created_at,
    });
    expect(breakdown.kind).toBe('MEMBER_DEPOSIT_BATCH');
    if (breakdown.kind === 'MEMBER_DEPOSIT_BATCH') {
      expect(breakdown.memberDepositBatch.member).toMatchObject({
        nrp: '00060124',
        nama: 'ZUH RISSA NUR',
      });
      expect(breakdown.memberDepositBatch.items).toHaveLength(3);
      expect(breakdown.memberDepositBatch.isMatched).toBe(true);
    }
  });
});

describe('cashFlowAuditService - syncMatrixDepositsToCashFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('backfills missed Jan-26 Rp 200.000 deposit for BAGUS BUDI PRASETYO (00050543) idempotently and excludes cut-off & KW-SETOR entries', async () => {
    const cashFlowRows: any[] = [
      {
        id: 'cf-opening-1',
        category: 'SALDO_AWAL_SIMPANAN',
        direction: 'in',
        amount: 24040000,
        reference_id: null,
        description: 'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)',
        created_at: '2026-03-01T00:00:00.000Z',
      },
    ];
    const depositTxs = [
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
      {
        id: 'tx-opening-cutoff',
        member_deposit_id: 'md-bagus-wajib',
        transaction_type: 'deposit',
        amount: 3200000,
        for_month: 2,
        for_year: 2026,
        description: 'Saldo Awal Cut-Off (s/d Feb 2026)',
        reference_no: null,
        created_at: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'tx-setor-kasir',
        member_deposit_id: 'md-bagus-wajib',
        transaction_type: 'deposit',
        amount: 200000,
        for_month: 4,
        for_year: 2026,
        description: 'Setoran Simpanan Wajib (Apr 2026)',
        reference_no: 'KW-SETOR-20261121-0001',
        notes: 'Metode: Tunai | Kwitansi: KW-SETOR-20261121-0001',
        created_at: '2026-11-21T11:00:00.000Z',
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
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: depositTxs, error: null }),
          }),
        };
      }
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async () => ({
              data: [...cashFlowRows],
              error: null,
            })),
          }),
          insert: vi.fn().mockImplementation(async (rows: any[]) => {
            const items = Array.isArray(rows) ? rows : [rows];
            for (const r of items) {
              cashFlowRows.push({ id: `cf-${cashFlowRows.length + 1}`, ...r });
            }
            return { data: items, error: null };
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'md-bagus-wajib', member_id: 'm-bagus', deposit_type_id: 'dt-wajib' }],
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
      return {};
    });

    const first = await syncMatrixDepositsToCashFlow();
    expect(first).toEqual({ syncedCount: 1, skippedCount: 0 });
    expect(cashFlowRows).toHaveLength(2);
    expect(cashFlowRows[1]).toMatchObject({
      direction: 'in',
      category: 'Setoran Simpanan',
      amount: 200000,
      reference_id: 'tx-bagus-jan26',
      description: 'Setoran Simpanan Wajib [Jan 2026] — 00050543 - BAGUS BUDI PRASETYO',
      created_at: '2026-11-21T10:00:00.000Z',
    });

    const second = await syncMatrixDepositsToCashFlow();
    expect(second).toEqual({ syncedCount: 0, skippedCount: 1 });
    expect(cashFlowRows).toHaveLength(2);
  });

  it('uses an in-flight promise lock so concurrent calls do not insert duplicate cash_flow rows', async () => {
    const cashFlowRows: any[] = [];
    let insertCalls = 0;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'system_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { key: 'initial_savings_effective_date', value: '2026-01-01' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(
              () =>
                new Promise((resolve) =>
                  setTimeout(
                    () =>
                      resolve({
                        data: [
                          {
                            id: 'tx-bagus-jan26-lock',
                            member_deposit_id: 'md-bagus-wajib',
                            transaction_type: 'deposit',
                            amount: 200000,
                            for_month: 1,
                            for_year: 2026,
                            description: 'Setoran Matriks WAJIB Jan 2026',
                            created_at: '2026-11-21T10:00:00.000Z',
                          },
                        ],
                        error: null,
                      }),
                    15
                  )
                )
            ),
          }),
        };
      }
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async () => ({
              data: [...cashFlowRows],
              error: null,
            })),
          }),
          insert: vi.fn().mockImplementation(async (rows: any[]) => {
            insertCalls += 1;
            const items = Array.isArray(rows) ? rows : [rows];
            for (const r of items) {
              cashFlowRows.push({ id: `cf-${cashFlowRows.length + 1}`, ...r });
            }
            return { data: items, error: null };
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'md-bagus-wajib', member_id: 'm-bagus', deposit_type_id: 'dt-wajib' }],
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
      return {};
    });

    const [res1, res2] = await Promise.all([
      syncMatrixDepositsToCashFlow(),
      syncMatrixDepositsToCashFlow(),
    ]);

    expect(res1).toEqual({ syncedCount: 1, skippedCount: 0 });
    expect(res2).toEqual({ syncedCount: 1, skippedCount: 0 });
    expect(insertCalls).toBe(1);
    expect(cashFlowRows).toHaveLength(1);
  });
});

describe('cashFlowAuditService - syncApprovedLoansToCashFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('backfills missed active/approved loans using supplier cost_price for goods markup and net principal for cash loans while skipping SALDO-AWAL and already recorded entries', async () => {
    const loans = [
      {
        id: 'loan-1',
        loan_number: 'LOAN-1795338673852',
        member_id: 'm-1',
        loan_type_id: 'lt-brg',
        principal_amount: 70000000,
        amount: 70000000,
        cost_price: 50000000,
        markup_amount: 20000000,
        item_description: 'Mobil Operasional',
        tenor: 24,
        status: 'berjalan',
        disbursed_at: '2026-11-22',
        created_at: '2026-11-22T09:00:00.000Z',
        notes: 'Pembiayaan Barang: Mobil Operasional',
      },
      {
        id: 'loan-2',
        loan_number: 'LOAN-1795334228834',
        member_id: 'm-2',
        loan_type_id: 'lt-brg',
        principal_amount: 3300000,
        amount: 3300000,
        cost_price: 3000000,
        markup_amount: 300000,
        item_description: 'Kulkas 2 Pintu',
        tenor: 6,
        status: 'active',
        disbursed_at: '2026-11-22',
        created_at: '2026-11-22T10:00:00.000Z',
        notes: 'Pembiayaan Barang: Kulkas 2 Pintu',
      },
      {
        id: 'loan-3',
        loan_number: 'LOAN-1795333396946',
        member_id: 'm-3',
        loan_type_id: 'lt-brg',
        principal_amount: 2200000,
        amount: 2200000,
        cost_price: 2000000,
        markup_amount: 200000,
        item_description: 'Mesin Cuci',
        tenor: 5,
        status: 'active',
        disbursed_at: '2026-11-22',
        created_at: '2026-11-22T11:00:00.000Z',
        notes: 'Pembiayaan Barang: Mesin Cuci',
      },
      {
        id: 'loan-cash-topup',
        loan_number: 'LOAN-1795339990001',
        member_id: 'm-1',
        loan_type_id: 'lt-tunai',
        principal_amount: 5000000,
        amount: 5000000,
        topup_settlement_amount: 1000000,
        tenor: 10,
        status: 'approved',
        disbursed_at: '2026-11-22',
        created_at: '2026-11-22T12:00:00.000Z',
        notes: 'Kebutuhan Pendidikan',
      },
      // Excluded: SALDO-AWAL migration loan
      {
        id: 'loan-saldo-awal',
        loan_number: 'SALDO-AWAL-88010001-TUNAI',
        member_id: 'm-1',
        loan_type_id: 'lt-tunai',
        principal_amount: 10000000,
        amount: 10000000,
        tenor: 12,
        status: 'active',
        disbursed_at: '2026-03-01',
        created_at: '2026-03-01T00:00:00.000Z',
        notes: 'Saldo Awal Pinjaman',
      },
      // Excluded: already recorded by reference_id
      {
        id: 'loan-existing-ref',
        loan_number: 'LOAN-EXISTING-REF',
        member_id: 'm-2',
        loan_type_id: 'lt-tunai',
        principal_amount: 1500000,
        amount: 1500000,
        tenor: 6,
        status: 'active',
        disbursed_at: '2026-11-20',
        created_at: '2026-11-20T08:00:00.000Z',
        notes: '',
      },
      // Excluded: already recorded by loan_number in description
      {
        id: 'loan-existing-num',
        loan_number: 'LOAN-1795000000001',
        member_id: 'm-3',
        loan_type_id: 'lt-brg',
        principal_amount: 1100000,
        amount: 1100000,
        cost_price: 1000000,
        markup_amount: 100000,
        item_description: 'TV LED',
        tenor: 4,
        status: 'lunas',
        disbursed_at: '2026-11-18',
        created_at: '2026-11-18T08:00:00.000Z',
        notes: '',
      },
      // Excluded: pre-2026
      {
        id: 'loan-old-2025',
        loan_number: 'LOAN-2025-001',
        member_id: 'm-1',
        loan_type_id: 'lt-tunai',
        principal_amount: 3000000,
        amount: 3000000,
        tenor: 6,
        status: 'active',
        disbursed_at: '2025-12-15',
        created_at: '2025-12-15T08:00:00.000Z',
        notes: '',
      },
      // Excluded: pending/draft
      {
        id: 'loan-draft',
        loan_number: 'LOAN-DRAFT-001',
        member_id: 'm-1',
        loan_type_id: 'lt-tunai',
        principal_amount: 2000000,
        amount: 2000000,
        tenor: 6,
        status: 'draft',
        disbursed_at: null,
        created_at: '2026-11-22T13:00:00.000Z',
        notes: '',
      },
    ];

    const loanTypes = [
      { id: 'lt-brg', code: 'PEMBIAYAAN_BARANG', name: 'Pembiayaan Barang', financing_scheme: 'GOODS_MARKUP' },
      { id: 'lt-tunai', code: 'PINJ_TUNAI', name: 'Pinjaman Tunai', financing_scheme: 'ZERO_INTEREST' },
    ];

    const members = [
      { id: 'm-1', nrp: '88010001', nama: 'Budi Santoso' },
      { id: 'm-2', nrp: '88010002', nama: 'Siti Aminah' },
      { id: 'm-3', nrp: '88010003', nama: 'Andi Wijaya' },
    ];

    const cashFlowRows: any[] = [
      {
        id: 'cf-kas-kecil',
        direction: 'out',
        category: 'beban_operasional',
        amount: 100000,
        reference_id: null,
        description: 'Kas Kecil Kasir',
      },
      {
        id: 'cf-existing-ref',
        direction: 'out',
        category: 'pencairan_pinjaman',
        amount: 1500000,
        reference_id: 'loan-existing-ref',
        description: 'Pencairan Pinjaman',
      },
      {
        id: 'cf-existing-num',
        direction: 'out',
        category: 'pembiayaan_barang',
        amount: 1000000,
        reference_id: null,
        description: 'Pencairan Pembiayaan Barang (TV LED) [LOAN-1795000000001]',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: loans, error: null }),
          }),
        };
      }
      if (table === 'loan_types') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: loanTypes, error: null }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: members, error: null }),
          }),
        };
      }
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async () => ({
              data: [...cashFlowRows],
              error: null,
            })),
          }),
          insert: vi.fn().mockImplementation(async (rows: any[]) => {
            const items = Array.isArray(rows) ? rows : [rows];
            for (const r of items) {
              cashFlowRows.push({ id: `cf-${cashFlowRows.length + 1}`, ...r });
            }
            return { data: items, error: null };
          }),
        };
      }
      return {};
    });

    const firstRes = await syncApprovedLoansToCashFlow();
    expect(firstRes).toEqual({ syncedCount: 4, skippedCount: 2 });

    const insertedLoansCf = cashFlowRows.slice(3);
    expect(insertedLoansCf).toHaveLength(4);
    expect(insertedLoansCf.map((r) => r.amount)).toEqual([50000000, 3000000, 2000000, 4000000]);
    expect(insertedLoansCf[0]).toMatchObject({
      direction: 'out',
      category: 'pembiayaan_barang',
      amount: 50000000,
      reference_id: 'loan-1',
    });
    expect(insertedLoansCf[0].description).toContain('[LOAN-1795338673852]');
    expect(insertedLoansCf[0].description).toContain('88010001 - Budi Santoso');
    expect(insertedLoansCf[0].description).toContain('Modal: Rp 50.000.000');
    expect(insertedLoansCf[0].description).toContain('Akad: Rp 70.000.000');
    expect(insertedLoansCf[3]).toMatchObject({
      direction: 'out',
      category: 'pencairan_pinjaman',
      amount: 4000000,
      reference_id: 'loan-cash-topup',
    });
    expect(insertedLoansCf[3].description).toContain('[LOAN-1795339990001]');
    expect(insertedLoansCf[3].description).toContain('Potong Top-Up: Rp 1.000.000');

    // Re-running is idempotent
    const secondRes = await syncApprovedLoansToCashFlow();
    expect(secondRes).toEqual({ syncedCount: 0, skippedCount: 6 });
    expect(cashFlowRows).toHaveLength(7);
  });

  it('prevents duplicate cash_flow inserts when syncApprovedLoansToCashFlow is called concurrently (in-flight lock)', async () => {
    const loans = [
      {
        id: 'loan-concurrent-1',
        loan_number: 'LOAN-1795338673852',
        member_id: 'm-1',
        loan_type_id: 'lt-brg',
        principal_amount: 70000000,
        amount: 70000000,
        cost_price: 50000000,
        markup_amount: 20000000,
        item_description: 'Mobil Operasional',
        tenor: 24,
        status: 'berjalan',
        disbursed_at: '2026-11-22',
        created_at: '2026-11-22T09:00:00.000Z',
      },
    ];
    const cashFlowRows: any[] = [];
    let insertCalls = 0;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(
              () =>
                new Promise((resolve) =>
                  setTimeout(() => resolve({ data: loans, error: null }), 15)
                )
            ),
          }),
        };
      }
      if (table === 'loan_types') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [{ id: 'lt-brg', code: 'PEMBIAYAAN_BARANG', financing_scheme: 'GOODS_MARKUP' }],
              error: null,
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
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async () => ({
              data: [...cashFlowRows],
              error: null,
            })),
          }),
          insert: vi.fn().mockImplementation(async (rows: any[]) => {
            insertCalls += 1;
            const items = Array.isArray(rows) ? rows : [rows];
            for (const r of items) {
              cashFlowRows.push({ id: `cf-${cashFlowRows.length + 1}`, ...r });
            }
            return { data: items, error: null };
          }),
        };
      }
      return {};
    });

    const [res1, res2] = await Promise.all([
      syncApprovedLoansToCashFlow(),
      syncApprovedLoansToCashFlow(),
    ]);

    expect(res1).toEqual({ syncedCount: 1, skippedCount: 0 });
    expect(res2).toEqual({ syncedCount: 1, skippedCount: 0 });
    expect(insertCalls).toBe(1);
    expect(cashFlowRows).toHaveLength(1);
  });

  it("falls back to select('*') on loans when PostgREST returns PGRST204 and uses approved_at when disbursed_at is absent", async () => {
    const loans = [
      {
        id: 'loan-fallback-1',
        loan_number: 'LOAN-1795338673852',
        member_id: 'm-1',
        loan_type_id: 'lt-brg',
        principal_amount: 70000000,
        amount: 70000000,
        supplier_cost: 50000000,
        markup_amount: 20000000,
        item_description: 'Mobil Operasional',
        tenor: 24,
        status: 'berjalan',
        approved_at: '2026-11-22T08:30:00.000Z',
        created_at: '2026-11-22T07:00:00.000Z',
      },
    ];
    const selectedLoanCols: string[] = [];
    const insertedCashFlows: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            selectedLoanCols.push(cols);
            return {
              range: vi.fn().mockImplementation(async () => {
                if (cols !== '*') {
                  return {
                    data: null,
                    error: { code: 'PGRST204', message: 'Could not find the column in schema cache' },
                  };
                }
                return { data: loans, error: null };
              }),
            };
          }),
        };
      }
      if (table === 'loan_types') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [{ id: 'lt-brg', code: 'PEMBIAYAAN_BARANG', financing_scheme: 'GOODS_MARKUP' }],
              error: null,
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
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          insert: vi.fn().mockImplementation(async (rows: any[]) => {
            insertedCashFlows.push(...rows);
            return { data: rows, error: null };
          }),
        };
      }
      return {};
    });

    const res = await syncApprovedLoansToCashFlow();

    expect(res).toEqual({ syncedCount: 1, skippedCount: 0 });
    expect(selectedLoanCols).toContain('*');
    expect(insertedCashFlows).toHaveLength(1);
    expect(insertedCashFlows[0]).toMatchObject({
      direction: 'out',
      category: 'pembiayaan_barang',
      amount: 50000000,
      reference_id: 'loan-fallback-1',
      created_at: '2026-11-22T08:30:00.000Z',
    });
  });
});

describe('cashFlowAuditService - Loan Installment & Disbursement Breakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves angsuran_pinjaman (CF-9F0EE1EF) when reference_id points to loan_schedules.id with loan, member, period, and pokok/margin portions', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data:
                  col === 'id' && val === 'loan-hp-1'
                    ? {
                        id: 'loan-hp-1',
                        loan_number: 'LOAN-1795333396946',
                        member_id: 'mem-tes-1',
                        loan_type_id: 'lt-brg',
                        amount: 2200000,
                        principal_amount: 2200000,
                        item_description: 'beli hp',
                        cost_price: 2000000,
                        markup_amount: 200000,
                        tenor: 11,
                        agreed_tenor_months: 11,
                        status: 'active',
                        disbursed_at: '2026-11-01T00:00:00.000Z',
                        created_at: '2026-11-01T00:00:00.000Z',
                      }
                    : null,
                error: null,
              }),
            })),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data:
                  val === '4b1eaebf-a9df-470a-b21d-6f1f3d576977'
                    ? {
                        id: '4b1eaebf-a9df-470a-b21d-6f1f3d576977',
                        loan_id: 'loan-hp-1',
                        period_number: 1,
                        due_date: '2026-12-22',
                        target_amount: 200000,
                        paid_amount: 200000,
                        status: 'paid',
                      }
                    : null,
                error: null,
              }),
            })),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'rep-1',
                  loan_id: 'loan-hp-1',
                  schedule_id: '4b1eaebf-a9df-470a-b21d-6f1f3d576977',
                  amount_paid: 200000,
                  principal_portion: 181818,
                  margin_portion: 18182,
                  payment_method: 'potong_gaji',
                  receipt_number: 'KW-ANG-001',
                  created_at: '2026-11-22T10:00:00.000Z',
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
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'mem-tes-1',
                  nrp: '99999999',
                  nama: 'anggota tes 1',
                  tanggal_lahir: '1990-01-15',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'loan_types') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'lt-brg',
                  code: 'PEMBIAYAAN_BARANG',
                  name: 'Pembiayaan Barang',
                  financing_scheme: 'GOODS_MARKUP',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: '9f0ee1ef-1111-2222-3333-444455556666',
      referensi: 'CF-9F0EE1EF',
      category: 'angsuran_pinjaman',
      amount: 200000,
      direction: 'in',
      description:
        'Angsuran Pembiayaan Barang (beli hp) Bln ke-1 — 99999999 - anggota tes 1 | Pokok: Rp 181.818 | Margin: Rp 18.182',
      reference_id: '4b1eaebf-a9df-470a-b21d-6f1f3d576977',
      created_at: '2026-11-22T10:00:00.000Z',
    });

    expect(res.kind).toBe('loan_installment');
    if (res.kind === 'loan_installment') {
      expect(res.loanInstallment).toMatchObject({
        loanId: 'loan-hp-1',
        scheduleId: '4b1eaebf-a9df-470a-b21d-6f1f3d576977',
        loanNumber: 'LOAN-1795333396946',
        loanTypeName: 'Pembiayaan Barang',
        itemDescription: 'beli hp',
        isGoodsFinancing: true,
        periodNumber: 1,
        tenor: 11,
        amount: 200000,
        principalPortion: 181818,
        marginPortion: 18182,
        paymentMethod: 'potong_gaji',
        member: {
          nrp: '99999999',
          nama: 'anggota tes 1',
          tanggal_lahir: '1990-01-15',
        },
      });
    }
  });

  it('resolves angsuran_pinjaman when reference_id directly matches loans.id or loan_installments.id', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data:
                  val === 'loan-direct-1'
                    ? {
                        id: 'loan-direct-1',
                        loan_number: 'LOAN-DIRECT-01',
                        member_id: 'mem-1',
                        amount: 1200000,
                        principal_amount: 1200000,
                        tenor: 6,
                        status: 'active',
                      }
                    : null,
                error: null,
              }),
            })),
          }),
        };
      }
      if (table === 'loan_schedules' || table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === 'loan_installments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data:
                  val === 'inst-1'
                    ? {
                        id: 'inst-1',
                        loan_id: 'loan-direct-1',
                        period_number: 2,
                        principal_portion: 200000,
                        margin_portion: 0,
                      }
                    : null,
                error: null,
              }),
            })),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'mem-1', nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const directRes = await getCashFlowReferenceBreakdown({
      id: 'cf-loan-direct',
      category: 'Angsuran Pinjaman',
      amount: 200000,
      direction: 'in',
      description: 'Angsuran Pinjaman (LOAN-DIRECT-01) Bln ke-2 — 88010001 - Budi Santoso',
      reference_id: 'loan-direct-1',
      created_at: '2026-11-22T09:00:00.000Z',
    });

    expect(directRes.kind).toBe('loan_installment');
    if (directRes.kind === 'loan_installment') {
      expect(directRes.loanInstallment.loanNumber).toBe('LOAN-DIRECT-01');
      expect(directRes.loanInstallment.periodNumber).toBe(2);
      expect(directRes.loanInstallment.member?.nrp).toBe('88010001');
    }

    const instRes = await getCashFlowReferenceBreakdown({
      id: 'cf-loan-inst',
      category: 'angsuran_pinjaman',
      amount: 200000,
      direction: 'in',
      description: 'Angsuran Pinjaman Bln ke-2',
      reference_id: 'inst-1',
      created_at: '2026-11-22T09:00:00.000Z',
    });

    expect(instRes.kind).toBe('loan_installment');
    if (instRes.kind === 'loan_installment') {
      expect(instRes.loanInstallment.loanId).toBe('loan-direct-1');
      expect(instRes.loanInstallment.loanNumber).toBe('LOAN-DIRECT-01');
      expect(instRes.loanInstallment.periodNumber).toBe(2);
    }
  });

  it('falls back to parsing NRP, item description, period, and pokok/margin from description when reference_id is missing or unmatched', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data:
                  col === 'nrp' && val === '99999999'
                    ? {
                        id: 'mem-tes-1',
                        nrp: '99999999',
                        nama: 'anggota tes 1',
                        tanggal_lahir: '1990-01-15',
                      }
                    : null,
                error: null,
              }),
            })),
          }),
        };
      }
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'member_id' && val === 'mem-tes-1') {
                return Promise.resolve({
                  data: [
                    {
                      id: 'loan-hp-fb',
                      loan_number: 'LOAN-1795333396946',
                      member_id: 'mem-tes-1',
                      item_description: 'beli hp',
                      cost_price: 2000000,
                      markup_amount: 200000,
                      tenor: 11,
                      status: 'active',
                    },
                  ],
                  error: null,
                });
              }
              return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    const res = await getCashFlowReferenceBreakdown({
      id: '9f0ee1ef-fallback',
      referensi: 'CF-9F0EE1EF',
      category: 'angsuran_pinjaman',
      amount: 200000,
      direction: 'in',
      description:
        'Angsuran Pembiayaan Barang (beli hp) Bln ke-1 — 99999999 - anggota tes 1 | Pokok: Rp 181.818 | Margin: Rp 18.182',
      reference_id: 'unmatched-uuid',
      created_at: '2026-11-22T10:00:00.000Z',
    });

    expect(res.kind).toBe('loan_installment');
    if (res.kind === 'loan_installment') {
      expect(res.loanInstallment.loanNumber).toBe('LOAN-1795333396946');
      expect(res.loanInstallment.member?.nrp).toBe('99999999');
      expect(res.loanInstallment.member?.nama).toBe('anggota tes 1');
      expect(res.loanInstallment.periodNumber).toBe(1);
      expect(res.loanInstallment.principalPortion).toBe(181818);
      expect(res.loanInstallment.marginPortion).toBe(18182);
    }
  });

  it('loads loan_disbursement with loanNumber and loanTypeName for Pencairan Pinjaman / Pembiayaan Barang', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'loan-disb-1',
                  loan_number: 'LOAN-1795338673852',
                  member_id: 'm-1',
                  loan_type_id: 'lt-brg',
                  amount: 70000000,
                  principal_amount: 70000000,
                  cost_price: 50000000,
                  markup_amount: 20000000,
                  item_description: 'Mobil Operasional',
                  tenor: 24,
                  status: 'active',
                  disbursed_at: '2026-11-22T08:00:00.000Z',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'anggota') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'm-1', nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'loan_types') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'lt-brg', code: 'PEMBIAYAAN_BARANG', name: 'Pembiayaan Barang', financing_scheme: 'GOODS_MARKUP' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getCashFlowReferenceBreakdown({
      id: 'cf-disb-1',
      category: 'Pembiayaan Barang',
      amount: 50000000,
      direction: 'out',
      reference_id: 'loan-disb-1',
      created_at: '2026-11-22T08:00:00.000Z',
    });

    expect(res.kind).toBe('loan_disbursement');
    if (res.kind === 'loan_disbursement') {
      expect(res.loanDisbursement.loanNumber).toBe('LOAN-1795338673852');
      expect(res.loanDisbursement.loanTypeName).toBe('Pembiayaan Barang');
      expect(res.loanDisbursement.amount).toBe(50000000);
      expect(res.loanDisbursement.member?.nrp).toBe('88010001');
    }
  });

  it('findCashFlowByLoanInstallment resolves SALDO-AWAL-84110801-GAJISIPA installmentNo=7 to CF-1A22F0FF', async () => {
    const cfRows = [
      {
        id: 'cf-disb-001',
        direction: 'out',
        category: 'pencairan_pinjaman',
        amount: 10000000,
        reference_id: 'loan-other',
        description: 'Pencairan Pinjaman [LOAN-OTHER] — 11111111 - Lain',
        created_at: '2026-01-02T08:00:00.000Z',
      },
      {
        id: '1a22f0ff-1111-2222-3333-444455556666',
        direction: 'in',
        category: 'angsuran_pinjaman',
        amount: 875000,
        reference_id: 'sched-7-id',
        description: 'Angsuran Pinjaman [SALDO-AWAL-84110801-GAJISIPA] Bln ke-7 — 84110801 - Anggota Gaji',
        created_at: '2026-07-01T08:00:00.000Z',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: cfRows, error: null }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'sched-7-id', period_number: 7 }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {};
    });

    const found = await findCashFlowByLoanInstallment({
      loanId: 'loan-saldo-awal-1',
      loanNumber: 'SALDO-AWAL-84110801-GAJISIPA',
      installmentNo: 7,
      memberNrp: '84110801',
    });

    expect(found).not.toBeNull();
    expect(found?.referensi).toBe('CF-1A22F0FF');
    expect(found?.kas_masuk).toBe(875000);

    // Also resolves by loanNumber + Bln ke-7 even when loanId & scheduleId are absent
    const foundByDesc = await findCashFlowByLoanInstallment({
      loanNumber: 'SALDO-AWAL-84110801-GAJISIPA',
      installmentNo: 7,
    });
    expect(foundByDesc?.referensi).toBe('CF-1A22F0FF');
  });

  it('findAllCashFlowsByLoan returns disbursement and installments sorted chronologically for a loan contract', async () => {
    const cfRows = [
      {
        id: 'bbbb2222-0000-0000-0000-000000000002',
        direction: 'in',
        category: 'angsuran_pinjaman',
        amount: 550000,
        reference_id: 'sched-1',
        description: 'Angsuran Pinjaman [LOAN-1001] Bln ke-1 — 88010001 - Budi',
        created_at: '2026-04-01T08:00:00.000Z',
      },
      {
        id: 'aaaa1111-0000-0000-0000-000000000001',
        direction: 'out',
        category: 'pencairan_pinjaman',
        amount: 5000000,
        reference_id: 'loan-1001',
        description: 'Pencairan Pinjaman [LOAN-1001] — 88010001 - Budi (Tenor 10 Bln)',
        created_at: '2026-03-01T08:00:00.000Z',
      },
      {
        id: 'cccc3333-0000-0000-0000-000000000003',
        direction: 'in',
        category: 'angsuran_pinjaman',
        amount: 550000,
        reference_id: 'repay-2',
        description: 'Angsuran Pinjaman [LOAN-1001] Bln ke-2 — 88010001 - Budi',
        created_at: '2026-05-01T08:00:00.000Z',
      },
      {
        id: 'dddd4444-0000-0000-0000-000000000004',
        direction: 'in',
        category: 'angsuran_pinjaman',
        amount: 900000,
        reference_id: 'sched-other',
        description: 'Angsuran Pinjaman [LOAN-9999] Bln ke-1 — 99999999 - Lain',
        created_at: '2026-04-01T08:00:00.000Z',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({ data: cfRows, error: null }),
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'sched-1', period_number: 1 }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'repay-2', schedule_id: 'sched-2' }],
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    const results = await findAllCashFlowsByLoan({
      loanId: 'loan-1001',
      loanNumber: 'LOAN-1001',
    });

    expect(results.map((r) => r.referensi)).toEqual([
      'CF-AAAA1111',
      'CF-BBBB2222',
      'CF-CCCC3333',
    ]);
    expect(results[0].kas_keluar).toBe(5000000);
    expect(results[1].kas_masuk).toBe(550000);
  });
});

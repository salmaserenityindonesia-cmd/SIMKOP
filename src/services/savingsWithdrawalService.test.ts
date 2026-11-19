import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withdrawSavings, getWithdrawableSavings } from './savingsWithdrawalService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn()
  }
}));

describe('savingsWithdrawalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createChainMock(data: any, error: any = null) {
    const obj: any = {};
    const p = Promise.resolve({ data, error });
    obj.select = vi.fn(() => obj);
    obj.eq = vi.fn(() => obj);
    obj.in = vi.fn(() => obj);
    obj.insert = vi.fn(() => obj);
    obj.update = vi.fn(() => obj);
    obj.single = vi.fn(() => p);
    obj.then = (onRes: any, onRej: any) => p.then(onRes, onRej);
    return obj;
  }

  it('withdrawSavings injects withdrawal transaction with valid enum and reference_no when RPC is available', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: { success: true, transaction_id: 'tx-atomic-1' },
      error: null
    });

    const updateMock = createChainMock({ id: 'tx-atomic-1' });
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_transactions') {
        return updateMock;
      }
      return createChainMock([]);
    });

    const res = await withdrawSavings({
      member_deposit_id: 'md-leb-01',
      amount: 1500000,
      payment_method: 'transfer',
      description: 'Penarikan Simpanan Lebaran - Wawan Gunawan',
      reference_no: 'KW-WD-WAWAN-01',
      notes: 'Pencairan Simpanan Lebaran (Transfer)',
      created_by: 'user-admin-1',
      jenisSimpananLabel: 'Simpanan Lebaran',
      namaAnggota: 'Wawan Gunawan'
    });

    expect(res.id).toBe('tx-atomic-1');
    expect(res.reference_no).toBe('KW-WD-WAWAN-01');
    expect(supabase.from).toHaveBeenCalledWith('deposit_transactions');
  });

  it('withdrawSavings falls back to manual insert with transaction_type withdrawal and cash_flow when RPC fails or not deployed', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'function withdraw_savings_atomic does not exist' }
    });

    const selectMock = createChainMock([
      { amount: 3000000, transaction_type: 'deposit' }
    ]);
    const insertTxMock = createChainMock({
      id: 'tx-manual-1',
      member_deposit_id: 'md-leb-01',
      transaction_type: 'withdrawal',
      amount: 1500000,
      reference_no: 'KW-WD-WAWAN-02'
    });
    const cashFlowMock = createChainMock([]);

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_transactions') {
        const chain: any = {};
        chain.select = vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [{ amount: 3000000, transaction_type: 'deposit' }], error: null }))
        }));
        chain.insert = vi.fn((rows: any[]) => {
          expect(rows[0].transaction_type).toBe('withdrawal');
          expect(rows[0].amount).toBe(1500000);
          expect(rows[0].reference_no).toBe('KW-WD-WAWAN-02');
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: { id: 'tx-manual-1', ...rows[0] },
                error: null
              }))
            }))
          };
        });
        return chain;
      }
      if (table === 'cash_flow') {
        return {
          insert: vi.fn(() => Promise.resolve({ data: [], error: null }))
        };
      }
      return createChainMock([]);
    });

    const res = await withdrawSavings({
      member_deposit_id: 'md-leb-01',
      amount: 1500000,
      payment_method: 'transfer',
      reference_no: 'KW-WD-WAWAN-02',
      jenisSimpananLabel: 'Simpanan Lebaran',
      namaAnggota: 'Wawan Gunawan'
    });

    expect(res.id).toBe('tx-manual-1');
    expect(res.reference_no).toBe('KW-WD-WAWAN-02');
  });

  it('withdrawSavings throws error when balance is insufficient', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'RPC not found' }
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [{ amount: 500000, transaction_type: 'deposit' }], error: null }))
          }))
        };
      }
      return createChainMock([]);
    });

    await expect(
      withdrawSavings({
        member_deposit_id: 'md-leb-01',
        amount: 1000000,
        payment_method: 'tunai',
        description: 'Tarik simpanan'
      })
    ).rejects.toThrow('Saldo tidak mencukupi untuk penarikan');
  });

  it('writes rich individual withdrawal description to cash_flow on RPC path and resolves missing NRP/type from DB', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: { success: true, transaction_id: 'tx-atomic-leb' },
      error: null
    });

    let updatedCashFlowPayload: any = null;
    let updatedCashFlowEqVal: string | null = null;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'member_deposits') {
        return createChainMock({
          id: 'md-leb-01',
          member_id: 'mem-1',
          deposit_type_id: 'dt-leb'
        });
      }
      if (table === 'anggota') {
        return createChainMock({ id: 'mem-1', nrp: '88010001', nama: 'Wawan Gunawan' });
      }
      if (table === 'deposit_types') {
        return createChainMock({
          id: 'dt-leb',
          code: 'LEBARAN',
          name: 'Simpanan Hari Raya (Lebaran)'
        });
      }
      if (table === 'cash_flow') {
        return {
          update: vi.fn((payload: any) => {
            updatedCashFlowPayload = payload;
            return {
              eq: vi.fn((_col: string, val: string) => {
                updatedCashFlowEqVal = val;
                return Promise.resolve({ data: [], error: null });
              })
            };
          })
        };
      }
      return createChainMock([]);
    });

    await withdrawSavings({
      member_deposit_id: 'md-leb-01',
      amount: 1500000,
      payment_method: 'transfer',
      reference_no: 'KW-WD-WAWAN-03'
    });

    expect(updatedCashFlowEqVal).toBe('tx-atomic-leb');
    expect(updatedCashFlowPayload).toEqual({
      description:
        'Pencairan Simpanan Hari Raya (Lebaran) (Personal) — 88010001 - Wawan Gunawan (Rp 1.500.000)'
    });
  });

  it('writes formatted description on manual fallback and retries without description on PGRST204 error', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'RPC not found' }
    });

    const cashFlowInserts: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() =>
              Promise.resolve({
                data: [{ amount: 2000000, transaction_type: 'deposit' }],
                error: null
              })
            )
          })),
          insert: vi.fn((rows: any[]) => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({ data: { id: 'tx-manual-wajib', ...rows[0] }, error: null })
              )
            }))
          }))
        };
      }
      if (table === 'cash_flow') {
        return {
          insert: vi.fn((rows: any[]) => {
            cashFlowInserts.push(rows[0]);
            if (cashFlowInserts.length === 1) {
              return Promise.resolve({
                data: null,
                error: { code: 'PGRST204', message: "Could not find the 'description' column" }
              });
            }
            return Promise.resolve({ data: rows, error: null });
          })
        };
      }
      return createChainMock([]);
    });

    await withdrawSavings({
      member_deposit_id: 'md-wajib-01',
      amount: 500000,
      payment_method: 'tunai',
      jenisSimpananLabel: 'Simpanan Wajib',
      depositTypeCode: 'SW',
      namaAnggota: 'Budi Santoso',
      nrpAnggota: '88010001'
    });

    expect(cashFlowInserts).toHaveLength(2);
    expect(cashFlowInserts[0]).toMatchObject({
      direction: 'out',
      category: 'penarikan_simpanan',
      amount: 500000,
      reference_id: 'tx-manual-wajib',
      description: 'Pencairan Simpanan Wajib — 88010001 - Budi Santoso (Rp 500.000)'
    });
    expect(cashFlowInserts[1]).toEqual({
      direction: 'out',
      category: 'penarikan_simpanan',
      amount: 500000,
      reference_id: 'tx-manual-wajib'
    });
  });
});


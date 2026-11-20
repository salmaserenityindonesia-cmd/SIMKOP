import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PRESERVED_MASTER_TABLES,
  RESET_CONFIRMATION_PHRASE,
  TRANSACTIONAL_PREVIEW_TABLES,
  clearTransactionalLocalCaches,
  executeSystemTransactionalReset,
  getTransactionalResetPreview,
} from './systemResetService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value.toString();
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
  }),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('systemResetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('defines the exact 9 whitelisted master tables', () => {
    const tableNames = PRESERVED_MASTER_TABLES.map((item) => item.name);
    expect(tableNames).toEqual([
      'anggota',
      'deposit_types',
      'koperasi_profile',
      'loan_types',
      'pengelola',
      'pos_settings',
      'product_categories',
      'products',
      'savings_rate_tiers',
    ]);
    expect(tableNames).toHaveLength(9);
  });

  it('rejects empty, invalid, and lowercase confirmation phrases without calling supabase.rpc', async () => {
    await expect(executeSystemTransactionalReset('')).rejects.toThrow(
      `Frasa konfirmasi tidak valid. Ketik tepat: ${RESET_CONFIRMATION_PHRASE}`
    );
    await expect(executeSystemTransactionalReset('RESET DATA')).rejects.toThrow(
      `Frasa konfirmasi tidak valid. Ketik tepat: ${RESET_CONFIRMATION_PHRASE}`
    );
    await expect(executeSystemTransactionalReset('reset data transaksi')).rejects.toThrow(
      `Frasa konfirmasi tidak valid. Ketik tepat: ${RESET_CONFIRMATION_PHRASE}`
    );

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('calls reset_transactional_data_keep_masters RPC, normalizes result, and clears transactional localStorage', async () => {
    mockStorage.simkop_active_shift_id = 'shift-1';
    mockStorage.simkop_active_shift_data = '{"id":"shift-1"}';
    mockStorage.simkop_pos_cart = '[{"id":"p1"}]';
    mockStorage.simkop_parked_sales_local = '[{"id":"park-1"}]';
    mockStorage.simkop_koperasi_profile = '{"nama_koperasi":"UTUH"}';

    (supabase.rpc as any).mockResolvedValue({
      data: {
        success: true,
        truncated_count: 14,
        truncated_tables: ['public.cash_flow', 'public.deposit_transactions', 'public.sales'],
        preserved_tables: PRESERVED_MASTER_TABLES.map((t) => t.name),
        restored_members_count: 2,
      },
      error: null,
    });

    const result = await executeSystemTransactionalReset('  RESET DATA TRANSAKSI  ');

    expect(supabase.rpc).toHaveBeenCalledWith('reset_transactional_data_keep_masters', {
      p_confirmation_phrase: 'RESET DATA TRANSAKSI',
    });
    expect(result).toEqual({
      success: true,
      truncatedCount: 14,
      truncatedTables: ['public.cash_flow', 'public.deposit_transactions', 'public.sales'],
      preservedTables: PRESERVED_MASTER_TABLES.map((t) => t.name),
      restoredMembersCount: 2,
    });

    expect(mockStorage.simkop_active_shift_id).toBeUndefined();
    expect(mockStorage.simkop_active_shift_data).toBeUndefined();
    expect(mockStorage.simkop_pos_cart).toBeUndefined();
    expect(mockStorage.simkop_parked_sales_local).toBeUndefined();
    expect(mockStorage.simkop_koperasi_profile).toBe('{"nama_koperasi":"UTUH"}');
  });

  it('surfaces clear migration guidance when RPC is missing in schema cache (PGRST202)', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.reset_transactional_data_keep_masters(p_confirmation_phrase) in the schema cache',
      },
    });

    await expect(executeSystemTransactionalReset('RESET DATA TRANSAKSI')).rejects.toThrow(
      'supabase/migrations/20261120_add_reset_transactional_data_rpc.sql'
    );
  });

  it('passes through unauthorized or database execution errors from RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'Unauthorized: Hanya admin yang diizinkan menjalankan reset data transaksional.',
      },
    });

    await expect(executeSystemTransactionalReset('RESET DATA TRANSAKSI')).rejects.toThrow(
      'Unauthorized: Hanya admin yang diizinkan menjalankan reset data transaksional.'
    );
  });

  it('getTransactionalResetPreview aggregates row counts and tolerates missing/failing tables', async () => {
    const countsByTable: Record<string, { count: number | null; error: any }> = {
      cash_flow: { count: 42, error: null },
      deposit_transactions: { count: 120, error: null },
      sales: { count: 18, error: null },
      fiscal_year_closings: { count: null, error: { code: '42P01', message: 'relation does not exist' } },
    };

    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockImplementation(() => {
        if (table === 'purchase_returns') {
          return Promise.reject(new Error('network timeout'));
        }
        const entry = countsByTable[table] ?? { count: 0, error: null };
        return Promise.resolve(entry);
      }),
    }));

    const preview = await getTransactionalResetPreview();

    expect(preview.tables).toHaveLength(TRANSACTIONAL_PREVIEW_TABLES.length);
    expect(preview.totalRows).toBe(180);
    expect(preview.tables.find((t) => t.table === 'cash_flow')?.count).toBe(42);
    expect(preview.tables.find((t) => t.table === 'fiscal_year_closings')?.count).toBe(0);
    expect(preview.tables.find((t) => t.table === 'purchase_returns')?.count).toBe(0);
  });

  it('clearTransactionalLocalCaches safely handles localStorage errors', () => {
    localStorageMock.removeItem.mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });

    expect(() => clearTransactionalLocalCaches()).not.toThrow();
  });
});

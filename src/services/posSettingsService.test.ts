import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPosSettings,
  updatePosSettings,
  getStoredLocalSettings,
  clearSettingsCache,
  isPosSettingsMigratedInSupabase,
  cleanupExpiredParkedSales,
  resetPosTransactionsHistory,
  DEFAULT_POS_SETTINGS,
  POS_SETTINGS_STORAGE_KEY
} from './posSettingsService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

// Mock localStorage for test environment
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value.toString();
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
  })
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true
});

describe('posSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    clearSettingsCache();
  });

  it('should have DEFAULT_POS_SETTINGS with 5.0% member discount', () => {
    expect(DEFAULT_POS_SETTINGS.member_discount_percentage).toBe(5.0);
  });

  it('should have DEFAULT_POS_SETTINGS with 80mm receipt paper size', () => {
    expect(DEFAULT_POS_SETTINGS.receipt_paper_size).toBe('80mm');
  });

  it('should return default receipt_paper_size 80mm when fallback to default', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Table does not exist' } })
        })
      })
    });

    const settings = await getPosSettings(true);
    expect(settings.receipt_paper_size).toBe('80mm');
  });

  it('should read stored receipt_paper_size 58mm from localStorage', async () => {
    mockStorage[POS_SETTINGS_STORAGE_KEY] = JSON.stringify({
      id: 1,
      max_hold_duration_minutes: 60,
      allow_negative_stock: true,
      member_discount_percentage: 5.0,
      receipt_paper_size: '58mm'
    });

    const localSettings = getStoredLocalSettings();
    expect(localSettings?.receipt_paper_size).toBe('58mm');

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Could not find the table 'public.pos_settings' in the schema cache" }
          })
        })
      })
    });

    const settings = await getPosSettings(true);
    expect(settings.receipt_paper_size).toBe('58mm');
  });

  it('should fallback to 80mm if invalid receipt_paper_size is in localStorage', async () => {
    mockStorage[POS_SETTINGS_STORAGE_KEY] = JSON.stringify({
      id: 1,
      receipt_paper_size: 'invalid-size'
    });

    const localSettings = getStoredLocalSettings();
    expect(localSettings?.receipt_paper_size).toBe('80mm');
  });

  it('should update receipt_paper_size to 58mm in localStorage and Supabase upsert payload', async () => {
    (supabase.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        })
      })
    });

    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockReturnValueOnce({
      upsert: mockUpsert
    });

    const result = await updatePosSettings({ receipt_paper_size: '58mm' });
    expect(result.success).toBe(true);
    expect(result.data.receipt_paper_size).toBe('58mm');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        receipt_paper_size: '58mm'
      })
    );
    const saved = JSON.parse(mockStorage[POS_SETTINGS_STORAGE_KEY]);
    expect(saved.receipt_paper_size).toBe('58mm');
  });

  it('should return default POS settings when database query fails and localStorage is empty', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Table does not exist' } })
        })
      })
    });

    const settings = await getPosSettings(true);
    expect(settings.max_hold_duration_minutes).toBe(DEFAULT_POS_SETTINGS.max_hold_duration_minutes);
    expect(settings.allow_negative_stock).toBe(DEFAULT_POS_SETTINGS.allow_negative_stock);
    expect(settings.member_discount_percentage).toBe(DEFAULT_POS_SETTINGS.member_discount_percentage);
    expect(settings.member_discount_percentage).toBe(5.0);
  });

  it('should return stored localStorage settings when database fails but localStorage has data', async () => {
    mockStorage[POS_SETTINGS_STORAGE_KEY] = JSON.stringify({
      id: 1,
      max_hold_duration_minutes: 60,
      allow_negative_stock: true,
      member_discount_percentage: 7.5
    });

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Could not find the table 'public.pos_settings' in the schema cache" }
          })
        })
      })
    });

    const settings = await getPosSettings(true);
    expect(settings.max_hold_duration_minutes).toBe(60);
    expect(settings.allow_negative_stock).toBe(true);
    expect(settings.member_discount_percentage).toBe(7.5);
  });

  it('should return database settings and sync to localStorage when Supabase succeeds', async () => {
    const mockData = {
      id: 1,
      max_hold_duration_minutes: 240,
      allow_negative_stock: false,
      member_discount_percentage: 8.0,
      updated_at: '2026-10-28T00:00:00Z'
    };

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null })
        })
      })
    });

    const settings = await getPosSettings(true);
    expect(settings.max_hold_duration_minutes).toBe(240);
    expect(settings.allow_negative_stock).toBe(false);
    expect(settings.member_discount_percentage).toBe(8.0);
    expect(mockStorage[POS_SETTINGS_STORAGE_KEY]).toBeDefined();
    const stored = JSON.parse(mockStorage[POS_SETTINGS_STORAGE_KEY]);
    expect(stored.member_discount_percentage).toBe(8.0);
  });

  it('should send member_discount_percentage to Supabase upsert payload when updating settings', async () => {
    // getPosSettings returns defaults
    (supabase.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        })
      })
    });

    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockReturnValueOnce({
      upsert: mockUpsert
    });

    const result = await updatePosSettings({ member_discount_percentage: 10.0 });
    expect(result.success).toBe(true);
    expect(result.data.member_discount_percentage).toBe(10.0);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        member_discount_percentage: 10.0
      })
    );
    const saved = JSON.parse(mockStorage[POS_SETTINGS_STORAGE_KEY]);
    expect(saved.member_discount_percentage).toBe(10.0);
  });

  it('should handle schema cache error gracefully when saving settings, saving to localStorage as fallback', async () => {
    // getPosSettings returns defaults
    (supabase.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Table does not exist' } })
        })
      })
    });

    // upsert fails with schema cache error
    (supabase.from as any).mockReturnValueOnce({
      upsert: vi.fn().mockResolvedValue({
        error: { code: 'PGRST205', message: "Could not find the table 'public.pos_settings' in the schema cache" }
      })
    });

    const result = await updatePosSettings({ max_hold_duration_minutes: 45 });
    expect(result.success).toBe(true);
    expect(result.isLocalFallback).toBe(true);
    expect(result.data.max_hold_duration_minutes).toBe(45);

    const saved = JSON.parse(mockStorage[POS_SETTINGS_STORAGE_KEY]);
    expect(saved.max_hold_duration_minutes).toBe(45);
  });

  it('should detect if pos_settings table is migrated in Supabase', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null })
      })
    });

    const migrated = await isPosSettingsMigratedInSupabase();
    expect(migrated).toBe(true);
  });

  it('should successfully execute cleanupExpiredParkedSales via RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: { success: true, cleaned_count: 3 },
      error: null
    });

    const result = await cleanupExpiredParkedSales();
    expect(result.success).toBe(true);
    expect(result.cleanedCount).toBe(3);
    expect(supabase.rpc).toHaveBeenCalledWith('cleanup_expired_parked_sales');
  });

  it('should execute client-side fallback cleanup when RPC is not found', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function cleanup_expired_parked_sales' }
    });

    // Mock client-side sales query
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lt: vi.fn().mockResolvedValue({
                data: [{ id: 'sale-expired-1', expires_at: '2026-01-01T00:00:00Z' }],
                error: null
              })
            })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        };
      }
      if (table === 'sale_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ product_id: 'prod-1', quantity: 2, qty: 2 }],
              error: null
            })
          })
        };
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { stock: 5 }, error: null })
            })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        };
      }
      return {};
    });

    const result = await cleanupExpiredParkedSales();
    expect(result.success).toBe(true);
    expect(result.cleanedCount).toBe(1);
  });

  describe('resetPosTransactionsHistory', () => {
    it('should call reset_pos_and_procurement_history RPC and clear active shift localStorage', async () => {
      const mockResult = {
        success: true,
        deleted_sales: 10,
        deleted_purchases: 5,
        deleted_returns: 2,
        message: 'Seluruh riwayat penjualan, shift kasir, pembelian, dan retur barang berhasil dikosongkan. Stok barang tetap utuh.'
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: mockResult,
        error: null
      } as any);

      localStorageMock.setItem('simkop_active_shift_id', 'shift-123');
      localStorageMock.setItem('simkop_active_shift_data', JSON.stringify({ id: 'shift-123' }));

      const result = await resetPosTransactionsHistory();

      expect(supabase.rpc).toHaveBeenCalledWith('reset_pos_and_procurement_history');
      expect(result).toEqual(mockResult);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('simkop_active_shift_id');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('simkop_active_shift_data');
    });

    it('should fallback to client-side deletion when RPC fails', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC not found' }
      } as any);

      const mockDeleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({ error: null })
      };

      vi.mocked(supabase.from).mockReturnValue(mockDeleteChain as any);

      const result = await resetPosTransactionsHistory();

      expect(result.success).toBe(true);
      expect(result.message).toContain('berhasil dikosongkan');
    });

    it('should throw an error when both RPC and client-side deletion fail', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC not found' }
      } as any);

      const mockDeleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({ error: { message: 'Permission denied on sales table' } })
      };

      vi.mocked(supabase.from).mockReturnValue(mockDeleteChain as any);

      await expect(resetPosTransactionsHistory()).rejects.toThrow('Permission denied on sales table');
    });
  });
});


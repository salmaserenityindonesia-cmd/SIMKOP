import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPosSettings,
  updatePosSettings,
  clearSettingsCache,
  isPosSettingsMigratedInSupabase,
  cleanupExpiredParkedSales,
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
  });

  it('should return stored localStorage settings when database fails but localStorage has data', async () => {
    mockStorage[POS_SETTINGS_STORAGE_KEY] = JSON.stringify({
      id: 1,
      max_hold_duration_minutes: 60,
      allow_negative_stock: true
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
  });

  it('should return database settings and sync to localStorage when Supabase succeeds', async () => {
    const mockData = {
      id: 1,
      max_hold_duration_minutes: 240,
      allow_negative_stock: false,
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
    expect(mockStorage[POS_SETTINGS_STORAGE_KEY]).toBeDefined();
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
});


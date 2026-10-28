import { supabase } from '../lib/supabaseClient';

export interface POSSettings {
  id?: number;
  max_hold_duration_minutes: number;
  allow_negative_stock: boolean;
  updated_at?: string;
}

export const DEFAULT_POS_SETTINGS: POSSettings = {
  id: 1,
  max_hold_duration_minutes: 120, // 2 jam default
  allow_negative_stock: false
};

export const POS_SETTINGS_STORAGE_KEY = 'simkop_pos_settings';

// In-memory cache for ultra-fast access in POS hot paths
let cachedSettings: POSSettings | null = null;

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch (err) {
    console.warn('Storage not accessible:', err);
  }
  return null;
}

/**
 * Read settings from local browser storage
 */
export function getStoredLocalSettings(): POSSettings | null {
  try {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(POS_SETTINGS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as POSSettings;
      }
    }
  } catch (err) {
    console.warn('Gagal membaca pos_settings dari localStorage:', err);
  }
  return null;
}

/**
 * Persist settings to local browser storage
 */
export function saveStoredLocalSettings(settings: POSSettings): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(POS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }
  } catch (err) {
    console.warn('Gagal menyimpan pos_settings ke localStorage:', err);
  }
}

/**
 * Clear in-memory cache (primarily for tests)
 */
export function clearSettingsCache(): void {
  cachedSettings = null;
}

/**
 * Check if pos_settings table exists and is accessible in Supabase
 */
export async function isPosSettingsMigratedInSupabase(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pos_settings')
      .select('id')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Helper to identify schema cache / missing table errors
 */
function isSchemaCacheError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    err.code === 'PGRST200' ||
    err.code === 'PGRST202' ||
    msg.includes('schema cache') ||
    msg.includes('not find the table') ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

/**
 * Retrieves POS settings with multi-layered fallback
 */
export async function getPosSettings(forceRefresh: boolean = false): Promise<POSSettings> {
  if (!forceRefresh && cachedSettings) {
    return cachedSettings;
  }

  try {
    const { data, error } = await supabase
      .from('pos_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch pos_settings from Supabase, using localStorage/default fallback:', error.message);
      const local = getStoredLocalSettings();
      cachedSettings = local || { ...DEFAULT_POS_SETTINGS };
      return cachedSettings;
    }

    if (data) {
      cachedSettings = {
        id: data.id,
        max_hold_duration_minutes: Number(data.max_hold_duration_minutes) || DEFAULT_POS_SETTINGS.max_hold_duration_minutes,
        allow_negative_stock: Boolean(data.allow_negative_stock),
        updated_at: data.updated_at
      };
      saveStoredLocalSettings(cachedSettings);
      return cachedSettings;
    }
  } catch (err: any) {
    console.warn('Error reading pos_settings, using fallback:', err?.message || err);
  }

  const local = getStoredLocalSettings();
  cachedSettings = local || { ...DEFAULT_POS_SETTINGS };
  return cachedSettings;
}

/**
 * Updates POS settings in both localStorage and Supabase
 */
export async function updatePosSettings(
  settings: Partial<POSSettings>
): Promise<{ success: boolean; data: POSSettings; isLocalFallback?: boolean; error?: string }> {
  const current = await getPosSettings();
  const merged: POSSettings = {
    ...current,
    ...settings,
    id: 1,
    updated_at: new Date().toISOString()
  };

  // Always save locally immediately
  saveStoredLocalSettings(merged);
  cachedSettings = merged;

  try {
    const { error } = await supabase
      .from('pos_settings')
      .upsert({
        id: 1,
        max_hold_duration_minutes: merged.max_hold_duration_minutes,
        allow_negative_stock: merged.allow_negative_stock,
        updated_at: merged.updated_at
      });

    if (error) {
      console.warn('Supabase updatePosSettings error:', error.message);
      if (isSchemaCacheError(error)) {
        return {
          success: true,
          data: merged,
          isLocalFallback: true
        };
      }
      return {
        success: false,
        data: merged,
        error: error.message
      };
    }

    return {
      success: true,
      data: merged,
      isLocalFallback: false
    };
  } catch (err: any) {
    console.warn('Exception during updatePosSettings:', err?.message || err);
    if (isSchemaCacheError(err)) {
      return {
        success: true,
        data: merged,
        isLocalFallback: true
      };
    }
    return {
      success: false,
      data: merged,
      error: err?.message || 'Gagal menyimpan pengaturan ke database'
    };
  }
}

/**
 * Executes cleanup of expired parked sales.
 * Uses PostgreSQL RPC if available, or falls back to client-side logic.
 */
export async function cleanupExpiredParkedSales(): Promise<{ success: boolean; cleanedCount: number; error?: string }> {
  try {
    // 1. Try PostgreSQL RPC
    const { data, error } = await supabase.rpc('cleanup_expired_parked_sales');
    if (!error && data) {
      const count = typeof data.cleaned_count === 'number' ? data.cleaned_count : 0;
      return { success: true, cleanedCount: count };
    }

    if (error && !isSchemaCacheError(error)) {
      console.warn('RPC cleanup_expired_parked_sales error:', error.message);
    }
  } catch (rpcErr) {
    console.warn('RPC cleanup_expired_parked_sales failed, attempting client fallback:', rpcErr);
  }

  // 2. Client-side fallback cleanup
  try {
    const nowIso = new Date().toISOString();
    // Query parked transactions that have expired
    const { data: expiredSales, error: salesErr } = await supabase
      .from('sales')
      .select('id, expires_at, sale_status')
      .eq('sale_status', 'parked')
      .lt('expires_at', nowIso);

    if (salesErr || !expiredSales || expiredSales.length === 0) {
      return { success: true, cleanedCount: 0 };
    }

    let cleaned = 0;
    for (const sale of expiredSales) {
      // Fetch items for this sale
      const { data: items } = await supabase
        .from('sale_items')
        .select('product_id, quantity, qty')
        .eq('sale_id', sale.id);

      // Restock items
      if (items && items.length > 0) {
        for (const item of items) {
          if (item.product_id) {
            const restockQty = item.quantity || item.qty || 0;
            if (restockQty > 0) {
              const { data: prod } = await supabase
                .from('products')
                .select('stock')
                .eq('id', item.product_id)
                .maybeSingle();

              if (prod) {
                await supabase
                  .from('products')
                  .update({ stock: (prod.stock || 0) + restockQty })
                  .eq('id', item.product_id);
              }
            }
          }
        }
      }

      // Mark sale cancelled
      await supabase
        .from('sales')
        .update({ sale_status: 'cancelled' })
        .eq('id', sale.id);

      cleaned++;
    }

    return { success: true, cleanedCount: cleaned };
  } catch (fallbackErr: any) {
    console.warn('Client fallback cleanup error:', fallbackErr);
    return { success: false, cleanedCount: 0, error: fallbackErr?.message };
  }
}


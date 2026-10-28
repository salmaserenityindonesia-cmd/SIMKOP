import { supabase } from '../lib/supabaseClient';

export interface KoperasiProfile {
  id?: number;
  nama_koperasi: string;
  alamat: string;
  telepon: string;
  terminal_name: string;
  footer_notes: string;
  updated_at?: string;
}

export const DEFAULT_KOPERASI_PROFILE: KoperasiProfile = {
  id: 1,
  nama_koperasi: 'KOPERASI PRIMKOPPOL',
  alamat: 'Jl. Jaksa Agung Suprapto No. 10, Ngawi',
  telepon: '(0354)7654321',
  terminal_name: 'POS Terminal #01',
  footer_notes: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan'
};

export const KOPERASI_PROFILE_STORAGE_KEY = 'simkop_koperasi_profile';

// In-memory cache for fast access across POS & components
let cachedProfile: KoperasiProfile | null = null;

/**
 * Safe accessor for localStorage across browser and test/node environments
 */
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
 * Helper to safely read profile from browser localStorage
 */
export function getStoredLocalProfile(): KoperasiProfile | null {
  try {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(KOPERASI_PROFILE_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as KoperasiProfile;
      }
    }
  } catch (err) {
    console.warn('Gagal membaca profile dari localStorage:', err);
  }
  return null;
}

/**
 * Helper to safely persist profile to browser localStorage
 */
export function saveStoredLocalProfile(profile: KoperasiProfile): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(KOPERASI_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    }
  } catch (err) {
    console.warn('Gagal menyimpan profile ke localStorage:', err);
  }
}

/**
 * Check if the koperasi_profile table exists and is accessible in Supabase
 */
export async function isTableMigratedInSupabase(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('koperasi_profile')
      .select('id')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Retrieves the koperasi profile from Supabase with graceful fallback to localStorage and default constants
 */
export async function getKoperasiProfile(forceRefresh: boolean = false): Promise<KoperasiProfile> {
  if (!forceRefresh && cachedProfile) {
    return cachedProfile;
  }

  try {
    const { data, error } = await supabase
      .from('koperasi_profile')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch koperasi_profile from Supabase, using localStorage/default fallback:', error.message);
      const local = getStoredLocalProfile();
      cachedProfile = local || cachedProfile || DEFAULT_KOPERASI_PROFILE;
      return cachedProfile;
    }

    if (data) {
      cachedProfile = {
        id: data.id,
        nama_koperasi: data.nama_koperasi || DEFAULT_KOPERASI_PROFILE.nama_koperasi,
        alamat: data.alamat || DEFAULT_KOPERASI_PROFILE.alamat,
        telepon: data.telepon || DEFAULT_KOPERASI_PROFILE.telepon,
        terminal_name: data.terminal_name || DEFAULT_KOPERASI_PROFILE.terminal_name,
        footer_notes: data.footer_notes !== undefined && data.footer_notes !== null ? data.footer_notes : DEFAULT_KOPERASI_PROFILE.footer_notes,
        updated_at: data.updated_at
      };
      // Keep localStorage in sync with cloud
      saveStoredLocalProfile(cachedProfile);
      return cachedProfile;
    }

    const local = getStoredLocalProfile();
    cachedProfile = local || cachedProfile || DEFAULT_KOPERASI_PROFILE;
    return cachedProfile;
  } catch (err) {
    console.error('getKoperasiProfile unexpected error, falling back to localStorage/default:', err);
    const local = getStoredLocalProfile();
    cachedProfile = local || cachedProfile || DEFAULT_KOPERASI_PROFILE;
    return cachedProfile;
  }
}

export interface UpdateKoperasiProfileResult {
  success: boolean;
  data?: KoperasiProfile;
  error?: string;
  isLocalFallback?: boolean;
  message?: string;
}

/**
 * Updates the koperasi profile with instant local backup and resilient error handling for unmigrated Supabase schemas
 */
export async function updateKoperasiProfile(
  payload: Partial<KoperasiProfile>
): Promise<UpdateKoperasiProfileResult> {
  const normalizedData: KoperasiProfile = {
    id: 1,
    nama_koperasi: payload.nama_koperasi !== undefined ? payload.nama_koperasi.trim() : DEFAULT_KOPERASI_PROFILE.nama_koperasi,
    alamat: payload.alamat !== undefined ? payload.alamat.trim() : DEFAULT_KOPERASI_PROFILE.alamat,
    telepon: payload.telepon !== undefined ? payload.telepon.trim() : DEFAULT_KOPERASI_PROFILE.telepon,
    terminal_name: payload.terminal_name !== undefined ? payload.terminal_name.trim() : DEFAULT_KOPERASI_PROFILE.terminal_name,
    footer_notes: payload.footer_notes !== undefined ? payload.footer_notes.trim() : DEFAULT_KOPERASI_PROFILE.footer_notes,
    updated_at: new Date().toISOString()
  };

  // 1. Selalu simpan salinan ke localStorage sebagai backup seketika
  saveStoredLocalProfile(normalizedData);
  cachedProfile = normalizedData;

  try {
    // 2. Lakukan upsert ke Supabase
    const { data, error } = await supabase
      .from('koperasi_profile')
      .upsert(normalizedData, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      console.warn('Supabase updateKoperasiProfile warning/error:', error.message);

      // Cek apakah error disebabkan tabel belum ada di schema cache PostgREST
      const isMissingTableOrCache =
        error.message?.toLowerCase().includes('schema cache') ||
        error.message?.toLowerCase().includes('koperasi_profile') ||
        (error as any).code === 'PGRST205' ||
        (error as any).code === '42P01';

      if (isMissingTableOrCache) {
        return {
          success: true,
          data: normalizedData,
          isLocalFallback: true,
          message: 'Profil berhasil disimpan secara lokal di browser. Tabel Supabase belum termigrasi.'
        };
      }

      return {
        success: true,
        data: normalizedData,
        isLocalFallback: true,
        message: `Tersimpan secara lokal: ${error.message}`
      };
    }

    const updatedData: KoperasiProfile = {
      id: data.id,
      nama_koperasi: data.nama_koperasi || normalizedData.nama_koperasi,
      alamat: data.alamat || normalizedData.alamat,
      telepon: data.telepon || normalizedData.telepon,
      terminal_name: data.terminal_name || normalizedData.terminal_name,
      footer_notes: data.footer_notes !== undefined ? data.footer_notes : normalizedData.footer_notes,
      updated_at: data.updated_at
    };

    saveStoredLocalProfile(updatedData);
    cachedProfile = updatedData;

    return {
      success: true,
      data: updatedData,
      isLocalFallback: false,
      message: 'Profil koperasi berhasil diperbarui di database Supabase.'
    };
  } catch (err: any) {
    console.warn('Eksepsi jaringan/sistem updateKoperasiProfile:', err);
    return {
      success: true,
      data: normalizedData,
      isLocalFallback: true,
      message: 'Profil disimpan secara lokal (offline fallback).'
    };
  }
}

/**
 * Helper to clear cache (useful in tests and after update)
 */
export function clearProfileCache(): void {
  cachedProfile = null;
}

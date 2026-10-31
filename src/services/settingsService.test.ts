import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getKoperasiProfile,
  updateKoperasiProfile,
  clearProfileCache,
  isTableMigratedInSupabase,
  DEFAULT_KOPERASI_PROFILE,
  KOPERASI_PROFILE_STORAGE_KEY
} from './settingsService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn()
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

describe('settingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    clearProfileCache();
  });

  it('should return default profile when database query fails and localStorage is empty', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Table does not exist' } })
        })
      })
    });

    const profile = await getKoperasiProfile(true);
    expect(profile.nama_koperasi).toBe(DEFAULT_KOPERASI_PROFILE.nama_koperasi);
    expect(profile.alamat).toBe(DEFAULT_KOPERASI_PROFILE.alamat);
    expect(profile.terminal_name).toBe(DEFAULT_KOPERASI_PROFILE.terminal_name);
  });

  it('should return stored localStorage profile when database fails but localStorage has data', async () => {
    mockStorage[KOPERASI_PROFILE_STORAGE_KEY] = JSON.stringify({
      nama_koperasi: 'KOPERASI PRIMKOPPOL NGAWI',
      alamat: 'Jl. Jaksa Agung Suprapto No. 10',
      telepon: '0812345678',
      terminal_name: 'POS-01',
      footer_notes: 'Terima kasih'
    });

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Could not find the table 'public.koperasi_profile' in the schema cache" }
          })
        })
      })
    });

    const profile = await getKoperasiProfile(true);
    expect(profile.nama_koperasi).toBe('KOPERASI PRIMKOPPOL NGAWI');
    expect(profile.alamat).toBe('Jl. Jaksa Agung Suprapto No. 10');
  });

  it('should return stored profile when database returns data and sync it to localStorage', async () => {
    const mockData = {
      id: 1,
      nama_koperasi: 'KOPERASI KARYAWAN PT MAJU',
      alamat: 'Jl. Sudirman Kav 20, Jakarta Selatan',
      telepon: '(021) 1234567',
      terminal_name: 'POS Terminal 02',
      footer_notes: 'Terima kasih telah berbelanja!',
      updated_at: '2026-10-28T00:00:00Z'
    };

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null })
        })
      })
    });

    const profile = await getKoperasiProfile(true);
    expect(profile.nama_koperasi).toBe('KOPERASI KARYAWAN PT MAJU');
    expect(profile.alamat).toBe('Jl. Sudirman Kav 20, Jakarta Selatan');
    expect(profile.terminal_name).toBe('POS Terminal 02');

    // Check localStorage was synced
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      KOPERASI_PROFILE_STORAGE_KEY,
      expect.stringContaining('KOPERASI KARYAWAN PT MAJU')
    );
  });

  it('should handle schema cache error gracefully when saving, saving to localStorage as fallback', async () => {
    (supabase.from as any).mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: 'PGRST205',
              message: "Could not find the table 'public.koperasi_profile' in the schema cache"
            }
          })
        })
      })
    });

    const res = await updateKoperasiProfile({
      nama_koperasi: 'KOPERASI PRIMKOPPOL',
      alamat: 'Jl. Jaksa Agung Suprapto No. 10, Ngawi'
    });

    expect(res.success).toBe(true);
    expect(res.isLocalFallback).toBe(true);
    expect(res.data?.nama_koperasi).toBe('KOPERASI PRIMKOPPOL');

    // Must be in localStorage
    expect(mockStorage[KOPERASI_PROFILE_STORAGE_KEY]).toBeDefined();
    const stored = JSON.parse(mockStorage[KOPERASI_PROFILE_STORAGE_KEY]);
    expect(stored.nama_koperasi).toBe('KOPERASI PRIMKOPPOL');
  });

  it('should update profile in Supabase when available and return isLocalFallback false', async () => {
    const updatedRecord = {
      id: 1,
      nama_koperasi: 'KOPERASI PRIMKOPPOL RESMI',
      alamat: 'Jl. Jaksa Agung Suprapto No. 10',
      telepon: '08123456789',
      terminal_name: 'POS Kasir #01',
      footer_notes: 'Struk resmi koperasi',
      updated_at: '2026-10-28T10:00:00Z'
    };

    (supabase.from as any).mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: updatedRecord, error: null })
        })
      })
    });

    const res = await updateKoperasiProfile({
      nama_koperasi: 'KOPERASI PRIMKOPPOL RESMI'
    });

    expect(res.success).toBe(true);
    expect(res.isLocalFallback).toBe(false);
    expect(res.data?.nama_koperasi).toBe('KOPERASI PRIMKOPPOL RESMI');

    // Subsequent call should hit cache without calling supabase.from
    const cached = await getKoperasiProfile(false);
    expect(cached.nama_koperasi).toBe('KOPERASI PRIMKOPPOL RESMI');
  });

  it('should check if table is migrated in Supabase', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null })
      })
    });

    const isMigrated = await isTableMigratedInSupabase();
    expect(isMigrated).toBe(true);

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Could not find the table 'public.koperasi_profile' in the schema cache" }
        })
      })
    });

    const isMigratedFalse = await isTableMigratedInSupabase();
    expect(isMigratedFalse).toBe(false);
  });

  it('should preserve and update logo_url correctly in Supabase and local storage', async () => {
    const updatedRecord = {
      id: 1,
      nama_koperasi: 'KOPERASI PRIMKOPPOL RESMI',
      alamat: 'Jl. Jaksa Agung Suprapto No. 10',
      telepon: '08123456789',
      terminal_name: 'POS Kasir #01',
      footer_notes: 'Struk resmi koperasi',
      logo_url: 'https://res.cloudinary.com/demo/image/upload/v123456/simkop/branding/logo.png',
      updated_at: '2026-10-31T10:00:00Z'
    };

    (supabase.from as any).mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: updatedRecord, error: null })
        })
      })
    });

    const res = await updateKoperasiProfile({
      nama_koperasi: 'KOPERASI PRIMKOPPOL RESMI',
      logo_url: 'https://res.cloudinary.com/demo/image/upload/v123456/simkop/branding/logo.png'
    });

    expect(res.success).toBe(true);
    expect(res.data?.logo_url).toBe('https://res.cloudinary.com/demo/image/upload/v123456/simkop/branding/logo.png');

    const profile = await getKoperasiProfile(false);
    expect(profile.logo_url).toBe('https://res.cloudinary.com/demo/image/upload/v123456/simkop/branding/logo.png');
  });

  it('should store and retrieve logo_url in localStorage fallback when Supabase fails', async () => {
    (supabase.from as any).mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: 'PGRST205',
              message: "Could not find the table 'public.koperasi_profile' in the schema cache"
            }
          })
        })
      })
    });

    const testLogo = 'https://res.cloudinary.com/test/image/upload/v1/logo.png';
    const res = await updateKoperasiProfile({
      nama_koperasi: 'KOPERASI TEST LOCAL',
      logo_url: testLogo
    });

    expect(res.success).toBe(true);
    expect(res.isLocalFallback).toBe(true);
    expect(res.data?.logo_url).toBe(testLogo);

    // Verify localStorage has the logo_url
    const stored = JSON.parse(mockStorage[KOPERASI_PROFILE_STORAGE_KEY]);
    expect(stored.logo_url).toBe(testLogo);

    // Verify getKoperasiProfile returns this logo_url from fallback
    clearProfileCache();
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Table does not exist' }
          })
        })
      })
    });

    const fetched = await getKoperasiProfile(true);
    expect(fetched.logo_url).toBe(testLogo);
  });
});



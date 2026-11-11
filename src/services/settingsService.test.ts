import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getKoperasiProfile,
  updateKoperasiProfile,
  clearProfileCache,
  isTableMigratedInSupabase,
  DEFAULT_KOPERASI_PROFILE,
  KOPERASI_PROFILE_STORAGE_KEY,
  getLoanSettings,
  updateLoanSettings,
  DEFAULT_MIN_REMAINING_THP,
  DEFAULT_RAT_NOTES
} from './settingsService';
import {
  loanService,
  getLoanSettings as loanGetLoanSettings,
  updateLoanSettings as loanUpdateLoanSettings
} from './loanService';
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

  describe('LoanSettings dynamic threshold', () => {
    it('should return default loan settings when database and localStorage are empty', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Table does not exist' } })
          })
        })
      });

      const settings = await getLoanSettings(true);
      expect(settings.minRemainingThp).toBe(DEFAULT_MIN_REMAINING_THP);
      expect(settings.minRemainingThp).toBe(1500000);
      expect(settings.ratNotes).toBe(DEFAULT_RAT_NOTES);
    });

    it('should return configured loan settings from Supabase database', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 1,
                nama_koperasi: 'KOPERASI PRIMKOPPOL',
                min_remaining_thp: 2000000,
                min_thp_rat_notes: 'Keputusan RAT 2026 Batas Rp 2.000.000'
              },
              error: null
            })
          })
        })
      });

      const settings = await getLoanSettings(true);
      expect(settings.minRemainingThp).toBe(2000000);
      expect(settings.ratNotes).toBe('Keputusan RAT 2026 Batas Rp 2.000.000');
    });

    it('should fallback to default 1.500.000 if stored/db value is non-positive or invalid', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 1,
                min_remaining_thp: 0,
                min_thp_rat_notes: null
              },
              error: null
            })
          })
        })
      });

      const settings = await getLoanSettings(true);
      expect(settings.minRemainingThp).toBe(1500000);
      expect(settings.ratNotes).toBe(DEFAULT_RAT_NOTES);
    });

    it('should return stored loan settings from localStorage fallback when database fails', async () => {
      mockStorage[KOPERASI_PROFILE_STORAGE_KEY] = JSON.stringify({
        nama_koperasi: 'KOPERASI PRIMKOPPOL',
        min_remaining_thp: 1750000,
        min_thp_rat_notes: 'Keputusan RAT Luar Biasa Rp 1.750.000'
      });

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Network offline' }
            })
          })
        })
      });

      const settings = await getLoanSettings(true);
      expect(settings.minRemainingThp).toBe(1750000);
      expect(settings.ratNotes).toBe('Keputusan RAT Luar Biasa Rp 1.750.000');
    });

    it('should update loan settings in Supabase and sync to local cache and storage', async () => {
      const updatedRecord = {
        id: 1,
        nama_koperasi: 'KOPERASI PRIMKOPPOL',
        alamat: 'Jl. Jaksa Agung Suprapto No. 10, Ngawi',
        telepon: '(0354)7654321',
        terminal_name: 'POS Terminal #01',
        footer_notes: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan',
        min_remaining_thp: 1800000,
        min_thp_rat_notes: 'Keputusan RAT Tahun Buku 2025: Batas THP Rp 1.800.000',
        updated_at: '2026-11-01T00:00:00Z'
      };

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: DEFAULT_KOPERASI_PROFILE, error: null })
          })
        }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: updatedRecord, error: null })
          })
        })
      });

      const res = await updateLoanSettings({
        minRemainingThp: 1800000,
        ratNotes: 'Keputusan RAT Tahun Buku 2025: Batas THP Rp 1.800.000'
      });

      expect(res.success).toBe(true);
      expect(res.isLocalFallback).toBe(false);
      expect(res.data?.min_remaining_thp).toBe(1800000);
      expect(res.data?.min_thp_rat_notes).toBe('Keputusan RAT Tahun Buku 2025: Batas THP Rp 1.800.000');

      // Check subsequent getLoanSettings returns updated cached value
      const cached = await getLoanSettings(false);
      expect(cached.minRemainingThp).toBe(1800000);
      expect(cached.ratNotes).toBe('Keputusan RAT Tahun Buku 2025: Batas THP Rp 1.800.000');
    });

    it('should fallback gracefully to localStorage when Supabase update fails', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: DEFAULT_KOPERASI_PROFILE, error: null })
          })
        }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST205', message: 'Schema cache error' }
            })
          })
        })
      });

      const res = await updateLoanSettings({
        minRemainingThp: 1600000,
        ratNotes: 'Keputusan RAT Lokal'
      });

      expect(res.success).toBe(true);
      expect(res.isLocalFallback).toBe(true);
      expect(res.data?.min_remaining_thp).toBe(1600000);

      // Verify in localStorage
      const stored = JSON.parse(mockStorage[KOPERASI_PROFILE_STORAGE_KEY]);
      expect(stored.min_remaining_thp).toBe(1600000);
      expect(stored.min_thp_rat_notes).toBe('Keputusan RAT Lokal');
    });

    it('should be re-exported by loanService and accessible via helper or service object', async () => {
      expect(typeof loanGetLoanSettings).toBe('function');
      expect(typeof loanUpdateLoanSettings).toBe('function');
      expect(typeof loanService.getLoanSettings).toBe('function');
      expect(typeof loanService.updateLoanSettings).toBe('function');
    });
  });
});



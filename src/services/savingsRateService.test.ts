import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getRateTiers,
  addRateTier,
  deleteRateTier,
  getApplicableRate,
  getPreviousMonth,
  clearTierCache,
  DEFAULT_RATE_TIERS,
  SAVINGS_RATE_TIERS_STORAGE_KEY,
  SavingsRateTier
} from './savingsRateService';
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

describe('savingsRateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    clearTierCache();
  });

  describe('getPreviousMonth', () => {
    it('should correctly calculate the prior month for non-January months', () => {
      const prev = getPreviousMonth(2025, 11);
      expect(prev).toEqual({ year: 2025, month: 10 });
    });

    it('should roll over to December of the previous year when month is January', () => {
      const prev = getPreviousMonth(2026, 1);
      expect(prev).toEqual({ year: 2025, month: 12 });
    });
  });

  describe('getApplicableRate', () => {
    it('should return 150000 for WAJIB in October 2025 (old rate)', () => {
      const rate = getApplicableRate('WAJIB', 2025, 10);
      expect(rate).toBe(150000);
    });

    it('should return 200000 for WAJIB in November 2025 (new rate)', () => {
      const rate = getApplicableRate('WAJIB', 2025, 11);
      expect(rate).toBe(200000);
    });

    it('should return 200000 for WAJIB for future months like 2026-06', () => {
      const rate = getApplicableRate('WAJIB', 2026, 6);
      expect(rate).toBe(200000);
    });

    it('should return earliest rate 150000 for WAJIB before 2024-01 (e.g., 2023-05)', () => {
      const rate = getApplicableRate('WAJIB', 2023, 5);
      expect(rate).toBe(150000);
    });

    it('should return default rate 25000 for BELANJA and 50000 for LEBARAN', () => {
      expect(getApplicableRate('BELANJA', 2025, 5)).toBe(25000);
      expect(getApplicableRate('LEBARAN', 2025, 4)).toBe(50000);
    });

    it('should work with custom cachedTiers passed into the function', () => {
      const customTiers: SavingsRateTier[] = [
        {
          id: 'custom-1',
          deposit_type_code: 'WAJIB',
          start_year: 2020,
          start_month: 1,
          end_year: 2024,
          end_month: 12,
          monthly_rate: 100000
        },
        {
          id: 'custom-2',
          deposit_type_code: 'WAJIB',
          start_year: 2025,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 300000
        }
      ];

      expect(getApplicableRate('WAJIB', 2023, 8, customTiers)).toBe(100000);
      expect(getApplicableRate('WAJIB', 2025, 3, customTiers)).toBe(300000);
    });

    it('should fall back to hardcoded defaults if tier list is completely empty', () => {
      expect(getApplicableRate('WAJIB', 2025, 10, [])).toBe(150000);
      expect(getApplicableRate('WAJIB', 2025, 11, [])).toBe(200000);
      expect(getApplicableRate('BELANJA', 2025, 1, [])).toBe(25000);
      expect(getApplicableRate('LEBARAN', 2025, 1, [])).toBe(50000);
      expect(getApplicableRate('POKOK', 2025, 1, [])).toBe(0);
      expect(getApplicableRate('UNKNOWN', 2025, 1, [])).toBe(0);
    });

    it('should correctly evaluate tiered rates across multi-year timeline sequence', () => {
      const threeTierSequence: SavingsRateTier[] = [
        {
          id: 'tier-1',
          deposit_type_code: 'WAJIB',
          start_year: 2022,
          start_month: 1,
          end_year: 2023,
          end_month: 12,
          monthly_rate: 100000
        },
        {
          id: 'tier-2',
          deposit_type_code: 'WAJIB',
          start_year: 2024,
          start_month: 1,
          end_year: 2025,
          end_month: 10,
          monthly_rate: 150000
        },
        {
          id: 'tier-3',
          deposit_type_code: 'WAJIB',
          start_year: 2025,
          start_month: 11,
          end_year: null,
          end_month: null,
          monthly_rate: 200000
        }
      ];

      expect(getApplicableRate('WAJIB', 2022, 1, threeTierSequence)).toBe(100000);
      expect(getApplicableRate('WAJIB', 2023, 12, threeTierSequence)).toBe(100000);
      expect(getApplicableRate('WAJIB', 2024, 1, threeTierSequence)).toBe(150000);
      expect(getApplicableRate('WAJIB', 2025, 10, threeTierSequence)).toBe(150000);
      expect(getApplicableRate('WAJIB', 2025, 11, threeTierSequence)).toBe(200000);
      expect(getApplicableRate('WAJIB', 2026, 12, threeTierSequence)).toBe(200000);
    });
  });

  describe('getRateTiers', () => {
    it('should fetch rate tiers from Supabase when available and cache them', async () => {
      const dbTiers: SavingsRateTier[] = [
        {
          id: 'db-1',
          deposit_type_code: 'WAJIB',
          start_year: 2024,
          start_month: 1,
          end_year: 2025,
          end_month: 10,
          monthly_rate: 150000
        },
        {
          id: 'db-2',
          deposit_type_code: 'WAJIB',
          start_year: 2025,
          start_month: 11,
          end_year: null,
          end_month: null,
          monthly_rate: 200000
        }
      ];

      const selectMock = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: dbTiers, error: null })
        })
      });

      (supabase.from as any).mockReturnValue({
        select: selectMock
      });

      const tiers = await getRateTiers(undefined, true);
      expect(tiers).toHaveLength(2);
      expect(tiers[0].monthly_rate).toBe(150000);
      expect(tiers[1].monthly_rate).toBe(200000);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        SAVINGS_RATE_TIERS_STORAGE_KEY,
        expect.any(String)
      );
    });

    it('should fall back gracefully to local storage or defaults when Supabase fails', async () => {
      const selectMock = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Network error' } })
        })
      });

      (supabase.from as any).mockReturnValue({
        select: selectMock
      });

      const tiers = await getRateTiers(undefined, true);
      expect(tiers.length).toBeGreaterThan(0);
      const wajibTiers = tiers.filter(t => t.deposit_type_code === 'WAJIB');
      expect(wajibTiers).toHaveLength(2);
    });

    it('should filter by depositTypeCode when specified', async () => {
      const eqMock = vi.fn().mockResolvedValue({
        data: DEFAULT_RATE_TIERS.filter(t => t.deposit_type_code === 'WAJIB'),
        error: null
      });

      const order2Mock = vi.fn().mockReturnValue({
        eq: eqMock
      });

      const order1Mock = vi.fn().mockReturnValue({
        order: order2Mock
      });

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: order1Mock
        })
      });

      const wajibTiers = await getRateTiers('WAJIB', true);
      expect(wajibTiers.every(t => t.deposit_type_code === 'WAJIB')).toBe(true);
    });
  });

  describe('addRateTier and Anti-Overlap Resolver', () => {
    it('should automatically cut prior open-ended tier to 1 month before new tier start', async () => {
      // Setup initial state with an open-ended tier
      const initialTiers: SavingsRateTier[] = [
        {
          id: 'initial-wajib-open',
          deposit_type_code: 'WAJIB',
          start_year: 2024,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 150000
        }
      ];

      mockStorage[SAVINGS_RATE_TIERS_STORAGE_KEY] = JSON.stringify(initialTiers);

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      });
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'new-wajib-tier',
              deposit_type_code: 'WAJIB',
              start_year: 2025,
              start_month: 11,
              end_year: null,
              end_month: null,
              monthly_rate: 200000
            },
            error: null
          })
        })
      });

      (supabase.from as any).mockImplementation((table: string) => {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: initialTiers, error: null })
            })
          }),
          update: updateMock,
          insert: insertMock
        };
      });

      // Add new tier starting Nov 2025
      const newTier = await addRateTier({
        deposit_type_code: 'WAJIB',
        start_year: 2025,
        start_month: 11,
        monthly_rate: 200000,
        notes: 'Tarif Baru'
      });

      expect(newTier.monthly_rate).toBe(200000);
      expect(newTier.start_year).toBe(2025);
      expect(newTier.start_month).toBe(11);

      // Verify prior tier was cut to end at 2025-10
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          end_year: 2025,
          end_month: 10
        })
      );

      // Check storage has both tiers with proper dates
      const stored = JSON.parse(mockStorage[SAVINGS_RATE_TIERS_STORAGE_KEY]) as SavingsRateTier[];
      const cutPrior = stored.find(t => t.id === 'initial-wajib-open');
      expect(cutPrior).toBeDefined();
      expect(cutPrior?.end_year).toBe(2025);
      expect(cutPrior?.end_month).toBe(10);
    });

    it('should correctly cut across year boundaries when new tier starts in January', async () => {
      const initialTiers: SavingsRateTier[] = [
        {
          id: 'initial-wajib-open',
          deposit_type_code: 'WAJIB',
          start_year: 2025,
          start_month: 11,
          end_year: null,
          end_month: null,
          monthly_rate: 200000
        }
      ];

      mockStorage[SAVINGS_RATE_TIERS_STORAGE_KEY] = JSON.stringify(initialTiers);

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      });
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'tier-2027',
              deposit_type_code: 'WAJIB',
              start_year: 2027,
              start_month: 1,
              end_year: null,
              end_month: null,
              monthly_rate: 250000
            },
            error: null
          })
        })
      });

      (supabase.from as any).mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: initialTiers, error: null })
          })
        }),
        update: updateMock,
        insert: insertMock
      }));

      await addRateTier({
        deposit_type_code: 'WAJIB',
        start_year: 2027,
        start_month: 1,
        monthly_rate: 250000
      });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          end_year: 2026,
          end_month: 12
        })
      );
    });
  });

  describe('deleteRateTier', () => {
    it('should remove tier from database and local storage', async () => {
      const initialTiers: SavingsRateTier[] = [
        {
          id: 'tier-to-delete',
          deposit_type_code: 'WAJIB',
          start_year: 2024,
          start_month: 1,
          end_year: 2025,
          end_month: 10,
          monthly_rate: 150000
        },
        {
          id: 'tier-to-keep',
          deposit_type_code: 'WAJIB',
          start_year: 2025,
          start_month: 11,
          end_year: null,
          end_month: null,
          monthly_rate: 200000
        }
      ];

      mockStorage[SAVINGS_RATE_TIERS_STORAGE_KEY] = JSON.stringify(initialTiers);

      const deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      (supabase.from as any).mockReturnValue({
        delete: deleteMock
      });

      const success = await deleteRateTier('tier-to-delete');
      expect(success).toBe(true);
      expect(deleteMock).toHaveBeenCalled();

      const stored = JSON.parse(mockStorage[SAVINGS_RATE_TIERS_STORAGE_KEY]) as SavingsRateTier[];
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('tier-to-keep');
    });
  });
});

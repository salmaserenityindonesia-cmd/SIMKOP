import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getRateTiers,
  addRateTier,
  deleteRateTier,
  getApplicableRate,
  getActiveSavingsRateTiers,
  resolveSavingsMonthlyRate,
  buildSavingsRateResolver,
  loadSavingsRateConfig,
  getPreviousMonth,
  clearTierCache,
  DEFAULT_RATE_TIERS,
  SAVINGS_RATE_TIERS_STORAGE_KEY,
  SavingsRateTier,
  DepositTypeRateRef
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
    const SAMPLE_TIERS: SavingsRateTier[] = [
      {
        id: 't-wajib-1',
        deposit_type_code: 'WAJIB',
        start_year: 2024,
        start_month: 1,
        end_year: 2025,
        end_month: 10,
        monthly_rate: 150000
      },
      {
        id: 't-wajib-2',
        deposit_type_code: 'WAJIB',
        start_year: 2025,
        start_month: 11,
        end_year: null,
        end_month: null,
        monthly_rate: 200000
      },
      {
        id: 't-belanja-1',
        deposit_type_code: 'BELANJA',
        start_year: 2024,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 25000
      },
      {
        id: 't-lebaran-1',
        deposit_type_code: 'LEBARAN',
        start_year: 2024,
        start_month: 1,
        end_year: 2025,
        end_month: 10,
        monthly_rate: 50000
      }
    ];

    const SAMPLE_DEPOSIT_TYPES: DepositTypeRateRef[] = [
      { code: 'POKOK', name: 'Simpanan Pokok', default_amount: 100000 },
      { code: 'WAJIB', name: 'Simpanan Wajib', default_amount: 175000 },
      { code: 'BELANJA', name: 'Simpanan Belanja', default_amount: 30000 },
      { code: 'LEBARAN', name: 'Simpanan Lebaran', default_amount: 300000 }
    ];

    it('should return 150000 for WAJIB in October 2025 (old rate)', () => {
      const rate = getApplicableRate('WAJIB', 2025, 10, SAMPLE_TIERS, SAMPLE_DEPOSIT_TYPES);
      expect(rate).toBe(150000);
    });

    it('should return 200000 for WAJIB in November 2025 (new rate)', () => {
      const rate = getApplicableRate('WAJIB', 2025, 11, SAMPLE_TIERS, SAMPLE_DEPOSIT_TYPES);
      expect(rate).toBe(200000);
    });

    it('should return 200000 for WAJIB for future months like 2026-06', () => {
      const rate = getApplicableRate('WAJIB', 2026, 6, SAMPLE_TIERS, SAMPLE_DEPOSIT_TYPES);
      expect(rate).toBe(200000);
    });

    it('should fall back to master deposit_types.default_amount before earliest closed tier (e.g., 2023-05)', () => {
      const rate = getApplicableRate('WAJIB', 2023, 5, SAMPLE_TIERS, SAMPLE_DEPOSIT_TYPES);
      expect(rate).toBe(175000);
    });

    it('should prioritize tier when present and fall back to master default_amount outside tier bounds', () => {
      expect(getApplicableRate('BELANJA', 2025, 5, SAMPLE_TIERS, SAMPLE_DEPOSIT_TYPES)).toBe(25000);
      expect(getApplicableRate('LEBARAN', 2025, 4, SAMPLE_TIERS, SAMPLE_DEPOSIT_TYPES)).toBe(50000);
      // Outside LEBARAN closed tier -> falls back to Master Produk default_amount (300000)
      expect(getApplicableRate('LEBARAN', 2026, 11, SAMPLE_TIERS, SAMPLE_DEPOSIT_TYPES)).toBe(300000);
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

    it('should return 0 without hardcoded overrides if both tier list and deposit_types are empty', () => {
      expect(getApplicableRate('WAJIB', 2025, 10, [], [])).toBe(0);
      expect(getApplicableRate('WAJIB', 2025, 11, [], [])).toBe(0);
      expect(getApplicableRate('BELANJA', 2025, 1, [], [])).toBe(0);
      expect(getApplicableRate('LEBARAN', 2025, 1, [], [])).toBe(0);
      expect(getApplicableRate('POKOK', 2025, 1, [], [])).toBe(0);
      expect(getApplicableRate('UNKNOWN', 2025, 1, [], [])).toBe(0);
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

    it('should return stored local tiers when Supabase fails if localStorage has data, or empty array if empty', async () => {
      const selectMock = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Network error' } })
        })
      });

      (supabase.from as any).mockReturnValue({
        select: selectMock
      });

      const tiers = await getRateTiers(undefined, true);
      expect(tiers).toEqual([]);
    });

    it('should return empty array when table is empty and not resurrect default tiers', async () => {
      const selectMock = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      });

      (supabase.from as any).mockReturnValue({
        select: selectMock
      });

      const tiers = await getRateTiers(undefined, true);
      expect(tiers).toEqual([]);
    });

    it('should have empty DEFAULT_RATE_TIERS and DEFAULT_TIERS constants without static mock data', () => {
      expect(DEFAULT_RATE_TIERS).toEqual([]);
    });

    it('should filter by depositTypeCode when specified', async () => {
      const sampleTiers: SavingsRateTier[] = [
        {
          id: 'tier-wajib-1',
          deposit_type_code: 'WAJIB',
          start_year: 2024,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 200000
        }
      ];

      const eqMock = vi.fn().mockResolvedValue({
        data: sampleTiers,
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
      expect(wajibTiers).toHaveLength(1);
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

    it('should allow deleting all tiers until empty and subsequent getRateTiers returns empty array without reseeding', async () => {
      const initialTiers: SavingsRateTier[] = [
        {
          id: 'last-tier',
          deposit_type_code: 'WAJIB',
          start_year: 2024,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 150000
        }
      ];

      mockStorage[SAVINGS_RATE_TIERS_STORAGE_KEY] = JSON.stringify(initialTiers);

      const deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      (supabase.from as any).mockReturnValue({
        delete: deleteMock,
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      });

      await deleteRateTier('last-tier');
      const remainingStored = JSON.parse(mockStorage[SAVINGS_RATE_TIERS_STORAGE_KEY]) as SavingsRateTier[];
      expect(remainingStored).toHaveLength(0);

      const fetched = await getRateTiers(undefined, true);
      expect(fetched).toEqual([]);
    });

    it('should throw error when database delete operation fails', async () => {
      (supabase.from as any).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: new Error('RLS violation: delete not allowed') })
        })
      });

      await expect(deleteRateTier('tier-id')).rejects.toThrow('RLS violation: delete not allowed');
    });
  });

  describe('getActiveSavingsRateTiers', () => {
    it('should return active rate dictionary for given year and month with aliases', async () => {
      const mockTiers: SavingsRateTier[] = [
        {
          id: 'tier-1',
          deposit_type_code: 'WAJIB',
          start_year: 2025,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 210000
        },
        {
          id: 'tier-2',
          deposit_type_code: 'BELANJA',
          start_year: 2025,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 45000
        },
        {
          id: 'tier-3',
          deposit_type_code: 'LEBARAN',
          start_year: 2025,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 60000
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockTiers, error: null })
              })
            })
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-pokok', code: 'SP', name: 'Simpanan Pokok', default_amount: 100000, is_active: true }
              ],
              error: null
            })
          };
        }
        return {};
      });

      const rates = await getActiveSavingsRateTiers(2026, 5);
      expect(rates['POKOK']).toBe(100000);
      expect(rates['SP']).toBe(100000);
      expect(rates['WAJIB']).toBe(210000);
      expect(rates['SW']).toBe(210000);
      expect(rates['BELANJA']).toBe(45000);
      expect(rates['SB']).toBe(45000);
      expect(rates['LEBARAN']).toBe(60000);
      expect(rates['SL']).toBe(60000);
    });

    it('should return empty dictionary without hardcoded fallbacks if database queries fail and no cache exists', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: new Error('Network error') })
          })
        })
      });

      const rates = await getActiveSavingsRateTiers(2026, 1);
      expect(rates).toEqual({});
    });
  });

  describe('resolveSavingsMonthlyRate & buildSavingsRateResolver', () => {
    it('prioritizes active savings_rate_tiers over deposit_types.default_amount for LEBARAN', () => {
      const tiers: SavingsRateTier[] = [
        {
          id: 't-leb-2026',
          deposit_type_code: 'LEBARAN',
          start_year: 2026,
          start_month: 1,
          end_year: null,
          end_month: null,
          monthly_rate: 300000
        }
      ];
      const masterTypes: DepositTypeRateRef[] = [
        { code: 'SL', name: 'Simpanan Lebaran', default_amount: 200000 }
      ];

      expect(resolveSavingsMonthlyRate('LEBARAN', 2026, 11, tiers, masterTypes)).toBe(300000);
      expect(resolveSavingsMonthlyRate('SL', 2026, 11, tiers, masterTypes)).toBe(300000);
      expect(resolveSavingsMonthlyRate('Simpanan Lebaran', 2026, 11, tiers, masterTypes)).toBe(300000);
    });

    it('falls back to deposit_types.default_amount when no tier in savings_rate_tiers matches period', () => {
      const tiers: SavingsRateTier[] = [
        {
          id: 't-leb-old',
          deposit_type_code: 'LEBARAN',
          start_year: 2024,
          start_month: 1,
          end_year: 2025,
          end_month: 12,
          monthly_rate: 50000
        }
      ];
      const masterTypes: DepositTypeRateRef[] = [
        { code: 'SL', name: 'Simpanan Lebaran', default_amount: 300000 }
      ];

      const { getRateForPeriod, hasActiveTier } = buildSavingsRateResolver(tiers, masterTypes);
      expect(hasActiveTier('LEBARAN', 2025, 12)).toBe(true);
      expect(getRateForPeriod('LEBARAN', 2025, 12)).toBe(50000);

      expect(hasActiveTier('LEBARAN', 2026, 11)).toBe(false);
      expect(getRateForPeriod('LEBARAN', 2026, 11)).toBe(300000);
    });

    it('loadSavingsRateConfig combines Supabase savings_rate_tiers and deposit_types faithfully', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 't-1',
                      deposit_type_code: 'WAJIB',
                      start_year: 2026,
                      start_month: 1,
                      end_year: null,
                      end_month: null,
                      monthly_rate: 250000
                    }
                  ],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-1', code: 'WAJIB', name: 'Simpanan Wajib', default_amount: 150000, is_active: true },
                { id: 'dt-2', code: 'LEBARAN', name: 'Simpanan Lebaran', default_amount: 300000, is_active: true }
              ],
              error: null
            })
          };
        }
        return {};
      });

      const resolver = await loadSavingsRateConfig(true);
      expect(resolver.getRateForPeriod('WAJIB', 2026, 11)).toBe(250000);
      expect(resolver.getRateForPeriod('LEBARAN', 2026, 11)).toBe(300000);
    });
  });
});

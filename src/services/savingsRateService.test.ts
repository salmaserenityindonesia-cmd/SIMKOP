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
  getMemberLebaranRates,
  upsertMemberLebaranRate,
  deleteMemberLebaranRate,
  resolveMemberSavingsRate,
  resolveMemberLebaranRateInfo,
  getPreviousMonth,
  clearTierCache,
  fetchAllMemberLebaranRatesPaged,
  fetchAllActiveMembersPaged,
  buildMemberLebaranRateTemplateWorkbook,
  parseMemberLebaranRateExcel,
  bulkUpsertMemberLebaranRatesChunked,
  DEFAULT_RATE_TIERS,
  SAVINGS_RATE_TIERS_STORAGE_KEY,
  SavingsRateTier,
  DepositTypeRateRef,
  MemberLebaranRate
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

  describe('resolveMemberSavingsRate & Member Lebaran Rate CRUD', () => {
    const GLOBAL_TIERS: SavingsRateTier[] = [
      {
        id: 'global-wajib',
        deposit_type_code: 'WAJIB',
        start_year: 2025,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 200000
      },
      {
        id: 'global-lebaran',
        deposit_type_code: 'LEBARAN',
        start_year: 2025,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 200000
      }
    ];

    const MASTER_TYPES: DepositTypeRateRef[] = [
      { code: 'WAJIB', name: 'Simpanan Wajib', default_amount: 150000 },
      { code: 'LEBARAN', name: 'Simpanan Lebaran', default_amount: 100000 }
    ];

    const PERSONAL_RATES: MemberLebaranRate[] = [
      {
        id: 'mlr-b-2026',
        member_id: 'mem-b',
        effective_year: 2026,
        effective_month: 4,
        monthly_rate: 350000,
        cycle_label: 'Awal Siklus Lebaran 2026'
      },
      {
        id: 'mlr-b-2027',
        member_id: 'mem-b',
        effective_year: 2027,
        effective_month: 4,
        monthly_rate: 500000,
        cycle_label: 'Awal Siklus Lebaran 2027'
      }
    ];

    it('falls back to global tier rate when member has never set a personal Lebaran rate', () => {
      const rate = resolveMemberSavingsRate('mem-a', 'LEBARAN', 2026, 11, {
        globalTiers: GLOBAL_TIERS,
        depositTypes: MASTER_TYPES,
        memberLebaranRates: PERSONAL_RATES
      });
      expect(rate).toBe(200000);

      const info = resolveMemberLebaranRateInfo('mem-a', 2026, 11, {
        globalTiers: GLOBAL_TIERS,
        depositTypes: MASTER_TYPES,
        memberLebaranRates: PERSONAL_RATES
      });
      expect(info.isPersonal).toBe(false);
      expect(info.rate).toBe(200000);
      expect(info.matchedPersonal).toBeNull();
    });

    it('uses global tier before effective period, carries forward personal rate across cycles, and updates on new cycle rate', () => {
      // Before April 2026 -> falls back to global Rp 200.000
      expect(
        resolveMemberSavingsRate('mem-b', 'LEBARAN', 2026, 3, {
          globalTiers: GLOBAL_TIERS,
          depositTypes: MASTER_TYPES,
          memberLebaranRates: PERSONAL_RATES
        })
      ).toBe(200000);

      // April 2026 -> Rp 350.000
      expect(
        resolveMemberSavingsRate('mem-b', 'LEBARAN', 2026, 4, {
          globalTiers: GLOBAL_TIERS,
          depositTypes: MASTER_TYPES,
          memberLebaranRates: PERSONAL_RATES
        })
      ).toBe(350000);

      // Carried forward across 2026 -> March 2027
      expect(
        resolveMemberSavingsRate('mem-b', 'SL', 2026, 11, {
          globalTiers: GLOBAL_TIERS,
          depositTypes: MASTER_TYPES,
          memberLebaranRates: PERSONAL_RATES
        })
      ).toBe(350000);
      expect(
        resolveMemberSavingsRate('mem-b', 'LEBARAN', 2027, 3, {
          globalTiers: GLOBAL_TIERS,
          depositTypes: MASTER_TYPES,
          memberLebaranRates: PERSONAL_RATES
        })
      ).toBe(350000);

      // April 2027 -> updated to Rp 500.000 and carried forward into 2028
      expect(
        resolveMemberSavingsRate('mem-b', 'LEBARAN', 2027, 4, {
          globalTiers: GLOBAL_TIERS,
          depositTypes: MASTER_TYPES,
          memberLebaranRates: PERSONAL_RATES
        })
      ).toBe(500000);
      expect(
        resolveMemberSavingsRate('mem-b', 'LEBARAN', 2028, 2, {
          globalTiers: GLOBAL_TIERS,
          depositTypes: MASTER_TYPES,
          memberLebaranRates: PERSONAL_RATES
        })
      ).toBe(500000);

      // Non-Lebaran savings types are unaffected by personal Lebaran rates
      expect(
        resolveMemberSavingsRate('mem-b', 'WAJIB', 2026, 11, {
          globalTiers: GLOBAL_TIERS,
          depositTypes: MASTER_TYPES,
          memberLebaranRates: PERSONAL_RATES
        })
      ).toBe(200000);
    });

    it('upserts, lists, and deletes member_lebaran_rates with audit log recording', async () => {
      const savedRow: MemberLebaranRate = {
        id: 'mlr-new-1',
        member_id: 'mem-agus',
        effective_year: 2026,
        effective_month: 4,
        monthly_rate: 400000,
        cycle_label: 'Awal Siklus Lebaran 2026',
        notes: 'Untuk mudik'
      };
      const auditInsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
      const deleteEqMock = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'member_lebaran_rates') {
          return {
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: savedRow, error: null })
              })
            }),
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [savedRow], error: null })
                })
              })
            }),
            delete: vi.fn().mockReturnValue({
              eq: deleteEqMock
            })
          };
        }
        if (table === 'audit_logs') {
          return { insert: auditInsertMock };
        }
        return {};
      });

      const created = await upsertMemberLebaranRate({
        memberId: 'mem-agus',
        effectiveYear: 2026,
        effectiveMonth: 4,
        monthlyRate: 400000,
        cycleLabel: 'Awal Siklus Lebaran 2026',
        notes: 'Untuk mudik',
        userId: 'admin-1'
      });

      expect(created.monthly_rate).toBe(400000);
      expect(auditInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          table_name: 'member_lebaran_rates',
          action: 'SET_MEMBER_LEBARAN_RATE',
          record_id: 'mem-agus'
        })
      );

      const list = await getMemberLebaranRates('mem-agus', true);
      expect(list).toHaveLength(1);
      expect(list[0].monthly_rate).toBe(400000);

      const deleted = await deleteMemberLebaranRate('mlr-new-1');
      expect(deleted).toBe(true);
      expect(deleteEqMock).toHaveBeenCalledWith('id', 'mlr-new-1');
    });
  });

  describe('bulk Lebaran rate export/import (1,000+ members anti-truncation & chunking)', () => {
    it('fetchAllActiveMembersPaged and fetchAllMemberLebaranRatesPaged should paginate > 1,000 rows without truncation', async () => {
      const totalMembers = 1250;
      const allMembers = Array.from({ length: totalMembers }, (_, i) => ({
        id: `mem-${i + 1}`,
        nrp: String(100001 + i),
        nama: `Anggota ${i + 1}`,
        tanggal_lahir: '1992-04-05',
        status: 'aktif',
        membership_status: 'ACTIVE',
      }));

      const allRates: MemberLebaranRate[] = Array.from({ length: 1120 }, (_, i) => ({
        id: `mlr-${i + 1}`,
        member_id: `mem-${i + 1}`,
        effective_year: 2026,
        effective_month: 4,
        monthly_rate: 250000,
      }));

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          const q: any = {
            select: () => q,
            eq: () => q,
            order: () => q,
            range: async (from: number, to: number) => ({
              data: allMembers.slice(from, to + 1),
              error: null,
            }),
          };
          return q;
        }
        if (table === 'member_lebaran_rates') {
          const q: any = {
            select: () => q,
            order: () => q,
            range: async (from: number, to: number) => ({
              data: allRates.slice(from, to + 1),
              error: null,
            }),
          };
          return q;
        }
        return { select: async () => ({ data: [], error: null }) };
      });

      const fetchedMembers = await fetchAllActiveMembersPaged();
      expect(fetchedMembers).toHaveLength(1250);
      expect(fetchedMembers[1249].nrp).toBe('101250');

      const fetchedRates = await fetchAllMemberLebaranRatesPaged();
      expect(fetchedRates).toHaveLength(1120);
      expect(fetchedRates[1119].id).toBe('mlr-1120');
    });

    it('buildMemberLebaranRateTemplateWorkbook & parseMemberLebaranRateExcel should round-trip and skip empty/zero rows', async () => {
      const mockMembers = [
        { id: 'm-1', nomor_referensi: '00001001', nrp: '001122', nama: 'Budi', tanggal_lahir: '1988-11-10', status: 'aktif' },
        { id: 'm-2', nomor_referensi: '00001002', nrp: '001133', nama: 'Siti', tanggal_lahir: '1986-07-15', status: 'aktif' },
        { id: 'm-3', nomor_referensi: '00001003', nrp: '001144', nama: 'Andi', tanggal_lahir: '1980-05-14', status: 'aktif' },
      ];
      const mockRates: MemberLebaranRate[] = [
        { id: 'r-1', member_id: 'm-1', effective_year: 2025, effective_month: 5, monthly_rate: 300000 },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          const q: any = {
            select: () => q,
            eq: () => q,
            order: () => q,
            range: async (from: number, to: number) => ({
              data: mockMembers.slice(from, to + 1),
              error: null,
            }),
          };
          return q;
        }
        if (table === 'member_lebaran_rates') {
          const q: any = {
            select: () => q,
            order: () => q,
            range: async (from: number, to: number) => ({
              data: mockRates.slice(from, to + 1),
              error: null,
            }),
          };
          return q;
        }
        if (table === 'lebaran_disbursement_cycles') {
          const q: any = {
            select: () => q,
            eq: () => q,
            order: () => q,
            limit: () => q,
            maybeSingle: async () => ({
              data: { id: 'cyc-1', status: 'COMPLETED', disbursement_date: '2026-03-15' },
              error: null,
            }),
          };
          return q;
        }
        if (table === 'savings_rate_tiers') {
          const q: any = {
            select: () => q,
            order: () => Promise.resolve({
              data: [{ id: 't1', deposit_type_code: 'LEBARAN', start_year: 2025, start_month: 1, end_year: null, end_month: null, monthly_rate: 150000 }],
              error: null,
            }),
          };
          return q;
        }
        return { select: async () => ({ data: [], error: null }) };
      });

      const { workbook, meta } = await buildMemberLebaranRateTemplateWorkbook();
      expect(meta.defaultYear).toBe(2026);
      expect(meta.defaultMonth).toBe(4);
      expect(meta.filename).toBe('Template_Tarif_Simpanan_Lebaran_2026-04.xlsx');
      expect(meta.totalMembers).toBe(3);

      const sheet = workbook.getWorksheet('Tarif Lebaran Anggota')!;
      // 9-column header check
      expect(sheet.getRow(1).values).toEqual([
        undefined,
        'nomor_referensi',
        'nrp',
        'nama',
        'tanggal_lahir',
        'tarif_saat_ini',
        'tarif_lebaran_baru',
        'mulai_bulan',
        'mulai_tahun',
        'keterangan_siklus',
      ]);
      // Row 2 = Budi (personal rate 300000), Row 3 = Siti (global rate 150000)
      expect(sheet.getRow(2).getCell(1).value).toBe('00001001');
      expect(sheet.getRow(2).getCell(2).value).toBe('001122');
      expect(sheet.getRow(2).getCell(4).value).toBe('1988-11-10');
      expect(sheet.getRow(2).getCell(5).value).toBe(300000);
      expect(sheet.getRow(3).getCell(5).value).toBe(150000);

      // Admin edits row 2 (Budi -> 500000) and row 4 (Andi -> 0 -> skipped), row 3 remains empty -> skipped
      sheet.getRow(2).getCell(6).value = 500000;
      sheet.getRow(4).getCell(6).value = 0;

      const buffer = await workbook.xlsx.writeBuffer();
      const parsed = await parseMemberLebaranRateExcel(buffer as ArrayBuffer);

      expect(parsed.totalRows).toBe(3);
      expect(parsed.skippedCount).toBe(2);
      expect(parsed.invalidRows).toHaveLength(0);
      expect(parsed.validRows).toHaveLength(1);
      expect(parsed.validRows[0]).toMatchObject({
        nomor_referensi: '00001001',
        nrp: '001122',
        tanggal_lahir: '1988-11-10',
        tarif_lebaran_baru: 500000,
        mulai_bulan: 4,
        mulai_tahun: 2026,
      });
    });

    it('bulkUpsertMemberLebaranRatesChunked should split 250 rows into 100-row chunks and log 1 audit entry', async () => {
      const mockMembers = Array.from({ length: 250 }, (_, i) => ({
        id: `mem-${i + 1}`,
        nrp: `NRP-${i + 1}`,
        nama: `Member ${i + 1}`,
        status: 'aktif',
      }));

      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const auditInsertMock = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'anggota') {
          const q: any = {
            select: () => q,
            eq: () => q,
            order: () => q,
            range: async (from: number, to: number) => ({
              data: mockMembers.slice(from, to + 1),
              error: null,
            }),
          };
          return q;
        }
        if (table === 'member_lebaran_rates') {
          const q: any = {
            upsert: upsertMock,
            select: () => q,
            order: () => q,
            range: async () => ({ data: [], error: null }),
          };
          return q;
        }
        if (table === 'audit_logs') {
          return { insert: auditInsertMock };
        }
        return { select: async () => ({ data: [], error: null }) };
      });

      const rowsToImport = mockMembers.map((m, i) => ({
        rowNumber: i + 2,
        nrp: m.nrp,
        nama: m.nama,
        tarif_saat_ini: 100000,
        tarif_lebaran_baru: 200000 + i * 1000,
        mulai_bulan: 4,
        mulai_tahun: 2026,
        keterangan_siklus: 'Awal Siklus Lebaran 2026',
      }));

      const progressCalls: Array<[number, number]> = [];
      const result = await bulkUpsertMemberLebaranRatesChunked(
        rowsToImport,
        'admin-1',
        (processed, total) => progressCalls.push([processed, total])
      );

      expect(result.updatedCount).toBe(250);
      expect(result.notFoundNrps).toHaveLength(0);
      expect(upsertMock).toHaveBeenCalledTimes(3);
      expect(upsertMock.mock.calls[0][0]).toHaveLength(100);
      expect(upsertMock.mock.calls[1][0]).toHaveLength(100);
      expect(upsertMock.mock.calls[2][0]).toHaveLength(50);
      expect(upsertMock.mock.calls[0][1]).toEqual({
        onConflict: 'member_id,effective_year,effective_month',
      });
      expect(progressCalls).toEqual([
        [100, 250],
        [200, 250],
        [250, 250],
      ]);
      expect(auditInsertMock).toHaveBeenCalledTimes(1);
      expect(auditInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          table_name: 'member_lebaran_rates',
          action: 'BULK_IMPORT_LEBARAN_RATES',
          record_id: 'BATCH',
        })
      );
    });
  });
});

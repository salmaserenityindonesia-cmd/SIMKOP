import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  openShift,
  getActiveShift,
  getShiftSalesSummary,
  closeShift,
  getShiftHistory,
  generateShiftNumber,
  resetLocalShiftState,
  ACTIVE_SHIFT_STORAGE_KEY,
  SHIFT_HISTORY_STORAGE_KEY
} from './cashierShiftService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

// Mock localStorage
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

describe('cashierShiftService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    resetLocalShiftState();
  });

  describe('generateShiftNumber', () => {
    it('should generate shift number matching pattern SHF-YYYYMMDD-HHMMSS', () => {
      const fixedDate = new Date(2026, 9, 28, 8, 30, 0); // Oct 28, 2026 08:30:00
      const shiftNum = generateShiftNumber(fixedDate);
      expect(shiftNum).toBe('SHF-20261028-083000');
    });
  });

  describe('openShift & getActiveShift', () => {
    it('should open shift, record MODAL_KASIR_AWAL cash flow, and persist active shift', async () => {
      const mockInsertShift = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'shift-uuid-1',
              cashier_id: 'cashier-1',
              shift_number: 'SHF-20261028-080000',
              opened_at: new Date().toISOString(),
              initial_cash: 200000,
              cash_sales: 0,
              expected_cash: 200000,
              actual_cash: 0,
              difference: 0,
              status: 'open',
              notes: 'Shift Pagi',
              created_at: new Date().toISOString()
            },
            error: null
          })
        })
      });

      const mockCashFlowInsert = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null })
                  })
                }),
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            }),
            insert: mockInsertShift
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: mockCashFlowInsert
          };
        }
        return {};
      });

      const shift = await openShift({
        cashierId: 'cashier-1',
        initialCash: 200000,
        notes: 'Shift Pagi',
        cashierName: 'Budi Santoso'
      });

      expect(shift.initial_cash).toBe(200000);
      expect(shift.status).toBe('open');
      expect(mockInsertShift).toHaveBeenCalled();
      expect(mockCashFlowInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'out',
          amount: 200000,
          category: 'MODAL_KASIR_AWAL'
        })
      );

      // Verify active shift is saved to storage
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        ACTIVE_SHIFT_STORAGE_KEY,
        expect.stringContaining('shift-uuid-1')
      );
    });

    it('should throw error when opening a shift if cashier already has an active open shift', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'existing-shift',
                      cashier_id: 'cashier-1',
                      shift_number: 'SHF-20261028-070000',
                      status: 'open',
                      initial_cash: 100000
                    }
                  ],
                  error: null
                })
              })
            })
          })
        })
      });

      await expect(
        openShift({
          cashierId: 'cashier-1',
          initialCash: 150000
        })
      ).rejects.toThrow(/masih memiliki shift aktif/);
    });

    it('should gracefully fallback to localStorage active shift if Supabase fails', async () => {
      const mockActive = {
        id: 'local-shift-1',
        cashier_id: 'cashier-99',
        shift_number: 'SHF-LOCAL-01',
        status: 'open',
        initial_cash: 300000,
        opened_at: new Date().toISOString()
      };
      mockStorage[ACTIVE_SHIFT_STORAGE_KEY] = JSON.stringify(mockActive);

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Network offline' }
                })
              })
            })
          })
        })
      });

      const active = await getActiveShift('cashier-99');
      expect(active).not.toBeNull();
      expect(active?.shift_number).toBe('SHF-LOCAL-01');
      expect(active?.initial_cash).toBe(300000);
    });

    it('should create shift in local state and localStorage when Supabase insert fails', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null })
                  })
                }),
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'relation public.cashier_shifts does not exist' }
                })
              })
            })
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null })
          };
        }
        return {};
      });

      const shift = await openShift({
        cashierId: 'cashier-offline',
        initialCash: 120000,
        notes: 'Shift Darurat Offline'
      });

      expect(shift.status).toBe('open');
      expect(shift.initial_cash).toBe(120000);
      expect(shift.notes).toBe('Shift Darurat Offline');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        ACTIVE_SHIFT_STORAGE_KEY,
        expect.stringContaining('cashier-offline')
      );
    });
  });

  describe('getShiftSalesSummary', () => {
    it('should aggregate sales accurately by shift_id', async () => {
      const mockSales = [
        { id: 's1', paid_cash: 50000, paid_deposit: 0, paid_credit: 0, total_amount: 50000, status: 'completed' },
        { id: 's2', paid_cash: 30000, paid_deposit: 20000, paid_credit: 0, total_amount: 50000, status: 'completed' },
        { id: 's3', paid_cash: 0, paid_deposit: 0, paid_credit: 75000, total_amount: 75000, status: 'completed' }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'shift-10',
                    initial_cash: 100000,
                    status: 'open'
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: mockSales,
                error: null
              })
            })
          };
        }
        return {};
      });

      const summary = await getShiftSalesSummary('shift-10');

      expect(summary.initialCash).toBe(100000);
      expect(summary.cashSales).toBe(80000); // 50k + 30k
      expect(summary.depositSales).toBe(20000);
      expect(summary.creditSales).toBe(75000);
      expect(summary.nonCashSales).toBe(95000);
      expect(summary.totalSales).toBe(175000);
      expect(summary.expectedCash).toBe(180000); // 100k + 80k
      expect(summary.transactionCount).toBe(3);
    });

    it('should correctly fallback to total_amount when paid_cash is 0 but payment_scheme is cash', async () => {
      const mockSales = [
        { id: 's4', paid_cash: 0, paid_deposit: 0, paid_credit: 0, total_amount: 20900, payment_scheme: 'cash', sale_status: 'completed' }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'shift-11',
                    initial_cash: 100000,
                    status: 'open'
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: mockSales,
                error: null
              })
            })
          };
        }
        return {};
      });

      const summary = await getShiftSalesSummary('shift-11');

      expect(summary.initialCash).toBe(100000);
      expect(summary.cashSales).toBe(20900);
      expect(summary.expectedCash).toBe(120900);
      expect(summary.transactionCount).toBe(1);
    });

    it('should fallback to timestamp window when salesByShift query returns empty (orphan sales)', async () => {
      const shiftOpenedAt = '2026-10-28T18:08:21.000Z';
      const mockFallbackSales = [
        {
          id: 's-orphan',
          paid_cash: 50000,
          paid_deposit: 0,
          paid_credit: 0,
          total_amount: 19000,
          payment_scheme: 'cash',
          sale_status: 'completed',
          created_at: '2026-10-28T18:08:45.000Z'
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'shift-orphan-test',
                    opened_at: shiftOpenedAt,
                    initial_cash: 50000,
                    status: 'open'
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [], // shift_id query returns empty
                error: null
              }),
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  data: mockFallbackSales,
                  error: null
                })
              })
            })
          };
        }
        return {};
      });

      const summary = await getShiftSalesSummary('shift-orphan-test', undefined, shiftOpenedAt);

      expect(summary.initialCash).toBe(50000);
      expect(summary.cashSales).toBe(19000); // capped to total_amount (19k)
      expect(summary.expectedCash).toBe(69000); // 50k + 19k
      expect(summary.transactionCount).toBe(1);
    });
  });

  describe('closeShift', () => {
    it('should reconcile cash, record difference, and emit cash_flow mutations', async () => {
      const activeShift = {
        id: 'shift-close-1',
        cashier_id: 'cashier-1',
        shift_number: 'SHF-20261028-120000',
        opened_at: '2026-10-28T08:00:00Z',
        initial_cash: 100000,
        status: 'open'
      };
      mockStorage[ACTIVE_SHIFT_STORAGE_KEY] = JSON.stringify(activeShift);

      const mockCashFlowInserts: any[] = [];
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: activeShift, error: null })
              })
            }),
            update: mockUpdate
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 's1', paid_cash: 150000, paid_deposit: 0, paid_credit: 0, total_amount: 150000, status: 'completed' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              mockCashFlowInserts.push(payload);
              return Promise.resolve({ error: null });
            })
          };
        }
        return {};
      });

      // expectedCash = initialCash(100k) + cashSales(150k) = 250k.
      // actualCash = 255k -> surplus 5k.
      const closed = await closeShift({
        shiftId: 'shift-close-1',
        actualCash: 255000,
        notes: 'Shift ditutup seimbang lebih 5rb'
      });

      expect(closed.status).toBe('closed');
      expect(closed.expected_cash).toBe(250000);
      expect(closed.actual_cash).toBe(255000);
      expect(closed.difference).toBe(5000);

      // Verify cash_flow mutations: PENGEMBALIAN_MODAL_KASIR, PENJUALAN_KASIR_TUNAI, SELISIH_LEBIH_KASIR
      expect(mockCashFlowInserts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            direction: 'in',
            amount: 100000,
            category: 'PENGEMBALIAN_MODAL_KASIR'
          }),
          expect.objectContaining({
            direction: 'in',
            amount: 150000,
            category: 'PENJUALAN_KASIR_TUNAI'
          }),
          expect.objectContaining({
            direction: 'in',
            amount: 5000,
            category: 'SELISIH_LEBIH_KASIR'
          })
        ])
      );

      // Active shift cleared from storage, and history updated
      expect(mockStorage[ACTIVE_SHIFT_STORAGE_KEY]).toBeUndefined();
      expect(mockStorage[SHIFT_HISTORY_STORAGE_KEY]).toContain('shift-close-1');
    });

    it('should record SELISIH_KURANG_KASIR when actualCash < expectedCash', async () => {
      const activeShift = {
        id: 'shift-deficit-1',
        cashier_id: 'cashier-1',
        shift_number: 'SHF-DEF-01',
        opened_at: '2026-10-28T08:00:00Z',
        initial_cash: 50000,
        status: 'open'
      };
      mockStorage[ACTIVE_SHIFT_STORAGE_KEY] = JSON.stringify(activeShift);

      const mockCashFlowInserts: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: activeShift, error: null })
              })
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 's1', paid_cash: 100000, paid_deposit: 0, paid_credit: 0, total_amount: 100000, status: 'completed' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              mockCashFlowInserts.push(payload);
              return Promise.resolve({ error: null });
            })
          };
        }
        return {};
      });

      // expectedCash = 50k + 100k = 150k.
      // actualCash = 140k -> defisit -10k.
      const closed = await closeShift({
        shiftId: 'shift-deficit-1',
        actualCash: 140000
      });

      expect(closed.difference).toBe(-10000);
      expect(mockCashFlowInserts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            direction: 'out',
            amount: 10000,
            category: 'SELISIH_KURANG_KASIR'
          })
        ])
      );
    });

    it('should handle perfectly balanced cash (actualCash === expectedCash, difference = 0) without surplus or deficit mutations', async () => {
      const activeShift = {
        id: 'shift-balanced-1',
        cashier_id: 'cashier-1',
        shift_number: 'SHF-BAL-01',
        opened_at: '2026-10-28T08:00:00Z',
        initial_cash: 100000,
        status: 'open'
      };
      mockStorage[ACTIVE_SHIFT_STORAGE_KEY] = JSON.stringify(activeShift);

      const mockCashFlowInserts: any[] = [];
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: activeShift, error: null })
              })
            }),
            update: mockUpdate
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 's1', paid_cash: 200000, paid_deposit: 0, paid_credit: 0, total_amount: 200000, status: 'completed' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              mockCashFlowInserts.push(payload);
              return Promise.resolve({ error: null });
            })
          };
        }
        return {};
      });

      // expectedCash = 100k + 200k = 300k.
      // actualCash = 300k -> difference = 0.
      const closed = await closeShift({
        shiftId: 'shift-balanced-1',
        actualCash: 300000
      });

      expect(closed.status).toBe('closed');
      expect(closed.expected_cash).toBe(300000);
      expect(closed.actual_cash).toBe(300000);
      expect(closed.difference).toBe(0);

      // Verify ONLY PENGEMBALIAN_MODAL_KASIR & PENJUALAN_KASIR_TUNAI are recorded (no surplus/deficit)
      expect(mockCashFlowInserts).toHaveLength(2);
      expect(mockCashFlowInserts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'PENGEMBALIAN_MODAL_KASIR',
            amount: 100000
          }),
          expect.objectContaining({
            category: 'PENJUALAN_KASIR_TUNAI',
            amount: 200000
          })
        ])
      );
      expect(mockCashFlowInserts.some(c => c.category === 'SELISIH_LEBIH_KASIR')).toBe(false);
      expect(mockCashFlowInserts.some(c => c.category === 'SELISIH_KURANG_KASIR')).toBe(false);
    });

    it('should close shift in local state and localStorage if Supabase update fails', async () => {
      const activeShift = {
        id: 'shift-offline-close',
        cashier_id: 'cashier-offline',
        shift_number: 'SHF-OFFLINE-01',
        opened_at: '2026-10-28T08:00:00Z',
        initial_cash: 100000,
        status: 'open'
      };
      mockStorage[ACTIVE_SHIFT_STORAGE_KEY] = JSON.stringify(activeShift);

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database disconnected' } })
              })
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: { message: 'Database disconnected' } })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null })
          };
        }
        return {};
      });

      const closed = await closeShift({
        shiftId: 'shift-offline-close',
        actualCash: 100000
      });

      expect(closed.status).toBe('closed');
      expect(closed.difference).toBe(0);
      expect(mockStorage[ACTIVE_SHIFT_STORAGE_KEY]).toBeUndefined();
      expect(mockStorage[SHIFT_HISTORY_STORAGE_KEY]).toContain('shift-offline-close');
    });
  });

  describe('getShiftHistory', () => {
    it('should retrieve closed shift list and filter appropriately', async () => {
      const mockHistory = [
        {
          id: 'shift-h1',
          cashier_id: 'cashier-1',
          shift_number: 'SHF-20261028-100000',
          opened_at: '2026-10-28T02:00:00.000Z',
          closed_at: '2026-10-28T06:00:00.000Z',
          initial_cash: 100000,
          cash_sales: 500000,
          expected_cash: 600000,
          actual_cash: 600000,
          difference: 0,
          status: 'closed'
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'cashier_shifts') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: mockHistory, error: null })
                })
              })
            })
          };
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'cashier-1', nama: 'Kasir Satu' }],
                error: null
              })
            })
          };
        }
        return {};
      });

      const list = await getShiftHistory('2026-10-28', '2026-10-28');
      expect(list.length).toBe(1);
      expect(list[0].cashier_name).toBe('Kasir Satu');
      expect(list[0].shift_number).toBe('SHF-20261028-100000');
    });
  });
});

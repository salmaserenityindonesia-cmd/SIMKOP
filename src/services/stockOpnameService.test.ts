import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateOperatorOpnameKpis,
  calculatePostCountMutations,
  deferMissedOperatorTasksToNextDay,
  resolveOperatorIndexForSlot,
  resolveOpnameTask,
  sortProductsForCycleCount,
  submitOperatorBlindCount,
  UNCATEGORIZED_GROUP,
  type CashierShiftLite,
  type MutationRowLite,
  type OpnameOperator,
  type OpnameProductSource,
  type OpnameTaskRecord,
} from './stockOpnameService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('stockOpnameService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sorts active products A -> Z by category and places uncategorized products last under Tanpa Kategori', () => {
    const categoryMap = new Map<string, string>([
      ['cat-b', 'Minuman'],
      ['cat-a', 'Beras & Sembako'],
    ]);

    const products: OpnameProductSource[] = [
      { id: 'p-uncat', sku: 'U1', name: 'Aksesoris Toko', unit: 'pcs', category_id: null, buy_price: 5000, stock: 10, is_active: true },
      { id: 'p-minum', sku: 'M1', name: 'Teh Botol', unit: 'btl', category_id: 'cat-b', buy_price: 3000, stock: 24, is_active: true },
      { id: 'p-beras-2', sku: 'B2', name: 'Minyak 2L', unit: 'pch', category_id: 'cat-a', buy_price: 28000, stock: 12, is_active: true },
      { id: 'p-beras-1', sku: 'B1', name: 'Beras 5kg', unit: 'sak', category_id: 'cat-a', buy_price: 65000, stock: 8, is_active: true },
      { id: 'p-inactive', sku: 'X1', name: 'Barang Nonaktif', unit: 'pcs', category_id: 'cat-a', buy_price: 1000, stock: 0, is_active: false },
    ];

    const sorted = sortProductsForCycleCount(products, categoryMap);
    expect(sorted).toHaveLength(4);
    expect(sorted.map((s) => s.product.id)).toEqual([
      'p-beras-1',
      'p-beras-2',
      'p-minum',
      'p-uncat',
    ]);
    expect(sorted[0].categoryGroup).toBe('Beras & Sembako');
    expect(sorted[2].categoryGroup).toBe('Minuman');
    expect(sorted[3].categoryGroup).toBe(UNCATEGORIZED_GROUP);
    expect(sorted.map((s) => s.slotIndex)).toEqual([0, 1, 2, 3]);
  });

  it('rotates operator assignments across cycles so every operator covers different blocks', () => {
    // 3 operators: A (0), B (1), C (2)
    // Slot 0 belongs to A in Cycle 1, B in Cycle 2, C in Cycle 3, and wraps back to A in Cycle 4
    expect(resolveOperatorIndexForSlot(0, 1, 3)).toBe(0);
    expect(resolveOperatorIndexForSlot(0, 2, 3)).toBe(1);
    expect(resolveOperatorIndexForSlot(0, 3, 3)).toBe(2);
    expect(resolveOperatorIndexForSlot(0, 4, 3)).toBe(0);

    // Slot 1 belongs to B in Cycle 1, C in Cycle 2, A in Cycle 3
    expect(resolveOperatorIndexForSlot(1, 1, 3)).toBe(1);
    expect(resolveOperatorIndexForSlot(1, 2, 3)).toBe(2);
    expect(resolveOperatorIndexForSlot(1, 3, 3)).toBe(0);
  });

  it('defers unfinished tasks of off-duty operators to active operators on the next working day within quota', async () => {
    const operators: OpnameOperator[] = [
      { id: 'op-a', nama: 'Kasir A', role: 'operator' },
      { id: 'op-b', nama: 'Kasir B', role: 'operator' },
    ];

    const pastPending = [
      { id: 't1', assigned_operator_id: 'op-a', reassigned_from_operator_id: null, scheduled_date: '2026-11-24', slot_index: 0 },
      { id: 't2', assigned_operator_id: 'op-a', reassigned_from_operator_id: null, scheduled_date: '2026-11-24', slot_index: 2 },
      { id: 't3', assigned_operator_id: 'op-a', reassigned_from_operator_id: null, scheduled_date: '2026-11-24', slot_index: 4 },
    ];

    const updatedPayloads: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'stock_opname_tasks') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols.includes('assigned_operator_id') && !cols.includes('slot_index')) {
              // Today's load: op-b already has 1 task scheduled today
              return {
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: 'today-1', assigned_operator_id: 'op-b' }],
                  error: null,
                }),
              };
            }
            // Past pending tasks
            return {
              eq: vi.fn().mockReturnValue({
                lt: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: pastPending, error: null }),
                  }),
                }),
              }),
            };
          }),
          update: vi.fn().mockImplementation((payload: any) => {
            updatedPayloads.push(payload);
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }),
        };
      }
      if (table === 'cashier_shifts') {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                // op-a did NOT open a shift on 2026-11-24 (libur)
                data: [{ cashier_id: 'op-b', opened_at: '2026-11-24T08:00:00Z' }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    // Quota is 2/day, op-b already has 1 task today -> only 1 deferred task should move to op-b today
    const res = await deferMissedOperatorTasksToNextDay({
      todayStr: '2026-11-25',
      quota: 2,
      activeOperatorIdsToday: ['op-b'],
      allOperators: operators,
    });

    expect(res.deferredCount).toBe(1);
    expect(updatedPayloads).toHaveLength(1);
    expect(updatedPayloads[0]).toEqual({
      assigned_operator_id: 'op-b',
      reassigned_from_operator_id: 'op-a',
      scheduled_date: '2026-11-25',
    });
    expect(res.todayLoadMap.get('op-b')).toBe(2);
  });

  it('computes post-count mutation breakdown strictly after counted_at', () => {
    const countedAt = '2026-11-25T10:00:00.000Z';
    const mutations: MutationRowLite[] = [
      // Before countedAt (ignored)
      { product_id: 'p1', mutation_date: '2026-11-25T09:59:00.000Z', mutation_type: 'KELUAR_PENJUALAN', qty_in: 0, qty_out: 4 },
      // After countedAt
      { product_id: 'p1', mutation_date: '2026-11-25T10:05:00.000Z', mutation_type: 'MASUK_PEMBELIAN', qty_in: 10, qty_out: 0 },
      { product_id: 'p1', mutation_date: '2026-11-25T10:15:00.000Z', mutation_type: 'MASUK_KLAIM_PENGGANTI', qty_in: 2, qty_out: 0 },
      { product_id: 'p1', mutation_date: '2026-11-25T10:30:00.000Z', mutation_type: 'KELUAR_PENJUALAN', qty_in: 0, qty_out: 3 },
      { product_id: 'p1', mutation_date: '2026-11-25T11:00:00.000Z', mutation_type: 'KELUAR_RETUR', qty_in: 0, qty_out: 1 },
      // Different product (ignored)
      { product_id: 'p2', mutation_date: '2026-11-25T11:05:00.000Z', mutation_type: 'MASUK_PEMBELIAN', qty_in: 50, qty_out: 0 },
    ];

    const breakdown = calculatePostCountMutations(mutations, 'p1', countedAt);
    expect(breakdown.pembelian).toBe(10);
    expect(breakdown.pengganti_retur).toBe(2);
    expect(breakdown.penjualan).toBe(3);
    expect(breakdown.retur_supplier).toBe(1);
    expect(breakdown.netDeltaSinceCount).toBe(8); // +10 + 2 - 3 - 1
  });

  it('locks system_stock_snapshot when operator submits blind count', async () => {
    let capturedTaskUpdate: any = null;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'stock_opname_tasks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'task-1', product_id: 'prod-1', status: 'pending' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload: any) => {
            capturedTaskUpdate = payload;
            return {
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'task-1', product_id: 'prod-1', ...payload },
                    error: null,
                  }),
                }),
              }),
            };
          }),
        };
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'prod-1', stock: 25, buy_price: 12000 },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await submitOperatorBlindCount('task-1', 22, 'Kurang 3 pcs di rak');
    expect(capturedTaskUpdate.observed_qty).toBe(22);
    expect(capturedTaskUpdate.system_stock_snapshot).toBe(25);
    expect(capturedTaskUpdate.unit_cost_snapshot).toBe(12000);
    expect(capturedTaskUpdate.status).toBe('counted');
    expect(result.system_stock_snapshot).toBe(25);
  });

  it('reconciles use_observed by preserving post-count transactions and inserting PENYESUAIAN_OPNAME adjustment', async () => {
    // Scenario:
    // At count time: system snapshot = 25, operator observed = 22 (delta = -3).
    // After count: 2 pcs sold via POS -> live stock is now 23.
    // Approving observed should update live stock to 23 + (-3) = 20, and insert qty_out = 3.
    let updatedProductStock: number | null = null;
    let insertedAdjustment: any = null;
    let updatedTaskResolution: any = null;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'stock_opname_tasks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'task-10',
                  product_id: 'prod-1',
                  status: 'counted',
                  observed_qty: 22,
                  system_stock_snapshot: 25,
                  unit_cost_snapshot: 10000,
                  notes: null,
                },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload: any) => {
            updatedTaskResolution = payload;
            return {
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'task-10', ...payload },
                    error: null,
                  }),
                }),
              }),
            };
          }),
        };
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'prod-1', name: 'Minyak 2L', stock: 23, buy_price: 10000 },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation((payload: any) => {
            updatedProductStock = payload.stock;
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          }),
        };
      }
      if (table === 'stock_opname_adjustments') {
        return {
          insert: vi.fn().mockImplementation((payload: any) => {
            insertedAdjustment = payload;
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {};
    });

    await resolveOpnameTask({
      taskId: 'task-10',
      choice: 'use_observed',
      resolvedBy: 'admin-1',
    });

    expect(updatedProductStock).toBe(20);
    expect(insertedAdjustment.qty_in).toBe(0);
    expect(insertedAdjustment.qty_out).toBe(3);
    expect(insertedAdjustment.total_value).toBe(-30000);
    expect(insertedAdjustment.reference_no).toMatch(/^OPN-/);
    expect(updatedTaskResolution.applied_delta).toBe(-3);
    expect(updatedTaskResolution.final_approved_qty).toBe(22);
    expect(updatedTaskResolution.status).toBe('resolved');
  });

  it('calculates automatic Operator KPI with 60% accuracy, 25% discipline, and 15% verified discrepancy findings', () => {
    const operators: OpnameOperator[] = [
      { id: 'op-a', nama: 'Kasir Teliti', role: 'operator' },
      { id: 'op-b', nama: 'Kasir Ceroboh', role: 'operator' },
    ];

    const shifts: CashierShiftLite[] = [
      { cashier_id: 'op-a', opened_at: '2026-11-25T08:00:00Z' },
      { cashier_id: 'op-b', opened_at: '2026-11-25T08:00:00Z' },
    ];

    const tasks: OpnameTaskRecord[] = [
      // op-a: observed 18 vs snapshot 20 -> approved observed (-2), counted on scheduled date
      {
        id: 'ta-1',
        cycle_id: 'c1',
        cycle_number: 1,
        slot_index: 0,
        product_id: 'p1',
        category_group: 'Sembako',
        assigned_operator_id: 'op-a',
        scheduled_date: '2026-11-25',
        status: 'resolved',
        observed_qty: 18,
        system_stock_snapshot: 20,
        counted_at: '2026-11-25T10:00:00Z',
        recount_operator_id: null,
        recount_qty: null,
        recount_system_snapshot: null,
        recounted_at: null,
        resolution_choice: 'use_observed',
        final_approved_qty: 18,
        applied_delta: -2,
        unit_cost_snapshot: 10000,
        variance_value: -20000,
        resolved_by: 'admin-1',
        resolved_at: '2026-11-25T15:00:00Z',
        notes: null,
        created_at: '2026-11-25T08:00:00Z',
      },
      // op-b: observed 10 vs snapshot 20, admin recounted and proved system was 20 (false alarm!)
      {
        id: 'tb-1',
        cycle_id: 'c1',
        cycle_number: 1,
        slot_index: 1,
        product_id: 'p2',
        category_group: 'Sembako',
        assigned_operator_id: 'op-b',
        scheduled_date: '2026-11-25',
        status: 'resolved',
        observed_qty: 10,
        system_stock_snapshot: 20,
        counted_at: '2026-11-25T11:00:00Z',
        recount_operator_id: 'op-a',
        recount_qty: 20,
        recount_system_snapshot: 20,
        recounted_at: '2026-11-25T14:00:00Z',
        resolution_choice: 'use_recount',
        final_approved_qty: 20,
        applied_delta: 0,
        unit_cost_snapshot: 10000,
        variance_value: 0,
        resolved_by: 'admin-1',
        resolved_at: '2026-11-25T15:00:00Z',
        notes: null,
        created_at: '2026-11-25T08:00:00Z',
      },
      // op-b: second task still pending on active shift day (reduces discipline to 50%)
      {
        id: 'tb-2',
        cycle_id: 'c1',
        cycle_number: 1,
        slot_index: 2,
        product_id: 'p3',
        category_group: 'Minuman',
        assigned_operator_id: 'op-b',
        scheduled_date: '2026-11-25',
        status: 'pending',
        observed_qty: null,
        system_stock_snapshot: null,
        counted_at: null,
        recount_operator_id: null,
        recount_qty: null,
        recount_system_snapshot: null,
        recounted_at: null,
        resolution_choice: null,
        final_approved_qty: null,
        applied_delta: 0,
        unit_cost_snapshot: 0,
        variance_value: 0,
        resolved_by: null,
        resolved_at: null,
        notes: null,
        created_at: '2026-11-25T08:00:00Z',
      },
    ];

    const kpis = calculateOperatorOpnameKpis(operators, tasks, shifts);
    expect(kpis).toHaveLength(2);

    const kpiA = kpis[0];
    expect(kpiA.operator_id).toBe('op-a');
    expect(kpiA.accuracy_score).toBe(100);
    expect(kpiA.discipline_score).toBe(100);
    expect(kpiA.discovery_score).toBe(100);
    expect(kpiA.total_kpi_score).toBe(100);
    expect(kpiA.recount_completed_count).toBe(1);

    const kpiB = kpis[1];
    expect(kpiB.operator_id).toBe('op-b');
    expect(kpiB.accuracy_score).toBe(50);
    expect(kpiB.discipline_score).toBe(50);
    expect(kpiB.discovery_score).toBe(0);
    expect(kpiB.false_alarm_count).toBe(1);
    expect(kpiB.total_kpi_score).toBe(42.5); // 50*0.6 + 50*0.25 + 0*0.15
  });
});

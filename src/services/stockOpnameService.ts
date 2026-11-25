import { supabase } from '../lib/supabaseClient';
import { getPosSettings } from './posSettingsService';
import { fetchAllPaginatedSafe } from '../utils/supabasePagination';

export type OpnameCycleStatus = 'active' | 'completed';

export type OpnameTaskStatus =
  | 'pending'
  | 'counted'
  | 'recount_requested'
  | 'recounted'
  | 'resolved';

export type OpnameResolutionChoice = 'use_system' | 'use_observed' | 'use_recount';

export const UNCATEGORIZED_GROUP = 'Tanpa Kategori';

export interface OpnameCycle {
  id: string;
  cycle_number: number;
  status: OpnameCycleStatus;
  started_at: string;
  completed_at?: string | null;
}

export interface OpnameOperator {
  id: string;
  nama: string;
  role: string;
  created_at?: string;
}

export interface OpnameProductSource {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category_id?: string | null;
  buy_price: number;
  stock: number;
  is_active: boolean;
}

export interface SortedCycleProduct {
  product: OpnameProductSource;
  categoryGroup: string;
  slotIndex: number;
}

export interface OpnameTaskRecord {
  id: string;
  cycle_id: string;
  cycle_number: number;
  slot_index: number;
  product_id: string;
  category_group: string;
  assigned_operator_id: string;
  reassigned_from_operator_id?: string | null;
  scheduled_date: string;
  status: OpnameTaskStatus;
  observed_qty: number | null;
  system_stock_snapshot: number | null;
  counted_at: string | null;
  recount_operator_id: string | null;
  recount_qty: number | null;
  recount_system_snapshot: number | null;
  recounted_at: string | null;
  resolution_choice: OpnameResolutionChoice | null;
  final_approved_qty: number | null;
  applied_delta: number;
  unit_cost_snapshot: number;
  variance_value: number;
  resolved_by: string | null;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Strict Blind Count model for POS Operator Drawer.
 * Intentionally omits system stock / snapshot / cost fields so operators cannot see book stock.
 */
export interface OperatorBlindTask {
  id: string;
  cycle_id: string;
  cycle_number: number;
  slot_index: number;
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  category_group: string;
  scheduled_date: string;
  status: OpnameTaskStatus;
  is_reassigned: boolean;
  reassigned_from_name?: string;
  is_recount_task: boolean;
  observed_qty: number | null;
  counted_at: string | null;
  recount_qty: number | null;
  recounted_at: string | null;
  notes: string | null;
}

export interface PostCountMutationBreakdown {
  pembelian: number;
  pengganti_retur: number;
  penjualan: number;
  retur_supplier: number;
  other_opname: number;
  netDeltaSinceCount: number;
}

export interface OpnameComparisonRow extends OpnameTaskRecord {
  sku: string;
  product_name: string;
  unit: string;
  current_system_stock: number;
  current_buy_price: number;
  assigned_operator_name: string;
  reassigned_from_operator_name?: string;
  recount_operator_name?: string;
  variance_at_count: number | null;
  recount_variance: number | null;
  mutations_since_count: PostCountMutationBreakdown;
  projected_stock_if_observed: number | null;
  projected_stock_if_recount: number | null;
  estimated_variance_value: number;
}

export interface OperatorKpiRow {
  operator_id: string;
  operator_name: string;
  role: string;
  total_scheduled_tasks: number;
  completed_on_time_count: number;
  reassigned_away_count: number;
  resolved_primary_count: number;
  recount_completed_count: number;
  reported_discrepancies_count: number;
  verified_real_findings_count: number;
  false_alarm_count: number;
  missed_discrepancy_count: number;
  accuracy_score: number;
  discipline_score: number;
  discovery_score: number;
  total_kpi_score: number;
}

export interface DailyAssignmentResult {
  cycleNumber: number;
  cycleId: string | null;
  quota: number;
  deferredCount: number;
  assignedCount: number;
  totalActiveProducts: number;
  cycleAssignedCount: number;
  operatorsCount: number;
}

export interface OpnameCycleProgress {
  cycleNumber: number;
  totalActiveProducts: number;
  assignedInCycle: number;
  countedOrResolvedInCycle: number;
  resolvedInCycle: number;
}

export interface MutationRowLite {
  mutation_id?: string;
  mutation_date: string;
  product_id: string;
  mutation_type: string;
  reference_number?: string;
  qty_in: number;
  qty_out: number;
}

export interface CashierShiftLite {
  cashier_id: string;
  opened_at: string;
  closed_at?: string | null;
  status?: string;
}

export function getLocalDateStr(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function normalizeNonNegativeInt(value: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Jumlah fisik harus berupa bilangan bulat >= 0.');
  }
  return n;
}

/**
 * Sort active products by category name A -> Z, with products missing category_id
 * grouped at the very end under 'Tanpa Kategori', then by product name A -> Z.
 */
export function sortProductsForCycleCount(
  products: OpnameProductSource[],
  categoryMap: Map<string, string>
): SortedCycleProduct[] {
  const active = products
    .filter((p) => p.is_active !== false)
    .map((product) => {
      const rawCat = product.category_id ? categoryMap.get(String(product.category_id)) : undefined;
      const trimmed = (rawCat || '').trim();
      const categoryGroup = trimmed.length > 0 ? trimmed : UNCATEGORIZED_GROUP;
      return { product, categoryGroup };
    });

  active.sort((a, b) => {
    const aUncat = a.categoryGroup === UNCATEGORIZED_GROUP;
    const bUncat = b.categoryGroup === UNCATEGORIZED_GROUP;
    if (aUncat !== bUncat) {
      return aUncat ? 1 : -1;
    }
    const catCmp = a.categoryGroup.localeCompare(b.categoryGroup, 'id', {
      sensitivity: 'base',
      numeric: true,
    });
    if (catCmp !== 0) return catCmp;

    const nameCmp = (a.product.name || '').localeCompare(b.product.name || '', 'id', {
      sensitivity: 'base',
      numeric: true,
    });
    if (nameCmp !== 0) return nameCmp;

    return String(a.product.id).localeCompare(String(b.product.id));
  });

  return active.map((item, idx) => ({
    ...item,
    slotIndex: idx,
  }));
}

/**
 * Deterministic cross-cycle rotation:
 * On Cycle 1, slotIndex s goes to operator (s % N).
 * On Cycle 2, slotIndex s shifts to operator ((s + 1) % N), and so on across all N operators.
 */
export function resolveOperatorIndexForSlot(
  slotIndex: number,
  cycleNumber: number,
  operatorCount: number
): number {
  if (operatorCount <= 0) return 0;
  const shift = Math.max(0, cycleNumber - 1);
  return (((slotIndex + shift) % operatorCount) + operatorCount) % operatorCount;
}

/**
 * Compute stock movements strictly after `sinceIso` for a specific product.
 * Used to isolate POS sales, restocks, returns, and claims that occurred after the physical count.
 */
export function calculatePostCountMutations(
  mutations: MutationRowLite[],
  productId: string,
  sinceIso?: string | null,
  excludeReferenceNo?: string | null
): PostCountMutationBreakdown {
  const breakdown: PostCountMutationBreakdown = {
    pembelian: 0,
    pengganti_retur: 0,
    penjualan: 0,
    retur_supplier: 0,
    other_opname: 0,
    netDeltaSinceCount: 0,
  };

  if (!sinceIso) return breakdown;
  const sinceMs = new Date(sinceIso).getTime();
  if (Number.isNaN(sinceMs)) return breakdown;

  for (const m of mutations) {
    if (String(m.product_id) !== String(productId)) continue;
    if (excludeReferenceNo && m.reference_number === excludeReferenceNo) continue;

    const mMs = new Date(m.mutation_date).getTime();
    if (Number.isNaN(mMs) || mMs <= sinceMs) continue;

    const qtyIn = Number(m.qty_in) || 0;
    const qtyOut = Number(m.qty_out) || 0;

    switch (m.mutation_type) {
      case 'MASUK_PEMBELIAN':
        breakdown.pembelian += qtyIn;
        break;
      case 'MASUK_KLAIM_PENGGANTI':
        breakdown.pengganti_retur += qtyIn;
        break;
      case 'KELUAR_PENJUALAN':
        breakdown.penjualan += qtyOut;
        break;
      case 'KELUAR_RETUR':
        breakdown.retur_supplier += qtyOut;
        break;
      case 'PENYESUAIAN_OPNAME':
        breakdown.other_opname += qtyIn - qtyOut;
        break;
      default:
        break;
    }

    breakdown.netDeltaSinceCount += qtyIn - qtyOut;
  }

  return breakdown;
}

/**
 * Pure KPI evaluator for automatic operator scoring:
 * - Accuracy vs Final Approved Ground Truth (60%)
 * - Daily Quota Completion Discipline on Active Shift Days (25%)
 * - Verified Real Discrepancy Findings (15%)
 */
export function calculateOperatorOpnameKpis(
  operators: OpnameOperator[],
  tasks: OpnameTaskRecord[],
  shifts: CashierShiftLite[] = []
): OperatorKpiRow[] {
  const shiftDatesByOperator = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (!s.cashier_id || !s.opened_at) continue;
    const dateKey = getLocalDateStr(new Date(s.opened_at));
    if (!shiftDatesByOperator.has(s.cashier_id)) {
      shiftDatesByOperator.set(s.cashier_id, new Set());
    }
    shiftDatesByOperator.get(s.cashier_id)!.add(dateKey);
  }

  const rows: OperatorKpiRow[] = operators.map((op) => {
    const opShiftDates = shiftDatesByOperator.get(op.id) ?? new Set<string>();

    // Tasks owned by this operator (excluding those deferred away because they were on leave without shift)
    const ownedTasks = tasks.filter((t) => t.assigned_operator_id === op.id);
    const reassignedAwayTasks = tasks.filter((t) => t.reassigned_from_operator_id === op.id);

    // Filter tasks on active shift days (if shift history is present for that date or task was counted)
    const scheduledActiveTasks = ownedTasks.filter((t) => {
      if (t.status !== 'pending') return true;
      if (opShiftDates.size === 0) return true;
      return opShiftDates.has(t.scheduled_date);
    });

    let completedOnTimeCount = 0;
    for (const t of scheduledActiveTasks) {
      if (t.status !== 'pending' && t.counted_at) {
        const countedDate = getLocalDateStr(new Date(t.counted_at));
        if (countedDate <= t.scheduled_date) {
          completedOnTimeCount += 1;
        }
      }
    }

    const disciplineScore =
      scheduledActiveTasks.length > 0
        ? round1((completedOnTimeCount / scheduledActiveTasks.length) * 100)
        : 100;

    // Resolved primary tasks for accuracy & discrepancy findings
    const resolvedPrimaryTasks = ownedTasks.filter(
      (t) =>
        t.status === 'resolved' &&
        t.observed_qty !== null &&
        t.final_approved_qty !== null &&
        t.system_stock_snapshot !== null
    );

    const recountCompletedCount = tasks.filter(
      (t) => t.recount_operator_id === op.id && t.recounted_at !== null
    ).length;

    let accuracySum = 0;
    let reportedDiscrepancies = 0;
    let verifiedRealFindings = 0;
    let falseAlarmCount = 0;
    let missedDiscrepancyCount = 0;

    for (const t of resolvedPrimaryTasks) {
      const observed = Number(t.observed_qty ?? 0);
      const snapshot = Number(t.system_stock_snapshot ?? 0);

      // Ground truth at the moment of first count:
      // If a recount happened and was approved, adjust final_approved_qty back to first count time via applied_delta
      const expectedAtFirstCount =
        t.resolution_choice === 'use_recount'
          ? snapshot + Number(t.applied_delta || 0)
          : Number(t.final_approved_qty ?? snapshot);

      const denom = Math.max(1, Math.abs(expectedAtFirstCount), Math.abs(observed));
      const taskAccuracy = Math.max(0, 100 - (Math.abs(observed - expectedAtFirstCount) / denom) * 100);
      accuracySum += taskAccuracy;

      const operatorReportedVariance = observed !== snapshot;
      const realVarianceApproved =
        (t.resolution_choice === 'use_observed' || t.resolution_choice === 'use_recount') &&
        Number(t.applied_delta || 0) !== 0;

      if (operatorReportedVariance) {
        reportedDiscrepancies += 1;
        if (realVarianceApproved && (t.resolution_choice === 'use_observed' || Math.sign(observed - snapshot) === Math.sign(t.applied_delta))) {
          verifiedRealFindings += 1;
        } else {
          falseAlarmCount += 1;
        }
      } else if (realVarianceApproved) {
        // Operator said stock matched system, but recount found a real discrepancy
        missedDiscrepancyCount += 1;
      }
    }

    const accuracyScore =
      resolvedPrimaryTasks.length > 0 ? round1(accuracySum / resolvedPrimaryTasks.length) : 0;

    let discoveryScore = 0;
    if (resolvedPrimaryTasks.length > 0) {
      if (reportedDiscrepancies > 0) {
        const precision = verifiedRealFindings / reportedDiscrepancies;
        const missedPenalty = missedDiscrepancyCount * 10;
        discoveryScore = round1(Math.max(0, Math.min(100, precision * 100 - missedPenalty)));
      } else {
        discoveryScore = round1(Math.max(0, 100 - missedDiscrepancyCount * 15));
      }
    }

    const hasEvaluatedWork = resolvedPrimaryTasks.length > 0 || scheduledActiveTasks.length > 0;
    const totalKpiScore = hasEvaluatedWork
      ? round1(accuracyScore * 0.6 + disciplineScore * 0.25 + discoveryScore * 0.15)
      : 0;

    return {
      operator_id: op.id,
      operator_name: op.nama,
      role: op.role,
      total_scheduled_tasks: scheduledActiveTasks.length,
      completed_on_time_count: completedOnTimeCount,
      reassigned_away_count: reassignedAwayTasks.length,
      resolved_primary_count: resolvedPrimaryTasks.length,
      recount_completed_count: recountCompletedCount,
      reported_discrepancies_count: reportedDiscrepancies,
      verified_real_findings_count: verifiedRealFindings,
      false_alarm_count: falseAlarmCount,
      missed_discrepancy_count: missedDiscrepancyCount,
      accuracy_score: accuracyScore,
      discipline_score: disciplineScore,
      discovery_score: discoveryScore,
      total_kpi_score: totalKpiScore,
    };
  });

  return rows.sort((a, b) => {
    if (b.total_kpi_score !== a.total_kpi_score) return b.total_kpi_score - a.total_kpi_score;
    if (b.resolved_primary_count !== a.resolved_primary_count) {
      return b.resolved_primary_count - a.resolved_primary_count;
    }
    return a.operator_name.localeCompare(b.operator_name, 'id');
  });
}

// ─── Supabase Data Access & Orchestration ────────────────────────────────────

export async function getOpnameOperators(): Promise<OpnameOperator[]> {
  // Primary path: SECURITY DEFINER RPC so operators opening POS can see all operator peers despite pengelola RLS
  try {
    if (typeof supabase.rpc === 'function') {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_opname_operators');
      if (!rpcError && Array.isArray(rpcData)) {
        return rpcData.map((r: any) => ({
          id: String(r.id),
          nama: String(r.nama || 'Operator'),
          role: String(r.role || 'operator'),
          created_at: r.created_at,
        }));
      }
    }
  } catch {
    // Fallback to direct query when RPC is unavailable (e.g., admin context or test mocks)
  }

  const { data, error } = await supabase
    .from('pengelola')
    .select('id, nama, role, created_at')
    .in('role', ['operator', 'kasir'])
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.warn('[stockOpnameService] getOpnameOperators fallback error:', error.message);
    return [];
  }

  return (data || []).map((r: any) => ({
    id: String(r.id),
    nama: String(r.nama || 'Operator'),
    role: String(r.role || 'operator'),
    created_at: r.created_at,
  }));
}

async function loadAllProductsAndCategories(): Promise<SortedCycleProduct[]> {
  const [prodRes, catRes] = await Promise.all([
    fetchAllPaginatedSafe<any>(() =>
      supabase
        .from('products')
        .select('id, sku, name, unit, category_id, buy_price, stock, is_active')
        .eq('is_active', true)
    ),
    fetchAllPaginatedSafe<any>(() => supabase.from('product_categories').select('id, name')),
  ]);

  if (prodRes.error) {
    throw new Error(`Gagal memuat katalog produk: ${prodRes.error.message}`);
  }

  const categoryMap = new Map<string, string>();
  for (const c of catRes.data || []) {
    if (c?.id) categoryMap.set(String(c.id), String(c.name || '').trim());
  }

  const products: OpnameProductSource[] = (prodRes.data || []).map((p: any) => ({
    id: String(p.id),
    sku: String(p.sku || ''),
    name: String(p.name || ''),
    unit: String(p.unit || 'pcs'),
    category_id: p.category_id ?? null,
    buy_price: Number(p.buy_price) || 0,
    stock: Number(p.stock) || 0,
    is_active: p.is_active !== false,
  }));

  return sortProductsForCycleCount(products, categoryMap);
}

async function getOrCreateActiveCycle(): Promise<OpnameCycle> {
  const { data: activeCycles, error: activeErr } = await supabase
    .from('stock_opname_cycles')
    .select('*')
    .eq('status', 'active')
    .order('cycle_number', { ascending: false })
    .limit(1);

  if (activeErr) {
    throw new Error(`Gagal memuat siklus stock opname: ${activeErr.message}`);
  }

  if (activeCycles && activeCycles.length > 0) {
    return activeCycles[0] as OpnameCycle;
  }

  const { data: latestCycles } = await supabase
    .from('stock_opname_cycles')
    .select('cycle_number')
    .order('cycle_number', { ascending: false })
    .limit(1);

  const nextCycleNumber =
    latestCycles && latestCycles.length > 0 ? Number(latestCycles[0].cycle_number) + 1 : 1;

  const { data: inserted, error: insertErr } = await supabase
    .from('stock_opname_cycles')
    .insert({
      cycle_number: nextCycleNumber,
      status: 'active',
    })
    .select('*')
    .single();

  if (insertErr) {
    // Handle race condition if another shift created the cycle simultaneously
    const { data: retryActive } = await supabase
      .from('stock_opname_cycles')
      .select('*')
      .eq('status', 'active')
      .order('cycle_number', { ascending: false })
      .limit(1);
    if (retryActive && retryActive.length > 0) {
      return retryActive[0] as OpnameCycle;
    }
    throw new Error(`Gagal membuat siklus opname baru: ${insertErr.message}`);
  }

  return inserted as OpnameCycle;
}

async function advanceToNextCycle(currentCycle: OpnameCycle): Promise<OpnameCycle> {
  await supabase
    .from('stock_opname_cycles')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', currentCycle.id);

  const nextCycleNumber = currentCycle.cycle_number + 1;
  const { data: existingNext } = await supabase
    .from('stock_opname_cycles')
    .select('*')
    .eq('cycle_number', nextCycleNumber)
    .maybeSingle();

  if (existingNext) {
    return existingNext as OpnameCycle;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('stock_opname_cycles')
    .insert({
      cycle_number: nextCycleNumber,
      status: 'active',
    })
    .select('*')
    .single();

  if (insertErr) {
    throw new Error(`Gagal membuka siklus opname #${nextCycleNumber}: ${insertErr.message}`);
  }

  return inserted as OpnameCycle;
}

/**
 * Reassign unfinished tasks from previous dates where the assigned operator had NO shift (libur)
 * to operators working today, strictly respecting the daily quota per operator.
 */
export async function deferMissedOperatorTasksToNextDay(params: {
  todayStr: string;
  quota: number;
  activeOperatorIdsToday: string[];
  allOperators: OpnameOperator[];
}): Promise<{ deferredCount: number; todayLoadMap: Map<string, number> }> {
  const { todayStr, quota, activeOperatorIdsToday, allOperators } = params;
  const todayLoadMap = new Map<string, number>();
  for (const op of allOperators) {
    todayLoadMap.set(op.id, 0);
  }

  // Count tasks already scheduled for today per operator
  const { data: todayTasks } = await fetchAllPaginatedSafe<any>(() =>
    supabase
      .from('stock_opname_tasks')
      .select('id, assigned_operator_id')
      .eq('scheduled_date', todayStr)
  );

  for (const t of todayTasks || []) {
    const opId = String(t.assigned_operator_id);
    todayLoadMap.set(opId, (todayLoadMap.get(opId) || 0) + 1);
  }

  // Load past pending tasks
  const { data: pastPending } = await fetchAllPaginatedSafe<any>(() =>
    supabase
      .from('stock_opname_tasks')
      .select('id, assigned_operator_id, reassigned_from_operator_id, scheduled_date, slot_index')
      .eq('status', 'pending')
      .lt('scheduled_date', todayStr)
      .order('scheduled_date', { ascending: true })
      .order('slot_index', { ascending: true })
  );

  if (!pastPending || pastPending.length === 0) {
    return { deferredCount: 0, todayLoadMap };
  }

  const earliestDate = String(pastPending[0].scheduled_date);
  const { data: shiftRows } = await fetchAllPaginatedSafe<any>(() =>
    supabase
      .from('cashier_shifts')
      .select('cashier_id, opened_at')
      .gte('opened_at', `${earliestDate}T00:00:00`)
      .lte('opened_at', `${todayStr}T23:59:59`)
  );

  const shiftDateSet = new Set<string>();
  for (const s of shiftRows || []) {
    if (!s.cashier_id || !s.opened_at) continue;
    shiftDateSet.add(`${s.cashier_id}|${getLocalDateStr(new Date(s.opened_at))}`);
  }

  const candidateReceivers =
    activeOperatorIdsToday.length > 0
      ? activeOperatorIdsToday
      : allOperators.map((o) => o.id);

  if (candidateReceivers.length === 0) {
    return { deferredCount: 0, todayLoadMap };
  }

  let deferredCount = 0;
  for (const task of pastPending) {
    const origOpId = String(task.assigned_operator_id);
    const taskDate = String(task.scheduled_date);

    // Did the original operator open a shift on taskDate?
    // Even if they missed it while on leave (no shift), reassign; also reassign stale missed tasks.
    const hadShiftOnTaskDate = shiftDateSet.has(`${origOpId}|${taskDate}`);
    if (hadShiftOnTaskDate) {
      // Operator actually worked that day and left it pending; still carry over only if eligible
      // Wait: if they had no shift (libur), definitely defer to another operator; if they had a shift
      // and left it uncounted, also allow rollover to keep cycle moving without exceeding quota.
    }

    // Pick eligible receiver with load < quota, preferring someone other than origOpId when operator was on leave
    const eligible = candidateReceivers
      .filter((opId) => (todayLoadMap.get(opId) || 0) < quota)
      .sort((a, b) => {
        const aIsOrig = !hadShiftOnTaskDate && a === origOpId ? 1 : 0;
        const bIsOrig = !hadShiftOnTaskDate && b === origOpId ? 1 : 0;
        if (aIsOrig !== bIsOrig) return aIsOrig - bIsOrig;
        return (todayLoadMap.get(a) || 0) - (todayLoadMap.get(b) || 0);
      });

    if (eligible.length === 0) {
      // Daily quota across all active operators is full; remaining tasks wait for the next working day
      break;
    }

    const receiverId = eligible[0];
    const reassignedFrom =
      receiverId !== origOpId
        ? task.reassigned_from_operator_id || origOpId
        : task.reassigned_from_operator_id || null;

    const { error: updErr } = await supabase
      .from('stock_opname_tasks')
      .update({
        assigned_operator_id: receiverId,
        reassigned_from_operator_id: reassignedFrom,
        scheduled_date: todayStr,
      })
      .eq('id', task.id)
      .eq('status', 'pending');

    if (!updErr) {
      todayLoadMap.set(receiverId, (todayLoadMap.get(receiverId) || 0) + 1);
      deferredCount += 1;
    }
  }

  return { deferredCount, todayLoadMap };
}

/**
 * Ensures daily cycle count tasks are generated for today up to `daily_opname_quota`,
 * sweeping categories A -> Z (+ 'Tanpa Kategori' last) and rotating blocks across operators on each new cycle.
 */
export async function ensureDailyOpnameAssignments(options?: {
  operatorId?: string;
  todayStr?: string;
}): Promise<DailyAssignmentResult> {
  const todayStr = options?.todayStr || getLocalDateStr();
  const settings = await getPosSettings();
  const quota = Math.max(1, Math.min(200, Number(settings.daily_opname_quota) || 15));

  const allOperators = await getOpnameOperators();
  if (allOperators.length === 0) {
    return {
      cycleNumber: 1,
      cycleId: null,
      quota,
      deferredCount: 0,
      assignedCount: 0,
      totalActiveProducts: 0,
      cycleAssignedCount: 0,
      operatorsCount: 0,
    };
  }

  // Determine operators who opened a shift today (or the current operator opening POS)
  const { data: todayShiftRows } = await fetchAllPaginatedSafe<any>(() =>
    supabase
      .from('cashier_shifts')
      .select('cashier_id, status, opened_at')
      .or(`status.eq.open,opened_at.gte.${todayStr}T00:00:00`)
  );

  const operatorIdSet = new Set(allOperators.map((o) => o.id));
  const activeTodaySet = new Set<string>();
  for (const s of todayShiftRows || []) {
    const cid = String(s.cashier_id || '');
    if (operatorIdSet.has(cid)) {
      const openedDate = s.opened_at ? getLocalDateStr(new Date(s.opened_at)) : '';
      if (s.status === 'open' || openedDate === todayStr) {
        activeTodaySet.add(cid);
      }
    }
  }
  if (options?.operatorId && operatorIdSet.has(options.operatorId)) {
    activeTodaySet.add(options.operatorId);
  }

  // If no shift is open yet (e.g., Admin manually triggers sync from Audit page), schedule across all operators
  const targetOperatorIds =
    activeTodaySet.size > 0
      ? allOperators.filter((o) => activeTodaySet.has(o.id)).map((o) => o.id)
      : allOperators.map((o) => o.id);

  // Step 1: Defer past unfinished tasks from operators who were off/on leave
  const { deferredCount, todayLoadMap } = await deferMissedOperatorTasksToNextDay({
    todayStr,
    quota,
    activeOperatorIdsToday: targetOperatorIds,
    allOperators,
  });

  // Step 2: Load active catalog sorted A -> Z by Category ('Tanpa Kategori' last)
  const sortedCatalog = await loadAllProductsAndCategories();
  let cycle = await getOrCreateActiveCycle();

  if (sortedCatalog.length === 0) {
    return {
      cycleNumber: cycle.cycle_number,
      cycleId: cycle.id,
      quota,
      deferredCount,
      assignedCount: 0,
      totalActiveProducts: 0,
      cycleAssignedCount: 0,
      operatorsCount: allOperators.length,
    };
  }

  let totalInserted = 0;
  let cycleAssignedCount = 0;

  // Up to 2 iterations in case the current cycle finishes mid-day and rolls into cycle_number + 1
  for (let pass = 0; pass < 2; pass++) {
    const { data: existingCycleTasks, error: existingErr } = await fetchAllPaginatedSafe<any>(() =>
      supabase
        .from('stock_opname_tasks')
        .select('id, product_id')
        .eq('cycle_id', cycle.id)
    );

    if (existingErr) {
      throw new Error(`Gagal memeriksa tugas siklus berjalan: ${existingErr.message}`);
    }

    const assignedProductIds = new Set(
      (existingCycleTasks || []).map((t: any) => String(t.product_id))
    );
    cycleAssignedCount = assignedProductIds.size;

    const unassignedSlots = sortedCatalog.filter(
      (item) => !assignedProductIds.has(item.product.id)
    );

    if (unassignedSlots.length === 0) {
      cycle = await advanceToNextCycle(cycle);
      cycleAssignedCount = 0;
      continue;
    }

    const toInsert: any[] = [];
    const claimedInPass = new Set<string>();

    // First allocate slots matching each active operator's rotated lane
    for (let opIdx = 0; opIdx < allOperators.length; opIdx++) {
      const op = allOperators[opIdx];
      if (!targetOperatorIds.includes(op.id)) continue;

      let currentLoad = todayLoadMap.get(op.id) || 0;
      if (currentLoad >= quota) continue;

      for (const item of unassignedSlots) {
        if (currentLoad >= quota) break;
        if (claimedInPass.has(item.product.id)) continue;

        const laneIdx = resolveOperatorIndexForSlot(
          item.slotIndex,
          cycle.cycle_number,
          allOperators.length
        );
        if (laneIdx === opIdx) {
          claimedInPass.add(item.product.id);
          toInsert.push({
            cycle_id: cycle.id,
            cycle_number: cycle.cycle_number,
            slot_index: item.slotIndex,
            product_id: item.product.id,
            category_group: item.categoryGroup,
            assigned_operator_id: op.id,
            scheduled_date: todayStr,
            status: 'pending',
          });
          currentLoad += 1;
          todayLoadMap.set(op.id, currentLoad);
        }
      }
    }

    // If remaining unassigned items belong to an off-duty operator's lane while active operators still have quota capacity,
    // allow active operators to sweep remaining items so the cycle completes smoothly
    for (const opId of targetOperatorIds) {
      let currentLoad = todayLoadMap.get(opId) || 0;
      if (currentLoad >= quota) continue;

      for (const item of unassignedSlots) {
        if (currentLoad >= quota) break;
        if (claimedInPass.has(item.product.id)) continue;

        claimedInPass.add(item.product.id);
        toInsert.push({
          cycle_id: cycle.id,
          cycle_number: cycle.cycle_number,
          slot_index: item.slotIndex,
          product_id: item.product.id,
          category_group: item.categoryGroup,
          assigned_operator_id: opId,
          scheduled_date: todayStr,
          status: 'pending',
        });
        currentLoad += 1;
        todayLoadMap.set(opId, currentLoad);
      }
    }

    if (toInsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from('stock_opname_tasks')
        .upsert(toInsert, { onConflict: 'cycle_id,product_id', ignoreDuplicates: true });

      if (upsertErr) {
        throw new Error(`Gagal menjadwalkan tugas opname harian: ${upsertErr.message}`);
      }
      totalInserted += toInsert.length;
      cycleAssignedCount += toInsert.length;
    }

    // Check if cycle just completed and operators still have remaining quota
    const allOperatorsFull = targetOperatorIds.every((id) => (todayLoadMap.get(id) || 0) >= quota);
    if (cycleAssignedCount >= sortedCatalog.length && !allOperatorsFull) {
      cycle = await advanceToNextCycle(cycle);
      cycleAssignedCount = 0;
      continue;
    }
    break;
  }

  return {
    cycleNumber: cycle.cycle_number,
    cycleId: cycle.id,
    quota,
    deferredCount,
    assignedCount: totalInserted,
    totalActiveProducts: sortedCatalog.length,
    cycleAssignedCount,
    operatorsCount: allOperators.length,
  };
}

/**
 * Fetch today's Blind Count tasks + any Admin-requested Re-Count tasks for the logged-in operator.
 * NEVER returns `stock` or `system_stock_snapshot`.
 */
export async function getOperatorDailyTasks(
  operatorId: string,
  todayStr: string = getLocalDateStr()
): Promise<OperatorBlindTask[]> {
  if (!operatorId) return [];

  const [dailyRes, recountRes] = await Promise.all([
    supabase
      .from('stock_opname_tasks')
      .select(
        'id, cycle_id, cycle_number, slot_index, product_id, category_group, assigned_operator_id, reassigned_from_operator_id, scheduled_date, status, observed_qty, counted_at, recount_operator_id, recount_qty, recounted_at, notes'
      )
      .eq('assigned_operator_id', operatorId)
      .eq('scheduled_date', todayStr)
      .order('slot_index', { ascending: true }),
    supabase
      .from('stock_opname_tasks')
      .select(
        'id, cycle_id, cycle_number, slot_index, product_id, category_group, assigned_operator_id, reassigned_from_operator_id, scheduled_date, status, observed_qty, counted_at, recount_operator_id, recount_qty, recounted_at, notes'
      )
      .eq('recount_operator_id', operatorId)
      .eq('status', 'recount_requested')
      .order('scheduled_date', { ascending: true }),
  ]);

  if (dailyRes.error) {
    throw new Error(`Gagal memuat tugas cek fisik harian: ${dailyRes.error.message}`);
  }

  const combinedMap = new Map<string, any>();
  for (const row of recountRes.data || []) {
    combinedMap.set(row.id, { ...row, __isRecountTask: true });
  }
  for (const row of dailyRes.data || []) {
    if (!combinedMap.has(row.id)) {
      combinedMap.set(row.id, {
        ...row,
        __isRecountTask:
          row.status === 'recount_requested' && row.recount_operator_id === operatorId,
      });
    }
  }

  const rawTasks = Array.from(combinedMap.values());
  if (rawTasks.length === 0) return [];

  const productIds = Array.from(new Set(rawTasks.map((t) => String(t.product_id))));
  const { data: prodRows } = await supabase
    .from('products')
    .select('id, sku, name, unit')
    .in('id', productIds);

  const productMap = new Map<string, { sku: string; name: string; unit: string }>();
  for (const p of prodRows || []) {
    productMap.set(String(p.id), {
      sku: String(p.sku || '-'),
      name: String(p.name || 'Produk'),
      unit: String(p.unit || 'pcs'),
    });
  }

  const operators = await getOpnameOperators();
  const operatorNameMap = new Map<string, string>(operators.map((o) => [o.id, o.nama]));

  return rawTasks
    .map((t): OperatorBlindTask => {
      const prod = productMap.get(String(t.product_id));
      const reassignedFromId = t.reassigned_from_operator_id
        ? String(t.reassigned_from_operator_id)
        : null;
      return {
        id: String(t.id),
        cycle_id: String(t.cycle_id),
        cycle_number: Number(t.cycle_number) || 1,
        slot_index: Number(t.slot_index) || 0,
        product_id: String(t.product_id),
        sku: prod?.sku || '-',
        product_name: prod?.name || 'Produk',
        unit: prod?.unit || 'pcs',
        category_group: String(t.category_group || UNCATEGORIZED_GROUP),
        scheduled_date: String(t.scheduled_date),
        status: t.status as OpnameTaskStatus,
        is_reassigned: Boolean(reassignedFromId),
        reassigned_from_name: reassignedFromId
          ? operatorNameMap.get(reassignedFromId) || 'Operator Lain'
          : undefined,
        is_recount_task: Boolean(t.__isRecountTask),
        observed_qty: t.observed_qty !== null && t.observed_qty !== undefined ? Number(t.observed_qty) : null,
        counted_at: t.counted_at ?? null,
        recount_qty: t.recount_qty !== null && t.recount_qty !== undefined ? Number(t.recount_qty) : null,
        recounted_at: t.recounted_at ?? null,
        notes: t.notes ?? null,
      };
    })
    .sort((a, b) => {
      if (a.is_recount_task !== b.is_recount_task) return a.is_recount_task ? -1 : 1;
      return a.slot_index - b.slot_index;
    });
}

/**
 * Operator submits Blind Count physical qty.
 * Locks `system_stock_snapshot` and `counted_at` at the exact instant of submission.
 */
export async function submitOperatorBlindCount(
  taskId: string,
  observedQty: number,
  notes?: string
): Promise<OpnameTaskRecord> {
  const cleanQty = normalizeNonNegativeInt(observedQty);

  const { data: task, error: taskErr } = await supabase
    .from('stock_opname_tasks')
    .select('id, product_id, status')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) {
    throw new Error('Tugas opname tidak ditemukan.');
  }
  if (task.status === 'resolved') {
    throw new Error('Tugas ini sudah disahkan oleh Admin dan tidak dapat diubah.');
  }

  const { data: prod, error: prodErr } = await supabase
    .from('products')
    .select('id, stock, buy_price')
    .eq('id', task.product_id)
    .single();

  if (prodErr || !prod) {
    throw new Error('Produk tidak ditemukan untuk mengambil snapshot stok sistem.');
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from('stock_opname_tasks')
    .update({
      observed_qty: cleanQty,
      system_stock_snapshot: Number(prod.stock) || 0,
      unit_cost_snapshot: Number(prod.buy_price) || 0,
      counted_at: nowIso,
      status: 'counted',
      notes: notes?.trim() || null,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (updErr || !updated) {
    throw new Error(`Gagal menyimpan hasil hitung fisik: ${updErr?.message || 'Unknown error'}`);
  }

  return updated as OpnameTaskRecord;
}

export async function requestTaskRecount(
  taskId: string,
  recountOperatorId: string,
  notes?: string
): Promise<OpnameTaskRecord> {
  if (!recountOperatorId) {
    throw new Error('Harap pilih operator untuk melakukan pemeriksaan ulang (re-count).');
  }

  const { data: task, error: taskErr } = await supabase
    .from('stock_opname_tasks')
    .select('id, status')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) {
    throw new Error('Tugas opname tidak ditemukan.');
  }
  if (task.status === 'resolved') {
    throw new Error('Tugas ini sudah disahkan.');
  }

  const { data: updated, error: updErr } = await supabase
    .from('stock_opname_tasks')
    .update({
      status: 'recount_requested',
      recount_operator_id: recountOperatorId,
      notes: notes?.trim() || null,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (updErr || !updated) {
    throw new Error(`Gagal menugaskan pemeriksaan ulang: ${updErr?.message || 'Unknown error'}`);
  }

  return updated as OpnameTaskRecord;
}

export async function submitRecountObservation(
  taskId: string,
  recountQty: number,
  recountOperatorId?: string,
  notes?: string
): Promise<OpnameTaskRecord> {
  const cleanQty = normalizeNonNegativeInt(recountQty);

  const { data: task, error: taskErr } = await supabase
    .from('stock_opname_tasks')
    .select('id, product_id, status, recount_operator_id')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) {
    throw new Error('Tugas re-count tidak ditemukan.');
  }
  if (task.status === 'resolved') {
    throw new Error('Tugas ini sudah disahkan oleh Admin.');
  }

  const { data: prod, error: prodErr } = await supabase
    .from('products')
    .select('id, stock, buy_price')
    .eq('id', task.product_id)
    .single();

  if (prodErr || !prod) {
    throw new Error('Produk tidak ditemukan.');
  }

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, any> = {
    recount_qty: cleanQty,
    recount_system_snapshot: Number(prod.stock) || 0,
    unit_cost_snapshot: Number(prod.buy_price) || 0,
    recounted_at: nowIso,
    status: 'recounted',
  };
  if (recountOperatorId) {
    updatePayload.recount_operator_id = recountOperatorId;
  }
  if (notes !== undefined) {
    updatePayload.notes = notes.trim() || null;
  }

  const { data: updated, error: updErr } = await supabase
    .from('stock_opname_tasks')
    .update(updatePayload)
    .eq('id', taskId)
    .select('*')
    .single();

  if (updErr || !updated) {
    throw new Error(`Gagal menyimpan hasil hitung ulang: ${updErr?.message || 'Unknown error'}`);
  }

  return updated as OpnameTaskRecord;
}

export async function getActiveCycleProgress(): Promise<OpnameCycleProgress> {
  const cycle = await getOrCreateActiveCycle();
  const [prodRes, taskRes] = await Promise.all([
    fetchAllPaginatedSafe<any>(() =>
      supabase.from('products').select('id').eq('is_active', true)
    ),
    fetchAllPaginatedSafe<any>(() =>
      supabase
        .from('stock_opname_tasks')
        .select('id, status')
        .eq('cycle_id', cycle.id)
    ),
  ]);

  const tasks = taskRes.data || [];
  return {
    cycleNumber: cycle.cycle_number,
    totalActiveProducts: (prodRes.data || []).length,
    assignedInCycle: tasks.length,
    countedOrResolvedInCycle: tasks.filter((t) => t.status !== 'pending').length,
    resolvedInCycle: tasks.filter((t) => t.status === 'resolved').length,
  };
}

/**
 * Fetches tasks for Admin Audit & Comparison along with live system stock and post-count store mutations.
 */
export async function getOpnameComparisonList(filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  operatorId?: string;
}): Promise<OpnameComparisonRow[]> {
  const { data: rawTasks, error: tasksErr } = await fetchAllPaginatedSafe<any>(() => {
    let q: any = supabase
      .from('stock_opname_tasks')
      .select('*')
      .order('scheduled_date', { ascending: false })
      .order('slot_index', { ascending: true });
    if (filters?.startDate) {
      q = q.gte('scheduled_date', filters.startDate);
    }
    if (filters?.endDate) {
      q = q.lte('scheduled_date', filters.endDate);
    }
    if (filters?.status && filters.status !== 'all') {
      q = q.eq('status', filters.status);
    }
    if (filters?.operatorId && filters.operatorId !== 'all') {
      q = q.eq('assigned_operator_id', filters.operatorId);
    }
    return q;
  });

  if (tasksErr) {
    throw new Error(`Gagal memuat daftar audit opname: ${tasksErr.message}`);
  }

  const tasks: OpnameTaskRecord[] = (rawTasks || []) as OpnameTaskRecord[];
  if (tasks.length === 0) return [];

  // Load products, staff names (admin context can read pengelola directly + fallback to getOpnameOperators)
  const [prodRes, staffRes, opsFallback, adjRes] = await Promise.all([
    fetchAllPaginatedSafe<any>(() =>
      supabase.from('products').select('id, sku, name, unit, stock, buy_price')
    ),
    supabase.from('pengelola').select('id, nama'),
    getOpnameOperators(),
    fetchAllPaginatedSafe<any>(() =>
      supabase
        .from('stock_opname_adjustments')
        .select('task_id, reference_no')
    ),
  ]);

  const productMap = new Map<string, any>();
  for (const p of prodRes.data || []) {
    productMap.set(String(p.id), p);
  }

  const staffNameMap = new Map<string, string>();
  for (const o of opsFallback) {
    staffNameMap.set(o.id, o.nama);
  }
  for (const s of staffRes.data || []) {
    staffNameMap.set(String(s.id), String(s.nama || 'Staf'));
  }

  const taskRefMap = new Map<string, string>();
  for (const a of adjRes.data || []) {
    taskRefMap.set(String(a.task_id), String(a.reference_no));
  }

  // Determine earliest counted_at timestamp to query post-count mutations efficiently
  const countTimes = tasks
    .map((t) => t.counted_at || t.recounted_at)
    .filter(Boolean)
    .map((iso) => new Date(String(iso)).getTime())
    .filter((ms) => !Number.isNaN(ms));

  let mutations: MutationRowLite[] = [];
  if (countTimes.length > 0) {
    const earliestIso = new Date(Math.min(...countTimes)).toISOString();
    const { data: mutData } = await fetchAllPaginatedSafe<any>(() =>
      supabase
        .from('v_inventory_mutations')
        .select('mutation_id, mutation_date, product_id, mutation_type, reference_number, qty_in, qty_out')
        .gt('mutation_date', earliestIso)
    );
    mutations = (mutData || []) as MutationRowLite[];
  }

  return tasks.map((t) => {
    const prod = productMap.get(String(t.product_id));
    const currentStock = Number(prod?.stock ?? 0);
    const currentBuyPrice = Number(prod?.buy_price ?? t.unit_cost_snapshot ?? 0);
    const ownRefNo = taskRefMap.get(t.id) || null;

    const anchorTime =
      t.status === 'recounted' && t.recounted_at ? t.recounted_at : t.counted_at;
    const mutationsSinceCount = calculatePostCountMutations(
      mutations,
      t.product_id,
      anchorTime,
      ownRefNo
    );

    const varianceAtCount =
      t.observed_qty !== null && t.system_stock_snapshot !== null
        ? Number(t.observed_qty) - Number(t.system_stock_snapshot)
        : null;

    const recountVariance =
      t.recount_qty !== null && t.recount_system_snapshot !== null
        ? Number(t.recount_qty) - Number(t.recount_system_snapshot)
        : null;

    const projectedIfObserved =
      t.observed_qty !== null
        ? Number(t.observed_qty) + mutationsSinceCount.netDeltaSinceCount
        : null;

    const projectedIfRecount =
      t.recount_qty !== null
        ? Number(t.recount_qty) + mutationsSinceCount.netDeltaSinceCount
        : null;

    const activeDeltaForEstimate =
      t.status === 'resolved'
        ? Number(t.applied_delta || 0)
        : recountVariance !== null
          ? recountVariance
          : varianceAtCount ?? 0;

    const estimatedVarianceValue =
      t.status === 'resolved'
        ? Number(t.variance_value || 0)
        : activeDeltaForEstimate * currentBuyPrice;

    return {
      ...t,
      sku: String(prod?.sku || '-'),
      product_name: String(prod?.name || 'Produk'),
      unit: String(prod?.unit || 'pcs'),
      current_system_stock: currentStock,
      current_buy_price: currentBuyPrice,
      assigned_operator_name: staffNameMap.get(t.assigned_operator_id) || 'Operator',
      reassigned_from_operator_name: t.reassigned_from_operator_id
        ? staffNameMap.get(t.reassigned_from_operator_id) || 'Operator Lain'
        : undefined,
      recount_operator_name: t.recount_operator_id
        ? staffNameMap.get(t.recount_operator_id) || 'Pengusul Ulang'
        : undefined,
      variance_at_count: varianceAtCount,
      recount_variance: recountVariance,
      mutations_since_count: mutationsSinceCount,
      projected_stock_if_observed: projectedIfObserved,
      projected_stock_if_recount: projectedIfRecount,
      estimated_variance_value: estimatedVarianceValue,
    };
  });
}

function buildOpnameReferenceNo(taskId: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = taskId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || '0001';
  const rand = Math.floor(100 + Math.random() * 900);
  return `OPN-${yyyy}${mm}${dd}-${suffix}${rand}`;
}

/**
 * Admin reconciles a task with one of 3 choices:
 * - 'use_system': keep system stock, applied_delta = 0
 * - 'use_observed': apply observed_qty - system_stock_snapshot delta to live products.stock
 * - 'use_recount': apply recount_qty - recount_system_snapshot delta (supports direct admin recount input)
 */
export async function resolveOpnameTask(params: {
  taskId: string;
  choice: OpnameResolutionChoice;
  resolvedBy: string;
  adminRecountQty?: number;
  notes?: string;
}): Promise<OpnameTaskRecord> {
  const { taskId, choice, resolvedBy, adminRecountQty, notes } = params;

  const { data: task, error: taskErr } = await supabase
    .from('stock_opname_tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) {
    throw new Error('Tugas opname tidak ditemukan.');
  }
  if (task.status === 'resolved') {
    throw new Error('Tugas opname ini sudah disahkan sebelumnya.');
  }

  const { data: prod, error: prodErr } = await supabase
    .from('products')
    .select('id, name, stock, buy_price')
    .eq('id', task.product_id)
    .single();

  if (prodErr || !prod) {
    throw new Error('Produk terkait tidak ditemukan.');
  }

  const liveStock = Number(prod.stock) || 0;
  const buyPrice = Number(prod.buy_price) || Number(task.unit_cost_snapshot) || 0;
  const nowIso = new Date().toISOString();

  let finalApprovedQty = 0;
  let appliedDelta = 0;
  let recountFields: Record<string, any> = {};

  if (choice === 'use_system') {
    if (task.system_stock_snapshot === null || task.system_stock_snapshot === undefined) {
      throw new Error('Snapshot stok sistem belum tersedia (tugas belum dihitung).');
    }
    finalApprovedQty = Number(task.system_stock_snapshot);
    appliedDelta = 0;
  } else if (choice === 'use_observed') {
    if (task.observed_qty === null || task.observed_qty === undefined) {
      throw new Error('Angka pengamatan operator belum diinput.');
    }
    if (task.system_stock_snapshot === null || task.system_stock_snapshot === undefined) {
      throw new Error('Snapshot stok sistem saat hitung tidak ditemukan.');
    }
    finalApprovedQty = Number(task.observed_qty);
    appliedDelta = finalApprovedQty - Number(task.system_stock_snapshot);
  } else if (choice === 'use_recount') {
    if (adminRecountQty !== undefined && adminRecountQty !== null) {
      const cleanAdminQty = normalizeNonNegativeInt(adminRecountQty);
      finalApprovedQty = cleanAdminQty;
      appliedDelta = cleanAdminQty - liveStock;
      recountFields = {
        recount_qty: cleanAdminQty,
        recount_system_snapshot: liveStock,
        recounted_at: nowIso,
      };
    } else {
      if (task.recount_qty === null || task.recount_qty === undefined) {
        throw new Error('Hasil pemeriksaan ulang (re-count) belum tersedia.');
      }
      const refSnapshot =
        task.recount_system_snapshot !== null && task.recount_system_snapshot !== undefined
          ? Number(task.recount_system_snapshot)
          : liveStock;
      finalApprovedQty = Number(task.recount_qty);
      appliedDelta = finalApprovedQty - refSnapshot;
    }
  }

  const varianceValue = appliedDelta * buyPrice;

  if (appliedDelta !== 0) {
    const newStock = Math.max(0, liveStock + appliedDelta);
    const { error: stockUpdErr } = await supabase
      .from('products')
      .update({
        stock: newStock,
        updated_at: nowIso,
      })
      .eq('id', task.product_id);

    if (stockUpdErr) {
      throw new Error(`Gagal memperbarui stok produk: ${stockUpdErr.message}`);
    }

    const referenceNo = buildOpnameReferenceNo(taskId);
    const adjNotes =
      notes?.trim() ||
      `Penyesuaian Stock Opname (${choice === 'use_recount' ? 'Re-Count' : 'Pengamatan'}) - ${prod.name}`;

    const { error: adjErr } = await supabase.from('stock_opname_adjustments').insert({
      task_id: taskId,
      product_id: task.product_id,
      reference_no: referenceNo,
      qty_in: appliedDelta > 0 ? appliedDelta : 0,
      qty_out: appliedDelta < 0 ? Math.abs(appliedDelta) : 0,
      unit_cost: buyPrice,
      total_value: varianceValue,
      notes: adjNotes,
      approved_by: resolvedBy || null,
      created_at: nowIso,
    });

    if (adjErr) {
      throw new Error(`Gagal mencatat jurnal penyesuaian opname: ${adjErr.message}`);
    }
  }

  const { data: updatedTask, error: updTaskErr } = await supabase
    .from('stock_opname_tasks')
    .update({
      ...recountFields,
      status: 'resolved',
      resolution_choice: choice,
      final_approved_qty: finalApprovedQty,
      applied_delta: appliedDelta,
      unit_cost_snapshot: buyPrice,
      variance_value: varianceValue,
      resolved_by: resolvedBy || null,
      resolved_at: nowIso,
      notes: notes !== undefined ? notes.trim() || null : task.notes,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (updTaskErr || !updatedTask) {
    throw new Error(`Gagal mengesahkan keputusan opname: ${updTaskErr?.message || 'Unknown error'}`);
  }

  return updatedTask as OpnameTaskRecord;
}

/**
 * Bulk-approve tasks where observed_qty === system_stock_snapshot (zero variance).
 */
export async function resolveBulkZeroVarianceTasks(
  taskIds: string[],
  resolvedBy: string
): Promise<number> {
  let approvedCount = 0;
  for (const id of taskIds) {
    await resolveOpnameTask({
      taskId: id,
      choice: 'use_system',
      resolvedBy,
      notes: 'Pengesahan massal item cocok (selisih 0)',
    });
    approvedCount += 1;
  }
  return approvedCount;
}

/**
 * Fetches tasks and shifts within [startDate, endDate] and calculates Operator KPI scores.
 */
export async function getOperatorOpnameKpis(
  startDate: string,
  endDate: string
): Promise<OperatorKpiRow[]> {
  const [operators, tasksRes, shiftsRes] = await Promise.all([
    getOpnameOperators(),
    fetchAllPaginatedSafe<any>(() =>
      supabase
        .from('stock_opname_tasks')
        .select('*')
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
    ),
    fetchAllPaginatedSafe<any>(() =>
      supabase
        .from('cashier_shifts')
        .select('cashier_id, opened_at, closed_at, status')
        .gte('opened_at', `${startDate}T00:00:00`)
        .lte('opened_at', `${endDate}T23:59:59`)
    ),
  ]);

  if (tasksRes.error) {
    throw new Error(`Gagal memuat data KPI opname: ${tasksRes.error.message}`);
  }

  return calculateOperatorOpnameKpis(
    operators,
    (tasksRes.data || []) as OpnameTaskRecord[],
    (shiftsRes.data || []) as CashierShiftLite[]
  );
}

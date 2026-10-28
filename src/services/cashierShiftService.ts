import { supabase } from '../lib/supabaseClient';

export interface CashierShift {
  id: string;
  cashier_id: string;
  shift_number: string;
  opened_at: string;
  closed_at?: string | null;
  initial_cash: number;
  cash_sales: number;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  status: 'open' | 'closed';
  notes?: string | null;
  cashier_name?: string;
  created_at?: string;
}

export interface OpenShiftPayload {
  cashierId: string;
  initialCash: number;
  notes?: string;
  cashierName?: string;
}

export interface CloseShiftPayload {
  shiftId: string;
  actualCash: number;
  notes?: string;
  cashierId?: string;
}

export interface ShiftReconciliationSummary {
  shiftId: string;
  initialCash: number;
  cashSales: number;
  nonCashSales: number;
  depositSales?: number;
  creditSales?: number;
  totalSales: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  transactionCount: number;
}

// Storage keys for dual-layer offline fallback & persistent active shift tracking
export const ACTIVE_SHIFT_STORAGE_KEY = 'simkop_active_shift';
export const ACTIVE_SHIFT_ID_KEY = 'simkop_active_shift_id';
export const ACTIVE_SHIFT_DATA_KEY = 'simkop_active_shift_data';
export const SHIFT_HISTORY_STORAGE_KEY = 'simkop_shift_history';

// In-memory cache
let inMemoryActiveShift: CashierShift | null = null;
let inMemoryShiftHistory: CashierShift[] = [];

/**
 * Helper to safely access localStorage across web and test runtimes
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
    // ignore storage restrictions
  }
  return null;
}

/**
 * Sanitizes numeric inputs to prevent NaN or undefined crashes
 */
export const sanitizeNumber = (val: any, fallback = 0): number => {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
};

/**
 * Generates unique shift number with format SHF-YYYYMMDD-HHMMSS
 */
export function generateShiftNumber(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `SHF-${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

/**
 * Generates standard UUID v4 for offline or mock resilience
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback to manual RFC4122 v4
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retrieve active shift from local storage / memory
 */
export function getLocalActiveShift(): CashierShift | null {
  try {
    const storage = getStorage();
    if (storage) {
      const data = storage.getItem(ACTIVE_SHIFT_STORAGE_KEY);
      if (data) return JSON.parse(data);
    }
  } catch (e) {
    console.warn('Gagal membaca active shift dari localStorage:', e);
  }
  return inMemoryActiveShift;
}

/**
 * Retrieve active shift ID with maximum persistence
 */
export function getActiveShiftId(): string | null {
  const local = getLocalActiveShift();
  if (local?.id) return local.id;
  try {
    const storage = getStorage();
    if (storage) {
      const id = storage.getItem(ACTIVE_SHIFT_ID_KEY);
      if (id) return id;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Persist active shift to local storage / memory
 */
export function saveLocalActiveShift(shift: CashierShift | null): void {
  inMemoryActiveShift = shift;
  try {
    const storage = getStorage();
    if (storage) {
      if (shift) {
        storage.setItem(ACTIVE_SHIFT_STORAGE_KEY, JSON.stringify(shift));
        storage.setItem(ACTIVE_SHIFT_ID_KEY, shift.id);
        storage.setItem(ACTIVE_SHIFT_DATA_KEY, JSON.stringify(shift));
      } else {
        storage.removeItem(ACTIVE_SHIFT_STORAGE_KEY);
        storage.removeItem(ACTIVE_SHIFT_ID_KEY);
        storage.removeItem(ACTIVE_SHIFT_DATA_KEY);
      }
    }
  } catch (e) {
    console.warn('Gagal menyimpan active shift ke localStorage:', e);
  }
}

/**
 * Retrieve shift history from local storage / memory
 */
export function getLocalShiftHistory(): CashierShift[] {
  try {
    const storage = getStorage();
    if (storage) {
      const data = storage.getItem(SHIFT_HISTORY_STORAGE_KEY);
      if (data) return JSON.parse(data);
    }
  } catch (e) {
    console.warn('Gagal membaca shift history dari localStorage:', e);
  }
  return inMemoryShiftHistory;
}

/**
 * Persist shift history to local storage / memory
 */
export function saveLocalShiftHistory(shifts: CashierShift[]): void {
  inMemoryShiftHistory = shifts;
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(SHIFT_HISTORY_STORAGE_KEY, JSON.stringify(shifts));
    }
  } catch (e) {
    console.warn('Gagal menyimpan shift history ke localStorage:', e);
  }
}

/**
 * Prepend or update a shift in the local history list
 */
function addShiftToLocalHistory(shift: CashierShift): void {
  const current = getLocalShiftHistory();
  const filtered = current.filter(s => s.id !== shift.id);
  const updated = [shift, ...filtered];
  saveLocalShiftHistory(updated);
}

/**
 * Filter local history by date range
 */
function filterLocalShiftHistory(startDate?: string, endDate?: string): CashierShift[] {
  let list = getLocalShiftHistory();
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
    list = list.filter(s => new Date(s.opened_at).getTime() >= start);
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999Z`).getTime();
    list = list.filter(s => new Date(s.opened_at).getTime() <= end);
  }
  return list.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
}

/**
 * Clear in-memory and local storage shift data (useful for resets & unit tests)
 */
export function resetLocalShiftState(): void {
  inMemoryActiveShift = null;
  inMemoryShiftHistory = [];
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(ACTIVE_SHIFT_STORAGE_KEY);
      storage.removeItem(ACTIVE_SHIFT_ID_KEY);
      storage.removeItem(ACTIVE_SHIFT_DATA_KEY);
      storage.removeItem(SHIFT_HISTORY_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Ambil shift aktif (status = 'open') untuk kasir atau sesi saat ini
 */
export async function getActiveShift(cashierId?: string): Promise<CashierShift | null> {
  try {
    let query = supabase
      .from('cashier_shifts')
      .select('*')
      .eq('status', 'open');

    if (cashierId) {
      query = query.eq('cashier_id', cashierId);
    }

    const { data, error } = await query
      .order('opened_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('Supabase cashier_shifts getActiveShift failed, fallback ke local storage:', error.message);
      const local = getLocalActiveShift();
      if (local && (!cashierId || local.cashier_id === cashierId) && local.status === 'open') {
        return local;
      }
      return null;
    }

    if (data && data.length > 0) {
      const row = data[0];
      let cashierName: string | undefined;

      if (row.cashier_id) {
        try {
          const { data: pData } = await supabase
            .from('pengelola')
            .select('nama')
            .eq('id', row.cashier_id)
            .single();
          if (pData?.nama) cashierName = pData.nama;
        } catch {
          // ignore lookup error
        }
      }

      const shift: CashierShift = {
        id: row.id,
        cashier_id: row.cashier_id,
        shift_number: row.shift_number,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        initial_cash: sanitizeNumber(row.initial_cash),
        cash_sales: sanitizeNumber(row.cash_sales),
        expected_cash: sanitizeNumber(row.expected_cash),
        actual_cash: sanitizeNumber(row.actual_cash),
        difference: sanitizeNumber(row.difference),
        status: row.status,
        notes: row.notes,
        cashier_name: cashierName,
        created_at: row.created_at
      };

      saveLocalActiveShift(shift);
      return shift;
    }

    // Tidak ada shift aktif di database
    saveLocalActiveShift(null);
    return null;
  } catch (err: any) {
    console.warn('Error in getActiveShift, using offline fallback:', err?.message || err);
    const local = getLocalActiveShift();
    if (local && (!cashierId || local.cashier_id === cashierId) && local.status === 'open') {
      return local;
    }
    return null;
  }
}

/**
 * Buka shift baru untuk kasir dengan modal kas kecil awal
 */
export async function openShift(payload: OpenShiftPayload): Promise<CashierShift> {
  const initialCash = Math.max(0, sanitizeNumber(payload.initialCash, 0));

  // 1. Validasi kasir tidak memiliki shift aktif yang menggantung
  const active = await getActiveShift(payload.cashierId);
  if (active && active.status === 'open') {
    throw new Error(`Kasir masih memiliki shift aktif (${active.shift_number}) yang belum ditutup. Harap tutup shift tersebut terlebih dahulu.`);
  }

  const shiftId = generateUUID();
  const shiftNumber = generateShiftNumber();
  const now = new Date().toISOString();

  const shift: CashierShift = {
    id: shiftId,
    cashier_id: payload.cashierId,
    shift_number: shiftNumber,
    opened_at: now,
    closed_at: null,
    initial_cash: initialCash,
    cash_sales: 0,
    expected_cash: initialCash,
    actual_cash: 0,
    difference: 0,
    status: 'open',
    notes: payload.notes || null,
    cashier_name: payload.cashierName,
    created_at: now
  };

  // 2. Simpan ke database Supabase cashier_shifts
  try {
    const { data, error } = await supabase
      .from('cashier_shifts')
      .insert({
        id: shift.id,
        cashier_id: shift.cashier_id,
        shift_number: shift.shift_number,
        opened_at: shift.opened_at,
        initial_cash: shift.initial_cash,
        cash_sales: 0,
        expected_cash: shift.initial_cash,
        actual_cash: 0,
        difference: 0,
        status: 'open',
        notes: shift.notes
      })
      .select()
      .single();

    if (error) {
      console.warn('Gagal insert cashier_shifts ke Supabase, aktifkan local fallback:', error.message);
    } else if (data) {
      shift.id = data.id;
      shift.shift_number = data.shift_number;
      shift.created_at = data.created_at;
    }
  } catch (dbErr: any) {
    console.warn('Supabase cashier_shifts error saat openShift:', dbErr?.message || dbErr);
  }

  // 3. Catat mutasi pengeluaran kas kecil di cash_flow
  if (initialCash > 0) {
    try {
      const { error: cfError } = await supabase.from('cash_flow').insert({
        direction: 'out',
        amount: initialCash,
        category: 'MODAL_KASIR_AWAL',
        reference_id: shift.id
      });
      if (cfError) {
        console.warn('Gagal mencatat cash_flow MODAL_KASIR_AWAL:', cfError.message);
      }
    } catch (cfErr: any) {
      console.warn('Exception saat mencatat cash_flow MODAL_KASIR_AWAL:', cfErr?.message || cfErr);
    }
  }

  // 4. Update memory & local storage
  saveLocalActiveShift(shift);
  return shift;
}

/**
 * Menghitung ringkasan transaksi penjualan pada rentang shift aktif
 */
export async function getShiftSalesSummary(
  shiftId: string,
  cashierId?: string,
  openedAt?: string
): Promise<ShiftReconciliationSummary> {
  // 1. Ambil info shift untuk initial_cash
  let shift: CashierShift | null = null;
  const localActive = getLocalActiveShift();
  if (localActive && localActive.id === shiftId) {
    shift = localActive;
  } else {
    const history = getLocalShiftHistory();
    shift = history.find(s => s.id === shiftId) || null;
  }

  if (!shift) {
    try {
      const { data } = await supabase
        .from('cashier_shifts')
        .select('*')
        .eq('id', shiftId)
        .single();
      if (data) {
        shift = {
          id: data.id,
          cashier_id: data.cashier_id,
          shift_number: data.shift_number,
          opened_at: data.opened_at,
          closed_at: data.closed_at,
          initial_cash: sanitizeNumber(data.initial_cash),
          cash_sales: sanitizeNumber(data.cash_sales),
          expected_cash: sanitizeNumber(data.expected_cash),
          actual_cash: sanitizeNumber(data.actual_cash),
          difference: sanitizeNumber(data.difference),
          status: data.status,
          notes: data.notes,
          created_at: data.created_at
        };
      }
    } catch {
      // ignore
    }
  }

  const initialCash = shift ? sanitizeNumber(shift.initial_cash) : 0;
  const effectiveCashierId = cashierId || shift?.cashier_id;
  const effectiveOpenedAt = openedAt || shift?.opened_at;

  let salesRows: any[] = [];

  try {
    // 1. Coba query berdasarkan shift_id langsung
    const { data: salesByShift, error: shiftErr } = await supabase
      .from('sales')
      .select('id, total_amount, paid_cash, paid_deposit, paid_credit, paid_amount, payment_scheme, sale_status, created_at')
      .eq('shift_id', shiftId);

    if (!shiftErr && salesByShift && salesByShift.length > 0) {
      salesRows = salesByShift;
    }

    // 2. Robust fallback jika shift_id masih kosong / tidak ditemukan (transaksi orphan atau selisih timestamp)
    if (salesRows.length === 0 && effectiveOpenedAt) {
      // Beri toleransi waktu mulai 2 menit sebelum opened_at untuk antisipasi jeda detik client-server
      const openedAtTime = new Date(new Date(effectiveOpenedAt).getTime() - 2 * 60 * 1000).toISOString();
      const closedAtTime = shift?.closed_at
        ? new Date(new Date(shift.closed_at).getTime() + 2 * 60 * 1000).toISOString()
        : new Date(Date.now() + 2 * 60 * 1000).toISOString();

      let fallbackQuery = supabase
        .from('sales')
        .select('id, total_amount, paid_cash, paid_deposit, paid_credit, paid_amount, payment_scheme, sale_status, created_at')
        .gte('created_at', openedAtTime)
        .lte('created_at', closedAtTime);

      if (effectiveCashierId) {
        fallbackQuery = fallbackQuery.eq('cashier_id', effectiveCashierId);
      }

      const { data: fallbackSales, error: fallbackErr } = await fallbackQuery;
      if (!fallbackErr && fallbackSales && fallbackSales.length > 0) {
        salesRows = fallbackSales;
      }
    }
  } catch (err: any) {
    console.warn('Gagal memuat sales untuk summary shift:', err?.message || err);
  }

  // Filter transaksi yang valid (bukan dibatalkan atau parked)
  const validSales = salesRows.filter(s => {
    const saleStatus = (s.sale_status || (s as any).status || '').toLowerCase();
    return saleStatus !== 'cancelled' && saleStatus !== 'parked';
  });

  // 3. Hitung total uang tunai masuk (cash sales) & transaksi
  let totalCashSales = 0;
  let depositSales = 0;
  let creditSales = 0;
  let totalSales = 0;
  let transactionCount = 0;

  for (const s of validSales) {
    const d = sanitizeNumber(s.paid_deposit);
    const cr = sanitizeNumber(s.paid_credit);
    const tot = sanitizeNumber(s.total_amount, sanitizeNumber(s.paid_cash) + d + cr);
    const nonCash = d + cr;
    const maxCashPortion = Math.max(0, tot - nonCash);

    let c = sanitizeNumber(s.paid_cash);

    // Jika paid_cash > 0, uang fisik yang masuk ke kasir adalah nominal belanja tunai riil (setelah dipotong kembalian)
    if (c > 0) {
      c = maxCashPortion > 0 ? Math.min(c, maxCashPortion) : c;
    } else if (s.payment_scheme === 'cash' || (!d && !cr && tot > 0)) {
      c = tot;
    }

    if (c > 0 || tot > 0) {
      transactionCount += 1;
    }

    totalCashSales += c;
    depositSales += d;
    creditSales += cr;
    totalSales += tot;
  }

  const nonCashSales = depositSales + creditSales;
  const expectedCash = initialCash + totalCashSales;
  const actualCash = shift?.actual_cash !== undefined ? sanitizeNumber(shift.actual_cash) : 0;
  const difference = actualCash - expectedCash;

  return {
    shiftId,
    initialCash,
    cashSales: totalCashSales,
    nonCashSales,
    depositSales,
    creditSales,
    totalSales,
    expectedCash,
    actualCash,
    difference,
    transactionCount
  };
}

/**
 * Tutup shift operasional kasir, rekonsiliasi kas fisik, dan catat mutasi cash_flow
 */
export async function closeShift(payload: CloseShiftPayload): Promise<CashierShift> {
  // 1. Temukan shift yang akan ditutup
  let shift: CashierShift | null = null;
  const localActive = getLocalActiveShift();
  if (localActive && localActive.id === payload.shiftId) {
    shift = { ...localActive };
  } else {
    const history = getLocalShiftHistory();
    const found = history.find(s => s.id === payload.shiftId);
    if (found) shift = { ...found };
  }

  if (!shift) {
    try {
      const { data } = await supabase
        .from('cashier_shifts')
        .select('*')
        .eq('id', payload.shiftId)
        .single();
      if (data) {
        shift = {
          id: data.id,
          cashier_id: data.cashier_id,
          shift_number: data.shift_number,
          opened_at: data.opened_at,
          closed_at: data.closed_at,
          initial_cash: sanitizeNumber(data.initial_cash),
          cash_sales: sanitizeNumber(data.cash_sales),
          expected_cash: sanitizeNumber(data.expected_cash),
          actual_cash: sanitizeNumber(data.actual_cash),
          difference: sanitizeNumber(data.difference),
          status: data.status,
          notes: data.notes,
          created_at: data.created_at
        };
      }
    } catch {
      // ignore
    }
  }

  if (!shift) {
    throw new Error(`Shift dengan ID ${payload.shiftId} tidak ditemukan.`);
  }

  if (shift.status === 'closed') {
    return shift;
  }

  // 2. Hitung ringkasan penjualan aktual
  const summary = await getShiftSalesSummary(payload.shiftId, shift.cashier_id, shift.opened_at);
  const initialCash = sanitizeNumber(shift.initial_cash);
  const cashSales = summary.cashSales;
  const expectedCash = initialCash + cashSales;
  const actualCash = sanitizeNumber(payload.actualCash, 0);
  const difference = actualCash - expectedCash;
  const closedAt = new Date().toISOString();
  const notes = payload.notes !== undefined ? payload.notes : (shift.notes || '');

  shift.closed_at = closedAt;
  shift.cash_sales = cashSales;
  shift.expected_cash = expectedCash;
  shift.actual_cash = actualCash;
  shift.difference = difference;
  shift.status = 'closed';
  shift.notes = notes;

  // 3. Update status shift di Supabase cashier_shifts
  try {
    const { error: updateError } = await supabase
      .from('cashier_shifts')
      .update({
        closed_at: closedAt,
        cash_sales: cashSales,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        difference: difference,
        status: 'closed',
        notes: notes
      })
      .eq('id', shift.id);

    if (updateError) {
      console.warn('Gagal update cashier_shifts di Supabase saat closeShift:', updateError.message);
    }
  } catch (dbErr: any) {
    console.warn('Exception saat update cashier_shifts closeShift:', dbErr?.message || dbErr);
  }

  // 4. Catat mutasi kas di cash_flow
  // 4a. Pengembalian modal kasir awal (jika initial_cash > 0)
  if (initialCash > 0) {
    try {
      const { error: cfError } = await supabase.from('cash_flow').insert({
        direction: 'in',
        amount: initialCash,
        category: 'PENGEMBALIAN_MODAL_KASIR',
        reference_id: shift.id
      });
      if (cfError) console.warn('Gagal mencatat cash_flow PENGEMBALIAN_MODAL_KASIR:', cfError.message);
    } catch (cfErr: any) {
      console.warn('Exception cash_flow PENGEMBALIAN_MODAL_KASIR:', cfErr?.message || cfErr);
    }
  }

  // 4b. Setoran penjualan kasir tunai (jika cash_sales > 0)
  if (cashSales > 0) {
    try {
      const { error: cfError } = await supabase.from('cash_flow').insert({
        direction: 'in',
        amount: cashSales,
        category: 'PENJUALAN_KASIR_TUNAI',
        reference_id: shift.id
      });
      if (cfError) console.warn('Gagal mencatat cash_flow PENJUALAN_KASIR_TUNAI:', cfError.message);
    } catch (cfErr: any) {
      console.warn('Exception cash_flow PENJUALAN_KASIR_TUNAI:', cfErr?.message || cfErr);
    }
  }

  // 4c. Selisih kasir (lebih atau kurang)
  if (difference > 0) {
    try {
      const { error: cfError } = await supabase.from('cash_flow').insert({
        direction: 'in',
        amount: Math.abs(difference),
        category: 'SELISIH_LEBIH_KASIR',
        reference_id: shift.id
      });
      if (cfError) console.warn('Gagal mencatat cash_flow SELISIH_LEBIH_KASIR:', cfError.message);
    } catch (cfErr: any) {
      console.warn('Exception cash_flow SELISIH_LEBIH_KASIR:', cfErr?.message || cfErr);
    }
  } else if (difference < 0) {
    try {
      const { error: cfError } = await supabase.from('cash_flow').insert({
        direction: 'out',
        amount: Math.abs(difference),
        category: 'SELISIH_KURANG_KASIR',
        reference_id: shift.id
      });
      if (cfError) console.warn('Gagal mencatat cash_flow SELISIH_KURANG_KASIR:', cfError.message);
    } catch (cfErr: any) {
      console.warn('Exception cash_flow SELISIH_KURANG_KASIR:', cfErr?.message || cfErr);
    }
  }

  // 5. Update local state & history
  if (localActive && localActive.id === shift.id) {
    saveLocalActiveShift(null);
  }
  addShiftToLocalHistory(shift);

  return shift;
}

/**
 * Mengambil daftar riwayat shift tertutup untuk audit laporan
 */
export async function getShiftHistory(startDate?: string, endDate?: string): Promise<CashierShift[]> {
  try {
    let query = supabase
      .from('cashier_shifts')
      .select('*')
      .order('opened_at', { ascending: false });

    if (startDate) {
      query = query.gte('opened_at', `${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      query = query.lte('opened_at', `${endDate}T23:59:59.999Z`);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Supabase getShiftHistory error, menggunakan local fallback:', error.message);
      return filterLocalShiftHistory(startDate, endDate);
    }

    if (data) {
      const cashierIds = [...new Set(data.map(d => d.cashier_id).filter(Boolean))];
      const cashierMap: Record<string, string> = {};
      if (cashierIds.length > 0) {
        try {
          const { data: pengelolaList } = await supabase
            .from('pengelola')
            .select('id, nama')
            .in('id', cashierIds);
          pengelolaList?.forEach(p => {
            cashierMap[p.id] = p.nama;
          });
        } catch {
          // ignore lookup errors
        }
      }

      const list: CashierShift[] = data.map(row => ({
        id: row.id,
        cashier_id: row.cashier_id,
        shift_number: row.shift_number,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        initial_cash: sanitizeNumber(row.initial_cash),
        cash_sales: sanitizeNumber(row.cash_sales),
        expected_cash: sanitizeNumber(row.expected_cash),
        actual_cash: sanitizeNumber(row.actual_cash),
        difference: sanitizeNumber(row.difference),
        status: row.status,
        notes: row.notes,
        cashier_name: cashierMap[row.cashier_id] || undefined,
        created_at: row.created_at
      }));

      // Merge into local history
      saveLocalShiftHistory(list);
      return list;
    }
    return filterLocalShiftHistory(startDate, endDate);
  } catch (err: any) {
    console.warn('Error getShiftHistory:', err?.message || err);
    return filterLocalShiftHistory(startDate, endDate);
  }
}

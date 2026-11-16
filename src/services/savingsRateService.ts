import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import { getLastCompletedLebaranCycle } from './bulkWithdrawalService';

export type DepositTypeCode = 'POKOK' | 'WAJIB' | 'BELANJA' | 'LEBARAN';

export const DEPOSIT_TYPE_LABELS: Record<string, string> = {
  POKOK: 'Simpanan Pokok',
  WAJIB: 'Simpanan Wajib',
  BELANJA: 'Simpanan Belanja',
  LEBARAN: 'Simpanan Hari Raya (Lebaran)',
};

export interface SavingsRateTier {
  id: string;
  deposit_type_code: string; // 'POKOK' | 'WAJIB' | 'BELANJA' | 'LEBARAN'
  start_year: number;
  start_month: number;
  end_year: number | null;
  end_month: number | null;
  monthly_rate: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AddRateTierPayload {
  id?: string;
  deposit_type_code: string;
  start_year: number;
  start_month: number;
  end_year?: number | null;
  end_month?: number | null;
  monthly_rate: number;
  notes?: string | null;
}

export interface DepositTypeRateRef {
  id?: string;
  code?: string | null;
  name?: string | null;
  default_amount?: number | null;
  is_active?: boolean | null;
}

export interface MemberLebaranRate {
  id: string;
  member_id: string;
  effective_year: number;
  effective_month: number;
  monthly_rate: number;
  cycle_label?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpsertMemberLebaranRatePayload {
  memberId: string;
  effectiveYear: number;
  effectiveMonth: number;
  monthlyRate: number;
  cycleLabel?: string;
  notes?: string;
  userId?: string;
}

export interface ResolveMemberSavingsRateContext {
  globalTiers?: SavingsRateTier[];
  depositTypes?: DepositTypeRateRef[];
  memberLebaranRates?: MemberLebaranRate[];
}

export interface MemberLebaranRateInfo {
  rate: number;
  isPersonal: boolean;
  matchedPersonal: MemberLebaranRate | null;
  globalRate: number;
}

export interface SavingsRateResolver {
  tiers: SavingsRateTier[];
  depositTypes: DepositTypeRateRef[];
  memberLebaranRates?: MemberLebaranRate[];
  getRateForPeriod: (depositTypeCode: string, year: number, month: number) => number;
  hasActiveTier: (depositTypeCode: string, year: number, month: number) => boolean;
  resolveMemberRate: (
    memberId: string | null | undefined,
    depositTypeCode: string,
    year: number,
    month: number
  ) => number;
}

export const DEFAULT_RATE_TIERS: SavingsRateTier[] = [];
export const DEFAULT_TIERS: SavingsRateTier[] = DEFAULT_RATE_TIERS;

export const SAVINGS_RATE_TIERS_STORAGE_KEY = 'simkop_savings_rate_tiers';
export const MEMBER_LEBARAN_RATES_STORAGE_KEY = 'simkop_member_lebaran_rates';

let cachedRateTiers: SavingsRateTier[] | null = null;
let cachedDepositTypes: DepositTypeRateRef[] | null = null;
let cachedMemberLebaranRates: MemberLebaranRate[] | null = null;

/**
 * Normalisasi kode atau nama jenis simpanan ke kode kanonik ('POKOK', 'WAJIB', 'BELANJA', 'LEBARAN', atau uppercase kode kustom).
 */
export function normalizeDepositTypeCode(codeOrName?: string | null): string {
  const raw = String(codeOrName || '').trim().toUpperCase();
  if (!raw) return '';

  if (raw === 'SP' || raw === 'POKOK') return 'POKOK';
  if (raw === 'SW' || raw === 'WAJIB') return 'WAJIB';
  if (raw === 'SB' || raw === 'BELANJA') return 'BELANJA';
  if (
    raw === 'SL' ||
    raw === 'SHR' ||
    raw === 'HARI_RAYA' ||
    raw === 'THR' ||
    raw === 'LEBARAN'
  ) {
    return 'LEBARAN';
  }

  if (raw.includes('POKOK')) return 'POKOK';
  if (raw.includes('WAJIB')) return 'WAJIB';
  if (raw.includes('BELANJA')) return 'BELANJA';
  if (raw.includes('LEBARAN') || raw.includes('HARI RAYA')) return 'LEBARAN';

  return raw;
}

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

export function getStoredLocalRateTiers(): SavingsRateTier[] | null {
  try {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(SAVINGS_RATE_TIERS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as SavingsRateTier[];
      }
    }
  } catch (err) {
    console.warn('Failed to parse stored savings rate tiers:', err);
  }
  return null;
}

export function saveStoredLocalRateTiers(tiers: SavingsRateTier[]): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(SAVINGS_RATE_TIERS_STORAGE_KEY, JSON.stringify(tiers));
    }
  } catch (err) {
    console.warn('Failed to save savings rate tiers locally:', err);
  }
  cachedRateTiers = [...tiers];
}

export function getStoredLocalMemberLebaranRates(): MemberLebaranRate[] | null {
  try {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(MEMBER_LEBARAN_RATES_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as MemberLebaranRate[];
      }
    }
  } catch (err) {
    console.warn('Failed to parse stored member lebaran rates:', err);
  }
  return null;
}

export function saveStoredLocalMemberLebaranRates(rates: MemberLebaranRate[]): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(MEMBER_LEBARAN_RATES_STORAGE_KEY, JSON.stringify(rates));
    }
  } catch (err) {
    console.warn('Failed to save member lebaran rates locally:', err);
  }
  cachedMemberLebaranRates = [...rates];
}

export function clearTierCache(): void {
  cachedRateTiers = null;
  cachedDepositTypes = null;
  cachedMemberLebaranRates = null;
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(SAVINGS_RATE_TIERS_STORAGE_KEY);
      storage.removeItem(MEMBER_LEBARAN_RATES_STORAGE_KEY);
    } catch {}
  }
}

export function setCachedDepositTypes(depositTypes: DepositTypeRateRef[] | null): void {
  cachedDepositTypes = depositTypes ? [...depositTypes] : null;
}

export function setCachedMemberLebaranRates(rates: MemberLebaranRate[] | null): void {
  cachedMemberLebaranRates = rates ? [...rates] : null;
}

/**
 * Mengembalikan bulan dan tahun tepat 1 bulan sebelumnya
 */
export function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month <= 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

/**
 * Mengurutkan tier secara kronologis menaik
 */
export function sortRateTiers(tiers: SavingsRateTier[]): SavingsRateTier[] {
  return [...tiers].sort((a, b) => {
    if (a.start_year !== b.start_year) {
      return a.start_year - b.start_year;
    }
    return a.start_month - b.start_month;
  });
}

/**
 * Mengambil daftar tier tarif simpanan terurut kronologis
 */
export async function getRateTiers(depositTypeCode?: string, forceRefresh = false): Promise<SavingsRateTier[]> {
  const normalizedCode = depositTypeCode ? depositTypeCode.toUpperCase() : undefined;

  if (!forceRefresh && cachedRateTiers !== null) {
    const filtered = normalizedCode 
      ? cachedRateTiers.filter(t => t.deposit_type_code.toUpperCase() === normalizedCode)
      : cachedRateTiers;
    return sortRateTiers(filtered);
  }

  try {
    const tableObj: any = supabase.from('savings_rate_tiers');
    if (!tableObj || typeof tableObj.select !== 'function') {
      const stored = getStoredLocalRateTiers();
      if (stored !== null) {
        const filtered = normalizedCode
          ? stored.filter(t => t.deposit_type_code.toUpperCase() === normalizedCode)
          : stored;
        return sortRateTiers(filtered);
      }
      return [];
    }

    let query: any = tableObj.select('*');
    if (query && typeof query.order === 'function') {
      query = query.order('start_year', { ascending: true });
      if (query && typeof query.order === 'function') {
        query = query.order('start_month', { ascending: true });
      }
    }

    if (normalizedCode && query && typeof query.eq === 'function') {
      query = query.eq('deposit_type_code', normalizedCode);
    }

    const resp = await query;
    const data = Array.isArray(resp?.data) ? resp.data : null;
    const error = resp?.error ?? null;
    if (error) {
      console.error('Gagal mengambil data tarif dari database:', error);
      // Fallback ke penyimpanan lokal jika kueri database gagal/offline
      const stored = getStoredLocalRateTiers();
      if (stored !== null) {
        const filtered = normalizedCode
          ? stored.filter(t => t.deposit_type_code.toUpperCase() === normalizedCode)
          : stored;
        return sortRateTiers(filtered);
      }
      return [];
    }

    const rawResult = (data || []).filter(
      (row: any) =>
        row &&
        typeof row === 'object' &&
        'deposit_type_code' in row &&
        'start_year' in row &&
        'monthly_rate' in row
    );
    const result = normalizedCode
      ? rawResult.filter(t => String(t.deposit_type_code || '').toUpperCase() === normalizedCode)
      : rawResult;
    if (!normalizedCode) {
      cachedRateTiers = result;
      saveStoredLocalRateTiers(result);
    }
    return sortRateTiers(result);
  } catch (err) {
    console.error('Exception saat memuat savings_rate_tiers:', err);
    const stored = getStoredLocalRateTiers();
    if (stored !== null) {
      const filtered = normalizedCode
        ? stored.filter(t => t.deposit_type_code.toUpperCase() === normalizedCode)
        : stored;
      return sortRateTiers(filtered);
    }
    return [];
  }
}

/**
 * Menambahkan tier tarif baru dengan proteksi anti-overlap:
 * Memotong tier terbuka sebelumnya agar berakhir 1 bulan sebelum start tier baru.
 */
export async function addRateTier(payload: AddRateTierPayload): Promise<SavingsRateTier> {
  const code = payload.deposit_type_code.toUpperCase();
  const startYear = Number(payload.start_year);
  const startMonth = Number(payload.start_month);
  const endYear = payload.end_year !== null && payload.end_year !== undefined ? Number(payload.end_year) : null;
  const endMonth = payload.end_month !== null && payload.end_month !== undefined ? Number(payload.end_month) : null;
  const monthlyRate = Number(payload.monthly_rate);

  // Ambil semua tier aktif saat ini
  const allTiers = await getRateTiers(undefined, false);

  // Cari tier terbuka untuk jenis simpanan yang sama
  const targetPeriodIndex = startYear * 12 + startMonth;
  const previousMonthInfo = getPreviousMonth(startYear, startMonth);

  const updatedTiers: SavingsRateTier[] = [];

  for (const existing of allTiers) {
    if (existing.deposit_type_code.toUpperCase() === code) {
      const existingStartIndex = existing.start_year * 12 + existing.start_month;
      
      // Jika tier lama bersifat terbuka (open-ended) dan dimulai sebelum tier baru
      if (existing.end_year === null && existingStartIndex < targetPeriodIndex) {
        const cutTier: SavingsRateTier = {
          ...existing,
          end_year: previousMonthInfo.year,
          end_month: previousMonthInfo.month,
          updated_at: new Date().toISOString()
        };

        // Update di Supabase
        try {
          await supabase.from('savings_rate_tiers')
            .update({
              end_year: cutTier.end_year,
              end_month: cutTier.end_month,
              updated_at: cutTier.updated_at
            })
            .eq('id', cutTier.id);
        } catch (err) {
          console.warn('Failed to update cut tier in Supabase:', err);
        }

        updatedTiers.push(cutTier);
        continue;
      }
    }
    updatedTiers.push(existing);
  }

  // Buat tier baru
  const newTierId = payload.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tier-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`);
  const newTier: SavingsRateTier = {
    id: newTierId,
    deposit_type_code: code,
    start_year: startYear,
    start_month: startMonth,
    end_year: endYear,
    end_month: endMonth,
    monthly_rate: monthlyRate,
    notes: payload.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Simpan tier baru ke Supabase
  try {
    const { data, error } = await supabase.from('savings_rate_tiers')
      .insert([newTier])
      .select()
      .single();
    if (!error && data) {
      newTier.id = data.id;
    }
  } catch (err) {
    console.warn('Failed to insert new tier into Supabase, saving locally:', err);
  }

  updatedTiers.push(newTier);
  saveStoredLocalRateTiers(updatedTiers);

  return newTier;
}

/**
 * Menghapus tier tarif berdasarkan ID
 */
export async function deleteRateTier(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('savings_rate_tiers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Gagal menghapus tarif dari database:', error);
    throw error;
  }

  const current = (cachedRateTiers !== null ? cachedRateTiers : getStoredLocalRateTiers()) || [];
  const updated = current.filter(t => t.id !== id);
  cachedRateTiers = updated;
  saveStoredLocalRateTiers(updated);
  return true;
}

/**
 * Mencari seluruh tier tarif yang rentangnya mencakup periode (year, month) tertentu.
 */
export function findMatchingTiersForPeriod(
  depositTypeCode: string,
  year: number,
  month: number,
  tiers: SavingsRateTier[]
): SavingsRateTier[] {
  const canonicalCode = normalizeDepositTypeCode(depositTypeCode);
  const rawCode = String(depositTypeCode || '').trim().toUpperCase();
  if (!canonicalCode && !rawCode) return [];

  const targetIdx = Number(year) * 12 + Number(month);

  return sortRateTiers(
    tiers.filter((t) => {
      const tRaw = String(t.deposit_type_code || '').trim().toUpperCase();
      const tCanonical = normalizeDepositTypeCode(t.deposit_type_code);
      const codeMatches =
        tRaw === rawCode || (canonicalCode !== '' && tCanonical === canonicalCode);
      if (!codeMatches) return false;

      const startIdx = Number(t.start_year) * 12 + Number(t.start_month);
      const endIdx =
        t.end_year !== null &&
        t.end_year !== undefined &&
        t.end_month !== null &&
        t.end_month !== undefined
          ? Number(t.end_year) * 12 + Number(t.end_month)
          : 999999;
      return targetIdx >= startIdx && targetIdx <= endIdx;
    })
  );
}

/**
 * Mengecek apakah terdapat rentang aktif di savings_rate_tiers untuk (depositTypeCode, year, month).
 */
export function hasActiveTierForPeriod(
  depositTypeCode: string,
  year: number,
  month: number,
  tiers?: SavingsRateTier[]
): boolean {
  const tierList = tiers !== undefined ? tiers : (cachedRateTiers ?? getStoredLocalRateTiers() ?? []);
  return findMatchingTiersForPeriod(depositTypeCode, year, month, tierList).length > 0;
}

/**
 * Resolver tarif tunggal terpadu tanpa angka hardcoded:
 * 1. Prioritaskan rentang aktif di savings_rate_tiers (/admin/pengaturan).
 * 2. Fallback resmi ke default_amount pada deposit_types (/admin/master-simpan-pinjam).
 */
export function resolveSavingsMonthlyRate(
  depositTypeCode: string,
  year: number,
  month: number,
  tiers?: SavingsRateTier[],
  depositTypes?: DepositTypeRateRef[]
): number {
  const rawCode = String(depositTypeCode || '').trim().toUpperCase();
  const canonicalCode = normalizeDepositTypeCode(depositTypeCode);
  if (!rawCode && !canonicalCode) return 0;

  const tierList = tiers !== undefined ? tiers : (cachedRateTiers ?? getStoredLocalRateTiers() ?? []);
  const typeList = depositTypes !== undefined ? depositTypes : (cachedDepositTypes ?? []);

  // 1. Cek apakah ada rentang aktif pada savings_rate_tiers (/admin/pengaturan)
  const matchingTiers = findMatchingTiersForPeriod(depositTypeCode, year, month, tierList);
  if (matchingTiers.length > 0) {
    const activeTier = matchingTiers[matchingTiers.length - 1];
    return Number(activeTier.monthly_rate || 0);
  }

  // 2. Fallback resmi ke default_amount pada deposit_types (/admin/master-simpan-pinjam)
  const exactMasterType = typeList.find(
    (dt) => String(dt.code || '').trim().toUpperCase() === rawCode && rawCode !== ''
  );
  if (exactMasterType) {
    return Number(exactMasterType.default_amount || 0);
  }

  const canonicalMasterType = typeList.find(
    (dt) =>
      canonicalCode !== '' &&
      (normalizeDepositTypeCode(dt.code) === canonicalCode ||
        normalizeDepositTypeCode(dt.name) === canonicalCode)
  );
  return Number(canonicalMasterType?.default_amount || 0);
}

/**
 * Mengurutkan ketentuan Simpanan Lebaran personal secara kronologis menaik (effective_year ASC, effective_month ASC).
 */
export function sortMemberLebaranRates(rates: MemberLebaranRate[]): MemberLebaranRate[] {
  return [...rates].sort((a, b) => {
    const yearDiff = Number(a.effective_year) - Number(b.effective_year);
    if (yearDiff !== 0) return yearDiff;
    return Number(a.effective_month) - Number(b.effective_month);
  });
}

function isValidMemberLebaranRateRow(row: any): row is MemberLebaranRate {
  return Boolean(
    row &&
      typeof row === 'object' &&
      'member_id' in row &&
      'effective_year' in row &&
      'effective_month' in row &&
      'monthly_rate' in row
  );
}

export interface ActiveMemberRateTarget {
  id: string;
  nrp: string;
  nama: string;
  pangkat?: string | null;
  status?: string | null;
  membership_status?: string | null;
}

/**
 * Mengambil seluruh baris dari public.member_lebaran_rates menggunakan paginasi 1.000 baris
 * agar tidak terpotong batas default PostgREST (1.000 rows).
 */
export async function fetchAllMemberLebaranRatesPaged(): Promise<MemberLebaranRate[]> {
  const PAGE_SIZE = 1000;
  const tableObj: any = supabase.from('member_lebaran_rates');
  if (!tableObj || typeof tableObj.select !== 'function') {
    return [];
  }

  const allRows: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query: any = tableObj.select('*');
    if (query && typeof query.order === 'function') {
      query = query.order('effective_year', { ascending: true });
      if (query && typeof query.order === 'function') {
        query = query.order('effective_month', { ascending: true });
      }
    }

    if (query && typeof query.range === 'function') {
      const resp = await query.range(from, to);
      if (resp?.error) {
        throw resp.error;
      }
      const batch = Array.isArray(resp?.data) ? resp.data : [];
      allRows.push(...batch);
      if (batch.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      const resp = await query;
      if (resp?.error) {
        throw resp.error;
      }
      const batch = Array.isArray(resp?.data) ? resp.data : [];
      allRows.push(...batch);
      hasMore = false;
    }
  }

  return sortMemberLebaranRates(allRows.filter(isValidMemberLebaranRateRow));
}

/**
 * Mengambil seluruh anggota aktif (status = 'aktif') dari public.anggota
 * menggunakan paginasi 1.000 baris urut nama ASC agar tidak terpotong di baris ke-1.000.
 */
export async function fetchAllActiveMembersPaged(): Promise<ActiveMemberRateTarget[]> {
  const PAGE_SIZE = 1000;
  const tableObj: any = supabase.from('anggota');
  if (!tableObj || typeof tableObj.select !== 'function') {
    return [];
  }

  const allRows: ActiveMemberRateTarget[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query: any = tableObj.select('id, nrp, nama, pangkat, status, membership_status');
    if (query && typeof query.eq === 'function') {
      query = query.eq('status', 'aktif');
    }
    if (query && typeof query.order === 'function') {
      query = query.order('nama', { ascending: true });
    }

    if (query && typeof query.range === 'function') {
      const resp = await query.range(from, to);
      if (resp?.error) {
        throw resp.error;
      }
      const batch = Array.isArray(resp?.data) ? resp.data : [];
      allRows.push(...batch);
      if (batch.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      const resp = await query;
      if (resp?.error) {
        throw resp.error;
      }
      const batch = Array.isArray(resp?.data) ? resp.data : [];
      allRows.push(...batch);
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Mengambil daftar komitmen Simpanan Lebaran personal dari public.member_lebaran_rates
 * terurut effective_year ASC, effective_month ASC.
 * Jika memberId tidak diisi, seluruh baris diambil menggunakan paginasi 1.000 baris.
 */
export async function getMemberLebaranRates(
  memberId?: string,
  forceRefresh = false
): Promise<MemberLebaranRate[]> {
  if (!forceRefresh && cachedMemberLebaranRates !== null) {
    const filtered = memberId
      ? cachedMemberLebaranRates.filter((r) => r.member_id === memberId)
      : cachedMemberLebaranRates;
    return sortMemberLebaranRates(filtered);
  }

  try {
    if (!memberId) {
      const tableObj: any = supabase.from('member_lebaran_rates');
      if (!tableObj || typeof tableObj.select !== 'function') {
        const stored = getStoredLocalMemberLebaranRates();
        return stored !== null ? sortMemberLebaranRates(stored) : [];
      }

      const pagedRows = await fetchAllMemberLebaranRatesPaged();
      cachedMemberLebaranRates = pagedRows;
      saveStoredLocalMemberLebaranRates(pagedRows);
      return pagedRows;
    }

    const tableObj: any = supabase.from('member_lebaran_rates');
    if (!tableObj || typeof tableObj.select !== 'function') {
      const stored = getStoredLocalMemberLebaranRates();
      if (stored !== null) {
        return sortMemberLebaranRates(stored.filter((r) => r.member_id === memberId));
      }
      return [];
    }

    let query: any = tableObj.select('*');
    if (query && typeof query.order === 'function') {
      query = query.order('effective_year', { ascending: true });
      if (query && typeof query.order === 'function') {
        query = query.order('effective_month', { ascending: true });
      }
    }

    if (query && typeof query.eq === 'function') {
      query = query.eq('member_id', memberId);
    }

    const resp = await query;
    if (resp?.error) {
      console.warn('Gagal memuat member_lebaran_rates dari database:', resp.error);
      const stored = getStoredLocalMemberLebaranRates();
      if (stored !== null) {
        return sortMemberLebaranRates(stored.filter((r) => r.member_id === memberId));
      }
      return [];
    }

    const rawRows = Array.isArray(resp?.data) ? resp.data : [];
    const validRows = rawRows.filter(isValidMemberLebaranRateRow);
    const result = validRows.filter((r) => r.member_id === memberId);
    return sortMemberLebaranRates(result);
  } catch (err) {
    console.warn('Exception saat memuat member_lebaran_rates:', err);
    const stored = getStoredLocalMemberLebaranRates();
    if (stored !== null) {
      const filtered = memberId ? stored.filter((r) => r.member_id === memberId) : stored;
      return sortMemberLebaranRates(filtered);
    }
    return [];
  }
}

/**
 * Menyimpan atau memperbarui ketentuan Simpanan Lebaran personal per anggota
 * beserta pencatatan riwayat audit ke public.audit_logs.
 */
export async function upsertMemberLebaranRate(
  payload: UpsertMemberLebaranRatePayload
): Promise<MemberLebaranRate> {
  if (!payload.memberId) {
    throw new Error('ID anggota wajib diisi');
  }
  const effectiveYear = Number(payload.effectiveYear);
  const effectiveMonth = Number(payload.effectiveMonth);
  const monthlyRate = Number(payload.monthlyRate);

  if (isNaN(effectiveYear) || effectiveYear < 1900) {
    throw new Error('Tahun mulai berlaku tidak valid');
  }
  if (isNaN(effectiveMonth) || effectiveMonth < 1 || effectiveMonth > 12) {
    throw new Error('Bulan mulai berlaku harus di antara 1 sampai 12');
  }
  if (isNaN(monthlyRate) || monthlyRate <= 0) {
    throw new Error('Nominal Simpanan Lebaran harus lebih dari Rp 0');
  }

  let resolvedUserId = payload.userId || null;
  if (!resolvedUserId) {
    try {
      const authApi = (supabase as any)?.auth;
      if (authApi && typeof authApi.getUser === 'function') {
        const { data: authData } = await authApi.getUser();
        resolvedUserId = authData?.user?.id || null;
      }
    } catch {
      // Abaikan jika auth context tidak tersedia
    }
  }

  const nowIso = new Date().toISOString();
  const recordPayload = {
    member_id: payload.memberId,
    effective_year: effectiveYear,
    effective_month: effectiveMonth,
    monthly_rate: monthlyRate,
    cycle_label: payload.cycleLabel?.trim() || null,
    notes: payload.notes?.trim() || null,
    created_by: resolvedUserId,
    updated_at: nowIso,
  };

  let savedRow: MemberLebaranRate | null = null;
  const tableObj: any = supabase.from('member_lebaran_rates');

  if (tableObj && typeof tableObj.upsert === 'function') {
    const upsertQ = tableObj.upsert(recordPayload, {
      onConflict: 'member_id,effective_year,effective_month',
    });
    let resp: any;
    if (upsertQ && typeof upsertQ.select === 'function') {
      const selQ = upsertQ.select();
      resp = typeof selQ?.single === 'function' ? await selQ.single() : await selQ;
    } else {
      resp = await upsertQ;
    }
    if (resp?.error) {
      throw resp.error;
    }
    if (resp?.data) {
      savedRow = Array.isArray(resp.data) ? resp.data[0] : resp.data;
    }
  } else if (tableObj && typeof tableObj.insert === 'function') {
    const insQ = tableObj.insert([recordPayload]);
    let resp: any;
    if (insQ && typeof insQ.select === 'function') {
      const selQ = insQ.select();
      resp = typeof selQ?.single === 'function' ? await selQ.single() : await selQ;
    } else {
      resp = await insQ;
    }
    if (resp?.error) {
      throw resp.error;
    }
    if (resp?.data) {
      savedRow = Array.isArray(resp.data) ? resp.data[0] : resp.data;
    }
  }

  if (!savedRow || !isValidMemberLebaranRateRow(savedRow)) {
    savedRow = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `mlr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...recordPayload,
      created_at: nowIso,
    };
  }

  try {
    const auditTable: any = supabase.from('audit_logs');
    if (auditTable && typeof auditTable.insert === 'function') {
      await auditTable.insert({
        table_name: 'member_lebaran_rates',
        action: 'SET_MEMBER_LEBARAN_RATE',
        record_id: payload.memberId,
        entity_name: 'member_lebaran_rates',
        entity_id: savedRow.id,
        performed_by: resolvedUserId,
        new_data: savedRow,
        notes:
          payload.notes?.trim() ||
          payload.cycleLabel?.trim() ||
          `Penetapan Simpanan Lebaran pribadi Rp ${monthlyRate.toLocaleString('id-ID')} mulai ${effectiveMonth}/${effectiveYear}`,
        created_at: nowIso,
      });
    }
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log penetapan tarif Lebaran anggota:', auditErr);
  }

  const current =
    (cachedMemberLebaranRates !== null
      ? cachedMemberLebaranRates
      : getStoredLocalMemberLebaranRates()) || [];
  const filtered = current.filter(
    (r) =>
      !(
        r.id === savedRow!.id ||
        (r.member_id === savedRow!.member_id &&
          Number(r.effective_year) === Number(savedRow!.effective_year) &&
          Number(r.effective_month) === Number(savedRow!.effective_month))
      )
  );
  saveStoredLocalMemberLebaranRates(sortMemberLebaranRates([...filtered, savedRow]));

  return savedRow;
}

/**
 * Menghapus entri komitmen Simpanan Lebaran personal tertentu berdasarkan ID.
 */
export async function deleteMemberLebaranRate(id: string): Promise<boolean> {
  if (!id) {
    throw new Error('ID ketentuan tarif Lebaran wajib diisi');
  }

  const tableObj: any = supabase.from('member_lebaran_rates');
  if (tableObj && typeof tableObj.delete === 'function') {
    const delQ = tableObj.delete();
    if (delQ && typeof delQ.eq === 'function') {
      const { error } = await delQ.eq('id', id);
      if (error) {
        console.error('Gagal menghapus member_lebaran_rates dari database:', error);
        throw error;
      }
    }
  }

  const current =
    (cachedMemberLebaranRates !== null
      ? cachedMemberLebaranRates
      : getStoredLocalMemberLebaranRates()) || [];
  const updated = current.filter((r) => r.id !== id);
  saveStoredLocalMemberLebaranRates(updated);
  return true;
}

/**
 * Helper top-level resolusi tarif global untuk periode (year, month).
 */
export function getRateForPeriod(
  depositTypeCode: string,
  year: number,
  month: number,
  globalTiers?: SavingsRateTier[],
  depositTypes?: DepositTypeRateRef[]
): number {
  return resolveSavingsMonthlyRate(depositTypeCode, year, month, globalTiers, depositTypes);
}

/**
 * Resolver detail sumber tarif Simpanan Lebaran milik anggota pada periode tertentu.
 * Mendukung carry-forward komitmen personal serta fallback ke tarif global (/admin/pengaturan).
 */
export function resolveMemberLebaranRateInfo(
  memberId: string | null | undefined,
  year: number,
  month: number,
  context?: ResolveMemberSavingsRateContext
): MemberLebaranRateInfo {
  const globalRate = getRateForPeriod('LEBARAN', year, month, context?.globalTiers, context?.depositTypes);
  if (!memberId) {
    return {
      rate: globalRate,
      isPersonal: false,
      matchedPersonal: null,
      globalRate,
    };
  }

  const targetIdx = Number(year) * 12 + Number(month);
  const rawPersonal =
    context?.memberLebaranRates !== undefined
      ? context.memberLebaranRates
      : (cachedMemberLebaranRates ?? getStoredLocalMemberLebaranRates() ?? []);

  const personalRates = sortMemberLebaranRates(
    (rawPersonal || []).filter((r) => r && r.member_id === memberId)
  );

  let matchedPersonal: MemberLebaranRate | null = null;
  for (const rate of personalRates) {
    const startIdx = Number(rate.effective_year) * 12 + Number(rate.effective_month);
    if (startIdx <= targetIdx) {
      matchedPersonal = rate;
    }
  }

  if (matchedPersonal && Number(matchedPersonal.monthly_rate) > 0) {
    return {
      rate: Number(matchedPersonal.monthly_rate),
      isPersonal: true,
      matchedPersonal,
      globalRate,
    };
  }

  return {
    rate: globalRate,
    isPersonal: false,
    matchedPersonal: null,
    globalRate,
  };
}

/**
 * Resolver terpadu tarif iuran simpanan per anggota:
 * 1. Khusus Simpanan Lebaran ('LEBARAN'): cek komitmen pribadi anggota (effective_period <= targetPeriod, carry-forward otomatis).
 * 2. Fallback resmi: Konfigurasi Tarif Iuran Simpanan Bertingkat global (/admin/pengaturan) -> Master deposit_types.
 */
export function resolveMemberSavingsRate(
  memberId: string | null | undefined,
  depositTypeCode: string,
  year: number,
  month: number,
  context?: ResolveMemberSavingsRateContext
): number {
  const code = normalizeDepositTypeCode(depositTypeCode) || String(depositTypeCode || '').trim().toUpperCase();

  if (code === 'LEBARAN' && memberId) {
    const info = resolveMemberLebaranRateInfo(memberId, year, month, context);
    if (info.isPersonal && info.rate > 0) {
      return info.rate;
    }
  }

  return getRateForPeriod(code || depositTypeCode, year, month, context?.globalTiers, context?.depositTypes);
}

/**
 * Membangun helper sinkron resolver tarif dari koleksi tiers, deposit_types, dan tarif Lebaran personal anggota.
 */
export function buildSavingsRateResolver(
  tiers?: SavingsRateTier[],
  depositTypes?: DepositTypeRateRef[],
  memberLebaranRates?: MemberLebaranRate[]
): SavingsRateResolver {
  const resolvedTiers = tiers !== undefined ? tiers : (cachedRateTiers ?? getStoredLocalRateTiers() ?? []);
  const resolvedDepositTypes = depositTypes !== undefined ? depositTypes : (cachedDepositTypes ?? []);
  const resolvedPersonalRates =
    memberLebaranRates !== undefined
      ? memberLebaranRates
      : (cachedMemberLebaranRates ?? getStoredLocalMemberLebaranRates() ?? []);

  return {
    tiers: resolvedTiers,
    depositTypes: resolvedDepositTypes,
    memberLebaranRates: resolvedPersonalRates,
    getRateForPeriod: (depositTypeCode: string, year: number, month: number): number =>
      resolveSavingsMonthlyRate(depositTypeCode, year, month, resolvedTiers, resolvedDepositTypes),
    hasActiveTier: (depositTypeCode: string, year: number, month: number): boolean =>
      hasActiveTierForPeriod(depositTypeCode, year, month, resolvedTiers),
    resolveMemberRate: (
      memberId: string | null | undefined,
      depositTypeCode: string,
      year: number,
      month: number
    ): number =>
      resolveMemberSavingsRate(memberId, depositTypeCode, year, month, {
        globalTiers: resolvedTiers,
        depositTypes: resolvedDepositTypes,
        memberLebaranRates: resolvedPersonalRates,
      }),
  };
}

/**
 * Memuat konfigurasi tarif gabungan dari public.savings_rate_tiers, public.deposit_types, dan public.member_lebaran_rates,
 * lalu mengembalikan resolver sinkron getRateForPeriod, hasActiveTier, dan resolveMemberRate.
 */
export async function loadSavingsRateConfig(
  forceRefresh = false
): Promise<SavingsRateResolver> {
  const [tiers, memberLebaranRates] = await Promise.all([
    getRateTiers(undefined, forceRefresh).catch(() => [] as SavingsRateTier[]),
    getMemberLebaranRates(undefined, forceRefresh).catch(() => [] as MemberLebaranRate[]),
  ]);

  let depositTypes: DepositTypeRateRef[] = [];
  if (!forceRefresh && cachedDepositTypes !== null) {
    depositTypes = cachedDepositTypes;
  } else {
    try {
      const dtTable: any = supabase.from('deposit_types');
      if (dtTable && typeof dtTable.select === 'function') {
        const resp = await dtTable.select('id, code, name, default_amount, is_active');
        if (!resp?.error && Array.isArray(resp?.data)) {
          depositTypes = resp.data.filter(
            (row: any) =>
              row &&
              typeof row === 'object' &&
              ('code' in row || 'name' in row) &&
              !('commitment_amount' in row)
          );
          cachedDepositTypes = depositTypes;
        }
      }
    } catch (err) {
      console.warn('Gagal memuat deposit_types di loadSavingsRateConfig:', err);
    }
    if (cachedDepositTypes === null) {
      cachedDepositTypes = depositTypes;
    }
  }

  return buildSavingsRateResolver(tiers, depositTypes, memberLebaranRates);
}

/**
 * Menghitung nominal tarif yang berlaku untuk jenis simpanan pada periode (tahun, bulan) tertentu.
 * Mendelegasikan langsung ke resolveSavingsMonthlyRate tanpa konstanta fallback hardcoded.
 */
export function getApplicableRate(
  depositTypeCode: string,
  year: number,
  month: number,
  cachedTiers?: SavingsRateTier[],
  depositTypes?: DepositTypeRateRef[]
): number {
  return resolveSavingsMonthlyRate(depositTypeCode, year, month, cachedTiers, depositTypes);
}

/**
 * Helper pembaca tarif dinamis berdasarkan data master tiers, jenis simpanan, tahun, dan bulan.
 * Kompatibel dengan getApplicableRate & resolveSavingsMonthlyRate.
 */
export function getApplicableTierRate(
  tiers: SavingsRateTier[] | undefined,
  depositTypeCode: string,
  year: number,
  month: number,
  depositTypes?: DepositTypeRateRef[]
): number {
  return resolveSavingsMonthlyRate(depositTypeCode, year, month, tiers, depositTypes);
}

/**
 * Mengambil seluruh tier tarif aktif untuk tahun dan bulan tertentu (default: bulan dan tahun berjalan).
 * Prioritas 1: savings_rate_tiers aktif (/admin/pengaturan).
 * Prioritas 2: deposit_types.default_amount (/admin/master-simpan-pinjam).
 */
export async function getActiveSavingsRateTiers(
  year?: number,
  month?: number
): Promise<Record<string, number>> {
  const now = new Date();
  const targetYear = year !== undefined && !isNaN(year) ? year : now.getFullYear();
  const targetMonth = month !== undefined && !isNaN(month) ? month : (now.getMonth() + 1);

  const result: Record<string, number> = {};

  try {
    const { tiers, depositTypes, getRateForPeriod } = await loadSavingsRateConfig();
    const codes = new Set<string>(['POKOK', 'WAJIB', 'BELANJA', 'LEBARAN']);
    for (const t of tiers) {
      if (t.deposit_type_code) {
        codes.add(String(t.deposit_type_code).trim().toUpperCase());
      }
    }
    for (const dt of depositTypes) {
      if (dt.code) {
        codes.add(String(dt.code).trim().toUpperCase());
      }
    }

    for (const code of codes) {
      const rate = getRateForPeriod(code, targetYear, targetMonth);
      if (rate > 0) {
        result[code] = rate;
      }
    }

    // Dukung alias kode standar database ('SP' -> 'POKOK', 'SW' -> 'WAJIB', 'SB' -> 'BELANJA', 'SL' -> 'LEBARAN')
    if (result['POKOK'] !== undefined && result['SP'] === undefined) {
      result['SP'] = result['POKOK'];
    }
    if (result['SP'] !== undefined && result['POKOK'] === undefined) {
      result['POKOK'] = result['SP'];
    }
    if (result['WAJIB'] !== undefined && result['SW'] === undefined) {
      result['SW'] = result['WAJIB'];
    }
    if (result['SW'] !== undefined && result['WAJIB'] === undefined) {
      result['WAJIB'] = result['SW'];
    }
    if (result['BELANJA'] !== undefined && result['SB'] === undefined) {
      result['SB'] = result['BELANJA'];
    }
    if (result['SB'] !== undefined && result['BELANJA'] === undefined) {
      result['BELANJA'] = result['SB'];
    }
    if (result['LEBARAN'] !== undefined && result['SL'] === undefined) {
      result['SL'] = result['LEBARAN'];
    }
    if (result['SL'] !== undefined && result['LEBARAN'] === undefined) {
      result['LEBARAN'] = result['SL'];
    }
  } catch (err) {
    console.warn('Gagal memuat active savings rate tiers:', err);
  }

  return result;
}

/**
 * Mengambil nominal tarif simpanan pokok aktif.
 * 1. Ambil dari savings_rate_tiers aktif (deposit_type_code = 'POKOK' dan end_year IS NULL).
 * 2. Fallback: default_amount dari tabel deposit_types (kode POKOK / SP).
 * 3. Fallback default: Rp 10.000.
 */
export async function getActivePokokTariff(): Promise<number> {
  try {
    // 1. Coba kueri langsung tabel savings_rate_tiers untuk tier aktif (end_year IS NULL)
    try {
      const q: any = supabase.from('savings_rate_tiers');
      if (q && typeof q.select === 'function') {
        const res = await q.select('*');
        const rows = res?.data;
        if (rows && Array.isArray(rows)) {
          const active = rows.find((t: any) => {
            const code = (t.deposit_type_code || '').toUpperCase();
            return (code === 'POKOK' || code === 'SP') && (t.end_year === null || t.end_year === undefined);
          });
          if (active && Number(active.monthly_rate) > 0) {
            return Number(active.monthly_rate);
          }
        }
      }
    } catch {}

    const tiers = await getRateTiers('POKOK').catch(() => []);
    const activeTier = tiers.find(t => 
      (t.deposit_type_code.toUpperCase() === 'POKOK' || t.deposit_type_code.toUpperCase() === 'SP') &&
      (t.end_year === null || t.end_year === undefined)
    );
    if (activeTier && Number(activeTier.monthly_rate) > 0) {
      return Number(activeTier.monthly_rate);
    }

    const { data: dTypes } = await supabase
      .from('deposit_types')
      .select('id, code, name, default_amount');

    if (dTypes && dTypes.length > 0) {
      const match = dTypes.find((dt: any) => {
        const c = (dt.code || '').toUpperCase();
        const n = (dt.name || '').toLowerCase();
        return c === 'POKOK' || c === 'SP' || n.includes('pokok');
      });
      if (match && match.default_amount && Number(match.default_amount) > 0) {
        return Number(match.default_amount);
      }
    }
  } catch (err) {
    console.warn('Gagal memuat active pokok tariff:', err);
  }

  return 10000;
}

// ============================================================================
// EKSPOR & IMPOR MASSAL KOMITMEN TARIF SIMPANAN LEBARAN (1.000+ ANGGOTA)
// ============================================================================

export interface ExportMemberLebaranTemplateResult {
  filename: string;
  totalMembers: number;
  defaultYear: number;
  defaultMonth: number;
  defaultCycleLabel: string;
}

export interface ParsedMemberLebaranRateRow {
  rowNumber: number;
  nrp: string;
  nama: string;
  tarif_saat_ini: number;
  tarif_lebaran_baru: number;
  mulai_bulan: number;
  mulai_tahun: number;
  keterangan_siklus: string;
}

export interface InvalidMemberLebaranRateRow {
  rowNumber: number;
  nrp: string;
  reason: string;
}

export interface ParseMemberLebaranRateResult {
  totalRows: number;
  validRows: ParsedMemberLebaranRateRow[];
  skippedCount: number;
  invalidRows: InvalidMemberLebaranRateRow[];
}

export interface BulkUpsertMemberLebaranResult {
  updatedCount: number;
  notFoundNrps: string[];
}

function resolveDefaultLebaranCyclePeriod(
  cutOffOrDisbursementDate?: string | null,
  fallbackDate: Date = new Date()
): { year: number; month: number; cycleLabel: string } {
  if (cutOffOrDisbursementDate) {
    const match = String(cutOffOrDisbursementDate).trim().match(/^(\d{4})-(\d{1,2})/);
    if (match) {
      const cy = parseInt(match[1], 10);
      const cm = parseInt(match[2], 10);
      if (!isNaN(cy) && !isNaN(cm) && cm >= 1 && cm <= 12) {
        const nextMonth = cm >= 12 ? 1 : cm + 1;
        const nextYear = cm >= 12 ? cy + 1 : cy;
        return {
          year: nextYear,
          month: nextMonth,
          cycleLabel: `Awal Siklus Lebaran ${nextYear}`,
        };
      }
    }
    const parsed = new Date(cutOffOrDisbursementDate);
    if (!isNaN(parsed.getTime())) {
      const cy = parsed.getFullYear();
      const cm = parsed.getMonth() + 1;
      const nextMonth = cm >= 12 ? 1 : cm + 1;
      const nextYear = cm >= 12 ? cy + 1 : cy;
      return {
        year: nextYear,
        month: nextMonth,
        cycleLabel: `Awal Siklus Lebaran ${nextYear}`,
      };
    }
  }

  const fbYear = fallbackDate.getFullYear();
  const fbMonth = fallbackDate.getMonth() + 1;
  return {
    year: fbYear,
    month: fbMonth,
    cycleLabel: `Awal Siklus Lebaran ${fbYear}`,
  };
}

function extractExcelCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const obj = value as any;
    if (obj.richText && Array.isArray(obj.richText)) {
      return obj.richText.map((rt: any) => rt?.text ?? '').join('').trim();
    }
    if ('result' in obj && obj.result !== undefined) {
      return String(obj.result).trim();
    }
    if ('text' in obj && obj.text !== undefined) {
      return String(obj.text).trim();
    }
  }
  return String(value).trim();
}

function parseExcelNumericValue(value: unknown): number {
  if (typeof value === 'number') {
    return isNaN(value) ? NaN : value;
  }
  const raw = extractExcelCellText(value);
  if (!raw) return NaN;
  const cleaned = raw
    .replace(/rp/gi, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const parsed = Number(cleaned);
  return isNaN(parsed) ? NaN : parsed;
}

/**
 * Membangun Workbook Excel template tarif Simpanan Lebaran pre-populated
 * untuk seluruh anggota aktif (tanpa batas 1.000 baris).
 */
export async function buildMemberLebaranRateTemplateWorkbook(): Promise<{
  workbook: ExcelJS.Workbook;
  meta: ExportMemberLebaranTemplateResult;
}> {
  const [members, personalRates, resolver, lastCycle] = await Promise.all([
    fetchAllActiveMembersPaged(),
    getMemberLebaranRates(undefined, true),
    loadSavingsRateConfig(true),
    getLastCompletedLebaranCycle().catch(() => null),
  ]);

  const { year: defaultYear, month: defaultMonth, cycleLabel: defaultCycleLabel } =
    resolveDefaultLebaranCyclePeriod(
      lastCycle?.disbursement_date || lastCycle?.cut_off_date || null
    );

  const filename = `Template_Tarif_Simpanan_Lebaran_${defaultYear}-${String(defaultMonth).padStart(2, '0')}.xlsx`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMKOP';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Tarif Lebaran Anggota');
  const headers = [
    'nrp',
    'nama',
    'pangkat',
    'tarif_saat_ini',
    'tarif_lebaran_baru',
    'mulai_bulan',
    'mulai_tahun',
    'keterangan_siklus',
  ];

  sheet.columns = [
    { header: headers[0], key: 'nrp', width: 18 },
    { header: headers[1], key: 'nama', width: 32 },
    { header: headers[2], key: 'pangkat', width: 18 },
    { header: headers[3], key: 'tarif_saat_ini', width: 18 },
    { header: headers[4], key: 'tarif_lebaran_baru', width: 22 },
    { header: headers[5], key: 'mulai_bulan', width: 14 },
    { header: headers[6], key: 'mulai_tahun', width: 14 },
    { header: headers[7], key: 'keterangan_siklus', width: 30 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F46E5' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  const newRateHeaderCell = headerRow.getCell(5);
  newRateHeaderCell.note =
    'Isi nominal baru jika anggota mengajukan perubahan tarif. Jika dibiarkan kosong, ketentuan terakhir/global tetap digunakan.';

  const context: ResolveMemberSavingsRateContext = {
    globalTiers: resolver.tiers,
    depositTypes: resolver.depositTypes,
    memberLebaranRates: personalRates,
  };

  for (const m of members) {
    const currentRate = resolveMemberSavingsRate(
      m.id,
      'LEBARAN',
      defaultYear,
      defaultMonth,
      context
    );

    const row = sheet.addRow({
      nrp: String(m.nrp ?? ''),
      nama: m.nama || '',
      pangkat: m.pangkat || '-',
      tarif_saat_ini: currentRate,
      tarif_lebaran_baru: '',
      mulai_bulan: defaultMonth,
      mulai_tahun: defaultYear,
      keterangan_siklus: defaultCycleLabel,
    });

    row.getCell(1).numFmt = '@';
    row.getCell(4).numFmt = '#,##0';
    row.getCell(5).numFmt = '#,##0';
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
  }

  // Sheet Petunjuk Pengisian
  const guideSheet = workbook.addWorksheet('Petunjuk Pengisian');
  guideSheet.columns = [
    { header: 'Aturan', key: 'rule', width: 30 },
    { header: 'Keterangan', key: 'desc', width: 80 },
  ];
  guideSheet.getRow(1).font = { bold: true };
  guideSheet.addRow({
    rule: 'tarif_lebaran_baru',
    desc: 'Isi angka nominal baru (tanpa Rp) hanya pada anggota yang mengajukan perubahan. Jika dibiarkan kosong, ketentuan terakhir/global tetap digunakan.',
  });
  guideSheet.addRow({
    rule: 'mulai_bulan & mulai_tahun',
    desc: 'Bulan (1-12) dan Tahun (>= 2020) mulai berlakunya tarif baru. Default otomatis diset 1 bulan setelah siklus pencairan Lebaran terakhir.',
  });
  guideSheet.addRow({
    rule: 'nrp',
    desc: 'Jangan mengubah kolom NRP agar pencocokan anggota saat impor massal tetap akurat.',
  });

  return {
    workbook,
    meta: {
      filename,
      totalMembers: members.length,
      defaultYear,
      defaultMonth,
      defaultCycleLabel,
    },
  };
}

/**
 * Mengekspor dan mengunduh template Excel tarif Simpanan Lebaran untuk seluruh anggota aktif.
 */
export async function exportMemberLebaranRateTemplate(): Promise<ExportMemberLebaranTemplateResult> {
  const { workbook, meta } = await buildMemberLebaranRateTemplateWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = meta.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return meta;
}

/**
 * Membaca dan memvalidasi file Excel (.xlsx / .xls) hasil pengisian template tarif Simpanan Lebaran.
 * Baris dengan tarif_lebaran_baru kosong atau <= 0 dilewati secara aman.
 */
export async function parseMemberLebaranRateExcel(
  fileOrBuffer: File | ArrayBuffer | Uint8Array
): Promise<ParseMemberLebaranRateResult> {
  const workbook = new ExcelJS.Workbook();
  let arrayBuffer: ArrayBuffer;
  if (fileOrBuffer instanceof Uint8Array) {
    arrayBuffer = fileOrBuffer.buffer.slice(
      fileOrBuffer.byteOffset,
      fileOrBuffer.byteOffset + fileOrBuffer.byteLength
    ) as ArrayBuffer;
  } else if (
    typeof (fileOrBuffer as File)?.arrayBuffer === 'function'
  ) {
    arrayBuffer = await (fileOrBuffer as File).arrayBuffer();
  } else {
    arrayBuffer = fileOrBuffer as ArrayBuffer;
  }

  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('File Excel tidak memiliki worksheet yang dapat dibaca.');
  }

  const headerRow = sheet.getRow(1);
  const headerIndexMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = extractExcelCellText(cell.value).toLowerCase().replace(/\s+/g, '_');
    if (key) {
      headerIndexMap[key] = colNumber;
    }
  });

  const requiredHeaders = ['nrp', 'tarif_lebaran_baru', 'mulai_bulan', 'mulai_tahun'];
  const missingHeaders = requiredHeaders.filter((h) => !headerIndexMap[h]);
  if (missingHeaders.length > 0) {
    throw new Error(
      `Format kolom Excel tidak sesuai. Kolom wajib yang hilang: ${missingHeaders.join(', ')}`
    );
  }

  const nrpCol = headerIndexMap['nrp'];
  const namaCol = headerIndexMap['nama'];
  const currentRateCol = headerIndexMap['tarif_saat_ini'];
  const newRateCol = headerIndexMap['tarif_lebaran_baru'];
  const monthCol = headerIndexMap['mulai_bulan'];
  const yearCol = headerIndexMap['mulai_tahun'];
  const labelCol = headerIndexMap['keterangan_siklus'];

  let totalRows = 0;
  let skippedCount = 0;
  const validRows: ParsedMemberLebaranRateRow[] = [];
  const invalidRows: InvalidMemberLebaranRateRow[] = [];

  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const nrp = extractExcelCellText(row.getCell(nrpCol).value);
    const rawNewRateText = extractExcelCellText(row.getCell(newRateCol).value);
    const nama = namaCol ? extractExcelCellText(row.getCell(namaCol).value) : '';

    if (!nrp && !rawNewRateText && !nama) {
      continue;
    }

    totalRows++;

    if (!nrp) {
      invalidRows.push({
        rowNumber: rowNum,
        nrp: '-',
        reason: 'NRP kosong',
      });
      continue;
    }

    if (!rawNewRateText) {
      skippedCount++;
      continue;
    }

    const parsedNewRate = parseExcelNumericValue(row.getCell(newRateCol).value);
    if (isNaN(parsedNewRate)) {
      invalidRows.push({
        rowNumber: rowNum,
        nrp,
        reason: `Nominal tarif_lebaran_baru tidak valid ("${rawNewRateText}")`,
      });
      continue;
    }

    if (parsedNewRate <= 0) {
      skippedCount++;
      continue;
    }

    const parsedMonth = parseExcelNumericValue(row.getCell(monthCol).value);
    const parsedYear = parseExcelNumericValue(row.getCell(yearCol).value);

    if (
      isNaN(parsedMonth) ||
      !Number.isInteger(parsedMonth) ||
      parsedMonth < 1 ||
      parsedMonth > 12
    ) {
      invalidRows.push({
        rowNumber: rowNum,
        nrp,
        reason: `mulai_bulan harus angka 1–12 (terbaca: "${extractExcelCellText(row.getCell(monthCol).value)}")`,
      });
      continue;
    }

    if (isNaN(parsedYear) || !Number.isInteger(parsedYear) || parsedYear < 2020) {
      invalidRows.push({
        rowNumber: rowNum,
        nrp,
        reason: `mulai_tahun harus angka >= 2020 (terbaca: "${extractExcelCellText(row.getCell(yearCol).value)}")`,
      });
      continue;
    }

    const currentRate = currentRateCol
      ? parseExcelNumericValue(row.getCell(currentRateCol).value)
      : 0;
    const cycleLabel = labelCol ? extractExcelCellText(row.getCell(labelCol).value) : '';

    validRows.push({
      rowNumber: rowNum,
      nrp,
      nama,
      tarif_saat_ini: isNaN(currentRate) ? 0 : currentRate,
      tarif_lebaran_baru: parsedNewRate,
      mulai_bulan: parsedMonth,
      mulai_tahun: parsedYear,
      keterangan_siklus: cycleLabel,
    });
  }

  return {
    totalRows,
    validRows,
    skippedCount,
    invalidRows,
  };
}

/**
 * Menyimpan perubahan tarif Simpanan Lebaran massal ke public.member_lebaran_rates
 * secara bertahap (CHUNK_SIZE = 100 baris per permintaan) agar aman untuk 1.000+ anggota.
 */
export async function bulkUpsertMemberLebaranRatesChunked(
  rows: ParsedMemberLebaranRateRow[],
  userId?: string | null,
  onProgress?: (processed: number, total: number) => void
): Promise<BulkUpsertMemberLebaranResult> {
  const activeMembers = await fetchAllActiveMembersPaged();
  const memberByNrp = new Map<string, ActiveMemberRateTarget>();
  for (const m of activeMembers) {
    const key = String(m.nrp || '').trim();
    if (key) {
      memberByNrp.set(key, m);
    }
  }

  let resolvedUserId = userId || null;
  if (!resolvedUserId) {
    try {
      const authApi = (supabase as any)?.auth;
      if (authApi && typeof authApi.getUser === 'function') {
        const { data: authData } = await authApi.getUser();
        resolvedUserId = authData?.user?.id || null;
      }
    } catch {
      // Abaikan jika auth context tidak tersedia
    }
  }

  const nowIso = new Date().toISOString();
  const notFoundNrps: string[] = [];
  const dedupedPayloads = new Map<string, Record<string, any>>();

  for (const row of rows) {
    const nrpKey = String(row.nrp || '').trim();
    const member = memberByNrp.get(nrpKey);
    if (!member) {
      notFoundNrps.push(nrpKey);
      continue;
    }

    const dedupKey = `${member.id}__${row.mulai_tahun}__${row.mulai_bulan}`;
    dedupedPayloads.set(dedupKey, {
      member_id: member.id,
      effective_year: row.mulai_tahun,
      effective_month: row.mulai_bulan,
      monthly_rate: row.tarif_lebaran_baru,
      cycle_label: row.keterangan_siklus || null,
      notes: row.keterangan_siklus || 'Impor Massal Tarif Lebaran',
      created_by: resolvedUserId,
      updated_at: nowIso,
    });
  }

  const payloads = Array.from(dedupedPayloads.values());
  const CHUNK_SIZE = 100;
  let processed = 0;

  if (payloads.length > 0) {
    for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
      const batch = payloads.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('member_lebaran_rates')
        .upsert(batch, { onConflict: 'member_id,effective_year,effective_month' });

      if (error) {
        throw new Error(
          `Gagal menyimpan batch baris ${i + 1} - ${i + batch.length}: ${error.message}`
        );
      }

      processed += batch.length;
      onProgress?.(processed, payloads.length);
    }

    try {
      const auditTable: any = supabase.from('audit_logs');
      if (auditTable && typeof auditTable.insert === 'function') {
        await auditTable.insert({
          table_name: 'member_lebaran_rates',
          action: 'BULK_IMPORT_LEBARAN_RATES',
          record_id: 'BATCH',
          entity_name: 'member_lebaran_rates',
          entity_id: 'BATCH',
          performed_by: resolvedUserId,
          notes: `Impor massal tarif Simpanan Lebaran untuk ${payloads.length} anggota (${notFoundNrps.length} NRP tidak ditemukan)`,
          created_at: nowIso,
        });
      }
    } catch (auditErr) {
      console.warn('Gagal mencatat audit log impor massal tarif Lebaran:', auditErr);
    }

    // Segarkan cache member_lebaran_rates agar seluruh resolver langsung memakai data terbaru
    await getMemberLebaranRates(undefined, true).catch(() => []);
  }

  return {
    updatedCount: payloads.length,
    notFoundNrps,
  };
}




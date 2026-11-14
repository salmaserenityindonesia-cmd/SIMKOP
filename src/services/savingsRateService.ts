import { supabase } from '../lib/supabaseClient';

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

export interface SavingsRateResolver {
  tiers: SavingsRateTier[];
  depositTypes: DepositTypeRateRef[];
  getRateForPeriod: (depositTypeCode: string, year: number, month: number) => number;
  hasActiveTier: (depositTypeCode: string, year: number, month: number) => boolean;
}

export const DEFAULT_RATE_TIERS: SavingsRateTier[] = [];
export const DEFAULT_TIERS: SavingsRateTier[] = DEFAULT_RATE_TIERS;

export const SAVINGS_RATE_TIERS_STORAGE_KEY = 'simkop_savings_rate_tiers';

let cachedRateTiers: SavingsRateTier[] | null = null;
let cachedDepositTypes: DepositTypeRateRef[] | null = null;

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

export function clearTierCache(): void {
  cachedRateTiers = null;
  cachedDepositTypes = null;
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(SAVINGS_RATE_TIERS_STORAGE_KEY);
    } catch {}
  }
}

export function setCachedDepositTypes(depositTypes: DepositTypeRateRef[] | null): void {
  cachedDepositTypes = depositTypes ? [...depositTypes] : null;
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
 * Membangun helper sinkron resolver tarif dari koleksi tiers dan deposit_types.
 */
export function buildSavingsRateResolver(
  tiers?: SavingsRateTier[],
  depositTypes?: DepositTypeRateRef[]
): SavingsRateResolver {
  const resolvedTiers = tiers !== undefined ? tiers : (cachedRateTiers ?? getStoredLocalRateTiers() ?? []);
  const resolvedDepositTypes = depositTypes !== undefined ? depositTypes : (cachedDepositTypes ?? []);

  return {
    tiers: resolvedTiers,
    depositTypes: resolvedDepositTypes,
    getRateForPeriod: (depositTypeCode: string, year: number, month: number): number =>
      resolveSavingsMonthlyRate(depositTypeCode, year, month, resolvedTiers, resolvedDepositTypes),
    hasActiveTier: (depositTypeCode: string, year: number, month: number): boolean =>
      hasActiveTierForPeriod(depositTypeCode, year, month, resolvedTiers),
  };
}

/**
 * Memuat konfigurasi tarif gabungan dari public.savings_rate_tiers dan public.deposit_types,
 * lalu mengembalikan resolver sinkron getRateForPeriod & hasActiveTier.
 */
export async function loadSavingsRateConfig(
  forceRefresh = false
): Promise<SavingsRateResolver> {
  const tiers = await getRateTiers(undefined, forceRefresh).catch(() => [] as SavingsRateTier[]);

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

  return buildSavingsRateResolver(tiers, depositTypes);
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




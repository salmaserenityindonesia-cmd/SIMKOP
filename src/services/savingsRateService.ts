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

export const DEFAULT_RATE_TIERS: SavingsRateTier[] = [
  {
    id: 'seed-pokok-tier-1',
    deposit_type_code: 'POKOK',
    start_year: 2024,
    start_month: 1,
    end_year: null,
    end_month: null,
    monthly_rate: 100000,
    notes: 'Tarif Simpanan Pokok Standar (Rp 100.000)',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'seed-wajib-tier-1',
    deposit_type_code: 'WAJIB',
    start_year: 2024,
    start_month: 1,
    end_year: 2025,
    end_month: 10,
    monthly_rate: 150000,
    notes: 'Tarif Simpanan Wajib Lama (Rp 150.000)',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'seed-wajib-tier-2',
    deposit_type_code: 'WAJIB',
    start_year: 2025,
    start_month: 11,
    end_year: null,
    end_month: null,
    monthly_rate: 200000,
    notes: 'Tarif Simpanan Wajib Baru (Rp 200.000)',
    created_at: '2025-11-01T00:00:00.000Z',
    updated_at: '2025-11-01T00:00:00.000Z'
  },
  {
    id: 'seed-belanja-tier-1',
    deposit_type_code: 'BELANJA',
    start_year: 2024,
    start_month: 1,
    end_year: null,
    end_month: null,
    monthly_rate: 25000,
    notes: 'Tarif Simpanan Belanja Standar (Rp 25.000)',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'seed-lebaran-tier-1',
    deposit_type_code: 'LEBARAN',
    start_year: 2024,
    start_month: 1,
    end_year: null,
    end_month: null,
    monthly_rate: 50000,
    notes: 'Tarif Simpanan Hari Raya/Lebaran Standar (Rp 50.000)',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z'
  }
];

export const SAVINGS_RATE_TIERS_STORAGE_KEY = 'simkop_savings_rate_tiers';

let cachedRateTiers: SavingsRateTier[] | null = null;

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
    let query = supabase.from('savings_rate_tiers')
      .select('*')
      .order('start_year', { ascending: true })
      .order('start_month', { ascending: true });

    if (normalizedCode) {
      query = query.eq('deposit_type_code', normalizedCode);
    }

    const { data, error } = await query;
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

    const result = data || [];
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
 * Menghitung nominal tarif yang berlaku untuk jenis simpanan pada periode (tahun, bulan) tertentu.
 * Menggunakan fallback cerdas:
 * - Jika ada tier dalam database/cache, cari rentang yang sesuai.
 * - Jika sebelum rentang tier terlama, gunakan tarif terlama.
 * - Jika setelah rentang tier terbaru, gunakan tarif terbaru.
 * - Fallback default jika tidak ada tier:
 *   - WAJIB: 150.000 jika <= Okt 2025, 200.000 jika >= Nov 2025.
 *   - BELANJA: 25.000
 *   - LEBARAN: 50.000
 */
export function getApplicableRate(
  depositTypeCode: string,
  year: number,
  month: number,
  cachedTiers?: SavingsRateTier[]
): number {
  const code = (depositTypeCode || '').toUpperCase();
  const targetPeriodIndex = year * 12 + month;

  // Sediakan fallback acuan awal
  const getHardcodedFallback = () => {
    if (code === 'POKOK' || code === 'SP') {
      return 100000;
    }
    if (code === 'WAJIB') {
      return (year < 2025 || (year === 2025 && month <= 10)) ? 150000 : 200000;
    }
    if (code === 'BELANJA') {
      return 25000;
    }
    if (code === 'LEBARAN') {
      return 50000;
    }
    return 0;
  };

  const pool = cachedTiers || (cachedRateTiers !== null ? cachedRateTiers : getStoredLocalRateTiers()) || [];
  const matchingTiers = sortRateTiers(pool.filter(t => {
    const tCode = t.deposit_type_code.toUpperCase();
    return tCode === code ||
      (code === 'SP' && tCode === 'POKOK') ||
      (code === 'POKOK' && tCode === 'SP') ||
      (code === 'SW' && tCode === 'WAJIB') ||
      (code === 'WAJIB' && tCode === 'SW') ||
      (code === 'SB' && tCode === 'BELANJA') ||
      (code === 'BELANJA' && tCode === 'SB') ||
      (code === 'SL' && tCode === 'LEBARAN') ||
      (code === 'LEBARAN' && tCode === 'SL');
  }));

  if (matchingTiers.length === 0) {
    return getHardcodedFallback();
  }

  // 1. Cek kecocokan tepat di dalam rentang
  for (const tier of matchingTiers) {
    const startIdx = tier.start_year * 12 + tier.start_month;
    const endIdx = tier.end_year !== null && tier.end_year !== undefined && tier.end_month !== null && tier.end_month !== undefined
      ? tier.end_year * 12 + tier.end_month
      : Infinity;

    if (targetPeriodIndex >= startIdx && targetPeriodIndex <= endIdx) {
      return tier.monthly_rate;
    }
  }

  // 2. Jika di bawah rentang tier terlama, gunakan tarif tier terlama
  const lowestTier = matchingTiers[0];
  const lowestIdx = lowestTier.start_year * 12 + lowestTier.start_month;
  if (targetPeriodIndex < lowestIdx) {
    return lowestTier.monthly_rate;
  }

  // 3. Jika di atas rentang tier terbaru, gunakan tarif tier terbaru
  const highestTier = matchingTiers[matchingTiers.length - 1];
  return highestTier.monthly_rate;
}

/**
 * Helper pembaca tarif dinamis berdasarkan data master tiers, jenis simpanan, tahun, dan bulan.
 * Kompatibel dengan getApplicableRate.
 */
export function getApplicableTierRate(
  tiers: SavingsRateTier[] | undefined,
  depositTypeCode: string,
  year: number,
  month: number
): number {
  return getApplicableRate(depositTypeCode, year, month, tiers);
}

/**
 * Mengambil seluruh tier tarif aktif untuk tahun dan bulan tertentu (default: bulan dan tahun berjalan).
 * Mengembalikan mapping objek dictionary Record<string, number> (contoh: { WAJIB: 200000, BELANJA: 25000, LEBARAN: 50000, SW: 200000, ... })
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
    const tiers = await getRateTiers();
    const codes = new Set<string>(['POKOK', 'WAJIB', 'BELANJA', 'LEBARAN']);
    for (const t of tiers) {
      if (t.deposit_type_code) {
        codes.add(t.deposit_type_code.toUpperCase());
      }
    }

    for (const code of codes) {
      const rate = getApplicableRate(code, targetYear, targetMonth, tiers);
      if (rate > 0) {
        result[code] = rate;
      }
    }

    // Dukung alias kode standar database ('SP' -> 'POKOK', 'SW' -> 'WAJIB', 'SB' -> 'BELANJA', 'SL' -> 'LEBARAN')
    if (result['POKOK'] !== undefined && result['SP'] === undefined) {
      result['SP'] = result['POKOK'];
    }
    if (result['WAJIB'] !== undefined && result['SW'] === undefined) {
      result['SW'] = result['WAJIB'];
    }
    if (result['BELANJA'] !== undefined && result['SB'] === undefined) {
      result['SB'] = result['BELANJA'];
    }
    if (result['LEBARAN'] !== undefined && result['SL'] === undefined) {
      result['SL'] = result['LEBARAN'];
    }
  } catch (err) {
    console.warn('Gagal memuat active savings rate tiers:', err);
    // Fallback default aman jika offline atau ada error
    const pRate = getApplicableRate('POKOK', targetYear, targetMonth);
    const wRate = getApplicableRate('WAJIB', targetYear, targetMonth);
    const bRate = getApplicableRate('BELANJA', targetYear, targetMonth);
    const lRate = getApplicableRate('LEBARAN', targetYear, targetMonth);
    result['POKOK'] = pRate;
    result['SP'] = pRate;
    result['WAJIB'] = wRate;
    result['SW'] = wRate;
    result['BELANJA'] = bRate;
    result['SB'] = bRate;
    result['LEBARAN'] = lRate;
    result['SL'] = lRate;
  }

  return result;
}



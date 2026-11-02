---
phase: 50
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 50.1: Database Migration for Savings Rate Tiers & Service Layer with Anti-Overlap Resolver

## Objective
Mengimplementasikan skema database tabel master tarif bertingkat `savings_rate_tiers` lengkap dengan migrasi SQL dan seed tarif historis, serta modul layanan `savingsRateService.ts` yang menangani operasi CRUD tarif, proteksi otomatis pemotongan rentang tanggal anti-overlap, dan resolver `getApplicableRate` untuk mengembalikan tarif aktif simpanan per periode (bulan/tahun) dengan fallback cerdas.

## Context
- `supabase/migrations/031_create_savings_rate_tiers.sql`
- `src/services/savingsRateService.ts`
- `src/services/savingsRateService.test.ts`
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Create savings_rate_tiers Table and Seed Historical Rates Migration</name>
  <files>
    supabase/migrations/031_create_savings_rate_tiers.sql
  </files>
  <action>
    1. Buat berkas migrasi `supabase/migrations/031_create_savings_rate_tiers.sql`. (Catatan: nomor migrasi 031 digunakan karena 029 dan 030 telah digunakan oleh profil koperasi dan reset data).
    2. Definisikan tabel `public.savings_rate_tiers`:
       ```sql
       CREATE TABLE IF NOT EXISTS public.savings_rate_tiers (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         deposit_type_code text NOT NULL, -- 'WAJIB', 'BELANJA', 'LEBARAN'
         start_year integer NOT NULL,
         start_month integer NOT NULL CHECK (start_month >= 1 AND start_month <= 12),
         end_year integer,
         end_month integer CHECK (end_month IS NULL OR (end_month >= 1 AND end_month <= 12)),
         monthly_rate numeric NOT NULL CHECK (monthly_rate > 0),
         notes text,
         created_at timestamp with time zone NOT NULL DEFAULT now(),
         updated_at timestamp with time zone NOT NULL DEFAULT now()
       );

       ALTER TABLE public.savings_rate_tiers ENABLE ROW LEVEL SECURITY;
       CREATE POLICY "Allow public read on savings_rate_tiers"
         ON public.savings_rate_tiers FOR SELECT USING (true);
       CREATE POLICY "Allow authenticated manage on savings_rate_tiers"
         ON public.savings_rate_tiers FOR ALL
         USING (auth.role() = 'authenticated')
         WITH CHECK (auth.role() = 'authenticated');

       -- Seed data awal riwayat Simpanan Wajib
       INSERT INTO public.savings_rate_tiers (deposit_type_code, start_year, start_month, end_year, end_month, monthly_rate, notes)
       VALUES 
         ('WAJIB', 2024, 1, 2025, 10, 150000, 'Tarif Simpanan Wajib Lama (Rp 150.000)'),
         ('WAJIB', 2025, 11, NULL, NULL, 200000, 'Tarif Simpanan Wajib Baru (Rp 200.000)')
       ON CONFLICT DO NOTHING;
       ```
    3. Pastikan indeks pencarian untuk efisiensi kueri `CREATE INDEX IF NOT EXISTS idx_savings_rate_tiers_lookup ON public.savings_rate_tiers (deposit_type_code, start_year, start_month);`.
  </action>
  <verify>
    Periksa sintaks SQL migrasi pada `supabase/migrations/031_create_savings_rate_tiers.sql` valid dan memenuhi spesifikasi tabel.
  </verify>
  <done>
    Skema database `savings_rate_tiers` siap digunakan dengan seed data awal.
  </done>
</task>

<task type="auto">
  <name>Implement savingsRateService.ts with Anti-Overlap Resolver and Unit Tests</name>
  <files>
    src/services/savingsRateService.ts
    src/services/savingsRateService.test.ts
  </files>
  <action>
    1. Buat berkas `src/services/savingsRateService.ts`:
       - Interface:
         ```ts
         export interface SavingsRateTier {
           id: string;
           deposit_type_code: string; // 'WAJIB' | 'BELANJA' | 'LEBARAN'
           start_year: number;
           start_month: number;
           end_year: number | null;
           end_month: number | null;
           monthly_rate: number;
           notes?: string | null;
           created_at?: string;
           updated_at?: string;
         }
         ```
       - Sediakan state in-memory / localStorage fallback jika tabel belum dibuat di schema Supabase (pola graceful fallback SIMKOP).
       - `getRateTiers(depositTypeCode?: string): Promise<SavingsRateTier[]>`:
         Ambil daftar tier terurut `start_year ASC, start_month ASC`.
       - `addRateTier(payload)`:
         Validasi anti-overlap:
         Jika menambahkan tier baru dengan `end_year === null` (atau rentang baru):
         Cari tier terbuka lama untuk jenis simpanan yang sama yang `end_year IS NULL`.
         Otomatis potong tier terbuka lama tersebut menjadi 1 bulan sebelum `start_year` & `start_month` dari tier baru.
         Contoh: jika baru mulai `2025-11`, maka tier lama diakhiri pada `end_year = 2025, end_month = 10`.
         Simpan tier baru ke Supabase (atau fallback).
       - `deleteRateTier(id: string): Promise<boolean>`:
         Hapus baris tier dari Supabase / state lokal.
       - `getApplicableRate(depositTypeCode: string, year: number, month: number, cachedTiers?: SavingsRateTier[]): number`:
         Hitung nilai `monthly_rate` aktif pada bulan & tahun tersebut.
         Aturan fallback:
         - Jika di bawah rentang tier terlama, gunakan tarif tier terlama.
         - Jika di atas rentang tier terbaru, gunakan tarif tier terbaru.
         - Nilai acuan default awal:
           - WAJIB: 150.000 jika <= 2025-10, 200.000 jika >= 2025-11.
           - BELANJA: 25.000 (atau default tier).
           - LEBARAN: 50.000 (atau default tier).
    2. Buat berkas unit test `src/services/savingsRateService.test.ts`:
       - Uji fungsi `getApplicableRate` untuk Simpanan Wajib pada Okt 2025 (menghasilkan 150000) dan Nov 2025 (menghasilkan 200000).
       - Uji logika anti-overlap saat menambahkan tarif baru yang open-ended (`end_year = null`), memastikan tarif sebelumnya otomatis ditutup 1 bulan sebelumnya.
       - Uji fallback ketika kueri database gagal atau offline.
  </action>
  <verify>
    Jalankan unit test: `npx vitest run src/services/savingsRateService.test.ts`.
  </verify>
  <done>
    Semua fungsi `savingsRateService` terimplementasi dan seluruh unit test lulus 100%.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Berkas migrasi `supabase/migrations/031_create_savings_rate_tiers.sql` terbuat dan sintaks SQL valid.
- [ ] `savingsRateService.ts` mengekspor fungsi `getRateTiers`, `addRateTier`, `deleteRateTier`, dan `getApplicableRate`.
- [ ] `getApplicableRate('WAJIB', 2025, 10)` menghasilkan `150000` dan `getApplicableRate('WAJIB', 2025, 11)` menghasilkan `200000`.
- [ ] Logika anti-overlap memotong tier sebelumnya dengan tepat tanpa celah bulan.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Unit tests di `savingsRateService.test.ts` lulus 100%
- [ ] No regressions in tests


# Phase 50 Plan 1 Summary: Wave 1 - Database Migration for Savings Rate Tiers & Service Layer with Anti-Overlap Resolver

## Objective
Mengimplementasikan skema database tabel master tarif bertingkat `savings_rate_tiers` lengkap dengan migrasi SQL dan seed tarif historis, serta modul layanan `savingsRateService.ts` yang menangani operasi CRUD tarif, proteksi otomatis pemotongan rentang tanggal anti-overlap, dan resolver `getApplicableRate` untuk mengembalikan tarif aktif simpanan per periode (bulan/tahun) dengan fallback cerdas.

## Changes
- **Database Migration (`supabase/migrations/031_create_savings_rate_tiers.sql`)**:
  - Mendefinisikan tabel `public.savings_rate_tiers` dengan kolom: `id` (uuid), `deposit_type_code` (text), `start_year` (int), `start_month` (int, check 1-12), `end_year` (int, nullable), `end_month` (int, nullable, check 1-12), `monthly_rate` (numeric, check > 0), `notes` (text), `created_at`, `updated_at`.
  - Mengaktifkan Row Level Security (RLS) dengan kebijakan read public dan manage authenticated/anon.
  - Membuat indeks komposit `idx_savings_rate_tiers_lookup` pada `(deposit_type_code, start_year, start_month)`.
  - Menambahkan data awal (seed data) riwayat tarif Simpanan Wajib (Rp 150.000 s/d Okt 2025, Rp 200.000 mulai Nov 2025), Belanja (Rp 25.000), dan Lebaran (Rp 50.000).
- **Service Layer (`src/services/savingsRateService.ts`)**:
  - `SavingsRateTier` interface & data types.
  - Sedia in-memory cache dan fallback localStorage (`simkop_savings_rate_tiers`) untuk toleransi kegagalan jaringan atau offline dev.
  - `getRateTiers(depositTypeCode?, forceRefresh?)`: Mengambil daftar tarif simpanan terurut kronologis secara menaik.
  - `addRateTier(payload)`: Dilengkapi proteksi anti-overlap yang memotong `end_year` dan `end_month` tarif terbuka sebelumnya tepat 1 bulan sebelum `start_year` dan `start_month` tarif baru (termasuk pergantian tahun dari Januari ke Desember tahun sebelumnya).
  - `deleteRateTier(id)`: Menghapus baris tarif dari Supabase dan memperbarui state lokal/cache.
  - `getApplicableRate(depositTypeCode, year, month, cachedTiers?)`: Menghitung tarif yang berlaku secara akurat berdasarkan rentang aktif, dengan fallback ke tarif terlama jika sebelum batas bawah, tarif terbaru jika setelah batas atas, serta acuan default (Wajib: 150rb s/d Okt 2025, 200rb mulai Nov 2025; Belanja: 25rb; Lebaran: 50rb).
- **Unit Testing (`src/services/savingsRateService.test.ts`)**:
  - 15 unit test komprehensif menguji `getPreviousMonth`, `getApplicableRate` (wajib lama/baru, future, past, belanja, lebaran, fallback kosong), `getRateTiers` (query DB, network error fallback, filtering), `addRateTier` (pemotongan anti-overlap antar bulan dan antar tahun), dan `deleteRateTier`.

## Verification
- **Unit Test Suite**: `npx vitest run src/services/savingsRateService.test.ts` (15/15 passed).
- **TypeScript Typecheck**: `npm run typecheck` (0 errors).

## Commits
- `ba3f9872`: `feat(phase-50): create savings_rate_tiers table and seed historical rates migration`
- `602f8243`: `feat(phase-50): implement savingsRateService with anti-overlap resolver and unit tests`

## Success Criteria Status
- [x] Berkas migrasi `supabase/migrations/031_create_savings_rate_tiers.sql` terbuat dan sintaks SQL valid.
- [x] `savingsRateService.ts` mengekspor fungsi `getRateTiers`, `addRateTier`, `deleteRateTier`, dan `getApplicableRate`.
- [x] `getApplicableRate('WAJIB', 2025, 10)` menghasilkan `150000` dan `getApplicableRate('WAJIB', 2025, 11)` menghasilkan `200000`.
- [x] Logika anti-overlap memotong tier sebelumnya dengan tepat tanpa celah bulan.
- [x] Unit tests di `savingsRateService.test.ts` lulus 100% (15/15 tests passed).

# Phase 21 Summary: Resolusi Error Schema Cache koperasi_profile & Migrasi Tabel Profil Koperasi

## Overview
Menyelesaikan kendala galat PostgREST "Could not find the table 'public.koperasi_profile' in the schema cache" ketika admin menyimpan konfigurasi di `/admin/pengaturan`. Solusi menyediakan berkas migrasi database DDL yang bersih dan idempotent, serta service layer yang resilient dengan offline/localStorage fallback.

## Key Changes
1. **Database Migration Script**:
   - `supabase/migrations/017_create_koperasi_profile.sql`: Tabel `koperasi_profile` dengan single-row constraint (`id = 1`), RLS terpadu (`Allow public read`, `Allow authenticated insert/update`), dan data awal default *KOPERASI PRIMKOPPOL* Ngawi.
2. **Resilient Service Layer (`src/services/settingsService.ts`)**:
   - Menambahkan safe accessors `getStorage()`, `getStoredLocalProfile()`, `saveStoredLocalProfile()`.
   - `getKoperasiProfile()`: Mendukung pembacaan bertingkat (Cache in-memory -> Supabase -> localStorage -> DEFAULT_KOPERASI_PROFILE).
   - `updateKoperasiProfile()`: Selalu menyimpan ke `localStorage` secara instan sebelum melakukan query ke Supabase. Jika Supabase mengembalikan galat `schema cache` atau tabel belum ada (`PGRST205`/`42P01`), fungsi menangkapnya dengan anggun dan mengembalikan flag `isLocalFallback: true` tanpa melempar crash unhandled exception.
   - Fungsi `isTableMigratedInSupabase()`: Memeriksa ketersediaan tabel di backend Supabase.
3. **Admin UI Feedback (`src/pages/admin/PengaturanKoperasi.tsx`)**:
   - Mendeteksi ketersediaan tabel Supabase saat inisialisasi maupun setelah submit.
   - Menampilkan banner edukatif ramah admin ketika dalam mode penyimpanan lokal yang menginstruksikan eksekusi berkas migrasi `017_create_koperasi_profile.sql` di Supabase SQL Editor.
   - Mengubah toast feedback sesuai mode: hijau untuk tersimpan ke cloud, kuning/warning untuk tersimpan lokal.
4. **Unit Test & Verification**:
   - `src/services/settingsService.test.ts`: 6 test cases komprehensif menguji skenario default fallback, local storage fallback saat schema cache error, sync cloud to local, dan deteksi migrasi.
   - 20/20 unit tests lulus (100%).
   - `npm run build` sukses tanpa galat tipe TypeScript.

## Verification Proof
- `npx vitest run`: 5 test files, 20 tests passing.
- `npm run build`: Vite build sukses (exit code 0).


# Plan 82.1 Summary: Persistence Layer & Database Migration for Dynamic Minimum THP Setting

## Objective
Membangun lapisan persistensi parameter ambang batas minimum sisa THP (Take Home Pay) dan catatan keputusan RAT pada database Supabase serta antarmuka layanan `settingsService` dan `loanService` dengan fallback multi-tier (Supabase → LocalStorage → Default Constants Rp 1.500.000).

## Tasks Completed
| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Create Supabase Migration for Minimum THP | `eafe3835` | Completed |
| 2 | Implement Dynamic Loan Settings in settingsService and loanService | `ee4d7a80` | Completed |

## Implementation Details
1. **Database Migration (`supabase/migrations/045_add_min_remaining_thp_to_koperasi_profile.sql`)**:
   - Menambahkan kolom `min_remaining_thp numeric NOT NULL DEFAULT 1500000`.
   - Menambahkan kolom `min_thp_rat_notes text DEFAULT 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000'`.
   - Migrasi idempotent dengan `ADD COLUMN IF NOT EXISTS` dan update nilai baris profil koperasi default (id = 1).

2. **Domain Service Settings (`src/services/settingsService.ts`)**:
   - Memperluas antarmuka `KoperasiProfile` dengan properti opsional `min_remaining_thp` dan `min_thp_rat_notes`.
   - Menambahkan konstanta `DEFAULT_MIN_REMAINING_THP = 1500000` dan `DEFAULT_RAT_NOTES = 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000'`.
   - Mendefinisikan antarmuka `LoanSettings`:
     ```typescript
     export interface LoanSettings {
       minRemainingThp: number;
       ratNotes?: string;
     }
     ```
   - Mengimplementasikan `getLoanSettings(forceRefresh?: boolean)` dengan parsing numerik dan sanitasi nilai non-positif/invalid ke default 1.500.000.
   - Mengimplementasikan `updateLoanSettings(payload: LoanSettings)` yang menyinkronkan data ke Supabase dan localStorage backup.

3. **Loan Service Integration (`src/services/loanService.ts`)**:
   - Mengekspor helper `getLoanSettings`, `updateLoanSettings`, konstanta default, dan tipe `LoanSettings` dari `loanService` serta menyematkannya ke objek `loanService`.

4. **Unit Testing (`src/services/settingsService.test.ts`)**:
   - Menambahkan rangkaian pengujian `LoanSettings dynamic threshold` yang mencakup:
     - Default settings saat database dan localStorage kosong.
     - Pengambilan nilai dari Supabase database.
     - Fallback ke 1.500.000 jika nilai database 0 atau negatif.
     - Fallback ke localStorage saat koneksi Supabase bermasalah.
     - Pembaruan via Supabase dan sinkronisasi ke in-memory cache serta localStorage.
     - Penanganan kesalahan schema cache secara aman.
     - Ketersediaan fungsi via re-export `loanService`.

## Verification Proof
- `npx vitest run src/services/settingsService.test.ts`: 15 passed (15 tests)
- `npx vitest run src/services/loanService.test.ts`: 36 passed (36 tests)
- `npx tsc --noEmit`: 0 error (exit code 0)

## Deviations
None.

## Next Steps
Lanjut ke `82-2-PLAN.md`: Menambahkan kotak konfigurasi batas minimum sisa THP dan catatan RAT pada halaman pengaturan koperasi (`/admin/pengaturan`).

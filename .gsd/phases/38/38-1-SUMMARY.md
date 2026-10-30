# Plan 38.1 Summary: Skema Database & Service Layer Ukuran Kertas Thermal (58mm vs 80mm)

## Objective
Menyediakan dukungan skema database PostgreSQL dan service layer untuk menyimpan preferensi ukuran kertas printer thermal kasir (`receipt_paper_size`: `'58mm' | '80mm'`, default `'80mm'`). Menyinkronkan nilai ini secara reaktif antara Supabase `pos_settings` dan `localStorage` serta melindunginya dengan pengujian unit otomatis.

## Execution Details
- **Task 1**: Create Migration 028 and Update posSettingsService
  - **Files Created**: `supabase/migrations/028_add_receipt_paper_size_to_pos_settings.sql`
  - **Files Modified**: `src/services/posSettingsService.ts`
  - **Commit**: `92e60039` - `feat(phase-38): add migration 028 and receipt_paper_size to posSettingsService`
- **Task 2**: Add Unit Tests for receipt_paper_size in posSettingsService
  - **Files Modified**: `src/services/posSettingsService.test.ts`
  - **Commit**: `ce2fbf7a` - `test(phase-38): add unit tests for receipt_paper_size in posSettingsService`

### Changes Made
1. **Database Migration (`028_add_receipt_paper_size_to_pos_settings.sql`)**:
   - Menambahkan kolom `receipt_paper_size text NOT NULL DEFAULT '80mm'` dengan constraint check `CHECK (receipt_paper_size IN ('58mm', '80mm'))` pada tabel `public.pos_settings`.
   - Menambahkan komentar deskriptif kolom untuk dokumentasi skema database Supabase.
2. **POS Settings Service (`src/services/posSettingsService.ts`)**:
   - `POSSettings` interface: Ditambahkan properti opsional `receipt_paper_size?: '58mm' | '80mm'`.
   - `DEFAULT_POS_SETTINGS`: Ditambahkan default `receipt_paper_size: '80mm'`.
   - `getStoredLocalSettings()`: Parsing dan validasi `receipt_paper_size` dari `localStorage` dengan fallback aman ke default `'80mm'`.
   - `getPosSettings()`: Ekstraksi kolom `receipt_paper_size` dari data Supabase dengan fallback ke `DEFAULT_POS_SETTINGS.receipt_paper_size`.
   - `updatePosSettings()`: Menyertakan `receipt_paper_size` dalam objek merge lokal dan payload upsert ke database Supabase.
3. **Unit Tests (`src/services/posSettingsService.test.ts`)**:
   - Memastikan `DEFAULT_POS_SETTINGS.receipt_paper_size` bernilai `'80mm'`.
   - Memastikan `getPosSettings()` mengembalikan `'80mm'` saat fallback ke default.
   - Memastikan `getStoredLocalSettings()` dan `getPosSettings()` membaca preferensi `'58mm'` yang tersimpan di `localStorage`.
   - Memastikan fallback ke `'80mm'` jika ada data ukuran kertas tidak valid di `localStorage`.
   - Memastikan `updatePosSettings({ receipt_paper_size: '58mm' })` memperbarui state lokal dan mengirimkan payload upsert yang benar ke Supabase.

## Verification Evidence
- **File Exists**: `Test-Path supabase/migrations/028_add_receipt_paper_size_to_pos_settings.sql` returned `True`.
- **Type Checking**: `npx tsc --noEmit` exited with code 0 (clean, no errors).
- **Unit Tests**: `npx vitest run src/services/posSettingsService.test.ts` passed 14/14 tests (100% pass rate).
- **Full Test Suite**: `npm test` passed 18/18 test files, 193/193 tests passed.
- **Git Commits**:
  - `92e60039` feat(phase-38): add migration 028 and receipt_paper_size to posSettingsService
  - `ce2fbf7a` test(phase-38): add unit tests for receipt_paper_size in posSettingsService

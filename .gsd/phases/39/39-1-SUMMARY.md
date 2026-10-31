# Plan 39.1 Summary: Skema Database & Cloudinary Upload Service Engine

## Objective
Menyiapkan skrip migrasi database Supabase untuk kolom `logo_url` pada tabel `public.koperasi_profile`, mengimplementasikan utility service `uploadLogoToCloudinary` di `src/services/cloudinaryService.ts` dengan validasi MIME/ukuran file, serta memperbarui `settingsService.ts` agar mendukung persistensi dan fallback lokal `logo_url`.

## Execution Details
- **Task**: Create Migration 029 and Implement Cloudinary Upload Service
  - **Files Created**:
    - `supabase/migrations/029_add_logo_url_to_koperasi_profile.sql`
    - `src/services/cloudinaryService.ts`
    - `src/services/cloudinaryService.test.ts`
  - **Files Modified**:
    - `src/services/settingsService.ts`
    - `src/services/settingsService.test.ts`
  - **Commit**: `ff6a7ffd` - `feat(phase-39): create migration 029 and implement cloudinary upload service engine`

### Changes Made
1. **Database Migration (`029_add_logo_url_to_koperasi_profile.sql`)**:
   - Menambahkan kolom `logo_url text` pada tabel `public.koperasi_profile`.
   - Menambahkan komentar deskriptif kolom `logo_url` untuk dokumentasi skema database Supabase.
2. **Cloudinary Service (`src/services/cloudinaryService.ts`)**:
   - Membaca environment variables: `VITE_CLOUDINARY_CLOUD_NAME` dan `VITE_CLOUDINARY_UPLOAD_PRESET`.
   - Validasi ukuran file (maksimal 2MB = 2 * 1024 * 1024 bytes), melempar error jika melampaui.
   - Validasi MIME type (`image/png`, `image/jpeg`, `image/jpg`, `image/webp`, `image/svg+xml`), melempar error jika format tidak didukung.
   - Menyiapkan `FormData` dengan upload preset dan target folder `simkop/branding`.
   - Melakukan POST request via `fetch` ke endpoint REST Cloudinary dan mengembalikan `data.secure_url`.
3. **Settings Service (`src/services/settingsService.ts`)**:
   - Menambahkan properti `logo_url?: string | null;` pada interface `KoperasiProfile`.
   - Menambahkan default `logo_url: null` pada `DEFAULT_KOPERASI_PROFILE`.
   - Menyelaraskan fungsi `getStoredLocalProfile()`, `getKoperasiProfile()`, dan `updateKoperasiProfile()` untuk membaca serta menyimpan `logo_url` dengan fallback lokal yang andal.
4. **Unit Tests (`src/services/cloudinaryService.test.ts` & `src/services/settingsService.test.ts`)**:
   - Pengujian batas ukuran file logo > 2MB.
   - Pengujian validasi MIME format yang tidak didukung (mis. PDF).
   - Pengujian validasi environment variable yang belum disetel.
   - Pengujian skenario sukses pengunggahan yang mengembalikan `secure_url`.
   - Pengujian penanganan error dari respons API Cloudinary.
   - Pengujian persistensi dan pembaruan `logo_url` pada `settingsService`.

## Verification Evidence
- **Type Checking**: `npx tsc --noEmit` exited with code 0 (clean, no errors).
- **Unit Tests**: `npm test` passed 20/20 test files, 205/205 tests passed (100% pass rate).
- **Git Commit**:
  - `ff6a7ffd` feat(phase-39): create migration 029 and implement cloudinary upload service engine

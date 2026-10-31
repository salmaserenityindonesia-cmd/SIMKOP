---
phase: 39
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 39.1: Skema Database & Cloudinary Upload Service Engine

## Objective
Menyiapkan skrip migrasi database Supabase untuk kolom `logo_url` pada tabel `public.koperasi_profile`, mengimplementasikan utility service `uploadLogoToCloudinary` di `src/services/cloudinaryService.ts` dengan validasi MIME/ukuran file, serta memperbarui `settingsService.ts` agar mendukung persistensi dan fallback lokal `logo_url`.

## Context
- `supabase/migrations/017_create_koperasi_profile.sql` (struktur tabel koperasi_profile)
- `src/services/settingsService.ts` (manajemen profil koperasi, localStorage caching & fallback)
- Environment variables: `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`

## Tasks

<task type="auto">
  <name>Create Migration 029 and Implement Cloudinary Upload Service</name>
  <files>
    supabase/migrations/029_add_logo_url_to_koperasi_profile.sql
    src/services/cloudinaryService.ts
    src/services/settingsService.ts
  </files>
  <action>
    1. Buat file migrasi `supabase/migrations/029_add_logo_url_to_koperasi_profile.sql`:
       ```sql
       -- Migration 029: Add logo_url to koperasi_profile table
       ALTER TABLE public.koperasi_profile 
       ADD COLUMN IF NOT EXISTS logo_url text;

       COMMENT ON COLUMN public.koperasi_profile.logo_url IS 'URL publik Cloudinary untuk logo resmi koperasi';
       ```
    2. Buat file `src/services/cloudinaryService.ts`:
       - Baca `import.meta.env.VITE_CLOUDINARY_CLOUD_NAME` dan `import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET`.
       - Implementasikan fungsi `uploadLogoToCloudinary(file: File): Promise<string>`:
         * Validasi ukuran file (maksimal 2MB = `2 * 1024 * 1024` bytes). Jika lebih besar, throw Error: "Ukuran file logo maksimal 2MB".
         * Validasi tipe MIME (`image/png`, `image/jpeg`, `image/jpg`, `image/webp`, `image/svg+xml`). Jika tidak sesuai, throw Error: "Format gambar harus berupa PNG, JPG, WEBP, atau SVG".
         * Validasi ketersediaan Cloud Name dan Upload Preset: jika belum terkonfigurasi, throw Error: "Konfigurasi Cloudinary (Cloud Name / Upload Preset) belum disetel di environment".
         * Siapkan `FormData`:
           - `formData.append('file', file)`
           - `formData.append('upload_preset', uploadPreset)`
           - `formData.append('folder', 'simkop/branding')`
         * Lakukan POST request via `fetch` ke: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`.
         * Parse respons JSON: jika `!response.ok` atau terdapat `data.error`, throw Error dengan detail pesan dari Cloudinary.
         * Kembalikan `data.secure_url`.
    3. Perbarui `src/services/settingsService.ts`:
       - Pada interface `KoperasiProfile`, tambahkan kolom opsional `logo_url?: string | null;`.
       - Pada `DEFAULT_KOPERASI_PROFILE`, tambahkan `logo_url: null`.
       - Pada `getStoredLocalProfile()`, pastikan membaca `logo_url`:
         `logo_url: parsed.logo_url ?? null`.
       - Pada `updateKoperasiProfile()`, pastikan payload yang dikirim ke Supabase dan disimpan ke `localStorage` menyertakan `logo_url`.
  </action>
  <verify>
    - Skrip migrasi SQL valid dan tersimpan di `supabase/migrations/029_add_logo_url_to_koperasi_profile.sql`.
    - Interface `KoperasiProfile` dan `cloudinaryService.ts` bersih tanpa error TypeScript.
  </verify>
  <done>Skema database siap dan service uploader Cloudinary siap digunakan oleh komponen UI.</done>
</task>

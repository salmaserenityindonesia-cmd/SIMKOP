---
phase: 39
plan: 3
wave: 3
depends_on: ["39.1", "39.2"]
gap_closure: false
---

# Plan 39.3: Unit Testing, Static Typecheck & Build Verification

## Objective
Menulis unit test komprehensif untuk `cloudinaryService.ts` dan integrasi `settingsService.ts` terkait `logo_url`, memvalidasi seluruh type safety dengan TypeScript compiler (`tsc --noEmit`), serta memastikan bundling produksi Vite (`npm run build`) berhasil 100% tanpa error.

## Context
- `src/services/cloudinaryService.ts`
- `src/services/cloudinaryService.test.ts`
- `src/services/settingsService.test.ts`

## Tasks

<task type="auto">
  <name>Create Unit Tests for Cloudinary Service and Verify Production Build</name>
  <files>
    src/services/cloudinaryService.test.ts
    src/services/settingsService.test.ts
  </files>
  <action>
    1. Buat unit test `src/services/cloudinaryService.test.ts`:
       - Mock `global.fetch` dan environment variables `import.meta.env`.
       - Test 1: Harus menolak file yang ukurannya > 2MB.
       - Test 2: Harus menolak file dengan tipe MIME selain gambar (misal `application/pdf` atau `text/plain`).
       - Test 3: Harus melempar error jika kredensial Cloudinary belum disetel di env.
       - Test 4: Berhasil mengunggah file dan mengembalikan `secure_url` jika respon HTTP ok.
       - Test 5: Melempar error informatif jika Cloudinary mengembalikan status error / data.error.message.
    2. Perbarui `src/services/settingsService.test.ts`:
       - Tambahkan pengujian bahwa `logo_url` dapat disimpan dan dibaca kembali dari `localStorage` fallback.
    3. Jalankan suite pengujian unit: `npx vitest run`.
    4. Jalankan type check dan build bundler: `npm run build`.
  </action>
  <verify>
    - Seluruh unit tests vitest lulus 100% (exit code 0).
    - `npm run build` berhasil menghasilkan bundle di `dist/` tanpa peringatan/error tipe.
  </verify>
  <done>Fitur unggah logo ke Cloudinary teruji penuh dan diverifikasi siap rilis ke produksi.</done>
</task>

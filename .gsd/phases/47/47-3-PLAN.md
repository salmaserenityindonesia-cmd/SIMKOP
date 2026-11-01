---
phase: 47
plan: 3
wave: 3
depends_on: ["47-1", "47-2"]
gap_closure: false
---

# Plan 47.3: Component Testing, Static Verification & Production Build Check

## Objective
Menulis suite unit test komponen untuk `ComplianceMatrix.tsx` di `src/pages/admin/ComplianceMatrix.test.tsx` guna memvalidasi render dropdown tahun dinamis, perubahan filter tahun, serta menjalankan verifikasi tipe TypeScript (`tsc --noEmit`) dan build produksi Vite (`npm run build`) dengan exit code 0.

## Context
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/services/complianceService.ts`
- `src/services/complianceService.test.ts`
- `src/pages/admin/ComplianceMatrix.test.tsx`

## Tasks

<task type="auto">
  <name>Create Component Unit Test for ComplianceMatrix Dynamic Year Dropdown</name>
  <files>
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buat berkas `src/pages/admin/ComplianceMatrix.test.tsx` dengan Vitest dan React Testing Library.
    2. Mock dependensi eksternal:
       - Mock `../../services/complianceService`:
         * `getSavingsComplianceAvailableYears`: me-resolve `[2026, 2025, 2024, 2023]`
       - Mock `../../services/matrixService`:
         * `getComplianceMatrixData`: me-resolve data dummy `ComplianceMatrixResult`
       - Mock `../../lib/supabaseClient`:
         * `supabase.from`: me-resolve array transaksi kosong/dummy untuk penghitungan total setoran
       - Mock `../../components/layout/AdminLayout`: render children sederhana
       - Mock `../../components/members/MemberLedgerModal`: render dummy null
    3. Susun skenario pengujian:
       - Komponen me-render dropdown opsi tahun dengan opsi `Tahun 2026`, `Tahun 2025`, `Tahun 2024`, dan `Tahun 2023`.
       - Saat dropdown tahun diubah nilainya (misal ke `2024`), `getComplianceMatrixData` dipanggil kembali dengan parameter `2024`.
       - Header dan KPI card memperbarui label tahun yang sesuai.
    4. Jalankan pengujian: `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx`.
  </action>
  <verify>
    `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx` berhasil lulus 100%.
  </verify>
  <done>
    Pengujian unit komponen untuk Matriks Kepatuhan Simpanan terverifikasi sukses.
  </done>
</task>

<task type="auto">
  <name>Full Workspace Vitest, Typecheck and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan seluruh unit test terkait compliance dan simpanan:
       `npx vitest run src/services/complianceService.test.ts src/pages/admin/ComplianceMatrix.test.tsx`
    2. Jalankan seluruh test suite workspace untuk memastikan tidak ada regresi:
       `npx vitest run`
    3. Jalankan validasi tipe TypeScript:
       `npx tsc --noEmit`
    4. Jalankan Vite production build:
       `npm run build`
  </action>
  <verify>
    Seluruh test suite vitest lulus (31+ test files), `tsc --noEmit` tidak menghasilkan error, dan build Vite exit code 0.
  </verify>
  <done>
    Build produksi terverifikasi bersih dan siap rilis.
  </done>
</task>

## Success Criteria
- [ ] Unit test komponen `ComplianceMatrix.test.tsx` memverifikasi opsi tahun dinamis dan interaksi pemilihan tahun
- [ ] Seluruh unit test vitest workspace (31+ test files) lulus 100% tanpa regresi
- [ ] Pengecekan tipe statis TypeScript (`tsc --noEmit`) bersih tanpa error
- [ ] Vite production build berhasil (`npm run build`) dengan exit code 0

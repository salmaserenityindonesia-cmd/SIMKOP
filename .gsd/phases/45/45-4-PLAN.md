---
phase: 45
plan: 4
wave: 4
depends_on: ["45.1", "45.2", "45.3"]
gap_closure: false
---

# Plan 45.4: Comprehensive Testing, Static Verification & Build Check

## Objective
Menulis unit test komprehensif untuk pengujian pemetaan data komprehensif anggota 14 kolom di `src/services/memberService.ts`, pengujian pembuatan file Excel dan dokumen PDF di `src/services/memberExporter.ts`, pengujian integrasi tombol ekspor di `src/pages/admin/ManajemenAnggota.tsx`, serta memvalidasi kepatuhan tipe TypeScript (`tsc --noEmit`) dan build produksi bundler Vite (`npm run build`).

## Context
- `src/services/memberService.ts`
- `src/services/memberExporter.ts`
- `src/pages/admin/ManajemenAnggota.tsx`

## Tasks

<task type="auto">
  <name>Comprehensive Unit Tests for 14-Column Exporter and Data Fetcher</name>
  <files>
    src/services/memberService.test.ts
    src/services/memberExporter.test.ts
    src/pages/admin/ManajemenAnggota.test.tsx
  </files>
  <action>
    1. Buat berkas unit test `src/services/memberService.test.ts`:
       - Mock supabase queries (`anggota`, `member_deposits`, `deposit_transactions`, `loans`, `loan_schedules`, `loan_repayments`).
       - Uji skenario anggota lengkap (memiliki 4 jenis simpanan dan pinjaman aktif):
         * Verifikasi seluruh 14 kolom terpetakan dengan tepat.
         * Verifikasi perhitungan sisa pinjaman dan tenor.
       - Uji skenario anggota tanpa simpanan dan tanpa pinjaman:
         * Verifikasi nominal default bernilai 0 dan tanggal kosong string `'-'`.
       - Uji penarikan dengan parameter filter `memberIds`.
    2. Buat berkas unit test `src/services/memberExporter.test.ts`:
       - Uji `exportMembersToExcel`:
         * Verifikasi workbook terbuat dengan worksheet `'Data Anggota Lengkap'`.
         * Verifikasi 14 kolom header terbentuk persis sama dengan nama kolom baku migrasi.
         * Verifikasi baris data dan format numerik kolom nominal.
       - Uji `exportMembersToPdf`:
         * Verifikasi dokumen jsPDF terinisialisasi dengan orientasi `'landscape'`.
         * Verifikasi header profil koperasi dan pemanggilan `autoTable`.
         * Verifikasi kalkulasi akumulasi baris total footer.
    3. Perbarui `src/pages/admin/ManajemenAnggota.test.tsx`:
       - Tambahkan mock untuk `memberService` dan `memberExporter`.
       - Uji klik tombol Excel memanggil `getMembersComprehensiveReport` dan `exportMembersToExcel`.
       - Uji klik tombol PDF memanggil `getMembersComprehensiveReport` dan `exportMembersToPdf`.
  </action>
  <verify>
    Jalankan `npx vitest run src/services/memberService.test.ts src/services/memberExporter.test.ts src/pages/admin/ManajemenAnggota.test.tsx` dan pastikan seluruh test lulus 100%.
  </verify>
  <done>
    Seluruh pengujian unit untuk fitur ekspor 14 kolom lulus tanpa error.
  </done>
</task>

<task type="auto">
  <name>Static Typecheck and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan TypeScript static check:
       `npx tsc --noEmit`
    2. Jalankan seluruh test suite Vitest:
       `npx vitest run`
    3. Jalankan Vite production build:
       `npm run build`
  </action>
  <verify>
    - TypeScript compiler exit code 0 tanpa error tipe.
    - Vitest exit code 0 dengan seluruh test passing.
    - Vite build exit code 0 menghasilkan bundle produksi di folder `dist/`.
  </verify>
  <done>
    Build produksi terverifikasi bersih dan siap rilis.
  </done>
</task>

## Success Criteria
- [ ] Unit test `memberService.test.ts` memvalidasi agregasi 14 kolom secara akurat
- [ ] Unit test `memberExporter.test.ts` memvalidasi pembentukan workbook XLSX dan PDF landscape
- [ ] Unit test `ManajemenAnggota.test.tsx` memvalidasi pemicuan ekspor dari tombol toolbar
- [ ] `npx vitest run` seluruh workspace lulus 100%
- [ ] `npm run build` selesai dengan exit code 0

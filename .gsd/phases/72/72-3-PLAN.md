---
phase: 72
plan: 3
wave: 3
gap_closure: false
---

# Plan 72.3: Verification, Full Test Suite, and Production Build Check

## Objective
Memverifikasi integrasi penguraian mundur Simpanan Wajib bertingkat dan audit selisih pada migrasi anggota secara menyeluruh melalui pengujian unit komponen dan utilitas, type checking TypeScript (`tsc --noEmit`), serta build produksi Vite (`npm run build`).

## Context
Load these files for context:
- `src/components/members/MemberMigrationModal.test.tsx` (atau buat baru bila belum ada)
- `src/pages/admin/ManajemenAnggota.test.tsx`
- `src/utils/memberMigrationParser.test.ts`

## Tasks

<task type="auto">
  <name>Add Component Tests for MemberMigrationModal Breakdown and Warning Badges</name>
  <files>
    src/components/members/MemberMigrationModal.test.tsx
  </files>
  <action>
    1. Buka atau buat `src/components/members/MemberMigrationModal.test.tsx`:
       - Tulis pengujian unit yang merender `MemberMigrationModal` dengan data dummy:
         - Kasus 1: Anggota dengan Simpanan Wajib yang seimbang -> memastikan badge hijau "Seimbang" muncul.
         - Kasus 2: Anggota dengan selisih positif/negatif -> memastikan badge peringatan merah dengan nominal selisih muncul.
         - Kasus 3: Anggota pra-2020 -> memastikan keterangan pra-2020 muncul.
         - Kasus 4: Klik tombol detail uraian -> popover/modal breakdown terbuka menampilkan daftar bulan yang diurai mundur.
       - Jalankan: `npx vitest run src/components/members/MemberMigrationModal.test.tsx`.
  </action>
  <verify>
    Test komponen modal pratinjau migrasi lulus 100%.
  </verify>
  <done>
    Komponen modal pratinjau teruji secara otomatis dan tahan regresi.
  </done>
</task>

<task type="auto">
  <name>Run Full Verification Suite and Production Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan unit test suite terkait:
       `npx vitest run src/utils/memberMigrationParser.test.ts src/components/members/MemberMigrationModal.test.tsx`
    2. Jalankan TypeScript compiler check dan build produksi:
       `npm run build`
    3. Pastikan tidak ada compile error, lint warning kritis, atau runtime exception.
  </action>
  <verify>
    Build produksi Vite selesai dengan status success (exit code 0).
  </verify>
  <done>
    Phase 72 selesai dan terverifikasi bersih siap deploy ke lingkungan produksi.
  </done>
</task>

## Verification Criteria
- Semua unit test lulus tanpa kegagalan.
- `npm run build` keluar dengan kode 0 tanpa error TypeScript.


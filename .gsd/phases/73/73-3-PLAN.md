---
phase: 73
plan: 3
wave: 3
gap_closure: false
---

# Plan 73.3: Static Verification, Full Test Suite, and Production Build Check

## Objective
Melakukan pengujian komprehensif terhadap fungsionalitas jendela 12 bulan bergulir dan saldo bawaan akumulatif pada matriks kepatuhan simpanan. Pengujian mencakup unit test generator periode `getRolling12Months`, pengujian agregasi saldo bawaan dan akumulasi berantai pada `getComplianceMatrixData`, pengujian rendering header dan tooltip pada `ComplianceMatrix.test.tsx`, serta static type checking dan build produksi Vite (`npm run build`).

## Context
Load these files for context:
- `src/services/complianceService.test.ts`
- `src/pages/admin/ComplianceMatrix.test.tsx`
- `src/services/complianceService.ts`
- `src/pages/admin/ComplianceMatrix.tsx`

## Tasks

<task type="auto">
  <name>Add Unit Tests for Rolling 12 Months and Opening Balance Ledger</name>
  <files>
    src/services/complianceService.test.ts,
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/services/complianceService.test.ts`:
       - Tambahkan unit test untuk `getRolling12Months`:
         - Kasus 1: Batas lintas tahun (misal referensi Nov 2026 -> mengembalikan 12 bulan mulai dari Des-25 hingga Nov-26).
         - Kasus 2: Bulan Januari (misal referensi Jan 2026 -> mengembalikan Feb-25 hingga Jan-26).
         - Kasus 3: Memastikan panjang tepat 12 elemen dan setiap objek memiliki `year`, `month`, `label`, `periodIndex`.
       - Tambahkan unit test untuk `getComplianceMatrixData` mode rolling:
         - Kasus transaksi sebelum periode 12 bulan bergulir: pastikan masuk ke `openingBalance` dan digulung ke kolom pertama.
         - Kasus akumulasi berantai: pastikan `bal_w` / `bal_b` / `bal_l` pada kolom bulan ke-11 seimbang dengan total mutasi kas riil anggota.
    2. Buka `src/pages/admin/ComplianceMatrix.test.tsx`:
       - Pastikan tes header tabel memvalidasi rendering kolom bergulir.
       - Pastikan tooltip menampilkan akumulasi saldo kumulatif.
       - Jalankan: `npx vitest run src/services/complianceService.test.ts src/pages/admin/ComplianceMatrix.test.tsx`.
  </action>
  <verify>
    Seluruh pengujian unit service dan komponen matriks lulus 100% tanpa kegagalan.
  </verify>
  <done>
    Fungsionalitas rolling window 12 bulan dan saldo bawaan teruji secara otomatis.
  </done>
</task>

<task type="auto">
  <name>Run Full Test Suite, Typecheck, and Production Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan TypeScript compiler check untuk memverifikasi tidak ada pelanggaran tipe:
       `npx tsc --noEmit`
    2. Jalankan build produksi Vite:
       `npm run build`
    3. Pastikan seluruh bundle `dist/` ter-generate secara bersih dengan exit code 0.
  </action>
  <verify>
    `npm run build` selesai dengan exit code 0 tanpa error atau warning kritis.
  </verify>
  <done>
    Aplikasi berhasil di-build untuk lingkungan produksi.
  </done>
</task>

## Success Criteria
- [ ] Seluruh unit test di `complianceService.test.ts` dan `ComplianceMatrix.test.tsx` lulus 100%
- [ ] Tidak ada error tipe TypeScript pada `npx tsc --noEmit`
- [ ] `npm run build` berhasil sukses dengan exit code 0

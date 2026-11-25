---
phase: 97
plan: 3
wave: 2
gap_closure: false
---

# Plan 97.3: Paginasi Penuh (`fetchAllPaginatedSafe`) pada `getShuEstimation` di `LaporanKeuangan` Tab Estimasi SHU Berjalan

## Objective
Menghilangkan pemotongan batas 1.000 baris Supabase pada tab **Estimasi SHU Berjalan** (`getShuEstimation` di `src/pages/admin/laporan-keuangan/index.tsx`, yang diekspor ulang oleh `src/pages/admin/LaporanKeuangan.tsx`) dengan menerapkan `fetchAllPaginatedSafe` dan *chunking* filter `.in(...)` untuk `loan_repayments`, `loan_schedules`, `loans`, `anggota`, `sales`, dan `sale_items`, sehingga seluruh kontrak pinjaman lunas tampil utuh dan konsisten dengan `/admin/laporan-pinjaman-lunas`.

## Context
- `.gsd/SPEC.md`
- `.gsd/phases/97/RESEARCH.md`
- `src/pages/admin/LaporanKeuangan.tsx` (barrel re-export)
- `src/pages/admin/laporan-keuangan/index.tsx` (`getShuEstimation` baris 1024–1580)
- `src/utils/supabasePagination.ts` (`fetchAllPaginatedSafe`)
- `src/pages/admin/laporan-keuangan/index.test.tsx`

## Tasks

<task type="auto">
  <name>Use fetchAllPaginatedSafe and ID Chunking in getShuEstimation Queries</name>
  <files>
    src/pages/admin/laporan-keuangan/index.tsx
  </files>
  <action>
    1. Import `fetchAllPaginatedSafe` dari `../../../utils/supabasePagination` di `src/pages/admin/laporan-keuangan/index.tsx`.
    2. Buat helper chunking lokal `chunkIds(ids: string[], size = 80): string[][]` dan helper query berpaginasi di `getShuEstimation`:
       - Untuk `sales` (baris 1030–1046): bungkus dengan `fetchAllPaginatedSafe` + `.order('id', { ascending: true })` (hanya ditambahkan bila `typeof q.range === 'function'` atau via pola `paidOffLoansReportService.ts` agar mock unit test yang tidak memiliki `.order()`/`.range()` tetap jalan mulus).
       - Untuk `sale_items` (baris 1059–1075), `products`, `product_categories`, dan `anggota`: lakukan chunking `chunkIds(..., 80)` ketika jumlah ID besar dan gunakan `fetchAllPaginatedSafe`.
       - Untuk `cash_flow` opex (baris 1212–1219): bungkus dengan `fetchAllPaginatedSafe` agar tidak terpotong 1.000 baris.
       - Untuk `loan_repayments` pada blok `3b` (baris 1256–1287): gunakan `fetchAllPaginatedSafe` saat menjalankan `runRepayQuery(cols)` (tambahkan `.order('id', { ascending: true })` jika `typeof q.range === 'function'` dan `typeof q.order === 'function'`) dengan tetap mempertahankan fallback `isMissingColumnErr`.
       - Untuk `loan_schedules` (`allSchedIds`), `loans` (`allLoanIds`), dan `anggota` (`loanMemberIds`) pada baris 1303–1390: iterasikan per `chunkIds(..., 80)` dan ambil semua halaman melalui `fetchAllPaginatedSafe` sehingga seluruh jadwal dan kontrak ter-load penuh tanpa batas URL `.in()` maupun batas 1.000 baris.
    3. Pastikan juga `filterRedundantLegacySaldoAwalRepayments` (atau filter `method === 'SALDO_AWAL' || method === 'TOPUP_COMPENSATION'` yang sudah ada di baris 1290) tetap mencegah double-counting, dan pengelompokan `groupedLoanMap` per `loan.id` menghasilkan 1 baris `LOAN_CONTRACT` per kontrak lunas untuk filter `Penyumbang SHU & Pinjaman Lunas (Default)`.
    4. AVOID: Menggunakan `fetchAllPaginated` langsung tanpa pengecekan `typeof q.range === 'function'`, karena mock Supabase pada `src/pages/admin/laporan-keuangan/index.test.tsx` tidak selalu menyediakan `.range()`; `fetchAllPaginatedSafe` menangani mock & production query sekaligus.
  </action>
  <verify>
    `npx vitest run src/pages/admin/laporan-keuangan/index.test.tsx`
  </verify>
  <done>
    Seluruh kueri `getShuEstimation` (`loan_repayments`, `loan_schedules`, `loans`, `sales`, `sale_items`, `cash_flow`) menggunakan `fetchAllPaginatedSafe` + ID chunking tanpa batas 1.000 baris.
  </done>
</task>

<task type="auto">
  <name>Add Pagination & Contract Grouping Unit Tests in laporan-keuangan/index.test.tsx</name>
  <files>
    src/pages/admin/laporan-keuangan/index.test.tsx
  </files>
  <action>
    1. Tambahkan test case pada `src/pages/admin/laporan-keuangan/index.test.tsx` untuk `getShuEstimation`:
       - Simulasikan `loan_repayments` dengan `.range(from, to)` yang mengembalikan 1.000 baris pada halaman pertama (`0..999`) dan sisa baris (mis. 50 baris untuk kontrak tambahan) pada halaman kedua (`1000..1999`), termasuk kontrak pinjaman lunas `SALDO_AWAL_MIGRASI` di halaman kedua.
       - Verifikasi `getShuEstimation` membaca seluruh halaman (`range(0, 999)` dan `range(1000, 1999)`), mengelompokkan `LOAN_CONTRACT` per `loan.id`, dan memunculkan kontrak dari halaman kedua di hasil `shuReferenceRows` serta tetap lolos filter `filterShuRowsBySource(..., 'default_shu_and_paid_off')`.
    2. Pastikan seluruh test existing di `src/pages/admin/laporan-keuangan/index.test.tsx` lulus.
  </action>
  <verify>
    `npx vitest run src/pages/admin/laporan-keuangan/index.test.tsx`
  </verify>
  <done>
    Unit test paginasi >1.000 baris pada `getShuEstimation` lulus dan membuktikan kontrak pinjaman lunas di halaman lanjutan ikut teragregasi akurat.
  </done>
</task>

## Must-Haves
- [ ] `getShuEstimation` menggunakan `fetchAllPaginatedSafe` untuk `loan_repayments`, `loan_schedules`, `loans`, `sales`, `sale_items`, dan `cash_flow`.
- [ ] Filter `.in(...)` di-chunk agar aman untuk jumlah kontrak besar (>80 kontrak).
- [ ] Test existing di `src/pages/admin/laporan-keuangan/index.test.tsx` tetap hijau 100%.

## Success Criteria
- [ ] `npx vitest run src/pages/admin/laporan-keuangan/index.test.tsx` lulus 100%.

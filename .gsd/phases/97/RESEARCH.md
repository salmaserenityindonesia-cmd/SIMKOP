---
phase: 97
status: complete
discovery_level: 1
---

# Phase 97 Research: Otomatisasi Kwitansi Per Periode, Guard Tanggal/Status Impor Pinjaman & Sinkronisasi Laporan SHU/Pinjaman Lunas

## Key Codebase Findings (Verified Against Source Files)

1. **Lokasi Mesin Impor Excel Saldo Awal Pinjaman**:
   - File `src/services/loanImportService.ts` **tidak ada** di repositori.
   - Logika impor Excel **Saldo Awal Pinjaman** berada di:
     - `src/utils/initialLoansParser.ts` (parsing & validasi baris Excel)
     - `src/services/loanService.ts` fungsi `syncInitialLoanBalances()` (baris 443–897, dipanggil dari modal Upload Saldo Awal Pinjaman di `src/pages/admin/ManajemenAnggota.tsx` baris 747).
   - **Sudah terimplementasi di `syncInitialLoanBalances()`**:
     - Clean overwrite kontrak lama per `loan_number` & `Saldo Awal Pinjaman` (baris 567–634).
     - Status kontrak `loanStatus = isFullySettled ? 'paid_off' : 'active'` berdasarkan `sisaPinjaman <= 0 && allPeriodsPaid` (baris 685–691, fallback `'completed'` jika enum DB tidak menerima `'paid_off'`).
     - Pembuatan `loan_schedules` dan `loan_repayments` per periode (`KW-MIGRASI/{loanNumber}/B{period_number}`, `payment_method = 'SALDO_AWAL_MIGRASI'`, tanpa membuat baris gelondongan `SALDO_AWAL`).
   - **Gap yang masih tersisa di `syncInitialLoanBalances()` (`src/services/loanService.ts:783-834`)**:
     - `paymentIso` (untuk `loan_repayments.payment_date`) dan `createdAtIso` (untuk `cash_flow.created_at`) langsung memakai `s.due_date` tanpa pembatasan `<= todayDate` (`formatDateYmd(new Date())`), sehingga jika `due_date > todayDate`, tanggal pembayaran masa depan masih bisa tertulis.

2. **Sinkronisasi Data Existing & Guard Tanggal Lunas (`src/services/paidOffLoansReportService.ts`)**:
   - **Sudah terimplementasi**:
     - Pembersihan rekaman gelondongan `SALDO_AWAL` lama menggunakan `filterRedundantLegacySaldoAwalRepayments` (dari `orphanAuditService.ts`) dan batch delete ke `loan_repayments` (baris 518–524, 806–826).
   - **Gap yang masih tersisa**:
     - Belum ada *idempotent backfill* (dengan *in-flight lock* tingkat modul) untuk menyisipkan baris `loan_repayments` (`payment_method = 'SALDO_AWAL_MIGRASI'`, `receipt_number = KW-MIGRASI/{loan_number}/B{period_number}`) bagi jadwal `loan_schedules` dengan `paid_amount > 0` atau `status === 'paid'` yang belum punya rekaman di `loan_repayments` — **tanpa** menambah baris ke `public.cash_flow` agar tidak terjadi *double counting* dengan `SALDO-AWAL`.
     - Penentuan `paidOffDate` (baris 706–722) belum dibatasi maksimal tanggal hari ini (`<= todayDate`), sehingga tanggal jatuh tempo atau pembayaran masa depan (mis. `2026-12-01`) dapat muncul sebagai `1 Des 2026`.

3. **Paginasi Penuh Tab Estimasi SHU Berjalan (`src/pages/admin/LaporanKeuangan.tsx` -> `src/pages/admin/laporan-keuangan/index.tsx`)**:
   - `src/pages/admin/LaporanKeuangan.tsx` adalah file re-ekspor barrel ke `src/pages/admin/laporan-keuangan/index.tsx`.
   - **Sudah terimplementasi di `src/pages/admin/laporan-keuangan/index.tsx`**:
     - Pengelompokan `LOAN_CONTRACT` per `loan.id` dan filter `Penyumbang SHU & Pinjaman Lunas (Default)` (`filterShuRowsBySource` mode `default_shu_and_paid_off`, baris 89–107).
   - **Gap yang masih tersisa di `getShuEstimation()` (baris 1024–1580)**:
     - Kueri `loan_repayments` (baris 1256–1286), `sales` (baris 1030–1036), serta lookup `.in(...)` untuk `loan_schedules`, `loans`, `anggota`, dan `sale_items` belum memakai `fetchAllPaginatedSafe` (dari `src/utils/supabasePagination.ts`) dan *chunking* ID, sehingga rentan terpotong batas 1.000 baris Supabase PostgREST.
     - `fetchAllPaginatedSafe` secara otomatis aman terhadap mock Vitest yang tidak memiliki `.range()`.

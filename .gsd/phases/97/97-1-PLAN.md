---
phase: 97
plan: 1
wave: 1
gap_closure: false
---

# Plan 97.1: Guard Tanggal Pembayaran (<= Today) & Invarian Status/Kwitansi pada Mesin Impor Excel Saldo Awal Pinjaman

## Objective
Memastikan mesin impor Excel **Saldo Awal Pinjaman** (`syncInitialLoanBalances` di `src/services/loanService.ts`, bukan `loanImportService.ts` yang tidak ada di repo) membatasi seluruh tanggal `payment_date` dan `created_at` maksimal tanggal hari ini (`<= todayDate`) selain menjaga clean overwrite per `loan_number`, status `active` vs `paid_off`, dan pembuatan kwitansi per periode `KW-MIGRASI/{loanNumber}/B{period}` tanpa baris gelondongan `SALDO_AWAL`.

## Context
- `.gsd/SPEC.md`
- `.gsd/phases/97/RESEARCH.md`
- `src/services/loanService.ts` (baris 443–897)
- `src/utils/initialLoansParser.ts`
- `src/utils/initialLoansParser.test.ts`

## Tasks

<task type="auto">
  <name>Clamp Future Payment/CashFlow Dates to Today in syncInitialLoanBalances</name>
  <files>
    src/services/loanService.ts
  </files>
  <action>
    1. Pada fungsi `syncInitialLoanBalances` di `src/services/loanService.ts` (sekitar baris 457 & 775–859):
       - Hitung `const todayDate = formatDateYmd(new Date());` sebagai batas atas tanggal transaksi yang sah.
       - Buat helper lokal `clampToTodayYmd(candidateDate: string | null | undefined, fallbackDate: string, maxDate: string): string` yang mengembalikan tanggal `YYYY-MM-DD` tervalidasi dan jika `resolved > maxDate`, mengembalikan `maxDate`.
       - Terapkan `clampToTodayYmd(s.due_date, trimmedDate, todayDate)` saat membentuk `payment_date` (`${safePaymentDate}T08:00:00.000Z`) pada `repaymentsToInsert` dan `created_at` pada `cashFlowsToInsert`.
    2. Pastikan invarian yang sudah ada tetap utuh dan tidak rusak:
       - Clean overwrite menghapus `cash_flow`, `loan_repayments`, `loan_schedules`, dan `loans` lama milik `loanNumber` / `Saldo Awal Pinjaman`.
       - `loanStatus` bernilai `'paid_off'` (fallback `'completed'` jika enum error) hanya bila `principalAmount > 0 && totalTerangsur >= principalAmount && sisaPinjaman <= 0 && allPeriodsPaid`, selain itu `'active'`.
       - Setiap periode `paid_amount > 0` menulis `loan_repayments` dengan `payment_method: 'SALDO_AWAL_MIGRASI'` dan `receipt_number: KW-MIGRASI/${loanNumber}/B${s.period_number}`, tanpa pernah menulis baris gelondongan `SALDO_AWAL`.
    3. AVOID: Mengubah format `due_date` pada `loan_schedules` (jadwal jatuh tempo memang bisa berada di masa depan untuk sisa tenor berjalan; yang dibatasi `<= todayDate` adalah `payment_date` dan `cash_flow.created_at`).
  </action>
  <verify>
    `npx vitest run src/utils/initialLoansParser.test.ts src/services/loanService.test.ts`
  </verify>
  <done>
    Semua periode terbayar saat impor Excel menghasilkan `loan_repayments` ber-receipt `KW-MIGRASI/.../B{n}` dengan `payment_date <= todayDate`, status kontrak akurat (`active` vs `paid_off`), dan tanpa baris gelondongan `SALDO_AWAL`.
  </done>
</task>

<task type="auto">
  <name>Add Regression Unit Tests for Future Date Clamping on Excel Loan Import</name>
  <files>
    src/utils/initialLoansParser.test.ts
  </files>
  <action>
    1. Tambahkan test case pada `src/utils/initialLoansParser.test.ts` di blok `syncInitialLoanBalances`:
       - Gunakan `vi.useFakeTimers()` + `vi.setSystemTime(new Date('2026-11-25T10:00:00+07:00'))` (dan pastikan `vi.useRealTimers()` di `finally`/`afterEach`) untuk menguji impor kontrak dengan `tgl_awal_pinjaman: '2026-06-01'`, `tenor: 6`, `total_terangsur: 6000000` (periode 6 jatuh tempo `2026-12-01` > `2026-11-25`).
       - Verifikasi `loan_schedules[5].due_date` tetap `'2026-12-01'`, sedangkan `loan_repayments[5].payment_date` dan `cash_flow[5].created_at` dikunci ke `'2026-11-25T08:00:00.000Z'` (tidak melebihi `today`), serta `status` kontrak adalah `'paid_off'`.
    2. Pastikan seluruh test existing di `initialLoansParser.test.ts` tetap lulus.
  </action>
  <verify>
    `npx vitest run src/utils/initialLoansParser.test.ts`
  </verify>
  <done>
    Unit test baru di `src/utils/initialLoansParser.test.ts` lulus 100% dan membuktikan tanggal pembayaran masa depan dikunci ke tanggal hari ini.
  </done>
</task>

## Must-Haves
- [ ] Tidak ada `loan_repayments.payment_date` atau `cash_flow.created_at` hasil impor Saldo Awal Pinjaman yang melebihi tanggal hari ini (`todayDate`).
- [ ] Status kontrak `paid_off` hanya aktif bila lunas 100% (`sisa_pinjaman <= 0` & seluruh periode terbayar), selain itu `active`.
- [ ] Impor ulang melakukan clean overwrite tanpa duplikasi dan tanpa baris gelondongan `SALDO_AWAL`.

## Success Criteria
- [ ] `npx vitest run src/utils/initialLoansParser.test.ts src/services/loanService.test.ts` lulus 100%.

---
phase: 68
plan: 1
wave: 1
gap_closure: false
---

# Plan 68.1: Service Layer & Data Engine for Withdrawal Surveillance & Aggregation

## Objective
Membangun fondasi data layer terintegrasi (`withdrawalReportService.ts`) untuk melayani kebutuhan audit pengawasan dan pencairan simpanan, menghitung agregasi real-time arus kas keluar, breakdown per jenis simpanan (Lebaran, Belanja, Sukarela, Pokok/Wajib), rasio metode pembayaran (Tunai vs Transfer Bank), mendeteksi kewajiban pinjaman aktif anggota yang melakukan penarikan (cross-obligation alert), serta menyediakan ekspor dokumen Excel audit berstandar formal dengan ExcelJS.

## Context
Load these files for context:
- `src/services/withdrawal.service.ts`
- `src/services/shoppingSavingsLedgerService.ts`
- `src/lib/supabaseClient.ts`
- `supabase/migrations/015_create_cash_flow_and_withdrawal_rpc.sql`
- `supabase/migrations/034_add_audit_and_reference_to_deposit_transactions.sql`

## Tasks

<task type="auto">
  <name>Build withdrawalReportService Core Logic & Excel Exporter</name>
  <files>
    src/services/withdrawalReportService.ts
  </files>
  <action>
    Buat berkas `src/services/withdrawalReportService.ts`:
    1. Tipe data TypeScript:
       - `WithdrawalLedgerItem`: ID, member_id, member_name, member_nrp, member_rank, bank_name, bank_account_number, deposit_type_id, deposit_type_code, deposit_type_name, amount, transaction_date, reference_no, payment_method, notes, created_by, has_active_loan (boolean), active_loan_balance (number), active_loan_count (number).
       - `WithdrawalSummary`:
         * `totalWithdrawalAmount`: total nominal penarikan dalam periode.
         * `totalTransactions`: jumlah transaksi pencairan.
         * `uniqueMembers`: jumlah anggota unik yang mencairkan simpanan.
         * `breakdownByType`: nominal penarikan per kategori simpanan (`lebaran`, `belanja`, `pokok_wajib`, `sukarela_lainnya`).
         * `breakdownByMethod`: nominal & persentase penarikan Tunai Kas vs Transfer Bank.
         * `membersWithActiveLoansCount`: jumlah anggota penarik yang memiliki pinjaman aktif berjalan.
         * `totalActiveLoansObligation`: total sisa hutang/pinjaman berjalan milik anggota penarik.
       - `WithdrawalReportFilters`: startDate, endDate, depositTypeCode, paymentMethod, searchQuery, hasActiveLoanOnly (boolean).
    2. Implementasikan `getWithdrawalDetailedLedger(filters?: WithdrawalReportFilters)`:
       - Kueri `deposit_transactions` dengan filter `transaction_type = 'withdrawal'`.
       - Ambil relasi `member_deposits(id, member_id, deposit_types(id, name, code), anggota(id, nama, nrp, pangkat, bank_name, bank_account_number, status))`.
       - Filter tanggal menggunakan `created_at >= startDate` dan `created_at <= endDate` jika disediakan.
       - Filter kode jenis simpanan dan metode pembayaran jika ada.
       - Kueri pinjaman aktif (`status in ('approved', 'active')`) dari tabel `loans` untuk anggota yang relevan, hitung sisa pinjaman (`principal_amount` atau `amount` dikurangi total bayar angsuran / sisa angsuran).
       - Petakan metadata pencairan secara presisi dengan penanda `has_active_loan` dan `active_loan_balance`.
       - Urutkan descending berdasarkan tanggal (`created_at DESC`).
    3. Implementasikan `getWithdrawalSummary(filters?: WithdrawalReportFilters)`:
       - Hitung metrik ringkasan agregasi berdasarkan kumpulan mutasi penarikan dan data pinjaman aktif.
    4. Implementasikan `exportWithdrawalReportExcel(data: WithdrawalLedgerItem[], summary: WithdrawalSummary, filterInfo?: { startDate?: string; endDate?: string; filterLabel?: string })`:
       - Buat dokumen `.xlsx` dengan ExcelJS.
       - Judul Laporan: "LAPORAN AUDIT PENGAWASAN & PENCAIRAN SIMPANAN - SIMKOP".
       - Blok metadata periode dan tanggal cetak.
       - Ringkasan KPI (Total Pencairan, Tunai Kas, Transfer Bank, Anggota dengan Pinjaman Aktif).
       - Tabel data rapi dengan header bergaya biru dongker gelap/teal dengan teks putih tebal.
       - Format kolom nominal mata uang Indonesia: `Rp #,##0`.
       - Baris total agregasi di bagian paling bawah tabel.
       - Otomatis trigger file download di browser.
  </action>
  <verify>
    Jalankan pemeriksaan tipe TypeScript pada berkas service baru:
    npx tsc --noEmit
  </verify>
  <done>
    Fungsi `getWithdrawalDetailedLedger`, `getWithdrawalSummary`, dan `exportWithdrawalReportExcel` terdefinisi dan bebas error compile.
  </done>
</task>

<task type="auto">
  <name>Create Unit Tests for withdrawalReportService</name>
  <files>
    src/services/withdrawalReportService.test.ts
  </files>
  <action>
    Buat berkas unit test `src/services/withdrawalReportService.test.ts`:
    1. Mock Supabase client (`supabase.from`) untuk tabel `deposit_transactions`, `member_deposits`, `deposit_types`, `anggota`, `loans`, dan `loan_repayments`.
    2. Uji skenario `getWithdrawalDetailedLedger`:
       - Berhasil memuat dan memetakan mutasi penarikan lengkap dengan relasi anggota dan jenis simpanan.
       - Deteksi pinjaman aktif anggota penarik berjalan dengan tepat (`has_active_loan = true` dan saldo pinjamannya).
       - Filter pencarian teks (`searchQuery`) pada nama, NRP, atau nomor referensi.
       - Penanganan fallback error database dengan graceful error handling.
    3. Uji skenario `getWithdrawalSummary`:
       - Menghitung total penarikan, breakdown jenis simpanan, breakdown metode tunai vs transfer, dan deteksi kewajiban anggota pinjaman aktif.
    4. Uji skenario `exportWithdrawalReportExcel`:
       - Memastikan workbook ExcelJS berhasil dibangun tanpa error.
  </action>
  <verify>
    Jalankan pengujian unit spesifik service:
    npx vitest run src/services/withdrawalReportService.test.ts
  </verify>
  <done>
    Semua unit test di `withdrawalReportService.test.ts` lulus 100%.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `withdrawalReportService.ts` mengekspor seluruh tipe dan fungsi kueri yang diperlukan.
- [ ] Deteksi pinjaman aktif anggota (cross-obligation alert) terintegrasi dengan benar pada data penarikan.
- [ ] Unit test service lulus dengan cakupan lengkap.

## Success Criteria
- [ ] Semua task diverifikasi lulus.
- [ ] Tidak ada regresi pada test suite yang ada.

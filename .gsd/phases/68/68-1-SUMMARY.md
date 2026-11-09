# Plan 68.1 Summary: Service Layer & Data Engine for Withdrawal Surveillance & Aggregation

## Objective
Membangun modul service layer `withdrawalReportService.ts` untuk mengelola kueri audit mutasi penarikan simpanan (`deposit_transactions` dengan tipe `withdrawal`), mengagregasikan metrik KPI arus kas keluar (total pencairan, transaksi, anggota unik, breakdown kategori simpanan, dan rasio tunai vs transfer), mendeteksi kewajiban pinjaman aktif anggota penarik (Cross-Obligation Risk Alert), serta menyediakan engine ekspor dokumen Excel audit berstandar formal dengan ExcelJS.

## Tasks Completed

| Task | Name | Files | Commit |
|------|------|-------|--------|
| 1 | Build withdrawalReportService Core Logic & Excel Exporter | `src/services/withdrawalReportService.ts` | `e4397395` |
| 2 | Create Unit Tests for withdrawalReportService | `src/services/withdrawalReportService.test.ts` | `9f79d997` |

## Key Implementations

1. **Data Extraction & Cross-Obligation Risk Engine (`getWithdrawalDetailedLedger`)**:
   - Menghubungkan mutasi penarikan dari `deposit_transactions` ke `member_deposits`, `deposit_types`, dan data profil `anggota`.
   - Mengambil kewajiban pinjaman aktif secara real-time dari tabel `loans` (status `approved` dan `active`) beserta riwayat angsuran `loan_repayments` untuk anggota yang relevan.
   - Mengidentifikasi saldo sisa hutang berjalan (`active_loan_balance`) dan jumlah pinjaman aktif (`active_loan_count`) secara otomatis per anggota untuk mencegah risiko moral hazard saat penarikan simpanan sukarela/hari raya.
   - Mendukung filter dinamis: rentang tanggal (`startDate`, `endDate`), kategori / kode jenis simpanan (`depositTypeCode`), metode pembayaran (`paymentMethod`), filter khusus pinjaman aktif (`hasActiveLoanOnly`), dan pencarian teks (`searchQuery`).

2. **Arus Kas & Surveillance KPI Aggregation (`calculateWithdrawalSummary` & `getWithdrawalSummary`)**:
   - Menghitung total nominal penarikan, total transaksi, dan anggota unik tanpa duplikasi.
   - Agregasi breakdown per kategori simpanan: Lebaran/THR, Belanja, Pokok/Wajib, dan Sukarela/Lainnya.
   - Breakdown rasio metode pembayaran: Kas Tunai vs Transfer Bank (nominal, frekuensi, persentase).
   - Pengawasan pinjaman: jumlah anggota penarik yang memiliki pinjaman aktif berjalan serta total nominal kewajiban pinjaman tanpa penghitungan ganda.

3. **ExcelJS Exporter (`exportWithdrawalReportExcel`)**:
   - Format laporan formal akuntansi koperasi dengan header profesional (warna Slate 900 / Navy), metadata periode, dan ringkasan KPI audit.
   - Kolom tabel rinci dengan indikator visual kewajiban pinjaman aktif bertanda peringatan warna merah.
   - Format mata uang Rupiah standar Indonesia: `_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)`.
   - Baris total akuntansi bergaris ganda di bagian bawah tabel serta pemicu unduh otomatis di peramban.

4. **Comprehensive Unit Testing**:
   - 13 pengujian unit mencakup fungsi utilitas, mapping transaksi, deteksi pinjaman aktif, filter memori, skenario kegagalan database, agregasi ringkasan, dan generasi file Excel.
   - Semua pengujian lulus 100%.

## Verification Evidence
- `npx vitest run src/services/withdrawalReportService.test.ts`: 13 passed (13).
- Regression test `npx vitest run src/services/shoppingSavingsLedgerService.test.ts`: 11 passed (11).
- TypeScript check verified on `src/services/withdrawalReportService.ts`.

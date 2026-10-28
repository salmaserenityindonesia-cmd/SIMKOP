---
phase: 24
plan: 3
wave: 3
gap_closure: false
---

# Plan 24.3: Integrasi Laporan Retail & Rekonsiliasi, Unit Test & Build Verification

## Objective
Menyelesaikan siklus penuh fitur shift kasir dan rekonsiliasi kas kecil:
1. Mengintegrasikan tabel riwayat shift kasir dan ringkasan rekonsiliasi selisih kas ke dalam Tab 1 ("Tutup Kasir Harian & Rekonsiliasi") pada halaman Laporan Retail (`src/pages/admin/laporan-retail/index.tsx`).
2. Menghubungkan mutasi modal awal dan setoran penjualan ke tabel `cash_flow`.
3. Menulis unit test komprehensif (`src/services/cashierShiftService.test.ts`) untuk memverifikasi logika bisnis kalkulasi expected cash, difference, status shift, dan dual-layer fallback.
4. Memvalidasi seluruh rangkaian unit test Vitest dan kompilasi produksi Vite (`npm run build`) dengan exit code 0.

## Context
Load these files for context:
- src/services/cashierShiftService.ts
- src/pages/admin/laporan-retail/index.tsx
- src/services/retail-report.service.ts
- src/utils/retailExporter.ts

## Tasks

<task type="auto">
  <name>Integrate Cashier Shifts and Reconciliation History into Retail Report</name>
  <files>
    src/pages/admin/laporan-retail/index.tsx,
    src/services/retail-report.service.ts
  </files>
  <action>
    1. Di `src/services/retail-report.service.ts`:
       - Tambahkan pemanggilan `getShiftHistory(startDate, endDate)` dan integrasikan ke dalam data yang dikembalikan atau fungsi pembantu `getShiftReconciliationReport(startDate, endDate)`.
    2. Di `src/pages/admin/laporan-retail/index.tsx`:
       - Pada Tab "Tutup Kasir Harian & Rekonsiliasi":
         * Di samping tabel log transaksi penjualan, tambahkan seksi / tabel "Riwayat Sesi Shift & Rekonsiliasi Kasir".
         * Kolom tabel: No. Shift, Waktu Buka & Tutup, Nama Kasir, Modal Awal (Kas Kecil), Penjualan Tunai, Total Uang Fisik Kasir (Actual), Selisih Kas (badge Seimbang/Surplus/Defisit), Status (Open/Closed), dan Catatan.
         * Tombol aksi untuk melihat rincian / mencetak ulang struk Z-Report ringkasan shift.
       - Perbarui export Excel di `src/utils/retailExporter.ts` jika relevan untuk menyertakan ringkasan shift kasir.
  </action>
  <verify>
    Tabel riwayat sesi shift kasir tampil rapi dengan data rekonsiliasi uang fisik dan selisih kas sesuai rentang tanggal yang difilter.
  </verify>
  <done>
    Integrasi laporan retail untuk rekonsiliasi kas kasir telah selesai.
  </done>
</task>

<task type="auto">
  <name>Comprehensive Unit Tests and Production Build Verification</name>
  <files>
    src/services/cashierShiftService.test.ts
  </files>
  <action>
    1. Buat berkas unit test `src/services/cashierShiftService.test.ts`:
       - Uji fungsi `openShift`: membentuk shift baru dengan `status: 'open'`, membuat nomor shift unik, mencatat pengeluaran `MODAL_KASIR_AWAL` di `cash_flow`.
       - Uji fungsi `getActiveShift`: mengembalikan shift terbuka kasir yang sesuai.
       - Uji fungsi `getShiftSalesSummary`: menghitung akumulasi penjualan tunai dan non-tunai.
       - Uji fungsi `closeShift`:
         * Kasus kas seimbang: `actual_cash === expected_cash` -> `difference = 0`.
         * Kasus kas surplus / lebih: `actual_cash > expected_cash` -> `difference > 0` dan mutasi `SELISIH_LEBIH_KASIR`.
         * Kasus kas defisit / kurang: `actual_cash < expected_cash` -> `difference < 0` dan mutasi `SELISIH_KURANG_KASIR`.
         * Mutasi pengembalian modal dan setoran penjualan tunai tercatat dengan benar.
       - Uji penolakan pembukaan shift baru jika sudah ada shift aktif.
       - Uji ketahanan fallback `localStorage` saat koneksi Supabase bermasalah.
    2. Jalankan test suite:
       `npx vitest run src/services/cashierShiftService.test.ts`
       `npx vitest run` (seluruh suite)
    3. Jalankan kompilasi produksi Vite:
       `npm run build`
  </action>
  <verify>
    Seluruh pengujian unit lulus 100% dan `npm run build` selesai tanpa error kompilasi.
  </verify>
  <done>
    Fitur shift buka/tutup kasir dan rekonsiliasi kas kecil POS terverifikasi sepenuhnya.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Tab 1 pada Laporan Retail memuat tabel "Riwayat Sesi Shift & Rekonsiliasi Kasir".
- [ ] `src/services/cashierShiftService.test.ts` lulus seluruh pengujian (status, selisih, mutasi kas).
- [ ] Seluruh unit test vitest di SIMKOP lulus 100%.
- [ ] `npm run build` sukses (exit code 0).

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Sistem siap digunakan di lingkungan produksi


# Phase 24 Plan 2: UI Modals Buka & Tutup Kasir serta Route Guard POS Summary

## Objective
Membangun antarmuka interaktif dan mekanisme pengamanan (route guard & action guard) untuk alur operasional shift kasir:
1. Modal pembukaan shift kasir (`BukaKasirModal.tsx`) dengan input kas kecil awal dan tombol cepat denominasi.
2. Modal penutupan shift kasir (`TutupKasirModal.tsx`) dengan rekonsiliasi kas fisik, kalkulator lembaran/koin, banner selisih kas real-time, dan struk Z-Report thermal 80mm/58mm.
3. Integrasi status shift di `POSHeader.tsx` dan penguncian operasional checkout di `src/pages/pos/index.tsx` agar penjualan terikat pada `shift_id`.

## Key Deliverables Completed

### 1. `BukaKasirModal.tsx` (`src/components/pos/BukaKasirModal.tsx`)
- Modal terpusat dengan backdrop blur yang tidak dapat ditutup secara tidak sengaja sebelum shift terbuka.
- Input modal kas kecil awal (uang kembalian) dengan pemformatan otomatis Rupiah (`id-ID`).
- Tombol cepat (quick buttons) nominal: Rp 50.000, Rp 100.000, Rp 200.000, Rp 500.000, dan Rp 1.000.000.
- Field catatan shift opsional untuk mencatat perincian awal uang pecahan.
- Informasi kasir dan tanggal operasional.
- Notifikasi pencatatan otomatis mutasi kas keluar operasional (`MODAL_KASIR_AWAL`).
- Validasi nominal non-negatif dan loading state saat memanggil `openShift`.

### 2. `TutupKasirModal.tsx` (`src/components/pos/TutupKasirModal.tsx`)
- Menampilkan identitas shift: Nomor Shift (`SHF-...`), Nama Kasir, dan Waktu Buka.
- Kartu kalkulasi finansial real-time:
  - Modal Awal Kasir
  - Penjualan Tunai Sesi Ini (+ jumlah transaksi lunas)
  - Estimasi Total Kas Sistem (Expected Cash = Modal Awal + Tunai)
  - Pembukuan non-tunai (Simpanan Belanja & Bon Toko / Tempo Gaji)
- Input uang fisik di laci kasir (Actual Cash).
- Kalkulator lembaran uang dan koin accordion (pecahan Rp 100k, 50k, 20k, 10k, 5k, 2k, 1k, koin 500, 200, 100) yang otomatis menghitung total uang fisik.
- Banner selisih kas adaptif dan real-time:
  - **Seimbang (Rp 0)**: Emerald banner (`Kas Seimbang, siap diserahterimakan`).
  - **Surplus (+Rp Z)**: Blue banner (`Terdapat Selisih Kas Lebih`).
  - **Defisit (-Rp Z)**: Amber banner (`Terdapat Selisih Kas Kurang`).
- Format cetak struk Z-Report ringkasan shift kasir via direct thermal printing (`@media print` 80mm/58mm layout lengkap dengan slot tanda tangan kasir dan supervisor).
- Tombol konfirmasi tutup shift kasir terhubung ke `closeShift`.

### 3. POS Header & Operational Guarding (`POSHeader.tsx` & `src/pages/pos/index.tsx`)
- Status Shift di `POSHeader.tsx`:
  - Jika shift aktif: menampilkan badge hijau berdenyut, nama kasir, nomor shift, nominal modal awal, serta tombol "Tutup Kasir".
  - Jika kasir belum buka shift: menampilkan tombol peringatan merah/amber "Kasir Belum Buka" yang dapat diklik untuk memunculkan modal buka shift.
- Integrasi Guard di `src/pages/pos/index.tsx`:
  - Pengecekan `getActiveShift` otomatis saat inisialisasi sesi POS. Jika belum ada shift, otomatis membuka `BukaKasirModal`.
  - Input pencarian barcode / produk (`ProductSearchInput`) dinonaktifkan (`disabled`) dengan placeholder informatif bila shift belum buka.
  - Tombol bayar pada `SummaryPanel` diblokir (`isShiftActive={false}`) dengan visual abu-abu nonaktif.
  - Shortcut global (F1, F2/Ctrl+K, F4, F8, F9, Space) dicegat dengan toast peringatan: *"Harap buka shift kasir terlebih dahulu"*.
  - Callback selesai tutup shift: mereset keranjang belanja dan memunculkan kembali modal buka kasir untuk shift selanjutnya.
- `posCheckoutService.ts`:
  - `CheckoutPayload` menerima parameter `shiftId?: string | null`.
  - Menyimpan `shift_id` langsung ke catatan penjualan di tabel `public.sales`.

## Verification & Empirical Proof
- TypeScript type-checking: `npx tsc --noEmit` lolos bersih tanpa error (exit code 0).
- Production Build: `npm run build` berhasil menghasilkan bundle siap produksi dalam 772ms (exit code 0).
- Test Runner: `npx vitest run` seluruh 38 unit test pada 7 test files lulus 100% (exit code 0).

## Commits Landed
- `bc395550`: `feat(phase-24): build buka kasir and tutup kasir reconciliation modals`
- `48530926`: `feat(phase-24): integrate shift guard, header status, and checkout locking into pos page`

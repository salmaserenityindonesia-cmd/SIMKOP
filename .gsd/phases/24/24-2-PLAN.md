---
phase: 24
plan: 2
wave: 2
gap_closure: false
---

# Plan 24.2: UI Modals Buka & Tutup Kasir serta Route Guard POS

## Objective
Membangun antarmuka pengguna interaktif untuk operasional shift kasir:
1. Membuat komponen modal `BukaKasirModal.tsx` yang muncul saat kasir belum memiliki sesi shift aktif, dengan input kas kecil awal (pecahan uang kembalian) dan tombol cepat denominasi.
2. Membuat komponen modal `TutupKasirModal.tsx` untuk menghitung uang fisik di laci kasir (actual cash), rekonsiliasi penjualan tunai vs modal awal, evaluasi selisih kas (surplus/defisit/seimbang), dan pencetakan struk Z-Report ringkasan tutup kasir format 80mm/58mm.
3. Menghubungkan pemeriksaan shift aktif ke `POSHeader.tsx` dan `src/pages/pos/index.tsx`, sehingga transaksi checkout diblokir sebelum kasir membuka shift.

## Context
Load these files for context:
- src/components/pos/POSHeader.tsx
- src/pages/pos/index.tsx
- src/services/cashierShiftService.ts
- src/services/posCheckoutService.ts

## Tasks

<task type="auto">
  <name>Build BukaKasirModal and TutupKasirModal Components</name>
  <files>
    src/components/pos/BukaKasirModal.tsx,
    src/components/pos/TutupKasirModal.tsx
  </files>
  <action>
    1. Buat `src/components/pos/BukaKasirModal.tsx`:
       - Tampilkan modal terpusat (tidak dapat ditutup dengan klik luar jika belum buka shift).
       - Judul: "Buka Shift Kasir Baru".
       - Input "Modal Kas Kecil Awal (Uang Kembalian)" dengan format nominal Rupiah otomatis.
       - Quick buttons pilihan modal awal cepat: Rp 50.000, Rp 100.000, Rp 200.000, Rp 500.000, dan Rp 1.000.000.
       - Field catatan shift opsional.
       - Tombol "Mulai Operasional Kasir" dengan feedback loading dan disable jika nominal belum valid / minus.
    2. Buat `src/components/pos/TutupKasirModal.tsx`:
       - Menampilkan identitas shift: No. Shift, Nama Kasir, dan Waktu Buka.
       - Tampilkan kartu ringkasan kalkulasi:
         * Modal Awal: Rp X
         * Total Penjualan Tunai Sesi Ini: Rp Y
         * Estimasi Total Uang Kasir (Expected): Rp (X + Y)
         * Total Non-Tunai (Simpanan & Bon Toko sebagai informasi pembukuan)
       - Input "Uang Fisik Kasir (Actual Cash)" dengan format Rupiah.
       - Section kalkulator pecahan uang (lembar Rp 100k, 50k, 20k, 10k, 5k, 2k, koin 1k, 500) yang dapat di-toggle (accordion) untuk mempermudah kasir menghitung laci.
       - Banner selisih kas real-time:
         * **Seimbang (Rp 0)**: warna hijau emerald ("Kas Seimbang, siap diserahterimakan").
         * **Lebih (+Rp Z)**: warna biru ("Terdapat selisih kas lebih Rp Z").
         * **Kurang (-Rp Z)**: warna merah/amber ("Terdapat selisih kas kurang Rp Z").
       - Tombol "Cetak Struk Tutup Kasir (Z-Report)" yang membuka jendela cetak mini thermal struk ringkasan kasir.
       - Tombol "Konfirmasi Tutup Shift Kasir" dengan loading state.
  </action>
  <verify>
    Komponen me-render formulir, menghitung selisih kas secara real-time, dan menangani event submit dengan mulus.
  </verify>
  <done>
    Modal buka kasir dan tutup kasir siap diintegrasikan ke halaman POS.
  </done>
</task>

<task type="auto">
  <name>Integrate Shift Guard, Header Status, and Checkout Locking into POS Page</name>
  <files>
    src/components/pos/POSHeader.tsx,
    src/pages/pos/index.tsx
  </files>
  <action>
    1. Di `src/components/pos/POSHeader.tsx`:
       - Tambahkan props: `activeShift: CashierShift | null`, `onOpenBukaKasir?: () => void`, `onOpenTutupKasir?: () => void`.
       - Pada bar status:
         * Jika `activeShift` aktif: tampilkan badge hijau dengan nomor shift dan modal awal, serta tombol "Tutup Kasir / Shift".
         * Jika `activeShift` null: tampilkan badge merah/amber "Kasir Belum Buka" yang dapat diklik untuk membuka `BukaKasirModal`.
    2. Di `src/pages/pos/index.tsx`:
       - Panggil `getActiveShift(currentUser.id)` saat inisialisasi.
       - Jika belum ada shift aktif, otomatis buka `BukaKasirModal`.
       - Pasang guard/locking pada UI:
         * Input pencarian produk (`ProductSearchInput`) dinonaktifkan / read-only sebelum shift dibuka.
         * Tombol Bayar / F9 dinonaktifkan jika belum ada shift aktif.
         * Jika user memaksa klik bayar atau tambah item, munculkan notifikasi: "Harap buka shift kasir terlebih dahulu".
       - Saat `processCheckout` berhasil, teruskan `shiftId: activeShift.id` ke dalam payload checkout agar penjualan terikat pada sesi shift kasir bersangkutan.
       - Callback penutupan shift: setelah kasir sukses melakukan tutup shift, reset keranjang dan alihkan status agar modal buka kasir siap untuk shift berikutnya.
  </action>
  <verify>
    Kasir tidak dapat melakukan transaksi saat shift belum dibuka. Setelah buka shift, seluruh fungsi kasir aktif. Saat tutup shift, dialog rekonsiliasi dan cetak struk berfungsi sempurna.
  </verify>
  <done>
    Penyekatan shift dan alur buka/tutup kasir aktif di POS.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `BukaKasirModal.tsx` muncul saat POS dibuka tanpa sesi shift aktif.
- [ ] Kasir dapat menginput modal awal kas kecil dan menekan "Mulai Operasional Kasir".
- [ ] `TutupKasirModal.tsx` menampilkan modal awal, penjualan tunai, estimasi uang, input uang fisik, dan selisih secara realtime.
- [ ] Struk ringkasan tutup kasir (Z-Report) dapat dicetak.
- [ ] `POSHeader.tsx` menampilkan status shift aktif dan tombol buka/tutup kasir.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Navigasi dan operasional kasir responsif tanpa regresi


---
phase: 22
plan: 3
wave: 3
gap_closure: false
---

# Plan 22.3: Refaktor Hotkey POS (F8), Modal Parked Sales & Restock Inventori

## Objective
Mengatasi konflik tombol F12 dengan browser DevTools dengan mengalihkan fungsi Tahan Transaksi ke shortcut F8 (serta menghapus tombol shortcut F8 Diskon yang tidak digunakan). Mengimplementasikan workflow penahanan transaksi dengan reservasi stok, modal daftar transaksi tertahan (`ParkedTransactionsModal`) dengan tombol Reload (muat kembali ke keranjang) dan Hapus (batalkan & pulihkan stok barang ke inventory), serta eksekusi berkala auto-cleanup untuk transaksi kadaluwarsa.

## Context
Load these files for context:
- src/pages/pos/index.tsx
- src/components/pos/POSHeader.tsx
- src/components/pos/SummaryPanel.tsx
- src/services/posCheckoutService.ts
- src/services/posSettingsService.ts

## Tasks

<task type="auto">
  <name>Update POS Header and Keyboard Hotkeys from F12 to F8</name>
  <files>
    src/components/pos/POSHeader.tsx
    src/components/pos/SummaryPanel.tsx
    src/pages/pos/index.tsx
  </files>
  <action>
    1. Perbarui `src/components/pos/POSHeader.tsx`:
       - Hapus tombol/shortcut "F8 Diskon".
       - Tambahkan tombol pintas "F8 Tahan" dan indikator/badge jumlah belanja tertahan (contoh: "Tersimpan (X)").
       - Sediakan callback `onOpenParkedModal` agar kasir bisa mengeklik badge untuk membuka daftar belanja ditahan.
    2. Perbarui `src/components/pos/SummaryPanel.tsx`:
       - Ubah label tombol dari "Tahan [F12]" menjadi "Tahan [F8]".
       - Sediakan tombol sekunder atau badge untuk melihat transaksi tertahan jika ada.
    3. Perbarui keyboard handler di `src/pages/pos/index.tsx`:
       - Tangkap event `e.key === 'F8'` dengan `e.preventDefault()` agar tidak memicu fungsi browser bawaan.
       - Jika keranjang ada item, picu fungsi penahanan transaksi (`handleHoldTransaction`).
       - Hapus segala event handler yang berkaitan dengan F8 Diskon.
  </action>
  <verify>
    Menekan F8 tidak membuka DevTools browser dan memicu alur penahanan transaksi.
  </verify>
  <done>
    Hotkey F8 aktif untuk Tahan Transaksi dan tombol F8 Diskon telah dihapus.
  </done>
</task>

<task type="auto">
  <name>Implement Parked Sales Service Logic and Stock Reservation</name>
  <files>
    src/services/posParkedService.ts
    src/services/posCheckoutService.ts
  </files>
  <action>
    Buat atau perbarui layanan penahanan transaksi `src/services/posParkedService.ts`:
    1. Fungsi `holdTransaction(params)`:
       - Ambil durasi hold dari `posSettingsService.getPosSettings()`.
       - Hitung `expires_at = new Date(Date.now() + maxHoldDuration * 60 * 1000).toISOString()`.
       - Buat record pada tabel `sales` dengan `status = 'parked'`, `sale_status = 'parked'`, `expires_at`, dan detail member/catatan.
       - Masukkan rincian produk ke `sale_items`.
       - Kurangi stok produk di database `products` (stok di-reserve agar tidak terbeli ganda).
       - Simpan salinan lokal ke storage jika Supabase offline/unreachable.
    2. Fungsi `getParkedSales()`:
       - Ambil transaksi aktif dengan status `'parked'`.
       - Sertakan detail relasi `sale_items` dan data member jika ada.
    3. Fungsi `resumeParkedSale(saleId)`:
       - Ambil item dari transaksi ditahan.
       - Hapus atau tandai sale sebagai `'resumed'` / delete record parked tanpa mengembalikan stok ganda (karena item akan kembali ke keranjang kasir).
    4. Fungsi `cancelAndRestockParkedSale(saleId)`:
       - Ambil item dari transaksi ditahan.
       - Kembalikan stok setiap item ke tabel `products` (`stock = stock + qty`).
       - Ubah status sale menjadi `'cancelled'` atau hapus dari database.
  </action>
  <verify>
    Fungsi penahanan, resume, dan pembatalan dengan restock teruji dan mengembalikan data yang valid.
  </verify>
  <done>
    Service transaksi ditahan dan manajemen reservasi/pemulihan stok siap digunakan.
  </done>
</task>

<task type="auto">
  <name>Build ParkedTransactionsModal with Reload and Delete Restock Workflow</name>
  <files>
    src/components/pos/ParkedTransactionsModal.tsx
    src/pages/pos/index.tsx
  </files>
  <action>
    1. Buat modal `src/components/pos/ParkedTransactionsModal.tsx`:
       - Tampilkan daftar transaksi ditahan: Nomor nota, Tanggal/jam simpan, Nama pelanggan/member, Sisa waktu penahanan (countdown) atau label "KADALUWARSA", Jumlah item, dan Total tagihan.
       - Tombol **Muat Kembali (Reload)**: Mengembalikan item belanjaan ke keranjang aktif kasir, menutup modal, dan mengosongkan item dari daftar tahan.
       - Tombol **Hapus**: Membatalkan transaksi ditahan, mengeksekusi pengembalian stok barang ke inventory produk, dan menyegarkan daftar modal.
    2. Hubungkan ke `src/pages/pos/index.tsx`:
       - Tambahkan modal `ParkedTransactionsModal` ke state modal kasir.
       - Tambahkan periodic check atau pemanggilan `cleanupExpiredParkedSales()` saat POS pertama kali dibuka dan saat modal daftar belanja ditahan dibuka.
       - Berikan toast notifikasi ketika transaksi berhasil ditahan, dimuat kembali, atau dihapus dengan restock sukses.
  </action>
  <verify>
    Modal menampilkan daftar belanja ditahan, tombol Muat Kembali mengembalikan isi keranjang, dan tombol Hapus mengembalikan stok ke tabel produk.
  </verify>
  <done>
    Seluruh antarmuka dan alur interaksi Tahan Belanja selesai dan terintegrasi di POS.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Tombol F8 Diskon dihapus dari header POS.
- [ ] Menekan tombol Tahan atau hotkey F8 menahan transaksi kasir dan mengosongkan keranjang aktif.
- [ ] Modal daftar belanja ditahan menyediakan tombol Muat Kembali dan Hapus.
- [ ] Tombol Hapus pada modal memulihkan stok inventori produk.
- [ ] Transaksi kadaluwarsa otomatis dibersihkan dan stoknya dikembalikan ke inventory.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Zero build warnings / errors

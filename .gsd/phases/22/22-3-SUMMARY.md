# Summary Plan 22.3: Refaktor Hotkey POS (F8), Modal Parked Sales & Restock Inventori

## Completed Work
1. **Pembaruan Hotkey & Header POS**:
   - Menghapus tombol dan handler shortcut "F8 Diskon".
   - Mengalihkan fungsi Tahan Transaksi dari F12 ke F8 (dengan `e.preventDefault()`), meniadakan konflik native browser DevTools.
   - Mengubah label tombol di `SummaryPanel.tsx` menjadi "Tahan [F8]".
   - Menambahkan tombol/badge "Ditahan (X)" pada `POSHeader.tsx` dan `SummaryPanel.tsx` untuk kemudahan navigasi kasir.
2. **Layanan Transaksi Tertahan (`src/services/posParkedService.ts`)**:
   - `holdTransaction()`: Mengurangi stok produk di `products` (reservasi stok), menyimpan transaksi dengan status `'parked'`, dan menghitung tenggat kedaluwarsa `expires_at` sesuai `pos_settings`.
   - `getParkedSales()`: Mengambil daftar transaksi tertahan (Supabase + local fallback), mengevaluasi status kadaluwarsa, dan secara otomatis memicu cleanup expired sales.
   - `resumeParkedSale()`: Mengembalikan barang ke keranjang kasir aktif dan menghapus status parked tanpa risiko double-deduction.
   - `cancelAndRestockParkedSale()`: Membatalkan transaksi tertahan dan mengembalikan (*restore*) stok seluruh barang ke tabel `products`.
3. **Parked Transactions Modal Component**:
   - Dibuat `src/components/pos/ParkedTransactionsModal.tsx` yang menampilkan daftar transaksi tertahan, nama member/pelanggan, sisa waktu/label kadaluwarsa, total item, dan tombol **Muat Kembali** serta **Hapus & Restock**.
   - Terintegrasi penuh di `src/pages/pos/index.tsx` dengan trigger auto-cleanup saat POS dimuat.

## Verification
- `npx tsc --noEmit` sukses (exit code 0).
- Penahanan transaksi dengan F8, pengembalian item, dan restock pembatalan terhubung secara menyeluruh.

## Commit
Commit hash per-plan dibuat setelah verifikasi.


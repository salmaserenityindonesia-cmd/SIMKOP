# Research & Architectural Analysis: Phase 22

## 1. Problem Statement & Hotkey Conflict Analysis
- **Problem**: In previous iterations, holding a transaction (Parked Sales) was assigned to the `F12` hotkey. On all major web browsers (Chrome, Edge, Firefox), `F12` is hardwired to open the Browser Developer Tools. Attempting to catch `F12` in JavaScript often fails or conflicts with user expectations and kiosk browser setups.
- **Resolution**: Shortcut `F8` was previously assigned to a non-functional or redundant "Diskon" modal. In SIMKOP Enterprise POS, member discounts are automatically calculated based on membership status (`selectedMember ? subtotal * 0.05 : 0`) and manual discounts are not part of current operational rules. Thus, `F8` is repurposed for "Tahan Transaksi [F8]".

## 2. Database Schema & RPC Design
- **Table**: `public.pos_settings`
  ```sql
  CREATE TABLE IF NOT EXISTS public.pos_settings (
    id integer PRIMARY KEY DEFAULT 1,
    max_hold_duration_minutes integer NOT NULL DEFAULT 120,
    allow_negative_stock boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT single_pos_setting CHECK (id = 1)
  );
  ```
- **Sales Table Extension**:
  - `expires_at timestamp with time zone` added to `public.sales`.
  - Transaksi berstatus `parked` (dan `sale_status = 'parked'`) memiliki timestamp kedaluwarsa.
- **RPC `cleanup_expired_parked_sales()`**:
  - Mencari penjualan di mana `expires_at < now()` dan status `'parked'`.
  - Mengembalikan stok produk dengan iterasi `sale_items` (`products.stock = products.stock + quantity`).
  - Mengubah status penjualan menjadi `'cancelled'` (atau `'expired'`).

## 3. Storage Resilience Architecture
- Sesuai dengan pola yang sukses diterapkan pada Phase 21 (`settingsService.ts`):
  1. In-memory variable cache untuk performa tinggi di komponen UI POS.
  2. Supabase PostgREST async client.
  3. `localStorage` fallback (`simkop_pos_settings`) yang mengisolasi UI dari galat skema Supabase (`PGRST205` / `42P01` "table not in schema cache").
  4. Default constants (`DEFAULT_POS_SETTINGS` = 120 menit).

## 4. POS Parked Transactions Workflow
- **Hold (Tahan)**:
  1. Kasir menekan `F8` atau tombol "Tahan [F8]".
  2. Dialog konfirmasi/catatan opsional (nama pembeli / referensi).
  3. Transaksi disimpan ke tabel `sales` (status `parked`, `expires_at = now() + duration`).
  4. Produk disimpan ke `sale_items` dan stok produk di tabel `products` dikurangi sementara agar tidak terjadi over-selling.
  5. Keranjang kasir dikosongkan.
- **Reload (Muat Kembali)**:
  1. Kasir membuka modal daftar belanja ditahan.
  2. Kasir memilih "Muat Kembali".
  3. Item dimuat kembali ke keranjang kasir.
  4. Status transaksi tertahan ditandai selesai/dihapus sehingga saat kasir checkout nanti, pengurangan stok tidak terhitung dua kali.
- **Hapus / Batal (Delete & Restock)**:
  1. Kasir memilih "Hapus" pada transaksi tertahan.
  2. Stok setiap barang dalam transaksi tersebut dikembalikan (*restored*) ke tabel `products`.
  3. Transaksi dibatalkan / dihapus dari daftar belanja tertahan.
- **Auto-Expire**:
  1. Dipicu saat kasir dimuat atau modal dibuka.
  2. Mengeksekusi RPC `cleanup_expired_parked_sales()`.
  3. Transaksi lewat batas waktu dibatalkan dan stok produk dikembalikan secara otomatis.


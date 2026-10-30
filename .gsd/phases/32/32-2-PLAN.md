---
phase: 32
plan: 2
wave: 2
gap_closure: false
---

# Plan 32.2: Wave 2 - Service Layer Retur Pembelian & Logika Mutasi Klaim

## Objective
Membangun service layer `src/services/purchaseReturnService.ts` yang mengelola seluruh alur logika bisnis retur pembelian ke supplier: query riwayat faktur retur, detail retur beserta rincian item, pembuatan retur dengan validasi dan pemotongan stok inventori, eksekusi penyelesaian klaim barang pengganti (atomic RPC & offline fallback) dengan penambahan kembali stok master produk, serta pencatatan jejak audit. Dilengkapi rangkaian unit test komprehensif pada `src/services/purchaseReturnService.test.ts`.

## Context
Load these files for context:
- src/services/purchaseService.ts
- src/services/koperasiService.ts
- supabase/migrations/026_create_purchase_returns_tables.sql

## Tasks

<task type="auto">
  <name>Implement purchaseReturnService with Claim Restock & Fallbacks</name>
  <files>
    src/services/purchaseReturnService.ts
  </files>
  <action>
    Buat `src/services/purchaseReturnService.ts`:
    1. Ekspor interface TypeScript:
       - `Supplier`: `{ id: string; name: string; phone?: string; address?: string }`
       - `PurchaseReturnType`: `'BARANG_RUSAK' | 'PIUTANG_PENGGANTIAN'`
       - `ClaimStatus`: `'MENUNGGU_PENGGANTIAN' | 'SELESAI_DIGANTI' | 'HAPUS_BUKU'`
       - `PurchaseReturnItem`: `{ id: string; return_id?: string; product_id: string; product_name?: string; sku?: string; qty: number; cost_per_unit: number; subtotal: number; reason?: string }`
       - `PurchaseReturn`: `{ id: string; return_number: string; return_date: string; supplier_id?: string; supplier_name: string; original_invoice_number?: string; return_type: PurchaseReturnType; claim_status: ClaimStatus; total_amount: number; replacement_received_at?: string; notes?: string; created_by?: string; created_at: string; updated_at: string; items?: PurchaseReturnItem[] }`
       - `CreatePurchaseReturnPayload`: `{ return_number: string; return_date: string; supplier_id?: string; supplier_name: string; original_invoice_number?: string; return_type: PurchaseReturnType; notes?: string; items: { product_id: string; qty: number; cost_per_unit: number; reason?: string }[] }`
    2. Sediakan state fallback in-memory (`mockSuppliers`, `mockReturns`, `mockReturnItems`) untuk offline development dan testing.
    3. Implementasikan fungsi-fungsi service:
       - `getSuppliers()`: Mengambil daftar supplier aktif dari database atau fallback list default.
       - `getPurchaseReturns()`: Mengambil seluruh riwayat faktur retur diurutkan dari yang terbaru (`return_date DESC, created_at DESC`).
       - `getPurchaseReturnDetail(returnId: string)`: Mengambil satu header retur lengkap beserta array `items` barangnya.
       - `createPurchaseReturn(payload: CreatePurchaseReturnPayload, userId?: string)`:
         * Validasi kuantitas item (`qty > 0`) dan ketersediaan stok fisik pada tabel `products` (`stock >= qty`).
         * Kurangi stok produk di database `products` (`stock = stock - item.qty`) atau di mock in-memory.
         * Simpan header retur ke `purchase_returns` dan baris barang ke `purchase_return_items`.
         * Catat entri ke `audit_logs` (`action: 'CREATE_RETURN'`).
       - `completeReturnClaim(returnId: string, userId?: string, notes?: string)`:
         * Pertama, coba panggil RPC `supabase.rpc('complete_return_claim', { p_return_id: returnId, p_user_id: userId, p_notes: notes })`.
         * Jika RPC gagal atau belum ada, jalankan fallback mutasi:
           - Periksa status klaim harus `'MENUNGGU_PENGGANTIAN'` dan tipe `'PIUTANG_PENGGANTIAN'`.
           - Ambil item retur, lalu tambahkan kembali stoknya ke tabel `products` (`stock = stock + item.qty`).
           - Update header retur: `claim_status = 'SELESAI_DIGANTI'`, `replacement_received_at = new Date().toISOString()`.
           - Catat log ke `audit_logs` (`action: 'COMPLETE_CLAIM'`).
       - `updatePurchaseReturn(returnId: string, payload: Partial<CreatePurchaseReturnPayload>, userId?: string, reason?: string)`:
         * Memperbarui nomor retur/catatan jika belum selesai diganti dengan validasi alasan koreksi wajib.
       - Helper `generateReturnNumber()`: Menghasilkan format nomor retur terstandarisasi `RET/YYYYMM/XXXX`.
  </action>
  <verify>
    npm run typecheck
  </verify>
  <done>
    Service purchaseReturnService berhasil diimplementasikan dengan antarmuka lengkap, validasi stok, atomic restock claim, dual-layer fallback, dan typecheck sukses.
  </done>
</task>

<task type="auto">
  <name>Create Comprehensive Unit Tests for purchaseReturnService</name>
  <files>
    src/services/purchaseReturnService.test.ts
  </files>
  <action>
    Buat berkas tes unit `src/services/purchaseReturnService.test.ts` menggunakan Vitest:
    1. Uji `createPurchaseReturn`:
       - Berhasil membuat retur tipe `PIUTANG_PENGGANTIAN` dan mengurangi kuantitas stok produk terkait.
       - Gagal/menolak pembuatan retur jika kuantitas retur melebihi stok gudang yang tersedia.
    2. Uji `completeReturnClaim`:
       - Berhasil mengubah status klaim dari `MENUNGGU_PENGGANTIAN` menjadi `SELESAI_DIGANTI`.
       - Berhasil menambahkan kembali (restock) kuantitas produk ke stok inventori master `products`.
       - Mengisi nilai `replacement_received_at` dengan waktu penerimaan.
       - Menolak eksekusi jika retur bertipe `BARANG_RUSAK` atau sudah berstatus `SELESAI_DIGANTI` (idempotency check).
    3. Uji `getPurchaseReturns` dan `getPurchaseReturnDetail`:
       - Mengembalikan daftar retur dengan detail item yang tepat.
    4. Jalankan pengujian: `npx vitest run src/services/purchaseReturnService.test.ts`.
  </action>
  <verify>
    npx vitest run src/services/purchaseReturnService.test.ts
  </verify>
  <done>
    Rangkaian unit test purchaseReturnService lulus 100% memverifikasi alur pengurangan stok awal dan penambahan kembali stok saat klaim diselesaikan.
  </done>
</task>

## Success Criteria
- [ ] Berkas `src/services/purchaseReturnService.ts` mengekspor tipe dan metode CRUD retur lengkap.
- [ ] Validasi stok fisik mencegah retur jika kuantitas melebihi stok gudang.
- [ ] `completeReturnClaim` secara atomik mengubah status menjadi `SELESAI_DIGANTI` dan mengembalikan kuantitas item ke stok master `products`.
- [ ] Seluruh unit test pada `src/services/purchaseReturnService.test.ts` lulus 100%.

# Summary 80.2: Service Layer Refactoring & Compatibility Fallbacks in koperasiService.ts

## Accomplished
- Dibuat berkas kontrak tipe data `src/types/purchase.ts` (`PurchaseInvoiceItemRpc`, `CreatePurchaseInvoiceRpcPayload`, `CreatePurchaseInvoiceRpcResponse`).
- Direfaktor fungsi `catatRestockFaktur` pada `src/services/koperasiService.ts`:
  - Menambahkan validasi keberadaan nomor faktur dan minimal satu item restock.
  - Memanggil PostgreSQL RPC atomik `public.create_purchase_invoice_atomic` saat `supabase.rpc` tersedia.
  - Menangani respon sukses dari RPC dan memetakan hasilnya ke antarmuka `FakturPembelian`.
  - Menyediakan fallback sekuensial (dan in-memory mock fallback jika database offline/belum termigrasi) ketika fungsi RPC belum terpasang di remote (`PGRST202` / `42883`).
- Memastikan kompatibilitas pemanggilan dari form `src/pages/admin/ManajemenPembelian.tsx` tetap terjaga 100%.

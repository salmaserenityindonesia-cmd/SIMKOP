# Summary 81.1: Extract Purchase Invoice & Restock Domain to purchaseInvoiceService.ts

## Accomplished
- Dibuat berkas domain mandiri `src/services/purchaseInvoiceService.ts`:
  - Mengekstrak antarmuka `RestockItem`, `FakturPembelian`, dan `RiwayatStok`.
  - Mengimplementasikan `getFakturPembelian()`, `catatRestockFaktur()`, dan `getRiwayatStok()` dengan integrasi RPC atomik `create_purchase_invoice_atomic` dan fallback kompatibilitas.
- Dibuat unit test mandiri `src/services/purchaseInvoiceService.test.ts` (6 tes unit) yang menguji pemanggilan Supabase, integrasi RPC, fallback sekuensial tabel, dan in-memory mock.
- Seluruh 6 unit test lulus 100%.

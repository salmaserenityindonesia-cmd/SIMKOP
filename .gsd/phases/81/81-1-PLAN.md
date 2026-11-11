# Plan 81.1: Extract Purchase Invoice & Restock Domain to purchaseInvoiceService.ts

## Objective
Mengekstrak seluruh fungsionalitas faktur pembelian dan restock inventori dari `koperasiService.ts` ke dalam layanan domain terdedikasi `src/services/purchaseInvoiceService.ts`:
1. Tipe data: `RestockItem`, `FakturPembelian`, `RiwayatStok`.
2. Fungsi:
   - `getFakturPembelian(): Promise<FakturPembelian[]>`
   - `catatRestockFaktur(faktur: Omit<FakturPembelian, 'id' | 'totalNilai'>): Promise<FakturPembelian>`
   - `getRiwayatStok(produkId: string): Promise<RiwayatStok[]>`
3. Menyediakan unit test mandiri `src/services/purchaseInvoiceService.test.ts`.
4. Memastikan fallback in-memory dan integrasi RPC `create_purchase_invoice_atomic` tetap utuh.


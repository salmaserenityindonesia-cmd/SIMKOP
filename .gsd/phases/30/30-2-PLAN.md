---
phase: 30
plan: 2
wave: 2
gap_closure: false
---

# Plan 30.2: Wave 2 - Implement Purchase Service Layer & Audit Methods

## Objective
Membuat modul service khusus `src/services/purchaseService.ts` yang mengelola mutasi faktur pembelian, pemanggilan fungsi RPC database `update_purchase_invoice_atomic`, pengambilan riwayat audit log pembelian (`getPurchaseAuditLogs`), serta menyediakan fallback simulasi offline/mock yang aman jika tabel RPC belum diaplikasikan di remote instance.

## Context
Load these files for context:
- src/services/koperasiService.ts
- src/lib/supabaseClient.ts
- supabase/migrations/023_purchase_audit_and_stock_adjustment.sql

## Tasks

<task type="auto">
  <name>Implement Purchase Service and Audit Methods</name>
  <files>
    src/services/purchaseService.ts
    src/services/koperasiService.ts
  </files>
  <action>
    1. Buat berkas baru `src/services/purchaseService.ts`:
       - Definisikan interface:
         * `PurchaseAuditLog`:
           ```ts
           export interface PurchaseAuditLog {
             id: string;
             entity_id: string;
             action: string;
             old_data: any;
             new_data: any;
             performed_by: string | null;
             performer_name: string | null;
             notes: string;
             created_at: string;
           }
           ```
         * `UpdatePurchasePayload`:
           ```ts
           export interface UpdatePurchasePayload {
             noFaktur: string;
             tanggal: string;
             items: {
               id?: string;
               produkId: string;
               qty: number;
               hargaBeli: number;
             }[];
           }
           ```
       - Buat fungsi `updatePurchaseInvoice(purchaseId: string, payload: UpdatePurchasePayload, changeReason: string, user: { id: string; name: string })`:
         * Validasi `changeReason`: lempar error jika panjang kurang dari 10 karakter ("Alasan perubahan minimal 10 karakter.").
         * Panggil RPC Supabase:
           ```ts
           const { data, error } = await supabase.rpc('update_purchase_invoice_atomic', {
             p_purchase_id: purchaseId,
             p_invoice_number: payload.noFaktur,
             p_purchase_date: payload.tanggal,
             p_items: payload.items.map(item => ({
               product_id: item.produkId,
               qty: item.qty,
               buy_price: item.hargaBeli
             })),
             p_change_reason: changeReason,
             p_user_id: user.id,
             p_user_name: user.name
           });
           ```
         * Tangani error RPC atau fallback jika tabel belum ada / environment offline:
           - Lakukan penyesuaian delta stok pada mock/state produk.
           - Catat log perubahan audit pada in-memory mock logs.
       - Buat fungsi `getPurchaseAuditLogs(purchaseId: string): Promise<PurchaseAuditLog[]>`:
         * Ambil data dari tabel `public.audit_logs`:
           `supabase.from('audit_logs').select('*').eq('entity_id', purchaseId).order('created_at', { ascending: false })`
         * Jika error (fallback), kembalikan mock audit log yang relevan.
    2. Perbarui `src/services/koperasiService.ts`:
       - Ekspor ulang (re-export) fungsi dan tipe dari `purchaseService.ts` agar interoperabilitas komponen tetap terjaga tanpa breaking changes.
  </action>
  <verify>
    Periksa ekspor modul `src/services/purchaseService.ts` dan pastikan fungsi `updatePurchaseInvoice` dan `getPurchaseAuditLogs` terdefinisi dengan TypeScript typing yang ketat.
  </verify>
  <done>
    Service layer `purchaseService.ts` siap digunakan untuk mutasi faktur, rekonsiliasi stok, dan audit logs.
  </done>
</task>

## Success Criteria
- [ ] Berkas `src/services/purchaseService.ts` terbuat dan terintegrasi dengan `supabaseClient`.
- [ ] Fungsi `updatePurchaseInvoice` memanggil RPC `update_purchase_invoice_atomic` dengan validasi alasan koreksi (minimal 10 karakter).
- [ ] Fungsi `getPurchaseAuditLogs` dapat mengambil rekam jejak audit log perubahan faktur.
- [ ] `koperasiService.ts` tetap kompatibel dan mere-ekspor utilitas pembelian baru.


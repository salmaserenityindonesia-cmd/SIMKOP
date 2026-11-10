---
phase: 78
plan: 2
wave: 2
gap_closure: false
---

# Plan 78.2: Types & Client-Side Refactoring in posCheckoutService.ts

## Objective
Mendefinisikan kontrak data TypeScript pada `src/types/pos.ts` dan merefaktor `src/services/posCheckoutService.ts` untuk menggantikan mutasi beruntun client-side (insert sales, loop insert sale_items, loop update stock, insert deposit_transactions) dengan panggilan tunggal ke RPC `supabase.rpc('process_pos_checkout', payload)`.

## Context
Load these files for context:
- `src/types/pos.ts` (new file)
- `src/services/posCheckoutService.ts`
- `src/services/posCreditService.ts`
- `src/services/cashierShiftService.ts`

## Tasks

<task type="auto">
  <name>Define RPC Payload and Response Interfaces</name>
  <files>
    src/types/pos.ts
  </files>
  <action>
    1. Buat direktori `src/types` jika belum ada.
    2. Buat file `src/types/pos.ts`.
    3. Ekspor tipe-tipe berikut:
       - `PosCheckoutItem`:
         * `product_id: string`
         * `product_name: string`
         * `quantity: number`
         * `unit_price: number`
         * `subtotal: number`
         * `buy_price?: number`
       - `PosCheckoutRpcPayload`:
         * `p_sale_number: string`
         * `p_member_id: string | null`
         * `p_cashier_id: string | null`
         * `p_shift_id: string | null`
         * `p_subtotal: number`
         * `p_discount: number`
         * `p_total_amount: number`
         * `p_payment_scheme: string`
         * `p_paid_cash: number`
         * `p_paid_deposit: number`
         * `p_paid_credit: number`
         * `p_items: PosCheckoutItem[]`
       - `PosCheckoutRpcResponse`:
         * `success: boolean`
         * `sale_id?: string`
         * `sale_number?: string`
         * `message?: string`
  </action>
  <verify>
    Periksa ekspor modul `src/types/pos.ts` terkompilasi bersih tanpa error TypeScript.
  </verify>
  <done>
    Kontrak data TypeScript untuk RPC POS siap digunakan.
  </done>
</task>

<task type="auto">
  <name>Refactor posCheckoutService.ts to Call process_pos_checkout RPC</name>
  <files>
    src/services/posCheckoutService.ts
  </files>
  <action>
    1. Di `src/services/posCheckoutService.ts`:
       - Impor tipe dari `../types/pos`.
       - Pertahankan validasi cepat di sisi klien (validasi non-anggota hanya tunai, validasi limit kredit THP anggota via `getMemberFinancials`).
       - Dapatkan `effectiveShiftId` menggunakan prioritas: `payload.shiftId` -> `getLocalActiveShift()` -> `getActiveShiftId()`.
       - Susun payload `p_items` dari `payload.cart`:
         ```typescript
         const rpcItems: PosCheckoutItem[] = payload.cart.map(item => ({
           product_id: item.id,
           product_name: item.name,
           quantity: item.qty,
           unit_price: item.price,
           subtotal: item.subtotal ?? (item.qty * item.price),
           buy_price: item.buyPrice || 0
         }));
         ```
       - Panggil `supabase.rpc('process_pos_checkout', rpcPayload)`.
       - Tangani respons RPC:
         * Jika `error`: tangkap pesan error (misal: "Stok produk ... tidak mencukupi" atau "Saldo Simpanan Belanja tidak mencukupi") dan lempar pesan yang mudah dibaca oleh kasir.
         * Jika `data.success === false`: kembalikan `{ success: false, error: data.message }`.
         * Jika berhasil: kembalikan `{ success: true, saleId: data.sale_id, saleNumber: data.sale_number }`.
       - Sediakan fallback graceful jika fungsi RPC belum terpasang di database (kode error 'PGRST202') agar tetap backwards-compatible pada lingkungan tertentu jika dibutuhkan.
  </action>
  <verify>
    Pastikan `posCheckoutService.ts` lolos linter dan type-check.
  </verify>
  <done>
    Seluruh checkout kasir terpusat dalam 1 kali panggilan RPC atomik di database.
  </done>
</task>


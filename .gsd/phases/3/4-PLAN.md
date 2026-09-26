---
phase: 3
plan: 4
wave: 2
---

# Plan 3.4: Proses Checkout

## Objective
Menangani pembayaran tunai, kalkulasi kembalian, dan menyimpan transaksi ke Supabase.

## Context
- src/pages/admin/Kasir.tsx
- src/services/koperasiService.ts
- supabase schemas

## Tasks

<task type="auto">
  <name>Checkout Modal UI</name>
  <files>src/pages/admin/Kasir.tsx</files>
  <action>
    - Create a Checkout Modal triggered by a "Bayar" button in the cart
    - Add input for "Jumlah Bayar" (Cash given)
    - Show real-time calculation of "Kembalian" (Change)
  </action>
  <verify>npm run build</verify>
  <done>Checkout modal renders and calculates change correctly</done>
</task>

<task type="auto">
  <name>Save Transaction to Supabase</name>
  <files>src/services/koperasiService.ts, src/pages/admin/Kasir.tsx</files>
  <action>
    - Create `saveTransaction(items, total, payment)` in `koperasiService.ts`
    - Call this function upon confirming checkout in the modal
    - Clear the cart upon success and show a success toast
  </action>
  <verify>npm run build</verify>
  <done>Transaction saves to Supabase without errors</done>
</task>

## Success Criteria
- [ ] Cash given can be inputted
- [ ] Change is calculated
- [ ] Transaction is persisted to backend

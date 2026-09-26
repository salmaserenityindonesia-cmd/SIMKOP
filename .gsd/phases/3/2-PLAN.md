---
phase: 3
plan: 2
wave: 1
---

# Plan 3.2: Keranjang Belanja

## Objective
Mengelola state keranjang belanja di Kasir (tambah/hapus item, edit qty, kalkulasi subtotal).

## Context
- src/pages/admin/Kasir.tsx
- src/lib/cartStore.ts

## Tasks

<task type="auto">
  <name>Create Cart State Management</name>
  <files>src/lib/cartStore.ts, src/pages/admin/Kasir.tsx</files>
  <action>
    - Implement a React context or Zustand store (or local state) for cart items `[{ id, name, price, qty, subtotal }]`
    - Add functions to `addItem`, `removeItem`, `updateQty`, and `clearCart`
    - Calculate total price derived from cart items
  </action>
  <verify>npm run build</verify>
  <done>Cart state logic is implemented without TypeScript errors</done>
</task>

<task type="auto">
  <name>Build Cart UI in POS Right Column</name>
  <files>src/pages/admin/Kasir.tsx</files>
  <action>
    - Render cart items in a tabular format in the right column of `Kasir.tsx`
    - Include buttons for increasing/decreasing qty and removing items
    - Display the total calculation at the bottom
  </action>
  <verify>npm run build</verify>
  <done>Cart items and totals render correctly on the screen</done>
</task>

## Success Criteria
- [ ] Products can be added to the cart
- [ ] Quantity can be adjusted
- [ ] Subtotal and total calculate correctly

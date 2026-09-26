---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: Layout POS

## Objective
Membangun layout antarmuka Point of Sale (POS) split-screen (katalog produk kiri, keranjang/checkout kanan) dan barcode input field.

## Context
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md
- src/pages/admin/Kasir.tsx
- src/components/layout/AdminLayout.tsx

## Tasks

<task type="auto">
  <name>Create POS Route and Layout</name>
  <files>src/pages/admin/Kasir.tsx, src/App.tsx, src/components/layout/AdminLayout.tsx</files>
  <action>
    - Add `Kasir.tsx` in `src/pages/admin`
    - Create a two-column grid layout (left: 2/3 for catalog, right: 1/3 for cart)
    - Add navigation link to Kasir in `AdminLayout.tsx` and route in `App.tsx`
  </action>
  <verify>npm run build</verify>
  <done>Kasir page is accessible and shows a two-column layout</done>
</task>

<task type="auto">
  <name>Implement Barcode Input and Catalog UI Skeleton</name>
  <files>src/pages/admin/Kasir.tsx</files>
  <action>
    - Add an input field for barcode scanning at the top of the left column with `autoFocus`
    - Add a grid placeholder for product catalog items
  </action>
  <verify>npm run build</verify>
  <done>Barcode input field is visible and focuses on load</done>
</task>

## Success Criteria
- [ ] Kasir route exists and is protected
- [ ] Split-screen layout is implemented correctly
- [ ] Barcode input field exists

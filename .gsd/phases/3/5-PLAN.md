---
phase: 3
plan: 5
wave: 3
---

# Plan 3.5: Cetak Struk

## Objective
Mengimplementasikan fitur pencetakan struk (thermal print layout) setelah checkout.

## Context
- src/pages/admin/Kasir.tsx
- src/components/admin/ReceiptPrinter.tsx

## Tasks

<task type="auto">
  <name>Create Receipt Component</name>
  <files>src/components/admin/ReceiptPrinter.tsx</files>
  <action>
    - Create a hidden printable component `ReceiptPrinter.tsx` using CSS `@media print`
    - Format it for an 80mm thermal printer (narrow width, monospaced font)
  </action>
  <verify>npm run build</verify>
  <done>Receipt component exists with print styles</done>
</task>

<task type="auto">
  <name>Integrate Printing on Checkout</name>
  <files>src/pages/admin/Kasir.tsx</files>
  <action>
    - Trigger `window.print()` automatically or via button click after successful checkout
    - Pass transaction data to the `ReceiptPrinter`
  </action>
  <verify>npm run build</verify>
  <done>Print dialog opens on successful checkout</done>
</task>

## Success Criteria
- [ ] Receipt layout matches thermal printer specs
- [ ] Transaction details are printed accurately

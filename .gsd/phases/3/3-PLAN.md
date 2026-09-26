---
phase: 3
plan: 3
wave: 2
---

# Plan 3.3: Fitur Parked Notes

## Objective
Menerapkan fungsionalitas untuk menahan transaksi sementara (park) dan memanggilnya kembali (resume).

## Context
- src/lib/cartStore.ts
- src/pages/admin/Kasir.tsx

## Tasks

<task type="auto">
  <name>Implement Parked Notes State</name>
  <files>src/lib/cartStore.ts</files>
  <action>
    - Extend cart state to support an array of `parkedTransactions` (each with an ID, note, timestamp, and items)
    - Add functions `parkCurrentTransaction(note)` and `resumeTransaction(id)`
  </action>
  <verify>npm run build</verify>
  <done>Parked notes logic is implemented</done>
</task>

<task type="auto">
  <name>Build Parked Notes UI</name>
  <files>src/pages/admin/Kasir.tsx</files>
  <action>
    - Add a "Park Transaction" button in the cart area
    - Create a modal or slide-out panel to list currently parked transactions
    - Add "Resume" buttons next to parked transactions to load them back into the active cart
  </action>
  <verify>npm run build</verify>
  <done>Park and Resume UI buttons work</done>
</task>

## Success Criteria
- [ ] Active cart can be parked with a note
- [ ] Parked cart clears the active cart
- [ ] Parked cart can be resumed back into the active cart

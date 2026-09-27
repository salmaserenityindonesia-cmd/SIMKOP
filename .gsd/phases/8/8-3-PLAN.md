---
phase: 8
plan: 3
wave: 3
depends_on: ["8-1"]
files_modified:
  - src/pages/admin/DashboardSimpanan.tsx
autonomous: true
must_haves:
  truths:
    - "Admin can view multiple deposit types per member and make partial payments tracked by month/year"
  artifacts:
    - "src/pages/admin/DashboardSimpanan.tsx"
---

# Plan 8.3: Refaktor UI Simpanan (Cicilan Bulanan)

<objective>
Update `DashboardSimpanan.tsx` to display dynamic deposits from `monthly_deposit_commitments` view, and allow partial payments assigned to a specific month.

Purpose: Allow flexible installments that automatically accumulate toward the monthly target.
Output: Refactored Dashboard Simpanan UI.
</objective>

<context>
Load for context:
- src/pages/admin/DashboardSimpanan.tsx
- src/services/koperasiService.ts
</context>

<tasks>

<task type="auto">
  <name>Refactor Simpanan Table to use View</name>
  <files>src/pages/admin/DashboardSimpanan.tsx</files>
  <action>
    Instead of hardcoding `simpanan_pokok` and `simpanan_wajib` columns, query `getMonthlyDepositCommitments()` to show the current month's commitment status for each member.
    The table columns might need to be dynamic or just summarize the total "Belum Lunas" for the current month.
    Provide a "Bayar Cicilan" button.
  </action>
  <verify>npm run build</verify>
  <done>Table shows data powered by the Supabase view.</done>
</task>

<task type="auto">
  <name>Implement Partial Payment Modal</name>
  <files>src/pages/admin/DashboardSimpanan.tsx</files>
  <action>
    Create a modal that opens when "Bayar Cicilan" is clicked.
    Form fields:
    - Jenis Simpanan (dropdown based on member's active deposits)
    - Bulan & Tahun Target (defaults to current month)
    - Nominal Bayar (can be partial, e.g. Rp 25.000)
    Call `addDepositTransaction(..., {for_month, for_year, amount})`.
  </action>
  <verify>npm run build</verify>
  <done>Payment modal allows specifying month, year, and partial amount.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Users can pay partial amounts.
- [ ] Total paid updates the view.
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>

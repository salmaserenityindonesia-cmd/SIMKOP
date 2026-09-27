---
phase: 8
plan: 5
wave: 4
depends_on: ["8-1", "8-3", "8-4"]
files_modified:
  - src/pages/admin/AdminDashboard.tsx
autonomous: true
must_haves:
  truths:
    - "Dashboard displays tracking of monthly commitments"
  artifacts:
    - "src/pages/admin/AdminDashboard.tsx"
---

# Plan 8.5: Dashboard Analytics (Tracking Komitmen)

<objective>
Enhance the Admin Dashboard to show metrics derived from the new monthly tracking views.

Purpose: Provide admins a quick glance at collection performance (e.g. how many members have paid their monthly commitments vs how many are overdue).
Output: Updated Dashboard UI.
</objective>

<context>
Load for context:
- src/pages/admin/AdminDashboard.tsx
- src/services/koperasiService.ts
</context>

<tasks>

<task type="auto">
  <name>Dashboard Metrics for Commitments</name>
  <files>
    src/services/koperasiService.ts
    src/pages/admin/AdminDashboard.tsx
  </files>
  <action>
    Add a service function `getCommitmentStats(month, year)` that queries the `monthly_deposit_commitments` and `monthly_loan_commitments` to count how many are 'lunas' vs 'belum_lunas'.
    Display this as a stat card or a small chart in `AdminDashboard.tsx`.
  </action>
  <verify>npm run build</verify>
  <done>Dashboard renders the new commitment tracking metrics without breaking.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Dashboard builds and renders successfully.
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>

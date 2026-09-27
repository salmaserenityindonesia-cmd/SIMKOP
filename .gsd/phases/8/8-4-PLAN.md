---
phase: 8
plan: 4
wave: 3
depends_on: ["8-1"]
files_modified:
  - src/pages/admin/DetailPinjaman.tsx
  - src/components/admin/FormPengajuanPinjaman.tsx
autonomous: true
must_haves:
  truths:
    - "Admin can record partial installments for loans for specific months"
  artifacts:
    - "src/pages/admin/DetailPinjaman.tsx"
---

# Plan 8.4: Refaktor UI Pinjaman (Cicilan Angsuran Bulanan)

<objective>
Update the Loan UI to support dynamic loan types and partial installment payments tracked by month/year via the new view.

Purpose: Allow members to pay loan installments in chunks (e.g. paying 10k today, 40k tomorrow for a 50k monthly commitment).
Output: Refactored FormPengajuanPinjaman and DetailPinjaman components.
</objective>

<context>
Load for context:
- src/components/admin/FormPengajuanPinjaman.tsx
- src/pages/admin/DetailPinjaman.tsx
- src/services/koperasiService.ts
</context>

<tasks>

<task type="auto">
  <name>Update Form Pengajuan Pinjaman</name>
  <files>src/components/admin/FormPengajuanPinjaman.tsx</files>
  <action>
    Fetch `getLoanTypes()` from the service layer.
    Add a dropdown for "Jenis Pinjaman" and populate `loan_type_id` when submitting the loan application.
    Ensure max tenor validation relies on `max_duration_months` from the selected loan type.
  </action>
  <verify>npm run build</verify>
  <done>Form requires a loan type and respects its constraints.</done>
</task>

<task type="auto">
  <name>Implement Partial Installment Payment UI</name>
  <files>src/pages/admin/DetailPinjaman.tsx</files>
  <action>
    Modify the "Jadwal Angsuran" table. Instead of a single "Bayar" button that marks the whole month as paid, fetch data from `getMonthlyLoanCommitments()`.
    Show "Komitmen per Bulan", "Total Dibayar", and "Sisa Tagihan".
    When clicking "Bayar", open a prompt/modal to input the payment amount (partial payment), defaulting to the "Sisa Tagihan".
    Call `addLoanInstallment(..., {for_month, for_year, amount})`.
  </action>
  <verify>npm run build</verify>
  <done>Partial payments are supported and visually represented in the installment table.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Users can submit partial loan payments.
- [ ] View correctly calculates the remaining balance and sets status to "lunas" when balance hits 0.
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>

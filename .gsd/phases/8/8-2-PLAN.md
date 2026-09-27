---
phase: 8
plan: 2
wave: 2
depends_on: ["8-1"]
files_modified:
  - src/pages/admin/ManajemenProdukSimpanPinjam.tsx
  - src/components/layout/AdminLayout.tsx
  - src/App.tsx
autonomous: true
must_haves:
  truths:
    - "Admin can create, read, update, delete Deposit Types and Loan Types"
  artifacts:
    - "src/pages/admin/ManajemenProdukSimpanPinjam.tsx"
---

# Plan 8.2: Modul Admin - CRUD Jenis Simpanan & Pinjaman

<objective>
Create an admin interface to manage `deposit_types` and `loan_types`.

Purpose: Fulfill the requirement that admins can define their own flexible deposit and loan products.
Output: A new admin page registered in the routing and sidebar.
</objective>

<context>
Load for context:
- src/services/koperasiService.ts
- src/components/layout/AdminLayout.tsx
- src/App.tsx
</context>

<tasks>

<task type="auto">
  <name>Create Manajemen Produk Simpan Pinjam Page</name>
  <files>src/pages/admin/ManajemenProdukSimpanPinjam.tsx</files>
  <action>
    Create a new React component using `AdminLayout`.
    Implement two tabs or sections:
    1. **Jenis Simpanan**: List of `deposit_types` with "Tambah" button. Form includes: Code, Name, Frequency Type (once, monthly, yearly), Default Amount, Can Be Withdrawn.
    2. **Jenis Pinjaman**: List of `loan_types` with "Tambah" button. Form includes: Code, Name, Max Duration Months.
    Wire them up to `koperasiService.ts` CRUD functions.
    AVOID: Using plain unstyled components; use Stitch tokens and Lucide icons to match existing admin pages.
  </action>
  <verify>npm run build</verify>
  <done>Page renders successfully and forms are functional.</done>
</task>

<task type="auto">
  <name>Register Routing and Navigation</name>
  <files>
    src/App.tsx
    src/components/layout/AdminLayout.tsx
  </files>
  <action>
    - In `App.tsx`, register the new route `/admin/master-simpan-pinjam`.
    - In `AdminLayout.tsx`, add a sidebar link under "Simpan Pinjam" or "Master Data" called "Master Produk Koperasi".
  </action>
  <verify>npm run build</verify>
  <done>Navigation is wired and type-safe.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Admin can navigate to the new page via sidebar.
- [ ] UI allows managing dynamic types.
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>

# Architecture

> Updated on 2026-10-28

## Overview

SIMKOP (Sistem Informasi Manajemen Koperasi) is an enterprise cooperative management and Point-of-Sale (POS) single-page application (SPA). It provides end-to-end administration for member registries, retail inventory, multi-split POS checkouts, dynamic deposit and loan products, salary deduction imports, member resignation settlement clearances, and financial reporting. The frontend is built on React 19 and Vite, styled with Tailwind CSS, and uses Supabase (PostgreSQL, GoTrue Auth, and custom RPC functions) as its Backend-as-a-Service (BaaS).

```
┌──────────────────────────────────────────────────────────────┐
│                    [React 19 SPA (Vite)]                     │
│    Pages: Admin, POS, Savings, Loans, Reports, Settlements   │
│    State: React Hooks, Zustand Cart (`src/lib/cartStore.ts`)  │
├──────────────────────────────────────────────────────────────┤
│                   [Services Layer (TS)]                      │
│   koperasiService, loanService, posCheckoutService, etc.     │
├──────────────────────────────────────────────────────────────┤
│                   [Supabase BaaS Layer]                      │
│   PostgreSQL 15+, Supabase Auth, Row Level Security, RPCs    │
└──────────────────────────────────────────────────────────────┘
```

## Components

### UI & Presentation Layer (`src/pages/`, `src/components/`)
- **Purpose:** Renders interactive views and handles user actions.
- **Routes & Views:** Defined in [`src/App.tsx:28-235`](file:///src/App.tsx#L28-L235).
  - **POS & Retail:** [`src/pages/pos/`](file:///src/pages/pos/) (dual view POS UI), [`src/pages/admin/ManajemenProduk.tsx`](file:///src/pages/admin/ManajemenProduk.tsx), [`src/pages/admin/ManajemenKategori.tsx`](file:///src/pages/admin/ManajemenKategori.tsx), [`src/pages/admin/ManajemenPembelian.tsx`](file:///src/pages/admin/ManajemenPembelian.tsx).
  - **Savings & Deposits:** [`src/pages/admin/DashboardSimpanan.tsx`](file:///src/pages/admin/DashboardSimpanan.tsx), [`src/pages/admin/TerimaSetoran.tsx`](file:///src/pages/admin/TerimaSetoran.tsx), [`src/pages/admin/penarikan-simpanan/`](file:///src/pages/admin/penarikan-simpanan/).
  - **Loans:** [`src/pages/admin/PengajuanPinjaman.tsx`](file:///src/pages/admin/PengajuanPinjaman.tsx), [`src/pages/admin/ApprovalPinjaman.tsx`](file:///src/pages/admin/ApprovalPinjaman.tsx), [`src/pages/admin/DetailPinjaman.tsx`](file:///src/pages/admin/DetailPinjaman.tsx), [`src/pages/admin/LoanMatrix.tsx`](file:///src/pages/admin/LoanMatrix.tsx).
  - **Member & Settlement:** [`src/pages/admin/ManajemenAnggota.tsx`](file:///src/pages/admin/ManajemenAnggota.tsx), [`src/pages/admin/SettlementClearance.tsx`](file:///src/pages/admin/SettlementClearance.tsx), [`src/pages/admin/SalaryImport.tsx`](file:///src/pages/admin/SalaryImport.tsx), [`src/pages/admin/BatchUpdater.tsx`](file:///src/pages/admin/BatchUpdater.tsx).
  - **Reports & Audits:** [`src/pages/admin/laporan-keuangan/`](file:///src/pages/admin/laporan-keuangan/), [`src/pages/admin/laporan-retail/`](file:///src/pages/admin/laporan-retail/), [`src/pages/admin/ComplianceMatrix.tsx`](file:///src/pages/admin/ComplianceMatrix.tsx).
- **Authentication Guard:** Protected route wrapper with role checks (`admin` vs standard operator) in [`src/components/auth/ProtectedRoute.tsx:5-49`](file:///src/components/auth/ProtectedRoute.tsx#L5-L49).

### Services Layer (`src/services/`)
- **Purpose:** Encapsulates business logic, data formatting, and direct Supabase database/RPC queries.
- **Key Modules:**
  - `koperasiService.ts`: Core master data for members, savings, and dynamic deposit products ([`src/services/koperasiService.ts:9-60`](file:///src/services/koperasiService.ts#L9-L60)).
  - `loanService.ts` & `loanMatrixService.ts`: Loan origination, amortization schedules, repayment processing, and policy enforcement ([`src/services/loanService.ts:35-60`](file:///src/services/loanService.ts#L35-L60)).
  - `posCheckoutService.ts` & `posCreditService.ts`: Retail sales checkout, multi-split payment calculations, member credit limits ([`src/services/posCheckoutService.ts:17-59`](file:///src/services/posCheckoutService.ts#L17-L59)).
  - `settlementService.ts`: Resignation clearance calculations and RPC dispatch ([`src/services/settlementService.ts`](file:///src/services/settlementService.ts)).
  - `retail-report.service.ts`: End-of-day reconciliation, stock valuations, fast-moving items analysis ([`src/services/retail-report.service.ts:33-50`](file:///src/services/retail-report.service.ts#L33-L50)).
  - `salaryImportService.ts` & `batchUpdateService.ts`: Excel processing and bulk THP / salary deduction imports.

### Client Infrastructure Layer (`src/lib/`)
- **Purpose:** Initializes database connectivity and client stores.
- **Supabase Client:** Dual client instantiation (`supabase` anonymous/session client and optional `supabaseAdmin` service-role client) in [`src/lib/supabaseClient.ts:10-22`](file:///src/lib/supabaseClient.ts#L10-L22).
- **POS State Store:** Cart and transaction state management in [`src/lib/cartStore.ts`](file:///src/lib/cartStore.ts).

### Database & Schema Layer (`supabase/migrations/`)
- **Purpose:** PostgreSQL database schema definitions, constraints, triggers, and RPC procedures.
- **Core Migrations:**
  - `001_set_initial_admin.sql` to `005_create_tabel_anggota_koperasi.sql`: Core auth and member profiles.
  - `006_create_loan_module.sql` & `014_add_rejected_loan_status.sql`: Loan tables, repayment schedules, statuses.
  - `008_rpc_batch_update_salary.sql`: Batch salary updates.
  - `009_member_settlement.sql` & `010_member_resignation_settlement.sql`: Stored functions for member resignation clearance (`get_member_deposit_settlement`, `process_member_resignation_settlement`).
  - `015_create_cash_flow_and_withdrawal_rpc.sql`: Cash flow ledger and atomic withdrawal operations.
  - `016_create_pos_sales_tables.sql`: POS sales, sale items, and inventory deductions.

## Data Flow

1. **Authentication Flow:** User credentials submitted via `LoginPage` ([`src/pages/login.tsx`](file:///src/pages/login.tsx)) $\rightarrow$ `supabase.auth.signInWithPassword()` $\rightarrow$ session stored in browser $\rightarrow$ `ProtectedRoute` checks `session.user.app_metadata.role` ([`src/components/auth/ProtectedRoute.tsx:13-24`](file:///src/components/auth/ProtectedRoute.tsx#L13-L24)).
2. **Transaction Flow (POS Checkout):** Cashier builds cart in `POSPage` $\rightarrow$ calls `processCheckout()` in `posCheckoutService.ts` $\rightarrow$ validates against member THP credit limits $\rightarrow$ writes records to `sales` and `sale_items` tables $\rightarrow$ triggers stock adjustment.
3. **Resignation & Settlement Flow:** Admin initiates settlement review in `SettlementClearance.tsx` $\rightarrow$ calls `settlementService.ts` $\rightarrow$ triggers PostgreSQL RPC `get_member_deposit_settlement` $\rightarrow$ executes atomic payouts and liability offsets.

## Integration Points

| Service | Type | Purpose | Reference |
|---------|------|---------|-----------|
| Supabase Auth | BaaS (GoTrue) | User authentication and session management | [`src/components/auth/ProtectedRoute.tsx:11-28`](file:///src/components/auth/ProtectedRoute.tsx#L11-L28) |
| Supabase Database | PostgreSQL 15+ | Relational data persistence with RLS | [`src/lib/supabaseClient.ts:10`](file:///src/lib/supabaseClient.ts#L10) |
| Supabase RPC | PostgreSQL Functions | Atomic complex operations (settlements, salary batching, withdrawals) | [`supabase/migrations/010_member_resignation_settlement.sql`](file:///supabase/migrations/010_member_resignation_settlement.sql) |

## Technical Debt & Architecture Risks

- **Client-Side Orchestration of Multi-Table Writes:** In `posCheckoutService.ts`, sales and sale items are created via sequential client-side queries rather than an atomic database RPC ([`src/services/posCheckoutService.ts:36-58`](file:///src/services/posCheckoutService.ts#L36-L58)). Network interruptions between steps can result in orphaned sale headers.
- **Service Role Key Exposure in Vite Environment:** `supabaseAdmin` client imports `VITE_SUPABASE_SERVICE_ROLE_KEY` via `import.meta.env` ([`src/lib/supabaseClient.ts:13-22`](file:///src/lib/supabaseClient.ts#L13-L22)). In production builds, embedding service role keys in client bundles bypasses RLS and poses security risks if deployed to public frontends.
- **Fallback Schema Handling:** `koperasiService.ts` uses client-side fallback parsing when schema cache errors or table mismatches occur ([`src/services/koperasiService.ts:1-5`](file:///src/services/koperasiService.ts#L1-L5)), indicating transient database schema drift.

## Conventions

- **Naming:** TypeScript strict camelCase for variables/functions, PascalCase for components and interfaces.
- **Structure:** Feature/Domain-based organization within `src/pages/admin/` and modular services in `src/services/`.
- **Testing:** Vitest runner configured in [`package.json:13`](file:///package.json#L13); unit tests exist for `loanService.test.ts` and `retailReport.test.ts`.

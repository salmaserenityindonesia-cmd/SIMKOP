# SPEC: SIMKOP Application

**Status**: FINALIZED

## 1. Overview
Aplikasi SIMKOP menggunakan token desain dan styling dari UI Stitch "SIMKOP Modern Login Portal", namun dengan batasan fungsional yang ketat agar sesuai dengan skema tabel database Supabase yang sudah ada. Fitur-fitur dari project brief Stitch asli (seperti akuntansi SAK yang kompleks dan kalkulator bunga pinjaman) secara eksplisit diabaikan (over-scoped).

## 2. Core Functional Requirements
- **Roles & Permissions**:
  - Hanya terdapat 2 role: `admin` dan `operator`.
  - Pembatasan dinamis (dynamic restrictions) diatur via tabel `user_restrictions`.
- **Loans (Pinjaman)**:
  - Bersifat 0% bunga (interest-free).
  - Tanpa kalkulator flat atau anuitas.
- **Cashier (Kasir)**:
  - Memiliki fitur pending transaksi (`parked_notes`).
- **Inventory/Restock**:
  - Pencatatan restock harus melacak nomor faktur supplier.
- **UI/UX**:
  - Mengikuti styling dan design tokens dari UI Stitch yang telah diimpor.

## 3. Explicit Exclusions
- Modul Akuntansi SAK.
- Fungsionalitas penghitungan bunga pinjaman.

---
milestone: SIMKOP v1.0
version: 1.0.0
updated: 2026-09-26T19:28:00+07:00
---

# Roadmap

> **Current Phase:** 2 — Autentikasi & Manajemen User
> **Status:** in progress

## Must-Haves (from SPEC)

- [ ] 2-role system (admin, operator) with dynamic restrictions via `user_restrictions`
- [ ] Pinjaman 0% bunga — tanpa kalkulator flat/anuitas
- [ ] Kasir dengan fitur pending transaksi (`parked_notes`)
- [ ] Pencatatan restock dengan nomor faktur supplier
- [ ] UI mengikuti Stitch design tokens (SIMKOP Design System)

## Explicit Exclusions

- ❌ Modul Akuntansi SAK / SAK-ETAP / SAK-EP
- ❌ Kalkulator bunga pinjaman (flat / anuitas / efektif)
- ❌ Auto-journaling / Chart of Accounts / Buku Besar
- ❌ Kalkulasi SHU otomatis
- ❌ Portal mandiri anggota (mobile web view) — deferred
- ❌ Payment gateway bank integration — deferred
- ❌ Multi-role kompleks (pengurus, pengawas, manajer logistik) — cukup admin & operator

---

## Phases

### Phase 1: Project Foundation & Design System
**Status:** ✅ Complete
**Objective:** Membangun fondasi teknis aplikasi — inisialisasi project web app, implementasi design system dari Stitch tokens, dan struktur folder komponen.

**Plans:**
- [x] Plan 1.1: Inisialisasi project (Vite + React/vanilla), konfigurasi build tools
- [x] Plan 1.2: Implementasi CSS design system dari Stitch tokens (warna, tipografi, spacing, elevation, shapes, komponen dasar)
- [x] Plan 1.3: Buat layout shell — sidebar navigation (280px rail), responsive breakpoints (desktop/tablet/mobile), dan app skeleton

**Deliverables:**
- App skeleton berjalan di `localhost` dengan design system terpasang
- Sidebar navigasi responsif dengan placeholder menu items
- Semua design tokens tersedia sebagai CSS custom properties

---

### Phase 2: Autentikasi & Manajemen User
**Status:** 🔄 In Progress
**Objective:** Implementasi login, registrasi, dan sistem role/permission berdasarkan skema Supabase (`admin`, `operator`, `user_restrictions`).
**Depends on:** Phase 1

**Plans:**
- [x] Plan 2.1: Halaman Login — port dari Stitch "Login SIM Koperasi" screen, integrasi Supabase Auth
- [ ] Plan 2.2: Registrasi user baru (admin-only action) dengan pemilihan role (admin/operator)
- [x] Plan 2.3: Middleware auth guard + dynamic restriction engine dari tabel `user_restrictions` (partial implementation via ProtectedRoute)
- [ ] Plan 2.4: Halaman manajemen user — CRUD user, assign role, kelola restrictions

**Deliverables:**
- Login/logout fungsional dengan Supabase
- Role-based route protection (admin vs operator)
- Admin dapat membuat user baru dan mengatur pembatasan dinamis

---

### Phase 3: Modul Kasir (POS) & Parked Notes
**Status:** ⬜ Not Started
**Objective:** Membangun antarmuka Point of Sale (kasir) dengan fitur pending transaksi (`parked_notes`), pembayaran tunai, dan cetak struk.
**Depends on:** Phase 2

**Plans:**
- [ ] Plan 3.1: Layout POS — split-screen (katalog produk kiri, keranjang/checkout kanan), barcode input field
- [ ] Plan 3.2: Keranjang belanja — tambah/hapus item, edit qty, kalkulasi subtotal/total (tabular numerics)
- [ ] Plan 3.3: Fitur Parked Notes — park transaksi sementara, list parked notes, resume transaksi
- [ ] Plan 3.4: Proses checkout — pembayaran tunai, kalkulasi kembalian, simpan transaksi ke Supabase
- [ ] Plan 3.5: Cetak struk (thermal print layout / PDF receipt)

**Deliverables:**
- Kasir dapat memproses transaksi end-to-end
- Transaksi dapat di-park dan di-resume
- Struk transaksi dapat dicetak/diunduh

---

### Phase 4: Modul Pinjaman (0% Bunga) & Simpanan
**Status:** ⬜ Not Started
**Objective:** Mengelola simpanan anggota dan pinjaman tanpa bunga — pengajuan, persetujuan, jadwal angsuran, dan monitoring pelunasan.
**Depends on:** Phase 2

**Plans:**
- [ ] Plan 4.1: Dashboard simpanan anggota — Simpanan Pokok, Simpanan Wajib, saldo (read-only untuk operator)
- [ ] Plan 4.2: Pengajuan pinjaman baru — form sederhana (jumlah pinjaman, tenor cicilan), tanpa bunga
- [ ] Plan 4.3: Approval workflow — admin menyetujui/menolak pengajuan pinjaman
- [ ] Plan 4.4: Jadwal angsuran & pencatatan pembayaran cicilan — tracking pelunasan per periode
- [ ] Plan 4.5: Status badges (Lunas / Berjalan / Jatuh Tempo) menggunakan Stitch chip components

**Deliverables:**
- Anggota terdaftar dengan saldo simpanan
- Pinjaman 0% dapat diajukan, disetujui, dan dilunasi secara bertahap
- Status pinjaman terpantau dengan visual badges

---

### Phase 5: Modul Inventori, Restock & Dashboard
**Status:** 🔄 In Progress
**Objective:** Manajemen stok barang, pencatatan restock dengan nomor faktur supplier, dan dashboard ringkasan operasional.
**Depends on:** Phase 3

**Plans:**
- [ ] Plan 5.1: Katalog produk — CRUD produk (nama, barcode/SKU, harga jual, stok saat ini)
- [ ] Plan 5.2: Pencatatan restock — form input (produk, qty, harga beli, **nomor faktur supplier**, tanggal)
- [ ] Plan 5.3: Kartu stok & riwayat pergerakan stok per produk
- [ ] Plan 5.4: Peringatan stok minimum (low stock alert)
- [/] Plan 5.5: Dashboard operasional — ringkasan penjualan hari ini, total pinjaman aktif, stok kritis, parked notes count (UI skeleton created)

**Deliverables:**
- Produk terdaftar dengan stok real-time
- Setiap restock tercatat dengan nomor faktur supplier
- Dashboard memberikan overview operasional harian

---

## Wave Execution Plan

| Wave | Phases | Rationale |
|------|--------|-----------|
| 1 | Phase 1 | Foundation — harus selesai sebelum semua |
| 2 | Phase 2 | Auth diperlukan oleh semua modul fungsional |
| 3 | Phase 3 + Phase 4 | POS dan Pinjaman independen, dapat paralel |
| 4 | Phase 5 | Inventori bergantung pada katalog produk dari POS; Dashboard butuh semua data |

---

## Progress Summary

| Phase | Name | Status | Plans | Complete |
|-------|------|--------|-------|----------|
| 1 | Foundation & Design System | ✅ | 3/3 | 100% |
| 2 | Autentikasi & User Management | 🔄 | 2/4 | 50% |
| 3 | Kasir (POS) & Parked Notes | ⬜ | 0/5 | 0% |
| 4 | Pinjaman (0% Bunga) & Simpanan | ⬜ | 0/5 | 0% |
| 5 | Inventori, Restock & Dashboard | 🔄 | 0/5 | 0% |

---

## Timeline

| Phase | Started | Completed | Duration |
|-------|---------|-----------|----------|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |
| 4 | — | — | — |
| 5 | — | — | — |

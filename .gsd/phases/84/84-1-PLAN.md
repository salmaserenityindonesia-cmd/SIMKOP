---
phase: 84
plan: 1
wave: 1
gap_closure: false
---

# Plan 84.1: Fix Database Join and Fallback Mapping in withdrawalReportService.ts

## Objective
Memperbaiki kueri penarikan dan resolusi relasi di `src/services/withdrawalReportService.ts` agar data mutasi penarikan simpanan dapat mengekstrak profil anggota (`nama`, `name`, `nrp`, dsb.) secara andal dari tabel `anggota` via `member_deposits` atau melalui cross-lookup ke tabel `sales` (untuk transaksi kasir POS seperti `INV-...`), serta menyelaraskan pembacaan kode dan nama jenis simpanan langsung dari `deposit_types` tanpa fallback kaku "Simpanan Sukarela".

## Context
Load these files for context:
- .gsd/SPEC.md
- src/services/withdrawalReportService.ts
- src/services/withdrawalReportService.test.ts

## Tasks

<task type="auto">
  <name>Resolve Member Profile and Exact Deposit Type Name</name>
  <files>src/services/withdrawalReportService.ts</files>
  <action>
    - Buka `src/services/withdrawalReportService.ts`.
    - Periksa dan perbaiki kueri penarikan simpanan (`getWithdrawalDetailedLedger`):
      1. Pastikan relasi join `deposit_transactions` mengambil akun `member_deposits` yang terhubung ke master `anggota` dan `deposit_types`:
         - Ambil `nama` / `name` dan `nrp` dari relasi `anggota`.
         - Dukung alias atau nested join yang tangguh jika relasi schema menggunakan `anggota` atau `anggota:member_id`.
      2. Tangani resolusi identitas anggota yang belum terhubung langsung:
         - Untuk transaksi yang berasal dari struk belanja kasir POS (`reference_no` diawali `INV-` atau `description` / `notes` memuat 'Belanja Kasir' / `payment_method` adalah `potong_simpanan_belanja`):
           Jika `member` atau `memberId` belum terisi dari `member_deposits`, lakukan lookup ke tabel `sales` berdasarkan `sale_number`:
           ```typescript
           const { data: saleData } = await supabase
             .from('sales')
             .select('member_id, anggota:member_id (id, nama, name, nrp, pangkat, bank_name, bank_account_number, status)')
             .eq('sale_number', row.reference_no)
             .maybeSingle();
           ```
         - Pastikan resolusi nama anggota membaca `member.nama || member.name`.
         - Pastikan transaksi tidak jatuh ke fallback "Anggota Tidak Dikenal (NRP: -)" bila `reference_no` terhubung ke data `sales` atau `anggota`.
      3. Tangani resolusi Jenis Simpanan:
         - Hapus fallback kaku `'Simpanan Sukarela'` bila transaksi berjenis belanja atau memiliki indikator belanja POS.
         - Jika `dt?.name` tersedia, gunakan `dt.name`.
         - Jika kode transaksi adalah `BELANJA` atau transaksi berasal dari belanja POS kasir (`potong_simpanan_belanja` / `INV-...`), set kode ke `BELANJA` dan nama ke **"Simpanan Belanja Bulanan"** (atau nama resmi dari master `deposit_types`).
         - Jika kode transaksi adalah `LEBARAN` / THR, set kode ke `LEBARAN` dan nama ke **"Simpanan Hari Raya (Lebaran)"**.
      4. Perbarui unit test di `src/services/withdrawalReportService.test.ts` untuk memverifikasi skenario transaksi POS `INV-1794286975137` ter-resolve dengan nama "Yanto Santoso", NRP "96316180", dan jenis simpanan "Simpanan Belanja Bulanan".
  </action>
  <verify>
    Jalankan test: `npx vitest run src/services/withdrawalReportService.test.ts` dan pastikan seluruh test lulus 100%.
  </verify>
  <done>
    Layanan `withdrawalReportService` mengembalikan identitas anggota dan jenis simpanan yang akurat, termasuk untuk transaksi penarikan belanja dari POS kasir.
  </done>
</task>

## Must-Haves
- [ ] Resolusi identitas anggota membaca `nama` atau `name` serta `nrp` dari `anggota`.
- [ ] Fallback cross-lookup ke tabel `sales` berdasarkan `reference_no` (`sale_number`) jika relasi `member_deposits` tidak memuat data anggota.
- [ ] Tidak ada fallback "Simpanan Sukarela" untuk transaksi simpanan belanja atau transaksi bertanda belanja POS.
- [ ] Unit test mencakup resolusi transaksi belanja kasir POS (misal INV-...).

## Success Criteria
- [ ] Transaksi penarikan simpanan belanja dari kasir POS me-return nama anggota, NRP, dan jenis simpanan "Simpanan Belanja Bulanan" secara tepat.
- [ ] Semua unit test pada `withdrawalReportService.test.ts` lulus tanpa regresi.


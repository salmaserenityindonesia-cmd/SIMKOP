---
phase: 84
plan: 2
wave: 2
gap_closure: false
---

# Plan 84.2: Align UI Table and Filter Dropdowns in LaporanPenarikanSimpanan.tsx

## Objective
Menyelaraskan tampilan antarmuka pada `/admin/laporan-penarikan` (`src/pages/admin/LaporanPenarikanSimpanan.tsx`) agar dropdown filter "Jenis Simpanan" dan rendering baris buku besar mutasi penarikan menampilkan identitas anggota (Nama tebal & NRP) dan badge jenis simpanan "Simpanan Belanja Bulanan" secara tepat, rapi, dan konsisten dengan master data koperasi.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/pages/admin/LaporanPenarikanSimpanan.tsx
- src/pages/admin/LaporanPenarikanSimpanan.test.tsx

## Tasks

<task type="auto">
  <name>Align Laporan Penarikan View and Filters</name>
  <files>src/pages/admin/LaporanPenarikanSimpanan.tsx, src/pages/admin/LaporanPenarikanSimpanan.test.tsx</files>
  <action>
    - Buka `src/pages/admin/LaporanPenarikanSimpanan.tsx`.
    - Di komponen `DepositTypeBadge`:
      * Pastikan kategori `belanja` menampilkan label "Simpanan Belanja Bulanan" (jika nama adalah "Simpanan Belanja" atau default).
      * Pastikan badge styling jelas:
        - `lebaran`: emerald badge (`bg-emerald-100 text-emerald-800 border-emerald-200`)
        - `belanja`: sky/amber badge yang kontras (`bg-amber-100 text-amber-800 border-amber-200` atau `bg-sky-100 text-sky-800 border-sky-200`)
        - `sukarela_lainnya`: purple badge
        - `pokok_wajib`: slate badge
    - Di dropdown filter "Jenis Simpanan":
      * Pastikan opsi yang tersedia menggunakan label resmi koperasi:
        - "Semua Jenis Simpanan" (`all`)
        - "Simpanan Hari Raya (Lebaran)" (`lebaran`)
        - "Simpanan Belanja Bulanan" (`belanja`)
        - "Simpanan Sukarela" (`sukarela_lainnya`)
        - "Pokok & Wajib (Kliring)" (`pokok_wajib`)
    - Di tabel "Buku Besar Pengawasan Mutasi Penarikan":
      * Pada kolom `IDENTITAS ANGGOTA`:
        - Tampilkan nama anggota secara tebal: `{item.member_name}`.
        - Tampilkan NRP dan Pangkat: `NRP: {item.member_nrp} • {item.member_rank}`.
        - Hindari tampilan fallback "Anggota Tidak Dikenal" jika data anggota tersedia.
      * Pada kolom `JENIS SIMPANAN`:
        - Pastikan me-render `<DepositTypeBadge code={item.deposit_type_code} name={item.deposit_type_name} />`.
    - Perbarui unit test di `src/pages/admin/LaporanPenarikanSimpanan.test.tsx` untuk memverifikasi:
      * Render transaksi POS dengan nama "Yanto Santoso", NRP "96316180", dan jenis simpanan "Simpanan Belanja Bulanan".
      * Opsi filter dropdown memuat "Simpanan Belanja Bulanan".
  </action>
  <verify>
    Jalankan unit test: `npx vitest run src/pages/admin/LaporanPenarikanSimpanan.test.tsx` dan pastikan seluruh test lulus 100%.
  </verify>
  <done>
    Tampilan tabel dan filter Laporan Penarikan 100% konsisten dengan data riil koperasi, menampilkan nama anggota dan jenis simpanan belanja dengan akurat.
  </done>
</task>

## Must-Haves
- [ ] Opsi filter dropdown mencantumkan "Simpanan Belanja Bulanan".
- [ ] Badge jenis simpanan menampilkan "Simpanan Belanja Bulanan" untuk simpanan belanja POS.
- [ ] Kolom Identitas Anggota menampilkan nama anggota dan NRP secara jelas.
- [ ] Unit tests di `LaporanPenarikanSimpanan.test.tsx` terupdate dan lulus.

## Success Criteria
- [ ] Render baris transaksi belanja kasir POS menampilkan "Yanto Santoso", "NRP: 96316180", dan badge "Simpanan Belanja Bulanan".
- [ ] Semua pengujian Vitest di `LaporanPenarikanSimpanan.test.tsx` sukses.


---
phase: 40
plan: 2
wave: 2
depends_on: ["40.1"]
gap_closure: false
---

# Plan 40.2: Tampilan Tabel Pratinjau Migrasi Multi-Kolom Lengkap & Scroll Horizontal

## Objective
Memperluas antarmuka modal Pratinjau "Migrasi Anggota (14 Kolom)" (`src/components/members/MemberMigrationModal.tsx`) agar dilengkapi scroll horizontal (`overflow-x-auto`) dan menampilkan seluruh 12 kolom data riil (NRP/Nama, Pangkat, No. Rekening, Tgl Awal, Simp. Pokok, Simp. Wajib, Simp. Belanja, Simp. Lebaran, Jml Pinjaman, Tgl Awal Pinj, Tenor, Sisa Pinj) dalam format nominal Rupiah utuh tanpa rumus atau embel-embel "/bln".

## Context
- `src/components/members/MemberMigrationModal.tsx`
- `src/pages/admin/ManajemenAnggota.tsx`

## Tasks

<task type="auto">
  <name>Expand Member Migration Preview Modal to Full 12-Column Table</name>
  <files>
    src/components/members/MemberMigrationModal.tsx
  </files>
  <action>
    1. Buka `src/components/members/MemberMigrationModal.tsx`:
       - Ubah lebar modal menjadi lebih lega: `max-w-6xl` atau `max-w-7xl` (agar nyaman melihat data multi-kolom).
       - Perbarui ringkasan kartu di atas tabel:
         * Total Simpanan Wajib: tampilkan total akumulasi `jumlah_simpanan_wajib` murni.
         * Hapus teks "(Dibagi)" atau "(Rutin per bulan)".
       - Bungkus tabel dalam kontainer scroll horizontal & vertikal:
         `<div className="overflow-x-auto border rounded-xl max-h-[55vh] shadow-xs">`
       - Susun header kolom tabel (`<thead>`):
         1. **NRP / Nama** (sticky/prioritas)
         2. **Pangkat**
         3. **No. Rekening**
         4. **Tgl Awal**
         5. **Simp. Pokok** (text-right)
         6. **Simp. Wajib** (text-right)
         7. **Simp. Belanja** (text-right)
         8. **Simp. Lebaran** (text-right)
         9. **Jml Pinjaman** (text-right)
         10. **Tgl Awal Pinj.** (text-center)
         11. **Tenor** (text-center)
         12. **Sisa Pinj.** (text-right)
       - Pada setiap baris `<tbody>`:
         * **Simp. Wajib**: Tampilkan murni `formatRupiah(row.jumlah_simpanan_wajib)` tanpa teks "/bln" dan tanpa "Selama X bln".
         * **Simp. Belanja** & **Simp. Lebaran**: Tampilkan nominal murni jika > 0, jika 0 tampilkan `-`.
         * **Tgl Awal Pinj.**: Tampilkan nilai asli `row.tgl_awal_pinjaman || '-'` (misal 10, 33, 25, 5).
         * **Tenor**: Tampilkan `${row.tenor} bln` jika ada pinjaman, atau `-`.
         * **Sisa Pinj.**: Tampilkan format Rupiah `row.sisa_pinjaman` jika > 0, atau `-`.
  </action>
  <verify>
    Buka modal migrasi anggota di browser:
    - Seluruh rincian kolom terlihat jelas dengan scroll horizontal.
    - Joko Ramadhan menampilkan Simpanan Wajib Rp 2.000.000 utuh dan Tgl Awal Pinj. 10.
  </verify>
  <done>Pratinjau migrasi menampilkan data detail multi-kolom lengkap as-is.</done>
</task>

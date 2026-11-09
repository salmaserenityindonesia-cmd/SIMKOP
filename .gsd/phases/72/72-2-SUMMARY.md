# Summary Plan 72.2: Warning Badges & Breakdown Inspection in Preview Modal

## Accomplishments
- Mengambil konfigurasi tarif bertingkat Simpanan Wajib (`savings_rate_tiers` dengan kode `WAJIB`) di `src/pages/admin/ManajemenAnggota.tsx` saat upload file Excel migrasi anggota.
- Meneruskan prop `wajibRateTiers` ke `src/components/members/MemberMigrationModal.tsx`.
- Memperbarui antarmuka `MemberMigrationModal.tsx`:
  - Menghitung breakdown mundur Simpanan Wajib per baris data anggota menggunakan `computeReverseWajibBreakdown`.
  - Menambahkan panel ringkasan audit rekonsiliasi tarif bertingkat di bagian atas modal (Counter status Seimbang, Historis Pra-2020, dan Terdapat Selisih).
  - Merender badge visual transparan pada kolom **Simp. Wajib**:
    - Nominal Excel asli dipertahankan.
    - Badge merah/rose jika terdapat selisih (`hasDifference`), menampilkan nominal selisih `+Rp ...` / `-Rp ...` dan ekspektasi sistem per jumlah bulan.
    - Badge biru/sky untuk anggota pra-2020 (`isPre2020Member`), menampilkan nominal saldo pra-2020 utuh dan jumlah bulan diurai.
    - Badge hijau/emerald jika seimbang (0 selisih).
  - Menyediakan tombol ikon mata (`Eye`) interaktif di samping nominal Simpanan Wajib untuk membuka popover / sub-modal dialog inspeksi rincian uraian bulanan (tabel bulan mundur, tahun, tarif berlaku, dan status selisih).
- Menjalankan uji unit `MemberMigrationModal.test.tsx` dan `memberMigrationParser.test.ts` (seluruh pengujian lulus).

## Commit
- `21b87c34`: `feat(phase-72): integrate savings rate tiers and difference inspection into member migration modal`


---
phase: 72
plan: 2
wave: 2
gap_closure: false
---

# Plan 72.2: Warning Badges & Breakdown Inspection in Preview Modal

## Objective
Mengintegrasikan penguraian mundur dan validasi selisih Simpanan Wajib bertingkat ke dalam modal pratinjau migrasi anggota (`src/components/members/MemberMigrationModal.tsx` dan `src/pages/admin/ManajemenAnggota.tsx`). Modal akan memuat tarif `savings_rate_tiers` (khusus 'WAJIB'), menghitung breakdown per baris anggota, menampilkan nominal Excel, badge peringatan selisih (merah/oranye) atau badge seimbang (hijau) atau badge pra-2020 (biru/slate), serta menyediakan popover/modal ringkas untuk menginspeksi detail uraian bulanan.

## Context
Load these files for context:
- `src/components/members/MemberMigrationModal.tsx`
- `src/pages/admin/ManajemenAnggota.tsx`
- `src/services/savingsRateService.ts`
- `src/utils/memberMigrationParser.ts`

## Tasks

<task type="auto">
  <name>Load Savings Rate Tiers and Pass to MemberMigrationModal</name>
  <files>
    src/pages/admin/ManajemenAnggota.tsx,
    src/services/savingsRateService.ts
  </files>
  <action>
    1. Buka `src/services/savingsRateService.ts`:
       - Pastikan ada helper atau gunakan `getActiveSavingsRateTiers()` / `getSavingsRateTiers()` untuk mengambil seluruh konfigurasi tarif bertingkat yang tersimpan di Supabase / LocalStorage fallback.
    2. Buka `src/pages/admin/ManajemenAnggota.tsx`:
       - Tambahkan state `wajibRateTiers: TierRate[]` (atau `SavingsRateTier[]`).
       - Pada saat komponen mount atau saat file Excel di-upload (`handleFileUpload`), ambil data tarif bertingkat dari `savingsRateService.getSavingsRateTiers()` (filter yang `deposit_type_code === 'WAJIB'`).
       - Petakan ke format `TierRate`:
         ```typescript
         const mappedTiers: TierRate[] = wajibTiers.map(t => ({
           startYear: t.start_year,
           startMonth: t.start_month,
           endYear: t.end_year,
           endMonth: t.end_month,
           monthlyAmount: t.monthly_rate,
         }));
         ```
       - Teruskan `wajibRateTiers` sebagai props ke `<MemberMigrationModal />`.
  </action>
  <verify>
    ManajemenAnggota memuat data tarif simpanan wajib bertingkat dan meneruskannya ke MemberMigrationModal tanpa error.
  </verify>
  <done>
    Data tarif bertingkat terhubung secara dinamis ke flow pratinjau migrasi anggota.
  </done>
</task>

<task type="auto">
  <name>Update MemberMigrationModal UI with Difference Warnings and Breakdown Details</name>
  <files>
    src/components/members/MemberMigrationModal.tsx
  </files>
  <action>
    1. Buka `src/components/members/MemberMigrationModal.tsx`:
       - Tambahkan props `wajibRateTiers?: TierRate[]` pada interface `Props`.
       - Saat merender baris pada tabel pratinjau:
         - Jalankan `computeReverseWajibBreakdown(row.tgl_awal_anggota, row.jumlah_simpanan_wajib, wajibRateTiers || [])` untuk setiap baris `row`.
         - Pada kolom Simpanan Wajib (`Simp. Wajib`):
           - Render angka nominal Excel: `formatRupiah(row.jumlah_simpanan_wajib)`.
           - Di bawah nominal:
             - Jika `item.isPre2020Member`:
               Tampilkan badge biru:
               `Pra-2020: Utuh Rp ${formatRupiah(item.pre2020LumpSum)} + ${item.monthsCount} bln diurai`
               Jika `item.hasDifference` (terjadi defisit), tambahkan juga badge peringatan selisih merah.
             - Jika `item.hasDifference`:
               Tampilkan badge peringatan rose/merah:
               `Selisih: ${item.difference > 0 ? '+' : ''}${formatCurrency(item.difference)}`
               dan teks kecil ekspektasi sistem: `(Ekspektasi sistem ${item.monthsCount} bln: ${formatCurrency(item.calculatedTotal)})`.
             - Jika seimbang (`!item.hasDifference && !item.isPre2020Member`):
               Tampilkan badge hijau:
               `Seimbang (${item.monthsCount} bln)`.
           - Tambahkan tombol kecil interaktif `[Uraian]` atau ikon mata / detail pada kolom tersebut untuk membuka popover / sub-modal inspeksi detail uraian bulanan (menampilkan tabel tahun, bulan, tarif per bulan, dan status).
       - Tambahkan ringkasan status di summary card atas (misal counter berapa anggota yang terdapat selisih / seimbang).
  </action>
  <verify>
    Tabel Pratinjau Migrasi Anggota menampilkan badge selisih, informasi pra-2020, dan tombol detail uraian dengan tata letak rapi dan jelas.
  </verify>
  <done>
    Audit selisih dan visualisasi breakdown Simpanan Wajib terpasang lengkap di modal migrasi.
  </done>
</task>

## Verification Criteria
- Props `wajibRateTiers` diteruskan dengan benar dari `ManajemenAnggota.tsx`.
- Modal pratinjau migrasi menampilkan badge selisih (merah/oranye), seimbang (hijau), dan pra-2020 (biru).
- Fitur inspeksi detail uraian bulanan dapat dibuka dan menampilkan rincian bulan per bulan mundur.


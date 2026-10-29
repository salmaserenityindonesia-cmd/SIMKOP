---
phase: 26
plan: 2
wave: 2
gap_closure: false
---

# Plan 26.2: Wave 2 - Admin POS Settings UI

## Objective
Menyediakan form input di antarmuka admin `PengaturanKasir.tsx` agar pengurus/admin koperasi dapat mengatur besaran persentase diskon belanja khusus anggota secara dinamis, lengkap dengan opsi preset cepat dan validasi angka.

## Context
Load these files for context:
- src/pages/admin/PengaturanKasir.tsx
- src/services/posSettingsService.ts

## Tasks

<task type="auto">
  <name>Add Member Discount Percentage Input Section in PengaturanKasir.tsx</name>
  <files>
    src/pages/admin/PengaturanKasir.tsx
  </files>
  <action>
    Perbarui `src/pages/admin/PengaturanKasir.tsx`:
    1. Import icon relevan jika diperlukan (misal: `Percent` atau `Tag` dari `lucide-react`).
    2. Tambahkan section input persentase diskon anggota di dalam form:
       - Label: "Persentase Diskon Khusus Anggota (%)" dengan tanda wajib `*`.
       - Input field bertipe `number`:
         * `name="member_discount_percentage"`
         * `min={0}`
         * `max={100}`
         * `step={0.1}`
         * `value={form.member_discount_percentage ?? ''}`
         * `onChange={e => setForm(prev => ({ ...prev, member_discount_percentage: parseFloat(e.target.value) || 0 }))}`
         * `disabled={isLoading || isSaving}`
       - Suffix unit: `%` di sisi kanan input.
       - Teks penjelasan pembantu: "Diskon otomatis yang diterapkan pada subtotal belanja kasir POS jika pembeli teridentifikasi sebagai anggota koperasi."
       - Tombol preset cepat (Preset Pills):
         * `0% (Nonaktif)`
         * `2.5%`
         * `5% (Standar)`
         * `7.5%`
         * `10%`
         * Helper function `handleDiscountPreset(pct: number)` untuk mengisi form state.
    3. Pada validasi `handleSubmit`:
       - Cek jika `form.member_discount_percentage < 0 || form.member_discount_percentage > 100`:
         tampilkan warning toast "Persentase diskon harus berada di antara 0% dan 100%".
    4. Pastikan `handleReset` mengembalikan `member_discount_percentage` ke `initialData.member_discount_percentage`.
  </action>
  <verify>
    Buka form Pengaturan Kasir, input persentase diskon tampil dengan rapi, preset pills dapat diklik, dan submit form berhasil menyimpan nilai diskon.
  </verify>
  <done>
    Admin dapat mengontrol besaran diskon anggota dari menu admin Pengaturan Kasir.
  </done>
</task>

## Success Criteria
- [ ] Section input "Persentase Diskon Khusus Anggota (%)" hadir di form Pengaturan Kasir.
- [ ] Tersedia tombol preset diskon cepat (0%, 2.5%, 5%, 7.5%, 10%).
- [ ] Validasi nilai 0 - 100% bekerja dengan feedback toast.
- [ ] Nilai tersimpan tidak hilang saat halaman direfresh.


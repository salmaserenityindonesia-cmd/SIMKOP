---
phase: 39
plan: 2
wave: 2
depends_on: ["39.1"]
gap_closure: false
---

# Plan 39.2: UI Upload Logo di Pengaturan Koperasi & Render Dinamis di Halaman Login

## Objective
Mengintegrasikan kartu pengelolaan logo resmi koperasi di halaman Pengaturan Koperasi (`src/pages/admin/PengaturanKoperasi.tsx`) lengkap dengan preview, dropzone/file chooser, tombol unggah dengan indikator loading, dan tombol hapus. Serta me-render logo resmi tersebut secara dinamis di form login (`src/components/auth/LoginForm.tsx`) menggantikan gambar statis.

## Context
- `src/pages/admin/PengaturanKoperasi.tsx` (halaman pengaturan profil koperasi)
- `src/components/auth/LoginForm.tsx` (kartu autentikasi login)
- `src/services/cloudinaryService.ts` (uploader engine)
- `src/services/settingsService.ts` (getter/updater profil)

## Tasks

<task type="auto">
  <name>Build Logo Uploader in PengaturanKoperasi and Dynamic Logo in LoginForm</name>
  <files>
    src/pages/admin/PengaturanKoperasi.tsx
    src/components/auth/LoginForm.tsx
  </files>
  <action>
    1. Perbarui `src/pages/admin/PengaturanKoperasi.tsx`:
       - Tambahkan icon `Upload`, `Trash2`, `Image as ImageIcon` dari `lucide-react`.
       - Import `uploadLogoToCloudinary` dari `../../services/cloudinaryService`.
       - Tambahkan state `isUploadingLogo: boolean` (default false).
       - Tambahkan seksi kartu khusus: **"Logo Resmi Koperasi"** di atas kartu form atau di samping pratinjau struk:
         * Box Preview Logo:
           - Jika `form.logo_url` ada: render `<img src={form.logo_url} alt="Logo Koperasi" className="w-24 h-24 object-contain rounded-xl border border-slate-200 bg-white p-2 shadow-xs" />`.
           - Jika kosong: render placeholder kotak abu-abu dengan ikon `ImageIcon` dan teks "Belum ada logo".
         * Aksi & Kontrol:
           - Hidden file input `<input type="file" ref={fileInputRef} accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoFileChange} className="hidden" />`.
           - Tombol "Unggah Logo" (disabled saat `isUploadingLogo`), dengan animasi spinner saat uploading.
           - Tombol "Hapus Logo" (hanya muncul saat `form.logo_url` tidak kosong/null) yang mengosongkan `logo_url` menjadi `null`.
         * Handler `handleLogoFileChange`:
           - Ambil file dari event target.
           - Validasi awal di client, set `isUploadingLogo(true)`.
           - Panggil `const uploadedUrl = await uploadLogoToCloudinary(file)`.
           - Update state form: `setForm(prev => ({ ...prev, logo_url: uploadedUrl }))`.
           - Panggil `updateKoperasiProfile({ ...form, logo_url: uploadedUrl })` untuk langsung menyimpan ke database dan localStorage.
           - Tampilkan feedback toast sukses atau error jika gagal.
         * Handler `handleRemoveLogo`:
           - Konfirmasi / langsung kosongkan `logo_url: null`.
           - Panggil `updateKoperasiProfile({ ...form, logo_url: null })`.
           - Tampilkan feedback toast info.
    2. Perbarui `src/components/auth/LoginForm.tsx`:
       - Import `getKoperasiProfile` dari `../../services/settingsService`.
       - Tambahkan state `logoUrl: string | null` dan `namaKoperasi: string` yang dimuat saat komponen mount (`useEffect`).
       - Pada bagian logo header form login (baris 45-47):
         * Jika `logoUrl` tersedia, tampilkan `<img alt={namaKoperasi || "Logo Resmi SIMKOP"} className="w-full h-full object-contain rounded-lg" src={logoUrl} onError={(e) => { (e.target as HTMLImageElement).src = '/simkop_brand_logo/logo.png'; }} />`.
         * Jika belum disetel, gunakan fallback bawaan `/simkop_brand_logo/logo.png`.
  </action>
  <verify>
    - Admin dapat memilih file gambar di Pengaturan Koperasi, tombol loading aktif, gambar berhasil terunggah dan tersimpan.
    - Halaman login me-render logo dinamis dari `logoUrl` profil koperasi, dengan fallback aman jika logo tidak disetel.
  </verify>
  <done>Alur unggah logo koperasi ke Cloudinary dan rendering dinamis di portal login selesai diimplementasikan.</done>
</task>

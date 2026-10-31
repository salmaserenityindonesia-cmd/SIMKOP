# Plan 39.2 Summary: UI Upload Logo di Pengaturan Koperasi & Render Dinamis di Halaman Login

## Objective
Mengintegrasikan kartu pengelolaan logo resmi koperasi di halaman Pengaturan Koperasi (`src/pages/admin/PengaturanKoperasi.tsx`) lengkap dengan preview, hidden file input, tombol unggah dengan indikator loading, dan tombol hapus. Serta me-render logo resmi tersebut secara dinamis di form login (`src/components/auth/LoginForm.tsx`) menggantikan gambar statis, dengan fallback aman ke `/simkop_brand_logo/logo.png`.

## Execution Details
- **Task**: Build Logo Uploader in PengaturanKoperasi and Dynamic Logo in LoginForm
  - **Files Modified**:
    - `src/pages/admin/PengaturanKoperasi.tsx`
    - `src/components/auth/LoginForm.tsx`
  - **Files Created**:
    - `src/components/auth/LoginForm.test.tsx`
  - **Commit**: `b03f790e` - `feat(phase-39): implement logo uploader in PengaturanKoperasi and dynamic logo in LoginForm`

### Changes Made
1. **Pengaturan Koperasi (`src/pages/admin/PengaturanKoperasi.tsx`)**:
   - Menambahkan kartu **"Logo Resmi Koperasi"** dengan badge "Branding" di atas form identitas koperasi.
   - Menambahkan box preview logo: merender `<img src={form.logo_url} />` jika ada logo, atau placeholder dashed abu-abu dengan ikon `ImageIcon` dan keterangan "Belum ada logo" jika null.
   - Menambahkan hidden file input tersembunyi berfilter gambar (`accept="image/png,image/jpeg,image/webp,image/svg+xml"`).
   - Menambahkan tombol "Unggah Logo Baru" yang memicu picker file dan menampilkan animasi spinner saat state `isUploadingLogo` aktif.
   - Mengimplementasikan handler `handleLogoFileChange` yang memanggil `uploadLogoToCloudinary(file)`, memperbarui form state, dan langsung memanggil `updateKoperasiProfile()` untuk persistensi ke database Supabase dan localStorage, diiringi feedback toast.
   - Menambahkan tombol "Hapus Logo" (hanya muncul jika `form.logo_url` ada) dengan handler `handleRemoveLogo` untuk mengosongkan `logo_url` ke `null`, memperbarui profil, dan memberikan feedback toast.
   - Menambahkan pratinjau logo resmi di bagian atas struk kasir mini live preview.
2. **Form Login Autentikasi (`src/components/auth/LoginForm.tsx`)**:
   - Mengimpor `getKoperasiProfile` dari `../../services/settingsService`.
   - Menambahkan state `logoUrl: string | null` dan `namaKoperasi: string` yang dimuat secara asinkron saat mount melalui `useEffect`.
   - Mengganti rendering logo statis menjadi logo dinamis (`logoUrl || '/simkop_brand_logo/logo.png'`) dengan fallback `onError` ke default asset.
3. **Unit Testing (`src/components/auth/LoginForm.test.tsx`)**:
   - Menambahkan test suite untuk `LoginForm` yang memvalidasi struktur form login dan penanganan rendering gambar logo serta atribut alt/fallback secara tepat.

## Verification Evidence
- **Type Checking**: `npm run typecheck` (`tsc --noEmit`) exited with code 0.
- **Unit Tests**: `npm test` (`vitest run`) passed 21/21 test files, 207/207 tests passed (100% pass rate).
- **Production Build**: `npm run build` (`vite build`) exited with code 0.
- **Git Commit**:
  - `b03f790e` feat(phase-39): implement logo uploader in PengaturanKoperasi and dynamic logo in LoginForm

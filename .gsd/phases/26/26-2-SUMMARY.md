# Phase 26 Plan 2: Admin POS Settings UI Summary

## Objective
Menyediakan form input di antarmuka admin `PengaturanKasir.tsx` agar pengurus/admin koperasi dapat mengatur besaran persentase diskon belanja khusus anggota secara dinamis, lengkap dengan opsi preset cepat dan validasi angka.

## Implementation Details
1. **Input Section Persentase Diskon Anggota (`src/pages/admin/PengaturanKasir.tsx`)**:
   - Ditambahkan field input angka `member_discount_percentage` dengan suffix `%`.
   - Menggunakan step 0.1, batasan min 0 dan max 100.
   - Dilengkapi deskripsi informatif dan tanda wajib `*`.
2. **Preset Pills Diskon Cepat**:
   - Disediakan tombol pill preset cepat:
     - `0% (Nonaktif)`
     - `2.5%`
     - `5% (Standar)`
     - `7.5%`
     - `10%`
   - Tombol aktif ditandai dengan warna aksen primary.
3. **Validasi Form**:
   - Cek batas nilai 0% hingga 100% pada fungsi `handleSubmit` dengan feedback alert toast.
   - Sinkronisasi reset form ke `initialData` pada `handleReset`.
4. **Sidebar Info Card**:
   - Ditambahkan panel informasi "Diskon Belanja Anggota" pada sidebar untuk memberikan panduan ringkas kalkulasi otomatis dan kustomisasi struk kasir.

## Verification
- TypeScript compilation: `npx tsc --noEmit` passed with 0 errors.
- Production build: `npm run build` completed successfully in 858ms.

## Commits
- `236ec4bf`: `feat(phase-26): add-member-discount-percentage-input-in-pengaturankasir`

---
phase: 49
plan: 2
wave: 2
depends_on: ["49-1"]
gap_closure: false
---

# Plan 49.2: Unit & Component Testing, Static Typecheck & Production Build Verification

## Objective
Membangun rangkaian pengujian unit pada `src/services/memberService.test.ts` untuk memverifikasi method `resetAllMembersData()`, pengujian unit komponen `src/components/common/DangerConfirmModal.test.tsx`, serta pengujian komponen `src/pages/admin/ManajemenAnggota.test.tsx` untuk memverifikasi keberadaan tombol "Reset Data", interaksi dialog modal, validasi keyword "HAPUS SEMUA DATA ANGGOTA", pemanggilan service, serta memastikan seluruh suite Vitest workspace, validasi tipe statis TypeScript (`tsc --noEmit`), dan build produksi Vite (`npm run build`) lulus tanpa error.

## Context
- `src/services/memberService.ts`
- `src/services/memberService.test.ts`
- `src/components/common/DangerConfirmModal.tsx`
- `src/components/common/DangerConfirmModal.test.tsx`
- `src/pages/admin/ManajemenAnggota.tsx`
- `src/pages/admin/ManajemenAnggota.test.tsx`

## Tasks

<task type="auto">
  <name>Implement Unit Tests for resetAllMembersData and DangerConfirmModal Component Tests</name>
  <files>
    src/services/memberService.test.ts,
    src/components/common/DangerConfirmModal.test.tsx,
    src/pages/admin/ManajemenAnggota.test.tsx
  </files>
  <action>
    1. Buka `src/services/memberService.test.ts`:
       - Tambahkan blok `describe('memberService - resetAllMembersData')`:
         * Skenario 1: Berhasil memanggil RPC `reset_members_and_financial_records` dan mengembalikan objek ringkasan data terhapus.
         * Skenario 2: Melempar error deskriptif ketika pemanggilan RPC mengembalikan error.
    2. Buat berkas pengujian komponen `src/components/common/DangerConfirmModal.test.tsx`:
       - Skenario 1: Tidak me-render modal jika `isOpen === false`.
       - Skenario 2: Me-render judul, pesan peringatan bahaya, dan teks instruksi keyword konfirmasi saat `isOpen === true`.
       - Skenario 3: Tombol konfirmasi dalam kondisi disabled ketika input teks kosong atau tidak cocok dengan keyword.
       - Skenario 4: Tombol konfirmasi menjadi aktif ketika input teks tepat sama dengan keyword ("HAPUS SEMUA DATA ANGGOTA").
       - Skenario 5: Memanggil `onConfirm()` saat tombol konfirmasi diklik ketika aktif.
       - Skenario 6: Memanggil `onClose()` saat tombol Batal diklik.
       - Skenario 7: Menampilkan status loading (spinner `Loader2` dan tombol disabled) saat `isLoading === true`.
    3. Di `src/pages/admin/ManajemenAnggota.test.tsx`:
       - Tambahkan verifikasi keberadaan tombol "Reset Data" pada toolbar (memeriksa teks 'Reset Data', styling rose, dan ikon `lucide-rotate-ccw`).
       - Uji keberadaan komponen modal konfirmasi reset ketika state reset modal aktif.
       - Tambahkan export helper test jika diperlukan untuk menguji siklus hidup `triggerResetAllMembers` / `handleConfirmReset` (menampilkan toast sukses, memanggil reset, dan memanggil fetch ulang).
    4. Jalankan pengujian terisolasi:
       `npx vitest run src/services/memberService.test.ts src/components/common/DangerConfirmModal.test.tsx src/pages/admin/ManajemenAnggota.test.tsx`
  </action>
  <verify>
    Seluruh test di `src/services/memberService.test.ts`, `src/components/common/DangerConfirmModal.test.tsx`, dan `src/pages/admin/ManajemenAnggota.test.tsx` lulus 100%.
  </verify>
  <done>
    Unit tests dan component tests untuk fitur reset data anggota dan pembukuan terverifikasi lengkap.
  </done>
</task>

<task type="auto">
  <name>Full Workspace Vitest Suite, Typecheck and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan seluruh test suite Vitest pada workspace untuk memastikan tidak ada efek samping maupun regresi:
       `npx vitest run`
    2. Jalankan validasi tipe TypeScript:
       `npx tsc --noEmit`
    3. Jalankan kompilasi build produksi bundler Vite:
       `npm run build`
    4. Pastikan build output menghasilkan bundle produksi tanpa kesalahan (exit code 0).
  </action>
  <verify>
    `npm run build` dan `npx tsc --noEmit` keluar dengan exit code 0 tanpa error tipe atau bundling.
  </verify>
  <done>
    Seluruh fitur reset data anggota terverifikasi stabil, aman, dan siap deploy ke tahap produksi.
  </done>
</task>

## Success Criteria
- [ ] Unit tests untuk `resetAllMembersData()` mencakup skenario sukses dan kegagalan RPC.
- [ ] Component tests untuk `DangerConfirmModal` memverifikasi penguncian tombol konfirmasi berdasarkan keyword verifikasi teks.
- [ ] Component tests untuk `ManajemenAnggota` memverifikasi tombol "Reset Data" dan integrasi modal.
- [ ] TypeScript typecheck (`tsc --noEmit`) dan build produksi Vite (`npm run build`) lulus tanpa error.

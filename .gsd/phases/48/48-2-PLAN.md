---
phase: 48
plan: 2
wave: 2
depends_on: ["48-1"]
gap_closure: false
---

# Plan 48.2: Unit & Component Testing, Static Verification & Production Build Check

## Objective
Mengembangkan rangkaian pengujian unit pada `src/services/memberService.test.ts` untuk memverifikasi logika `createMember()` (termasuk penyimpanan field `bank_account_number`, `created_at`, dan auto-create akun `member_deposits`), memperbarui pengujian komponen `src/pages/admin/ManajemenAnggota.test.tsx` untuk memastikan modal me-render input rekening bank dan tanggal bergabung, serta memvalidasi tipe statis TypeScript (`tsc --noEmit`) dan build produksi Vite (`npm run build`) lulus tanpa error.

## Context
- `src/services/memberService.ts`
- `src/services/memberService.test.ts`
- `src/pages/admin/ManajemenAnggota.tsx`
- `src/pages/admin/ManajemenAnggota.test.tsx`

## Tasks

<task type="auto">
  <name>Create Unit Tests for createMember and Update ManajemenAnggota Component Tests</name>
  <files>
    src/services/memberService.test.ts,
    src/pages/admin/ManajemenAnggota.test.tsx
  </files>
  <action>
    1. Buka `src/services/memberService.test.ts`.
    2. Tambahkan blok `describe('memberService - createMember')`:
       - Skenario 1: Berhasil mendaftarkan anggota baru dengan `bank_account_number` dan `tgl_awal_anggota`, serta melakukan enroll akun simpanan dasar (Pokok, Wajib, Belanja, Lebaran) ke `member_deposits`.
       - Skenario 2: Menggunakan fallback `new Date().toISOString()` untuk `created_at` jika `tgl_awal_anggota` tidak diberikan.
       - Skenario 3: Menangani seeding otomatis tipe simpanan jika tabel `deposit_types` awalnya kosong.
       - Skenario 4: Melempar error deskriptif jika insert ke tabel `anggota` mengalami kegagalan.
       - Skenario 5: Tidak membatalkan hasil registrasi anggota jika inisialisasi `member_deposits` menemui peringatan/gangguan minor.
    3. Buka `src/pages/admin/ManajemenAnggota.test.tsx`:
       - Tambahkan mock untuk `createMember` di mock `../../services/memberService`.
       - Uji keberadaan label dan input baru pada form modal:
         * "Nomor Rekening Bank (Opsional)"
         * "Tanggal Bergabung"
    4. Jalankan pengujian:
       `npx vitest run src/services/memberService.test.ts src/pages/admin/ManajemenAnggota.test.tsx`
  </action>
  <verify>
    Seluruh test di `src/services/memberService.test.ts` dan `src/pages/admin/ManajemenAnggota.test.tsx` lulus 100%.
  </verify>
  <done>
    Unit test `createMember` dan pengujian komponen modal tambah anggota terverifikasi menyeluruh.
  </done>
</task>

<task type="auto">
  <name>Full Workspace Vitest, Typecheck and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan seluruh test suite Vitest pada workspace untuk memastikan tidak ada efek samping maupun regresi:
       `npx vitest run`
    2. Jalankan validasi tipe TypeScript:
       `npm run typecheck` (atau `npx tsc --noEmit`)
    3. Jalankan build produksi bundler Vite:
       `npm run build`
  </action>
  <verify>
    Seluruh 32+ berkas pengujian Vitest lulus 100%, `tsc --noEmit` bersih tanpa galat tipe, dan `vite build` selesai dengan exit code 0.
  </verify>
  <done>
    Semua tahapan verifikasi statis dan build selesai dengan hasil hijau.
  </done>
</task>

## Success Criteria
- [ ] Unit test `createMember` di `memberService.test.ts` mencakup skenario pendaftaran anggota, formatting tanggal, auto-enroll simpanan, dan penanganan error
- [ ] Pengujian di `ManajemenAnggota.test.tsx` memvalidasi input Nomor Rekening Bank dan Tanggal Bergabung
- [ ] Seluruh unit test vitest workspace (32+ test files) lulus 100% tanpa regresi
- [ ] Pengecekan tipe statis TypeScript (`tsc --noEmit`) bersih tanpa error
- [ ] Vite production build berhasil (`npm run build`) dengan exit code 0

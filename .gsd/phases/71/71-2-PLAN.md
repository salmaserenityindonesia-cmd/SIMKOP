---
phase: 71
plan: 2
wave: 2
gap_closure: false
---

# Plan 71.2: Bind Active Pokok Rate to Master Products, Member Registration & Full Verification

## Objective
Mengintegrasikan nilai tarif aktif Simpanan Pokok (`POKOK` / `SP`) ke dalam Master Produk Simpan Pinjam (`/admin/master-simpan-pinjam`), resolver `getDepositTypes()` di `koperasiService.ts`, serta inisialisasi simpanan anggota di `memberService.ts` / `ManajemenAnggota.tsx`. Memastikan verifikasi menyeluruh (unit tests, typecheck, build).

## Context
Load these files for context:
- `src/services/koperasiService.ts`
- `src/services/memberService.ts`
- `src/pages/admin/ManajemenProdukSimpanPinjam.tsx`
- `src/pages/admin/ManajemenAnggota.tsx`

## Tasks

<task type="auto">
  <name>Bind Active Pokok Tier Rate to Master Products & Member Default</name>
  <files>
    src/services/koperasiService.ts
    src/services/memberService.ts
    src/pages/admin/ManajemenProdukSimpanPinjam.tsx
    src/pages/admin/ManajemenAnggota.tsx
  </files>
  <action>
    1. Buka `src/services/koperasiService.ts`:
       - Pada fungsi `getDepositTypes()`:
         * Pastikan pemetaan tarif efektif mencakup Simpanan Pokok:
           ```typescript
           if (codeUpper === 'SW' || nameLower.includes('wajib')) {
             effectiveRate = activeRates['WAJIB'] || activeRates['SW'];
           } else if (codeUpper === 'SB' || nameLower.includes('belanja')) {
             effectiveRate = activeRates['BELANJA'] || activeRates['SB'];
           } else if (codeUpper === 'SL' || nameLower.includes('lebaran') || nameLower.includes('hari raya')) {
             effectiveRate = activeRates['LEBARAN'] || activeRates['SL'];
           } else if (codeUpper === 'SP' || codeUpper === 'POKOK' || nameLower.includes('pokok')) {
             effectiveRate = activeRates['POKOK'] || activeRates['SP'];
           }
           ```
    2. Buka `src/services/memberService.ts`:
       - Pada fungsi `createMember`:
         * Pastikan saat membuat akun simpanan default anggota (`member_deposits`) atau mengecek nilai acuan simpanan pokok, jika diperlukan nilai default simpanan awal, baca tarif aktif dari `getActiveSavingsRateTiers()` atau `getApplicableRate('POKOK', year, month)`.
    3. Buka `src/pages/admin/ManajemenProdukSimpanPinjam.tsx`:
       - Pastikan baris Simpanan Pokok di tabel master simpanan menampilkan `displayAmount` (`effective_amount`) dan badge "* Sinkron Tarif Bertingkat" secara konsisten jika tarif diubah dari defaultnya.
    4. Buka `src/pages/admin/ManajemenAnggota.tsx`:
       - Tinjau form pendaftaran anggota baru, pastikan jika ada keterangan atau info Simpanan Pokok, nilainya selaras dengan tarif aktif yang berlaku.
  </action>
  <verify>
    Jalankan test suite terkait:
    npx vitest run src/pages/admin/ManajemenProdukSimpanPinjam.test.tsx src/services/memberService.test.ts
  </verify>
  <done>
    Tarif aktif Simpanan Pokok otomatis tersinkronisasi ke Master Produk Simpan Pinjam dan alur registrasi anggota.
  </done>
</task>

<task type="auto">
  <name>Comprehensive Test Suite, Type Check and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan seluruh rangkaian test Vitest:
       `npm test -- --run`
    2. Jalankan validasi tipe TypeScript:
       `npx tsc --noEmit`
    3. Jalankan build produksi Vite:
       `npm run build`
  </action>
  <verify>
    Semua test lulus 100%, typecheck bersih tanpa error, dan output dist berhasil digenerate.
  </verify>
  <done>
    Fitur penambahan Simpanan Pokok ke konfigurasi tarif bertingkat terverifikasi penuh dan siap untuk produksi.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Nilai Simpanan Pokok di `/admin/master-simpan-pinjam` terikat secara dinamis ke tarif aktif `savings_rate_tiers`.
- [ ] Registrasi anggota baru dan master simpan pinjam memanfaatkan tarif aktif Simpanan Pokok.
- [ ] Seluruh unit test lulus dan `npm run build` exit code 0.

## Success Criteria
- [ ] Seluruh integrasi dari Pengaturan Koperasi -> Service Layer -> Master Produk Simpan Pinjam & Anggota berjalan mulus tanpa celah sinkronisasi.

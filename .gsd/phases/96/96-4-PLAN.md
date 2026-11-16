---
phase: 96
plan: 4
wave: 4
depends_on:
  - 96.2
  - 96.3
gap_closure: false
---

# Plan 96.4: Build Buku Bantu Angsuran Bon Toko in `/admin/buku-besar-bon-toko` & Run Full Verification

## Objective
Menyediakan modal **Buku Bantu Angsuran Bon Toko** (`StoreCreditScheduleModal.tsx`) dan tab **Jadwal Angsuran Bon Toko (Potong Gaji)** di `/admin/buku-besar-bon-toko` (`BukuBesarBonToko.tsx`) agar penagihan angsuran bon toko dikelola mandiri dan terpisah total dari Matriks Pinjaman (`/admin/loan-matrix`), lalu memverifikasi seluruh suite test, TypeScript, dan build Vite.

## Context
- .gsd/SPEC.md
- .gsd/phases/96/RESEARCH.md
- src/pages/admin/BukuBesarBonToko.tsx
- src/pages/admin/BukuBesarBonToko.test.tsx
- src/services/storeCreditLedgerService.ts

## Tasks

<task type="auto">
  <name>Create StoreCreditScheduleModal.tsx Component</name>
  <files>
    src/components/pos/StoreCreditScheduleModal.tsx
    src/components/pos/StoreCreditScheduleModal.test.tsx
  </files>
  <action>
    1. Buat komponen `src/components/pos/StoreCreditScheduleModal.tsx` dengan props:
       - `isOpen: boolean`
       - `plan: StoreCreditPlanWithSchedules | null`
       - `onClose: () => void`
       - `onSuccess: () => void`
    2. Tampilkan ringkasan rencana konsolidasi di bagian atas modal:
       - Identitas Anggota (`nama`, `nrp`, `pangkat`)
       - Rincian Akumulasi (`Sisa Bon Lama` + `Nota Baru` = `Total Konsolidasi`)
       - `Tenor Aktif` (`{plan.tenor_months} Bulan`) dan `Angsuran Potong Gaji / Bulan`
       - Pemilih metode pembayaran penagihan (`Potong Gaji` | `Tunai` | `Transfer`) serta input opsional No. Kwitansi / Catatan.
    3. Tampilkan tabel/grid jadwal angsuran (`Periode Ke-1` s/d `Ke-N`):
       - Kolom: `Periode`, `Jatuh Tempo`, `Target Angsuran`, `Terbayar`, `Sisa`, `Status` (`LUNAS` / `SEBAGIAN` / `BELUM BAYAR`), dan `Aksi`.
       - Tombol **"Tagih / Lunasi Angsuran"** pada baris yang belum lunas untuk memanggil `payStoreCreditSchedule(...)` sebesar sisa tagihan periode (atau nominal custom jika parsial).
       - Tampilkan feedback toast sukses/gagal lewat `useFeedback()` dan panggil `onSuccess()` agar data induk ter-refresh.
    4. Buat unit test `src/components/pos/StoreCreditScheduleModal.test.tsx` untuk memverifikasi rendering identitas anggota, rincian akumulasi, baris jadwal angsuran, tombol **"Tagih / Lunasi Angsuran"**, serta ketiadaan markup/referensi ke `/admin/loan-matrix`.
  </action>
  <verify>
    `npx vitest run src/components/pos/StoreCreditScheduleModal.test.tsx`
  </verify>
  <done>
    `StoreCreditScheduleModal.tsx` ter-render lengkap dengan rincian rencana, grid periode, aksi penagihan `payStoreCreditSchedule`, dan unit test lulus 100%.
  </done>
</task>

<task type="auto">
  <name>Add Jadwal Angsuran Bon Toko Tab to BukuBesarBonToko.tsx</name>
  <files>
    src/pages/admin/BukuBesarBonToko.tsx
    src/pages/admin/BukuBesarBonToko.test.tsx
  </files>
  <action>
    1. Perbarui `src/pages/admin/BukuBesarBonToko.tsx`:
       - Tambahkan state tab aktif (`activeTab: 'ledger' | 'installments'`) dengan tombol tab:
         * **"Mutasi Buku Besar Bon"** (tampilan tabel mutasi yang sudah ada)
         * **"Jadwal Angsuran Bon Toko (Potong Gaji)"** (dengan badge jumlah rencana aktif)
       - Muat rencana angsuran aktif lewat `getActiveStoreCreditPlans()` bersama `loadLedgerData()` (dan saat `Segarkan` atau pelunasan berhasil).
       - Pada tab **"Jadwal Angsuran Bon Toko (Potong Gaji)"**, tampilkan daftar/tabel anggota yang memiliki rencana angsuran bon toko aktif:
         * Anggota (`Nama` & `NRP`), `Total Akumulasi Bon`, `Tenor Aktif (X Bln)`, `Potong Gaji / Bln`, `Progres Angsuran (Lunas/Total Periode)`, `Sisa Tagihan`, dan tombol **"Buku Bantu Angsuran"**.
       - Klik **"Buku Bantu Angsuran"** membuka `<StoreCreditScheduleModal />` untuk rencana anggota tersebut.
       - AVOID: Jangan ubah atau campurkan ke `LoanMatrix.tsx` maupun tabel `loans`.
    2. Perbarui mock di `src/pages/admin/BukuBesarBonToko.test.tsx` untuk menyertakan `getActiveStoreCreditPlans` & `payStoreCreditSchedule`, serta tambahkan test yang memverifikasi tab **"Jadwal Angsuran Bon Toko (Potong Gaji)"** dan rendering tanpa regresi pada test existing.
  </action>
  <verify>
    `npx vitest run src/pages/admin/BukuBesarBonToko.test.tsx`
  </verify>
  <done>
    `BukuBesarBonToko.test.tsx` lulus 100% dan tab Jadwal Angsuran Bon Toko + modal Buku Bantu Angsuran terintegrasi dengan mulus.
  </done>
</task>

<task type="auto">
  <name>Full Static Analysis, Test Suite & Vite Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan seluruh test suite Vitest terkait POS & Bon Toko serta full test suite jika tersedia.
    2. Jalankan pemeriksaan tipe TypeScript (`npx tsc --noEmit`).
    3. Jalankan build bundler produksi (`npm run build`).
    4. Pastikan tidak ada file apa pun di `src/pages/admin/LoanMatrix.tsx` atau `src/services/loanService.ts` yang tersentuh atau mencampur piutang bon toko ke tabel `loans`.
  </action>
  <verify>
    `npx vitest run src/services/storeCreditLedgerService.test.ts src/services/posCheckoutService.test.ts src/components/pos/SplitPaymentModal.test.tsx src/components/pos/StoreCreditScheduleModal.test.tsx src/pages/admin/BukuBesarBonToko.test.tsx && npx tsc --noEmit && npm run build`
  </verify>
  <done>
    Seluruh unit test lulus 100%, `npx tsc --noEmit` keluar dengan exit code 0, dan `npm run build` selesai dengan exit code 0 tanpa error.
  </done>
</task>

## Must-Haves
- [ ] Penagihan angsuran bon toko berada khusus di `/admin/buku-besar-bon-toko` via `StoreCreditScheduleModal`.
- [ ] Transaksi bon toko tidak pernah masuk ke `public.loans` maupun `/admin/loan-matrix`.
- [ ] TypeScript check dan Vite build lolos tanpa galat.

## Success Criteria
- [ ] Semua test POS & Buku Besar Bon Toko lulus.
- [ ] `npx tsc --noEmit` dan `npm run build` exit code 0.

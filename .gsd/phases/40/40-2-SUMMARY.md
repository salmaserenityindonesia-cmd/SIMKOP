# Phase 40 Plan 2 Summary: Tampilan Tabel Pratinjau Migrasi Multi-Kolom Lengkap & Scroll Horizontal

## Objective
Memperluas antarmuka modal pratinjau "Migrasi Anggota (14 Kolom)" (`src/components/members/MemberMigrationModal.tsx`) agar dilengkapi scroll horizontal (`overflow-x-auto`) dan vertikal (`max-h-[55vh]`), serta menyajikan seluruh 12 kolom data riil (NRP/Nama, Pangkat, No. Rekening, Tgl Awal, Simp. Pokok, Simp. Wajib, Simp. Belanja, Simp. Lebaran, Jml Pinjaman, Tgl Awal Pinj., Tenor, Sisa Pinjaman) secara murni as-is sesuai berkas Excel tanpa rumus atau teks tambahan seperti "/bln" dan "Selama X bln".

## Key Changes
1. **`src/components/members/MemberMigrationModal.tsx`**:
   - **Lebar Modal**: Diperlebar menjadi `max-w-7xl` agar mampu menampung tabel multi-kolom secara leluasa.
   - **Kartu Ringkasan (Cards)**:
     - Card 1: `Total Anggota` (`rows.length`).
     - Card 2: `Simpanan Pokok` (menampilkan total pokok utuh tanpa teks label '(One-Time)').
     - Card 3: `Total Simpanan Wajib` (menampilkan akumulasi utuh `jumlah_simpanan_wajib` murni tanpa teks '(Dibagi)').
     - Card 4: `Total Pinjaman Aktif` (menampilkan total pinjaman aktif).
   - **Kontainer Tabel**:
     - Dibungkus dengan `<div className="overflow-x-auto border rounded-xl max-h-[55vh] shadow-xs">` dan `sticky top-0 z-20` pada thead untuk navigasi scroll yang nyaman.
   - **Struktur 12 Kolom Header & Body**:
     1. `NRP / Nama`: sticky left dengan border separator sehingga tetap terlihat saat digeser horizontal.
     2. `Pangkat`: data pangkat atau `-`.
     3. `No. Rekening`: font monospace atau `-`.
     4. `Tgl Awal`: tanggal awal keanggotaan atau `-`.
     5. `Simp. Pokok`: format Rupiah (text-right), nilai 0 ditampilkan `-`.
     6. `Simp. Wajib`: format Rupiah (text-right) utuh tanpa rumus pembagian atau teks '/bln'.
     7. `Simp. Belanja`: format Rupiah (text-right), nilai 0 ditampilkan `-`.
     8. `Simp. Lebaran`: format Rupiah (text-right), nilai 0 ditampilkan `-`.
     9. `Jml Pinjaman`: format Rupiah (text-right), nilai 0 ditampilkan `-`.
     10. `Tgl Awal Pinj.`: nilai string/angka asli murni dari Excel (misal: "10", "33", "25", "5") atau `-`.
     11. `Tenor`: `${row.tenor} bln` jika ada pinjaman/tenor aktif, atau `-`.
     12. `Sisa Pinjaman`: format Rupiah (text-right), nilai 0 ditampilkan `-`.
2. **`src/components/members/MemberMigrationModal.test.tsx`**:
   - Menambahkan unit test suite komprehensif (5 tests) yang menguji:
     - Conditional rendering saat modal ditutup.
     - Keberadaan 4 kartu ringkasan tanpa label '(Dibagi)' / '(One-Time)'.
     - Keberadaan seluruh 12 header kolom tabel.
     - Verifikasi data Joko Ramadhan (Simp. Wajib Rp 2.000.000 utuh, Tgl Awal Pinj. 10, Tenor 12 bln, tanpa embel-embel '/bln' dan 'Selama') dan Asep Saputra (Simp. Wajib Rp 6.600.000 utuh, Tgl Awal Pinj. 33).
     - Verifikasi kelas Tailwind `max-w-7xl` dan scroll container `overflow-x-auto border rounded-xl max-h-[55vh] shadow-xs`.

## Verification Evidence
- **Vitest Unit Test Suite**: 23 test files, 224 tests passed (100% pass).
- **TypeScript Typecheck**: `npm run typecheck` passed (exit code 0).
- **Vite Production Build**: `npm run build` completed successfully (exit code 0).

## Commits
- `b3fc6453`: feat(phase-40): expand member migration modal to 12 columns with horizontal scroll

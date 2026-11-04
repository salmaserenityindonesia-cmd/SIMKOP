---
phase: 56
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 56.1: Reverse Month Columns to Display Latest Month First

## Objective
Mengubah urutan penyusunan kolom bulan pada modal "Buku Besar Matriks Simpanan (Checkbox Grid)" (`src/components/compliance/SavingsLedgerMatrixModal.tsx`) menjadi urutan menurun (Descending / Reverse Timeline), sehingga bulan terbaru/berjalan berada di kolom paling kiri depan tanpa mengorbankan integritas kalkulasi alokasi saldo FIFO dan aksi cepat.

## Context
- `src/components/compliance/SavingsLedgerMatrixModal.tsx`
- `src/services/savingsMatrixService.ts`
- `src/components/compliance/SavingsLedgerMatrixModal.test.tsx`
- `.gsd/phases/56/RESEARCH.md`

## Tasks

<task type="auto">
  <name>Reverse Month Columns in SavingsLedgerMatrixModal and Verify Service</name>
  <files>
    src/components/compliance/SavingsLedgerMatrixModal.tsx
    src/services/savingsMatrixService.ts
    src/components/compliance/SavingsLedgerMatrixModal.test.tsx
  </files>
  <action>
    1. Buka `src/services/savingsMatrixService.ts`:
       - Perbarui `generateMonthGrid(startYear: number, endYear: number, order: 'asc' | 'desc' = 'asc')` agar mendukung parameter opsional `order`. Jika `order === 'desc'`, urutkan array secara menurun dari tahun & bulan terbesar ke terkecil.
    2. Buka `src/components/compliance/SavingsLedgerMatrixModal.tsx`:
       - Ekspor atau definisikan `displayMonths` berbasis `allGridMonths` yang diurutkan descending (terbaru ke terlama):
         ```typescript
         const displayMonths = useMemo(() => {
           return [...allGridMonths].sort((a, b) => {
             if (b.year !== a.year) return b.year - a.year;
             return b.month - a.month;
           });
         }, [allGridMonths]);
         ```
       - Pada rendering `<thead>`:
         - Ganti mapping header kolom bulan dari `allGridMonths.map(...)` menjadi `displayMonths.map(...)`.
       - Pada rendering `<tbody>`:
         - Ganti mapping sel baris `Setoran Rutin` dari `allGridMonths.map(...)` menjadi `displayMonths.map(...)`.
       - Pastikan logika:
         - Tab switcher (Simpanan Wajib, Simpanan Belanja, Simpanan Lebaran) otomatis merender kolom terbaru di kiri.
         - Quick action "Centang Semua s/d Bulan Ini" dan "Cocokkan Otomatis dengan Saldo Impor" tetap berjalan akurat.
    3. Buka `src/components/compliance/SavingsLedgerMatrixModal.test.tsx`:
       - Tambahkan unit test spesifik yang memverifikasi bahwa kolom header bulan dirender dalam urutan descending (misal: kolom pertama setelah 'Tahun & Item' adalah bulan terbaru di rentang grid, dan bulan terlama berada di urutan terakhir).
       - Jalankan vitest untuk memastikan semua test lulus.
  </action>
  <verify>
    npx vitest run src/components/compliance/SavingsLedgerMatrixModal.test.tsx
  </verify>
  <done>
    Kolom bulan pada modal buku besar simpanan tersusun descending (bulan terbaru di posisi paling kiri). Seluruh unit test lulus.
  </done>
</task>

## Success Criteria
- [ ] Kolom bulan modal buku besar simpanan menampilkan bulan terbaru di sebelah kiri (setelah kolom Tahun & Item).
- [ ] Bulan berjalan dan periode terkini dapat dilihat langsung tanpa horizontal scroll berlebih.
- [ ] Logika tab switcher (Wajib, Belanja, Lebaran) dan aksi cepat (FIFO & Centang s/d bulan ini) berfungsi normal.
- [ ] Unit test `SavingsLedgerMatrixModal.test.tsx` lulus 100%.


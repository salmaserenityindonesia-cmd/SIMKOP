# Summary: Plan 46.2 - Bind Dynamic Year Selector in LoanMatrix.tsx

## Objective
Menghubungkan fungsi `getLoanMatrixAvailableYears()` ke komponen halaman Matriks Pinjaman (`src/pages/admin/LoanMatrix.tsx`) sehingga dropdown pemilih tahun me-render opsi tahun dinamis berdasarkan data pinjaman aktif di database, dengan penyesuaian state `year` otomatis.

## Tasks Completed
1. **Integrate getLoanMatrixAvailableYears into LoanMatrix Component**
   - Mengimpor `getLoanMatrixAvailableYears` dari `../../services/loanMatrixService`.
   - Menambahkan state `availableYears` terinisialisasi dengan `[currentYear]`.
   - Mengimplementasikan `useEffect` mount untuk memanggil `getLoanMatrixAvailableYears()`, memperbarui daftar tahun ke `setAvailableYears`, dan memperbarui `year` secara dinamis jika `year` sebelumnya tidak terdapat dalam rentang `availableYears`.
   - Mengganti array statis `[currentYear - 1, currentYear, currentYear + 1]` pada elemen dropdown `<select>` dengan iterasi dari `availableYears`.
   - Memastikan event `onChange` pada `<select>` tetap memicu `fetchData()` secara reaktif melalui dependensi `useEffect([year])`.

## Files Changed
- `src/pages/admin/LoanMatrix.tsx`

## Verification
- TypeScript check (`npx tsc --noEmit`): Lolos tanpa error tipe data.
- Unit testing (`npx vitest run src/services/loanMatrixService.test.ts`): 5/5 pengujian lulus.

## Commit
- `07fd43ac`: `feat(phase-46): integrate getLoanMatrixAvailableYears into LoanMatrix component`

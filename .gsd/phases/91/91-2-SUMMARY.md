# Plan 91.2 Summary: Render Saldo Pra-Tahun Column in LoanMatrix.tsx

## Metadata
- **Phase**: 91
- **Plan**: 2
- **Wave**: 2
- **Status**: Completed
- **Commit**: `22041ea4`

## Tasks Completed

| Task | Name | Files | Commit |
|---|---|---|---|
| 1 | Add Saldo Pra-Jan Column to LoanMatrix Table | `src/pages/admin/LoanMatrix.tsx`, `src/pages/admin/LoanMatrix.test.tsx` | `22041ea4` |

## Key Changes
1. **Table Header (`thead`)**:
   - Menambahkan elemen `<th>` untuk "Saldo Pra Jan-{String(year).slice(-2)}" dengan subtitle "Akumulasi Lampau" tepat setelah kolom "Anggota" dan sebelum kolom bulan (Jan-Des).
2. **Table Body Cell (`tbody`)**:
   - Menambahkan elemen `<td>` dengan `data-testid={`prior-summary-${row.memberId}`}` yang merender ringkasan saldo pinjaman pra-tahun:
     - Pokok (P): `row.principalAmount` diformat `Rp {Number(row.principalAmount || 0).toLocaleString('id-ID')}`
     - Lunas: `row.priorYearPaid` diformat `Rp {Number(row.priorYearPaid || 0).toLocaleString('id-ID')}`
     - Sisa: `row.priorYearRemaining` diformat `Rp {Number(row.priorYearRemaining || 0).toLocaleString('id-ID')}`
3. **ColSpan Adjustment**:
   - Memperbarui `colSpan` pada baris loading state dan baris empty state dari `14` menjadi `15` agar konsisten dengan total 15 kolom tabel.
4. **Unit Testing (`LoanMatrix.test.tsx`)**:
   - Menambahkan test suite baru `Saldo Pra-Jan (Akumulasi Lampau) Column Rendering (Phase 91)` dengan 5 test case:
     - Memverifikasi render teks header "Saldo Pra Jan-26" dan subtitle "Akumulasi Lampau".
     - Memverifikasi pemotongan tahun dinamis (misal tahun 2025 -> "Saldo Pra Jan-25").
     - Memverifikasi render data Pokok, Lunas, dan Sisa dalam sel ringkasan pra-tahun.
     - Memverifikasi fallback default Rp 0 ketika data opsional tidak terdefinisi.
     - Memverifikasi atribut `colSpan={15}` pada loading state dan empty state.

## Verification
- Unit test Vitest: `npm test -- --run src/pages/admin/LoanMatrix.test.tsx` lolos 37 tests (100% pass).

## Next Steps
- Wave 3 (Plan 91.3): Analisis statis TypeScript dan verifikasi build produksi Vite.

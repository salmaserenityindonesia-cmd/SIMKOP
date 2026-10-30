# Plan 34.4: Wave 4 - Utility Ekspor Excel & PDF Landscape Kartu Stok Summary

## Objective
Mengimplementasikan modul utility ekspor `src/utils/mutationExporter.ts` untuk mengunduh laporan mutasi barang dan kartu stok dalam format Microsoft Excel (.xlsx via lazy dynamic import `exceljs`) dan dokumen cetak PDF Landscape A4 (`jspdf` + `jspdf-autotable`). Menghubungkan tombol ekspor di `src/pages/admin/LaporanMutasiBarang.tsx` ke utility tersebut, serta membuat unit test komprehensif di `src/utils/mutationExporter.test.ts`.

## Tasks Completed
1. **Task 1: Build mutationExporter for Excel and PDF**
   - Implemented `src/utils/mutationExporter.ts`:
     * `exportMutationToExcel`: Uses dynamic import `(await import('exceljs')).default` to ensure minimal initial bundle impact. Renders official cooperative profile header (`KoperasiProfile`), report title, date range, product stock ledger banner (when in single product mode), 6-metric KPI summary block, and a fully-styled ledger table with emerald header (`#0F766E`), numerical formatting (`#,##0` and `Rp #,##0`), cell borders, and total row. Automatically triggers download of `laporan_mutasi_barang_{startDate}_{endDate}.xlsx`.
     * `exportMutationToPdf`: Uses `jsPDF` configured for A4 Landscape (`orientation: 'landscape', unit: 'mm', format: 'a4'`). Generates cooperative letterhead, report title, date range, stock card banner, 6 rounded KPI metric cards (cardWidth: 41.5mm, cardGap: 4mm fitting exact 269mm printable width), striped `autoTable` with dark teal headers (`#0F766E`), running balance, right-aligned numbers, total footer, and footer pagination with generated timestamp ("Halaman X dari Y").
     * Supports both unified options object (`ExportMutationOptions`) and positional parameter signatures.
     * Helper functions `formatRp` and `formatMutationDate` for consistent formatting and resilient date handling.
   - Connected `handleExportExcel` and `handlePrintPdf` in `src/pages/admin/LaporanMutasiBarang.tsx` to call `exportMutationToExcel` and `exportMutationToPdf` with cooperative profile loaded via `getKoperasiProfile()`, along with UI loading state spinners.
   - Verified with `npm run typecheck` (0 errors).
   - Commit: `16428178 feat(phase-34): build mutationExporter for Excel and PDF`

2. **Task 2: Create Unit Tests for mutationExporter**
   - Implemented `src/utils/mutationExporter.test.ts`:
     * Tested `formatRp` and `formatMutationDate` (including null, undefined, invalid date strings).
     * Tested `exportMutationToExcel` for general warehouse mutation report, stock card mode (`Kartu Stok Gudang`), positional arguments, and empty records handling. Verified browser download trigger and anchor cleanup.
     * Tested `exportMutationToPdf` verifying landscape orientation (`width > height`, 297mm x 210mm), page count, `productLedger` banner, `doc.save` call, positional arguments, and null profile handling.
   - Verified with `npx vitest run src/utils/mutationExporter.test.ts` (11/11 passed in 209ms).
   - Verified project-wide types with `npm run typecheck` (0 errors).
   - Commit: `e7471aa2 feat(phase-34): create unit tests for mutationExporter`

## Verification Evidence
- `npm run typecheck`: Passed with 0 errors.
- `npx vitest run src/utils/mutationExporter.test.ts`: 11/11 unit tests passed.
- `npm test`: All 18 test files (176 tests) passed across the entire project.

## Commits
- `16428178`: feat(phase-34): build mutationExporter for Excel and PDF
- `e7471aa2`: feat(phase-34): create unit tests for mutationExporter

## Deviations
- None. All requirements implemented strictly in accordance with plan specification.

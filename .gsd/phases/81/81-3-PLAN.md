# Plan 81.3: Consolidate Member Domain & Turn koperasiService.ts into Backwards-Compatible Facade

## Objective
Mengkonsolidasikan seluruh fungsi domain anggota di `src/services/memberService.ts`, serta merombak `src/services/koperasiService.ts` menjadi fasad agregator yang ramping:
1. `memberService.ts` memuat:
   - `Anggota`, `AnggotaWithSimpanan`, `MemberImportInput`, `ImportMembersChunkedResult`
   - `getAnggota`, `fetchAllAnggotaPaged`, `fetchAnggota`, `addAnggota`, `updateAnggota`, `deleteAnggota`
   - `getAnggotaWithSimpanan`
   - `importMembersChunked`, `batchInsertMembers`, `processBatchMemberMigration`, `executeMemberMigration`, `importMembersFromExcel`
2. `koperasiService.ts` disederhanakan menjadi fasad re-export yang mengekspor seluruh antarmuka dan fungsi dari:
   - `./memberService`
   - `./purchaseInvoiceService`
   - `./depositManagementService`
   - fungsi master produk & kategori pendukung
3. Menjalankan verifikasi komprehensif:
   - Unit tests vitest (907+ tests).
   - Analisis statis TypeScript `npx tsc --noEmit`.
   - Build produksi Vite `npm run build`.


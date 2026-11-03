---
phase: 53
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 53.1: Excel Exporter Engine with Difference Validation Formula

## Objective
Membangun modul generator ekspor Excel (`src/utils/savingsMatrixExporter.ts`) menggunakan library ExcelJS untuk menghasilkan berkas matriks audit per jenis simpanan (Wajib, Belanja, Lebaran) dengan struktur horizontal lengkap dari tanggal bergabung anggota paling lampau hingga September 2026, formula Excel dinamis (`=SUM(...)`, selisih terhadap saldo acuan, dan status validasi `SEIMBANG`/`KURANG`/`LEBIH`), conditional formatting warna, serta unit tests di `src/utils/savingsMatrixExporter.test.ts`.

## Context
- `src/utils/savingsMatrixExporter.ts`
- `src/utils/savingsMatrixExporter.test.ts`
- `src/services/savingsMatrixService.ts`
- `src/services/savingsRateService.ts`
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Build Savings Matrix Excel Exporter Engine</name>
  <files>
    src/utils/savingsMatrixExporter.ts
  </files>
  <action>
    1. Buat berkas `src/utils/savingsMatrixExporter.ts`.
    2. Definisikan interface `ExportSavingsMatrixOptions`:
       ```typescript
       export type DepositTypeKey = 'WAJIB' | 'BELANJA' | 'LEBARAN';
       export interface ExportSavingsMatrixOptions {
         depositTypeCode: DepositTypeKey;
         startYear?: number;
         startMonth?: number;
         endYear?: number;
         endMonth?: number;
         autoSave?: boolean;
       }
       ```
    3. Implementasikan fungsi `generateSavingsMatrixWorkbook(options: ExportSavingsMatrixOptions)`:
       - Query anggota aktif dari `public.anggota`: `id, nrp, nama, created_at, tgl_awal_anggota`. Urutkan berdasarkan `nama ASC`.
       - Query `deposit_types` untuk mencocokkan tipe simpanan yang dipilih.
       - Query `savings_rate_tiers` untuk mengambil tarif bulanan yang berlaku pada setiap periode bulan.
       - Query `member_deposits` dan `deposit_transactions` untuk menghitung `saldo_acuan_database` (saldo awal migrasi atau akumulasi saldo riil anggota).
       - Tentukan rentang bulan horizontal:
         * Bulan awal: Dihitung dari tanggal bergabung anggota tertua (fallback: Mei 2021).
         * Bulan akhir: September 2026 (atau default `endYear: 2026, endMonth: 9`).
       - Susun kolom worksheet:
         * Kolom A: `NRP`
         * Kolom B: `Nama Anggota`
         * Kolom C: `Tgl Masuk` (YYYY-MM-DD)
         * Kolom D: `Saldo Acuan Database` (number format: `#,##0`)
         * Kolom E s/d Kolom [N]: Kolom bulan horizontal (label `MMM-YY`, misal `Mei-21`, `Jun-21`, dst.)
         * Kolom [N+1]: `Total Alokasi` dengan formula Excel: `=SUM(E{r}:[ColN]{r})`
         * Kolom [N+2]: `Selisih` dengan formula Excel: `=[ColTotal]{r}-D{r}`
         * Kolom [N+3]: `Status Validasi` dengan formula Excel: `=IF([ColSelisih]{r}=0,"SEIMBANG",IF([ColSelisih]{r}<0,"KURANG","LEBIH"))`
       - Isi nilai nominal pada baris tiap anggota:
         * Untuk bulan >= `tgl_awal_anggota` dan dicakup oleh saldo acuan/pembayaran, isi nilai rekomendasi tarif periode tersebut (atau nilai riil yang ada).
         * Jika belum terdaftar pada bulan tersebut, biarkan sel kosong (`null`).
       - Tambahkan conditional formatting pada kolom `Status Validasi`:
         * Value = `"SEIMBANG"`: fill color hijau muda (`#D1FAE5`), font `#065F46`.
         * Value = `"KURANG"` atau `"LEBIH"`: fill color merah muda (`#FEE2E2`), font `#991B1B`.
    4. Implementasikan fungsi `exportSavingsMatrixExcel(depositTypeCode: DepositTypeKey, options?: Partial<ExportSavingsMatrixOptions>)`:
       - Menjalankan `generateSavingsMatrixWorkbook`.
       - Mengubah workbook menjadi buffer (`await workbook.xlsx.writeBuffer()`).
       - Memicu pengunduhan berkas via browser dengan nama `periksa_simpanan_${depositTypeCode.toLowerCase()}.xlsx`.
       - Mengembalikan workbook untuk keperluan pengujian.
  </action>
  <verify>
    npx vitest run src/utils/savingsMatrixExporter.test.ts
  </verify>
  <done>
    `src/utils/savingsMatrixExporter.ts` berhasil dibuat dan menghasilkan workbook Excel dengan formula validasi selisih dan conditional formatting.
  </done>
</task>

<task type="auto">
  <name>Create Comprehensive Unit Tests for Savings Matrix Exporter</name>
  <files>
    src/utils/savingsMatrixExporter.test.ts
  </files>
  <action>
    1. Buat berkas `src/utils/savingsMatrixExporter.test.ts`.
    2. Mock Supabase client dan modul pendukung untuk menyimulasikan data anggota, tarif simpanan, dan saldo acuan database.
    3. Buat test cases:
       - Menghasilkan struktur kolom lembar kerja yang benar (NRP, Nama, Tgl Masuk, Saldo Acuan, kolom-kolom bulan, Total Alokasi, Selisih, Status Validasi).
       - Memastikan formula Excel pada kolom Total Alokasi `=SUM(...)` dan Selisih `=... - D{row}` terpasang dengan benar pada setiap baris anggota.
       - Memastikan formula Excel pada kolom Status Validasi `=IF(...)` berisi logika evaluasi status SEIMBANG, KURANG, dan LEBIH.
       - Memverifikasi pengisian nominal sesuai tanggal bergabung (anggota tidak dialokasikan nominal pada bulan sebelum bergabung).
       - Memastikan conditional formatting rule terdaftar pada worksheet.
  </action>
  <verify>
    npx vitest run src/utils/savingsMatrixExporter.test.ts
  </verify>
  <done>
    Seluruh test case unit untuk generator ekspor Excel matriks simpanan lulus 100%.
  </done>
</task>

## Success Criteria
- [ ] Berkas `src/utils/savingsMatrixExporter.ts` menghasilkan berkas Excel dengan formula validasi selisih dinamis.
- [ ] Pengujian unit di `src/utils/savingsMatrixExporter.test.ts` lulus 100%.

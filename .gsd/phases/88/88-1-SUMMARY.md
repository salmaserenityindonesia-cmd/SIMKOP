# Phase 88 Plan 1 Summary: Conditional Pokok Injection in Template Generator

## Objective Achieved
Memperbarui fungsi pembuatan template Excel simpanan bulanan pada `src/services/batchUpdateService.ts` dengan menyisipkan baris Simpanan Pokok (`Kode Simpanan: 'POKOK'`) secara kondisional:
- Anggota aktif dengan Simpanan Pokok yang telah lunas hanya mendapatkan 3 baris simpanan rutin bulanan (WAJIB, LEBARAN, BELANJA).
- Anggota aktif dengan Simpanan Pokok belum lunas mendapatkan baris ke-4 bertipe POKOK dengan nilai `Telah Dibayar` terisi akumulasi pembayaran pokok sebelumnya dan `Jumlah Bayar` terisi sisa kekurangan pokok menuju target.
- Semua baris simpanan per anggota terkumpul berurutan dan terurut rapi.

## Key Changes
1. **Helper Functions & Pure Row Builder (`src/services/batchUpdateService.ts`)**:
   - `isPokokDepositType`: Mendeteksi apakah tipe simpanan merupakan Simpanan Pokok (mencakup kode `POKOK`, `SP`, atau nama `pokok`).
   - `getDepositTypeSortOrder`: Mengurutkan prioritas simpanan rutin per anggota secara konsisten: 1: `WAJIB`, 2: `LEBARAN`, 3: `BELANJA`, dan simpanan rutin lainnya di urutan berikutnya.
   - `buildSavingsTemplateRows`: Logika murni (pure function) untuk menyusun data baris template simpanan bulanan:
     * Menghitung saldo pokok terbayar (`effectivePaidPokok`) dari transaksi historis simpanan pokok.
     * Mengevaluasi status kelunasan: `isPokokLunas = effectivePaidPokok >= effectivePokokTarget`.
     * Menyusun baris berurutan per anggota: WAJIB, LEBARAN, BELANJA.
     * Menambahkan baris ke-4 bertipe POKOK hanya jika `!isPokokLunas` dengan sisa tagihan `effectivePokokTarget - effectivePaidPokok`.
   - `generateSavingsBatchTemplate`: Mengambil data anggota aktif, rekening simpanan, jenis simpanan, transaksi bulan berjalan, serta seluruh transaksi pokok historis (dengan mekanisme pagination/chunking 200 data untuk skalabilitas), lalu memanggil `buildSavingsTemplateRows` dan menyusun Excel workbook.
   - `downloadBatchTemplate`: Menghubungkan pembuatan template simpanan ke `generateSavingsBatchTemplate` dan memicu unduhan browser secara aman.

2. **Tarif Pokok Aktif (`src/services/savingsRateService.ts`)**:
   - `getActivePokokTariff`: Mengekstrak nominal tarif simpanan pokok aktif dari `savings_rate_tiers` (tier aktif `end_year IS NULL`), fallback ke `deposit_types.default_amount`, dan fallback default Rp 10.000.

3. **Unit Tests (`src/services/batchUpdateService.test.ts`)**:
   - 8 pengujian unit komprehensif menguji:
     * Deteksi jenis simpanan pokok (`isPokokDepositType`).
     * Pengurutan prioritas simpanan rutin (`getDepositTypeSortOrder`).
     * Anggota lunas pokok hanya menerima 3 baris tagihan.
     * Anggota belum pernah bayar pokok menerima 4 baris tagihan dengan sisa penuh.
     * Anggota dengan cicilan sebagian menerima 4 baris tagihan dengan perhitungan selisih akurat.
     * Multi-anggota dikelompokkan secara berurutan dan konsisten.
     * Pembayaran sebagian/penuh pada simpanan rutin bulan bersangkutan.
     * Fallback anggota baru tanpa rekening simpanan terdaftar.

## Verification
- Vitest suite `src/services/batchUpdateService.test.ts`: 8/8 passed.
- Full Vitest suite: 1002/1002 passed across 73 test suites.
- Vite build (`npm run build`): Completed successfully in 1.14s without TypeScript or bundling errors.

## Commits
- `60d84898`: `feat(phase-88): implement conditional pokok logic in generateSavingsBatchTemplate`

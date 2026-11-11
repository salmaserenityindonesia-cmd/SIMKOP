# Plan 89.1 Summary: Filter Out Paid Principal Savings from Template Export

## Execution Overview
- **Phase:** 89 (Wave 1)
- **Plan:** 89-1-PLAN.md
- **Status:** Complete
- **Commit:** `8435ca70` (`feat(phase-89): Apply Strict Lifetime Settlement Check for POKOK Rows`)

## Key Changes
1. **Strict Lifetime Settlement Check (`buildSavingsTemplateRows` & `generateSavingsBatchTemplate`)**:
   - Memastikan ambang batas tarif Simpanan Pokok aktif diperoleh secara bertingkat:
     1. Nilai `pokokTargetAmount` jika diteruskan (> 0).
     2. Nilai tarif aktif dari `savings_rate_tiers` (`deposit_type_code = 'POKOK'`, `end_year IS NULL`).
     3. Fallback `default_amount` dari `deposit_types` (kode `POKOK` / `SP`).
     4. Default fallback aman Rp 10.000.
   - Menghitung akumulasi riwayat setoran Simpanan Pokok seumur hidup per anggota dari seluruh transaksi `deposit_transactions` (tipe `deposit` dikurangi `withdrawal`) serta memperhitungkan saldo awal profil `jumlah_simpanan_pokok` anggota.
   - Status lunas ditentukan melalui `totalPokokPaid >= effectivePokokTarget`.
   - Jika Simpanan Pokok telah lunas (`isPokokLunas === true`), baris `POKOK` **tidak dimasukkan** ke dalam template (hanya menyisakan 3 baris simpanan rutin: WAJIB, LEBARAN, BELANJA).
   - Jika belum lunas (`isPokokLunas === false`), baris `POKOK` dicantumkan dengan nilai `telah_dibayar: totalPokokPaid` dan `jumlah_bayar: effectivePokokTarget - totalPokokPaid`.
   - Mengisi properti `nomor_rekening` dan `bank_account_number` pada seluruh baris template agar kompatibel secara menyeluruh.
2. **Defensif Fetching Anggota**:
   - Mengambil `jumlah_simpanan_pokok` pada kueri `anggota` dengan fallback otomatis jika kolom tersebut tidak ada di skema database.
3. **Comprehensive Unit Testing (`batchUpdateService.test.ts`)**:
   - Menambahkan unit test untuk validasi pelunasan dari saldo profil `jumlah_simpanan_pokok` anggota tanpa mutasi transaksi.
   - Menambahkan unit test untuk fallback tarif default Rp 10.000 saat `pokokTargetAmount = 0`.
   - Menambahkan unit test untuk ambang batas tarif aktif dari `savings_rate_tiers`.
   - Menambahkan unit test pada `generateSavingsBatchTemplate` untuk memastikan baris POKOK tersaring keluar ketika anggota sudah lunas.

## Verification Evidence
- `npx vitest run src/services/batchUpdateService.test.ts`: 16/16 tests passing (100%).
- `npx tsc --noEmit`: Exit code 0, no TypeScript compilation errors.

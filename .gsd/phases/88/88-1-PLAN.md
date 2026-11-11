---
phase: 88
plan: 1
wave: 1
gap_closure: false
---

# Plan 88.1: Conditional Pokok Injection in Template Generator

## Objective
Memperbarui fungsi pembuatan template Excel simpanan bulanan pada `src/services/batchUpdateService.ts` agar memeriksa status pelunasan Simpanan Pokok masing-masing anggota aktif. Jika Simpanan Pokok anggota belum lunas, tambahkan baris Simpanan Pokok (`Kode Simpanan: 'POKOK'`) dengan kolom `Telah Dibayar` terisi akumulasi pembayaran pokok saat ini dan `Jumlah Bayar` terisi sisa kekurangan pokok. Jika sudah lunas, jangan munculkan baris Simpanan Pokok untuk anggota tersebut.

## Context
- `src/services/batchUpdateService.ts`
- `src/services/savingsRateService.ts`
- Supabase Tables:
  - `public.anggota` (`id`, `nrp`, `nama`, `bank_account_number`, `status`)
  - `public.deposit_types` (`id`, `code`, `name`, `frequency_type`, `default_amount`)
  - `public.member_deposits` (`id`, `member_id`, `deposit_type_id`)
  - `public.deposit_transactions` (`id`, `member_deposit_id`, `transaction_type`, `amount`, `for_month`, `for_year`)
  - `public.savings_rate_tiers` (`deposit_type_code`, `monthly_rate`, `start_year`, `start_month`, `end_year`, `end_month`)

## Tasks

<task type="auto">
  <name>Implement Conditional POKOK Logic in generateSavingsBatchTemplate</name>
  <files>
    src/services/batchUpdateService.ts
  </files>
  <action>
    1. Buka `src/services/batchUpdateService.ts`.
    2. Pisahkan logika pembuatan data template Excel simpanan ke dalam fungsi helper yang dapat diuji (pure/exportable), misalnya `buildSavingsTemplateRows(members, deposits, depositTypes, txsForMonth, allPokokTxs, pokokTargetAmount, month, year)`.
    3. Ambil data master tarif pokok aktif:
       - Ambil nominal tarif Simpanan Pokok dari `savings_rate_tiers` (atau melalui `getApplicableRate('POKOK', year, month)` dari `savingsRateService.ts`).
       - Fallback ke `deposit_types` dengan kode `'POKOK'` (`default_amount`), default: Rp 10.000 (atau nominal konfigurasi aktif).
    4. Ambil status saldo Simpanan Pokok seluruh anggota:
       - Ambil semua rekening simpanan pokok dari `member_deposits` bertipe `'POKOK'`.
       - Ambil riwayat transaksi setoran pokok (`deposit_transactions` dengan `transaction_type = 'deposit'` atau netto deposit minus withdrawal) untuk menghitung total yang telah dibayar per anggota (`paidPokok`).
       - Tentukan status: `isPokokLunas = paidPokok >= targetPokokAmount`.
    5. Saat menyusun baris template Excel per anggota:
       - Baris 1: `Kode Simpanan: WAJIB` (Telah Dibayar: X, Jumlah Bayar: target/kekurangan tarif wajib)
       - Baris 2: `Kode Simpanan: LEBARAN` (Telah Dibayar: Y, Jumlah Bayar: target/kekurangan tarif lebaran)
       - Baris 3: `Kode Simpanan: BELANJA` (Telah Dibayar: Z, Jumlah Bayar: target/kekurangan tarif belanja)
       - **Pengecekan Kondisional Pokok**:
         * Jika `!isPokokLunas`:
           Tambahkan baris ke-4 untuk anggota tersebut:
           - NRP: `m.nrp`
           - Nama: `m.nama`
           - Nomor Rekening: `m.bank_account_number || '-'`
           - Bulan: `month`
           - Tahun: `year`
           - Kode Simpanan: `'POKOK'`
           - Telah Dibayar: `paidPokok`
           - Jumlah Bayar: `Math.max(0, targetPokokAmount - paidPokok)`
         * Jika `isPokokLunas`:
           JANGAN tambahkan baris POKOK untuk anggota tersebut.
       - Pastikan baris tersusun rapi per anggota (semua baris simpanan milik anggota yang sama dikelompokkan berurutan).
    6. Ekspor juga fungsi helper `generateSavingsBatchTemplate` atau pertahankan signature `downloadBatchTemplate` yang memanggil builder internal ini.
  </action>
  <verify>
    Periksa kompilasi kode dan pastikan builder baris template menghasilkan 3 baris untuk anggota dengan pokok lunas dan 4 baris untuk anggota dengan pokok belum lunas.
  </verify>
  <done>
    Generator template simpanan bulanan berhasil menyisipkan baris simpanan pokok secara kondisional berdasarkan status pelunasan masing-masing anggota.
  </done>
</task>

## Success Criteria
- [ ] Anggota dengan Simpanan Pokok yang sudah lunas hanya mendapatkan 3 baris tagihan bulanan (WAJIB, LEBARAN, BELANJA).
- [ ] Anggota dengan Simpanan Pokok belum lunas mendapatkan baris ke-4 bertipe POKOK dengan nilai `Telah Dibayar` dan `Jumlah Bayar` yang akurat.
- [ ] Baris Excel per anggota terkumpul berurutan secara konsisten.

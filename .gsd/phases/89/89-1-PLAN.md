---
phase: 89
plan: 1
wave: 1
gap_closure: false
---

# Plan 89.1: Filter Out Paid Principal Savings from Template Export

## Objective
Menerapkan pengecekan pelunasan Simpanan Pokok seumur hidup yang ketat (*strict lifetime settlement check*) pada generator data template Excel `generateSavingsBatchTemplate` di `src/services/batchUpdateService.ts`. Memastikan baris dengan kode simpanan `POKOK` hanya muncul jika akumulasi pembayaran Simpanan Pokok anggota belum mencapai tarif resmi aktif (< Rp 10.000 / tarif aktif), dan sepenuhnya diabaikan bagi anggota yang sudah lunas (hanya menyisakan baris simpanan rutin WAJIB, LEBARAN, dan BELANJA).

## Context
- `src/services/batchUpdateService.ts`
- `src/services/savingsRateService.ts`
- Supabase Tables:
  - `public.anggota` (`id`, `nrp`, `nama`, `bank_account_number`, `status`, `jumlah_simpanan_pokok`)
  - `public.deposit_types` (`id`, `code`, `name`, `default_amount`, `frequency_type`)
  - `public.member_deposits` (`id`, `member_id`, `deposit_type_id`)
  - `public.deposit_transactions` (`id`, `member_deposit_id`, `transaction_type`, `amount`, `for_month`, `for_year`)
  - `public.savings_rate_tiers` (`deposit_type_code`, `monthly_rate`, `start_year`, `start_month`, `end_year`, `end_month`)

## Tasks

<task type="auto">
  <name>Apply Strict Lifetime Settlement Check for POKOK Rows</name>
  <files>
    src/services/batchUpdateService.ts
  </files>
  <action>
    1. Buka `src/services/batchUpdateService.ts`.
    2. Cari fungsi penyusun baris data template simpanan (`generateSavingsBatchTemplate` dan `buildSavingsTemplateRows`):
       - Ambil ambang batas tarif Simpanan Pokok yang berlaku:
         * Nilai dari tabel `savings_rate_tiers` untuk `deposit_type_code = 'POKOK'` yang aktif (`end_year IS NULL`).
         * Fallback ke `default_amount` dari `deposit_types` (default: 10.000).
       - Kueri total akumulasi pembayaran simpanan pokok seumur hidup per anggota:
         * Ambil seluruh transaksi setoran (`transaction_type = 'deposit'`) pada akun `member_deposits` bertipe `POKOK`.
         * Perhitungkan juga saldo awal simpanan pokok dari profil anggota (`jumlah_simpanan_pokok` pada `anggota`) jika ada.
         * Hitung total terbayar: `totalPokokPaid = SUM(amount)`.
         * Tentukan status lunas: `const isPokokLunas = totalPokokPaid >= targetPokokAmount;`
       - Saat menyusun baris Excel per anggota:
         * Baris WAJIB: Selalu dibuat.
         * Baris LEBARAN: Selalu dibuat.
         * Baris BELANJA: Selalu dibuat.
         * Baris POKOK:
           - Pasang proteksi logika tegas:
             ```typescript
             if (!isPokokLunas) {
               rows.push({
                 nrp: member.nrp,
                 nama: member.nama,
                 bank_account_number: member.bank_account_number || '-',
                 bulan: selectedMonth,
                 tahun: selectedYear,
                 kode_simpanan: 'POKOK',
                 telah_dibayar: totalPokokPaid,
                 jumlah_bayar: Math.max(0, targetPokokAmount - totalPokokPaid)
               });
             }
             ```
           - Jika `isPokokLunas === true`, jangan lakukan `push` baris POKOK sama sekali untuk anggota tersebut.
    3. Update unit test di `src/services/batchUpdateService.test.ts` untuk memvalidasi skenario pelunasan seumur hidup dengan batas tarif aktif maupun fallback 10.000.
  </action>
  <verify>
    Jalankan unit test: `npx vitest run src/services/batchUpdateService.test.ts`.
    Semua unit test harus lulus 100%.
  </verify>
  <done>
    Baris POKOK pada template unduhan update massal berhasil disaring secara presisi berdasarkan status pelunasan seumur hidup.
  </done>
</task>

## Success Criteria
- [ ] Anggota dengan Simpanan Pokok yang sudah lunas (akumulasi >= tarif pokok) tidak memiliki baris 'POKOK' pada template.
- [ ] Anggota dengan Simpanan Pokok belum lunas memiliki baris 'POKOK' dengan kolom `Telah Dibayar` dan `Jumlah Bayar` (sisa kewajiban).
- [ ] Baris WAJIB, LEBARAN, dan BELANJA tetap dihasilkan untuk setiap anggota.


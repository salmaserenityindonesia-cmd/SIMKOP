---
phase: 43
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 43.1: Pembersihan Mutasi Simpanan Lama Tanpa Syarat & Penimpaan Saldo Tunggal Mutlak

## Objective
Memperkuat logika pembersihan transaksi simpanan di `src/services/memberExcelService.ts` pada `executeMigration`: saat migrasi anggota dijalankan, hapus seluruh mutasi deposit lama anggota pada `deposit_transactions` (menggunakan pattern komprehensif atau pembersihan seluruh mutasi awal simpanan terkait) sehingga tidak ada sisa transaksi lampau yang tertinggal atau terakumulasi ganda, lalu masukkan TEPAT SATU baris mutasi baru per tipe simpanan dengan deskripsi standar `'Saldo Awal Migrasi Sistem'` (atau `'Migrasi Saldo Awal (As-Is)'`).

## Context
- `src/services/memberExcelService.ts` (`executeMigration`)
- `src/services/memberExcelService.test.ts`

## Tasks

<task type="auto">
  <name>Strengthen Overwrite Cleansing for Deposit Transactions</name>
  <files>
    src/services/memberExcelService.ts
  </files>
  <action>
    1. Buka `src/services/memberExcelService.ts`:
    2. Pada fungsi `executeMigration`:
       - Saat memproses simpanan anggota (`member_deposits`):
         * Dapatkan seluruh `id` dari `member_deposits` milik `memberId`.
         * Hapus seluruh mutasi lama pada `deposit_transactions` untuk seluruh akun simpanan anggota tersebut yang deskripsinya memuat kata kunci migrasi / saldo awal / one-time / historical / default, atau hapus semua transaksi yang bertipe migrasi:
           ```typescript
           if (existingDeposits && existingDeposits.length > 0) {
             const mdIds = existingDeposits.map((d: any) => d.id);
             // Hapus seluruh mutasi migrasi lama tanpa toleransi sisa
             const { error: errDelTx } = await supabase
               .from('deposit_transactions')
               .delete()
               .in('member_deposit_id', mdIds)
               .or('description.ilike.%migrasi%,description.ilike.%saldo awal%,description.ilike.%migration%,description.ilike.%historical%');

             if (errDelTx) {
               console.warn(`Gagal membersihkan mutasi migrasi lama untuk member ${row.nrp}:`, errDelTx.message);
             }
           }
           ```
         * Masukkan HANYA SATU transaksi deposit per tipe simpanan dengan jumlah nominal mutlak dari Excel (`dt.amount`) dan deskripsi standar:
           `description: 'Saldo Awal Migrasi Sistem'`
         * Pastikan `dt.amount` > 0 baru di-insert; jika 0, tidak perlu di-insert (atau dibiarkan bersih dengan saldo 0).
  </action>
  <verify>
    Saat file Excel diimpor ulang (misal Joko Ramadhan dengan Pokok 10.000, Wajib 2.000.000, Belanja 500.000, Lebaran 300.000):
    - Seluruh transaksi lama terhapus bersih.
    - Hanya ada tepat 1 baris transaksi per jenis simpanan, sehingga total saldo simpanan pokok tetap Rp 10.000 (tidak menjadi 120.000 atau berlipat ganda).
  </verify>
  <done>Pembersihan mutasi simpanan lama berjalan tuntas dan mutlak.</done>
</task>

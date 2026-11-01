---
phase: 42
plan: 2
wave: 2
depends_on: ["42.1"]
gap_closure: false
---

# Plan 42.2: Idempotent Exact Replacement (Timpa Penuh) pada Sinkronisasi Simpanan & Pinjaman

## Objective
Mengimplementasikan kebijakan Timpa Penuh (Exact Replacement Overwrite) pada `executeMigration` di `src/services/memberExcelService.ts`: ketika file Excel diimpor ulang / direvisi, data transaksi migrasi awal sebelumnya yang pernah tercatat untuk anggota tersebut dibersihkan/dihapus terlebih dahulu sebelum mutasi nilai baru dimasukkan, sehingga total saldo akhir tidak pernah bertumpuk/berganda (bukan `current + new`, melainkan `exact replacement`).

## Context
- `src/services/memberExcelService.ts` (`executeMigration`)
- Supabase tables: `deposit_transactions`, `member_deposits`, `loans`, `loan_schedules`, `loan_repayments`

## Tasks

<task type="auto">
  <name>Implement Idempotent Overwrite in executeMigration</name>
  <files>
    src/services/memberExcelService.ts
  </files>
  <action>
    1. Buka `src/services/memberExcelService.ts`.
    2. Pada fungsi `executeMigration`:
       - Untuk setiap anggota yang diproses:
         * **Simpanan**:
           - Temukan semua `member_deposits` milik `memberId`.
           - Sebelum memasukkan transaksi awal baru, hapus transaksi migrasi awal lama yang tercatat pada `deposit_transactions` untuk `member_deposits` anggota tersebut yang deskripsinya mencakup `'Migrasi Saldo Awal'` atau `'One-Time Principal Deposit Migration'` atau `'Historical Balance Migration'`:
             ```typescript
             // Hapus mutasi migrasi lama agar saldo digantikan sepenuhnya (exact overwrite)
             const { data: existingDeposits } = await supabase
               .from('member_deposits')
               .select('id')
               .eq('member_id', memberId);

             if (existingDeposits && existingDeposits.length > 0) {
               const mdIds = existingDeposits.map(d => d.id);
               await supabase
                 .from('deposit_transactions')
                 .delete()
                 .in('member_deposit_id', mdIds)
                 .in('description', [
                   'Migrasi Saldo Awal (As-Is)',
                   'One-Time Principal Deposit Migration',
                   'Historical Balance Migration'
                 ]);
             }
             ```
           - Masukkan satu record baru `deposit_transactions` per tipe simpanan dengan `amount: dt.amount` murni dari file Excel revisi.
         * **Pinjaman**:
           - Jika ada pinjaman migrasi lama bertipe `'active'` dengan format nomor `LOAN-MIG-%` atau keterangan migrasi (`notes ILIKE '%Migrasi Histori Pinjaman%'`), bersihkan jadwal & repayments pinjaman migrasi lama tersebut atau lakukan penimpaan aman agar saldo sisa pinjaman tidak berganda saat file diunggah ulang.
    3. Pastikan penanganan error memberikan logging yang jelas dan tidak menghentikan pemrosesan baris lain bila ada satu baris gagal.
  </action>
  <verify>
    Lakukan re-import file Excel yang sama dua kali:
    - Saldo simpanan wajib, pokok, belanja, dan lebaran anggota tetap sama persis dengan angka di Excel (tidak berlipat ganda menjadi 2x lipat).
  </verify>
  <done>Kebijakan Timpa Mutlak (Exact Replacement Overwrite) aktif dan idempoten.</done>
</task>

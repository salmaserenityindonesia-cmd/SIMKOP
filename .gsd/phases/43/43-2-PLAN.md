---
phase: 43
plan: 2
wave: 2
depends_on: ["43.1"]
gap_closure: false
---

# Plan 43.2: Penyelarasan Pembacaan Snapshot Simpanan pada Modal Rincian Migrasi

## Objective
Memperbarui pembacaan mutasi saldo pada modal rincian snapshot migrasi (`src/components/members/MemberMigrationDetailModal.tsx`) agar membaca nilai transaksi migrasi terkini secara bersih dan tahan terhadap rekod lama, mencocokkan deskripsi `'Saldo Awal Migrasi Sistem'` serta variasi pola migrasi, dan menampilkan angka mutlak murni dari Excel tanpa akumulasi ganda.

## Context
- `src/components/members/MemberMigrationDetailModal.tsx`

## Tasks

<task type="auto">
  <name>Align MemberMigrationDetailModal with Overwritten Single Migration Balances</name>
  <files>
    src/components/members/MemberMigrationDetailModal.tsx
  </files>
  <action>
    1. Buka `src/components/members/MemberMigrationDetailModal.tsx`.
    2. Pada bagian ekstraksi transaksi simpanan (`fetchMigrationDetails`):
       - Filter transaksi yang berhubungan dengan migrasi:
         ```typescript
         const migrationTxs = txs.filter((t: any) => {
           const desc = (t.description || '').toLowerCase();
           return desc.includes('migra') || desc.includes('migration') || desc.includes('saldo awal');
         });
         ```
       - Jika terdapat lebih dari 1 transaksi migrasi karena riwayat lama di database, ambil transaksi migrasi yang **paling mutakhir** (`created_at` atau `id` terbaru) atau jumlahkan transaksi migrasi aktif jika sudah bersih.
       - Pastikan pemetaan per jenis simpanan (pokok, wajib, belanja, lebaran) menggunakan nilai mutlak tersebut.
       - Pastikan total akumulasi seluruh simpanan dihitung dari penjumlahan nilai-nilai mutlak tersebut:
         `total = pokok + wajib + belanja + lebaran`.
  </action>
  <verify>
    Buka modal rincian untuk Joko Ramadhan:
    - Simpanan Pokok: Rp 10.000
    - Simpanan Wajib: Rp 2.000.000
    - Simpanan Belanja: Rp 500.000
    - Simpanan Lebaran: Rp 300.000
    - Total: Rp 2.810.000
  </verify>
  <done>Modal rincian migrasi menampilkan angka mutlak bersih sesuai Excel revisi.</done>
</task>

---
phase: 54
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 54.1: Database View & Service Layer Net Savings Aggregation

## Objective
Membangun PostgreSQL View `view_member_net_savings` pada migrasi database Supabase untuk menghitung posisi saldo kas riil per anggota (setoran dikurangi penarikan/belanja di POS/pencairan), serta memperkaya fungsi `getComplianceMatrixData` pada `src/services/complianceService.ts` dengan properti `netSavings` (`wajib`, `belanja`, `lebaran`, `total`), dilengkapi dengan unit tests di `src/services/complianceService.test.ts`.

## Context
- `supabase/migrations/033_create_member_net_savings_view.sql`
- `src/services/complianceService.ts`
- `src/services/complianceService.test.ts`
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Create PostgreSQL View for Member Net Savings Position</name>
  <files>
    supabase/migrations/033_create_member_net_savings_view.sql
  </files>
  <action>
    1. Buat berkas migrasi `supabase/migrations/033_create_member_net_savings_view.sql`.
    2. Definisikan view `public.view_member_net_savings`:
       - Ambil kolom anggota: `m.id AS member_id`, `m.nrp`, `m.nama`.
       - Ambil kode & nama tipe simpanan: `dt.code AS deposit_type_code`, `dt.name AS deposit_type_name`.
       - Hitung `net_cash_balance` dengan menjumlahkan `tx.amount` ketika `tx.transaction_type = 'deposit'` dan mengurangkan `tx.amount` ketika `tx.transaction_type = 'withdrawal'`.
       - Hitung `total_deposited` dan `total_withdrawn`.
       - LEFT JOIN antara `public.anggota`, `public.member_deposits`, `public.deposit_types`, dan `public.deposit_transactions`.
       - GROUP BY `m.id, m.nrp, m.nama, dt.code, dt.name`.
       - Berikan izin akses `GRANT SELECT ON public.view_member_net_savings TO authenticated, anon;`.
  </action>
  <verify>
    Berkas migrasi `033_create_member_net_savings_view.sql` valid dan mendefinisikan view saldo kas riil dengan perhitungan netto setoran dan penarikan.
  </verify>
  <done>
    Skrip SQL view database siap untuk dijalankan dan diintegrasikan.
  </done>
</task>

<task type="auto">
  <name>Enrich Compliance Service with Net Savings Aggregation</name>
  <files>
    src/services/complianceService.ts
    src/services/complianceService.test.ts
  </files>
  <action>
    1. Pada `src/services/complianceService.ts`:
       - Deklarasikan interface `MemberNetSavings`:
         ```typescript
         export interface MemberNetSavings {
           wajib: number;
           belanja: number;
           lebaran: number;
           total: number;
         }
         ```
       - Tambahkan `netSavings?: MemberNetSavings;` ke dalam interface `ComplianceMatrixRow`.
       - Di dalam fungsi `getComplianceMatrixData(year, depositType)`:
         * Query `supabase.from('view_member_net_savings').select('member_id, deposit_type_code, deposit_type_name, net_cash_balance')`.
         * Buat helper pencocokan jenis simpanan (Wajib: code `WAJIB`/`SW` atau name includes `wajib`; Belanja: code `BELANJA`/`SB` atau name includes `belanja`; Lebaran: code `LEBARAN`/`SL`/`SHR` atau name includes `lebaran` / `hari raya`).
         * Tambahkan fallback resilien: jika data dari view tidak tersedia (misal lingkungan unit test atau view belum dimigrasi di DB lokal), hitung akumulasi saldo netto langsung dari seluruh transaksi anggota (`memberTxs` atau `transactions` di mana `transaction_type === 'deposit'` bernilai positif dan `transaction_type === 'withdrawal'` bernilai negatif).
         * Petakan `netSavings` ke setiap objek `results` anggota:
           ```typescript
           netSavings: {
             wajib: wajibBalance,
             belanja: belanjaBalance,
             lebaran: lebaranBalance,
             total: wajibBalance + belanjaBalance + lebaranBalance
           }
           ```
    2. Pada `src/services/complianceService.test.ts`:
       - Tambahkan unit test baru yang menguji bahwa `getComplianceMatrixData` mengembalikan properti `netSavings` pada setiap baris anggota.
       - Uji skenario di mana anggota memiliki transaksi setoran dan penarikan (misal simpanan belanja ditarik atau dipotong belanja kasir), dan pastikan `netSavings.belanja` serta `netSavings.total` merefleksikan saldo bersih yang benar.
       - Jalankan `npx vitest run src/services/complianceService.test.ts` untuk memastikan seluruh pengujian lolos.
  </action>
  <verify>
    Jalankan `npx vitest run src/services/complianceService.test.ts` dan pastikan seluruh test suite lolos 100%.
  </verify>
  <done>
    Lapisan service kepatuhan kini mengekspos saldo kas bersih riil anggota secara terstruktur.
  </done>
</task>

# Phase 54 Research: Tampilkan Saldo Kas Riil Anggota (Net Bersih Setelah Belanja & Penarikan) pada Matriks Simpanan

## 1. Executive Summary & Problem Context
Pada halaman Matriks Kepatuhan Simpanan Tahunan (`/admin/compliance-matrix`), angka akumulasi bulanan pada tooltip sel tabel hanya merefleksikan historis setoran masuk (`deposit`). Hal ini belum mencerminkan posisi keuangan kas riil anggota secara komprehensif karena belum memperhitungkan pengurangan akibat:
1. Belanja anggota di kasir POS dengan metode potong simpanan belanja (`transaction_type = 'withdrawal'`).
2. Penarikan tunai simpanan sukarela/lebaran atau belanja (`transaction_type = 'withdrawal'`).
3. Pencairan dana simpanan lainnya.

Akibatnya, admin koperasi kesulitan melihat posisi saldo riil bersih anggota secara seketika tanpa harus membuka modal detail buku besar satu per satu.

Fase 54 menyelesaikan permasalahan ini dengan:
1. Menyediakan PostgreSQL View `view_member_net_savings` yang mengagregasikan buku besar transaksi (`deposit_transactions`) menjadi saldo bersih (Total Setor - Total Tarik) per anggota dan jenis simpanan.
2. Memperkaya lapisan data layanan `getComplianceMatrixData` di `src/services/complianceService.ts` dengan properti `netSavings` (`wajib`, `belanja`, `lebaran`, `total`).
3. Menampilkan kartu ringkas posisi saldo kas riil anggota secara langsung di bawah nama dan nomor NRP pada kolom "Informasi Anggota" di `/admin/compliance-matrix`.

## 2. Architecture & Data Flow

```
[ PostgreSQL: view_member_net_savings ]
       │ (LEFT JOIN anggota, member_deposits, deposit_types, deposit_transactions)
       ▼
[ complianceService.ts: getComplianceMatrixData ]
       │ enrich ComplianceMatrixRow with netSavings
       ▼
[ ComplianceMatrix.tsx: Informasi Anggota Column ]
       │ Kartu "Kas Riil Anggota" (Total, Wajib, Belanja, Lebaran)
```

## 3. Database View Specification (`supabase/migrations/033_create_member_net_savings_view.sql`)
- Nomor migrasi berikutnya adalah `033` (karena `031_create_savings_rate_tiers.sql` dan `032_clean_orphan_loans_and_enforce_integrity.sql` sudah ada di sistem).
- Struktur view:
  ```sql
  CREATE OR REPLACE VIEW public.view_member_net_savings AS
  SELECT 
    m.id AS member_id,
    m.nrp,
    m.nama,
    dt.code AS deposit_type_code,
    dt.name AS deposit_type_name,
    COALESCE(
      SUM(
        CASE 
          WHEN tx.transaction_type = 'deposit' THEN tx.amount 
          WHEN tx.transaction_type = 'withdrawal' THEN -tx.amount 
          ELSE 0 
        END
      ), 0
    ) AS net_cash_balance,
    COALESCE(SUM(CASE WHEN tx.transaction_type = 'deposit' THEN tx.amount ELSE 0 END), 0) AS total_deposited,
    COALESCE(SUM(CASE WHEN tx.transaction_type = 'withdrawal' THEN tx.amount ELSE 0 END), 0) AS total_withdrawn
  FROM public.anggota m
  LEFT JOIN public.member_deposits md ON md.member_id = m.id
  LEFT JOIN public.deposit_types dt ON dt.id = md.deposit_type_id
  LEFT JOIN public.deposit_transactions tx ON tx.member_deposit_id = md.id
  GROUP BY m.id, m.nrp, m.nama, dt.code, dt.name;

  GRANT SELECT ON public.view_member_net_savings TO authenticated;
  GRANT SELECT ON public.view_member_net_savings TO anon;
  ```

## 4. Service Layer Specification (`src/services/complianceService.ts`)
- Tambahkan interface pada `ComplianceMatrixRow`:
  ```typescript
  export interface MemberNetSavings {
    wajib: number;
    belanja: number;
    lebaran: number;
    total: number;
  }

  export interface ComplianceMatrixRow {
    // ... properti eksisting
    netSavings?: MemberNetSavings;
  }
  ```
- Implementasi pemanggilan `view_member_net_savings` dengan graceful fallback:
  - Query ke `view_member_net_savings` untuk mengambil `member_id`, `deposit_type_code`, `deposit_type_name`, dan `net_cash_balance`.
  - Jika view tidak mengembalikan data atau saat berjalan pada lingkungan test mock sederhana, kalkulasikan `netSavings` secara mandiri dari array `transactions` / `memberTxs` yang sudah diambil di fungsi `getComplianceMatrixData`.
  - Ini menjamin kehandalan 100% baik di lingkungan produksi maupun unit test.

## 5. UI Integration Specification (`src/pages/admin/ComplianceMatrix.tsx`)
- Lokasi: Di dalam kolom pertama `Informasi Anggota` (`<td>`), di bawah nama anggota dan badge status `Pokok: Lunas / Belum`.
- Tampilan kartu ringkas:
  - Header: Label "KAS RIIL ANGGOTA" dengan angka Total Kas berwarna emerald tebal (`font-bold text-emerald-700`).
  - Baris Wajib: `Rp {wajib.toLocaleString('id-ID')}`
  - Baris Belanja: `Rp {belanja.toLocaleString('id-ID')}`
  - Baris Lebaran: `Rp {lebaran.toLocaleString('id-ID')}`
  - Tipografi: Font monospace (`font-mono text-[11px]`), rapi, batas tepi atas halus (`border-t border-slate-100 mt-2 pt-2`).
- Kolom tabel tetap stabil dengan lebar `w-[280px]` yang sudah mencukupi untuk menampung kartu ringkas tanpa menyebabkan pergeseran horizontal sel bulan.

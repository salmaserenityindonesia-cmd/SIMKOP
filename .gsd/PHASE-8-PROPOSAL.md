# Rencana Implementasi: Konfigurasi & Fleksibilitas Simpan Pinjam Dinamis (Phase 8)

## 1. Pemahaman & Konsep Bisnis
Sesuai dengan requirement yang Anda berikan, sistem harus mendukung:
1. **Dynamic Types**: Admin dapat meng-create jenis simpanan (misal: Hari Raya, Belanja Bulanan) dan jenis pinjaman dengan aturan masing-masing (jumlah default, frekuensi, bisa ditarik/tidak).
2. **Cicilan Fleksibel (Parsial)**: Anggota dapat mencicil simpanan atau pinjaman kapan saja, dengan besaran bebas.
3. **Tracking Komitmen Bulanan**: Sistem melacak total uang yang dibayarkan pada bulan tertentu. Jika totalnya sudah mencapai nominal komitmen (misal: Wajib 50rb/bulan), maka status bulan tersebut menjadi "Lunas".

## 2. Struktur Database (Supabase)
Skema database yang Anda berikan sudah **sangat baik** karena sudah mengadopsi tabel *Dynamic Types* (`deposit_types` dan `loan_types`). Kita hanya perlu sedikit penyesuaian untuk melacak cicilan spesifik per bulan.

Silakan jalankan **SQL Statement** berikut di **Supabase SQL Editor** Anda:

```sql
-- 1. Tambahkan kolom untuk melacak alokasi cicilan ke bulan dan tahun tertentu di transaksi simpanan
ALTER TABLE public.deposit_transactions 
ADD COLUMN for_month integer,
ADD COLUMN for_year integer;

-- 2. Tambahkan kolom untuk melacak alokasi cicilan angsuran ke bulan dan tahun tertentu di transaksi pinjaman
ALTER TABLE public.loan_installments 
ADD COLUMN for_month integer,
ADD COLUMN for_year integer;

-- 3. Buat VIEW untuk memudahkan perhitungan pelunasan simpanan per bulan secara otomatis
CREATE OR REPLACE VIEW public.monthly_deposit_commitments AS
SELECT 
    md.id AS member_deposit_id,
    md.member_id,
    dt.id AS deposit_type_id,
    dt.name AS deposit_name,
    dt.default_amount AS commitment_amount,
    dtx.for_month,
    dtx.for_year,
    COALESCE(SUM(dtx.amount), 0) AS total_paid,
    dt.default_amount - COALESCE(SUM(dtx.amount), 0) AS remaining_balance,
    CASE 
        WHEN COALESCE(SUM(dtx.amount), 0) >= dt.default_amount THEN 'lunas'
        ELSE 'belum_lunas'
    END AS status
FROM 
    public.member_deposits md
JOIN 
    public.deposit_types dt ON md.deposit_type_id = dt.id
LEFT JOIN 
    public.deposit_transactions dtx ON dtx.member_deposit_id = md.id
WHERE 
    dt.frequency_type = 'monthly'
GROUP BY 
    md.id, md.member_id, dt.id, dt.name, dt.default_amount, dtx.for_month, dtx.for_year;

-- 4. Buat VIEW untuk memudahkan perhitungan pelunasan angsuran pinjaman per bulan secara otomatis
CREATE OR REPLACE VIEW public.monthly_loan_commitments AS
SELECT 
    l.id AS loan_id,
    l.member_id,
    l.planned_installment_amount AS commitment_amount,
    li.for_month,
    li.for_year,
    COALESCE(SUM(li.amount), 0) AS total_paid,
    l.planned_installment_amount - COALESCE(SUM(li.amount), 0) AS remaining_balance,
    CASE 
        WHEN COALESCE(SUM(li.amount), 0) >= l.planned_installment_amount THEN 'lunas'
        ELSE 'belum_lunas'
    END AS status
FROM 
    public.loans l
LEFT JOIN 
    public.loan_installments li ON li.loan_id = l.id
GROUP BY 
    l.id, l.member_id, l.planned_installment_amount, li.for_month, li.for_year;
```

## 3. Plan Eksekusi (Phase 8 Roadmap)
Saya telah menambahkan **Phase 8** ke dalam `ROADMAP.md` dengan langkah-langkah berikut yang siap dieksekusi:

* **Plan 8.1**: **Migrasi Codebase Service Layer**.
  Saat ini `koperasiService.ts` masih menggunakan tabel dummy statis (`simpanan`, `pinjaman`). Kita akan mengubahnya untuk meng-query tabel `deposit_types`, `loans`, dan `member_deposits` yang sebenarnya.
* **Plan 8.2**: **Modul Pengaturan Jenis Produk**.
  Membuat UI (di halaman Admin) agar pengurus koperasi bisa menambah, mengedit, dan menghapus Jenis Simpanan dan Jenis Pinjaman secara mandiri.
* **Plan 8.3**: **Refaktor UI Simpanan (Dashboard Simpanan)**.
  Menambahkan kemampuan untuk melihat daftar simpanan dinamis yang dimiliki anggota, dan tombol "Bayar Simpanan" yang bisa dicicil nominalnya untuk bulan tertentu.
* **Plan 8.4**: **Refaktor UI Pinjaman**.
  Menyesuaikan form pengajuan pinjaman agar memuat dropdown "Jenis Pinjaman", serta halaman detail pinjaman untuk mencatat cicilan angsuran per bulan secara parsial.
* **Plan 8.5**: **Integrasi View Komitmen Bulanan**.
  Memanfaatkan SQL VIEW yang baru saja dibuat untuk menampilkan badge status **"Lunas / Kurang bayar Rp X"** di UI untuk tagihan bulan berjalan.

Anda dapat menjalankan `cat .gsd/ROADMAP.md` untuk melihat pembaruan pada Roadmap, atau langsung menjalankan `/plan 8` saat Anda sudah mengeksekusi SQL di atas dan siap untuk memulai koding!

# Summary 84.1: Fix Database Join and Fallback Mapping in withdrawalReportService.ts

## Overview
Berhasil merevisi layanan kueri riwayat penarikan simpanan di `src/services/withdrawalReportService.ts`:
1. **Ekstraksi Profil Anggota Menyeluruh**:
   - Menambahkan resolusi profil anggota via relasi join nested `member_deposits.anggota` yang mencakup field `nama`, `name`, `nrp`, `pangkat`, `bank_name`, `bank_account_number`, dan `status`.
   - Menangani field nama alternatif (`nama || name`).
2. **Cross-Lookup Fallback ke Tabel Sales**:
   - Mengidentifikasi transaksi belanja kasir POS (struk dengan nomor referensi `INV-...`, metode pembayaran `potong_simpanan_belanja`, atau deskripsi kasir).
   - Menangani kendala skema PostgREST di mana tabel `sales` tidak mendukung nested join langsung ke `anggota (...)` (yang sebelumnya menyebabkan kueri mengembalikan null / error di lingkungan live database). Kueri `sales` kini dilakukan secara flat (`id, sale_number, member_id`), lalu `member_id` dipetakan ke data master `anggota`.
   - Menambahkan 5 layer resolusi identitas:
     1. Rekening rekening simpanan (`md.member_id`)
     2. Cross-lookup tabel `sales` berdasarkan `sale_number` / `reference_no`
     3. Ekstraksi UUID penjualan dari `notes` ("Transaksi penjualan POS ID: ...")
     4. Single query direct fallback ke `sales`
     5. Pencocokan nama/nrp pada deskripsi/catatan transaksi.
   - Mengeliminasi kasus tampilan "Anggota Tidak Dikenal" untuk transaksi POS seperti kwitansi `INV-1794286975137`.
3. **Resolusi Jenis Simpanan yang Akurat Tanpa Fallback Kaku**:
   - Membangun fungsi `isBelanja(...)` dan menyempurnakan `categorizeDepositType(...)`.
   - Memastikan transaksi dengan kode/nama/metode belanja toko kasir terpetakan ke kode `BELANJA` dan nama `"Simpanan Belanja Bulanan"` tanpa jatuh ke badge kaku `"Simpanan Sukarela"`.
4. **Pengujian Unit**:
   - Menambahkan unit test untuk fungsi `isBelanja`.
   - Menambahkan unit test verifikasi transaksi `INV-1794286975137` ter-resolve dengan nama "Yanto Santoso", NRP "96316180", dan nama simpanan "Simpanan Belanja Bulanan" (17/17 tests passing).


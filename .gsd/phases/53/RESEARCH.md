# Phase 53 Research: Ekspor & Impor Matriks Buku Besar Simpanan via Excel (.xlsx) dengan Formula Validasi Selisih

## 1. Executive Summary & Architecture Context
Fitur pencocokan buku besar simpanan otomatis berbasis web saat ini berjalan dengan baik untuk volume kecil hingga menengah, namun rekonsiliasi skala penuh untuk ratusan anggota seringkali memerlukan audit eksternal melalui spreadsheet oleh pengurus/admin.

Rencana ini menyediakan solusi audit luar-jaringan (offline) yang solid berbasis Excel (.xlsx):
1. **Ekspor Matriks Periksa**: Mengunduh lembar kerja horizontal lengkap dengan formula dinamis Excel (`SUM`, selisih terhadap saldo acuan, dan status validasi `SEIMBANG`/`KURANG`/`LEBIH`), serta conditional formatting bawaan Excel.
2. **Impor Matriks Audit**: Membaca kembali berkas Excel yang telah diverifikasi atau disesuaikan admin, mengekstrak mutasi bulanan per anggota, menghapus mutasi rekonsiliasi lama agar tidak terjadi duplikasi saldo, lalu menyisipkan transaksi secara massal ke `deposit_transactions`.

## 2. Technical Stack & Dependencies
- **Library Excel**: `exceljs` (^4.4.0) sudah terpasang di `package.json`. ExcelJS mendukung penulisan formula (`{ formula: '...' }`), conditional formatting rules, number formats, dan styling sel.
- **Database Tables**:
  - `public.anggota`: tabel master anggota aktif (`id, nrp, nama, created_at, tgl_awal_anggota, status, membership_status`).
  - `public.deposit_types`: tipe simpanan (`id, name, code, default_amount`).
  - `public.member_deposits`: akun simpanan anggota (`id, member_id, deposit_type_id, is_terminated`).
  - `public.deposit_transactions`: buku besar mutasi (`id, member_deposit_id, transaction_type, amount, for_month, for_year, description, created_at`).
  - `public.savings_rate_tiers`: konfigurasi tarif simpanan bertingkat per periode waktu.

## 3. Exporter Engine Specification (`src/utils/savingsMatrixExporter.ts`)
- **Fungsi Utama**: `exportSavingsMatrixExcel(depositTypeCode: 'WAJIB' | 'BELANJA' | 'LEBARAN')`
- **Data Ingestion**:
  1. Ambil seluruh anggota aktif dari database (`status !== 'nonaktif' && membership_status !== 'RESIGNED'`).
  2. Tentukan batas rentang waktu bulan-tahun:
     - Bulan awal: Tanggal bergabung anggota paling lampau (fallback: Mei 2021).
     - Bulan akhir: September 2026 (atau disesuaikan dengan horizon kepatuhan aktif).
  3. Ambil data saldo acuan database: akumulasi saldo migrasi awal atau saldo saat ini sebelum rekonsiliasi matriks.
  4. Ambil konfigurasi tarif `savings_rate_tiers` untuk tipe simpanan yang dipilih guna mengisi nilai rekomendasi bulanan (misal Rp 150.000 atau Rp 200.000) bagi bulan setelah anggota terdaftar dan ter-cover oleh saldo.
- **Struktur Kolom Lembar Kerja**:
  - Kolom A (1): `NRP` (Text)
  - Kolom B (2): `Nama Anggota` (Text)
  - Kolom C (3): `Tgl Masuk` (Date string YYYY-MM-DD)
  - Kolom D (4): `Saldo Acuan Database` (Number format `#,##0`)
  - Kolom E s/d [N]: Kolom periode bulanan (`May-21`, `Jun-21`, ..., `Sep-26`). Header diformat rapi `MMM-YY`.
  - Kolom [N+1]: `Total Alokasi` -> Formula Excel `=SUM(E{row}:[ColN]{row})`
  - Kolom [N+2]: `Selisih` -> Formula Excel `=[ColTotal]{row}-D{row}`
  - Kolom [N+3]: `Status Validasi` -> Formula Excel `=IF([ColSelisih]{row}=0,"SEIMBANG",IF([ColSelisih]{row}<0,"KURANG","LEBIH"))`
- **Conditional Formatting**:
  - Hijau muda (`#D1FAE5` / Font `#065F46`) untuk "SEIMBANG".
  - Merah muda (`#FEE2E2` / Font `#991B1B`) untuk "KURANG" atau "LEBIH".

## 4. Importer & Mutation Processor Specification (`src/utils/savingsMatrixImporter.ts` & `src/services/complianceService.ts`)
- **Parser Excel**:
  1. Parse buffer dari `File` menggunakan `new ExcelJS.Workbook().xlsx.load(buffer)`.
  2. Identifikasi baris header:
     - Cari indeks kolom `nrp` (atau `NRP`).
     - Cari kolom setelah `saldo acuan` s/d sebelum `total alokasi` sebagai kolom-kolom periode bulan.
     - Ekstrak bulan & tahun dari label header (misal `"Mei-21"`, `"May-21"`, atau `"05/2021"`).
  3. Iterasi setiap baris data anggota:
     - Baca `nrp`.
     - Untuk setiap kolom bulan: jika sel memiliki nilai numerik `> 0`, catat mutasi `{ nrp, year, month, amount }`.
- **Database Sync (`complianceService.ts`)**:
  - Fungsi: `importSavingsMatrixLedger(depositTypeCode: string, parsedData: Array<{ nrp: string; year: number; month: number; amount: number }>)`
  - Bersihkan transaksi rekonsiliasi lama ('Rekonsiliasi Otomatis' dan 'Import Matriks Buku Besar Excel') untuk anggota dan tipe simpanan terkait.
  - Hapus mutasi migrasi lump-sum (`for_month IS NULL`) yang sudah digantikan oleh rincian bulanan.
  - Chunk insert (100 transaksi per batch) ke `deposit_transactions`.

## 5. UI Integration Specification (`src/pages/admin/ComplianceMatrix.tsx`)
- Toolbar Aksi:
  1. Tombol dropdown **"Ekspor Matriks Periksa (.xlsx)"**:
     - Pilihan: Simpanan Wajib, Simpanan Belanja, Simpanan Hari Raya (Lebaran).
     - Menjalankan exporter dan memicu unduhan berkas langsung di browser.
  2. Tombol **"Impor Matriks Hasil Audit"**:
     - Membuka modal impor dengan file dropzone.
     - Radio selector tipe simpanan yang diimpor.
     - Pratinjau validasi: jumlah baris dan mutasi bulanan terdeteksi.
     - Tombol konfirmasi "Mulai Impor & Sinkronkan Buku Besar".
     - Feedback toast dan auto-refresh matriks `fetchComplianceData(year)`.

## 6. Verification Plan
- Unit tests untuk `savingsMatrixExporter.ts` (memeriksa formula Excel, header, dan row layout).
- Unit tests untuk `savingsMatrixImporter.ts` (memeriksa parsing kolom bulan, ekstraksi mutasi, dan toleransi header).
- Unit tests untuk `importSavingsMatrixLedger` di `complianceService.ts` (memeriksa pemetaan NRP, pembersihan mutasi lama, dan batch insertion).
- Component testing di `ComplianceMatrix.test.tsx`.
- Type checking (`npm run typecheck`) dan full Vitest suite run (`npm test`).

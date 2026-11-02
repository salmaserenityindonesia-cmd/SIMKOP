# Phase 51 Research: Bulk Auto-Reconcile Simpanan Anggota (Multi-Member Engine)

## Executive Summary
Fitur tombol "Cocokkan Otomatis dengan Saldo Impor" pada modal individu (`SavingsLedgerMatrixModal`) telah terbukti bekerja akurat menggunakan algoritma FIFO (First-In, First-Out) dan tarif dinamis (`savings_rate_tiers`). Namun, mencocokkan saldo satu per satu untuk 1.000 anggota sangat memakan waktu.

Phase 51 merekayasa fungsi engine batch multi-anggota (`savingsMatrixService.ts`) dan menghubungkannya dengan antarmuka toolbar utama di `ComplianceMatrix.tsx`, lengkap dengan dialog konfirmasi, pilihan jenis simpanan, indikator progres real-time, dan pembaruan instan tabel matriks.

## Technical Architecture & Reusable Assets

### 1. Reusable FIFO Logic & Tiers
- **FIFO Matcher & Grid Generators**:
  `matchAutomaticFifo`, `generateMonthGrid`, `isMonthBeforeJoin` telah didefinisikan dan diekspor di `src/components/compliance/SavingsLedgerMatrixModal.tsx`. Fungsi-fungsi murni ini dapat diimpor langsung oleh service engine atau dipusatkan di service.
- **Dynamic Rate Resolver**:
  `getRateTiers`, `getApplicableRate`, `SavingsRateTier` dari `src/services/savingsRateService.ts`. Mengakomodasi kenaikan tarif bertingkat (misalnya Simpanan Wajib Rp 150.000 s/d Oktober 2025, dan Rp 200.000 mulai November 2025).

### 2. Database Tables & Query Flow
1. `public.anggota`:
   - Ambil seluruh anggota aktif (`status !== 'nonaktif' AND membership_status !== 'RESIGNED'`).
   - Fields: `id, nrp, nama, created_at, tgl_awal_anggota`.
2. `public.deposit_types`:
   - Ambil kode dan id tipe simpanan (`WAJIB`, `BELANJA`, `LEBARAN`).
3. `public.member_deposits` & `public.deposit_transactions`:
   - Query per batch (ukuran chunk 50 anggota) menggunakan `.in('member_id', batchIds)`.
   - Mengambil mutasi yang ada untuk mendeteksi saldo impor/migrasi riil (misal mutasi bertuliskan `Migrasi Saldo Awal (As-Is)` atau lump-sum initial balance).
4. Pembersihan & Penulisan Mutasi:
   - Hapus mutasi transaksi setoran matriks lama (`transaction_type = 'deposit'` dan deskripsi mengandung `Setoran Matriks` atau rekonsiliasi otomatis, mengecualikan mutasi saldo awal migrasi).
   - Masukkan mutasi `deposit_transactions` baru untuk setiap bulan yang tercover oleh alokasi saldo FIFO.

### 3. Chunking / Batching Strategy
Untuk 1.000 anggota:
- Menjalankan 1.000 operasi sekuensial individual akan memakan waktu terlalu lama.
- Sebaliknya, memproses sekaligus 1.000 anggota dalam 1 transaksi Supabase query bisa menabrak batas payload atau timeout.
- Rekomendasi ukuran batch: **25 - 50 anggota per iterasi batch**.
- Pada setiap iterasi batch, callback `onProgress(processedCount, totalMembers)` dipanggil sehingga antarmuka UI menerima sinyal progres yang mulus (smooth progress animation).

### 4. UI/UX Specification for ComplianceMatrix Toolbar & Modal
- **Tombol Toolbar**:
  - Ditempatkan di header filter/aksi sejajar tombol "Export Rekap Excel".
  - Warna hijau emerald: `bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-3.5 py-2 rounded-xl`.
  - Ikon: `RefreshCw` dari `lucide-react` (dengan animasi `animate-spin` saat proses aktif).
- **Dialog Modal**:
  - Fase 1 (Konfirmasi): Pilihan tipe simpanan yang ingin dicocokkan (Wajib, Belanja, Lebaran, atau Semua) dan penjelasan dampak rekonsiliasi.
  - Fase 2 (Proses Berjalan): Progress bar interaktif (`(current / total) * 100%`), teks hitungan anggota `Memproses X dari Y anggota...`, tombol aksi dinonaktifkan untuk mencegah race condition.
  - Fase 3 (Selesai): Tampilan rekap status (`totalSuccess` dan `totalFailed`), notifikasi sukses, dan pemanggilan `fetchComplianceMatrixData` untuk merender ulang tabel secara instan tanpa reload browser.

## Potential Pitfalls & Mitigations
1. **Preservasi Saldo Awal As-Is**:
   - *Risk*: Terhapusnya mutasi saldo awal migrasi saat membersihkan mutasi lama.
   - *Mitigation*: Gunakan filter query yang ketat (`description != 'Migrasi Saldo Awal (As-Is)'` dan pastikan mutasi migrasi lump-sum tidak terhapus).
2. **PostgREST Payload Limits**:
   - *Risk*: `member_id.in([...])` melebihi panjang query URL jika batch terlalu besar.
   - *Mitigation*: Batasi `batchSize` maksimal 50 anggota per panggilan API.
3. **Akun Simpanan Belum Terdaftar**:
   - *Risk*: Anggota belum memiliki record `member_deposits`.
   - *Mitigation*: Jika anggota memiliki saldo migrasi namun belum ada record di `member_deposits`, buatkan `member_deposits` baru terlebih dahulu sebelum menyimpan transaksi.

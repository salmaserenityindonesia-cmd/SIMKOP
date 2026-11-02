---
phase: 50
plan: 3
wave: 3
depends_on: ["50-1", "50-2"]
gap_closure: false
---

# Plan 50.3: Interactive Matrix Ledger Modal (Checkbox Grid) & Compliance Matrix Integration

## Objective
Membangun komponen modal buku besar matriks simpanan interaktif `SavingsLedgerMatrixModal.tsx` berbasis grid bulan horizontal dengan checkbox dinamis yang otomatis mencerminkan nominal tarif aktif periode tersebut (misal Rp 150.000 s/d Okt 2025 dan Rp 200.000 mulai Nov 2025), dilengkapi tombol aksi cepat "Cocokkan Otomatis dengan Saldo Impor", serta mengintegrasikannya ke halaman Matriks Tracking Pembayaran Simpanan (`ComplianceMatrix.tsx`).

## Context
- `src/components/compliance/SavingsLedgerMatrixModal.tsx`
- `src/components/compliance/SavingsLedgerMatrixModal.test.tsx`
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/pages/admin/ComplianceMatrix.test.tsx`
- `src/services/savingsRateService.ts`
- `src/services/matrixService.ts`

## Tasks

<task type="auto">
  <name>Build SavingsLedgerMatrixModal.tsx Checkbox Grid Component</name>
  <files>
    src/components/compliance/SavingsLedgerMatrixModal.tsx
    src/components/compliance/SavingsLedgerMatrixModal.test.tsx
  </files>
  <action>
    1. Buat berkas `src/components/compliance/SavingsLedgerMatrixModal.tsx`:
       - Props:
         ```ts
         interface SavingsLedgerMatrixModalProps {
           memberId: string;
           memberNrp: string;
           memberName: string;
           joinDate?: string | null;
           onClose: () => void;
           onSuccess?: () => void;
         }
         ```
       - Tab Pilihan Simpanan:
         * **Simpanan Wajib** (`WAJIB`)
         * **Simpanan Belanja** (`BELANJA`)
         * **Simpanan Lebaran** (`LEBARAN`)
       - Baris Ringkasan (Header Info):
         * Menampilkan Nama Anggota, NRP, dan Tanggal Bergabung.
         * Komparasi Saldo: **Total Tercentang (Rp)** vs **Total Saldo Terdaftar di Database (Rp)** (diperoleh dari mutasi/saldo `member_deposits`).
         * Indikator status: "Sesuai / Seimbang" (hijau) atau "Selisih Rp ..." (kuning/merah).
       - Bilah Aksi Cepat (Quick Actions Toolbar):
         * **[Centang Semua s/d Bulan Ini]**: Mencentang seluruh bulan yang valid dari tanggal bergabung sampai bulan & tahun saat ini.
         * **[Cocokkan Otomatis dengan Saldo Impor]**:
           Algoritma FIFO: Mengambil saldo impor/database. Mulai dari bulan awal valid, centang berurutan ke bulan-bulan berikutnya dengan nominal tarif aktif periode tersebut (`getApplicableRate`) hingga total tercentang tepat menyamai saldo impor tanpa ada kelebihan.
         * **[Batal Centang Semua]**: Mengosongkan seluruh centangan pada jenis simpanan yang aktif.
       - Grid Matriks Horizontal (`overflow-x-auto`):
         * Kolom: Daftar Bulan & Tahun (misal Jan-2024 hingga Des-2026 atau rentang dinamis).
         * Kolom bulan sebelum tanggal masuk anggota di-disable (`-` abu-abu, tidak bisa dicentang).
         * Cell bulan aktif menampilkan checkbox interaktif.
         * Di bawah checkbox, tampilkan label nominal tarif aktif dengan badge warna sesuai periode (contoh: badge kuning `Rp 150k` s/d Okt-2025, badge hijau `Rp 200k` mulai Nov-2025).
         * Interaksi real-time: Saat checkbox dicentang/batal dicentang, update record di `deposit_transactions` untuk `for_month` dan `for_year` terkait (insert saat dicentang, delete saat dicentang batal) dan update state total secara real-time.
    2. Buat pengujian komponen `src/components/compliance/SavingsLedgerMatrixModal.test.tsx`:
       - Uji render tab simpanan wajib, belanja, dan lebaran.
       - Uji disable cell bulan sebelum tanggal bergabung anggota.
       - Uji tombol "Cocokkan Otomatis dengan Saldo Impor" yang secara akurat mencentang bulan-bulan hingga saldo seimbang.
       - Uji fungsi aksi "Centang Semua s/d Bulan Ini" dan "Batal Centang Semua".
       - Uji perubahan checkbox memanggil operasi database yang sesuai.
  </action>
  <verify>
    Jalankan unit test: `npx vitest run src/components/compliance/SavingsLedgerMatrixModal.test.tsx`.
  </verify>
  <done>
    Komponen `SavingsLedgerMatrixModal.tsx` berfungsi interaktif dan lulus seluruh pengujian.
  </done>
</task>

<task type="auto">
  <name>Connect SavingsLedgerMatrixModal in ComplianceMatrix.tsx and Update Tests</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`:
       - Impor komponen `SavingsLedgerMatrixModal`.
       - Perbarui state seleksi anggota agar menyimpan informasi `id`, `nrp`, `nama`, dan `tgl_awal_anggota` / `created_at`.
       - Tambahkan event klik pada baris nama anggota atau tombol aksi (ikon mata `Eye` / buku besar) untuk membuka `SavingsLedgerMatrixModal`.
       - Saat modal ditutup dengan perubahan (`onSuccess`), picu reload data matriks (`fetchComplianceMatrixData`) agar ringkasan kepatuhan dan status terupdate secara langsung.
    2. Perbarui `src/pages/admin/ComplianceMatrix.test.tsx`:
       - Tambahkan pengujian bahwa mengklik tombol aksi buku besar pada baris anggota membuka modal rincian matriks buku besar.
       - Pastikan seluruh pengujian yang ada sebelumnya tetap lulus tanpa regresi.
  </action>
  <verify>
    Jalankan test: `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx`.
  </verify>
  <done>
    Aksi klik baris anggota terhubung mulus ke `SavingsLedgerMatrixModal` dan teruji secara otomatis.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Komponen `SavingsLedgerMatrixModal.tsx` berhasil dibuat dan menangani 3 jenis simpanan (Wajib, Belanja, Lebaran).
- [ ] Grid horizontal menampilkan checkbox interaktif dengan label nominal dinamis berdasarkan tarif aktif per bulan.
- [ ] Tombol "Cocokkan Otomatis dengan Saldo Impor" mencentang bulan secara FIFO hingga total akumulasi sama dengan saldo impor.
- [ ] Baris anggota di `ComplianceMatrix.tsx` dapat diklik untuk membuka modal buku besar matriks ini.
- [ ] Pengujian di `SavingsLedgerMatrixModal.test.tsx` dan `ComplianceMatrix.test.tsx` lulus 100%.

## Success Criteria
- [ ] All tasks verified passing
- [ ] No regressions in tests

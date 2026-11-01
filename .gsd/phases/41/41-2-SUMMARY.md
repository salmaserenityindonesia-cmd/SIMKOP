# Plan 41.2 Summary: Modal Rincian Snapshot Migrasi Awal Anggota (14 Kolom)

## Objective
Membangun komponen modal dialog responsif (`MemberMigrationDetailModal`) yang menampilkan snapshot rincian data migrasi awal anggota dari template 14 kolom Excel (biodata kepegawaian, saldo simpanan awal utuh, dan kewajiban pinjaman bawaan migrasi lampau), serta mengintegrasikannya ke dalam tombol aksi mata (`Eye`) di halaman Manajemen Anggota.

## Changes Made
1. **`src/components/members/MemberMigrationDetailModal.tsx`**:
   - Dibuat komponen modal baru dengan props `isOpen: boolean`, `onClose: () => void`, dan `member: Anggota | null`.
   - Mengambil data simpanan dari `member_deposits` dan `deposit_transactions` (memfilter deskripsi migrasi / saldo awal untuk simpanan Pokok, Wajib, Belanja, dan Lebaran).
   - Mengambil data pinjaman dari `loans`, `loan_repayments`, dan `loan_schedules` (mengekstrak plafon pinjaman, tgl/siklus awal dari notes/disbursed_at, tenor pinjaman, dan sisa pokok pinjaman).
   - Menampilkan 3 kartu informatif:
     * **Card 1: Profil & Kepegawaian** (NRP, Nama Lengkap, Pangkat/Golongan, No. Rekening Bank, Status Keanggotaan, Tanggal Terdaftar/Tgl Awal).
     * **Card 2: Simpanan Awal Migrasi** (Simpanan Pokok, Simpanan Wajib utuh, Simpanan Belanja, Simpanan Lebaran, serta banner total akumulasi simpanan awal).
     * **Card 3: Pinjaman Bawaan Migrasi** (Plafon pinjaman, tgl/siklus awal, tenor bulan, sisa pokok pinjaman, sudah diangsur, status pinjaman; atau badge hijau netral `"Tidak Memiliki Pinjaman Bawaan Migrasi"` jika tidak ada pinjaman lampau).
   - Menambahkan navigasi penutup modal yang intuitif: tombol Tutup, tombol silang (X), klik backdrop, dan shortcut keyboard `Escape`.
2. **`src/pages/admin/ManajemenAnggota.tsx`**:
   - Mengimpor komponen `MemberMigrationDetailModal`.
   - Merender `<MemberMigrationDetailModal isOpen={isMigrationDetailOpen} member={selectedMigrationMember} onClose={() => setIsMigrationDetailOpen(false)} />` yang terhubung dengan state dan tombol aksi `Eye`.
3. **`src/components/members/MemberMigrationDetailModal.test.tsx`**:
   - Menambahkan unit test komprehensif (7 tes) yang menguji perilaku render saat ditutup, saat dibuka dengan data anggota, verifikasi keberadaan Card 1, Card 2, Card 3, serta footer dan tombol penutup.

## Verification
- `npm run build`: Berhasil tanpa error TypeScript maupun bundling (vite v8.3.1 build client production passed).
- `npm test`: 24 test suites (234 tests) lulus 100%, termasuk 7 unit test baru untuk `MemberMigrationDetailModal`.
- Modal detail snapshot migrasi awal anggota terintegrasi sempurna di Manajemen Anggota.

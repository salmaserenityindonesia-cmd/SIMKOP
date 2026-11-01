---
phase: 41
plan: 2
wave: 2
depends_on: ["41.1"]
gap_closure: false
---

# Plan 41.2: Modal Rincian Snapshot Migrasi Awal Anggota (14 Kolom)

## Objective
Membangun modal dialog informatif yang menampilkan rincian data snapshot awal anggota saat pertama kali dimigrasikan dari Excel: biodata kepegawaian (NRP, Nama, Pangkat, No Rekening, Status, Tgl Awal), saldo simpanan awal (Pokok, Wajib, Belanja, Lebaran), dan catatan pinjaman bawaan migrasi (Jumlah, Tgl/Siklus Awal, Tenor, Sisa Pinjaman).

## Context
- `src/pages/admin/ManajemenAnggota.tsx`
- `src/components/members/MemberMigrationDetailModal.tsx` (komponen baru)
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Create MemberMigrationDetailModal and Integrate in ManajemenAnggota</name>
  <files>
    src/components/members/MemberMigrationDetailModal.tsx
    src/pages/admin/ManajemenAnggota.tsx
  </files>
  <action>
    1. Buat komponen baru `src/components/members/MemberMigrationDetailModal.tsx`:
       - Props:
         * `isOpen: boolean`
         * `onClose: () => void`
         * `member: Anggota | null`
       - Fungsi pemuatan data detail:
         * Ambil mutasi awal simpanan dari `deposit_transactions` yang berelasi dengan `member.id` (tipe deskripsi migrasi / tanggal awal).
         * Ambil data pinjaman aktif / bawaan migrasi dari tabel `loans` (di mana `member_id = member.id`).
         * Tangani fallback offline / graceful jika query database gagal atau lambat (tampilkan loading spinner).
       - Desain Modal:
         * Header: Ikon FileText / UserCheck, Judul "Rincian Data Migrasi Awal Anggota", badge NRP & Nama Anggota, tombol Close (X / Esc).
         * Kartu 1: **Profil & Kepegawaian**
           - NRP, Nama, Pangkat, No. Rekening Bank, Status Keanggotaan, Tanggal Terdaftar / Tgl Awal.
         * Kartu 2: **Simpanan Awal Migrasi**
           - Simpanan Pokok (Rp), Simpanan Wajib (Rp utuh), Simpanan Belanja (Rp), Simpanan Lebaran (Rp).
           - Total Akumulasi Simpanan Awal.
         * Kartu 3: **Pinjaman Bawaan Migrasi**
           - Jumlah Pinjaman Pokok (Rp), Tanggal / Siklus Awal Pinjaman, Tenor (Bulan), Sisa Pokok Pinjaman (Rp).
           - Jika tidak memiliki pinjaman migrasi, tampilkan badge hijau netral "Tidak Memiliki Pinjaman Bawaan Migrasi".
         * Footer: Badge penjelasan "Data ini merupakan catatan historis snapshot migrasi anggota (14 Kolom Template)" dan tombol "Tutup".
    2. Integrasikan ke `src/pages/admin/ManajemenAnggota.tsx`:
       - Tambahkan state `selectedMigrationMember: Anggota | null` dan `isMigrationDetailOpen: boolean`.
       - Handler `handleOpenMigrationDetail = (anggota: Anggota) => { setSelectedMigrationMember(anggota); setIsMigrationDetailOpen(true); }`.
       - Render modal `<MemberMigrationDetailModal isOpen={isMigrationDetailOpen} member={selectedMigrationMember} onClose={() => setIsMigrationDetailOpen(false)} />`.
  </action>
  <verify>
    Klik tombol ikon mata pada anggota mana pun di tabel Manajemen Anggota:
    - Modal terbuka dengan halus, menampilkan rincian data profil, simpanan awal utuh, dan data pinjaman bawaan migrasi.
    - Tombol Tutup dan tombol X berfungsi menutup modal dengan benar.
  </verify>
  <done>Modal rincian data migrasi awal anggota terpasang dan berfungsi optimal.</done>
</task>

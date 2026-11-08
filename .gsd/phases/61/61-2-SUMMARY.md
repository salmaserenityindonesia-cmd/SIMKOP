# Summary Plan 61.2: Redesign LoanScheduleModal into Checkbox Matrix Grid

## Objective
Membangun ulang komponen modal buku bantu angsuran pinjaman (`src/components/loans/LoanScheduleModal.tsx` dan `src/components/members/LoanLedgerModal.tsx`) menjadi antarmuka grid matriks interaktif yang identik dengan modal matriks simpanan (`SavingsLedgerMatrixModal.tsx`):
1. Kartu Ringkasan Real-Time: Total Terbayar vs Total Pinjaman Pokok dengan badge Sesuai / Seimbang (hijau) atau Sisa Pinjaman (merah).
2. Bilah Aksi Cepat: `[Centang Semua s/d Bulan Ini]`, `[Cocokkan Otomatis dengan Saldo Terangsur]`, dan `[Batal Centang Semua]`.
3. Grid Matriks Horisontal (Periode 1 s/d Tenor Terakhir) dengan badge target angsuran, penanda warna (Hijau Lunas, Kuning Parsial, Merah Menunggak, Abu-abu Proyeksi), auto-scroll ke bulan berjalan, popover bukti kwitansi / audit trail, serta dialog konfirmasi pembatalan pelunasan.
4. Menghubungkan modal interaktif baru ke halaman `/admin/loan-matrix` (`src/pages/admin/LoanMatrix.tsx`) dengan callback `onSuccess` untuk live refresh matriks.

## Executed Tasks
1. **Create Interactive LoanScheduleModal Component**
   - File: `src/components/loans/LoanScheduleModal.tsx`, `src/components/members/LoanLedgerModal.tsx`
   - Membuat komponen `LoanScheduleModal` lengkap dengan:
     - Header modal dengan icon kalender, badge "Real-time", dan tombol tutup `X`.
     - Member Profile Bar: Nama Anggota, NRP, No. Pinjaman, Tenor, dan Tanggal Pencairan.
     - Ringkasan Saldo: Total Terbayar vs Total Pinjaman dengan badge dinamis Seimbang/Sisa Pinjaman.
     - Toolbar Aksi Cepat: Centang Semua s/d Bulan Ini (`checkAllLoanUpToCurrentMonth`), Cocokkan Otomatis (`autoReconcileLoanInstallments`), dan Batal Centang Semua (`uncheckAllLoanSchedules`).
     - Legenda Status: Lunas (emerald), Parsial (amber), Menunggak (rose), Proyeksi (slate dashed).
     - Grid Matriks Horisontal: Kolom per periode tenor (e.g., `Bulan 1 [Feb-26]`), highlight bulan berjalan dengan ring emerald dan badge `BULAN INI`.
     - Sel interaktif: Checkbox status pelunasan, badge target/terbayar, dan tombol riwayat kwitansi.
     - Auto-scroll smooth ke kolom bulan berjalan menggunakan `useRef` dan `scrollIntoView`.
     - Sub-modal 1: Form Bukti Pelunasan Angsuran (Nominal, No. Kwitansi, Metode [Potong Gaji/Tunai/Transfer], Catatan).
     - Sub-modal 2: Konfirmasi Pembatalan Pelunasan (Input alasan pembatalan).
     - Sub-modal 3: Riwayat Pembayaran & Bukti Kwitansi untuk jadwal angsuran terkait.
   - Memperbarui `src/components/members/LoanLedgerModal.tsx` sebagai wrapper kompatibel yang mendelegasikan langsung ke `LoanScheduleModal`.
   - Commit: `b11221cd` (`feat(phase-61): create interactive loanschedulemodal component`)

2. **Connect Interactive Modal to LoanMatrix Page and Add Component Tests**
   - File: `src/pages/admin/LoanMatrix.tsx`, `src/components/loans/LoanScheduleModal.test.tsx`
   - Menghubungkan modal pada `LoanMatrix.tsx` dengan menambahkan callback `onSuccess={() => fetchLoanMatrixData(year, setLoading, setData)}` agar perubahan checkbox angsuran otomatis merefresh matriks ringkasan halaman admin.
   - Membuat test suite komprehensif `src/components/loans/LoanScheduleModal.test.tsx`:
     - Unit test helper `formatRateBadge` dan `formatDateIndo`.
     - Pengujian render identitas peminjam, nomor pinjaman, tenor, dan tanggal pencairan.
     - Pengujian saldo komparasi dan badge status (Seimbang vs Sisa Pinjaman).
     - Pengujian rendering bilah aksi cepat dan legenda status.
     - Pengujian rendering grid horisontal, penanda bulan berjalan, checkbox, badge nominal, dan tombol riwayat.
     - Pengujian state loading dan state kosong (tanpa jadwal).
     - Pengujian backward compatibility wrapper `LoanLedgerModal`.
     - Pengujian pemanggilan service methods (`checkAllLoanUpToCurrentMonth`, `autoReconcileLoanInstallments`, `uncheckAllLoanSchedules`, `toggleLoanSchedulePaid`).
   - Memastikan `LoanMatrix.test.tsx` tetap lulus 100% (17/17 tests).
   - Commit: `2c3501c4` (`feat(phase-61): connect interactive modal to loanmatrix page and add component tests`)

## Verification Results
- `npx tsc --noEmit`: 0 errors (clean compilation).
- `npx vitest run src/components/loans/LoanScheduleModal.test.tsx src/pages/admin/LoanMatrix.test.tsx src/services/loanMatrixService.test.ts`:
  - 3 test files passed (3/3)
  - 49 tests passed (100% pass)
  - Duration: 1.25s

## Deviations
None.

## Commits
- `b11221cd`: feat(phase-61): create interactive loanschedulemodal component
- `2c3501c4`: feat(phase-61): connect interactive modal to loanmatrix page and add component tests

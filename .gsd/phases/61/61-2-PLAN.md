---
phase: 61
plan: 2
wave: 2
gap_closure: false
---

# Plan 61.2: Redesign LoanScheduleModal into Checkbox Matrix Grid

## Objective
Membangun ulang komponen modal buku bantu angsuran pinjaman (`src/components/loans/LoanScheduleModal.tsx` dan `src/components/members/LoanLedgerModal.tsx`) menjadi antarmuka grid matriks interaktif yang identik dengan modal matriks simpanan (`SavingsLedgerMatrixModal.tsx`):
1. Kartu Ringkasan Real-Time: Total Terbayar vs Total Pinjaman Pokok / Target Angsuran (badge Seimbang / Sisa Pinjaman).
2. Bilah Aksi Cepat: `[Centang Semua s/d Bulan Ini]`, `[Cocokkan Otomatis dengan Saldo Terangsur]`, dan `[Batal Centang Semua]`.
3. Grid Matriks Horisontal (Bulan Ke-1 s/d Tenor Terakhir) dengan badge target angsuran, penanda warna (Hijau Lunas, Kuning Parsial, Merah Menunggak, Abu-abu Proyeksi), auto-scroll ke bulan berjalan, popover bukti kwitansi / audit trail, serta dialog konfirmasi pembatalan pelunasan.
4. Menghubungkan modal interaktif baru ke halaman `/admin/loan-matrix` (`src/pages/admin/LoanMatrix.tsx`).

## Context
Load these files for context:
- .gsd/SPEC.md
- src/components/compliance/SavingsLedgerMatrixModal.tsx
- src/components/members/LoanLedgerModal.tsx
- src/components/loans/LoanScheduleModal.tsx
- src/pages/admin/LoanMatrix.tsx
- src/services/loanMatrixService.ts

## Tasks

<task type="auto">
  <name>Create Interactive LoanScheduleModal Component</name>
  <files>
    src/components/loans/LoanScheduleModal.tsx,
    src/components/members/LoanLedgerModal.tsx
  </files>
  <action>
    1. Buat direktori `src/components/loans` jika belum ada.
    2. Buat `src/components/loans/LoanScheduleModal.tsx` dengan antarmuka:
       ```typescript
       export interface LoanScheduleModalProps {
         loanId: string;
         memberNrp: string;
         memberName: string;
         onClose: () => void;
         onSuccess?: () => void;
       }
       ```
    3. Implementasikan elemen visual & fungsional:
       - **Header Modal**:
         - Ikon Kalender/Kalkulator Hijau dengan judul "Buku Bantu Angsuran Pinjaman (Interactive Grid)" dan badge "Real-time".
         - Tombol tutup modal `X`.
       - **Member Profile Bar**:
         - Nama Anggota, NRP, No. Pinjaman (`loanNumber`), Tenor (`N Bulan`), Tanggal Pencairan (`disbursedAt`).
         - Ringkasan Saldo Kanan: `Total Terbayar: Rp X` vs `Total Pinjaman: Rp Y` dengan badge `Sesuai / Seimbang` (hijau) atau `Sisa Pinjaman: Rp Z` (merah).
       - **Toolbar Aksi Cepat**:
         - Tombol `[☑ Centang Semua s/d Bulan Ini]`: Memanggil `checkAllLoanUpToCurrentMonth`.
         - Tombol `[🔄 Cocokkan Otomatis dengan Saldo Terangsur]`: Memanggil `autoReconcileLoanInstallments`.
         - Tombol `[□ Batal Centang Semua]`: Memanggil `uncheckAllLoanSchedules`.
       - **Horizontal Checkbox Grid (Overflow-X-Auto)**:
         - Baris Header: `Bulan Ke & Tanggal` (misal "Bulan 1 [Jul-26]"). Kolom bulan berjalan disorot ring hijau dan badge `BULAN INI`.
         - Baris Sel Interaktif:
           - Checkbox besar (checked jika status === 'PAID').
           - Label nominal target angsuran di bawah checkbox (misal `Rp 277k`).
           - Tombol kwitansi kecil di sudut kotak untuk melihat/input bukti pelunasan.
           - Pewarnaan sel:
             - Hijau (`ring-emerald-500 bg-emerald-50 text-emerald-800`): Lunas (`PAID`).
             - Kuning (`ring-amber-500 bg-amber-50 text-amber-800`): Parsial (`PARTIAL`).
             - Merah (`ring-rose-500 bg-rose-50 text-rose-800`): Menunggak (`UNPAID`).
             - Abu-abu (`border-dashed border-slate-200 text-slate-400`): Proyeksi masa depan (`PROJECTED`).
       - **Auto-Scroll ke Bulan Berjalan**:
         - Gunakan `currentMonthColRef = useRef<HTMLTableHeaderCellElement>(null)` dan `scrollContainerRef`.
         - Saat data selesai dimuat, trigger `scrollIntoView({ inline: 'center', behavior: 'smooth' })`.
       - **Sub-Modals / Dialogs**:
         - Modal Input Bukti Setoran (No. Kwitansi, Metode Pembayaran [Potong Gaji / Tunai Kasir], Catatan).
         - Modal Konfirmasi Pembatalan (Uncheck) dengan input alasan pembatalan.
         - Modal Riwayat Kwitansi / Jejak Audit untuk jadwal terkait.
    4. Perbarui `src/components/members/LoanLedgerModal.tsx` agar menggunakan / mere-export `LoanScheduleModal` (atau bertindak sebagai wrapper kompatibel) sehingga semua pemanggil eksisting langsung menikmati antarmuka matriks interaktif.
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    Komponen LoanScheduleModal dan LoanLedgerModal terpasang rapi dengan gaya visual identik dengan SavingsLedgerMatrixModal.
  </done>
</task>

<task type="auto">
  <name>Connect Interactive Modal to LoanMatrix Page and Add Component Tests</name>
  <files>
    src/pages/admin/LoanMatrix.tsx,
    src/pages/admin/LoanMatrix.test.tsx,
    src/components/loans/LoanScheduleModal.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.tsx`:
       - Pastikan pembukaan modal buku bantu angsuran mengalirkan `loanId`, `memberNrp`, `memberName`, dan callback `onSuccess` untuk me-refresh data matriks saat ada perubahan angsuran.
    2. Buat berkas test baru `src/components/loans/LoanScheduleModal.test.tsx`:
       - Verifikasi modal merender identitas peminjam, kartu ringkasan, dan tombol aksi cepat.
       - Verifikasi rendering kolom grid per periode tenor pinjaman.
       - Verifikasi interaksi tombol "Centang Semua s/d Bulan Ini", "Cocokkan Otomatis", dan "Batal Centang Semua".
    3. Pastikan test suite `src/pages/admin/LoanMatrix.test.tsx` tetap hijau 100%.
  </action>
  <verify>
    npx vitest run src/components/loans/LoanScheduleModal.test.tsx src/pages/admin/LoanMatrix.test.tsx
  </verify>
  <done>
    Komponen LoanScheduleModal terintegrasi sempurna di LoanMatrix dan seluruh pengujian komponen lolos.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Grid matriks horizontal tampil menggantikan tabel vertikal lama.
- [ ] Kartu ringkasan real-time dan bilah aksi cepat berfungsi interaktif.
- [ ] Auto-scroll ke bulan berjalan terpasang.
- [ ] Unit tests di `LoanScheduleModal.test.tsx` dan `LoanMatrix.test.tsx` lulus 100%.

## Success Criteria
- [ ] Modal buku bantu angsuran pinjaman mengadopsi 100% UX matriks simpanan.
- [ ] Tidak ada regresi tampilan atau error kompilasi.

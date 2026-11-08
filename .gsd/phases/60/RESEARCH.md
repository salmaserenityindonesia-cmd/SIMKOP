# Phase 60: Technical Research & Architecture Mapping

## Problem Statement
Pada halaman `/admin/loan-matrix` (`LoanMatrix.tsx`), kolom angsuran bulanan (Jan - Des) saat ini menampilkan ikon checklist (`CheckCircle2`, `AlertCircle`, `XCircle`, `Clock`). Tampilan ikon ini kurang informatif bagi pengurus dan auditor koperasi karena tidak menunjukkan nominal riil angsuran yang harus dibayar maupun yang telah disetorkan anggota per bulannya.

Kebutuhan pengguna:
1. Mengganti ikon checklist menjadi badge angka nominal angsuran berformat mata uang (misal `1.000.000` atau `-`).
2. Menerapkan skema warna dinamis berbasis status:
   - **Hijau (`emerald`)**: Lunas memenuhi target angsuran (`paid` / `PAID` / `FINISHED`). Menampilkan nominal `paidAmount`.
   - **Kuning / Amber (`amber`)**: Terbayar sebagian / parsial (`partial` / `PARTIAL`). Menampilkan nominal `paidAmount`.
   - **Merah (`rose`)**: Terlewat jatuh tempo / menunggak (`unpaid` / `UNPAID`). Menampilkan nominal `targetAmount`.
   - **Abu-abu putus-putus (`slate`)**: Proyeksi masa depan (`projection` / `PROJECTED`). Menampilkan nominal `targetAmount`.
   - **Strip (`-`)**: Di luar masa tenor / tidak ada jadwal (`NONE` / `not_applicable`).
3. Tooltip informatif saat kursor diarahkan ke sel angsuran (Nomor Pinjaman, Status, Tenor/Periode, Target, Terbayar, dan Sisa Hutang).
4. Menyediakan legenda/keterangan status visual di atas atau di bawah tabel matriks.

## Existing Implementation Analysis

### 1. `src/services/loanMatrixService.ts`
- Mengambil jadwal dari tabel `loan_schedules` yang memiliki relasi ke `loans` dan `anggota`.
- Struktur tipe data saat ini:
  ```typescript
  export interface LoanMatrixMonth {
    month: number;
    status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'PROJECTED' | 'FINISHED' | 'NONE';
    targetAmount: number;
    paidAmount: number;
    remainingBalance?: number;
    loanId?: string;
    loanNumber?: string;
    tenor?: number;
    periodNumber?: number;
  }
  ```
- Evaluasi pengayaan data:
  - Tambahkan `year?: number` dan `dueDate?: string` ke dalam antarmuka.
  - Sediakan type alias `MonthLoanCell = LoanMatrixMonth` untuk kompatibilitas data contract.
  - Logika penentuan status sudah memperhitungkan apakah bulan berada di masa depan (`PROJECTED`), sudah lewat (`PAID`, `PARTIAL`, `UNPAID`), atau pinjaman telah lunas (`FINISHED`).

### 2. `src/pages/admin/LoanMatrix.tsx`
- Menggunakan `getCellClasses` dan `getCellIcon` yang merender ikon SVG:
  - `CheckCircle2` untuk `PAID` / `FINISHED`
  - `AlertCircle` untuk `PARTIAL`
  - `XCircle` untuk `UNPAID`
  - `Clock` untuk `PROJECTED`
- Sel tabel saat ini:
  `<div className="w-10 h-10 mx-auto rounded-lg border flex items-center justify-center cursor-help transition-all ...">`
  Berukuran kecil (w-10 h-10) untuk memuat ikon.
- Refactoring UI:
  - Ganti ukuran kotak menjadi badge pill responsif, misalnya `px-2 py-1.5 rounded-lg text-xs font-mono text-center select-none`.
  - Format angka menggunakan format ribuan Indonesia (`toLocaleString('id-ID')`).
  - Tampilkan angka nominal yang relevan sesuai status.
  - Sediakan legenda status di bawah filter toolbar atau di atas tabel agar pengguna dapat membaca arti warna dengan mudah.

## Testing & Compatibility Strategy
- `src/pages/admin/LoanMatrix.test.tsx` saat ini menguji layout statis dan dropdown tahun.
- Tambahkan test cases spesifik untuk verifikasi rendering angka nominal berwarna dan keberadaan legenda status.
- Pastikan ekspor Excel tetap berfungsi dan tidak terpengaruh oleh perubahan visual UI tabel.
- Jalankan pemeriksaan tipe `tsc --noEmit` dan `npm run build` untuk memvalidasi zero-regression.


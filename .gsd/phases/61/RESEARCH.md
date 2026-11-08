# Phase 61: Technical Research & Architecture Mapping
## Transformasi Modal Buku Bantu Angsuran Pinjaman Menjadi Matriks Interaktif (UX Simpanan)

## 1. Problem Statement
Saat ini, modal "Buku Bantu Angsuran Pinjaman" pada halaman `/admin/loan-matrix` (`LoanMatrix.tsx` / `LoanLedgerModal.tsx`) menggunakan format tabel vertikal statis dengan pagination per 10 baris. Format ini memiliki beberapa kekurangan:
1. **Navigasi Kaku**: Admin koperasi harus mengklik pagination berulang kali untuk melihat status jadwal angsuran pada tenor panjang (misal 24 s/d 60 bulan).
2. **Ketiadaan Interaktivitas**: Admin tidak dapat melakukan toggle pelunasan langsung per bulan, pencocokan otomatis (FIFO reconciliation), maupun pelunasan massal s/d bulan berjalan langsung dari modal.
3. **Inkonsistensi UX**: Berbeda jauh dengan modal "Buku Besar Matriks Simpanan" (`SavingsLedgerMatrixModal.tsx`) yang sudah modern dengan:
   - Header ringkasan real-time (Total Terangsur vs Total Pinjaman Pokok, badge status Seimbang/Sisa Pinjaman).
   - Bilah aksi cepat: `[Centang Semua s/d Bulan Ini]`, `[Cocokkan Otomatis dengan Saldo Terangsur]`, dan `[Batal Centang Semua]`.
   - Grid matriks horizontal interaktif dengan auto-scroll ke bulan berjalan, badge nominal tarif, pewarnaan status dinamis (Hijau Lunas, Kuning Parsial, Merah Menunggak, Abu-abu Proyeksi), dan popover bukti kwitansi / audit trail.

## 2. Existing Codebase Analysis

### A. Tabel dan Data Relasi Supabase
1. **`loans`**:
   - `id`, `loan_number`, `member_id`, `principal_amount` (alias `amount`), `tenor`, `monthly_target`, `status` ('draft', 'pending', 'approved', 'active', 'rejected', 'completed'), `disbursed_at`, `created_at`.
   - Relasi ke `anggota`: `member_id -> anggota.id` (`nama`, `nrp`).
2. **`loan_schedules`**:
   - `id`, `loan_id`, `period_number`, `due_date`, `target_amount`, `paid_amount`, `status` ('unpaid', 'partial', 'paid').
3. **`loan_repayments`**:
   - `id`, `loan_id`, `schedule_id`, `amount_paid`, `payment_date`, `payment_method`, `notes`.

### B. Service Layer (`src/services/loanMatrixService.ts`)
Fungsi-fungsi baru yang perlu ditambahkan:
1. `getLoanInteractiveGrid(loanId: string)`:
   - Mengambil data induk pinjaman (`principal_amount`, `tenor`, `monthly_target`, `disbursed_at`, dll.).
   - Mengambil seluruh jadwal dari `loan_schedules` diurutkan berdasarkan `period_number ASC`.
   - Mengambil seluruh transaksi pelunasan dari `loan_repayments`.
   - Menghitung agregat ringkasan: `totalPaid`, `principalAmount`, `sisaPinjaman`, `isBalanced`.
   - Memetakan `periods`: menyertakan label bulan (`Bulan 1 [Jul-26]`), status dinamis (`PAID`, `PARTIAL`, `UNPAID`, `PROJECTED`), dan referensi repayments.
2. `toggleLoanSchedulePaid(scheduleId: string, paid: boolean, payload?: { amount?: number; receiptNo?: string; notes?: string; paymentMethod?: string })`:
   - Jika `paid = true`: Insert ke `loan_repayments`, update `loan_schedules.paid_amount = target_amount` dan `status = 'paid'`. Jika seluruh jadwal lunas, update `loans.status = 'completed'`.
   - Jika `paid = false`: Hapus repayment terkait, update `loan_schedules.paid_amount = 0` dan `status = 'unpaid'`. Kembalikan `loans.status = 'active'`.
3. `autoReconcileLoanInstallments(loanId: string, totalPaidAvailable: number)`:
   - Reset/alokasi ulang jadwal pinjaman menggunakan algoritma FIFO murni dari `period_number = 1`.
   - Mendukung pelunasan penuh jadwal dan sisa parsial untuk jadwal berikutnya jika saldo tidak mencukupi target penuh.
4. `checkAllLoanUpToCurrentMonth(loanId: string)`:
   - Menandai lunas seluruh jadwal angsuran yang tanggal jatuh temponya (`due_date`) berada pada atau sebelum bulan berjalan (`due_date <= currentMonthEndDate`).
5. `uncheckAllLoanSchedules(loanId: string)`:
   - Mereset seluruh jadwal menjadi unpaid dan membersihkan repayments transaksi matriks.

### C. UI Component (`src/components/loans/LoanScheduleModal.tsx` & `LoanLedgerModal.tsx`)
Struktur modal interaktif mengadopsi struktur `SavingsLedgerMatrixModal.tsx`:
1. **Header Modal**:
   - Ikon Dokumen/Kalkulator Hijau bertuliskan "Buku Bantu Angsuran Pinjaman (Interactive Grid) [Real-time]".
   - Profil Peminjam: Nama Anggota, NRP, No. Pinjaman (`loan_number`), Tanggal Akad/Pencairan, Tenor Bulan.
   - Status Saldo Kanan Atas: `Total Terangsur: Rp X vs Total Pinjaman: Rp Y` dengan badge hijau `Sesuai / Seimbang` atau badge merah `Sisa Pinjaman: Rp Z`.
2. **Toolbar Aksi Cepat**:
   - `[☑ Centang Semua s/d Bulan Ini]`
   - `[🔄 Cocokkan Otomatis dengan Saldo Terangsur]`
   - `[□ Batal Centang Semua]`
3. **Grid Matriks Horisontal (Overflow-X-Auto)**:
   - Kolom-kolom: `Bulan Ke & Tanggal` (Bulan 1 [Jul-26], Bulan 2 [Ags-26], ..., Bulan N).
   - Penanda kolom aktif: Badge `BULAN INI` pada kolom yang jatuh temponya di bulan berjalan saat ini.
   - Sel Interaktif:
     - Checkbox besar.
     - Label nominal target angsuran (misal `Rp 277k`).
     - Ikon kwitansi / audit trail di samping centang.
     - Pewarnaan sel dinamis:
       - Hijau (`ring-emerald-500 bg-emerald-50`): Lunas.
       - Kuning (`ring-amber-500 bg-amber-50`): Parsial.
       - Merah (`ring-rose-500 bg-rose-50`): Menunggak.
       - Abu-abu (`border-dashed border-slate-200`): Proyeksi masa depan.
4. **Auto-Scroll ke Kolom Bulan Berjalan**:
   - Menggunakan `currentMonthColRef` dan `scrollIntoView({ inline: 'center', behavior: 'smooth' })`.
5. **Popover Bukti Kwitansi / Konfirmasi Pembatalan**:
   - Modal input bukti pembayaran (No. Bukti/Kwitansi, Metode, Catatan).
   - Modal konfirmasi pembatalan pelunasan dengan input alasan pembatalan.

## 3. Plan Decomposition (3 Waves)
- **Wave 1 (Plan 61.1)**: Data Engine for Loan Repayment Grid & Reconcile (`src/services/loanMatrixService.ts` & test suite).
- **Wave 2 (Plan 61.2)**: Transform Modal into Checkbox Matrix Grid (`src/components/loans/LoanScheduleModal.tsx`, `LoanLedgerModal.tsx`, `src/pages/admin/LoanMatrix.tsx`).
- **Wave 3 (Plan 61.3)**: Static Verification, Unit Testing & Production Build Check.

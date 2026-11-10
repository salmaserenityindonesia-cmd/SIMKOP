---
phase: 77
plan: 1
wave: 1
gap_closure: false
---

# Plan 77.1: Restructure Loan Matrix Data Contract (Per-Loan Rows)

## Objective
Mengubah struktur data dan logika agregasi pada `src/services/loanMatrixService.ts` (`getLoanMatrix`) dari deduplikasi per anggota (`1 Baris = 1 Anggota`) menjadi berbasis pinjaman (`1 Baris = 1 Pinjaman Aktif/Berjalan`). Hal ini memastikan anggota yang memiliki lebih dari satu pinjaman aktif yang berjalan bersamaan (seperti Yanto Santoso dengan pinjaman 30 bulan dan pinjaman 12 bulan) memiliki baris independen dengan jadwal angsuran, saldo berjalan, dan identitas pinjaman masing-masing.

## Context
Load these files for context:
- `src/services/loanMatrixService.ts`
- `src/services/loanMatrixService.test.ts`

## Tasks

<task type="auto">
  <name>Allow Multiple Active Loans per Member in Loan Matrix Query & Data Structure</name>
  <files>
    src/services/loanMatrixService.ts
  </files>
  <action>
    1. Di `src/services/loanMatrixService.ts`:
       - Perbarui interface `LoanMatrixMember` (dan export alias `LoanMatrixRow = LoanMatrixMember`):
         Tambahkan properti:
         - `id?: string;` // loan.id (untuk key unik baris)
         - `loanId?: string;`
         - `loanNumber?: string;`
         - `pangkat?: string;`
         - `loanTypeName?: string;`
         - `agreedTenorMonths?: number;`
         - `tenor?: number;`
         - `monthlyTarget?: number;`
         - `principalAmount?: number;`
         - `disbursedAt?: string | null;`
         - `anggota?: { id: string; nrp: string; nama: string; pangkat?: string };`
         - `loan_types?: { id: string; code: string; name: string };`
       - Di fungsi `getLoanMatrix(year: number)`:
         - Ambil pinjaman yang relevan untuk tahun `year`:
           - Pinjaman yang memiliki jadwal jatuh tempo di tahun `year` (`loan_schedules.due_date BETWEEN startOfYear AND endOfYear`), ATAU pinjaman dengan status `active`/`approved`.
           - Ambil detail relasi:
             ```typescript
             .select(`
               id,
               loan_number,
               member_id,
               principal_amount,
               tenor,
               agreed_tenor_months,
               monthly_target,
               planned_installment_amount,
               disbursed_at,
               status,
               loan_types ( id, code, name ),
               anggota:member_id ( id, nrp, nama, pangkat ),
               loan_schedules ( id, period_number, due_date, target_amount, paid_amount, status )
             `)
             ```
         - Buat baris matriks dengan kunci unik **`loan.id`** (bukan `member.id` tunggal):
           ```typescript
           const loansMap: Record<string, LoanMatrixMember> = {};
           ```
         - Untuk setiap pinjaman:
           - Inisialisasi 12 bulan (Jan - Des).
           - Petakan jadwal angsuran pinjaman tersebut pada tahun yang dipilih ke dalam sel bulan 1 s/d 12.
           - Hitung saldo berjalan (`loanBalances[loan.id]`) dan kumulatif terbayar (`loanCumulativePaid[loan.id]`).
           - Hitung `complianceYTD` per pinjaman berdasarkan target dan realisasi angsuran pinjaman tersebut di tahun berjalan.
         - Hitung ringkasan matriks global:
           - `totalTargetYTD` & `totalCollectedYTD` mengakumulasi seluruh pinjaman.
           - `projectedNextMonth` mengakumulasi target angsuran bulan depan dari seluruh pinjaman aktif.
           - `unpaidMembersCount` menghitung jumlah anggota unik (`new Set(unpaidMemberIds).size`) yang menunggak.
           - Kembalikan `members: Object.values(loansMap)`.
  </action>
  <verify>
    Jalankan tes unit `npx vitest run src/services/loanMatrixService.test.ts` untuk memastikan tidak ada pemutusan kontrak dan semua tes kalkulasi matriks tetap valid.
  </verify>
  <done>
    `getLoanMatrix` menghasilkan entri baris independen per pinjaman aktif, mengeliminasi penimpaan jadwal multi-pinjaman untuk anggota yang sama.
  </done>
</task>

<task type="auto">
  <name>Unit Test Multi-Loan per Member in loanMatrixService</name>
  <files>
    src/services/loanMatrixService.test.ts
  </files>
  <action>
    1. Di `src/services/loanMatrixService.test.ts`:
       - Tambahkan suite pengujian baru: `loanMatrixService - Multi-Loan Support per Member`:
         - Mock data Supabase dengan satu anggota (misal Yanto Santoso, NRP: 96316880) yang memiliki 2 pinjaman aktif berjalan bersamaan:
           1) Pinjaman 1: Tenor 30 bulan, angsuran Rp 333.333/bulan.
           2) Pinjaman 2: Tenor 12 bulan, angsuran Rp 166.667/bulan.
         - Panggil `getLoanMatrix(2026)`.
         - Verifikasi bahwa `result.members.length === 2`:
           - Baris 1 memiliki `loanId` pinjaman 1, `loanNumber` pinjaman 1, `targetAmount` Rp 333.333.
           - Baris 2 memiliki `loanId` pinjaman 2, `loanNumber` pinjaman 2, `targetAmount` Rp 166.667.
         - Verifikasi bahwa `projectedNextMonth` mengakumulasikan target angsuran dari kedua pinjaman berjalan secara bersamaan.
  </action>
  <verify>
    Jalankan `npx vitest run src/services/loanMatrixService.test.ts` dan pastikan semua test kasus multi-pinjaman sukses 100%.
  </verify>
  <done>
    Fungsionalitas data multi-pinjaman per anggota teruji secara empiris dengan unit test komprehensif.
  </done>
</task>

## Success Criteria
- [ ] `getLoanMatrix` tidak lagi menduplikasi atau menimpa pinjaman dari anggota yang sama.
- [ ] Anggota dengan multi-pinjaman aktif menghasilkan jumlah baris yang sesuai dengan jumlah pinjamannya.
- [ ] Saldo berjalan dan kumulatif angsuran terisolasi secara akurat per `loan.id`.
- [ ] Akumulasi proyeksi dan realisasi global mencakup seluruh pinjaman aktif.

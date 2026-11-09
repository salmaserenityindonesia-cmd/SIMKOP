# Plan 70.2 Summary: Integrate Active Savings Deductions & Tenor Constraints into Loan Application Validation

## Objective
Mengintegrasikan kewajiban pemotongan iuran simpanan rutin aktif (Simpanan Wajib dari tarif bertingkat aktif, serta Simpanan Belanja dan Hari Raya bagi anggota yang terdaftar) ke dalam perhitungan kelayakan THP anggota dan validasi pengajuan pinjaman pada `/admin/pengajuan-pinjaman` (`src/pages/admin/PengajuanPinjaman.tsx` dan `src/services/loanService.ts`). Menyediakan rekomendasi tenor alternatif otomatis saat simulasi cicilan menghasilkan sisa THP di bawah batas minimum Rp 1.500.000.

## Implementation Details

### 1. Enforce Active Savings Deductions in `loanService.ts`
- **Method `getMemberTHP(memberId)`**:
  - Mengambil tarif aktif berjalan melalui `getActiveSavingsRateTiers()` dari `savingsRateService.ts`.
  - Mengambil komitmen simpanan aktif anggota dari tabel `member_deposits` (`is_terminated = false`).
  - Mengagregasi seluruh iuran simpanan aktif anggota (WAJIB, BELANJA, LEBARAN) ke dalam `savings_deduction`.
  - Memberikan fallback default potongan Simpanan Wajib aktif (`activeRates['WAJIB'] || 200000`) jika komitmen simpanan belum terdaftar di tabel `member_deposits`.
  - Menghitung `remaining_thp`: `master_thp - active_installments - savings_deduction`.
  - Mengembalikan objek `{ master_thp, active_installments, savings_deduction, remaining_thp }`.
- **Method `applyLoan(...)`**:
  - Menggunakan `getMemberTHP` terintegrasi sehingga validasi sisa THP minimum Rp 1.500.000 secara otomatis dan konsisten memperhitungkan potongan simpanan rutin.

### 2. SimulationPanel, Tenor Recommendations & Validation in `PengajuanPinjaman.tsx`
- **SimulationPanel Breakdown**:
  - Menambahkan baris transparan "Iuran Simpanan Rutin" dengan styling `text-rose-600` (`- Rp ...`).
  - Memastikan "Sisa THP Saat Ini" mencerminkan `thpData.remaining_thp`.
- **Fitur Rekomendasi Tenor Otomatis**:
  - Menghitung kelayakan seluruh tenor yang tersedia (`[6, 10, 12, 18, 24, 30, 36]`).
  - Apabila tenor terpilih menghasilkan sisa THP di bawah Rp 1.500.000 (`!eligibility.isEligible`), sistem mencari tenor terkecil berikutnya yang menghasilkan sisa THP $\ge$ Rp 1.500.000.
  - Menampilkan banner rekomendasi:
    *`💡 Rekomendasi: Pilih tenor {recommendedTenor} bulan atau lebih agar cicilan per bulan menjadi lebih ringan dan memenuhi syarat sisa THP minimal Rp 1.500.000.`*
  - Menyediakan tombol aksi cepat: *"Terapkan Tenor {recommendedTenor} Bulan"*.
  - Menambahkan opsi tenor 18 dan 30 bulan pada dropdown input tenor.

## Verification
- **Unit Tests**:
  - `src/services/loanService.test.ts`: 22 passed.
  - `src/pages/admin/PengajuanPinjaman.test.tsx`: 15 passed.
  - Total: 37 passed.
- **Production Build**:
  - `npm run build` sukses tanpa error (`vite v8.3.1 building client environment for production`).

## Commits
- `fef03eaa`: `feat(phase-70): enforce active savings deductions into member thp calculation`
- `4f57a372`: `feat(phase-70): update simulation panel, tenor recommendations and validation in pengajuan pinjaman`

## Deviations
None. Semua implementasi sesuai dengan rencana dan rancangan arsitektur Plan 70.2.

---
phase: 70
plan: 2
wave: 2
gap_closure: false
---

# Plan 70.2: Integrate Active Savings Deductions & Tenor Constraints into Loan Application Validation

## Objective
Mengintegrasikan kewajiban pemotongan iuran simpanan rutin aktif (terutama Simpanan Wajib dari tarif bertingkat aktif, serta Simpanan Belanja dan Hari Raya bagi yang terdaftar) ke dalam perhitungan kelayakan THP anggota dan validasi pengajuan pinjaman pada `/admin/pengajuan-pinjaman` (`src/pages/admin/PengajuanPinjaman.tsx` dan `src/services/loanService.ts`). Menyediakan rekomendasi tenor alternatif apabila tenor yang dipilih pengguna menghasilkan sisa THP di bawah batas minimum kelayakan Rp 1.500.000.

## Context
Load these files for context:
- `src/services/loanService.ts`
- `src/services/savingsRateService.ts`
- `src/pages/admin/PengajuanPinjaman.tsx`
- `src/services/loanService.test.ts`
- `src/pages/admin/PengajuanPinjaman.test.tsx`

## Tasks

<task type="auto">
  <name>Enforce Active Savings Deductions into Member THP Calculation in loanService</name>
  <files>
    src/services/loanService.ts
    src/services/loanService.test.ts
  </files>
  <action>
    1. Buka `src/services/loanService.ts`:
       - Perbarui method `getMemberTHP(memberId: string)`:
         * Ambil tarif aktif simpanan berjalan via `getActiveSavingsRateTiers()` dari `savingsRateService.ts`.
         * Ambil komitmen simpanan anggota dari tabel `member_deposits` (jika ada dan `is_terminated = false`):
           - Kueri `supabase.from('member_deposits').select('id, deposit_type_id, is_terminated, deposit_types(code)').eq('member_id', memberId).eq('is_terminated', false)`.
           - Jika ada data, hitung total potongan iuran bulanan berdasarkan `deposit_types.code` yang terhubung dengan `activeRates[code]`.
           - Jika tabel `member_deposits` kosong/belum terisi untuk anggota tersebut, gunakan default pemotongan Simpanan Wajib aktif: `activeRates['WAJIB'] || 200000`.
         * Hitung `savingsDeduction`: total potongan simpanan rutin bulanan aktif.
         * Hitung `remainingThp`:
           `const remainingThp = masterThp - activeInstallments - savingsDeduction;`
         * Kembalikan objek `{ master_thp: masterThp, active_installments: activeInstallments, savings_deduction: savingsDeduction, remaining_thp: remainingThp }`.
       - Pastikan `applyLoan(memberId, purpose, amount, tenor)` tetap menggunakan `getMemberTHP` yang baru, sehingga pencegahan pengajuan tidak layak secara konsisten memperhitungkan potongan simpanan.
    2. Perbarui unit test di `src/services/loanService.test.ts` untuk memvalidasi `savings_deduction` dan memastikan backward-compatibility terhadap test cases yang ada.
  </action>
  <verify>
    Jalankan unit tests loanService:
    npx vitest run src/services/loanService.test.ts
  </verify>
  <done>
    `loanService.getMemberTHP` dan `applyLoan` memperhitungkan potongan simpanan rutin aktif terhadap sisa THP anggota.
  </done>
</task>

<task type="auto">
  <name>Update SimulationPanel, Tenor Recommendations & Validation in PengajuanPinjaman</name>
  <files>
    src/pages/admin/PengajuanPinjaman.tsx
    src/pages/admin/PengajuanPinjaman.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/PengajuanPinjaman.tsx`:
       - Perbarui `SimulationPanelProps` dan komponen `SimulationPanel`:
         * Tambahkan baris "Potongan Simpanan Rutin" pada breakdown rincian:
           `<div className="flex justify-between pb-2 border-b border-gray-200"><span>Iuran Simpanan Rutin</span><span className="font-medium text-rose-600">- {formatCurrency(thpData.savings_deduction || 0)}</span></div>`.
         * Pastikan "Sisa THP Saat Ini / Tersedia" mencerminkan `thpData.remaining_thp`.
       - Tambahkan fitur rekomendasi tenor otomatis:
         * Saat `eligibility.isEligible === false`, buat kalkulasi helper untuk mencari tenor yang tersedia (misal: 6, 12, 18, 24, 30, 36 bulan) yang menghasilkan cicilan bulanan di mana sisa THP akhir $\ge$ Rp 1.500.000.
         * Tampilkan notifikasi rekomendasi tenor yang memenuhi syarat kelayakan:
           Contoh: *"Rekomendasi: Pilih tenor 18 bulan atau lebih agar cicilan per bulan menjadi lebih ringan dan memenuhi syarat sisa THP minimal Rp 1.500.000."*
    2. Perbarui unit test di `src/pages/admin/PengajuanPinjaman.test.tsx` untuk menguji breakdown simpanan rutin dan perenderan rekomendasi tenor.
    3. Jalankan pengujian penuh dan build:
       - `npx vitest run src/pages/admin/PengajuanPinjaman.test.tsx src/services/loanService.test.ts`
       - `npm run build`
  </action>
  <verify>
    Jalankan unit tests dan build Vite:
    npx vitest run src/pages/admin/PengajuanPinjaman.test.tsx src/services/loanService.test.ts
    npm run build
  </verify>
  <done>
    UI Pengajuan Pinjaman memvisualisasikan potongan simpanan secara transparan, mengevaluasi kelayakan tenor terhadap batas minimum Rp 1.500.000, serta memberikan rekomendasi tenor yang valid.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `SimulationPanel` menampilkan potongan simpanan rutin bulanan secara transparan.
- [ ] Validasi pinjaman menolak pengajuan yang menyebabkan sisa THP < Rp 1.500.000 setelah cicilan dan simpanan rutin.
- [ ] Rekomendasi tenor yang lebih panjang muncul saat tenor terpilih tidak memenuhi syarat sisa THP minimum.
- [ ] Semua unit test lulus dan build Vite sukses tanpa error.

## Success Criteria
- [ ] Kelayakan pinjaman terintegrasi erat dengan kewajiban simpanan aktif anggota.
- [ ] Pengguna mendapatkan panduan tenor yang jelas dan aplikatif saat simulasi menunjukkan shortfall.


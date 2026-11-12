---
phase: 92
plan: 1
wave: 1
gap_closure: false
---

# Plan 92.1: Normalisasi Nilai Kewajiban & Perbaikan Formula Net Settlement

## Objective
Memperbaiki bug *double negation* pada kalkulasi dan tampilan kliring anggota keluar (`/admin/clearance`), memastikan total kewajiban pinjaman dinormalisasi menjadi nilai positif absolut, formula `net_settlement` dihitung dengan benar (`total_hak - total_kewajiban`), dan seluruh kartu ringkasan, rincian tabel pinjaman, modal konfirmasi, serta template cetak lembar kliring menampilkan nilai nominal yang konsisten dan akurat.

## Context
- Halaman UI: `src/pages/admin/SettlementClearance.tsx`
- Service: `src/services/settlementService.ts`
- Komponen Terkait:
  - `src/components/settlement/ClearanceActionModal.tsx`
  - `src/components/settlement/ClearancePrintTemplate.tsx`
- Migrasi RPC: `supabase/migrations/046_fix_member_loan_settlement_balance.sql`

Akar Masalah:
1. Jika RPC atau data migrasi pinjaman mengembalikan `remaining_balance` bertanda negatif atau tidak seragam (misal `-Rp 6.666.680`), terjadi double negation ketika dikurangkan:
   `15.960.000 - (-6.666.680) = 22.626.680` (salah besar, pinjaman malah menambah hak simpanan).
2. Perhitungan sisa pokok pinjaman di `settlementService.ts`:
   - Baik data dari RPC `get_member_loan_settlement` maupun fallback manual `_getManualLoanSettlement`:
     - Normalisasi `remaining_balance` per pinjaman menjadi nilai positif mutlak: `Math.max(0, Math.abs(Number(l.remaining_balance || 0)))`.
     - Normalisasi `total_kewajiban`: `loans.reduce((sum, l) => sum + Math.max(0, Math.abs(Number(l.remaining_balance || 0))), 0)`.
     - Rumus `net_settlement = total_hak - total_kewajiban`.
   - Pada `_getManualLoanSettlement`, juga perhitungkan jika jadwal pinjaman `loan_schedules` tersedia atau fallback ke `principal - total_paid`, dengan `Math.max(0, ...)` agar tidak negatif.
3. Di `SettlementClearance.tsx`, `ClearanceActionModal.tsx`, dan `ClearancePrintTemplate.tsx`:
   - Pastikan label kartu "Total Kewajiban Pinjaman" selalu merender nilai absolut positif tanpa minus.
   - Kartu "Hak Bersih Anggota (Net Settlement)":
     - Jika `summary.net_settlement >= 0`: Tampilkan warna hijau/biru dengan keterangan Surplus Kas Keluar ke Anggota.
     - Jika `summary.net_settlement < 0`: Tampilkan warna merah dengan nominal defisit jelas (Anggota Masih Wajib Bayar ke Koperasi).
   - Kolom "SISA POKOK" pada tabel "Rincian Pinjaman Paralel Aktif" menampilkan nilai positif mutlak.
4. Buat migrasi SQL `supabase/migrations/046_fix_member_loan_settlement_balance.sql` untuk memastikan RPC `get_member_loan_settlement` di Postgres juga menggunakan `GREATEST(0, ABS(...))` atau `GREATEST(0, (l.amount - COALESCE(SUM(lr.amount_paid), 0)))` agar bebas dari nilai minus pada level database.
5. Buat unit test `src/services/settlementService.test.ts` untuk memverifikasi kalkulasi normalisasi dan pencegahan double negation.

## Tasks

<task type="auto">
  <name>Fix double negation in clearance settlement service and UI</name>
  <files>
    supabase/migrations/046_fix_member_loan_settlement_balance.sql
    src/services/settlementService.ts
    src/services/settlementService.test.ts
    src/pages/admin/SettlementClearance.tsx
    src/components/settlement/ClearanceActionModal.tsx
    src/components/settlement/ClearancePrintTemplate.tsx
  </files>
  <action>
    1. Buat berkas migrasi `supabase/migrations/046_fix_member_loan_settlement_balance.sql`:
       - Perbarui `public.get_member_loan_settlement(p_member_id UUID)` agar `remaining_balance` selalu `GREATEST(0, (COALESCE(l.principal_amount, l.amount, 0) - COALESCE(SUM(lr.amount_paid), 0)))`.
       - Perbarui juga fungsi `process_instant_payoff_clearance` dan `process_debtor_transition_clearance` untuk memastikan `v_total_kewajiban` selalu positif non-negatif.
    2. Perbarui `src/services/settlementService.ts`:
       - Pada pemrosesan `loans`:
         - Normalisasi setiap elemen `l.remaining_balance = Math.max(0, Math.abs(Number(l.remaining_balance || 0)))`.
         - Normalisasi `principal_amount = Math.max(0, Math.abs(Number(l.principal_amount || 0)))`.
         - Normalisasi `total_paid = Math.max(0, Math.abs(Number(l.total_paid || 0)))`.
       - Pada kalkulasi `total_kewajiban`:
         - `total_kewajiban = loans.reduce((sum, l) => sum + Math.max(0, Math.abs(Number(l.remaining_balance || 0))), 0);`
       - Pada kalkulasi `net_settlement`:
         - `net_settlement = total_hak - total_kewajiban;`
       - Pada `_getManualLoanSettlement`:
         - Hitung `remaining_balance = Math.max(0, Number(loan.principal_amount || loan.amount || 0) - total_paid)`.
    3. Buat unit test `src/services/settlementService.test.ts`:
       - Test skenario input raw kewajiban negatif (misal `-6666680` dan simpanan `15960000`) -> menghasilkan `total_kewajiban = 6666680` dan `net_settlement = 9293320` (Surplus).
       - Test skenario kewajiban lebih besar dari simpanan -> menghasilkan defisit bersih bernilai negatif (`net_settlement < 0`).
       - Test fallback manual method `_getManualLoanSettlement`.
    4. Perbarui `src/pages/admin/SettlementClearance.tsx`:
       - Pastikan badge status, kartu summary kewajiban, dan tabel sisa pokok menggunakan `formatCurrency(Math.abs(summary.total_kewajiban))` dan `formatCurrency(Math.max(0, Math.abs(l.remaining_balance)))`.
       - Perjelas deskripsi status: Surplus (Kas Koperasi Keluar ke Anggota) vs Defisit (Anggota Wajib Bayar ke Koperasi).
    5. Periksa dan perbarui `src/components/settlement/ClearanceActionModal.tsx` dan `src/components/settlement/ClearancePrintTemplate.tsx` agar nilai kewajiban pinjaman dan sisa kewajiban dicetak dalam format positif absolut.
    6. Jalankan unit test `npm test -- --run src/services/settlementService.test.ts`.
  </action>
  <verify>
    `npm test -- --run src/services/settlementService.test.ts` lolos 100% dan kalkulasi surplus Asep Saputra (15.960.000 - 6.666.680 = 9.293.320) terbukti akurat.
  </verify>
</task>


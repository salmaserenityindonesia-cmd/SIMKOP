# Summary 92.1: Normalisasi Nilai Kewajiban & Perbaikan Formula Net Settlement

## Objective
Memperbaiki bug *double negation* pada kalkulasi dan visualisasi kliring anggota keluar (`/admin/clearance`), memastikan seluruh nilai kewajiban pinjaman dinormalisasi menjadi nilai absolut positif, formula `net_settlement` terhitung akurat (`total_hak - total_kewajiban`), dan seluruh kartu ringkasan, rincian tabel pinjaman, modal konfirmasi, serta template cetak lembar kliring menyajikan nominal dan status yang konsisten.

## Problem Context
Sebelumnya, jika RPC `get_member_loan_settlement` atau data pinjaman mengembalikan `remaining_balance` bertanda minus (misal `-Rp 6.666.680`), terjadi pengurangan bilangan negatif:
$$\text{Net Settlement} = 15.960.000 - (-6.666.680) = 22.626.680$$
Hal ini menyebabkan pinjaman justru menambah hak simpanan anggota dan menampilkan nominal kewajiban yang menyesatkan.

## Changes Made
1. **Database Migration (`supabase/migrations/046_fix_member_loan_settlement_balance.sql`)**:
   - Memastikan kolom `principal_amount NUMERIC` tersedia pada tabel `public.loans`.
   - Memperbarui RPC `public.get_member_loan_settlement(p_member_id UUID)` dengan formula `GREATEST(0, (COALESCE(l.principal_amount, l.amount, 0) - COALESCE(SUM(lr.amount_paid), 0))) AS remaining_balance`.
   - Memperbarui fungsi `process_instant_payoff_clearance`, `process_debtor_transition_clearance`, dan `process_member_clearance` agar `v_total_kewajiban := GREATEST(0, ABS(v_total_kewajiban))` dan `v_net_settlement := v_total_hak - v_total_kewajiban`.

2. **Settlement Service (`src/services/settlementService.ts`)**:
   - Menambahkan normalisasi absolut positif pada seluruh elemen pinjaman:
     - `principal_amount = Math.max(0, Math.abs(Number(l.principal_amount || l.amount || 0)))`
     - `total_paid = Math.max(0, Math.abs(Number(l.total_paid || 0)))`
     - `remaining_balance = Math.max(0, Math.abs(Number(l.remaining_balance || 0)))`
   - Normalisasi simpanan hak: `total_amount = Math.max(0, Number(d.total_amount || 0))`.
   - Formula total kewajiban: `total_kewajiban = loans.reduce((sum, l) => sum + Math.max(0, Math.abs(Number(l.remaining_balance || 0))), 0)`.
   - Formula net settlement: `net_settlement = total_hak - total_kewajiban`.
   - Pada metode fallback manual `_getManualLoanSettlement`: `remaining_balance = Math.max(0, principal - total_paid)` guna mencegah anomali nilai negatif saat overpayment.

3. **Komponen UI & Lembar Cetak**:
   - `src/pages/admin/SettlementClearance.tsx`:
     - Kartu "Total Kewajiban Pinjaman" diformat dengan `formatCurrency(Math.abs(summary.total_kewajiban))`.
     - Tabel "Rincian Pinjaman Paralel Aktif" memformat kolom Sisa Pokok dengan `formatCurrency(Math.max(0, Math.abs(l.remaining_balance)))`.
     - Menambahkan badge status Surplus (Biru/Hijau) vs Defisit (Merah) beserta deskripsi eksplisit ("Surplus: Kas koperasi diserahkan/ditransfer ke anggota" vs "Defisit: Anggota wajib melunasi sisa utang ke koperasi sebelum pengesahan").
   - `src/components/settlement/ClearanceActionModal.tsx`:
     - Memformat sisa utang dan defisit dengan nilai absolut positif `Math.abs(...)`.
   - `src/components/settlement/ClearancePrintTemplate.tsx`:
     - Memformat plafon, sudah dibayar, sisa kewajiban, dan total sisa kewajiban menggunakan nilai non-negatif absolut.
     - Memperjelas header bagian C menjadi *Hak Bersih Anggota (Surplus)* atau *Kekurangan Pembayaran Anggota (Defisit)*.

4. **Unit Tests (`src/services/settlementService.test.ts`)**:
   - Pengujian skenario Asep Saputra: Simpanan `15.960.000` dan sisa pinjaman `-6.666.680` menghasilkan `total_kewajiban = 6.666.680` dan `net_settlement = 9.293.320` (Surplus).
   - Pengujian skenario Defisit: Simpanan `5.000.000` dan kewajiban `12.000.000` menghasilkan `net_settlement = -7.000.000`.
   - Pengujian pinjaman paralel ganda dengan tanda minus campuran.
   - Pengujian fallback manual `_getManualLoanSettlement` dan `_getManualDepositSettlement` ketika RPC error 42883.
   - Pengujian pencegahan saldo negatif pada kasus overpayment.
   - Pengujian pemanggilan RPC `processInstantPayoff` dan `processDebtorTransition`.

## Verification Results
- `npm test -- --run src/services/settlementService.test.ts`: 9 tests passed (100%).
- Full test suite: 76 test files passed, 1035 tests passed (100%).
- `npm run typecheck`: clean, zero TypeScript errors.

## Commit
- `a21155cb` - `feat(phase-92): fix double negation in clearance settlement service and ui`

---
phase: 59
plan: 2
wave: 2
depends_on: [1]
gap_closure: false
---

# Plan 59.2: POS SplitPaymentModal Validation & Cashier Shift Reconciliation Guard

## Objective
Menyempurnakan antarmuka modal pembayaran kasir (`SplitPaymentModal.tsx`) dengan badge status ketersediaan saldo, penguncian input bagi non-anggota atau saldo nol, pembatasan otomatis nilai input ke batas maksimal saldo/tagihan, serta memverifikasi proteksi perhitungan kas fisik laci pada `cashierShiftService.ts`.

## Context
- `src/components/pos/SplitPaymentModal.tsx`
- `src/components/pos/SplitPaymentModal.test.tsx`
- `src/services/cashierShiftService.ts`
- `src/services/cashierShiftService.test.ts`
- `.gsd/phases/59/59-1-PLAN.md`

## Tasks

<task type="auto">
  <name>Enforce Member Savings Balance Validation in SplitPaymentModal</name>
  <files>
    src/components/pos/SplitPaymentModal.tsx
    src/components/pos/SplitPaymentModal.test.tsx
  </files>
  <action>
    1. Buka `src/components/pos/SplitPaymentModal.tsx`:
       - Tampilkan badge saldo pada baris "Potong Simpanan Belanja":
         ```tsx
         {financials && !isNonMember && (
           <span className="text-xs font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
             Saldo Tersedia: Rp {Number(financials.belanjaBalance || 0).toLocaleString('id-ID')}
           </span>
         )}
         ```
       - Nonaktifkan input jika `isNonMember` ATAU `(!financials || financials.belanjaBalance <= 0)`:
         - `disabled={isNonMember || !financials || financials.belanjaBalance <= 0}`
         - Tampilkan keterangan "* Saldo simpanan belanja Rp 0 atau belum tersedia" jika saldo nol.
       - Validasi otomatis pada perubahan input (`onChange`):
         - Jika kasir memasukkan angka lebih besar dari `Math.min(total, financials.belanjaBalance)`, batasi otomatis ke nilai maksimum tersebut:
           ```typescript
           const maxAllowed = financials ? Math.min(total, Math.max(0, financials.belanjaBalance)) : total;
           const val = Math.min(Number(e.target.value) || 0, maxAllowed);
           setPaidDeposit(val > 0 ? val.toString() : '');
           ```
       - Tombol "Gunakan Maksimal" tetap menyetel `Math.min(total, financials.belanjaBalance)`.
    2. Perbarui pengujian di `src/components/pos/SplitPaymentModal.test.tsx`:
       - Uji penampilan badge saldo tersedia.
       - Uji penonaktifan input saat saldo simpanan belanja 0.
       - Uji pembatasan otomatis jika nilai yang dimasukkan melebihi saldo belanja.
  </action>
  <verify>
    npx vitest run src/components/pos/SplitPaymentModal.test.tsx
  </verify>
  <done>
    Antarmuka modal kasir secara responsif memvalidasi batas saldo simpanan belanja anggota.
  </done>
</task>

<task type="auto">
  <name>Verify Cashier Shift Cash Drawer Protection</name>
  <files>
    src/services/cashierShiftService.ts
    src/services/cashierShiftService.test.ts
  </files>
  <action>
    1. Buka `src/services/cashierShiftService.ts`:
       - Pastikan pada fungsi `getShiftSummary` dan `closeShift`:
         - `totalCashSales` murni merefleksikan pembayaran tunai (`paid_cash` setelah kembalian).
         - `paid_deposit` (dan `paid_credit`) terisolasi dan TIDAK ditambahkan ke `expected_cash` laci kasir fisik.
    2. Buka `src/services/cashierShiftService.test.ts`:
       - Tambahkan unit test skenario transaksi dengan `paid_deposit > 0`:
         - Pastikan `expected_cash` = `initial_cash` + `paid_cash`.
         - Pastikan `paid_deposit` tercatat dalam ringkasan non-cash tanpa mempengaruhi fisik uang kasir.
  </action>
  <verify>
    npx vitest run src/services/cashierShiftService.test.ts
  </verify>
  <done>
    Perhitungan saldo kas fisik shift kasir terlindungi dari pencampuran non-tunai simpanan belanja.
  </done>
</task>

## Success Criteria
- [ ] Badge "Saldo Tersedia: Rp [nominal]" tampil jelas di modal pembayaran POS.
- [ ] Input potong simpanan belanja terkunci jika non-anggota atau saldo belanja <= 0.
- [ ] Input dibatasi otomatis ke `min(total, saldo)`.
- [ ] Pembayaran simpanan belanja tidak masuk ke kas fisik laci kasir di `cashierShiftService.ts`.
- [ ] Unit tests di `SplitPaymentModal.test.tsx` dan `cashierShiftService.test.ts` lulus 100%.

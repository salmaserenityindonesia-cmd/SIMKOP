---
phase: 96
plan: 3
wave: 3
depends_on:
  - 96.2
gap_closure: false
---

# Plan 96.3: Add Unpaid Store Credit, Tenor Selector & Installment Simulation in POS SplitPaymentModal

## Objective
Menampilkan total bon toko anggota sebelumnya yang belum lunas, pilihan tenor potong gaji berkala (`1, 2, 3, 6, 12 Bulan` serta opsi `Custom`), dan kartu simulasi angsuran potong gaji per bulan secara real-time di bawah input **Catat Bon Toko (Potong Gaji)** pada modal pembayaran kasir `/admin/kasir`, lalu meneruskan tenor terpilih saat konfirmasi checkout.

## Context
- .gsd/SPEC.md
- .gsd/phases/96/RESEARCH.md
- src/components/pos/SplitPaymentModal.tsx
- src/pages/pos/index.tsx
- src/components/pos/SplitPaymentModal.test.tsx

## Tasks

<task type="auto">
  <name>Add Tenor Selector and Installment Simulation Card to SplitPaymentModal.tsx</name>
  <files>
    src/components/pos/SplitPaymentModal.tsx
    src/components/pos/SplitPaymentModal.test.tsx
  </files>
  <action>
    1. Perbarui `SplitPaymentModalProps.onConfirm` di `src/components/pos/SplitPaymentModal.tsx` agar menerima `storeCreditTenor?: number`:
       `onConfirm: (payload: { paidCash: number; paidDeposit: number; paidCredit: number; scheme: string; storeCreditTenor?: number }) => void;`
    2. Saat modal dibuka untuk anggota (`isOpen && !isNonMember && effectiveMemberId`), panggil `getMemberUnpaidStoreCreditSummary(effectiveMemberId)` untuk mengisi state:
       - `previousUnpaidStoreCredit: number` (default `0`)
       - `activeStoreCreditPlan: StoreCreditInstallmentPlan | null`
       - `storeCreditTenor: number` (default `summary.activePlan?.tenor_months || 1`)
       - `isCustomTenor: boolean` (aktif jika user memilih tombol `Custom` atau tenor aktif tidak termasuk `[1, 2, 3, 6, 12]`)
    3. Ekspor helper murni `calculateStoreCreditSimulation(previousUnpaidBalance: number, newBonAmount: number, tenorMonths: number)` agar mudah diuji dan digunakan ulang:
       - `consolidatedTotal = Math.round(Math.max(0, previousUnpaidBalance) + Math.max(0, newBonAmount))`
       - `safeTenor = Math.max(1, Math.round(tenorMonths || 1))`
       - `monthlyInstallment = Math.round(consolidatedTotal / safeTenor)`
    4. Tepat di bawah kotak input **Catat Bon Toko (Potong Gaji)** (saat `!isNonMember && creditAmount > 0`), render kartu simulasi `bg-amber-50/80 border border-amber-200` yang menampilkan:
       - `Total Bon Toko Sebelumnya (Belum Lunas):` dalam format `Rp ...`
       - Pilihan tenor: tombol preset `[1, 2, 3, 6, 12]` (`{t} Bln`) + tombol `Custom` yang memunculkan input angka bulan (`min={1}`, `max={60}`)
       - `Akumulasi Bon (Sisa Lama + Nota Baru): Rp ...`
       - `Simulasi Potong Gaji ({safeTenor}x Angsuran): Rp ... / bln`
       - Jika `activeStoreCreditPlan` ada: catatan `* Menggantikan rencana tenor bon toko sebelumnya ({activeStoreCreditPlan.tenor_months} Bln).`
    5. Pada `handleConfirm`, sertakan `storeCreditTenor: creditAmount > 0 ? safeTenor : undefined` pada pemanggilan `onConfirm(...)`.
    6. Tambahkan unit test di `src/components/pos/SplitPaymentModal.test.tsx` untuk:
       - Helper `calculateStoreCreditSimulation` (berbagai kombinasi sisa bon lama + nota baru + tenor).
       - Render kartu simulasi dan tombol tenor (`1 Bln`, `2 Bln`, `3 Bln`, `6 Bln`, `12 Bln`, `Custom`) saat mode `store_credit` aktif untuk anggota, dan memastikan kartu tidak muncul untuk non-anggota.
  </action>
  <verify>
    `npx vitest run src/components/pos/SplitPaymentModal.test.tsx`
  </verify>
  <done>
    `SplitPaymentModal.test.tsx` lulus 100%, kartu simulasi tampil di bawah input Catat Bon Toko dengan rumus akurat dan pilihan tenor `1, 2, 3, 6, 12 Bln` + `Custom`.
  </done>
</task>

<task type="auto">
  <name>Forward storeCreditTenor in src/pages/pos/index.tsx Checkout Handler</name>
  <files>
    src/pages/pos/index.tsx
  </files>
  <action>
    1. Perbarui signature `handleCheckoutConfirm` pada `src/pages/pos/index.tsx` agar menerima `storeCreditTenor?: number`.
    2. Teruskan `storeCreditTenor: payload.storeCreditTenor` ke pemanggilan `processCheckout(...)`.
    3. Pastikan tipe & props `<SplitPaymentModal ... onConfirm={handleCheckoutConfirm} />` kompatibel tanpa error TypeScript.
  </action>
  <verify>
    `npx tsc --noEmit`
  </verify>
  <done>
    `src/pages/pos/index.tsx` meneruskan `storeCreditTenor` ke `processCheckout` dan lolos pengecekan tipe TypeScript.
  </done>
</task>

## Must-Haves
- [ ] Simulasi menggunakan rumus `Math.round((Sisa Bon Lama + Nota Baru) / Tenor Baru)`.
- [ ] Pilihan tenor mencakup `1, 2, 3, 6, 12 Bln` dan `Custom`.
- [ ] Non-anggota tetap diblokir dari mode Bon Toko dan simulasi tidak tampil.

## Success Criteria
- [ ] `npx vitest run src/components/pos/SplitPaymentModal.test.tsx` dan `npx tsc --noEmit` lulus tanpa error.

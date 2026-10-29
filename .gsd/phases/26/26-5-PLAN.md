---
phase: 26
plan: 5
wave: 1
gap_closure: true
---

# Plan 26.5: Gap Closure - Hide Member Discount Row in POS SummaryPanel When Discount is Zero or Non-Member

## Objective
Menyembunyikan baris rincian "Diskon Member" pada panel ringkasan kasir POS (`src/components/pos/SummaryPanel.tsx`) ketika transaksi bertipe Non-Anggota atau ketika persentase diskon anggota bernilai 0% (sehingga nominal diskon Rp 0), menyelaraskan perilaku dengan tampilan Struk Transaksi Selesai (`ReceiptModal.tsx`) dan Struk PDF (`receiptPdfGenerator.ts`).

## Context
Load these files for context:
- `src/components/pos/SummaryPanel.tsx`
- `src/components/pos/ReceiptModal.tsx`
- `src/utils/receiptPdfGenerator.ts`

## Tasks

<task type="auto">
  <name>Conditionally hide discount breakdown row in SummaryPanel</name>
  <files>
    src/components/pos/SummaryPanel.tsx
  </files>
  <action>
    Di `src/components/pos/SummaryPanel.tsx`:
    Bungkus baris rincian diskon member (baris 107-110) dengan kondisi `discount > 0` (atau `isMemberMode && selectedMember && memberDiscountPercentage > 0 && discount > 0`):

    ```tsx
    {discount > 0 && (
      <div className="flex justify-between text-secondary-fixed">
        <span>Diskon Member{memberDiscountPercentage > 0 ? ` (${memberDiscountPercentage}%)` : ''}:</span>
        <span>- Rp {discount.toLocaleString('id-ID')}</span>
      </div>
    )}
    ```

    AVOID: Menampilkan baris "Diskon Member: - Rp 0" saat pembeli adalah non-anggota atau persentase diskon diatur 0%.
    USE: Conditional rendering `{discount > 0 && (...) }` sehingga baris diskon hanya tampil saat ada potongan aktif.
  </action>
  <verify>
    Jalankan verifikasi SSR markup dengan tsx:
    `npx tsx -e "import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import SummaryPanel from './src/components/pos/SummaryPanel'; const nonMember = renderToStaticMarkup(React.createElement(SummaryPanel, { cart: [{ id: '1', name: 'Item', price: 10000, qty: 1 }], members: [], selectedMember: null, memberDiscountPercentage: 5 })); const zeroPct = renderToStaticMarkup(React.createElement(SummaryPanel, { cart: [{ id: '1', name: 'Item', price: 10000, qty: 1 }], members: [{ id: 'm1', nama: 'Budi' }], selectedMember: { id: 'm1', nama: 'Budi' }, memberDiscountPercentage: 0 })); console.log('Non-member has Diskon Member row:', nonMember.includes('Diskon Member')); console.log('0% discount has Diskon Member row:', zeroPct.includes('Diskon Member'));"`
    Pastikan kedua output bernilai `false`.
  </verify>
  <done>
    Baris rincian diskon member di SummaryPanel tersembunyi sepenuhnya ketika pembeli non-anggota atau diskon 0%.
  </done>
</task>

<task type="auto">
  <name>Regression Tests and Build Verification</name>
  <files>
    src/utils/receiptPdfGenerator.test.ts,
    src/services/posSettingsService.test.ts
  </files>
  <action>
    1. Pastikan seluruh unit test Vitest tetap berjalan lulus tanpa regresi:
       `npx vitest run`
    2. Pastikan build aplikasi tetap berjalan sukses:
       `npm run build`
  </action>
  <verify>
    `npx vitest run` dan `npm run build`
  </verify>
  <done>
    Semua unit test 100% pass dan `npm run build` exit code 0.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Baris diskon di `SummaryPanel.tsx` tidak dirender saat `discount === 0` atau non-anggota.
- [ ] Baris diskon di `SummaryPanel.tsx` tetap dirender dengan persentase dinamis saat anggota belanja dengan diskon > 0%.
- [ ] Unit tests vitest dan npm run build sukses 0 error.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No regressions in tests

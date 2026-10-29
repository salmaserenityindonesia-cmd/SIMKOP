---
phase: 26
plan: 3
wave: 3
gap_closure: false
---

# Plan 26.3: Wave 3 - POS Dynamic Discount Integration (Cart, Parked Sales, Summary Panel & Receipts)

## Objective
Mengintegrasikan pengaturan persentase diskon anggota dinamis ke seluruh alur kasir POS:
1. Memuat pengaturan persentase diskon pada halaman kasir POS (`pages/pos/index.tsx`).
2. Menghitung nominal diskon keranjang kasir dan ringkasan pembayaran (`SummaryPanel.tsx`) berdasarkan persentase dinamis.
3. Menghitung diskon pada penahanan transaksi belanja (`posParkedService.ts`) menggunakan persentase dinamis.
4. Menampilkan label diskon dinamis pada ringkasan POS, Struk Cetak / Dialog Transaksi (`ReceiptModal.tsx`), dan Struk PDF (`receiptPdfGenerator.ts`).

## Context
Load these files for context:
- src/pages/pos/index.tsx
- src/components/pos/SummaryPanel.tsx
- src/services/posParkedService.ts
- src/components/pos/ReceiptModal.tsx
- src/utils/receiptPdfGenerator.ts
- src/services/posSettingsService.ts

## Tasks

<task type="auto">
  <name>Bind Dynamic Discount in POS Index, SummaryPanel & Parked Service</name>
  <files>
    src/pages/pos/index.tsx,
    src/components/pos/SummaryPanel.tsx,
    src/services/posParkedService.ts
  </files>
  <action>
    1. Di `src/pages/pos/index.tsx`:
       - Import `getPosSettings` dari `../../services/posSettingsService`.
       - Tambahkan state `memberDiscountPercentage` (default `5.0`).
       - Pada `useEffect` mount:
         * Panggil `getPosSettings()` dan set `setMemberDiscountPercentage(settings.member_discount_percentage ?? 5.0)`.
       - Ganti perhitungan diskon statis:
         * Dari `const discount = selectedMember ? subtotal * 0.05 : 0;`
         * Menjadi `const discount = selectedMember ? subtotal * (memberDiscountPercentage / 100) : 0;`
       - Teruskan `memberDiscountPercentage` ke props `SummaryPanel` dan `ReceiptModal`.
    2. Di `src/components/pos/SummaryPanel.tsx`:
       - Terima prop baru: `memberDiscountPercentage: number = 5`.
       - Ganti perhitungan diskon:
         * Dari `const discount = (isMemberMode && selectedMember) ? subtotal * 0.05 : 0;`
         * Menjadi `const discount = (isMemberMode && selectedMember) ? subtotal * (memberDiscountPercentage / 100) : 0;`
       - Perbarui teks banner hemat belanja:
         * Dari `Hemat Rp {discount.toLocaleString('id-ID')} via Diskon Anggota (5%)`
         * Menjadi `Hemat Rp {discount.toLocaleString('id-ID')} via Diskon Anggota (${memberDiscountPercentage}%)`
         * Pastikan banner ini hanya muncul jika `isMemberMode && selectedMember && memberDiscountPercentage > 0 && discount > 0`.
    3. Di `src/services/posParkedService.ts`:
       - Pada fungsi `holdTransaction`:
         * Dari `const discount = params.member ? subtotal * 0.05 : 0;`
         * Menjadi `const discountPercentage = settings.member_discount_percentage ?? 5.0; const discount = params.member ? subtotal * (discountPercentage / 100) : 0;`
  </action>
  <verify>
    Ubah diskon di settings menjadi 10%. Buka POS dengan anggota aktif, verifikasi subtotal terpotong 10% dan teks "Diskon Anggota (10%)" muncul di SummaryPanel.
  </verify>
  <done>
    Kalkulasi keranjang belanja, penahanan belanjaan, dan panel ringkasan menggunakan persentase diskon anggota yang dinamis.
  </done>
</task>

<task type="auto">
  <name>Dynamic Discount Labels in ReceiptModal and receiptPdfGenerator</name>
  <files>
    src/components/pos/ReceiptModal.tsx,
    src/utils/receiptPdfGenerator.ts
  </files>
  <action>
    1. Di `src/components/pos/ReceiptModal.tsx`:
       - Tambahkan properti opsional `discountPercentage?: number` pada `ReceiptModalProps`.
       - Pada tampilan struk thermal/layar:
         * Hitung persentase efektif: `const effectiveDiscountPct = discountPercentage ?? (subtotal > 0 && discount > 0 ? Math.round((discount / subtotal) * 100) : 5);`
         * Tampilkan baris diskon hanya jika `discount > 0`:
           ```tsx
           {discount > 0 && (
             <div className="flex justify-between text-secondary">
               <span>Diskon Anggota ({effectiveDiscountPct}%):</span>
               <span>- Rp {discount.toLocaleString('id-ID')}</span>
             </div>
           )}
           ```
       - Teruskan `discountPercentage: effectiveDiscountPct` ke payload `generateReceiptPdf(...)`.
    2. Di `src/utils/receiptPdfGenerator.ts`:
       - Tambahkan properti opsional `discountPercentage?: number` pada interface `ReceiptData`.
       - Pada bagian pencetakan baris diskon:
         * Dari teks statis: `doc.text('Diskon Anggota (5%)', left, y);`
         * Menjadi dinamis:
           ```ts
           if (data.discount > 0) {
             const pct = data.discountPercentage ?? (data.subtotal > 0 ? Math.round((data.discount / data.subtotal) * 100) : 5);
             y += 3.5;
             doc.text(`Diskon Anggota (${pct}%)`, left, y);
             doc.text('- ' + formatRp(data.discount), right, y, { align: 'right' });
           }
           ```
  </action>
  <verify>
    Struk transaksi di modal POS dan PDF hasil unduh mencetak persentase diskon yang sesuai (misal: 10% atau 0% tersembunyi).
  </verify>
  <done>
    Semua representasi nota/struk belanja (layar, thermal, PDF) mencetak persentase diskon anggota secara akurat dan dinamis.
  </done>
</task>

## Success Criteria
- [ ] Kalkulasi keranjang kasir POS mengikuti `memberDiscountPercentage`.
- [ ] Ringkasan belanja SummaryPanel menampilkan hemat belanja dengan persentase dinamis.
- [ ] Parked sales menyimpan nominal diskon berdasarkan pengaturan persentase dinamis.
- [ ] Modal struk transaksi (`ReceiptModal`) menampilkan label persentase dinamis dan menyembunyikannya jika Rp 0.
- [ ] PDF struk (`receiptPdfGenerator`) mencetak label persentase dinamis sesuai nominal diskon.


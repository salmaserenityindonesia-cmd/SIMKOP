---
phase: 19
plan: 1
wave: 1
gap_closure: false
---

# Plan 19.1: Implementasi Fitur Download PDF Struk Transaksi POS

## Objective
Mengaktifkan fungsi cetak/download PDF struk transaksi POS secara client-side menggunakan library `jspdf` dengan ukuran kertas thermal POS standar (80mm roll, dynamic height). Menggantikan pesan toast placeholder di `ReceiptModal.tsx` dengan unduhan file PDF langsung serta melengkapi verifikasi build dan test.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/components/pos/ReceiptModal.tsx
- src/pages/pos/index.tsx
- src/services/posCheckoutService.ts
- src/context/FeedbackContext.tsx

## Tasks

<task type="auto">
  <name>Create Receipt PDF Generator Utility & Tests</name>
  <files>
    src/utils/receiptPdfGenerator.ts
    src/utils/receiptPdfGenerator.test.ts
  </files>
  <action>
    1. Buat file `src/utils/receiptPdfGenerator.ts` dengan interface data struk:
       - `ReceiptTransactionData`:
         * `saleNumber`: string
         * `date`: string | Date
         * `cashierName`?: string
         * `memberName`?: string
         * `cart`: Array<{ name: string; qty: number; unit?: string; price: number }>
         * `subtotal`: number
         * `discount`: number
         * `total`: number
         * `payment`?: { paidCash: number; paidDeposit: number; paidCredit: number; scheme?: string }
    2. Implementasikan fungsi `generateReceiptPdf(data: ReceiptTransactionData): jsPDF`:
       - Konfigurasi ukuran halaman thermal 80mm: lebar 80mm, tinggi dinamis (misal: 100mm base + ~12mm per item + blok pembayaran) agar struk memanjang tanpa page-break ganjil.
       - Font mono / standard (Courier / Helvetica) dengan ukuran font proporsional (8-10pt).
       - Header:
         * "KOPERASI KONSUMEN SEJAHTERA MANDIRI" (centered, bold)
         * "Gedung Pusat SIMKOP, Jl. Merdeka No. 45 Jakarta" (centered, 8pt)
         * Garis putus-putus pembatas (dashed line)
       - Metadata:
         * No. Transaksi: data.saleNumber
         * Tanggal/Waktu: format lokal Indonesia
         * Kasir & Pembeli/Anggota
         * Garis pembatas
       - Daftar Item:
         * Nama produk (wrap text jika panjang)
         * Baris sub: qty x price di kiri, total item di kanan
       - Rincian Total:
         * Subtotal Kotor
         * Diskon Anggota (jika > 0)
         * TOTAL AKHIR (bold, size lebih besar)
       - Rincian Pembayaran:
         * Tunai (paidCash)
         * Simpanan Belanja (paidDeposit)
         * Bon Toko / Gaji (paidCredit)
         * Kembalian (change)
       - Footer:
         * "Terima kasih atas kunjungan Anda"
         * "Barang yang sudah dibeli tidak dapat ditukar/dikembalikan"
       - Ekspor langsung via `doc.save(\`struk-\${data.saleNumber || Date.now()}.pdf\`)`.
       - Return objek `doc` untuk kemudahan pengujian unit.
    3. Buat file unit test `src/utils/receiptPdfGenerator.test.ts` untuk memverifikasi instansiasi jsPDF dan pembuatan dokumen tanpa error saat diberikan data transaksi lengkap maupun minimal.
  </action>
  <verify>
    npm run test
  </verify>
  <done>
    Generator PDF struk thermal 80mm berfungsi menghasilkan file PDF dan lulus unit test vitest.
  </done>
</task>

<task type="auto">
  <name>Wire Up Modal Action Button to PDF Generator</name>
  <files>
    src/components/pos/ReceiptModal.tsx
    src/pages/pos/index.tsx
  </files>
  <action>
    1. Pada `src/pages/pos/index.tsx`:
       - Pastikan state transaksi yang sedang selesai atau baru saja di-checkout (nomor transaksi/saleNumber, member name, dsb.) diteruskan ke `ReceiptModal`.
       - Update pemanggilan `processCheckout` untuk menyimpan `saleNumber` yang dihasilkan ke state komponen agar dapat digunakan oleh struk cetak / download.
    2. Pada `src/components/pos/ReceiptModal.tsx`:
       - Terima prop tambahan seperti `saleNumber`, `memberName`, `cashierName`, atau gunakan nilai default yang sesuai.
       - Ganti fungsi `handlePDF` yang sebelumnya menampilkan toast placeholder ("Fitur cetak PDF struk akan segera hadir"):
         * Siapkan payload `ReceiptTransactionData` dari `cart`, `subtotal`, `discount`, `total`, `payment`, `saleNumber`, `memberName`.
         * Panggil `generateReceiptPdf(payload)`.
         * Tampilkan toast sukses: `showToast("Struk PDF berhasil diunduh", "success")`.
         * Tangani error dengan try-catch dan tampilkan `showToast("Gagal membuat struk PDF", "error")`.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Tombol "Download PDF" di `ReceiptModal` memicu fungsi `generateReceiptPdf` dan menghasilkan feedback toast yang sesuai.
  </done>
</task>

<task type="auto">
  <name>Build & Test Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan `npm run build` untuk memverifikasi kompilasi TypeScript dan bundler Vite.
    2. Jalankan `npm run test` untuk memastikan semua test suite berjalan hijau.
  </action>
  <verify>
    npm run build && npm run test
  </verify>
  <done>
    Build exit 0 dan semua tes vitest lulus.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Tombol "Download PDF" pada modal struk memicu download file PDF struk thermal (80mm).
- [ ] Struk memuat identitas koperasi, no invoice, kasir/anggota, rincian barang, total, metode split payment, dan kembalian.
- [ ] Tidak ada placeholder toast yang tersisa pada alur download PDF.
- [ ] `npm run build` dan `npm run test` lulus 100%.


---
phase: 34
plan: 4
wave: 4
gap_closure: false
---

# Plan 34.4: Wave 4 - Utility Ekspor Excel & PDF Landscape Kartu Stok

## Objective
Mengimplementasikan modul utility ekspor `src/utils/mutationExporter.ts` untuk mengunduh laporan mutasi barang dan kartu stok dalam format Microsoft Excel (.xlsx via `exceljs`) dan dokumen cetak PDF Landscape A4 (`jspdf` + `jspdf-autotable`). Format ekspor menyajikan kop resmi koperasi dari `koperasi_profile`, metadata filter dan rentang periode, ringkasan KPI, serta tabel detail mutasi dengan pemformatan numerik dan styling yang profesional. Dilengkapi unit test di `src/utils/mutationExporter.test.ts`.

## Context
Load these files for context:
- src/utils/retailExporter.ts
- src/utils/receiptPdfGenerator.ts
- src/services/settingsService.ts
- src/services/inventoryMutationService.ts

## Tasks

<task type="auto">
  <name>Build mutationExporter for Excel and PDF</name>
  <files>
    src/utils/mutationExporter.ts
  </files>
  <action>
    Buat `src/utils/mutationExporter.ts`:
    1. Import dinamis ExcelJS untuk menjaga ukuran bundel awal tetap ringan:
       ```ts
       const ExcelJS = (await import('exceljs')).default;
       ```
    2. Fungsi `exportMutationToExcel(options)`:
       - Parameter: `records: InventoryMutation[]`, `kpi: MutationKPISummary`, `filters: MutationFilter`, `profile?: KoperasiProfile | null`, `productLedger?: ProductStockLedger | null`.
       - Susun header worksheet: Nama Koperasi, Judul "LAPORAN MUTASI BARANG GUDANG / KARTU STOK", Periode Filter, dan Keterangan Produk (jika mode kartu stok).
       - Buat tabel ringkasan KPI: Total Masuk, Total Keluar, Net Mutasi, Total Nilai Masuk/Keluar, Frekuensi Transaksi.
       - Buat header tabel data: No, Tanggal & Waktu, No. Referensi, SKU, Nama Barang, Jenis Mutasi, Masuk (+), Keluar (-), Saldo Berjalan, Harga Satuan, Catatan.
       - Terapkan gaya font, border sel, background header (warna emerald/teal), dan number formatting mata uang/kuantitas.
       - Trigger download browser dengan nama file `laporan_mutasi_barang_{startDate}_{endDate}.xlsx`.
    3. Fungsi `exportMutationToPdf(options)`:
       - Gunakan `jsPDF` dengan opsi `{ orientation: 'landscape', unit: 'mm', format: 'a4' }`.
       - Buat kop surat identitas koperasi (nama, alamat, telepon).
       - Judul laporan bergaris bawah tebal dengan periode tanggal.
       - Buat tabel ringkas KPI di bagian atas.
       - Gunakan `autoTable` dari `jspdf-autotable` untuk menyajikan baris-baris data mutasi:
         * Kolom: No, Waktu, No. Ref, SKU, Nama Produk, Tipe Mutasi, Masuk, Keluar, Saldo, Satuan Rp, Keterangan.
         * Tema 'striped', header style warna gelap/teal (`#0F766E`), text alignment yang rapi untuk angka.
       - Tambahkan footer dokumen: Waktu cetak, nama sistem SIMKOP, dan nomor halaman `Halaman X dari Y`.
       - Trigger download browser dengan nama file `laporan_mutasi_barang_{startDate}_{endDate}.pdf`.
  </action>
  <verify>
    npm run typecheck
  </verify>
  <done>
    mutationExporter.ts terimplementasi dengan ekspor Excel dan PDF Landscape yang rapi, informatif, dan sesuai standar dokumen resmi koperasi.
  </done>
</task>

<task type="auto">
  <name>Create Unit Tests for mutationExporter</name>
  <files>
    src/utils/mutationExporter.test.ts
  </files>
  <action>
    Buat `src/utils/mutationExporter.test.ts`:
    1. Tes `exportMutationToExcel`:
       - Memastikan fungsi menghasilkan workbook Excel tanpa runtime error.
       - Memastikan worksheet memuat baris data mutasi dan baris ringkasan KPI.
    2. Tes `exportMutationToPdf`:
       - Memastikan instans jsPDF terbentuk dengan orientasi landscape.
       - Memastikan autoTable dipanggil dengan dataset mutasi.
    3. Tes penanganan parameter opsional (profile null, filters default).
  </action>
  <verify>
    npx vitest run src/utils/mutationExporter.test.ts
  </verify>
  <done>
    Unit tests untuk mutationExporter lulus 100% dan mengonfirmasi fungsi ekspor bekerja tanpa kendala.
  </done>
</task>

## Success Criteria
- [ ] Utility `mutationExporter.ts` mampu mengekspor ke Excel (.xlsx) dengan styling rapi
- [ ] Utility `mutationExporter.ts` mampu mengekspor ke PDF Landscape A4 dengan jspdf-autotable
- [ ] Header koperasi, ringkasan KPI, dan kolom data tersaji akurat
- [ ] Unit tests di `mutationExporter.test.ts` lulus tanpa kesalahan


---
phase: 93
plan: 1
wave: 1
gap_closure: false
---

# Plan 93.1: Non-Destructive Print Trigger & Optimasi CSS 1 Halaman Ukuran F4

## Objective
Menghilangkan bug reset data anggota terpilih (`selectedMember`) saat dialog print dibatalkan atau selesai dicetak di `/admin/clearance`, serta mengoptimalkan template lembar cetak settlement kliring (`ClearancePrintTemplate.tsx`) agar muat presisi dalam 1 halaman kertas ukuran F4/Folio (215mm x 330mm) tanpa terpotong tanda tangan di halaman kedua.

## Context
- Halaman UI: `src/pages/admin/SettlementClearance.tsx`
- Komponen Cetak: `src/components/settlement/ClearancePrintTemplate.tsx`
- Layout/Wrapper: `src/components/layout/AdminLayout.tsx`

Akar Masalah:
1. **State Reset / Form Reload**:
   - Fungsi `handlePrint` di `SettlementClearance.tsx` mengeksekusi destructive DOM replacement:
     ```tsx
     document.body.innerHTML = printContent;
     window.print();
     document.body.innerHTML = originalContent;
     window.location.reload(); // Quick reload to restore React event listeners after destructive DOM replace
     ```
   - Pemanggilan `window.location.reload()` menghancurkan seluruh state React, mereset dropdown pencarian anggota, dan mengosongkan ringkasan kliring kembali ke awal.
   - Tombol cetak belum memiliki atribut `type="button"` eksplisit dan belum mencegah event default form submit jika tertanam dalam hierarki form.

2. **Tata Letak Print Preview Terpotong 2 Halaman**:
   - Lembar cetak di `ClearancePrintTemplate.tsx` menggunakan `p-8`, `min-h-screen`, `mb-8`, `mb-6`, dan `mt-16` / `mb-16` untuk tanda tangan.
   - Tidak ada deklarasi ukuran kertas F4 (`@page { size: 215mm 330mm; margin: 10mm 15mm 10mm 15mm; }`) dan tidak ada aturan `@media print` untuk menyembunyikan elemen SPA serta mengontrol `page-break-inside: avoid` / `break-inside: avoid`.
   - Akibatnya, pada preview cetak browser, blok tanda tangan (Pemohon, Petugas Simpan Pinjam, Ketua Koperasi) terlempar ke halaman kedua.

## Tasks

<task type="auto">
  <name>Prevent State Reset or Form Submission on Print Action</name>
  <files>
    src/pages/admin/SettlementClearance.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/SettlementClearance.tsx`:
       - Hapus logika manipulasi destruktif `document.body.innerHTML` dan hapus `window.location.reload()`.
       - Perbarui tombol "Cetak Lembar Settlement (PDF)":
         - Tambahkan atribut `type="button"`.
         - Pastikan event handler `handlePrint` memanggil `e?.preventDefault()` dan `e?.stopPropagation()`.
         - Panggil langsung `window.print()` tanpa merusak DOM atau mereset state `selectedMember` maupun `summary`.
       - Sesuaikan wrapper komponen `<ClearancePrintTemplate>` agar siap dicetak melalui stylesheet print:
         - Hapus wrapper `<div className="hidden">` yang menghalangi rendering print.
         - Berikan wrapper dengan class CSS selektif print seperti `hidden print:block` atau `id="printable-settlement"`.
       - Pastikan elemen layar UI SPA (`AdminLayout`, kartu aksi, filter dropdown) tersembunyi saat mode cetak dengan aturan `@media print` atau `print:hidden`.
  </action>
  <verify>
    Saat tombol "Cetak Lembar Settlement (PDF)" diklik dan dialog print ditutup/dibatalkan (klik "Cancel"), halaman tetap berada di profil anggota aktif (`selectedMember`), tabel simpanan & pinjaman tetap tampil, dan browser TIDAK melakukan reload halaman.
  </verify>
</task>

<task type="auto">
  <name>Configure F4 Page Size and Prevent Signature Page Break</name>
  <files>
    src/components/settlement/ClearancePrintTemplate.tsx
    src/pages/admin/SettlementClearance.tsx
  </files>
  <action>
    1. Buka `src/components/settlement/ClearancePrintTemplate.tsx`:
       - Tambahkan blok CSS `@media print` terintegrasi (atau inline `<style>` khusus cetak):
         ```css
         @media print {
           @page {
             size: 215mm 330mm; /* Standar Ukuran Kertas F4 / Folio Indonesia */
             margin: 8mm 12mm 8mm 12mm;
           }
           body {
             background: #fff !important;
             color: #000 !important;
             -webkit-print-color-adjust: exact;
             print-color-adjust: exact;
           }
           /* Sembunyikan elemen non-print saat pencetakan */
           body > * {
             visibility: hidden;
           }
           #printable-settlement, #printable-settlement * {
             visibility: visible !important;
           }
           #printable-settlement {
             position: absolute !important;
             left: 0 !important;
             top: 0 !important;
             width: 100% !important;
             margin: 0 !important;
             padding: 0 !important;
           }
         }
         ```
       - Rampingkan padding & margin pada elemen dokumen:
         - Hapus `min-h-screen` dan ganti `p-8` menjadi `p-0` atau `p-2` pada kontainer cetak.
         - Rampingkan header kop koperasi: kurangi margin dari `mb-8` menjadi `mb-3` dan `pb-2`.
         - Rampingkan rincian identitas anggota: kurangi jarak dari `mb-6` menjadi `mb-2`.
         - Rampingkan tabel Hak Simpanan (A) dan Kewajiban Pinjaman (B): gunakan cell padding ringkas `p-1.5` atau `py-1 px-2` dengan `text-xs` (11px).
         - Rampingkan blok Perhitungan Bersih Net Settlement (C): kurangi margin dari `mb-8` menjadi `mb-3`, padding `p-2.5`.
         - Rampingkan blok Tanda Tangan:
           - Berikan kelas `break-inside-avoid print:break-inside-avoid`.
           - Kurangi margin top dari `mt-16` menjadi `mt-4 print:mt-4`.
           - Kurangi jarak baris tanda tangan dari `mb-16` menjadi `mb-10 print:mb-10`.
    2. Pastikan kontainer utama di `ClearancePrintTemplate.tsx` memiliki `id="printable-settlement"` dan kelas `print:w-full print:text-black`.
  </action>
  <verify>
    Klik tombol "Cetak Lembar Settlement (PDF)" dan periksa layout di print preview browser:
    - Dokumen berukuran F4 (215mm x 330mm).
    - Seluruh konten (Kop, Identitas Anggota, Tabel Simpanan, Tabel Pinjaman, Perhitungan Hak Bersih, dan 3 Kolom Tanda Tangan) pas dalam 1 halaman lembar kertas tanpa terpotong ke halaman 2.
  </verify>
</task>


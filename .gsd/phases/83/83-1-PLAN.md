---
phase: 83
plan: 1
wave: 1
gap_closure: false
---

# Plan 83.1: Remove Rigid Step Constraint on Minimum THP Input

## Objective
Menghapus batasan `min="1"` dan `step="50000"` pada input "Batas Minimum Sisa THP (Rp)" di `src/pages/admin/PengaturanKoperasi.tsx` yang memicu kalkulasi ganjil browser (contoh: peringatan validasi peramban 950001 vs 1000001 saat mengetik 1000000). Menggantinya dengan atribut yang ramah nominal (`step="any"` dan `min="0"`), serta memastikan input menerima nilai nominal bebas tanpa tooltip validasi browser.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/pages/admin/PengaturanKoperasi.tsx
- src/services/settingsService.ts

## Tasks

<task type="auto">
  <name>Remove Rigid Step Constraint on Minimum THP Input</name>
  <files>src/pages/admin/PengaturanKoperasi.tsx</files>
  <action>
    - Buka `src/pages/admin/PengaturanKoperasi.tsx`.
    - Temukan elemen `<input>` pada bagian **"Batas Minimum Sisa THP (Rp) *"**:
      1. Hapus atribut `min="1"` dan `step="50000"` yang menyebabkan error validasi peramban kelipatan ganjil.
      2. Pasang atribut yang ramah nominal: `step="any"` dan `min="0"`.
      3. Pastikan input menerima angka bebas tanpa ada peringatan *"Please select a valid value"*.
      4. Pertahankan placeholder dan styling yang konsisten.
  </action>
  <verify>
    Ketik angka 1000000 secara langsung: input tidak memunculkan tooltip validasi browser kelipatan ganjil. Jalankan `npx vitest run src/pages/admin/PengaturanKoperasi.test.tsx` untuk memastikan render input tetap sesuai.
  </verify>
  <done>Input batas minimum THP menerima angka secara mulus tanpa penolakan validasi step kelipatan peramban.</done>
</task>

## Must-Haves
- [ ] Atribut `min="1"` dan `step="50000"` dihilangkan dari input `minRemainingThp`.
- [ ] Atribut `step="any"` dan `min="0"` terpasang dengan benar.

## Success Criteria
- [ ] Input menerima nominal angka berapapun (misal 1.000.000, 1.250.000, 750.000).
- [ ] Tidak ada tooltip validasi browser "Please select a valid value".

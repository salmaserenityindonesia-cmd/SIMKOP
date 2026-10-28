---
phase: 18
plan: 3
wave: 2
gap_closure: false
depends_on:
  - 18.1
---

# Plan 18.3: Refactor POS Module & Standalone Utilities Dialogs

## Objective
Membersihkan sisa dialog bawaan browser pada modul Kasir POS modern (`src/pages/pos/`, `src/components/pos/`) serta file utilitas/service terkait, menggantikannya dengan toast atau event handler UI.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/context/FeedbackContext.tsx
- src/pages/pos/index.tsx
- src/components/pos/ReceiptModal.tsx
- src/utils/retailExporter.ts

## Tasks

<task type="auto">
  <name>Refactor POS Views & Receipt Modal Dialogs</name>
  <files>
    src/pages/pos/index.tsx
    src/components/pos/ReceiptModal.tsx
  </files>
  <action>
    1. Buka `src/pages/pos/index.tsx`:
       - Gunakan `useFeedback()`.
       - Ganti `alert('Checkout gagal: ' + res.error)` dengan `showToast(res.error || 'Checkout gagal', 'error')`.
       - Ganti `alert('Fitur Tahan Transaksi (Placeholder)')` dengan `showToast('Fitur Tahan Transaksi akan segera hadir', 'info')`.
       - Ganti `alert('Produk tidak ditemukan!')` dengan `showToast('Produk tidak ditemukan dalam katalog!', 'warning')`.
    2. Buka `src/components/pos/ReceiptModal.tsx`:
       - Gunakan `useFeedback()`.
       - Ganti placeholder `alert("Fitur PDF akan memanfaatkan jsPDF (Placeholder)")` dengan `showToast("Fitur cetak PDF struk akan segera hadir", "info")`.
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    Semua alert di modul POS digantikan oleh toast feedback non-blocking.
  </done>
</task>

<task type="auto">
  <name>Clean Utility Error Fallbacks & Comprehensive Verification</name>
  <files>
    src/utils/retailExporter.ts
  </files>
  <action>
    1. Periksa `src/utils/retailExporter.ts`:
       - Hapus alert synchronous `alert('Gagal export Excel.')` dan gantikan dengan melempar error (`throw err`) atau membiarkan caller menangani feedback toast agar utilitas tetap independen dari DOM window alert.
    2. Lakukan audit pencarian seluruh codebase untuk memastikan zero residual:
       `Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx" | Select-String -Pattern "\b(alert|confirm|prompt)\s*\("`
    3. Pastikan pengujian unit test dan build produksi berjalan normal.
  </action>
  <verify>
    npm run build && npx vitest run
  </verify>
  <done>
    Pencarian alert/confirm/prompt menghasilkan 0 temuan di src/ dan build Vite lolos 100%.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] 0 instance `alert(`, `confirm(`, atau `prompt(` di seluruh folder `src/`.
- [ ] `npm run build` sukses (exit code 0).
- [ ] Suite pengujian unit test vitest lulus.

## Success Criteria
- [ ] Zero residual native browser dialogs in application code
- [ ] Clean build and test execution

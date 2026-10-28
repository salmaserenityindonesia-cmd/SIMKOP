---
phase: 18
plan: 1
wave: 1
gap_closure: false
---

# Plan 18.1: Global Feedback UI Infrastructure (Toast & Confirm Modal System)

## Objective
Membangun fondasi feedback UI kustom aplikasi SIMKOP yang aman dari pemblokiran browser. Sistem ini menyediakan hooks `useFeedback()` dan imperatif API untuk menampilkan toast notifications (success, error, info, warning) dan modal konfirmasi interaktif (asinkron berbasis Promise atau callback) dengan styling Tailwind CSS v4 dan ikon Lucide.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md
- src/App.tsx
- src/index.css

## Tasks

<task type="auto">
  <name>Create FeedbackContext and Toast/Confirm Components</name>
  <files>
    src/context/FeedbackContext.tsx
    src/components/common/FeedbackModal.tsx
    src/components/common/ToastContainer.tsx
  </files>
  <action>
    1. Implementasikan `FeedbackContext` di `src/context/FeedbackContext.tsx` yang mengekspos:
       - `showToast(message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number)`
       - `showConfirm(options: { title?: string; message: string; confirmText?: string; cancelText?: string; variant?: 'danger' | 'primary' }): Promise<boolean>`
       - `showAlert(message: string, title?: string): Promise<void>`
    2. Buat `ToastContainer` di `src/components/common/ToastContainer.tsx` yang merender tumpukan toast di pojok kanan atas dengan auto-dismiss, tombol close, dan visual sesuai Stitch design system (emerald untuk success, red untuk error, amber untuk warning, blue untuk info).
    3. Buat `FeedbackModal` di `src/components/common/FeedbackModal.tsx` dengan animasi transisi, backdrop blur/overlay, trap focus/ESC support, serta aksi konfirmasi (Ya/Batal) dan Alert (OK) yang mengembalikan resolusi Promise.
    
    AVOID: Menggunakan library eksternal baru jika dapat dibuat secara native menggunakan React standard context + Lucide icons.
    USE: Promise-based resolution pada modal konfirmasi sehingga pemanggil dapat menulis `const confirmed = await showConfirm(...)` layaknya `window.confirm(...)`.
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    FeedbackContext, ToastContainer, dan FeedbackModal terkompilasi bersih tanpa TypeScript errors.
  </done>
</task>

<task type="auto">
  <name>Mount FeedbackProvider in Application Root</name>
  <files>
    src/App.tsx
  </files>
  <action>
    1. Buka `src/App.tsx`.
    2. Import `FeedbackProvider` dari `src/context/FeedbackContext`.
    3. Bungkus root router/komponen di dalam `FeedbackProvider` agar seluruh route dan child components dapat mengakses hook `useFeedback()`.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    FeedbackProvider terpasang di level atas `App.tsx` dan aplikasi berhasil di-build tanpa error.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Hook `useFeedback()` dapat diakses oleh komponen manapun dalam aplikasi.
- [ ] Tersedia API `showToast`, `showAlert`, dan `showConfirm` yang non-blocking terhadap thread browser dan tidak bisa diblokir oleh setelan browser alert prevention.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Build lulus tanpa error

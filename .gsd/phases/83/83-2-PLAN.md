---
phase: 83
plan: 2
wave: 2
gap_closure: false
---

# Plan 83.2: Build Type-to-Confirm Modal for Strategic Threshold Changes

## Objective
Mengubah ambang batas kelayakan pinjaman anggota merupakan keputusan strategis hasil Rapat Anggota Tahunan (RAT) yang berdampak langsung pada kelayakan kredit seluruh anggota. Plan ini menerapkan pengaman tingkat tinggi: **Modal Konfirmasi Tindakan Kritis** yang mewajibkan admin mengetikkan kata verifikasi `SETUJU` dan menampilkan perbandingan `Nominal Lama -> Nominal Baru` sebelum mutasi database diizinkan.

## Context
Load these files for context:
- src/pages/admin/PengaturanKoperasi.tsx
- src/services/settingsService.ts
- src/context/FeedbackContext.tsx

## Tasks

<task type="auto">
  <name>Build Type-to-Confirm Modal for Strategic Threshold Changes</name>
  <files>src/pages/admin/PengaturanKoperasi.tsx</files>
  <action>
    - Buka `src/pages/admin/PengaturanKoperasi.tsx`:
      1. Tambahkan state pengaman:
         - `isConfirmModalOpen: boolean` (default `false`)
         - `confirmationInputText: string` (default `''`)
         - `initialMinThp: number` (disimpan saat data awal dimuat via `getLoanSettings()` atau dari prop `initialMinRemainingThp`)
      2. Saat form "Simpan Kebijakan Kelayakan" ditekan (`handleSaveLoanSettings`):
         - Lakukan validasi dasar angka (> 0).
         - Jika nominal baru sama persis dengan `initialMinThp`, simpan langsung tanpa membuka modal.
         - Jika nominal baru berbeda dengan `initialMinThp`, cegah simpan langsung (`e.preventDefault()`), buka modal konfirmasi:
           `setIsConfirmModalOpen(true)` dan reset `confirmationInputText = ''`.
      3. Rancang UI **Modal Konfirmasi Kebijakan Strategis (Keputusan RAT)**:
         - **Backdrop & Container**: Modal popup di tengah layar dengan backdrop gelap (`fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4`).
         - **Header**: Ikon `ShieldAlert` / `AlertTriangle` warna rose/amber dengan judul **"Konfirmasi Perubahan Batas Kelayakan Pinjaman"** dan tombol close `X`.
         - **Badging & Diff Nominal**:
           Tampilkan perbandingan visual:
           `Nominal Lama: Rp {initialMinThp.toLocaleString('id-ID')}` ➔ `Nominal Baru: Rp {minRemainingThp.toLocaleString('id-ID')}`.
         - **Peringatan Dampak**:
           *"Perubahan ini merupakan keputusan strategis hasil RAT. Angka baru ini akan langsung memengaruhi analisis kelayakan pengajuan pinjaman seluruh anggota selanjutnya."*
         - **Type-to-Confirm Input**:
           Minta admin mengetik kata **`SETUJU`** (case-insensitive) untuk membuka kunci tombol konfirmasi:
           - Paragraf: Ketik SETUJU untuk mengonfirmasi perubahan kebijakan:
           - Input text dengan `font-mono text-center uppercase tracking-widest placeholder="Ketik SETUJU di sini"`.
         - **Tombol Aksi**:
           - Tombol **Batal**: Menutup modal (`setIsConfirmModalOpen(false)`) dan reset input teks.
           - Tombol **"Konfirmasi & Terapkan Kebijakan"**: Diberi atribut `disabled={confirmationInputText.trim().toUpperCase() !== 'SETUJU' || isSavingLoanSettings}`.
           - Saat tombol konfirmasi diklik, jalankan fungsi eksekusi penyimpanan ke `updateLoanSettings(...)`, perbarui `initialMinThp = val`, tampilkan toast feedback sukses, dan tutup modal.
  </action>
  <verify>
    1. Buka halaman pengaturan, ubah nominal minimum THP dari 1.500.000 menjadi 1.000.000 lalu klik tombol simpan.
    2. Modal konfirmasi muncul memajang nominal lama (1.500.000) dan nominal baru (1.000.000).
    3. Tombol konfirmasi disabled sampai kata "SETUJU" diketik.
    4. Setelah diketik "SETUJU", tombol aktif dan saat diklik perubahan tersimpan ke backend.
  </verify>
  <done>Kebijakan ambang batas pinjaman terlindungi dengan modal konfirmasi ketik frasa SETUJU.</done>
</task>

## Must-Haves
- [ ] State `initialMinThp` melacak nominal sebelum diedit.
- [ ] Modal konfirmasi hanya muncul saat nominal sisa THP berubah.
- [ ] Diff nominal lama vs baru ditampilkan secara jelas di dalam modal.
- [ ] Tombol konfirmasi terkunci kecuali teks ketikan sama dengan `SETUJU` (case-insensitive).
- [ ] Pembatalan menutup modal tanpa mengubah database.

## Success Criteria
- [ ] Proteksi tindakan kritis berjalan lancar dan mencegah simpan tanpa sengaja.
- [ ] UI modal selaras dengan Stitch / Tailwind design system SIMKOP.

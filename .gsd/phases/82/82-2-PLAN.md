# Plan 82.2: Add Minimum THP Configuration Box in Pengaturan Page

## Objective
Menyediakan antarmuka input pengaturan ambang batas kelayakan pinjaman di halaman Pengaturan Koperasi (`src/pages/admin/PengaturanKoperasi.tsx`):
1. Membuat kartu / section khusus: **"Kebijakan Kelayakan Pinjaman (Keputusan RAT)"**.
2. Menyediakan input:
   - **Batas Minimum Sisa THP (Rp)**: input format rupiah/angka dengan preview format mata uang real-time dan teks penjelasan bantuan.
   - **Catatan Keputusan / Ketetapan RAT**: input teks untuk dasar hukum/nomor SK RAT (misal: "Keputusan RAT Tahun Buku 2025 No. 04/RAT/2026").
3. Menyediakan tombol Simpan Kebijakan Pinjaman dengan indikator loading dan feedback toast (menggunakan `useFeedback`).
4. Memastikan nilai tersimpan dimuat otomatis saat halaman dibuka dan perubahan tersimpan persist ke database/localStorage.

## Tasks
<task type="auto">
  <name>Render Policy Configuration Box in PengaturanKoperasi.tsx</name>
  <files>src/pages/admin/PengaturanKoperasi.tsx</files>
  <action>
    - Buka `src/pages/admin/PengaturanKoperasi.tsx`:
      1. Tambahkan state untuk loan settings:
         `const [minRemainingThp, setMinRemainingThp] = useState<number>(1500000);`
         `const [minThpRatNotes, setMinThpRatNotes] = useState<string>('');`
         `const [isSavingLoanSettings, setIsSavingLoanSettings] = useState<boolean>(false);`
      2. Muat data melalui `getLoanSettings()` di dalam hook `useEffect`.
      3. Tambahkan kartu UI dengan ikon perbankan/kebijakan (misal `ShieldCheck` atau `FileSpreadsheet` / `Sliders`):
         - Judul: **Kebijakan Kelayakan Pinjaman (Keputusan RAT)**
         - Input Batas Minimum Sisa THP (Rp) dengan formatting angka bersih dan validasi > 0.
         - Input Catatan Keputusan / Nomor SK RAT.
         - Tombol **Simpan Kebijakan Kelayakan**.
      4. Hubungkan submit ke `updateLoanSettings({ minRemainingThp, ratNotes: minThpRatNotes })` disertai notifikasi toast sukses/gagal.
  </action>
  <verify>
    - Jalankan tes yang sudah ada pada `src/pages/admin/PengaturanKoperasi.test.tsx` untuk memastikan tidak ada regresi.
    - Uji rendering input dan interaksi form.
  </verify>
  <done>Kotak modifikasi ambang batas sisa THP aktif dan interaktif di menu Pengaturan.</done>
</task>


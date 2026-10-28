---
phase: 20
plan: 1
wave: 1
gap_closure: false
---

# Plan 20.1: Manajemen Profil Koperasi & Konfigurasi Header Struk POS

## Objective
Membangun modul manajemen profil koperasi di dashboard admin dan mengintegrasikan profil dinamis ke seluruh output struk POS (modal tampilan thermal, download PDF, dan WhatsApp). Memperbaiki layout bug penumpukan teks pada header PDF dan tampilan struk kasir saat alamat panjang.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md
- src/App.tsx
- src/components/layout/Sidebar.tsx
- src/components/pos/ReceiptModal.tsx
- src/pages/pos/index.tsx
- src/utils/receiptPdfGenerator.ts
- src/services/koperasiService.ts
- src/context/FeedbackContext.tsx

## Tasks

<task type="auto">
  <name>Create Profile Settings Table Migration and Settings Service</name>
  <files>
    supabase/migrations/017_create_app_settings.sql
    src/services/settingsService.ts
    src/services/settingsService.test.ts
  </files>
  <action>
    1. Buat file migrasi `supabase/migrations/017_create_app_settings.sql`:
       - Buat tabel `koperasi_profile` dengan kolom:
         `id int PRIMARY KEY DEFAULT 1`,
         `nama_koperasi text NOT NULL`,
         `alamat text NOT NULL`,
         `telepon text`,
         `terminal_name text DEFAULT 'POS Terminal #01'`,
         `footer_notes text`,
         `updated_at timestamptz DEFAULT now()`.
       - Tambahkan constraint `CONSTRAINT single_row_check CHECK (id = 1)`.
       - Masukkan nilai awal (*initial seed*):
         nama: 'KOPERASI KONSUMEN SEJAHTERA MANDIRI',
         alamat: 'Gedung Pusat SIMKOP, Jl. Merdeka No. 45 Jakarta',
         telepon: '(021) 555-0199',
         terminal: 'POS Terminal #01',
         footer: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan'.
       - Aktifkan RLS dengan SELECT policy untuk public/authenticated dan write/update policy khusus role admin (`pengelola.role = 'admin'`).
    2. Buat service `src/services/settingsService.ts`:
       - Definisikan tipe `KoperasiProfile`.
       - Konstanta default `DEFAULT_KOPERASI_PROFILE` sebagai fallback saat offline atau database belum bermigrasi.
       - Fungsi `getKoperasiProfile(): Promise<KoperasiProfile>` dengan caching in-memory.
       - Fungsi `updateKoperasiProfile(profile: Partial<KoperasiProfile>): Promise<{ success: boolean; data?: KoperasiProfile; error?: string }>`.
    3. Buat unit test `src/services/settingsService.test.ts` untuk menguji pemanggilan service, fallback default, dan update profile.
  </action>
  <verify>
    npm run test
  </verify>
  <done>
    Skema database dan settings service siap dengan fallback tangguh dan test passing.
  </done>
</task>

<task type="auto">
  <name>Build PengaturanKoperasi Page & Sidebar Navigation</name>
  <files>
    src/pages/admin/PengaturanKoperasi.tsx
    src/components/layout/Sidebar.tsx
    src/App.tsx
  </files>
  <action>
    1. Buat halaman `src/pages/admin/PengaturanKoperasi.tsx`:
       - Dibungkus dengan `AdminLayout`.
       - Form terstruktur dengan field:
         * Nama Koperasi (`nama_koperasi`)
         * Alamat Kantor / Toko (`alamat`)
         * Nomor Telepon / WA Toko (`telepon`)
         * Nama Terminal POS Kasir (`terminal_name`)
         * Catatan Kaki Struk (`footer_notes`)
       - Komponen Live Preview struk thermal di sisi kanan (atau di bawah pada mobile) yang menampilkan rendering miniatur header dan footer secara realtime saat admin mengetik.
       - Tombol "Simpan Perubahan" yang memanggil `updateKoperasiProfile()` dan menampilkan `showToast("Profil koperasi berhasil diperbarui", "success")`.
    2. Daftarkan menu di `src/components/layout/Sidebar.tsx`:
       - Tambahkan icon `Settings` dari `lucide-react`.
       - Tambahkan item `{ label: 'Pengaturan Koperasi', icon: Settings, href: '/admin/pengaturan', adminOnly: true }` pada grup 'MANAJEMEN & AKSES'.
    3. Daftarkan rute di `src/App.tsx`:
       - Import `PengaturanKoperasi`.
       - Tambahkan `<Route path="/admin/pengaturan" element={<ProtectedRoute requireAdmin={true}><PengaturanKoperasi /></ProtectedRoute>} />`.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Admin dapat mengakses halaman `/admin/pengaturan` melalui sidebar dan menyimpan perubahan profil koperasi.
  </done>
</task>

<task type="auto">
  <name>Bind Profile to POS Receipt & Fix Text Overlapping Bug</name>
  <files>
    src/components/pos/ReceiptModal.tsx
    src/pages/pos/index.tsx
    src/utils/receiptPdfGenerator.ts
    src/utils/receiptPdfGenerator.test.ts
  </files>
  <action>
    1. Perbaiki kalkulasi layout multiline di `src/utils/receiptPdfGenerator.ts`:
       - Tambahkan properti `profile?: KoperasiProfile` pada `ReceiptTransactionData`.
       - Gunakan nilai dari `profile` (atau fallback default).
       - Untuk nama koperasi, alamat, dan footer notes: gunakan `doc.splitTextToSize(text, printWidth)` untuk memecah teks panjang menjadi array string.
       - Render setiap baris dengan loop dan tambahkan koordinat `y` secara proporsional sesuai jumlah baris sebenarnya (menghilangkan bug penumpukan teks alamat dan telepon).
       - Perbarui footer PDF agar mengambil `profile.footer_notes`.
    2. Perbaiki layout thermal di `src/components/pos/ReceiptModal.tsx`:
       - Muat data profil koperasi via `getKoperasiProfile()` (atau terima prop `profile`).
       - Gunakan flex container vertikal (`flex flex-col items-center gap-1`) dengan pembagian blok alamat dan telepon/terminal terpisah, menggunakan `leading-normal` dan `break-words`.
       - Perbarui template WhatsApp (`handleWA`) agar menyertakan nama koperasi dan kontak dari profil aktif.
       - Teruskan `profile` ke pemanggilan `generateReceiptPdf`.
    3. Perbarui `src/pages/pos/index.tsx` jika diperlukan agar meneruskan state profil yang sudah dimuat ke `ReceiptModal`.
    4. Perbarui `src/utils/receiptPdfGenerator.test.ts` untuk memastikan pengujian dengan profil kustom (alamat panjang multiline) berjalan mulus tanpa error.
  </action>
  <verify>
    npm run test
  </verify>
  <done>
    Output struk POS (modal thermal, PDF, WA) menggunakan data profil dinamis dan bebas dari bug layout teks menabrak.
  </done>
</task>

<task type="auto">
  <name>Build and Static Integrity Check</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan `npm run build` untuk memverifikasi type check dan Vite bundler.
    2. Jalankan `npm run test` untuk memastikan semua test suite berjalan hijau.
  </action>
  <verify>
    npm run test && npm run build
  </verify>
  <done>
    Build exit 0 dan semua test lulus 100%.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Tersedia migrasi SQL `017_create_app_settings.sql` dengan constraint single row dan RLS.
- [ ] Admin dapat mengubah nama, alamat, telp, terminal, dan footer di `/admin/pengaturan`.
- [ ] Live preview mini struk merespons ketikan form pengaturan secara real-time.
- [ ] Tampilan struk kasir, PDF download, dan WhatsApp sharing menggunakan data profil koperasi yang disimpan di database.
- [ ] Bug teks menabrak/tumpang tindih pada alamat & telepon struk thermal/PDF teratasi sepenuhnya.
- [ ] `npm run build` dan `npm run test` lolos tanpa error.


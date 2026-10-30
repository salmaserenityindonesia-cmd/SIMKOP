---
phase: 30
plan: 3
wave: 3
gap_closure: false
---

# Plan 30.3: Wave 3 - Build Edit Invoice Modal & Audit History Viewer in ManajemenPembelian.tsx

## Objective
Memperbarui antarmuka pengguna pada halaman `src/pages/admin/ManajemenPembelian.tsx` dengan menambahkan:
1. Pengecekan role pengguna yang sedang aktif (hanya admin yang dapat mengedit faktur).
2. Tombol aksi Edit Faktur pada tabel riwayat pembelian.
3. Modal Edit Faktur interaktif yang memungkinkan perubahan nomor faktur, tanggal, kuantitas, dan harga beli per item, disertai kolom wajib alasan perubahan minimal 10 karakter.
4. Tampilan riwayat audit trail (waktu, pelaku, dan alasan perubahan) pada modal detail faktur.

## Context
Load these files for context:
- src/pages/admin/ManajemenPembelian.tsx
- src/services/purchaseService.ts
- src/components/layout/AdminLayout.tsx
- src/context/FeedbackContext.tsx

## Tasks

<task type="auto">
  <name>Build Edit Invoice Modal and Audit Trail in ManajemenPembelian.tsx</name>
  <files>
    src/pages/admin/ManajemenPembelian.tsx
  </files>
  <action>
    1. Modifikasi `src/pages/admin/ManajemenPembelian.tsx`:
       - Import icon `Edit3` dari `lucide-react` (atau padankan dengan tombol aksi tabel yang ada).
       - Import `updatePurchaseInvoice`, `getPurchaseAuditLogs`, dan tipe `PurchaseAuditLog` dari `../../services/purchaseService`.
       - Tambahkan state pengguna aktif:
         `const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);`
         dan inisialisasi pada `useEffect` dari Supabase auth & tabel pengelola.
       - Tambahkan state untuk modal edit faktur:
         * `isEditModalOpen`: boolean
         * `editingFaktur`: FakturPembelian | null
         * `editNoFaktur`: string
         * `editTanggal`: string
         * `editItems`: array item yang dapat diubah kuantitas dan harga belinya
         * `changeReason`: string (alasan koreksi)
         * `isSavingEdit`: boolean
       - Tambahkan state riwayat audit pada modal detail:
         * `auditLogs`: PurchaseAuditLog[]
         * `isLoadingAudit`: boolean
       - Pada tabel riwayat faktur (kolom Aksi):
         * Tambahkan tombol Edit (ikon `Edit3`) di samping tombol Detail (ikon mata).
         * Tombol Edit hanya muncul atau aktif jika `currentUser?.role === 'admin'`. Jika operator, tombol disembunyikan atau disabled dengan tooltip "Hanya admin yang dapat mengedit faktur".
       - Buat Modal Edit Faktur (`isEditModalOpen`):
         * Header: "Edit Faktur Pembelian: {editingFaktur.noFaktur}".
         * Input No. Faktur dan Tanggal Faktur.
         * Tabel rincian barang: admin dapat mengubah `Qty` dan `Harga Beli Satuan`. Subtotal otomatis terhitung ulang secara real-time.
         * Textarea wajib: **"Alasan Perubahan / Koreksi (Wajib diisi)"** dengan placeholder: "Jelaskan alasan perubahan faktur (misal: koreksi salah input kuantitas barang dari supplier)..." beserta counter karakter (misal: "Minimal 10 karakter - saat ini: X karakter").
         * Validasi tombol "Simpan Perubahan": tombol disabled jika `changeReason.trim().length < 10` atau sedang proses submit.
         * Handler submit memanggil `updatePurchaseInvoice(...)`:
           - Jika sukses: tampilkan notifikasi toast sukses "Faktur pembelian dan stok berhasil diperbarui", tutup modal, dan muat ulang data faktur serta produk.
           - Jika gagal (misal: stok produk tidak mencukupi untuk dikurangi): tampilkan toast error dengan pesan deskriptif.
       - Pada Modal Detail Faktur (`selectedFaktur`):
         * Saat `selectedFaktur` dibuka, otomatis panggil `getPurchaseAuditLogs(selectedFaktur.id)`.
         * Tambahkan seksi / panel di bawah tabel barang: **"Riwayat Perubahan (Audit Trail)"**.
         * Jika belum ada perubahan, tampilkan keterangan: "Belum ada riwayat koreksi pada faktur ini."
         * Jika ada riwayat, tampilkan daftar timeline berisi: tanggal & jam perubahan, nama pengubah (`performer_name`), dan teks alasan koreksi (`notes`).
  </action>
  <verify>
    - Buka halaman Manajemen Pembelian: tombol Edit Faktur tampil untuk role admin.
    - Klik Edit Faktur: form menampilkan rincian barang dan textarea alasan.
    - Tombol simpan hanya aktif setelah alasan terisi >= 10 karakter.
    - Simpan perubahan berhasil memperbarui data faktur dan stok.
    - Buka modal detail faktur: riwayat audit menampilkan log perubahan yang baru saja dilakukan.
  </verify>
  <done>
    Fitur Edit Faktur Pembelian dengan verifikasi alasan dan tampilan audit trail terintegrasi penuh di UI.
  </done>
</task>

## Success Criteria
- [ ] Tombol Edit Faktur tersedia di kolom Aksi tabel riwayat faktur bagi role admin.
- [ ] Modal Edit memfasilitasi koreksi No. Faktur, Tanggal, Qty, dan Harga Beli item.
- [ ] Input alasan perubahan bersifat wajib (min. 10 karakter) sebelum tombol simpan dapat ditekan.
- [ ] Modal Detail Faktur memuat seksi Riwayat Perubahan (Audit Trail) dengan informasi waktu, operator/admin, dan catatan koreksi.


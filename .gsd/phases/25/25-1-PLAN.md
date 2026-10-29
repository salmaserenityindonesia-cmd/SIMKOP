---
phase: 25
plan: 1
wave: 1
gap_closure: false
---

# Plan 25.1: Wave 1 - Quick Payment Buttons Guard & Non-Member Mode Sync

## Objective
Membatasi tombol metode pembayaran cepat pada panel ringkasan POS (`SummaryPanel.tsx`) agar transaksi Non-Anggota hanya dapat memilih metode Tunai:
1. Menambahkan state protection saat tab "Non-Anggota" aktif (`!isMemberMode` atau `selectedMember === null`).
2. Menonaktifkan tombol **Potong Simpanan** dan **Bon Toko** dengan atribut `disabled` dan styling visual jelas (disabled, cursor-not-allowed, opacity berkurang, badge "Khusus Anggota").
3. Mereset otomatis pilihan `paymentType` ke "Tunai" jika kasir beralih dari mode Anggota ke Non-Anggota.
4. Memastikan interaksi tombol **Tunai** tetap responsif dan lancar untuk kasir.

## Context
Load these files for context:
- src/components/pos/SummaryPanel.tsx
- src/pages/pos/index.tsx

## Tasks

<task type="auto">
  <name>Lock Non-Cash Quick Payment Buttons for Non-Members in SummaryPanel</name>
  <files>
    src/components/pos/SummaryPanel.tsx
  </files>
  <action>
    1. Di `src/components/pos/SummaryPanel.tsx`:
       - Cek kondisi `isNonMember = !isMemberMode || !selectedMember`.
       - Pada fungsi `handleSetMemberMode`:
         * Saat beralih ke Non-Anggota (`mode === false`), otomatis set `setPaymentType('Tunai')`.
       - Pada render tombol "Metode Pembayaran Cepat":
         * Untuk tombol non-tunai ('Potong Simpanan' dan 'Bon Toko'):
           - Pasang `disabled={isNonMember}`.
           - Jika `isNonMember`, terapkan class Tailwind: `opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 pointer-events-none`.
           - Tambahkan badge penanda kecil atau subtext "Khusus Anggota" di bawah judul tombol.
         * Untuk tombol 'Tunai':
           - Tetap aktif, interaktif, dan dapat dipilih.
       - Pada tombol utama "Bayar Transaksi":
         * Pastikan jika `isNonMember`, parameter yang diteruskan ke `onPay(...)` selalu dipaksa 'Tunai' jika `paymentType !== 'Tunai'`.
  </action>
  <verify>
    Saat tab "Non-Anggota" dipilih, tombol "Potong Simpanan" dan "Bon Toko" terkunci (disabled) secara visual dan fungsional, dan hanya tombol "Tunai" yang aktif.
  </verify>
  <done>
    Panel kasir aman dari pemilihan cepat metode kredit atau simpanan untuk pembeli umum/non-anggota.
  </done>
</task>

<task type="auto">
  <name>Verify POS Page Integration & Props Passing</name>
  <files>
    src/pages/pos/index.tsx
  </files>
  <action>
    1. Periksa `src/pages/pos/index.tsx`:
       - Pastikan state `selectedMember` dan `initialPaymentMethod` disinkronkan saat kasir memicu pembayaran atau berpindah transaksi.
       - Pastikan shortcut F9 atau klik tombol bayar tidak mengirimkan method selain 'Tunai' ke modal jika `selectedMember` bernilai `null`.
  </action>
  <verify>
    Klik tombol bayar pada mode non-anggota membuka modal dengan default metode Tunai.
  </verify>
  <done>
    Sinkronisasi state halaman POS dan SummaryPanel konsisten untuk transaksi Non-Anggota.
  </done>
</task>

## Success Criteria
- [ ] Tombol Potong Simpanan dan Bon Toko disabled saat mode Non-Anggota aktif di SummaryPanel.
- [ ] Label / badge "Khusus Anggota" tampil jelas pada tombol yang dinonaktifkan.
- [ ] Beralih dari Anggota ke Non-Anggota otomatis mereset pilihan pembayaran ke Tunai.
- [ ] Transaksi non-anggota hanya dapat melanjutkan ke pembayaran Tunai.


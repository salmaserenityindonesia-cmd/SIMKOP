---
phase: 25
plan: 2
wave: 2
gap_closure: false
---

# Plan 25.2: Wave 2 - Split Payment Modal Restriction for Non-Members

## Objective
Mengunci seluruh field non-tunai di Modal Pembayaran / Split Payment (`SplitPaymentModal.tsx`) saat pembeli berstatus Non-Anggota:
1. Menyembunyikan atau menonaktifkan kartu saldo/limit bon anggota dan menampilkan banner status pembeli umum.
2. Mengunci field input "Potong Simpanan Belanja" dan "Catat Bon Toko (Potong Gaji)" menjadi disabled / readonly dengan nilai tetap 0 (atau disembunyikan dengan penjelasan tegas).
3. Mengarahkan kursor dan fokus input secara otomatis ke "Tunai Diterima" dengan nilai awal sama dengan Total Tagihan (`total`).
4. Memblokir pemilihan skema non-tunai jika `memberId` tidak tersedia.

## Context
Load these files for context:
- src/components/pos/SplitPaymentModal.tsx
- src/components/pos/MemberCreditBadge.tsx
- src/pages/pos/index.tsx

## Tasks

<task type="auto">
  <name>Lock Non-Cash Inputs and Auto-Focus Cash in SplitPaymentModal</name>
  <files>
    src/components/pos/SplitPaymentModal.tsx
  </files>
  <action>
    1. Di `src/components/pos/SplitPaymentModal.tsx`:
       - Buat helper boolean `const isNonMember = !memberId;`.
       - Saat modal terbuka (`useEffect` on `isOpen`):
         * Jika `isNonMember`:
           - Paksa `paidDeposit` = `''` (atau 0).
           - Paksa `paidCredit` = `''` (atau 0).
           - Set default `paidCash` = `total.toString()`.
       - Pada render kartu identitas/kredit:
         * Jika `memberId` ada: render `<MemberCreditBadge />` seperti biasa.
         * Jika `!memberId` (Non-Anggota): render banner info visual dengan badge "Khusus Tunai", peringatan ramah bahwa Non-Anggota tidak memiliki saldo simpanan atau limit kredit koperasi.
       - Pada bagian formulir input:
         * Input Potong Simpanan:
           - Jika `isNonMember`: render input dengan `disabled`, `readOnly`, value 0, dan keterangan "Tidak Tersedia untuk Non-Anggota".
         * Input Bon Toko (Potong Gaji):
           - Jika `isNonMember`: render input dengan `disabled`, `readOnly`, value 0, dan keterangan "Tidak Tersedia untuk Non-Anggota".
         * Input Tunai Diterima:
           - Berikan `autoFocus` dan ref untuk auto-select / focus saat modal terbuka.
           - Sediakan quick cash buttons (Uang Pas, Rp 50.000, Rp 100.000, dll).
       - Pada fungsi `handleConfirm`:
         * Jika `isNonMember` dan ada nilai `depositAmount > 0` atau `creditAmount > 0`, batalkan submit dan tampilkan pesan error: "Pembeli Non-Anggota hanya diperbolehkan menggunakan metode Tunai".
         * Paksa `scheme = 'cash'` untuk non-anggota.
  </action>
  <verify>
    Buka modal F9 saat tab Non-Anggota aktif: input simpanan dan bon terkunci di angka 0 dan tidak dapat diedit kasir, nilai tunai default terisi sesuai total, dan auto-focus berada di input tunai.
  </verify>
  <done>
    Modal Split Payment sepenuhnya mematuhi aturan pembatasan pembayaran khusus tunai bagi Non-Anggota.
  </done>
</task>

## Success Criteria
- [ ] Modal F9 / Split Payment mengunci input Potong Simpanan dan Bon Toko saat transaksi non-anggota.
- [ ] Banner visual mengindikasikan status Pembeli Umum (Khusus Tunai).
- [ ] Input Tunai Diterima terisi nilai default total tagihan dan menerima auto-focus.
- [ ] Konfirmasi transaksi non-anggota selalu menghasilkan skema 'cash'.


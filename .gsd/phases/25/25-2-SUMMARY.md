# Summary: Plan 25.2 - Wave 2: Split Payment Modal Restriction for Non-Members

## Objective
Mengunci seluruh field non-tunai di Modal Pembayaran / Split Payment (`SplitPaymentModal.tsx`) saat pembeli berstatus Non-Anggota:
1. Menyembunyikan kartu kredit anggota dan menampilkan banner status pembeli umum dengan indikator "Khusus Tunai".
2. Mengunci input "Potong Simpanan Belanja" dan "Catat Bon Toko (Potong Gaji)" menjadi disabled / readOnly dengan nilai tetap 0 dan keterangan "Tidak Tersedia untuk Non-Anggota".
3. Mengarahkan kursor dan auto-focus ke input "Tunai Diterima" dengan nilai awal sama dengan total tagihan serta tombol cepat tunai (Uang Pas, 50k, 100k, 200k).
4. Memvalidasi dan memastikan skema non-tunai dicegah, serta selalu memaksakan skema `'cash'` untuk Non-Anggota saat konfirmasi.

## Completed Tasks
| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| Task 1 | Lock Non-Cash Inputs and Auto-Focus Cash in SplitPaymentModal | Completed | `aa6a471e` |

## Key Changes
- `src/components/pos/SplitPaymentModal.tsx`:
  * Ditambahkan deteksi pembeli umum: `const isNonMember = !memberId;`.
  * Saat modal terbuka, jika non-anggota, nilai `paidCash` langsung diisi dengan `total.toString()`, sedangkan simpanan dan bon dikosongkan.
  * Kartu saldo anggota diganti dengan banner peringatan visual informatif "Pembeli Non-Anggota / Umum" berbadge "Khusus Tunai".
  * Input Potong Simpanan dan Bon Toko diberi atribut `disabled`, `readOnly`, value 0, badge "Khusus Anggota", dan catatan kaki "* Tidak tersedia untuk Non-Anggota".
  * Input Tunai Diterima diberi ref & auto-focus / select otomatis saat modal dibuka, dilengkapi badge "Wajib Tunai" dan tombol quick cash denominasi umum.
  * `handleConfirm` memblokir pengajuan transaksi jika ada nilai non-tunai untuk non-anggota dan secara ketat memaksakan `scheme = 'cash'`.
  * Ditambahkan event handler Enter key untuk konfirmasi cepat jika pembayaran sudah pas/lebih.

## Verification
- `npm run build`: Berhasil tanpa error TypeScript (`vite build` exit code 0).
- `npm run test`: Seluruh 46 unit test lolos tanpa kegagalan (8 test suites passed).

## Deviations
None.

## Next Steps
- Eksekusi Plan 25.3 (`25-3-PLAN.md` - Wave 3: Backend & Checkout Service Integrity Guard).

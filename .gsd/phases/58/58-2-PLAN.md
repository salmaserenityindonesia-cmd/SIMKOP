---
phase: 58
plan: 2
wave: 2
depends_on: [1]
gap_closure: false
---

# Plan 58.2: Interactive Audit & Evidence Modal UI and Compliance Matrix Tooltip

## Objective
Mengintegrasikan popover/dialog pencatatan bukti setoran (nomor referensi kwitansi, metode pembayaran, catatan) saat mencentang sel, dialog konfirmasi pembatalan centang dengan input wajib alasan, penampil riwayat audit kronologis per sel di `SavingsLedgerMatrixModal.tsx`, serta menampilkan nomor bukti/referensi pada tooltip hover di `ComplianceMatrix.tsx`.

## Context
- `src/components/compliance/SavingsLedgerMatrixModal.tsx`
- `src/components/compliance/SavingsLedgerMatrixModal.test.tsx`
- `src/services/complianceService.ts`
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/pages/admin/ComplianceMatrix.test.tsx`
- `.gsd/phases/58/58-1-PLAN.md`

## Tasks

<task type="auto">
  <name>Implement Evidence Input Popover, Uncheck Confirmation Modal & Audit History Viewer in SavingsLedgerMatrixModal</name>
  <files>
    src/components/compliance/SavingsLedgerMatrixModal.tsx
    src/components/compliance/SavingsLedgerMatrixModal.test.tsx
  </files>
  <action>
    1. Buka `src/components/compliance/SavingsLedgerMatrixModal.tsx`:
       - State Manajemen:
         - `evidenceModalOpen: boolean` & `selectedCellForEvidence: { year: number; month: number; label: string; rate: number } | null`
         - `uncheckModalOpen: boolean` & `selectedCellForUncheck: { year: number; month: number; label: string } | null` & `uncheckReason: string`
         - `historyModalOpen: boolean` & `selectedCellForHistory: { year: number; month: number; label: string } | null` & `auditHistory: MonthAuditHistoryItem[]` & `loadingHistory: boolean`
       - Form input bukti setoran:
         - Nominal setoran (default: tarif periode, bisa disesuaikan jika bayar sebagian/parsial).
         - Nomor Kwitansi/Bukti Referensi (misal `KW-2026/11/01`).
         - Pilihan Metode Pembayaran (`tunai`, `potong_gaji`, `transfer`).
         - Catatan Tambahan (opsional).
       - Logika klik sel bulan:
         - Jika sel belum tercentang: buka dialog input bukti setoran (mengisi default tarif dan nomor kwitansi).
         - Saat form bukti disubmit: panggil `saveMonthDepositWithEvidence(...)`, perbarui state `checkedMonths`, `currentMonthAmounts`, dan metadata sel.
         - Jika sel sudah tercentang: buka dialog konfirmasi uncheck, minta input "Alasan Pembatalan" (wajib).
         - Saat uncheck dikonfirmasi: panggil `cancelMonthDepositWithReason(...)`, hapus dari `checkedMonths`, dan perbarui state.
       - Tampilkan tombol ikon kecil (misal ikon file-text atau info) pada tiap sel yang tercentang/memiliki histori:
         - Klik ikon membuka Popover/Modal "Riwayat Audit & Bukti Setoran": menampilkan kronologi lengkap pencatatan (waktu, admin, nomor bukti, metode bayar, catatan) serta histori penghapusan jika pernah dibatalkan.
       - Perbarui `SavingsLedgerMatrixModal.test.tsx` untuk menguji alur input bukti setoran, pembatalan dengan alasan, dan penampil riwayat audit.
  </action>
  <verify>
    npx vitest run src/components/compliance/SavingsLedgerMatrixModal.test.tsx
  </verify>
  <done>
    Modal Buku Besar Simpanan kini memiliki dialog bukti setoran, pembatalan akuntabel, dan drawer riwayat audit.
  </done>
</task>

<task type="auto">
  <name>Expose Reference Evidence in ComplianceService and Display in ComplianceMatrix Tooltip</name>
  <files>
    src/services/complianceService.ts
    src/pages/admin/ComplianceMatrix.tsx
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/services/complianceService.ts`:
       - Pada pemanggilan `fetchAllPaged('deposit_transactions', ...)`, pastikan kolom `reference_no` dan `notes` disertakan.
       - Sertakan properti `reference_no` dan `notes` pada objek detail bulanan matriks (`wajibItem`, `belanjaItem`, `lebaranItem`).
    2. Buka `src/pages/admin/ComplianceMatrix.tsx`:
       - Pada tooltip hover sel bulan (`Tooltip Hover Detail`):
         - Jika `wajibItem.reference_no`, `belanjaItem.reference_no`, atau `lebaranItem.reference_no` tersedia, tampilkan baris informasi:
           `Bukti: [Nomor Kwitansi]` dan catatan jika ada dengan badge/teks kontras yang rapi.
    3. Perbarui `ComplianceMatrix.test.tsx` untuk memastikan render tooltip memuat nomor referensi kwitansi dengan benar.
  </action>
  <verify>
    npx vitest run src/pages/admin/ComplianceMatrix.test.tsx
  </verify>
  <done>
    Matriks Simpanan Tahunan menampilkan nomor bukti setoran pada hover sel bulan.
  </done>
</task>

## Success Criteria
- [ ] Dialog input bukti setoran (nominal, kwitansi, metode, catatan) muncul saat mencentang sel bulan.
- [ ] Dialog konfirmasi uncheck meminta alasan pembatalan dan mencatatnya ke audit trail.
- [ ] Drawer/popover riwayat audit per sel menampilkan jejak kronologis lengkap.
- [ ] Tooltip di `ComplianceMatrix.tsx` menampilkan nomor referensi kwitansi dan catatan.
- [ ] Unit tests di `SavingsLedgerMatrixModal.test.tsx` dan `ComplianceMatrix.test.tsx` lulus 100%.


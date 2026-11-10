---
phase: 75
plan: 3
wave: 3
gap_closure: false
---

# Plan 75.3: Connect Generator to Repayment Modal & Service Layer

## Objective
Mengintegrasikan utilitas generator kwitansi standar `generateLoanReceiptNumber` ke dalam modal bukti pelunasan angsuran (`LoanScheduleModal.tsx`) dan lapisan service pinjaman (`loanMatrixService.ts` dan `loanScheduleService.ts`). Saat pengguna membuka modal pelunasan atau setoran cicilan, nomor kwitansi otomatis terisi dengan format anti-bentrok. Ketika disimpan, nilai nomor kwitansi ini diteruskan ke database Supabase pada field `receipt_number` tabel `loan_repayments`. Selain itu, riwayat pembayaran pada sub-modal menampilkan nomor kwitansi jika tersedia.

## Context
Load these files for context:
- `src/components/loans/LoanScheduleModal.tsx`
- `src/services/loanMatrixService.ts`
- `src/services/loanScheduleService.ts`
- `src/utils/receiptGenerator.ts`

## Tasks

<task type="auto">
  <name>Integrate Receipt Generator in LoanScheduleModal</name>
  <files>
    src/components/loans/LoanScheduleModal.tsx
  </files>
  <action>
    1. Buka `src/components/loans/LoanScheduleModal.tsx`:
       - Import `generateLoanReceiptNumber` dari `../../utils/receiptGenerator`.
       - Pada inisialisasi state `evidenceReceiptNo`:
         ```typescript
         const [evidenceReceiptNo, setEvidenceReceiptNo] = useState(
           initialEvidencePeriod
             ? generateLoanReceiptNumber(data?.loanNumber, initialEvidencePeriod.periodNumber)
             : ''
         );
         ```
       - Pada `handleTogglePeriod(period: LoanGridPeriod)`:
         Ganti hardcoded prefix:
         ```typescript
         setEvidenceReceiptNo(`KW-PINJ/${data?.loanNumber || '01'}/B${period.periodNumber}`);
         ```
         dengan:
         ```typescript
         setEvidenceReceiptNo(generateLoanReceiptNumber(data?.loanNumber, period.periodNumber));
         ```
       - Pada Sub-Modal 3 (Riwayat Pembayaran & Kwitansi):
         Tampilkan nomor kwitansi jika ada pada item mutasi (`rep.receiptNumber || rep.notes`).
  </action>
  <verify>
    Periksa bahwa modal `LoanScheduleModal.tsx` memanggil `generateLoanReceiptNumber` tanpa error TypeScript.
  </verify>
  <done>
    Modal bukti pelunasan otomatis mengisi format `KW-PINJ/.../B{period}/{YYYYMMDD}-{RAND3}` setiap kali dibuka.
  </done>
</task>

<task type="auto">
  <name>Update Service Layer to Store and Fetch receipt_number</name>
  <files>
    src/services/loanMatrixService.ts
    src/services/loanScheduleService.ts
    src/services/loanMatrixService.test.ts
    src/components/loans/LoanScheduleModal.test.tsx
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.ts`:
       - Pada interface `LoanInteractiveGridPeriod.repayments`:
         Tambahkan `receiptNumber?: string | null;`
       - Pada pemetaan `schedRepayments`:
         Tambahkan `receiptNumber: r.receipt_number || null,`
       - Pada fungsi `toggleLoanSchedulePaid`:
         Di blok insert `loan_repayments`:
         ```typescript
         const { error: repayErr } = await supabase.from('loan_repayments').insert({
           loan_id: loanId,
           schedule_id: scheduleId,
           amount_paid: payAmount,
           payment_date: new Date().toISOString(),
           payment_method: payload?.paymentMethod || 'transfer',
           notes: notesDetail,
           receipt_number: payload?.receiptNo?.trim() || undefined
         });
         ```
    2. Buka `src/services/loanScheduleService.ts`:
       - Pastikan fungsi `paySchedule` meneruskan parameter `receiptNumber?: string` ke `loanService.paySchedule` jika relevan.
    3. Perbarui unit test `src/services/loanMatrixService.test.ts` dan `src/components/loans/LoanScheduleModal.test.tsx`:
       - Pastikan mock Supabase `insert` pada tabel `loan_repayments` memverifikasi keberadaan field `receipt_number`.
  </action>
  <verify>
    npx vitest run src/services/loanMatrixService.test.ts src/components/loans/LoanScheduleModal.test.tsx
  </verify>
  <done>
    Service layer menyimpan dan mengambil `receipt_number` ke tabel `loan_repayments`, dan seluruh pengujian terkait lulus.
  </done>
</task>

## Success Criteria
- [ ] `LoanScheduleModal.tsx` menggunakan `generateLoanReceiptNumber` saat membuka form pelunasan.
- [ ] `loanMatrixService.ts` menyimpan payload `receipt_number` ke `loan_repayments`.
- [ ] Pengujian di `LoanScheduleModal.test.tsx` dan `loanMatrixService.test.ts` berhasil dijalankan tanpa error.

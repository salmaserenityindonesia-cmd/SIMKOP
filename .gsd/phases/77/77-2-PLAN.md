---
phase: 77
plan: 2
wave: 2
gap_closure: false
---

# Plan 77.2: Render Multi-Loan Rows and Update Statistics in UI & Modal

## Objective
Memperbarui representasi UI pada `src/pages/admin/LoanMatrix.tsx` agar setiap baris pinjaman aktif ditampilkan dengan identitas lengkap (nama anggota, NRP, badge jenis pinjaman & tenor, serta nomor pinjaman). Mengintegrasikan tombol aksi buku bantu ke masing-masing `loanId` yang spesifik, serta memastikan kartu ringkasan KPI dan fitur ekspor Excel mencerminkan seluruh pinjaman berjalan.

## Context
Load these files for context:
- `src/pages/admin/LoanMatrix.tsx`
- `src/components/loans/LoanScheduleModal.tsx`
- `src/pages/admin/LoanMatrix.test.tsx`

## Tasks

<task type="auto">
  <name>Render Distinct Rows per Loan and Update Table Action in LoanMatrix</name>
  <files>
    src/pages/admin/LoanMatrix.tsx
  </files>
  <action>
    1. Di `src/pages/admin/LoanMatrix.tsx`:
       - Perbarui mapping baris tabel matriks (`tbody`):
         - Gunakan key unik: `row.id || row.loanId || `${row.memberId}-${row.loanNumber}``
         - Pada kolom **ANGGOTA**:
           ```tsx
           <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
             <div className="font-semibold text-slate-800">{row.anggota?.nama || row.nama}</div>
             <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
               <span>NRP: {row.anggota?.nrp || row.nrp}</span>
               <span>•</span>
               <span className="font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px]">
                 {row.loan_types?.name || row.loanTypeName || 'Pinjaman'} ({row.agreedTenorMonths || row.agreed_tenor_months || row.tenor} Bln)
               </span>
               {row.isLoanActive ? (
                 <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium">Aktif</span>
               ) : (
                 <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full text-[10px] font-medium">Selesai</span>
               )}
             </div>
             {(row.loan_number || row.loanNumber) && (
               <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                 {row.loan_number || row.loanNumber}
               </div>
             )}
           </td>
           ```
         - Pada kolom **AKSI** (tombol mata / buku bantu):
           - Ambil `targetLoanId = row.loanId || row.id || Object.values(row.months).find(m => m.loanId)?.loanId`.
           - Panggil `setSelectedLoan({ loanId: targetLoanId, nrp: row.nrp, nama: row.nama })` sehingga modal buku bantu membuka jadwal pinjaman yang tepat untuk baris tersebut.
       - Perbarui ekspor Excel (`handleExportExcel`):
         - Tambahkan kolom header 'No. Pinjaman' dan 'Jenis Pinjaman'.
         - Isi data per baris pinjaman agar laporan Excel mencatat seluruh pinjaman secara terpisah.
       - Perbarui teks keterangan footer pagination:
         - Ubah "dari X anggota" menjadi "dari X pinjaman (X anggota unik)" atau "dari X pinjaman aktif" agar representasi baris akurat.
  </action>
  <verify>
    Jalankan pemeriksaan komponen dan test di `src/pages/admin/LoanMatrix.test.tsx` untuk memastikan baris pinjaman ter-render dengan benar.
  </verify>
  <done>
    Halaman `/admin/loan-matrix` menampilkan setiap pinjaman aktif dalam baris tersendiri dengan identitas jenis pinjaman, nomor pinjaman, dan tombol buku bantu yang presisi.
  </done>
</task>

<task type="auto">
  <name>Ensure Interactive Grid Modal Support and UI Unit Testing</name>
  <files>
    src/components/loans/LoanScheduleModal.tsx
    src/pages/admin/LoanMatrix.test.tsx
  </files>
  <action>
    1. Di `src/components/loans/LoanScheduleModal.tsx`:
       - Pastikan header modal menampilkan nomor pinjaman dan tenor pinjaman yang sedang ditinjau dengan jelas (`data?.loanNumber`, `data?.tenor`, `data?.disbursedAt`).
       - Pastikan aksi cepat (Centang Semua, Rekonsiliasi Saldo, Batal Centang) hanya memengaruhi pinjaman spesifik (`loanId`) yang sedang aktif dibuka di modal.
    2. Di `src/pages/admin/LoanMatrix.test.tsx`:
       - Tambahkan unit test yang menguji rendering matriks saat anggota memiliki lebih dari 1 pinjaman aktif:
         - Verifikasi bahwa 2 baris terpisah dirender untuk anggota dengan 2 pinjaman.
         - Verifikasi bahwa kedua baris menampilkan label jenis pinjaman dan tenor masing-masing.
         - Verifikasi bahwa tombol buku bantu pada masing-masing baris memanggil modal dengan `loanId` yang sesuai.
  </action>
  <verify>
    Jalankan `npx vitest run src/pages/admin/LoanMatrix.test.tsx` dan pastikan seluruh test kasus UI lulus 100%.
  </verify>
  <done>
    UI Matriks Pinjaman dan Modal Buku Bantu terintegrasi dengan mulus untuk multi-pinjaman per anggota.
  </done>
</task>

## Success Criteria
- [ ] Anggota dengan multi-pinjaman ditampilkan dalam beberapa baris terpisah yang jelas dan rapi.
- [ ] Setiap baris menampilkan jenis pinjaman, tenor, dan nomor pinjaman.
- [ ] Mengklik tombol mata pada salah satu baris membuka buku bantu pinjaman spesifik tersebut.
- [ ] Ekspor Excel menghasilkan rincian per pinjaman secara akurat.
- [ ] Seluruh unit test UI pada `LoanMatrix.test.tsx` lulus.

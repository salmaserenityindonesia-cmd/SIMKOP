---
phase: 66
plan: 1
wave: 1
gap_closure: false
---

# Plan 66.1: Dynamic THP Deficit Validation & Resilient Member THP Data Binding

## Objective
Menghilangkan pesan validasi generik pada form Pengajuan Pinjaman Baru (`src/pages/admin/PengajuanPinjaman.tsx`) dengan menampilkan secara dinamis nilai perkiraan sisa THP akhir (`finalRemainingThp`) dan nilai defisit/kekurangannya terhadap ambang batas Rp 1.500.000 (`shortfall`), menampilkan catatan panduan jika Master THP bernilai Rp 0, serta menjamin ketahanan pemanggilan data THP anggota pada `loanService.getMemberTHP` dengan fallback multi-kolom (`master_thp ?? take_home_pay ?? salary ?? 0`).

## Context
- `src/pages/admin/PengajuanPinjaman.tsx` (antarmuka pengajuan pinjaman dan panel Simulasi & Kelayakan)
- `src/services/loanService.ts` (layanan pengambilan data THP dan validasi pengajuan pinjaman)
- `src/services/loanService.test.ts` (unit test eksisting untuk validasi THP)
- `src/services/salaryImportService.ts` (referensi penamaan kolom THP anggota di tabel `anggota`)

## Tasks

<task type="auto">
  <name>Ensure Resilient Member THP Data Binding & Calculation Helper</name>
  <files>
    src/services/loanService.ts
  </files>
  <action>
    1. Buka `src/services/loanService.ts`:
       - Definisikan dan ekspor konstanta batas ambang minimum THP:
         ```typescript
         export const MIN_REMAINING_THP = 1500000;
         ```
       - Definisikan dan ekspor helper fungsi murni `calculateTHPEligibility`:
         ```typescript
         export interface THPEligibilityResult {
           finalRemainingThp: number;
           isEligible: boolean;
           shortfall: number;
         }

         export const calculateTHPEligibility = (
           remainingThp: number,
           newInstallment: number,
           minThreshold: number = MIN_REMAINING_THP
         ): THPEligibilityResult => {
           const finalRemainingThp = Number(remainingThp || 0) - Number(newInstallment || 0);
           const isEligible = finalRemainingThp >= minThreshold;
           const shortfall = Math.max(0, minThreshold - finalRemainingThp);
           return {
             finalRemainingThp,
             isEligible,
             shortfall
           };
         };
         ```
       - Perbarui metode `loanService.getMemberTHP(memberId: string)`:
         - Kueri data anggota dengan fallback seleksi kolom yang aman:
           ```typescript
           let memberData: any = null;
           const { data: member, error: memberError } = await supabase
             .from('anggota')
             .select('master_thp, take_home_pay')
             .eq('id', memberId)
             .single();

           if (memberError) {
             const { data: fallbackMember, error: fbError } = await supabase
               .from('anggota')
               .select('*')
               .eq('id', memberId)
               .single();
             if (fbError) throw new Error(fbError.message);
             memberData = fallbackMember;
           } else {
             memberData = member;
           }

           const masterThp = Number(memberData?.master_thp ?? memberData?.take_home_pay ?? memberData?.salary ?? 0);
           ```
         - Pastikan kalkulasi pinjaman aktif berjalan normal dan mengembalikan:
           ```typescript
           return { master_thp: masterThp, active_installments: activeInstallments, remaining_thp: remainingThp };
           ```
       - Perbarui pesan error pada `applyLoan` agar menggunakan `MIN_REMAINING_THP` dan `calculateTHPEligibility`:
         ```typescript
         const { remaining_thp } = await this.getMemberTHP(memberId);
         const eligibility = calculateTHPEligibility(remaining_thp, monthlyTarget, MIN_REMAINING_THP);
         if (!eligibility.isEligible) {
           throw new Error(
             `Pengajuan ditolak: Sisa THP setelah pemotongan (Rp ${eligibility.finalRemainingThp.toLocaleString('id-ID')}) kurang Rp ${eligibility.shortfall.toLocaleString('id-ID')} dari batas minimal Rp ${MIN_REMAINING_THP.toLocaleString('id-ID')}.`
           );
         }
         ```
  </action>
  <verify>
    Verifikasi bahwa `calculateTHPEligibility` dan `getMemberTHP` terdefinisi dan tipe TypeScript lolos pengecekan.
  </verify>
  <done>
    `loanService` memiliki helper perhitungan kelayakan THP murni dan query anggota dengan multi-column fallback.
  </done>
</task>

<task type="auto">
  <name>Display Dynamic Remaining THP, Deficit Shortfall, and Zero-THP Advisory in UI</name>
  <files>
    src/pages/admin/PengajuanPinjaman.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/PengajuanPinjaman.tsx`:
       - Impor `MIN_REMAINING_THP` dan `calculateTHPEligibility` dari `../../services/loanService`.
       - Hitung cicilan baru via `calculateCicilan()`.
       - Hitung status kelayakan menggunakan helper:
         ```typescript
         const eligibility = thpData 
           ? calculateTHPEligibility(thpData.remaining_thp, calculateCicilan(), MIN_REMAINING_THP)
           : { finalRemainingThp: 0, isEligible: false, shortfall: MIN_REMAINING_THP };
         ```
       - Perbarui fungsi `isTHPEligible()` agar konsisten merujuk ke `eligibility.isEligible`.
       - Perbarui panel "Sisa THP Akhir":
         ```tsx
         <div className="flex justify-between py-2 text-base">
           <span className="font-bold text-gray-900">Sisa THP Akhir</span>
           <span className={`font-bold font-mono ${eligibility.isEligible ? 'text-green-600' : 'text-red-600'}`}>
             {formatCurrency(eligibility.finalRemainingThp)}
           </span>
         </div>
         ```
       - Perbarui rendering kotak peringatan validasi:
         - Jika `eligibility.isEligible`:
           ```tsx
           <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 text-xs sm:text-sm">
             <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
             <div>
               <p className="font-semibold text-emerald-900">Memenuhi Syarat</p>
               <p className="text-emerald-700 text-xs">
                 Sisa THP setelah pemotongan ({formatCurrency(eligibility.finalRemainingThp)}) berada di atas batas minimum {formatCurrency(MIN_REMAINING_THP)}.
               </p>
             </div>
           </div>
           ```
         - Jika `!eligibility.isEligible`:
           ```tsx
           <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-xs sm:text-sm">
             <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
             <div className="space-y-1">
               <p className="font-semibold text-rose-800">
                 Tidak Memenuhi Syarat Batas Minimum THP
               </p>
               <p className="text-rose-600 leading-relaxed">
                 Sisa THP setelah pemotongan diperkirakan hanya{' '}
                 <strong className="font-bold text-rose-700 font-mono">
                   {formatCurrency(eligibility.finalRemainingThp)}
                 </strong>
                 {' '}(kurang{' '}
                 <strong className="font-bold text-rose-700 font-mono">
                   {formatCurrency(eligibility.shortfall)}
                 </strong>
                 {' '}dari batas minimum {formatCurrency(MIN_REMAINING_THP)}).
               </p>
               {thpData.master_thp === 0 && (
                 <p className="text-[11px] text-rose-500 italic mt-1.5 pt-1 border-t border-rose-200/60">
                   * Catatan: Data Master THP anggota ini masih Rp 0 di sistem. Silakan update THP anggota terlebih dahulu melalui menu Import Gaji atau Manajemen Anggota.
                 </p>
               )}
             </div>
           </div>
           ```
  </action>
  <verify>
    Periksa halaman pengajuan pinjaman:
    - Saat anggota dengan gaji 0 dipilih, tampil tulisan perkiraan sisa THP (minus atau Rp 0), nilai defisit Rp 1.500.000, dan pesan catatan update master THP.
    - Saat sisa THP kurang dari Rp 1.500.000, selisih defisit dihitung dan ditampilkan secara presisi.
  </verify>
  <done>
    Panel validasi kelayakan menampilkan sisa THP akhir, defisit/kekurangan ambang batas, dan edukasi master THP kosong.
  </done>
</task>

<task type="auto">
  <name>Comprehensive Unit Testing Suite and Build Verification</name>
  <files>
    src/services/loanService.test.ts,
    src/pages/admin/PengajuanPinjaman.test.tsx
  </files>
  <action>
    1. Buka `src/services/loanService.test.ts`:
       - Tambahkan unit test untuk `calculateTHPEligibility`:
         - Kasus sisa THP melebihi batas minimum (eligible, shortfall = 0).
         - Kasus sisa THP tepat Rp 1.500.000 (eligible, shortfall = 0).
         - Kasus sisa THP di bawah Rp 1.500.000 (ineligible, shortfall > 0).
         - Kasus sisa THP negatif karena cicilan melebihi sisa THP (ineligible, shortfall = 1.500.000 + |remaining|).
       - Tambahkan pengujian `getMemberTHP` untuk menangani variasi kolom (`master_thp`, fallback ke `take_home_pay`, fallback ke `salary`, dan fallback ke 0).
       - Sesuaikan matcher penolakan `applyLoan` dengan format pesan error baru.
    2. Buat file `src/pages/admin/PengajuanPinjaman.test.tsx`:
       - Uji rendering komponen `PengajuanPinjaman`.
       - Uji tampilan panel Simulasi & Kelayakan saat anggota belum dipilih vs setelah dipilih.
       - Uji rendering pesan Tidak Memenuhi Syarat lengkap dengan nominal sisa THP, nominal kekurangan/defisit, dan catatan master THP Rp 0.
       - Uji rendering pesan Memenuhi Syarat saat THP mencukupi.
    3. Jalankan Vitest:
       `npx vitest run src/services/loanService.test.ts src/pages/admin/PengajuanPinjaman.test.tsx`
    4. Jalankan typecheck dan build verifikasi:
       `npm run build`
  </action>
  <verify>
    Vitest lulus 100% dan `npm run build` menghasilkan bundle produksi tanpa error TypeScript.
  </verify>
  <done>
    Semua pengujian unit dan verifikasi static build berhasil dijalankan dengan sukses.
  </done>
</task>


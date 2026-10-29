---
phase: 28
plan: 1
wave: 1
gap_closure: false
---

# Plan 28.1: Wave 1 - Pass Member Data & Render Header Info in Payment Modal

## Objective
Menampilkan kartu banner identitas pembeli secara jelas di bagian atas modal penerimaan pembayaran kasir (Split Payment F9) di `SplitPaymentModal.tsx`, menampilkan nama lengkap anggota, nomor anggota / NRP, dan badge status keanggotaan (atau badge Non-Anggota jika pelanggan umum), serta menghubungkan prop `selectedMember` dari halaman kasir utama di `src/pages/pos/index.tsx`.

## Context
Load these files for context:
- src/components/pos/SplitPaymentModal.tsx
- src/components/pos/MemberCreditBadge.tsx
- src/pages/pos/index.tsx

## Tasks

<task type="auto">
  <name>Display Selected Member Info in Payment Modal</name>
  <files>
    src/components/pos/SplitPaymentModal.tsx
    src/pages/pos/index.tsx
  </files>
  <action>
    1. Perbarui `src/components/pos/SplitPaymentModal.tsx`:
       - Tambahkan tipe `MemberInfo`:
         ```ts
         export interface MemberInfo {
           id: string;
           nama?: string;
           name?: string;
           nrp?: string;
           member_number?: string;
         }
         ```
       - Tambahkan prop opsional `selectedMember?: MemberInfo | null;` dan `isNonMember?: boolean;` ke interface `Props`.
       - Tentukan status anggota:
         ```ts
         const effectiveMemberId = selectedMember?.id || memberId || null;
         const isNonMember = propIsNonMember ?? !effectiveMemberId;
         ```
       - Import icon `UserCheck` dan `User` dari `lucide-react`.
       - Pada tampilan modal (di bawah container "Total Tagihan" dan sebelum `MemberCreditBadge`):
         * **Jika Anggota Aktif** (`!isNonMember && selectedMember`):
           Tampilkan banner identitas anggota:
           ```tsx
           <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-blue-950 dark:text-blue-100 rounded-xl p-3.5 mb-4 flex items-center justify-between shadow-sm">
             <div className="flex items-center gap-3 min-w-0">
               <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400">
                 <UserCheck className="w-5 h-5" />
               </div>
               <div className="min-w-0">
                 <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                   Transaksi Atas Nama Anggota:
                 </div>
                 <div className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                   {selectedMember.nama || selectedMember.name || 'Anggota Koperasi'}
                 </div>
                 <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                   NRP / ID: {selectedMember.nrp || selectedMember.member_number || selectedMember.id}
                 </div>
               </div>
             </div>
             <span className="shrink-0 ml-2 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
               Anggota Koperasi
             </span>
           </div>
           ```
         * **Jika Non-Anggota / Pelanggan Umum** (`isNonMember`):
           Tampilkan banner pelanggan umum:
           ```tsx
           <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl p-3.5 mb-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400">
                 <User className="w-5 h-5" />
               </div>
               <div>
                 <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                   Identitas Pembeli:
                 </div>
                 <div className="text-base font-bold text-slate-800 dark:text-slate-200">
                   Transaksi Non-Anggota (Pelanggan Umum)
                 </div>
               </div>
             </div>
             <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
               Umum
             </span>
           </div>
           ```
    2. Perbarui `src/pages/pos/index.tsx`:
       - Pada pemanggilan `<SplitPaymentModal ... />`, teruskan prop `selectedMember={selectedMember}`.
  </action>
  <verify>
    Komponen `SplitPaymentModal` menerima prop `selectedMember`, merender banner identitas anggota dengan nama dan NRP ketika dipilih, dan merender banner pelanggan umum saat non-anggota.
  </verify>
  <done>
    Kasir dapat melihat secara jelas dan tegas identitas anggota yang sedang bertransaksi pada modal pembayaran F9.
  </done>
</task>

## Success Criteria
- [ ] `SplitPaymentModal` menerima `selectedMember` dan `isNonMember`.
- [ ] Menampilkan nama dan nomor anggota / NRP dengan badge "Anggota Koperasi" saat bertransaksi sebagai anggota.
- [ ] Menampilkan keterangan "Transaksi Non-Anggota (Pelanggan Umum)" dengan badge "Umum" saat pembeli umum.
- [ ] `src/pages/pos/index.tsx` meneruskan state `selectedMember` aktif ke modal.


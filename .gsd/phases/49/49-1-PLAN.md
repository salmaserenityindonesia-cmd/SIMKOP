---
phase: 49
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 49.1: PostgreSQL RPC Migration & Member Service & UI Reset Integration

## Objective
Mengimplementasikan fungsi PostgreSQL RPC atomik `reset_members_and_financial_records` untuk membersihkan seluruh data anggota dan buku besar turunannya (simpanan, pinjaman, log audit rekening, dan clearance) sesuai urutan foreign keys, melepaskan relasi anggota pada transaksi kasir POS (`sales.member_id = NULL`) agar omzet toko tetap utuh, mengintegrasikan fungsi pemanggil RPC `resetAllMembersData()` pada `src/services/memberService.ts`, serta menambahkan tombol "Reset Data" dan dialog modal konfirmasi keamanan kata kunci (`DangerConfirmModal`) pada toolbar `src/pages/admin/ManajemenAnggota.tsx`.

## Context
- `supabase/migrations/030_create_reset_members_and_finances_rpc.sql`
- `src/services/memberService.ts`
- `src/components/common/DangerConfirmModal.tsx`
- `src/pages/admin/ManajemenAnggota.tsx`
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Create PostgreSQL RPC reset_members_and_financial_records Migration</name>
  <files>
    supabase/migrations/030_create_reset_members_and_finances_rpc.sql
  </files>
  <action>
    1. Buat berkas migrasi baru `supabase/migrations/030_create_reset_members_and_finances_rpc.sql`.
    2. Definisikan fungsi RPC `public.reset_members_and_financial_records()` dengan `SECURITY DEFINER` dan `LANGUAGE plpgsql`.
    3. Implementasikan pembersihan data bertahap berurutan untuk menjamin integritas referensial (foreign keys):
       - Hapus riwayat pelunasan pinjaman: `DELETE FROM public.loan_repayments;`
       - Hapus pelunasan cicilan tambahan jika tabel ada:
         ```sql
         IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loan_installments') THEN
             EXECUTE 'DELETE FROM public.loan_installments';
         END IF;
         ```
       - Hapus jadwal tenor pinjaman: `DELETE FROM public.loan_schedules;`
       - Hapus master pinjaman: `DELETE FROM public.loans;` (catat count `deleted_loans_count`)
       - Hapus mutasi transaksi simpanan: `DELETE FROM public.deposit_transactions;`
       - Hapus akun simpanan anggota: `DELETE FROM public.member_deposits;` (catat count `deleted_deposits_count`)
       - Hapus log audit rekening dan clearance jika tabel ada:
         ```sql
         IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rekening_audit_logs') THEN
             EXECUTE 'DELETE FROM public.rekening_audit_logs';
         END IF;
         IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'member_clearance_logs') THEN
             EXECUTE 'DELETE FROM public.member_clearance_logs';
         END IF;
         ```
       - Lepaskan relasi anggota pada penjualan POS toko agar data kasir dan omzet penjualan tetap utuh:
         ```sql
         IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
             UPDATE public.sales SET member_id = NULL WHERE member_id IS NOT NULL;
         END IF;
         ```
       - Kosongkan tabel anggota: `DELETE FROM public.anggota;` (catat count `deleted_members_count`)
       - Bersihkan tabel cadangan `members` jika ada:
         ```sql
         IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'members') THEN
             EXECUTE 'DELETE FROM public.members';
         END IF;
         ```
       - Catat aktivitas reset ke tabel `public.audit_logs`:
         ```sql
         IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
             INSERT INTO public.audit_logs (table_name, action, record_id, notes)
             VALUES ('anggota', 'RESET_ALL', 'SYSTEM', 'Admin melakukan reset massal seluruh data anggota, simpanan, dan pinjaman.');
         END IF;
         ```
       - Kembalikan jsonb status:
         ```sql
         RETURN jsonb_build_object(
             'success', true,
             'members_deleted', deleted_members_count,
             'loans_deleted', deleted_loans_count,
             'deposits_deleted', deleted_deposits_count,
             'message', 'Seluruh data anggota, simpanan, dan pinjaman berhasil dikosongkan.'
         );
         ```
    4. Berikan izin eksekusi:
       `GRANT EXECUTE ON FUNCTION public.reset_members_and_financial_records() TO authenticated, anon, service_role;`
  </action>
  <verify>
    Periksa sintaks SQL migrasi pada `supabase/migrations/030_create_reset_members_and_finances_rpc.sql` terformat rapi dan konsisten dengan skema Supabase SIMKOP.
  </verify>
  <done>
    Berkas migrasi `030_create_reset_members_and_finances_rpc.sql` siap dijalankan pada database.
  </done>
</task>

<task type="auto">
  <name>Implement resetAllMembersData Service and DangerConfirmModal UI in ManajemenAnggota</name>
  <files>
    src/services/memberService.ts,
    src/components/common/DangerConfirmModal.tsx,
    src/pages/admin/ManajemenAnggota.tsx
  </files>
  <action>
    1. Di `src/services/memberService.ts`:
       - Ekspor tipe `ResetMembersResult`:
         ```typescript
         export interface ResetMembersResult {
           success: boolean;
           members_deleted: number;
           loans_deleted: number;
           deposits_deleted: number;
           message: string;
         }
         ```
       - Tambahkan dan ekspor method `resetAllMembersData()`:
         ```typescript
         export async function resetAllMembersData(): Promise<ResetMembersResult> {
           const { data, error } = await supabase.rpc('reset_members_and_financial_records');
           if (error) {
             throw new Error(`Gagal mereset data anggota dan pembukuan: ${error.message}`);
           }
           return data as ResetMembersResult;
         }
         ```
    2. Buat komponen modal konfirmasi keamanan `src/components/common/DangerConfirmModal.tsx`:
       - Props:
         * `isOpen: boolean`
         * `title: string`
         * `message: string`
         * `confirmationKeyword: string` (misalnya `"HAPUS SEMUA DATA ANGGOTA"`)
         * `confirmButtonLabel?: string` (default: `"Ya, Kosongkan Sekarang"`)
         * `isLoading?: boolean`
         * `onConfirm: () => void | Promise<void>`
         * `onClose: () => void`
       - Render modal backdrop & dialog dengan styling Tailwind:
         * Ikon peringatan bahaya `AlertTriangle` warna rose/merah.
         * Teks instruksi: "Ketik teks konfirmasi berikut untuk melanjutkan: [confirmationKeyword]"
         * Input teks dengan two-way binding keyword konfirmasi.
         * Tombol "Batal" (`onClose`) dan tombol aksi merah ("Ya, Kosongkan Sekarang").
         * Tombol konfirmasi dalam status `disabled` kecuali jika input teks sama persis dengan `confirmationKeyword`.
         * Indikator spinner `Loader2` saat `isLoading === true`.
         * Reset input keyword saat modal dibuka atau ditutup.
    3. Di `src/pages/admin/ManajemenAnggota.tsx`:
       - Import `RotateCcw` dari `lucide-react`.
       - Import `resetAllMembersData` dari `../../services/memberService`.
       - Import `DangerConfirmModal` dari `../../components/common/DangerConfirmModal`.
       - Tambahkan state:
         * `const [isResetModalOpen, setIsResetModalOpen] = useState(false);`
         * `const [isResetting, setIsResetting] = useState(false);`
       - Tambahkan tombol **"Reset Data"** di toolbar Manajemen Anggota (berdampingan dengan Template, Import, Excel, PDF):
         ```tsx
         <button
           onClick={() => setIsResetModalOpen(true)}
           title="Kosongkan seluruh data anggota, simpanan, dan pinjaman"
           className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium text-sm transition-colors shadow-xs cursor-pointer shrink-0"
         >
           <RotateCcw className="w-4 h-4 text-rose-600" />
           <span>Reset Data</span>
         </button>
         ```
       - Tambahkan handler eksekusi konfirmasi:
         ```tsx
         const handleConfirmReset = async () => {
           setIsResetting(true);
           try {
             const res = await resetAllMembersData();
             showToast(res.message || 'Seluruh data anggota, simpanan, dan pinjaman berhasil dikosongkan.', 'success');
             setIsResetModalOpen(false);
             await fetchMembers();
           } catch (err: any) {
             console.error('Reset members error:', err);
             showToast(err?.message || 'Gagal mengosongkan data anggota', 'error');
           } finally {
             setIsResetting(false);
           }
         };
         ```
       - Render `<DangerConfirmModal>` di bagian modal container.
  </action>
  <verify>
    Jalankan TypeScript typecheck:
    `npx tsc --noEmit`
    Pastikan tidak ada kesalahan tipe pada `memberService.ts`, `DangerConfirmModal.tsx`, dan `ManajemenAnggota.tsx`.
  </verify>
  <done>
    Fungsi `resetAllMembersData`, komponen `DangerConfirmModal`, dan tombol "Reset Data" terintegrasi dengan benar pada halaman Manajemen Anggota.
  </done>
</task>

## Success Criteria
- [ ] Berkas migrasi `supabase/migrations/030_create_reset_members_and_finances_rpc.sql` mendefinisikan RPC atomik yang aman dari FK violation dan mempertahankan data transaksi `sales`.
- [ ] Method `resetAllMembersData()` di `src/services/memberService.ts` siap memanggil RPC dan mengembalikan rincian jumlah data yang dihapus.
- [ ] Komponen `DangerConfirmModal` memvalidasi input teks "HAPUS SEMUA DATA ANGGOTA" sebelum mengaktifkan tombol eksekusi.
- [ ] Tombol "Reset Data" terpasang pada toolbar `ManajemenAnggota.tsx` dan memicu modal konfirmasi keamanan.


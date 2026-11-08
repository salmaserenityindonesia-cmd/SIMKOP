---
phase: 67
plan: 1
wave: 1
gap_closure: false
---

# Plan 67.1: Approved Loan Applications History & Status Tab Navigation

## Objective
Menampilkan riwayat permohonan pinjaman yang telah disetujui (`approved`, `active`, `completed`/`paid_off`) pada antarmuka Persetujuan Pinjaman (`/admin/approval` di `src/pages/admin/ApprovalPinjaman.tsx`), yang sebelumnya hanya memfilter status `draft`. Rencana ini menambahkan navigasi tab status ("Menunggu Persetujuan", "Sudah Disetujui", "Semua Permohonan") lengkap dengan counter badge, memperluas layer kueri di `src/services/loanService.ts` (`getLoanApplications`), menyelaraskan tombol aksi kontekstual (Setujui/Tolak hanya untuk permohonan antre, Lihat Detail untuk yang sudah disetujui), ekspor dokumen Excel/PDF yang mengikuti tab aktif, serta memverifikasi implementasi dengan unit tests dan build check.

## Context
- `src/pages/admin/ApprovalPinjaman.tsx` (antarmuka persetujuan pinjaman admin)
- `src/services/loanService.ts` (layanan kueri data permohonan pinjaman Supabase)
- `src/services/loanService.test.ts` (unit test service pinjaman)
- `src/components/ui/StatusBadge.tsx` (komponen visual penanda status pinjaman)

## Tasks

<task type="auto">
  <name>Expand Loan Service Query to Support Approved History & Status Filters</name>
  <files>
    src/services/loanService.ts,
    src/services/loanService.test.ts
  </files>
  <action>
    1. Buka `src/services/loanService.ts`:
       - Tambahkan fungsi kueri fleksibel `getLoanApplications` ke objek `loanService`:
         ```typescript
         export type LoanApplicationStatusTab = 'PENDING' | 'APPROVED' | 'ALL';

         async getLoanApplications(statusTab: LoanApplicationStatusTab = 'PENDING') {
           let query = supabase
             .from('loans')
             .select(`
               id,
               loan_number,
               member_id,
               loan_type_id,
               amount,
               principal_amount,
               agreed_tenor_months,
               tenor,
               monthly_target,
               disbursed_at,
               created_at,
               status,
               notes,
               anggota:member_id (
                 id,
                 nrp,
                 nama,
                 pangkat,
                 take_home_pay,
                 master_thp,
                 bank_account_number
               )
             `)
             .order('created_at', { ascending: false });

           if (statusTab === 'PENDING') {
             query = query.in('status', ['draft', 'pending']);
           } else if (statusTab === 'APPROVED') {
             query = query.in('status', ['approved', 'active', 'completed', 'paid_off']);
           }
           // Jika 'ALL', tidak ada filter status (mengambil semua riwayat)

           const { data, error } = await query;
           if (error) throw new Error(error.message);
           return data || [];
         }
         ```
       - Pertahankan method legacy `getPendingLoans` agar backwards-compatible dengan memanggil `getLoanApplications('PENDING')` atau kueri status draft.
    2. Buka `src/services/loanService.test.ts`:
       - Tambahkan unit test untuk `loanService.getLoanApplications`:
         - Test pemanggilan dengan filter `'PENDING'` (memverifikasi kueri `.in('status', ['draft', 'pending'])`).
         - Test pemanggilan dengan filter `'APPROVED'` (memverifikasi kueri `.in('status', ['approved', 'active', 'completed', 'paid_off'])`).
         - Test pemanggilan dengan filter `'ALL'` (memverifikasi kueri tanpa filter `in`).
  </action>
  <verify>
    Jalankan unit test `loanService.test.ts` via Vitest:
    `npx vitest run src/services/loanService.test.ts` dan pastikan semua test berhasil lulus.
  </verify>
  <done>
    `loanService` mendukung pengambilan permohonan pinjaman antre (pending) maupun riwayat yang telah disetujui (approved) secara terstruktur.
  </done>
</task>

<task type="auto">
  <name>Add Tabs, Contextual Actions & Approved History Table UI</name>
  <files>
    src/pages/admin/ApprovalPinjaman.tsx,
    src/pages/admin/ApprovalPinjaman.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ApprovalPinjaman.tsx`:
       - Tambahkan state:
         ```typescript
         const [activeTab, setActiveTab] = useState<'PENDING' | 'APPROVED' | 'ALL'>('PENDING');
         const [counts, setCounts] = useState<{ pending: number; approved: number }>({ pending: 0, approved: 0 });
         ```
       - Perbarui pemanggilan data:
         - Muat data pinjaman sesuai `activeTab` via `loanService.getLoanApplications(activeTab)`.
         - Ambil atau hitung counter untuk tab pending dan approved agar badge jumlah akurat.
       - Tambahkan navigasi tab di atas tabel dengan indikator visual aktif, counter badge (kuning untuk pending, hijau untuk approved):
         - Tab 1: "Menunggu Persetujuan" (badge count pending)
         - Tab 2: "Sudah Disetujui" (badge count approved)
         - Tab 3: "Semua Riwayat"
       - Perbarui tabel:
         - Tanggal Pengajuan & Tanggal Approval/Pencairan jika tersedia (`created_at`, `disbursed_at`).
         - Normalisasi field jumlah (`p.amount || p.principal_amount`) dan tenor (`p.tenor || p.agreed_tenor_months`).
         - Status badge yang adaptif (`StatusBadge` atau mapping ramah pengguna).
         - Kolom Aksi yang kontekstual:
           - Jika permohonan berstatus `draft` / `pending`: tampilkan tombol `[Setujui]` (hijau), `[Tolak]` (merah), dan `[Detail]` (biru).
           - Jika permohonan berstatus `approved` / `active` / `completed`: sembunyikan tombol approve/reject, tampilkan tombol `[Detail]` (biru).
       - Empty state pesan dinamis berdasarkan tab aktif:
         - PENDING: *"Tidak ada pengajuan pinjaman yang menunggu persetujuan."*
         - APPROVED: *"Belum ada riwayat permohonan pinjaman yang disetujui."*
         - ALL: *"Tidak ada riwayat permohonan pinjaman."*
       - Perbarui export Excel & PDF agar mengekspor data yang tampil pada tab saat ini lengkap dengan informasi status dan tanggal.
    2. Buat file unit test `src/pages/admin/ApprovalPinjaman.test.tsx`:
       - Test render tab navigasi ("Menunggu Persetujuan", "Sudah Disetujui", "Semua Riwayat").
       - Test pergantian tab: mengklik tab "Sudah Disetujui" memanggil service dengan parameter `'APPROVED'` dan menampilkan pinjaman yang telah disetujui.
       - Test tombol aksi: tombol "Setujui" dan "Tolak" hanya muncul pada pinjaman berstatus draft/pending.
  </action>
  <verify>
    Jalankan unit test halaman approval:
    `npx vitest run src/pages/admin/ApprovalPinjaman.test.tsx` dan pastikan seluruh test lulus.
  </verify>
  <done>
    Halaman `/admin/approval` memiliki navigasi tab status, tabel riwayat permohonan pinjaman yang disetujui, tombol aksi kontekstual, dan counter badge.
  </done>
</task>

<task type="auto">
  <name>Full Test Suite & Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan seluruh suite unit test pinjaman dan admin:
       `npx vitest run src/services/loanService.test.ts src/pages/admin/ApprovalPinjaman.test.tsx`
    2. Jalankan build produksi Vite untuk verifikasi bundle dan tipe data TypeScript:
       `npm run build`
    3. Pastikan tidak ada peringatan breaking changes atau type error.
  </action>
  <verify>
    `npm run build` keluar dengan kode 0 tanpa error.
  </verify>
  <done>
    Fitur riwayat approval pinjaman terverifikasi 100% lulus build dan test.
  </done>
</task>


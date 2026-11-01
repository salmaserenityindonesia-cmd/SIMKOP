---
phase: 48
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 48.1: Add Bank Account & Join Date Fields in Form Modal & createMember Service Integration

## Objective
Memperkaya form modal "Tambah Anggota Baru" pada `src/pages/admin/ManajemenAnggota.tsx` dengan menambahkan field Nomor Rekening Bank (`bank_account_number`) dan Tanggal Bergabung (`tgl_awal_anggota`), serta mengimplementasikan fungsi service mutasi pendaftaran anggota baru `createMember()` pada `src/services/memberService.ts`. Fungsi ini menyimpan profil anggota ke tabel `public.anggota` (dengan `created_at` mencerminkan tanggal bergabung) dan secara otomatis menginisialisasi 4 akun simpanan dasar (Pokok, Wajib, Belanja, Lebaran) pada `public.member_deposits` dengan status aktif dan saldo awal Rp 0 tanpa mutasi transaksi dummy.

## Context
- `src/pages/admin/ManajemenAnggota.tsx`
- `src/services/memberService.ts`
- `src/services/koperasiService.ts`
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Implement createMember Service Function with Automatic Deposit Accounts Initialization</name>
  <files>
    src/services/memberService.ts
  </files>
  <action>
    1. Buka `src/services/memberService.ts`.
    2. Definisikan antarmuka input `CreateMemberInput`:
       ```typescript
       export interface CreateMemberInput {
         nrp: string;
         nama: string;
         pangkat?: string;
         master_thp?: number;
         bank_account_number?: string;
         tgl_awal_anggota?: string;
         status?: string;
         membership_status?: 'ACTIVE' | 'PENDING_RESIGNED' | 'READY_TO_RESIGN' | 'RESIGNED' | 'BLOCKED';
       }
       ```
    3. Implementasikan dan ekspor fungsi `createMember(input: CreateMemberInput)`:
       - Bentuk payload data anggota:
         * `nrp`: `input.nrp.trim()`
         * `nama`: `input.nama.trim()`
         * `pangkat`: `input.pangkat?.trim() || null`
         * `master_thp`: `Number(input.master_thp) || 0`
         * `bank_account_number`: `input.bank_account_number?.trim() || null`
         * `status`: `input.status || 'aktif'`
         * `membership_status`: `input.membership_status || 'ACTIVE'`
         * `created_at`: format tanggal bergabung ISO string jika `input.tgl_awal_anggota` diisi (`new Date(input.tgl_awal_anggota).toISOString()`), fallback ke `new Date().toISOString()`.
       - Lakukan insert ke tabel `public.anggota`:
         ```typescript
         const { data: member, error: memberErr } = await supabase
           .from('anggota')
           .insert([anggotaPayload])
           .select()
           .single();
         if (memberErr) {
           throw new Error(`Gagal mendaftarkan anggota baru: ${memberErr.message}`);
         }
         ```
       - Ambil daftar tipe simpanan dari `deposit_types` untuk menginisialisasi 4 tipe dasar: POKOK, WAJIB, BELANJA, dan LEBARAN:
         ```typescript
         let { data: dTypes, error: dtErr } = await supabase.from('deposit_types').select('*');
         ```
         Jika tabel `deposit_types` kosong, lakukan seeding 4 tipe dasar (SP, SW, SB, SL) sesuai standar sistem.
       - Daftarkan anggota ke tabel `public.member_deposits` untuk tipe yang sesuai (POKOK, WAJIB, BELANJA, LEBARAN atau semua tipe aktif yang belum terdaftar):
         ```typescript
         const toEnroll = dTypes?.filter(dt => dt.is_active) || [];
         if (toEnroll.length > 0) {
           const inserts = toEnroll.map(dt => ({
             member_id: member.id,
             deposit_type_id: dt.id,
             is_terminated: false,
           }));
           const { error: insErr } = await supabase.from('member_deposits').insert(inserts);
           if (insErr) {
             console.warn('Gagal menginisialisasi akun simpanan anggota:', insErr.message);
           }
         }
         ```
       - PENTING: Jangan membuat baris transaksi dummy pada `deposit_transactions` agar saldo awal murni Rp 0.
       - Kembalikan data anggota yang berhasil dibuat.
  </action>
  <verify>
    Fungsi `createMember` dan tipe `CreateMemberInput` diekspor dari `src/services/memberService.ts` dan siap dipanggil dengan payload anggota baru.
  </verify>
  <done>
    Fungsi `createMember` berhasil dibuat di `src/services/memberService.ts` dengan insert ke tabel `anggota` dan inisialisasi 4 akun simpanan dasar di `member_deposits`.
  </done>
</task>

<task type="auto">
  <name>Enhance Add Member Form Modal with Bank Account and Join Date Fields</name>
  <files>
    src/pages/admin/ManajemenAnggota.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ManajemenAnggota.tsx`.
    2. Import `createMember` dari `../../services/memberService`.
    3. Perbarui inisialisasi state `formData` di komponen `ManajemenAnggota`:
       ```typescript
       const [formData, setFormData] = useState({
         nrp: '',
         nama: '',
         pangkat: '',
         status: 'aktif',
         master_thp: 0,
         bank_account_number: '',
         tgl_awal_anggota: new Date().toISOString().slice(0, 10),
       });
       ```
    4. Perbarui handler `handleOpenAddModal`:
       Reset nilai form data dengan default:
       ```typescript
       setEditingAnggota(null);
       setFormData({
         nrp: '',
         nama: '',
         pangkat: '',
         status: 'aktif',
         master_thp: 0,
         bank_account_number: '',
         tgl_awal_anggota: new Date().toISOString().slice(0, 10),
       });
       setShowModal(true);
       ```
    5. Perbarui handler `handleOpenEditModal`:
       Muat nilai `bank_account_number` dan tanggal bergabung dari profil yang dipilih:
       ```typescript
       setEditingAnggota(anggota);
       setFormData({
         nrp: anggota.nrp || '',
         nama: anggota.nama,
         pangkat: anggota.pangkat || '',
         status: anggota.status || 'aktif',
         master_thp: anggota.master_thp || 0,
         bank_account_number: anggota.bank_account_number || '',
         tgl_awal_anggota: anggota.created_at ? anggota.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
       });
       setShowModal(true);
       ```
    6. Perbarui `handleSubmit`:
       - Jika mode Edit (`editingAnggota`):
         Panggil `updateAnggota(editingAnggota.id, { nrp: formData.nrp, nama: formData.nama, pangkat: formData.pangkat, status: formData.status, master_thp: formData.master_thp, bank_account_number: formData.bank_account_number })`.
       - Jika mode Tambah Baru:
         Panggil `createMember({ nrp: formData.nrp, nama: formData.nama, pangkat: formData.pangkat, master_thp: formData.master_thp, bank_account_number: formData.bank_account_number, tgl_awal_anggota: formData.tgl_awal_anggota })`.
         Tampilkan toast: `'Anggota baru berhasil ditambahkan.'`.
       - Muat ulang daftar anggota (`await loadData()`).
    7. Tambahkan 2 input field baru pada modal form JSX:
       - **Nomor Rekening Bank**:
         Input teks dengan placeholder "Contoh: 115738953714", label "Nomor Rekening Bank (Opsional)".
       - **Tanggal Bergabung / Tgl Awal**:
         Input tanggal (`type="date"`), label "Tanggal Bergabung", default ke hari ini.
  </action>
  <verify>
    Buka modal Tambah Anggota Baru: input Nomor Rekening Bank dan Tanggal Bergabung tampil rapi dan responsif, terhubung dengan state `formData`, serta data berhasil dikirimkan ke `createMember`.
  </verify>
  <done>
    Modal Tambah Anggota Baru pada `ManajemenAnggota.tsx` berhasil diselaraskan dengan field `bank_account_number` dan `tgl_awal_anggota`.
  </done>
</task>

## Success Criteria
- [ ] Fungsi `createMember()` di `src/services/memberService.ts` menyimpan profil anggota ke `anggota` dan menginisialisasi 4 akun simpanan dasar (Pokok, Wajib, Belanja, Lebaran) di `member_deposits` dengan saldo awal 0
- [ ] State form di `ManajemenAnggota.tsx` memuat `bank_account_number` dan `tgl_awal_anggota` dengan default hari ini
- [ ] Input "Nomor Rekening Bank (Opsional)" dan "Tanggal Bergabung" tampil dengan label yang jelas dan styling konsisten di modal
- [ ] Handler submit memanggil `createMember()` saat pendaftaran anggota baru dan `updateAnggota()` saat pengeditan

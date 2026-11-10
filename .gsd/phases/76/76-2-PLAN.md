---
phase: 76
plan: 2
wave: 2
gap_closure: false
---

# Plan 76.2: UI Form Field Integration & Submission Payload Binding

## Objective
Mengintegrasikan elemen UI dropdown "Jenis Pinjaman" pada formulir pengajuan pinjaman (`PengajuanPinjaman.tsx`), menghubungkan dropdown "Tenor (Bulan)" dengan array `availableTenors`, menonaktifkan pemilihan tenor sebelum jenis pinjaman dipilih, serta memvalidasi dan mengirimkan `loan_type_id` pada payload permohonan pinjaman baru.

## Context
Load these files for context:
- `src/pages/admin/PengajuanPinjaman.tsx`
- `src/services/loanService.ts`

## Tasks

<task type="auto">
  <name>Add Jenis Pinjaman Field and Connect Dynamic Tenor Options in Form</name>
  <files>
    src/pages/admin/PengajuanPinjaman.tsx
  </files>
  <action>
    1. Di `src/pages/admin/PengajuanPinjaman.tsx`:
       - Tambahkan input seleksi "Jenis Pinjaman" pada grid form (setelah "Anggota Pemohon"):
         ```tsx
         <div>
           <label className="block text-sm font-medium text-gray-700 mb-1">
             Jenis Pinjaman <span className="text-red-500">*</span>
           </label>
           <select 
             required
             value={selectedLoanTypeId}
             onChange={e => handleLoanTypeChange(e.target.value)}
             className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
           >
             <option value="">-- Pilih Jenis Pinjaman --</option>
             {loanTypes.map(lt => (
               <option key={lt.id} value={lt.id}>
                 {lt.name} (Maks. {lt.max_duration_months} Bulan)
               </option>
             ))}
           </select>
         </div>
         ```
       - Perbarui elemen dropdown "Tenor (Bulan)":
         - Ganti opsi statis (6, 10, 12, 18, 24, 30, 36) menjadi render dinamis dari `availableTenors`:
           ```tsx
           <select 
             required
             value={tenor}
             disabled={!selectedLoanTypeId}
             onChange={e => setTenor(Number(e.target.value) || '')}
             className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
           >
             <option value="">
               {!selectedLoanTypeId ? '-- Pilih Jenis Pinjaman Terlebih Dahulu --' : '-- Pilih Tenor --'}
             </option>
             {availableTenors.map(t => (
               <option key={t} value={t}>{t} Bulan</option>
             ))}
           </select>
           ```
       - Sambungkan `maxTenor` ke `SimulationPanel`:
         `<SimulationPanel ... maxTenor={selectedLoanType ? selectedLoanType.max_duration_months : undefined} />`
  </action>
  <verify>
    Periksa rendering form:
    - Dropdown jenis pinjaman terpasang rapi.
    - Dropdown tenor terdisabilitas ketika belum ada jenis pinjaman yang dipilih.
    - Memilih jenis pinjaman DARURAT (maks. 6 bulan) memunculkan tenor maksimal 6 bulan.
    - Memilih jenis pinjaman REGULER (maks. 12 bulan) memunculkan tenor maksimal 12 bulan.
  </verify>
  <done>
    UI form pengajuan pinjaman terintegrasi dinamis dengan filter tenor berbasis master produk.
  </done>
</task>

<task type="auto">
  <name>Enforce Validation & Bind loan_type_id in Submission Payload</name>
  <files>
    src/pages/admin/PengajuanPinjaman.tsx
  </files>
  <action>
    1. Di `src/pages/admin/PengajuanPinjaman.tsx`:
       - Pada fungsi `handleSubmit`:
         - Validasi kelengkapan form mencakup `selectedLoanTypeId`:
           ```typescript
           if (!selectedAnggota || !purpose || !amount || !tenor || !selectedLoanTypeId) {
             setError('Silakan lengkapi seluruh kolom formulir termasuk jenis pinjaman.');
             return;
           }
           ```
         - Validasi batas tenor:
           ```typescript
           if (Number(tenor) > maxTenor) {
             setError(`Tenor yang dipilih (${tenor} bulan) melebihi batas maksimal ${maxTenor} bulan untuk jenis pinjaman ini.`);
             return;
           }
           ```
         - Kirim `selectedLoanTypeId` ke service:
           `await loanService.applyLoan(selectedAnggota, purpose, Number(amount), Number(tenor), selectedLoanTypeId);`
         - Saat form berhasil disubmit:
           - Reset `setSelectedLoanTypeId('')`.
           - Reset `setTenor('')`.
           - Reset `setAmount('')`.
           - Reset `setPurpose('')`.
         - Nonaktifkan tombol submit (`disabled`) jika `!selectedLoanTypeId` selain kondisi sebelumnya.
  </action>
  <verify>
    Lakukan uji alur pengajuan: formulir tidak dapat disubmit jika jenis pinjaman belum dipilih atau tenor melampaui `maxTenor`.
  </verify>
  <done>
    `loan_type_id` terikat utuh pada payload dan lolos validasi sebelum dikirim ke database.
  </done>
</task>

## Success Criteria
- [ ] Dropdown Jenis Pinjaman tampil pada form pengajuan pinjaman baru.
- [ ] Dropdown tenor otomatis disaring berdasarkan `max_duration_months` jenis pinjaman terpilih.
- [ ] Dropdown tenor disabled jika jenis pinjaman belum dipilih.
- [ ] Validasi submit menolak pengajuan tanpa jenis pinjaman atau tenor di luar batas.
- [ ] `loan_type_id` terkirim pada payload pembuatan pinjaman baru.
- [ ] Data pinjaman lama di database tidak terpengaruh sama sekali.


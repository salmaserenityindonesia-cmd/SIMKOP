---
phase: 52
plan: 2
wave: 2
depends_on:
  - 52.1
gap_closure: false
---

# Plan 52.2: Multi-Row Cell UI in ComplianceMatrix.tsx & Component Tests

## Objective
Mengubah tampilan sel bulan pada tabel Matriks Tracking Pembayaran Simpanan (`src/pages/admin/ComplianceMatrix.tsx`) dari badge tunggal/ikon centang menjadi tata letak 3 sub-baris (Wajib, Belanja, Lebaran) dengan visualisasi status dan nominal transparan, penyesuaian lebar kolom (~95px - 105px), interaksi klik sel untuk membuka modal detail buku besar, serta pengujian komponen di `ComplianceMatrix.test.tsx`.

## Context
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/pages/admin/ComplianceMatrix.test.tsx`
- `src/services/complianceService.ts`
- `src/components/compliance/SavingsLedgerMatrixModal.tsx`

## Tasks

<task type="auto">
  <name>Render 3-Row Itemized Savings in Matrix Cells & Update Table Header Width</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`.
    2. Sesuaikan lebar kolom bulan di `<th>`:
       - Ubah `min-w-[60px]` menjadi `min-w-[95px] md:min-w-[105px]`.
    3. Perbarui fungsi `renderCell`:
       - Handle null / not_applicable: Jika `!monthData`, render `-` abu-abu di tengah.
       - Buat helper fallback agar backward-compatible:
         * `wajib`: `monthData.wajib || { status: monthData.w > 0 ? 'paid' : 'unpaid', amount: monthData.w > 0 ? monthData.w : (targets.wajib || 200000) }`
         * `belanja`: `monthData.belanja || { status: monthData.b > 0 ? 'paid' : 'unpaid', amount: monthData.b > 0 ? monthData.b : (targets.belanja || 50000) }`
         * `lebaran`: `monthData.lebaran || { status: monthData.l > 0 ? 'paid' : 'unpaid', amount: monthData.l > 0 ? monthData.l : (targets.lebaran || 50000) }`
       - Render struktur grid/flex 3 sub-baris vertikal:
         ```tsx
         <div 
           onClick={() => setSelectedMember({
             id: row.member_id,
             nrp: row.nrp,
             nama: row.nama,
             joinDate: row.tgl_awal_anggota || row.created_at
           })}
           className="flex flex-col gap-0.5 py-1 px-1.5 text-[11px] leading-tight font-mono select-none rounded hover:bg-slate-100/80 cursor-pointer transition-colors"
           title={`Klik untuk rincian buku besar ${row.nama} - ${MONTHS[monthIndex]} ${year}`}
         >
           {/* Baris Simpanan Wajib */}
           <div className="flex items-center justify-between gap-1.5">
             <span className="text-[10px] uppercase font-bold text-slate-500">wajib</span>
             <span className={
               wajibItem.status === 'paid'
                 ? 'text-emerald-600 font-semibold'
                 : wajibItem.status === 'unpaid'
                 ? 'text-rose-600 font-bold'
                 : 'text-slate-400'
             }>
               {wajibItem.status === 'paid'
                 ? Number(wajibItem.amount).toLocaleString('id-ID')
                 : wajibItem.status === 'unpaid'
                 ? Number(wajibItem.amount || 200000).toLocaleString('id-ID')
                 : '-'}
             </span>
           </div>

           {/* Baris Simpanan Belanja */}
           <div className="flex items-center justify-between gap-1.5">
             <span className="text-[10px] uppercase font-bold text-slate-500">belanja</span>
             <span className={
               belanjaItem.status === 'paid'
                 ? 'text-teal-600 font-semibold'
                 : belanjaItem.status === 'unpaid'
                 ? 'text-rose-600 font-bold'
                 : 'text-slate-400'
             }>
               {belanjaItem.status === 'paid'
                 ? Number(belanjaItem.amount).toLocaleString('id-ID')
                 : belanjaItem.status === 'unpaid'
                 ? Number(belanjaItem.amount || 50000).toLocaleString('id-ID')
                 : '-'}
             </span>
           </div>

           {/* Baris Simpanan Lebaran */}
           <div className="flex items-center justify-between gap-1.5">
             <span className="text-[10px] uppercase font-bold text-slate-500">lebaran</span>
             <span className={
               lebaranItem.status === 'paid'
                 ? 'text-emerald-600 font-semibold'
                 : lebaranItem.status === 'unpaid'
                 ? 'text-rose-600 font-bold'
                 : 'text-slate-400'
             }>
               {lebaranItem.status === 'paid'
                 ? Number(lebaranItem.amount).toLocaleString('id-ID')
                 : lebaranItem.status === 'unpaid'
                 ? Number(lebaranItem.amount || 50000).toLocaleString('id-ID')
                 : '-'}
             </span>
           </div>
         </div>
         ```
    4. Perbarui footer legend di bagian bawah tabel agar selaras dengan penanda visual baru:
       - Hijau/Teal: Lunas
       - Merah (Rose): Belum Bayar / Tunggakan
       - Abu-abu (-): Belum Terdaftar / Tidak Berlaku
  </action>
  <verify>
    Komponen `ComplianceMatrix` merender 3 baris teks 'wajib', 'belanja', 'lebaran' dengan nominal dan penanda warna yang tepat.
  </verify>
  <done>
    Sel tabel matriks kepatuhan simpanan menampilkan 3 sub-baris simpanan langsung dan dapat diklik untuk membuka modal buku besar.
  </done>
</task>

<task type="auto">
  <name>Update Component Tests in ComplianceMatrix.test.tsx</name>
  <files>
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.test.tsx`.
    2. Tambahkan test case untuk memverifikasi rendering sub-baris:
       - Memastikan teks 'wajib', 'belanja', dan 'lebaran' ada pada HTML rendered.
       - Memastikan kelas pewarnaan `text-emerald-600`, `text-teal-600`, dan `text-rose-600` dirender sesuai status simpanan.
       - Memastikan tooltip atau title interaksi buku besar sel bulan terpasang.
    3. Jalankan pengujian: `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx`.
  </action>
  <verify>
    Seluruh pengujian di `src/pages/admin/ComplianceMatrix.test.tsx` lulus 100%.
  </verify>
  <done>
    Test suite memvalidasi tampilan 3 sub-baris di sel matriks kepatuhan simpanan.
  </done>
</task>

## Success Criteria
- [ ] Setiap sel bulan menampilkan 3 sub-baris: wajib, belanja, dan lebaran.
- [ ] Penanda warna status (lunas vs belum bayar) dan nominal tampil jelas tanpa tertutup tooltip.
- [ ] Kolom bulan memiliki min-width ~95px - 105px untuk kerapian layout.
- [ ] Klik pada sel bulan memicu pembukaan `SavingsLedgerMatrixModal`.
- [ ] Seluruh unit & component tests di `ComplianceMatrix.test.tsx` lulus 100%.


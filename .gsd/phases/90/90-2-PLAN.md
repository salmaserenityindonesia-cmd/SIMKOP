---
phase: 90
plan: 2
wave: 2
gap_closure: false
---

# Plan 90.2: Service Layer & UI Modal Implementation

## Objective
Mengintegrasikan fungsi reset transaksi keuangan ke dalam lapisan service (`src/services/cashFlowService.ts`) dan menyediakan tombol pemicu beserta dialog modal konfirmasi verifikasi teks "RESET KAS KEUANGAN" pada antarmuka Laporan Keuangan Terpadu (`src/pages/admin/laporan-keuangan/index.tsx` & `src/pages/admin/LaporanKeuangan.tsx`).

## Context
- `src/services/cashFlowService.ts`
- `src/services/cashFlowService.test.ts`
- `src/pages/admin/laporan-keuangan/index.tsx`
- `src/pages/admin/LaporanKeuangan.tsx`
- `src/context/FeedbackContext.tsx`
- Supabase RPC: `reset_financial_transactions`

## Tasks

<task type="auto">
  <name>Implement cashFlowService and Unit Test</name>
  <files>
    src/services/cashFlowService.ts,
    src/services/cashFlowService.test.ts
  </files>
  <action>
    1. Buat `src/services/cashFlowService.ts`:
       - Buat fungsi `resetFinancialTransactions(adminId?: string): Promise<{ success: boolean; message: string; sales_deleted?: number; withdrawals_deleted?: number; cash_flow_deleted?: number }>` yang memanggil `supabase.rpc('reset_financial_transactions', { p_admin_id: adminId || null })`.
       - Tangani error response dari Supabase RPC secara tepat.
    2. Buat unit test `src/services/cashFlowService.test.ts`:
       - Uji pemanggilan RPC `reset_financial_transactions` dengan parameter adminId maupun undefined.
       - Uji penanganan saat RPC berhasil dan saat RPC mengembalikan error.
  </action>
  <verify>
    Jalankan: `npx vitest run src/services/cashFlowService.test.ts`. Seluruh pengujian harus lulus.
  </verify>
  <done>
    Service pemanggil RPC reset transaksi keuangan dan unit test selesai dibuat.
  </done>
</task>

<task type="auto">
  <name>Add Reset Button and Confirmation Modal in LaporanKeuangan</name>
  <files>
    src/pages/admin/laporan-keuangan/index.tsx,
    src/pages/admin/LaporanKeuangan.tsx
  </files>
  <action>
    1. Pastikan `src/pages/admin/LaporanKeuangan.tsx` mengekspor default komponen dari `./laporan-keuangan`.
    2. Buka `src/pages/admin/laporan-keuangan/index.tsx`:
       - Tambahkan tombol "Reset Transaksi Kas" di action buttons toolbar (bersebelahan dengan "Download PDF").
       - Gunakan styling tombol bernada rose/red (border-rose-300 text-rose-700 hover:bg-rose-50), ikon `history_toggle_off` / `delete_forever` / `rotate_left` / Lucide `RotateCcw` / `Trash2`.
       - Sediakan state modal konfirmasi: `isResetModalOpen`, `confirmText`, `isResetting`.
       - Rancang modal konfirmasi bahaya dengan:
         * Badge & icon peringatan aksi destruktif.
         * Deskripsi jelas: Menghapus seluruh riwayat arus kas (`cash_flow`), penjualan retail POS (`sales`, `sale_items`, `cashier_shifts`), dan penarikan simpanan anggota (`deposit_transactions`). Saldo kas brankas akan kembali ke 0.
         * Penegasan keamanan: Master produk dan pokok simpanan anggota tetap aman.
         * Input verifikasi teks: Pengguna wajib mengetikkan persis `"RESET KAS KEUANGAN"` agar tombol submit "Konfirmasi Reset" menjadi aktif (`disabled={confirmText !== 'RESET KAS KEUANGAN' || isResetting}`).
         * Loading state & disable controls saat proses berlangsung.
       - Saat eksekusi submit:
         * Panggil `resetFinancialTransactions(currentUserId)`.
         * Tutup modal dan reset form text.
         * Tampilkan feedback/toast notifikasi sukses (`feedback.showSuccess('Seluruh transaksi kas berhasil di-reset.')`).
         * Panggil ulang `fetchData()` agar metrik kartu Total Kas Masuk, Total Kas Keluar, Saldo Kas Brankas, serta tabel mutasi seketika ter-refresh ke kondisi bersih 0.
  </action>
  <verify>
    Periksa bahwa tombol, modal konfirmasi dengan validasi teks "RESET KAS KEUANGAN", feedback toast, dan refresh data terpasang dengan rapi.
  </verify>
  <done>
    Antarmuka Laporan Keuangan Terpadu memiliki tombol dan modal konfirmasi reset kas yang aman dan responsif.
  </done>
</task>

## Success Criteria
- [ ] Service `resetFinancialTransactions` terdefinisi dan lulus unit test.
- [ ] Tombol Reset Transaksi Kas muncul pada toolbar Laporan Keuangan Terpadu.
- [ ] Modal mewajibkan input teks tepat `"RESET KAS KEUANGAN"`.
- [ ] Metrik ringkasan kartu dan data tabel dimuat ulang (refetch) pasca eksekusi reset berhasil.


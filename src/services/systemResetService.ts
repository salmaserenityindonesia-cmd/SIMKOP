import { supabase } from '../lib/supabaseClient';

export const RESET_CONFIRMATION_PHRASE = 'RESET DATA TRANSAKSI' as const;

export const PRESERVED_MASTER_TABLES = [
  { name: 'anggota', label: 'Data Master Anggota' },
  { name: 'deposit_types', label: 'Jenis & Aturan Simpanan' },
  { name: 'koperasi_profile', label: 'Profil & Identitas Koperasi' },
  { name: 'loan_types', label: 'Jenis Produk Pinjaman & Pembiayaan' },
  { name: 'pengelola', label: 'Akun Admin & Pengelola Sistem' },
  { name: 'pos_settings', label: 'Pengaturan Kasir & POS' },
  { name: 'product_categories', label: 'Kategori Produk Toko' },
  { name: 'products', label: 'Katalog Produk & Harga Toko' },
  { name: 'savings_rate_tiers', label: 'Tiering Tarif Simpanan' },
] as const;

export const TRANSACTIONAL_PREVIEW_TABLES = [
  { table: 'cash_flow', label: 'Arus Kas' },
  { table: 'deposit_transactions', label: 'Mutasi Simpanan' },
  { table: 'member_deposits', label: 'Rekening Simpanan' },
  { table: 'loans', label: 'Pinjaman' },
  { table: 'loan_repayments', label: 'Angsuran Pinjaman' },
  { table: 'sales', label: 'Penjualan POS' },
  { table: 'purchases', label: 'Pembelian / Restock' },
  { table: 'purchase_returns', label: 'Retur Pembelian' },
  { table: 'store_credit_payments', label: 'Bon & Kredit Toko' },
  { table: 'fiscal_year_closings', label: 'Tutup Buku' },
  { table: 'lebaran_disbursement_cycles', label: 'Pencairan Lebaran' },
] as const;

export interface SystemTransactionalResetResult {
  success: boolean;
  truncatedCount: number;
  truncatedTables: string[];
  preservedTables: string[];
  restoredMembersCount: number;
}

export interface TransactionalTableStat {
  table: string;
  label: string;
  count: number;
}

export interface TransactionalResetPreview {
  totalRows: number;
  tables: TransactionalTableStat[];
}

const TRANSACTIONAL_LOCAL_STORAGE_KEYS = [
  'simkop_active_shift_id',
  'simkop_active_shift_data',
  'simkop_pos_cart',
  'simkop_parked_sales_local',
] as const;

/**
 * Membersihkan cache operasional POS/shift di localStorage setelah reset transaksional.
 */
export function clearTransactionalLocalCaches(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    for (const key of TRANSACTIONAL_LOCAL_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Abaikan jika browser membatasi akses localStorage
  }
}

/**
 * Mengambil estimasi jumlah baris data transaksional aktif pada tabel-tabel utama
 * untuk ditampilkan sebagai pratinjau sebelum eksekusi reset.
 */
export async function getTransactionalResetPreview(): Promise<TransactionalResetPreview> {
  const settled = await Promise.allSettled(
    TRANSACTIONAL_PREVIEW_TABLES.map(async ({ table, label }) => {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });

        if (error) {
          return { table, label, count: 0 };
        }
        return { table, label, count: typeof count === 'number' ? count : 0 };
      } catch {
        return { table, label, count: 0 };
      }
    })
  );

  const tables: TransactionalTableStat[] = settled.map((entry, idx) => {
    if (entry.status === 'fulfilled') {
      return entry.value;
    }
    const meta = TRANSACTIONAL_PREVIEW_TABLES[idx];
    return { table: meta.table, label: meta.label, count: 0 };
  });

  const totalRows = tables.reduce((sum, item) => sum + item.count, 0);
  return { totalRows, tables };
}

/**
 * Mengeksekusi reset seluruh data transaksional pada skema public melalui RPC atomik
 * `reset_transactional_data_keep_masters` sambil mempertahankan 9 tabel master inti.
 */
export async function executeSystemTransactionalReset(
  confirmationPhrase: string
): Promise<SystemTransactionalResetResult> {
  const trimmedPhrase = (confirmationPhrase ?? '').trim();
  if (trimmedPhrase !== RESET_CONFIRMATION_PHRASE) {
    throw new Error(`Frasa konfirmasi tidak valid. Ketik tepat: ${RESET_CONFIRMATION_PHRASE}`);
  }

  const { data, error } = await supabase.rpc('reset_transactional_data_keep_masters', {
    p_confirmation_phrase: trimmedPhrase,
  });

  if (error) {
    const rawMsg = String(error.message || '');
    if (
      error.code === 'PGRST202' ||
      rawMsg.includes('schema cache') ||
      rawMsg.includes('Could not find the function')
    ) {
      throw new Error(
        'Fungsi database reset_transactional_data_keep_masters belum terpasang di Supabase. Jalankan migrasi supabase/migrations/20261120_add_reset_transactional_data_rpc.sql di SQL Editor Supabase terlebih dahulu.'
      );
    }
    throw new Error(rawMsg || 'Gagal mereset data transaksional sistem.');
  }

  clearTransactionalLocalCaches();

  const payload = data && typeof data === 'object' ? data : {};
  const truncatedTables = Array.isArray((payload as any).truncated_tables)
    ? (payload as any).truncated_tables.map((t: unknown) => String(t))
    : [];
  const preservedTables = Array.isArray((payload as any).preserved_tables)
    ? (payload as any).preserved_tables.map((t: unknown) => String(t))
    : PRESERVED_MASTER_TABLES.map((t) => t.name);
  const truncatedCount =
    typeof (payload as any).truncated_count === 'number'
      ? (payload as any).truncated_count
      : truncatedTables.length;
  const restoredMembersCount =
    typeof (payload as any).restored_members_count === 'number'
      ? (payload as any).restored_members_count
      : 0;

  return {
    success: (payload as any).success ?? true,
    truncatedCount,
    truncatedTables,
    preservedTables,
    restoredMembersCount,
  };
}

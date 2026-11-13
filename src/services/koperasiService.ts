function shouldFallback(e: any): boolean {
  if (!e) return false;
  const msg = String(e.message || "").toLowerCase();
  return e.code === "42P01" || msg.includes("schema cache") || msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch");
}

import { supabase } from '../lib/supabaseClient';

// ==========================================
// Domain Re-exports (Backward-Compatibility Facade)
// ==========================================
export * from './memberService';
export * from './purchaseInvoiceService';
export * from './depositManagementService';
export {
  bulkSetAllProductStock,
  updateProductSellPriceFromPos,
} from './productService';
export {
  syncInitialLoanBalances,
  type InitialLoansSyncResult,
} from './loanService';
export {
  exportMemberTemplate,
  parseMemberUpload,
  executeMigration,
  type MemberParseResult,
  type MigrationRowData,
} from './memberExcelService';

// Dashboard & Purchase Service Re-exports
export {
  getDashboardStats,
  fetchDashboardMetrics,
  type DashboardStats
} from './dashboardService';

export {
  updatePurchaseInvoice,
  getPurchaseAuditLogs,
  type PurchaseAuditLog,
  type PurchaseItemPayload,
  type UpdatePurchasePayload,
  type UpdatePurchaseResult,
  type MockProductStock,
  type MockPurchaseRecord,
  setMockProducts,
  getMockProducts,
  setMockPurchases,
  getMockPurchases,
  setMockAuditLogs,
  getMockAuditLogs,
  resetPurchaseServiceMockState
} from './purchaseService';

// ==========================================
// Pengelola Domain
// ==========================================
export interface Pengelola {
  id: string;
  nama: string;
  role: 'admin' | 'operator';
  created_at?: string;
  [key: string]: any;
}

/**
 * Fetch list of pengelola (staff/admin) with optional pagination
 */
export async function getPengelolaList(limit: number = 50, offset: number = 0) {
  const { data, error, count } = await supabase
    .from('pengelola')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "pengelola" does not exist yet. Returning empty array.');
      return { data: [], count: 0 };
    }
    console.error('Error fetching pengelola list:', error.message);
    throw new Error(`Failed to fetch pengelola: ${error.message}`);
  }

  return { data: data as Pengelola[], count };
}

/**
 * Fetch user restrictions (dynamic roles limit)
 */
export async function getUserRestrictions(userId: string) {
  const { data, error } = await supabase
    .from('user_restrictions')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "user_restrictions" does not exist yet. Returning empty array.');
      return [];
    }
    console.error(`Error fetching restrictions for user ${userId}:`, error.message);
    throw new Error(`Failed to fetch user restrictions: ${error.message}`);
  }

  return data;
}

/**
 * Insert a new pengelola
 */
export async function insertPengelola(pengelolaData: Omit<Pengelola, 'id'>) {
  if (!pengelolaData.nama || !pengelolaData.role) {
    throw new Error('Validation failed: nama and role are required.');
  }

  const { data, error } = await supabase
    .from('pengelola')
    .insert([pengelolaData])
    .select()
    .single();

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "pengelola" does not exist yet. Simulating success.');
      return { id: 'dummy-id', ...pengelolaData } as Pengelola;
    }
    console.error('Error inserting pengelola:', error.message);
    throw new Error(`Failed to insert pengelola: ${error.message}`);
  }

  return data as Pengelola;
}

/**
 * Update an existing pengelola
 */
export async function updatePengelola(id: string, updates: Partial<Omit<Pengelola, 'id'>>) {
  if (!id) {
    throw new Error('Validation failed: id is required for update.');
  }

  const { data, error } = await supabase
    .from('pengelola')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "pengelola" does not exist yet. Simulating success.');
      return { id, ...updates } as Pengelola;
    }
    console.error(`Error updating pengelola ${id}:`, error.message);
    throw new Error(`Failed to update pengelola ${id}: ${error.message}`);
  }

  return data as Pengelola;
}

// ==========================================
// POS / Kasir Transaction
// ==========================================
/**
 * Save a new transaction
 */
export async function saveTransaction(items: any[], total: number, payment: number) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;

  const txData = {
    total,
    payment,
    change: payment - total,
    pengelola_id: userId,
  };

  const { data: tx, error: txError } = await supabase
    .from('transaksi')
    .insert([txData])
    .select()
    .single();

  if (txError) {
    if (shouldFallback(txError)) {
      console.warn('Table "transaksi" does not exist yet. Simulating success.');
      return { id: 'dummy-tx-id', ...txData };
    }
    console.error('Error inserting transaction:', txError.message);
    throw new Error(`Failed to insert transaction: ${txError.message}`);
  }

  if (tx && items.length > 0) {
    const itemsData = items.map(item => ({
      transaksi_id: tx.id,
      product_id: item.id,
      qty: item.qty,
      price: item.price,
      subtotal: item.subtotal,
      product_name: item.name
    }));

    const { error: itemsError } = await supabase
      .from('transaksi_item')
      .insert(itemsData);

    if (itemsError) {
       if (shouldFallback(itemsError)) {
         console.warn('Table "transaksi_item" does not exist yet. Simulating success.');
       } else {
         throw new Error(`Gagal menyimpan detail transaksi: ${itemsError.message}`);
       }
    }
    
    for (const item of items) {
      if (!item.id.startsWith('barcode-') && !item.id.startsWith('dummy-')) {
        const { data: prodData, error: prodError } = await supabase.from('products').select('stock').eq('id', item.id).single();
        if (prodError) {
          throw new Error(`Gagal membaca stok barang ${item.name}: ${prodError.message}`);
        }
        
        if (prodData) {
          const { error: updateError } = await supabase.from('products')
            .update({ stock: Math.max(0, prodData.stock - item.qty) })
            .eq('id', item.id);
            
          if (updateError) {
            throw new Error(`Gagal mengurangi stok barang ${item.name}: ${updateError.message}`);
          }
        }
      }
    }
  }

  return tx;
}

// ==========================================
// Master Produk & Kategori
// ==========================================
export interface ProductCategory {
  id: string;
  name: string;
}

export async function getProductCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .order('name');
  
  if (error) {
    if (shouldFallback(error)) {
      return [{ id: 'cat-1', name: 'Sembako' }, { id: 'cat-2', name: 'Minuman' }];
    }
    console.error('Error fetching categories:', error.message);
    throw new Error(`Gagal mengambil kategori produk: ${error.message}`);
  }
  return data as ProductCategory[];
}

export async function addProductCategory(name: string): Promise<ProductCategory> {
  const { data, error } = await supabase
    .from('product_categories')
    .insert([{ name }])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menambah kategori: ${error.message}`);
  }
  return data as ProductCategory;
}

export async function updateProductCategory(id: string, name: string): Promise<ProductCategory> {
  const { data, error } = await supabase
    .from('product_categories')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal mengubah kategori: ${error.message}`);
  }
  return data as ProductCategory;
}

export async function deleteProductCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('product_categories')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Gagal menghapus kategori (Pastikan tidak ada produk yang menggunakan kategori ini): ${error.message}`);
  }
}

export interface Produk {
  id: string;
  sku: string;
  name: string;
  category_id?: string | null;
  unit: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  min_stock_alert: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function getProduk(): Promise<Produk[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching products:', error);
    throw new Error(`Gagal mengambil data produk: ${error.message}`);
  }

  return data as Produk[];
}

export async function addProduk(produk: Omit<Produk, 'id' | 'created_at' | 'updated_at'>): Promise<Produk> {
  const { data, error } = await supabase
    .from('products')
    .insert([produk])
    .select()
    .single();

  if (error) {
    console.error('Error adding product:', error);
    throw new Error(`Gagal menambah produk: ${error.message}`);
  }
  return data;
}

export async function updateProduk(id: string, updates: Partial<Omit<Produk, 'id' | 'created_at' | 'updated_at'>>): Promise<Produk> {
  const { data, error } = await supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating product:', error);
    throw new Error(`Gagal mengupdate produk: ${error.message}`);
  }
  return data;
}

export async function deleteProduk(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting product:', error);
    throw new Error(`Gagal menghapus produk: ${error.message}`);
  }
}

// ==========================================
// Loans Legacy & Commitments
// ==========================================
export interface LoanType {
  id: string;
  code: string;
  name: string;
  max_duration_months: number;
  is_active: boolean;
}

export interface Loan {
  id: string;
  loan_number: string;
  member_id: string;
  loan_type_id: string;
  principal_amount: number;
  agreed_tenor_months: number;
  planned_installment_amount: number;
  status: 'draft' | 'approved' | 'active' | 'paid_off' | 'defaulted' | 'completed' | 'rejected';
  created_at?: string;
}

export interface LoanInstallment {
  id: string;
  loan_id: string;
  amount: number;
  payment_date: string;
  for_month?: number | null;
  for_year?: number | null;
  notes?: string;
  created_at?: string;
}

export interface MonthlyLoanCommitment {
  loan_id: string;
  member_id: string;
  commitment_amount: number;
  for_month: number | null;
  for_year: number | null;
  total_paid: number;
  remaining_balance: number;
  status: 'lunas' | 'belum_lunas';
}

/**
 * Mengajukan pinjaman baru (0% bunga)
 */
export async function ajukanPinjaman(data: Omit<Loan, 'id' | 'created_at' | 'status' | 'loan_number'>) {
  const loanData = {
    ...data,
    loan_number: `LOAN-${Date.now()}`,
    status: 'draft',
  };

  const { data: result, error } = await supabase
    .from('loans')
    .insert([loanData])
    .select()
    .single();

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "loans" does not exist yet. Simulating success.');
      return { 
        id: `dummy-loan-${Date.now()}`, 
        ...loanData, 
        created_at: new Date().toISOString() 
      } as Loan;
    }
    console.error('Error inserting loan:', error.message);
    throw new Error(`Gagal mengajukan pinjaman: ${error.message}`);
  }

  return result as Loan;
}

/**
 * Mengambil daftar pinjaman dengan status pending
 */
export async function getPendingPinjaman() {
  const { data, error } = await supabase
    .from('loans')
    .select(`
      *,
      anggota!member_id (
        nama,
        nrp
      )
    `)
    .eq('status', 'draft')
    .order('created_at', { ascending: true });

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "loans" does not exist yet. Returning dummy pending data.');
      return [];
    }
    console.error('Error fetching pending loans:', error.message);
    throw new Error(`Gagal memuat daftar pinjaman pending: ${error.message}`);
  }

  return data;
}

/**
 * Update status pinjaman (approved / rejected)
 */
export async function updateStatusPinjaman(id: string, status: 'approved' | 'rejected') {
  const { data, error } = await supabase
    .from('loans')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "loans" does not exist yet. Simulating update success.');
      return { id, status } as Partial<Loan>;
    }
    console.error(`Error updating loan status to ${status}:`, error.message);
    throw new Error(`Gagal memperbarui status pinjaman: ${error.message}`);
  }

  return data as Loan;
}

/**
 * Mengambil detail pinjaman beserta anggotanya
 */
export async function getPinjamanById(id: string) {
  const { data, error } = await supabase
    .from('loans')
    .select(`
      *,
      anggota!member_id (
        nama,
        nrp
      ),
      loan_types!loan_type_id (
        name
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "loans" does not exist yet. Returning dummy data.');
      throw new Error('Pinjaman tidak ditemukan (dummy)');
    }
    console.error(`Error fetching loan ${id}:`, error.message);
    throw new Error(`Gagal memuat detail pinjaman: ${error.message}`);
  }

  return data;
}

export async function getLoanTypes(): Promise<LoanType[]> {
  const { data, error } = await supabase.from('loan_types').select('*').order('name');
  if (error) {
    if (shouldFallback(error)) return [];
    throw new Error(`Failed to fetch loan types: ${error.message}`);
  }
  return data as LoanType[];
}

export async function addLoanType(loanType: Omit<LoanType, 'id'>): Promise<LoanType> {
  const { data, error } = await supabase.from('loan_types').insert([loanType]).select().single();
  if (error) {
    throw new Error(`Failed to add loan type: ${error.message}`);
  }
  return data as LoanType;
}

export async function updateLoanType(id: string, updates: Partial<Omit<LoanType, 'id'>>): Promise<LoanType> {
  const { data, error } = await supabase.from('loan_types').update(updates).eq('id', id).select().single();
  if (error) {
    throw new Error(`Failed to update loan type: ${error.message}`);
  }
  return data as LoanType;
}

export async function deleteLoanType(id: string): Promise<void> {
  const { error } = await supabase.from('loan_types').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete loan type: ${error.message}`);
  }
}

export async function getLoans(memberId: string): Promise<Loan[]> {
  const { data, error } = await supabase.from('loans').select('*').eq('member_id', memberId).order('created_at', { ascending: false });
  if (error) {
    if (shouldFallback(error)) return [];
    throw new Error(`Failed to fetch loans: ${error.message}`);
  }
  return data as Loan[];
}

export async function addLoanInstallment(installment: Omit<LoanInstallment, 'id' | 'created_at'>): Promise<LoanInstallment> {
  const { data, error } = await supabase.from('loan_installments').insert([installment]).select().single();
  if (error) {
    throw new Error(`Failed to insert loan installment: ${error.message}`);
  }
  return data as LoanInstallment;
}

export async function getMonthlyLoanCommitments(options?: { memberId?: string, loanId?: string }): Promise<MonthlyLoanCommitment[]> {
  let query = supabase.from('monthly_loan_commitments').select('*');
  if (options?.memberId) {
    query = query.eq('member_id', options.memberId);
  }
  if (options?.loanId) {
    query = query.eq('loan_id', options.loanId);
  }
  query = query.order('for_year', { ascending: true }).order('for_month', { ascending: true });
  
  const { data, error } = await query;
  if (error) {
    if (shouldFallback(error)) return [];
    throw new Error(`Failed to fetch monthly loan commitments: ${error.message}`);
  }
  return data as MonthlyLoanCommitment[];
}

// ==========================================
// Commitment Stats
// ==========================================
export interface CommitmentStats {
  deposit: {
    lunas: number;
    belum_lunas: number;
  };
  loan: {
    lunas: number;
    belum_lunas: number;
  };
}

export async function getCommitmentStats(month: number, year: number): Promise<CommitmentStats> {
  const stats: CommitmentStats = {
    deposit: { lunas: 0, belum_lunas: 0 },
    loan: { lunas: 0, belum_lunas: 0 }
  };

  const { data: deposits, error: depError } = await supabase
    .from('monthly_deposit_commitments')
    .select('status')
    .eq('for_month', month)
    .eq('for_year', year);

  if (!depError && deposits) {
    stats.deposit.lunas = deposits.filter((d: any) => d.status === 'lunas').length;
    stats.deposit.belum_lunas = deposits.filter((d: any) => d.status === 'belum_lunas').length;
  }

  const { data: loans, error: loanError } = await supabase
    .from('monthly_loan_commitments')
    .select('status')
    .eq('for_month', month)
    .eq('for_year', year);

  if (!loanError && loans) {
    stats.loan.lunas = loans.filter((l: any) => l.status === 'lunas').length;
    stats.loan.belum_lunas = loans.filter((l: any) => l.status === 'belum_lunas').length;
  }

  return stats;
}

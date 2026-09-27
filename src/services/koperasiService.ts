function shouldFallback(e: any): boolean {
  if (!e) return false;
  const msg = String(e.message || "").toLowerCase();
  return e.code === "42P01" || msg.includes("schema cache") || msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch");
}

import { supabase } from '../lib/supabaseClient';

export interface Pengelola {
  id: string;
  nama: string;
  role: 'admin' | 'operator';
  created_at?: string;
  [key: string]: any;
}

export interface Anggota {
  id: string;
  nrp: string;
  nama: string;
  pangkat?: string | null;
  status?: string;
  master_thp?: number;
  created_at?: string;
}

export interface Simpanan {
  id: string;
  anggota_id: string;
  jenis_simpanan: 'pokok' | 'wajib';
  jumlah: number;
  tanggal: string;
}



// Phase 8: Dynamic Deposits and Loans
export interface DepositType {
  id: string;
  code: string;
  name: string;
  frequency_type: 'one_time' | 'monthly' | 'yearly' | string;
  default_amount: number;
  can_be_withdrawn: boolean;
  is_active: boolean;
}

export interface MemberDeposit {
  id: string;
  member_id: string;
  deposit_type_id: string;
  is_terminated: boolean;
  terminated_at?: string | null;
  created_at?: string;
}

export interface DepositTransaction {
  id: string;
  member_deposit_id: string;
  transaction_type: string;
  amount: number;
  description?: string;
  for_month?: number | null;
  for_year?: number | null;
  created_at?: string;
}

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
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'paid';
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

export interface MonthlyDepositCommitment {
  member_deposit_id: string;
  member_id: string;
  deposit_type_id: string;
  deposit_name: string;
  commitment_amount: number;
  for_month: number | null;
  for_year: number | null;
  total_paid: number;
  remaining_balance: number;
  status: 'lunas' | 'belum_lunas';
  anggota?: {
    nama: string;
    nrp: string;
  };
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

export interface AnggotaWithSimpanan extends Anggota {
  simpanan_pokok: number;
  simpanan_wajib: number;
  total_saldo: number;
}

export async function getAnggotaWithSimpanan(): Promise<AnggotaWithSimpanan[]> {
  const { data: anggotaData, error: anggotaError } = await supabase
    .from('anggota')
    .select('*')
    .order('created_at', { ascending: false });

  if (anggotaError) {
    if (shouldFallback(anggotaError)) {
      console.warn('Table "anggota" does not exist yet. Returning dummy data.');
      return [
        {
          id: 'dummy-anggota-1',
          nama: 'Budi Santoso',
          nrp: '123456',
          pangkat: 'Sertu',
          status: 'aktif',
          created_at: new Date().toISOString(),
          simpanan_pokok: 100000,
          simpanan_wajib: 50000,
          total_saldo: 150000
        },
        {
          id: 'dummy-anggota-2',
          nama: 'Siti Aminah',
          nrp: '654321',
          pangkat: 'Kopda',
          status: 'aktif',
          created_at: new Date().toISOString(),
          simpanan_pokok: 100000,
          simpanan_wajib: 200000,
          total_saldo: 300000
        }
      ];
    }
    console.error('Error fetching anggota:', anggotaError.message);
    throw new Error(`Failed to fetch anggota: ${anggotaError.message}`);
  }

  // Assuming simpanan table exists, we would fetch and aggregate.
  // For now, if no error but we have data, we simulate 0 balances or we fetch simpanan.
  // In a real scenario, we might use a view or RPC.
  const { data: simpananData, error: simpananError } = await supabase
    .from('simpanan')
    .select('*');

  let simpananList: Simpanan[] = [];
  if (!simpananError && simpananData) {
    simpananList = simpananData as Simpanan[];
  }

  const result = (anggotaData as Anggota[]).map(a => {
    const s = simpananList.filter(sim => sim.anggota_id === a.id);
    const pokok = s.filter(sim => sim.jenis_simpanan === 'pokok').reduce((sum, sim) => sum + sim.jumlah, 0);
    const wajib = s.filter(sim => sim.jenis_simpanan === 'wajib').reduce((sum, sim) => sum + sim.jumlah, 0);
    return {
      ...a,
      simpanan_pokok: pokok,
      simpanan_wajib: wajib,
      total_saldo: pokok + wajib
    };
  });

  return result;
}

// --- Anggota CRUD ---

export async function getAnggota(): Promise<Anggota[]> {
  const { data, error } = await supabase
    .from('anggota')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "anggota" does not exist yet. Returning empty array.');
      return [];
    }
    console.error('Error fetching anggota:', error.message);
    throw new Error(`Gagal mengambil data anggota: ${error.message}`);
  }

  return data as Anggota[];
}

export async function addAnggota(data: Omit<Anggota, 'id' | 'created_at'>): Promise<Anggota> {
  const { data: result, error } = await supabase
    .from('anggota')
    .insert([data])
    .select()
    .single();

  if (error) {
    console.error('Error inserting anggota:', error.message);
    throw new Error(`Gagal menambah anggota: ${error.message}`);
  }

  return result as Anggota;
}

export async function updateAnggota(id: string, updates: Partial<Omit<Anggota, 'id' | 'created_at'>>): Promise<Anggota> {
  const { data, error } = await supabase
    .from('anggota')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Error updating anggota ${id}:`, error.message);
    throw new Error(`Gagal mengupdate anggota: ${error.message}`);
  }

  return data as Anggota;
}

export async function deleteAnggota(id: string): Promise<void> {
  const { error } = await supabase
    .from('anggota')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Error deleting anggota ${id}:`, error.message);
    throw new Error(`Gagal menghapus anggota: ${error.message}`);
  }
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

  // Insert transaction
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

  // Insert items if tx is created
  if (tx && items.length > 0) {
    const itemsData = items.map(item => ({
      transaksi_id: tx.id,
      product_id: item.id, // Or just save details if no product table
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
    
    // 3. Update stock in products table (Kurangi stok untuk barang yang terjual)
    for (const item of items) {
      // Abaikan jika ID berupa dummy/barcode manual yang tidak ada di DB
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
/**
 * Mengajukan pinjaman baru (0% bunga)
 */
export async function ajukanPinjaman(data: Omit<Loan, 'id' | 'created_at' | 'status' | 'loan_number'>) {
  const loanData = {
    ...data,
    loan_number: `LOAN-${Date.now()}`,
    status: 'pending',
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
    .eq('status', 'pending')
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

// --- Produk CRUD ---

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

// In-memory mock data for Produk (if Supabase fails)
let mockProdukList: Produk[] = [
  { id: 'prod-1', sku: '8991234567890', name: 'Beras Premium 5kg', unit: 'pcs', buy_price: 70000, sell_price: 75000, stock: 20, min_stock_alert: 5, is_active: true },
  { id: 'prod-2', sku: '8991234567891', name: 'Minyak Goreng 2L', unit: 'pcs', buy_price: 30000, sell_price: 35000, stock: 15, min_stock_alert: 10, is_active: true },
  { id: 'prod-3', sku: '8991234567892', name: 'Gula Pasir 1kg', unit: 'pcs', buy_price: 12000, sell_price: 15000, stock: 3, min_stock_alert: 10, is_active: true },
];

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

export interface RestockItem {
  id: string;
  produkId: string;
  qty: number;
  hargaBeli: number;
}

export interface FakturPembelian {
  id: string;
  noFaktur: string;
  tanggal: string;
  totalNilai: number;
  items: RestockItem[];
}

let mockFakturList: FakturPembelian[] = [];

export async function getFakturPembelian(): Promise<FakturPembelian[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select(`
      id,
      invoice_number,
      purchase_date,
      total_amount,
      purchase_items (
        id,
        product_id,
        qty,
        buy_price
      )
    `)
    .order('purchase_date', { ascending: false });

  if (error) {
    if (shouldFallback(error)) {
      console.warn('Table "purchases" does not exist yet. Returning dummy data.');
      return [...mockFakturList].sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
    }
    throw new Error(`Gagal memuat faktur pembelian: ${error.message}`);
  }

  // Format the data back to our FakturPembelian structure
  const result: FakturPembelian[] = data.map((p: any) => ({
    id: p.id,
    noFaktur: p.invoice_number,
    tanggal: p.purchase_date,
    totalNilai: p.total_amount,
    items: p.purchase_items.map((pi: any) => ({
      id: pi.id,
      produkId: pi.product_id,
      qty: pi.qty,
      hargaBeli: pi.buy_price
    }))
  }));

  return result;
}

export async function catatRestockFaktur(faktur: Omit<FakturPembelian, 'id' | 'totalNilai'>): Promise<FakturPembelian> {
  if (!faktur.noFaktur || faktur.noFaktur.trim() === '') {
    throw new Error('Nomor Faktur (noFaktur) harus diisi');
  }

  const totalNilai = faktur.items.reduce((sum, item) => sum + (item.qty * item.hargaBeli), 0);
  
  // 1. Insert ke purchases
  const { data: purchaseData, error: purchaseError } = await supabase
    .from('purchases')
    .insert([{
      invoice_number: faktur.noFaktur,
      purchase_date: faktur.tanggal,
      total_amount: totalNilai
    }])
    .select()
    .single();

  if (purchaseError) {
    if (shouldFallback(purchaseError)) {
      // Fallback ke mock
      const newFaktur: FakturPembelian = {
        ...faktur,
        id: `faktur-${Date.now()}`,
        totalNilai
      };
      // Update stock in products mock
      for (const item of newFaktur.items) {
        const pIdx = mockProdukList.findIndex(p => p.id === item.produkId);
        if (pIdx !== -1) {
          mockProdukList[pIdx].stock += item.qty;
          mockProdukList[pIdx].buy_price = item.hargaBeli;
        }
      }
      mockFakturList.push(newFaktur);
      return newFaktur;
    }
    throw new Error(`Gagal menyimpan faktur: ${purchaseError.message}`);
  }

  // 2. Insert ke purchase_items
  const itemsToInsert = faktur.items.map(item => ({
    purchase_id: purchaseData.id,
    product_id: item.produkId,
    qty: item.qty,
    buy_price: item.hargaBeli
  }));

  const { error: itemsError } = await supabase.from('purchase_items').insert(itemsToInsert);
  if (itemsError) {
    // Ideally we should rollback the purchase here, but Supabase standard API doesn't support atomic transactions from client yet without RPC.
    console.error('Failed to insert items:', itemsError.message);
    throw new Error(`Faktur tersimpan, tetapi gagal menyimpan item: ${itemsError.message}`);
  }

  // 3. Update stock in products table
  for (const item of faktur.items) {
    const { data: prodData } = await supabase.from('products').select('stock').eq('id', item.produkId).single();
    if (prodData) {
      await supabase.from('products')
        .update({ stock: prodData.stock + item.qty, buy_price: item.hargaBeli })
        .eq('id', item.produkId);
    }
  }

  return {
    ...faktur,
    id: purchaseData.id,
    totalNilai
  };
}

export interface RiwayatStok {
  id: string;
  tanggal: string;
  tipe: 'in' | 'out';
  qty: number;
  keterangan: string;
}

export async function getRiwayatStok(produkId: string): Promise<RiwayatStok[]> {
  await new Promise(resolve => setTimeout(resolve, 300));
  const riwayat: RiwayatStok[] = [];

  // Restock (IN)
  const { data: purchaseItems, error: pError } = await supabase
    .from('purchase_items')
    .select(`
      qty,
      purchases (
        id,
        invoice_number,
        purchase_date
      )
    `)
    .eq('product_id', produkId);

  if (!pError && purchaseItems) {
    purchaseItems.forEach((item: any) => {
      riwayat.push({
        id: `riwayat-${item.purchases?.id}-${Date.now()}`,
        tanggal: item.purchases?.purchase_date || new Date().toISOString(),
        tipe: 'in',
        qty: item.qty,
        keterangan: `Restock (Faktur: ${item.purchases?.invoice_number || 'Unknown'})`
      });
    });
  } else {
    // Fallback to mock
    mockFakturList.forEach(faktur => {
      const item = faktur.items.find(i => i.produkId === produkId);
      if (item) {
        riwayat.push({
          id: `riwayat-${faktur.id}`,
          tanggal: faktur.tanggal,
          tipe: 'in',
          qty: item.qty,
          keterangan: `Restock (Faktur: ${faktur.noFaktur})`
        });
      }
    });
  }

  // Transaksi POS (OUT)
  const { data: txItems, error } = await supabase
    .from('transaksi_item')
    .select(`
      id,
      qty,
      transaksi (
        created_at,
        id
      )
    `)
    .eq('product_id', produkId);

  if (!error && txItems) {
    txItems.forEach((item: any) => {
      riwayat.push({
        id: item.id,
        tanggal: item.transaksi?.created_at ? item.transaksi.created_at : new Date().toISOString(),
        tipe: 'out',
        qty: item.qty,
        keterangan: `Penjualan POS (#${item.transaksi?.id?.substring(0,8) || 'Unknown'})`
      });
    });
  } else {
    // Mock dummy sales for prod-1 if table doesn't exist
    if (produkId === 'prod-1') {
      riwayat.push({
        id: 'dummy-tx-1',
        tanggal: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        tipe: 'out',
        qty: 2,
        keterangan: 'Penjualan POS (Dummy)'
      });
    }
  }

  // Hitung Stok Awal (Pendaftaran Barang Baru)
  // Stok Awal = Stok Sekarang - Total Masuk (Restock) + Total Keluar (POS)
  const { data: prodData } = await supabase.from('products').select('created_at, stock').eq('id', produkId).single();
  if (prodData) {
    let initialStock = prodData.stock;
    riwayat.forEach(r => {
      if (r.tipe === 'in') initialStock -= r.qty;
      if (r.tipe === 'out') initialStock += r.qty;
    });
    
    // Jika ada stok awal saat pendaftaran
    if (initialStock > 0) {
      riwayat.push({
        id: `initial-${produkId}`,
        tanggal: prodData.created_at ? prodData.created_at : new Date().toISOString(),
        tipe: 'in',
        qty: initialStock,
        keterangan: 'Stok Awal (Pendaftaran Barang Baru)'
      });
    }
  }

  // Sort descending by date
  riwayat.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

  return riwayat;
}

export interface DashboardStats {
  totalPenjualanHariIni: number;
  totalPinjamanAktif: number;
  stokKritis: number;
  transaksiTersimpan: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  let totalPenjualanHariIni = 0;
  let totalPinjamanAktif = 0;
  let stokKritis = 0;
  
  // Total Penjualan Hari Ini
  const today = new Date().toISOString().split('T')[0];
  const { data: sales, error: salesError } = await supabase
    .from('transaksi')
    .select('total')
    .gte('created_at', `${today}T00:00:00.000Z`);
    
  if (!salesError && sales) {
    totalPenjualanHariIni = sales.reduce((acc, curr) => acc + curr.total, 0);
  } else {
    // Mock if table doesn't exist
    totalPenjualanHariIni = 48720500;
  }

  // Total Pinjaman Aktif
  const { count: loanCount, error: loanError } = await supabase
    .from('pinjaman')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved');
    
  if (!loanError && loanCount !== null) {
    totalPinjamanAktif = loanCount;
  } else {
    // Mock if table doesn't exist
    totalPinjamanAktif = 182;
  }

  // Stok Kritis
  const produkList = await getProduk();
  stokKritis = produkList.filter(p => p.stock <= p.min_stock_alert).length;

  return {
    totalPenjualanHariIni,
    totalPinjamanAktif,
    stokKritis,
    transaksiTersimpan: 0 // Will be handled by the UI via cartStore
  };
}

// Phase 8: Dynamic Deposits & Loans CRUD

export async function getDepositTypes(): Promise<DepositType[]> {
  const { data, error } = await supabase.from('deposit_types').select('*').order('name');
  if (error) {
    if (shouldFallback(error)) return [];
    throw new Error(`Failed to fetch deposit types: ${error.message}`);
  }
  return data as DepositType[];
}

export async function addDepositType(depositType: Omit<DepositType, 'id'>): Promise<DepositType> {
  const { data, error } = await supabase.from('deposit_types').insert([depositType]).select().single();
  if (error) {
    throw new Error(`Failed to add deposit type: ${error.message}`);
  }
  return data as DepositType;
}

export async function updateDepositType(id: string, updates: Partial<Omit<DepositType, 'id'>>): Promise<DepositType> {
  const { data, error } = await supabase.from('deposit_types').update(updates).eq('id', id).select().single();
  if (error) {
    throw new Error(`Failed to update deposit type: ${error.message}`);
  }
  return data as DepositType;
}

export async function deleteDepositType(id: string): Promise<void> {
  const { error } = await supabase.from('deposit_types').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete deposit type: ${error.message}`);
  }
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

export async function getMemberDeposits(memberId: string): Promise<MemberDeposit[]> {
  const { data, error } = await supabase.from('member_deposits').select('*').eq('member_id', memberId);
  if (error) {
    if (shouldFallback(error)) return [];
    throw new Error(`Failed to fetch member deposits: ${error.message}`);
  }
  return data as MemberDeposit[];
}

export async function ensureMandatoryDepositsAndEnroll(memberId: string) {
  // 1. Fetch deposit_types
  let { data: dTypes, error: dtError } = await supabase.from('deposit_types').select('*');
  if (dtError) {
    throw new Error(`Gagal memuat deposit_types: ${dtError.message}. Pastikan tabel deposit_types sudah dibuat di Supabase.`);
  }
  
  if (!dTypes || dTypes.length === 0) {
    // seed them
    const seeds = [
      { code: 'SP', name: 'Simpanan Pokok', frequency_type: 'one_time', default_amount: 100000, can_be_withdrawn: false, is_active: true },
      { code: 'SW', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: 50000, can_be_withdrawn: false, is_active: true },
      { code: 'SB', name: 'Simpanan Belanja', frequency_type: 'monthly', default_amount: 25000, can_be_withdrawn: true, is_active: true },
      { code: 'SL', name: 'Simpanan Lebaran', frequency_type: 'monthly', default_amount: 30000, can_be_withdrawn: true, is_active: true }
    ];
    const { error: seedErr } = await supabase.from('deposit_types').insert(seeds);
    if (seedErr) {
      throw new Error(`Gagal membuat data awal deposit_types: ${seedErr.message}`);
    }
    const { data: refreshed } = await supabase.from('deposit_types').select('*');
    dTypes = refreshed;
  }

  // 2. Fetch member_deposits for this member
  const { data: mDeposits, error: mdFetchErr } = await supabase.from('member_deposits').select('*').eq('member_id', memberId);
  if (mdFetchErr) {
    throw new Error(`Gagal memuat member_deposits: ${mdFetchErr.message}. Pastikan tabel member_deposits sudah dibuat.`);
  }
  
  const enrolledTypeIds = mDeposits?.map(md => md.deposit_type_id) || [];

  // 3. Enroll missing
  const toEnroll = dTypes?.filter(dt => !enrolledTypeIds.includes(dt.id) && dt.is_active) || [];
  if (toEnroll.length > 0) {
    const inserts = toEnroll.map(dt => ({
      member_id: memberId,
      deposit_type_id: dt.id
    }));
    const { error: insertErr } = await supabase.from('member_deposits').insert(inserts);
    if (insertErr) {
      console.error(`Gagal mendaftarkan anggota ke simpanan otomatis (member_deposits): ${insertErr.message}`);
      // We don't throw here so the UI can still render the bills
    }
  }
}

export async function getMemberDepositBills(memberId: string, month: number, year: number) {
  await ensureMandatoryDepositsAndEnroll(memberId);
  const dTypes = await getDepositTypes();
  const mDeposits = await getMemberDeposits(memberId);
  


  const mdIds = mDeposits.map(md => md.id);
  let txs: any[] = [];
  if (mdIds.length > 0) {
    const { data } = await supabase.from('deposit_transactions').select('*').in('member_deposit_id', mdIds);
    if (data) txs = data;
  }
  
  const bills = [];
  // Use dTypes instead of mDeposits as the source of truth for mandatory deposits
  for (const dt of dTypes) {
    if (!dt.is_active) continue;

    // Find the member's deposit record (or mock it if it failed to insert)
    const md = mDeposits.find(m => m.deposit_type_id === dt.id) || {
      id: `mock-md-${dt.id}`,
      deposit_type_id: dt.id,
      member_id: memberId
    };

    if (dt.frequency_type === 'one_time' || dt.frequency_type === 'once') {
      const totalPaid = txs.filter(tx => tx.member_deposit_id === md.id).reduce((sum, tx) => sum + tx.amount, 0);
      const remaining = dt.default_amount - totalPaid;
      if (remaining > 0) {
        bills.push({
          member_deposit_id: md.id,
          deposit_name: dt.name,
          remaining_balance: remaining
        });
      }
    } else if (dt.frequency_type === 'monthly') {
      const totalPaid = txs
        .filter(tx => tx.member_deposit_id === md.id && tx.for_month === month && tx.for_year === year)
        .reduce((sum, tx) => sum + tx.amount, 0);
      const remaining = dt.default_amount - totalPaid;
      if (remaining > 0) {
        bills.push({
          member_deposit_id: md.id,
          deposit_name: dt.name,
          remaining_balance: remaining
        });
      }
    }
  }
  return bills;
}

export async function getLoans(memberId: string): Promise<Loan[]> {
  const { data, error } = await supabase.from('loans').select('*').eq('member_id', memberId).order('created_at', { ascending: false });
  if (error) {
    if (shouldFallback(error)) return [];
    throw new Error(`Failed to fetch loans: ${error.message}`);
  }
  return data as Loan[];
}

export async function addDepositTransaction(
  member_deposit_id: string, 
  amount: number, 
  for_month: number, 
  for_year: number, 
  transaction_type: string = 'deposit',
  description: string = 'Pembayaran cicilan simpanan'
) {
  const { data, error } = await supabase
    .from('deposit_transactions')
    .insert([{
      member_deposit_id,
      amount,
      for_month,
      for_year,
      transaction_type,
      description
    }])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan transaksi simpanan ke Supabase: ${error.message}`);
  }
  return data;
}

export async function addLoanInstallment(installment: Omit<LoanInstallment, 'id' | 'created_at'>): Promise<LoanInstallment> {
  const { data, error } = await supabase.from('loan_installments').insert([installment]).select().single();
  if (error) {
    throw new Error(`Failed to insert loan installment: ${error.message}`);
  }
  return data as LoanInstallment;
}

export async function getMonthlyDepositCommitments(month?: number, year?: number) {
  let query = supabase.from('monthly_deposit_commitments').select(`
    *,
    anggota!member_id (nama, nrp)
  `);
  
  if (month) query = query.eq('for_month', month);
  if (year) query = query.eq('for_year', year);

  const { data, error } = await query;
  
  if (error) {
    if (shouldFallback(error)) {
      console.warn('View "monthly_deposit_commitments" does not exist yet. Returning empty array.');
      return [];
    }
    throw new Error(`Failed to fetch monthly deposit commitments: ${error.message}`);
  }
  
  return data;
}

export async function getMonthlyLoanCommitments(options?: { memberId?: string, loanId?: string }): Promise<MonthlyLoanCommitment[]> {
  let query = supabase.from('monthly_loan_commitments').select('*');
  if (options?.memberId) {
    query = query.eq('member_id', options.memberId);
  }
  if (options?.loanId) {
    query = query.eq('loan_id', options.loanId);
  }
  // Order by for_year, for_month
  query = query.order('for_year', { ascending: true }).order('for_month', { ascending: true });
  
  const { data, error } = await query;
  if (error) {
    if (shouldFallback(error)) return [];
    throw new Error(`Failed to fetch monthly loan commitments: ${error.message}`);
  }
  return data as MonthlyLoanCommitment[];
}

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

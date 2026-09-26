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
  nama: string;
  no_anggota: string;
  created_at?: string;
}

export interface Simpanan {
  id: string;
  anggota_id: string;
  jenis_simpanan: 'pokok' | 'wajib';
  jumlah: number;
  tanggal: string;
}

export interface Pinjaman {
  id: string;
  anggota_id: string;
  jumlah: number;
  tenor_bulan: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  created_at?: string;
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
    if (anggotaError.code === '42P01' || anggotaError.message.includes('schema cache')) {
      console.warn('Table "anggota" does not exist yet. Returning dummy data.');
      return [
        {
          id: 'dummy-anggota-1',
          nama: 'Budi Santoso',
          no_anggota: 'A-001',
          created_at: new Date().toISOString(),
          simpanan_pokok: 100000,
          simpanan_wajib: 50000,
          total_saldo: 150000
        },
        {
          id: 'dummy-anggota-2',
          nama: 'Siti Aminah',
          no_anggota: 'A-002',
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
    if (error.code === '42P01' || error.message.includes('schema cache')) {
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
    if (error.code === '42P01' || error.message.includes('schema cache')) {
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
    if (error.code === '42P01' || error.message.includes('schema cache')) {
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
    if (error.code === '42P01' || error.message.includes('schema cache')) {
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
    if (txError.code === '42P01' || txError.message.includes('schema cache')) {
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
       if (itemsError.code === '42P01' || itemsError.message.includes('schema cache')) {
         console.warn('Table "transaksi_item" does not exist yet. Simulating success.');
       } else {
         console.error('Error inserting transaction items:', itemsError.message);
         // not throwing to keep transaction alive, but should handle properly in real prod
       }
    }
  }

  return tx;
}

/**
 * Mengajukan pinjaman baru (0% bunga)
 */
export async function ajukanPinjaman(data: Omit<Pinjaman, 'id' | 'created_at' | 'status'>) {
  const pinjamanData = {
    ...data,
    status: 'pending',
  };

  const { data: result, error } = await supabase
    .from('pinjaman')
    .insert([pinjamanData])
    .select()
    .single();

  if (error) {
    if (error.code === '42P01' || error.message.includes('schema cache')) {
      console.warn('Table "pinjaman" does not exist yet. Simulating success.');
      return { 
        id: `dummy-pinjaman-${Date.now()}`, 
        ...pinjamanData, 
        created_at: new Date().toISOString() 
      } as Pinjaman;
    }
    console.error('Error inserting pinjaman:', error.message);
    throw new Error(`Gagal mengajukan pinjaman: ${error.message}`);
  }

  return result as Pinjaman;
}

/**
 * Mengambil daftar pinjaman dengan status pending
 */
export async function getPendingPinjaman() {
  const { data, error } = await supabase
    .from('pinjaman')
    .select(`
      *,
      anggota (
        nama,
        no_anggota
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    if (error.code === '42P01' || error.message.includes('schema cache')) {
      console.warn('Table "pinjaman" does not exist yet. Returning dummy pending data.');
      return [
        {
          id: 'dummy-pinjaman-1',
          anggota_id: 'dummy-anggota-1',
          jumlah: 5000000,
          tenor_bulan: 12,
          status: 'pending',
          created_at: new Date().toISOString(),
          anggota: { nama: 'Budi Santoso', no_anggota: 'A-001' }
        },
        {
          id: 'dummy-pinjaman-2',
          anggota_id: 'dummy-anggota-2',
          jumlah: 2000000,
          tenor_bulan: 6,
          status: 'pending',
          created_at: new Date().toISOString(),
          anggota: { nama: 'Siti Aminah', no_anggota: 'A-002' }
        }
      ];
    }
    console.error('Error fetching pending pinjaman:', error.message);
    throw new Error(`Gagal memuat daftar pinjaman pending: ${error.message}`);
  }

  return data;
}

/**
 * Update status pinjaman (approved / rejected)
 */
export async function updateStatusPinjaman(id: string, status: 'approved' | 'rejected') {
  const { data, error } = await supabase
    .from('pinjaman')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '42P01' || error.message.includes('schema cache')) {
      console.warn('Table "pinjaman" does not exist yet. Simulating update success.');
      return { id, status } as Partial<Pinjaman>;
    }
    console.error(`Error updating pinjaman status to ${status}:`, error.message);
    throw new Error(`Gagal memperbarui status pinjaman: ${error.message}`);
  }

  return data as Pinjaman;
}

export interface Angsuran {
  id: string;
  pinjaman_id: string;
  bulan_ke: number;
  jumlah_bayar: number;
  tanggal_bayar: string | null;
  status: 'belum' | 'lunas';
}

/**
 * Mengambil jadwal angsuran berdasarkan pinjaman_id
 */
export async function getJadwalAngsuran(pinjaman_id: string, jumlah_pinjaman: number, tenor_bulan: number): Promise<Angsuran[]> {
  const { data, error } = await supabase
    .from('angsuran')
    .select('*')
    .eq('pinjaman_id', pinjaman_id)
    .order('bulan_ke', { ascending: true });

  if (error) {
    if (error.code === '42P01' || error.message.includes('schema cache')) {
      console.warn('Table "angsuran" does not exist yet. Generating dummy schedule.');
      // Generate dummy schedule based on jumlah / tenor
      const cicilanPerBulan = Math.floor(jumlah_pinjaman / tenor_bulan);
      const schedule: Angsuran[] = [];
      for (let i = 1; i <= tenor_bulan; i++) {
        schedule.push({
          id: `dummy-angsuran-${pinjaman_id}-${i}`,
          pinjaman_id,
          bulan_ke: i,
          jumlah_bayar: cicilanPerBulan,
          tanggal_bayar: null,
          status: 'belum'
        });
      }
      return schedule;
    }
    console.error('Error fetching jadwal angsuran:', error.message);
    throw new Error(`Gagal memuat jadwal angsuran: ${error.message}`);
  }

  return data as Angsuran[];
}

/**
 * Membayar angsuran bulan tertentu
 */
export async function bayarAngsuran(angsuran_id: string, _jumlah: number) {
  const { data, error } = await supabase
    .from('angsuran')
    .update({ 
      status: 'lunas',
      tanggal_bayar: new Date().toISOString()
    })
    .eq('id', angsuran_id)
    .select()
    .single();

  if (error) {
    if (error.code === '42P01' || error.message.includes('schema cache')) {
      console.warn('Table "angsuran" does not exist yet. Simulating payment success.');
      return { id: angsuran_id, status: 'lunas', tanggal_bayar: new Date().toISOString() };
    }
    console.error(`Error updating angsuran ${angsuran_id}:`, error.message);
    throw new Error(`Gagal membayar angsuran: ${error.message}`);
  }

  return data;
}

/**
 * Mengambil detail pinjaman beserta anggotanya
 */
export async function getPinjamanById(id: string) {
  const { data, error } = await supabase
    .from('pinjaman')
    .select(`
      *,
      anggota (
        nama,
        no_anggota
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === '42P01' || error.message.includes('schema cache')) {
      console.warn('Table "pinjaman" does not exist yet. Returning dummy data.');
      return {
        id,
        anggota_id: 'dummy-anggota',
        jumlah: 12000000,
        tenor_bulan: 12,
        status: 'approved',
        created_at: new Date().toISOString(),
        anggota: { nama: 'Budi Santoso', no_anggota: 'A-001' }
      };
    }
    console.error(`Error fetching pinjaman ${id}:`, error.message);
    throw new Error(`Gagal memuat detail pinjaman: ${error.message}`);
  }

  return data;
}

// --- Produk CRUD ---

export interface Produk {
  id: string;
  nama: string;
  barcode: string;
  hargaJual: number;
  stok: number;
  stokMinimum: number;
}

// In-memory mock data for Produk
let mockProdukList: Produk[] = [
  { id: 'prod-1', nama: 'Beras Premium 5kg', barcode: '8991234567890', hargaJual: 75000, stok: 20, stokMinimum: 5 },
  { id: 'prod-2', nama: 'Minyak Goreng 2L', barcode: '8991234567891', hargaJual: 35000, stok: 15, stokMinimum: 10 },
  { id: 'prod-3', nama: 'Gula Pasir 1kg', barcode: '8991234567892', hargaJual: 15000, stok: 3, stokMinimum: 10 },
];

export async function getProduk(): Promise<Produk[]> {
  // Simulating network delay
  await new Promise(resolve => setTimeout(resolve, 300));
  return [...mockProdukList];
}

export async function addProduk(produk: Omit<Produk, 'id'>): Promise<Produk> {
  await new Promise(resolve => setTimeout(resolve, 300));
  const newProduk = {
    ...produk,
    id: `prod-${Date.now()}`
  };
  mockProdukList.push(newProduk);
  return newProduk;
}

export async function updateProduk(id: string, updates: Partial<Omit<Produk, 'id'>>): Promise<Produk> {
  await new Promise(resolve => setTimeout(resolve, 300));
  const index = mockProdukList.findIndex(p => p.id === id);
  if (index === -1) {
    throw new Error('Produk tidak ditemukan');
  }
  mockProdukList[index] = { ...mockProdukList[index], ...updates };
  return mockProdukList[index];
}

export async function deleteProduk(id: string): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 300));
  mockProdukList = mockProdukList.filter(p => p.id !== id);
}

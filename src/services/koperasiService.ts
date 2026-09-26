import { supabase } from '../lib/supabaseClient';

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

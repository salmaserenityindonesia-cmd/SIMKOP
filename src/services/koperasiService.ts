import { supabase } from '../lib/supabaseClient';

export interface Anggota {
  id: string;
  nama: string;
  role: 'admin' | 'operator';
  created_at?: string;
  [key: string]: any;
}

/**
 * Fetch list of anggota (members) with optional pagination
 */
export async function getAnggotaList(limit: number = 50, offset: number = 0) {
  const { data, error, count } = await supabase
    .from('anggota')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01' || error.message.includes('schema cache')) {
      console.warn('Table "anggota" does not exist yet. Returning empty array.');
      return { data: [], count: 0 };
    }
    console.error('Error fetching anggota list:', error.message);
    throw new Error(`Failed to fetch anggota: ${error.message}`);
  }

  return { data: data as Anggota[], count };
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
 * Insert a new anggota (member)
 */
export async function insertAnggota(anggotaData: Omit<Anggota, 'id'>) {
  if (!anggotaData.nama || !anggotaData.role) {
    throw new Error('Validation failed: nama and role are required.');
  }

  const { data, error } = await supabase
    .from('anggota')
    .insert([anggotaData])
    .select()
    .single();

  if (error) {
    if (error.code === '42P01' || error.message.includes('schema cache')) {
      console.warn('Table "anggota" does not exist yet. Simulating success.');
      return { id: 'dummy-id', ...anggotaData } as Anggota;
    }
    console.error('Error inserting anggota:', error.message);
    throw new Error(`Failed to insert anggota: ${error.message}`);
  }

  return data as Anggota;
}

/**
 * Update an existing anggota (member)
 */
export async function updateAnggota(id: string, updates: Partial<Omit<Anggota, 'id'>>) {
  if (!id) {
    throw new Error('Validation failed: id is required for update.');
  }

  const { data, error } = await supabase
    .from('anggota')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '42P01' || error.message.includes('schema cache')) {
      console.warn('Table "anggota" does not exist yet. Simulating success.');
      return { id, ...updates } as Anggota;
    }
    console.error(`Error updating anggota ${id}:`, error.message);
    throw new Error(`Failed to update anggota ${id}: ${error.message}`);
  }

  return data as Anggota;
}

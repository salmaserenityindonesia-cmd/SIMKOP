import { supabase } from '../lib/supabaseClient';

export const BACKUP_TABLES = [
  'anggota',
  'pengelola',
  'deposit_types',
  'member_deposits',
  'deposit_transactions',
  'loan_types',
  'loans',
  'loan_schedules',
  'loan_installments',
  'loan_repayments',
  'monthly_deposit_commitments',
  'monthly_loan_commitments',
  'product_categories',
  'products',
  'sales',
  'sale_items',
  'cash_flow'
];

async function fetchAllRows(tableName: string) {
  let allData: any[] = [];
  let from = 0;
  const limit = 1000;
  let fetchMore = true;

  while (fetchMore) {
    const to = from + limit - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, to);

    if (error) {
      console.error(`Error fetching data for ${tableName}:`, error);
      throw error;
    }
    
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += limit;
      if (data.length < limit) {
        fetchMore = false;
      }
    } else {
      fetchMore = false;
    }
  }

  return allData;
}

export async function generateDatabaseBackup(): Promise<string> {
  const backupData: Record<string, any[]> = {};

  for (const table of BACKUP_TABLES) {
    try {
      backupData[table] = await fetchAllRows(table);
    } catch (error: any) {
      throw new Error(`Gagal membackup tabel ${table}: ${error.message}`);
    }
  }

  const backupObject = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    data: backupData
  };

  const jsonString = JSON.stringify(backupObject, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  return URL.createObjectURL(blob);
}

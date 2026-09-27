import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient'; // Assuming standard supabase client location

export type ReconciliationResult = {
  nrp: string;
  nama: string;
  take_home_pay: number | null;
  excel_account_number: string | null;
  db_account_number: string | null;
  status: 'MATCH' | 'NOT_FOUND' | 'CONFLICT';
};

export const parseSalaryReconciliationFile = async (file: File): Promise<ReconciliationResult[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
        throw new Error('Worksheet tidak ditemukan dalam file Excel');
    }

    const results: ReconciliationResult[] = [];
    const nrpList: string[] = [];

    // Temporary store from excel
    const excelDataMap = new Map<string, any>();

    worksheet.eachRow((row, rowNumber) => {
      // Skip header row
      if (rowNumber === 1) return;

      let nrp = row.getCell(1).value?.toString() || '';
      // Clean up string representations if they look like formulas or rich text
      if (typeof row.getCell(1).value === 'object' && row.getCell(1).value !== null) {
          const val: any = row.getCell(1).value;
          nrp = val.result || val.text || nrp;
      }
      
      let nama = row.getCell(2).value?.toString() || '';
      let account_number = row.getCell(3).value?.toString() || '';
      let thp_str = row.getCell(4).value?.toString() || '';
      
      const thp = thp_str ? parseFloat(thp_str.replace(/[^0-9.-]+/g, '')) : null;

      if (nrp) {
        nrpList.push(nrp);
        excelDataMap.set(nrp, { nama, account_number, thp });
      }
    });

    // Fetch members from DB
    const { data: anggotaData, error } = await supabase
      .from('anggota')
      .select('nrp, nama, bank_account_number')
      .in('nrp', nrpList);

    if (error) {
      throw error;
    }

    const dbDataMap = new Map<string, any>();
    if (anggotaData) {
        anggotaData.forEach((a: any) => {
            dbDataMap.set(a.nrp, a);
        });
    }

    // Classify
    excelDataMap.forEach((excelRow, nrp) => {
        const dbRow = dbDataMap.get(nrp);
        
        let status: 'MATCH' | 'NOT_FOUND' | 'CONFLICT' = 'MATCH';
        
        if (!dbRow) {
            status = 'NOT_FOUND';
        } else if (excelRow.account_number && dbRow.bank_account_number && excelRow.account_number !== dbRow.bank_account_number) {
            status = 'CONFLICT';
        } else if (excelRow.account_number && !dbRow.bank_account_number) {
             // If DB has no account number, we can treat it as a match (new account) or conflict depending on business logic
             // Let's treat it as CONFLICT so admin reviews it, or MATCH if we just auto-fill
             status = 'CONFLICT'; 
        }

        results.push({
            nrp,
            nama: excelRow.nama,
            take_home_pay: excelRow.thp,
            excel_account_number: excelRow.account_number || null,
            db_account_number: dbRow?.bank_account_number || null,
            status,
        });
    });

    return results;
  } catch (error) {
    console.error('Error parsing excel file:', error);
    throw error;
  }
};

export type FinalReconciliationPayload = {
    nrp: string;
    take_home_pay: number | null;
    final_account_number: string | null;
};

export const confirmSalaryReconciliation = async (payload: FinalReconciliationPayload[]): Promise<boolean> => {
    try {
        // We get the current user ID to pass to the RPC for auditing
        const { data: { user } } = await supabase.auth.getUser();
        
        const { error } = await supabase.rpc('batch_update_salary_reconciliation', {
            payload: payload,
            admin_id: user?.id || null
        });

        if (error) {
            throw error;
        }

        return true;
    } catch (error) {
        console.error('Error confirming reconciliation:', error);
        throw error;
    }
};

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function checkEnum() {
  const { data, error } = await supabase.rpc('get_enum_values', { enum_name: 'loan_status' });
  if (error) {
    // raw query fallback if possible? no, RPC required. 
    // Let's try to query another way, or just catch the error and parse it.
    const { error: e2 } = await supabase.from('loans').insert({ loan_number: 'test-enum', member_id: '00000000-0000-0000-0000-000000000000', loan_type_id: '00000000-0000-0000-0000-000000000000', principal_amount: 1, agreed_tenor_months: 1, planned_installment_amount: 1, status: 'INVALID_STATUS' });
    console.error("Enum Error:", e2);
  } else {
    console.log("Enum values:", data);
  }
}
checkEnum();

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Fetching migration loans...');
  const { data: loans, error } = await supabase
    .from('loans')
    .select('id')
    .like('loan_number', 'LOAN-MIG-%');

  if (error) {
    console.error('Error fetching loans:', error);
    return;
  }

  if (!loans || loans.length === 0) {
    console.log('No migration loans found.');
    return;
  }

  const loanIds = loans.map(l => l.id);
  console.log(`Found ${loanIds.length} loans to delete.`);

  // Delete schedules
  const { error: err1 } = await supabase.from('loan_schedules').delete().in('loan_id', loanIds);
  if (err1) console.error('Error deleting schedules:', err1);
  else console.log('Deleted schedules.');

  // Delete repayments
  const { error: err2 } = await supabase.from('loan_repayments').delete().in('loan_id', loanIds);
  if (err2) console.error('Error deleting repayments:', err2);
  else console.log('Deleted repayments.');

  // Delete loans
  const { error: err3 } = await supabase.from('loans').delete().in('id', loanIds);
  if (err3) console.error('Error deleting loans:', err3);
  else console.log('Deleted loans successfully!');
}

run();

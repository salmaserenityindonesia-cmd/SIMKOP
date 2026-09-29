const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env'});

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: dt } = await supabase.from('deposit_types').select('*');
  console.log('Deposit Types:', dt?.length, 'records');

  const { data: md } = await supabase.from('member_deposits').select('*');
  console.log('Member Deposits:', md?.length, 'records');

  const { data: tx } = await supabase.from('deposit_transactions').select('*');
  console.log('Deposit Txs:', tx?.length, 'records');
  
  if (dt) {
    const pokok = dt.find(d => d.name.toLowerCase().includes('pokok'));
    console.log('Pokok ID:', pokok?.id);
    if (pokok) {
       const { data: pTx } = await supabase.from('deposit_transactions').select('id, amount, member_deposits!inner(member_id, deposit_type_id)').eq('member_deposits.deposit_type_id', pokok.id);
       console.log('Pokok Txs with !inner:', pTx?.length);

       const { data: pTx2, error } = await supabase.from('deposit_transactions').select('id, amount, member_deposits(member_id, deposit_type_id)').eq('member_deposits.deposit_type_id', pokok.id);
       console.log('Pokok Txs without !inner:', pTx2?.length, 'error:', error?.message);
    }
  }
}
check();

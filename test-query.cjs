const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env'});
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: mem } = await supabase.from('anggota').select('id, nama').limit(1);
  if (!mem || mem.length === 0) return console.log('no members');
  const memberId = mem[0].id;
  console.log('Testing for member:', mem[0].nama);

  const { data, error } = await supabase
      .from('deposit_transactions')
      .select(`
        id, amount, created_at, description, for_month, for_year, transaction_type,
        member_deposits!inner (
          member_id,
          deposit_types (name)
        )
      `)
      .eq('member_deposits.member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(5);

  console.log('Error:', error?.message);
  console.log('Data:', JSON.stringify(data, null, 2));
}
check();

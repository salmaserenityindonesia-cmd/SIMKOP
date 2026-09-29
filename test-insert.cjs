const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env'});

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: dt } = await supabase.from('deposit_types').select('*');
  console.log('Deposit Types:', dt.map(d => d.name));
}
check();

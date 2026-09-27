import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = dotenv.parse(envContent);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function check() {
  console.log('Fetching deposit_types...');
  const { data: dTypes, error: dtErr } = await supabase.from('deposit_types').select('*');
  console.log('deposit_types:', dTypes);
  console.log('error:', dtErr);

  console.log('\nFetching anggota...');
  const { data: anggota, error: aErr } = await supabase.from('anggota').select('*').limit(1);
  console.log('anggota:', anggota);
  console.log('error:', aErr);

  if (anggota && anggota.length > 0) {
    console.log('\nTrying to enroll member_deposits...');
    const memberId = anggota[0].id;
    if (dTypes && dTypes.length > 0) {
      const inserts = dTypes.map(dt => ({
        member_id: memberId,
        deposit_type_id: dt.id,
        is_terminated: false
      }));
      console.log('inserts:', inserts);
      const { data: md, error: mdErr } = await supabase.from('member_deposits').insert(inserts).select();
      console.log('member_deposits result:', md);
      console.log('member_deposits error:', mdErr);
    }
  }
}

check().catch(console.error);

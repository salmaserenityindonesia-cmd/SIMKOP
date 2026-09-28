import { config } from 'dotenv';

config(); // Loads .env

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

async function fetchOpenApiSpec() {
  const res = await fetch(`${supabaseUrl}/rest/v1/?apikey=${supabaseKey}`);
  const json = await res.json();
  
  // The OpenAPI spec usually defines enums in components.schemas or definitions
  console.log('RPC Endpoints:', Object.keys(json.paths).filter(k => k.startsWith('/rpc/')));
}

fetchOpenApiSpec();

import 'dotenv/config';
import { supabase } from './src/lib/supabaseClient';

async function testConnection() {
  try {
    console.log('Testing Supabase connection...');
    const { data, error } = await supabase.from('user_restrictions').select('*').limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        console.log('Connection successful! (Table user_restrictions not found, but API is reachable)');
      } else {
        console.error('Connection error:', error.message);
        // It still connected to the API if it returns a specific error from PostgREST
        console.log('API is reachable.');
      }
    } else {
      console.log('Connection successful! Data:', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testConnection();

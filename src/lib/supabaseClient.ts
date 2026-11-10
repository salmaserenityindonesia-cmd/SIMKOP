import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder');

/**
 * @deprecated Service role client has been removed from client-side bundles for security.
 * Privileged operations are now handled via database RPCs (042_admin_user_management.sql)
 * or serverless Edge/Cloudflare functions in src/services/userService.ts.
 */
export const supabaseAdmin = null;

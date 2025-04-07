/**
 * Supabase server-side client setup
 */
import { createClient } from '@supabase/supabase-js';

// Tables in our Supabase database
export type Tables = {
  users: {
    id: string;
    created_at: string;
    user_id: string;
    [key: string]: any;
  }[];
  wallets: {
    id: string;
    created_at: string;
    user_id: string;
    wallet_address: string;
    encrypted_private_key: string;
    is_default: boolean;
    [key: string]: any;
  }[];
  authenticators: {
    id: string;
    created_at: string;
    user_id: string;
    credential_id: string;
    public_key: string;
    counter: number;
    [key: string]: any;
  }[];
};

export type SupabaseResponse<T> = {
  data: T | null;
  error: Error | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create and export the Supabase client with service role key
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
}); 
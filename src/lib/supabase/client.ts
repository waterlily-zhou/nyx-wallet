/**
 * Supabase client setup
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

// Use the public anon key for client-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Log environment variable presence for debugging (only in dev)
if (process.env.NODE_ENV === 'development') {
  console.log('Supabase client environment check:', {
    'NEXT_PUBLIC_SUPABASE_URL': !!supabaseUrl ? 'present' : 'missing',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': !!supabaseKey ? 'present' : 'missing',
  });
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
  auth: {
    persistSession: false
  }
}); 
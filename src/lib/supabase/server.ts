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

// Get environment variables - use a helper to ensure they're loaded correctly
function getEnvVariable(name: string): string {
  const value = process.env[name];
  
  if (!value) {
    console.error(`⚠️ Missing environment variable: ${name}`);
    return '';
  }
  
  // For service key, validate the format
  if (name === 'SUPABASE_SERVICE_ROLE_KEY' && !value.startsWith('eyJ')) {
    console.error(`⚠️ Invalid ${name} format - should start with 'eyJ'`);
    console.error(`Current value: ${value.substring(0, 5)}...`);
  }
  
  return value;
}

// Get and validate environment variables
const supabaseUrl = getEnvVariable('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceRoleKey = getEnvVariable('SUPABASE_SERVICE_ROLE_KEY');

// Detailed logging for environment variable issues in development mode
if (process.env.NODE_ENV === 'development') {
/*   console.log('Supabase server environment check:', {
    'NEXT_PUBLIC_SUPABASE_URL': supabaseUrl ? `present (${supabaseUrl.substring(0, 15)}...)` : 'MISSING',
    'SUPABASE_SERVICE_ROLE_KEY': supabaseServiceRoleKey ? 
      `present (length: ${supabaseServiceRoleKey.length}, starts with: ${supabaseServiceRoleKey.substring(0, 5)}...)` : 
      'MISSING',
  }); */
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('⚠️ CRITICAL ERROR: Missing Supabase environment variables!');
    console.error('Please ensure .env or .env.local contains NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    console.error('Server-side features will not work properly without these variables.');
  }
}

// Ensure required variables are present for the current request
if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
}

if (!supabaseServiceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
}

// For security, ensure the key is a valid JWT format
if (!supabaseServiceRoleKey.startsWith('eyJ')) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not in the expected format (should start with "eyJ")');
}

// Create and export the Supabase client with service role key
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Test the connection to ensure the service role key is valid
async function testSupabaseConnection() {
  if (process.env.NODE_ENV !== 'development') return;
  
  try {
    // Test with a simple query first
    /* console.log('Testing Supabase connection with service role key...'); */
    const { data: testData, error: testError } = await supabase.from('authenticators').select('count').limit(1);
    
    if (testError) {
      console.error('⚠️ Supabase connection test failed:', testError.message);
      console.error('This indicates your SUPABASE_SERVICE_ROLE_KEY might be invalid');
      return;
    }
    
    console.log('✅ Basic Supabase connection test successful');
    
    // Now test with a specific where clause that should use the service role
    const { data: specificData, error: specificError } = await supabase
      .from('authenticators')
      .select('credential_id')
      .limit(1);
      
    if (specificError) {
      console.error('⚠️ Specific query test failed:', specificError.message);
    } else if (!specificData || specificData.length === 0) {
      console.log('⚠️ No authenticators found, but connection works');
    } else {
      // Try querying with the credential_id
      const firstCredentialId = specificData[0].credential_id;
      console.log(`Testing query with credential_id: ${firstCredentialId}`);
      
      const { data: credentialData, error: credentialError } = await supabase
        .from('authenticators')
        .select('*')
        .eq('credential_id', firstCredentialId);
        
      if (credentialError) {
        console.error('⚠️ Credential ID query failed:', credentialError.message);
      } else if (!credentialData || credentialData.length === 0) {
        console.error('⚠️ Critical error: Found credential ID in first query but not in targeted query');
        console.error('This indicates an RLS policy issue or inconsistent service role key usage');
      } else {
        console.log('✅ Credential ID query successful - service role key is working properly');
      }
    }
  } catch (err) {
    console.error('⚠️ Supabase connection test error:', err);
  }
}

// Run the test in development
if (process.env.NODE_ENV === 'development') {
  testSupabaseConnection();
} 
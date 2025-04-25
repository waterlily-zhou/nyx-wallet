import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server';

interface Authenticator {
  id: string;
  credential_id: string;
  [key: string]: any;
}

export async function GET() {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'This endpoint is only available in development mode' }, { status: 403 });
  }

  // Check for the presence of environment variables
  const envVars = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'missing',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'present' : 'missing',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing',
    SUPABASE_SERVICE_ROLE_KEY_LENGTH: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
    SUPABASE_SERVICE_ROLE_KEY_PREFIX: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10) + '...',
    // Add other important environment variables here
    RP_ID: process.env.RP_ID || 'not set',
    ORIGIN: process.env.ORIGIN || 'not set',
    KEY_ENCRYPTION_KEY: process.env.KEY_ENCRYPTION_KEY ? 'present' : 'missing',
    KEY_ENCRYPTION_KEY_LENGTH: process.env.KEY_ENCRYPTION_KEY?.length || 0
  };

  // Test Supabase connection
  let supabaseConnectionTest = 'not tested';
  let allAuthenticators: Authenticator[] = [];
  let specificAuthenticator: any = null;
  
  try {
    // Test a simple query
    const { data, error } = await supabase
      .from('authenticators')
      .select('id, credential_id')
      .limit(10);
      
    if (error) {
      supabaseConnectionTest = `Failed: ${error.message}`;
    } else {
      supabaseConnectionTest = `Success: Found ${data.length} authenticators`;
      allAuthenticators = data as Authenticator[];
      
      // Try to query a specific authenticator by ID from the first result
      if (data && data.length > 0) {
        const { data: specificData, error: specificError } = await supabase
          .from('authenticators')
          .select('*')
          .eq('credential_id', data[0].credential_id)
          .limit(1);
          
        if (specificError) {
          specificAuthenticator = { error: specificError.message };
        } else {
          specificAuthenticator = specificData;
        }
      }
    }
  } catch (err) {
    supabaseConnectionTest = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json({ 
    env: envVars,
    supabaseTest: supabaseConnectionTest,
    authenticators: allAuthenticators,
    specificAuthenticator: specificAuthenticator,
    message: 'Debug information about environment variables'
  });
} 
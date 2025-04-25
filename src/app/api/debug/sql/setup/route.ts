import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server';

export async function GET() {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'This endpoint is only available in development mode' }, { status: 403 });
  }

  try {
    // Create a function to find user by credential ID using SQL
    const createFindUserQuery = `
      CREATE OR REPLACE FUNCTION find_by_credential(cred_id TEXT)
      RETURNS TABLE (
        id TEXT,
        username TEXT,
        auth_type TEXT,
        active_wallet_id TEXT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT u.id, u.username, u.auth_type, u.active_wallet_id
        FROM users u
        JOIN authenticators a ON u.id = a.user_id
        WHERE a.credential_id = cred_id 
           OR a.credential_id = rtrim(cred_id, '=')
           OR rtrim(a.credential_id, '=') = rtrim(cred_id, '=')
           OR encode(decode(a.credential_id, 'base64'), 'base64') = cred_id
           OR encode(decode(cred_id, 'base64'), 'base64') = a.credential_id;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    // Execute the SQL
    const { error: findUserError } = await supabase.rpc('exec_sql', { sql: createFindUserQuery });
    if (findUserError) {
      console.error('Failed to create find_by_credential function', findUserError);
      // Fall back to direct query
      try {
        // Try direct SQL execution (if you have permission)
        await supabase.rpc('exec_sql', { sql: createFindUserQuery });
      } catch (directError) {
        console.error('Direct SQL execution also failed', directError);
      }
    }

    // Create a debugging function to dump credential details
    const createDumpQuery = `
      CREATE OR REPLACE FUNCTION dump_credential_details()
      RETURNS TABLE (
        id TEXT,
        credential_id TEXT,
        credential_id_base64 TEXT,
        credential_id_no_padding TEXT,
        credential_id_type TEXT
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          a.id,
          a.credential_id,
          encode(decode(a.credential_id, 'base64'), 'base64'),
          rtrim(a.credential_id, '='),
          pg_typeof(a.credential_id)::text
        FROM 
          authenticators a;
      END;
      $$;
    `;

    const { error: dumpError } = await supabase.rpc('exec_sql', { sql: createDumpQuery });
    
    if (dumpError) {
      console.error('Failed to create dump function', dumpError);
    }

    // Run the dump function
    const { data: credentialInfo, error: infoError } = await supabase.rpc('dump_credential_details');

    return NextResponse.json({
      success: true,
      message: 'SQL functions created',
      findUserError: findUserError?.message || null,
      dumpError: dumpError?.message || null,
      credentialInfo: credentialInfo || []
    });
  } catch (err) {
    console.error('Error in SQL setup:', err);
    return NextResponse.json({ 
      success: false, 
      error: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
} 
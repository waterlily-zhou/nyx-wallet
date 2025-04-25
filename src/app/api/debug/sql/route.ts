import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server';

export async function GET() {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'This endpoint is only available in development mode' }, { status: 403 });
  }

  try {
    // Create RPC function to examine credential format
    const createFunctionQuery = `
      CREATE OR REPLACE FUNCTION dump_credential_details()
      RETURNS TABLE (
        id TEXT,
        credential_id TEXT,
        credential_id_as_text TEXT,
        credential_id_hex TEXT,
        credential_id_length INTEGER,
        credential_id_type TEXT,
        public_key_type TEXT
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          a.id,
          a.credential_id,
          a.credential_id::text,
          encode(a.credential_id::bytea, 'hex'),
          length(a.credential_id),
          pg_typeof(a.credential_id)::text,
          pg_typeof(a.credential_public_key)::text
        FROM 
          authenticators a;
      END;
      $$;
    `;

    const { error } = await supabase.rpc('exec_sql', { sql: createFunctionQuery });

    if (error) {
      // Try a different approach if RPC not available
      console.error('Failed to create SQL function via RPC:', error);
      
      // For debugging, just query the table structure
      const { data: tableInfo, error: tableError } = await supabase
        .from('authenticators')
        .select('*')
        .limit(1);
        
      if (tableError) {
        return NextResponse.json({ 
          success: false, 
          error: tableError.message,
          message: 'Failed to query table structure'
        });
      }
      
      // Return table column structure 
      return NextResponse.json({
        success: true,
        message: 'Failed to create SQL function, but fetched table sample',
        columns: tableInfo && tableInfo.length > 0 ? Object.keys(tableInfo[0]) : [],
        sample: tableInfo
      });
    }

    // Test the function
    const { data, error: testError } = await supabase.rpc('dump_credential_details');
    
    if (testError) {
      return NextResponse.json({ 
        success: false, 
        error: testError.message,
        message: 'SQL function created but test failed'
      });
    }

    return NextResponse.json({
      success: true,
      message: 'SQL function created and tested successfully',
      results: data
    });
  } catch (err) {
    console.error('Error in SQL endpoint:', err);
    return NextResponse.json({ 
      success: false, 
      error: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
} 
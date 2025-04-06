import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// GET /api/auth/credentials - List all credentials
export async function GET(request: NextRequest) {
  try {
    console.log('API: Loading user credentials');
    
    // Get all authenticators from the database
    const { data, error } = await supabase
      .from('authenticators')
      .select('id, credential_id, user_id, device_name, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('API: Error loading credentials:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to load credentials' 
      }, { status: 500 });
    }
    
    // Get user info for each authenticator
    const enrichedCredentials = await Promise.all(
      data.map(async (auth) => {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('username')
          .eq('id', auth.user_id)
          .single();
        
        return {
          id: auth.credential_id, // Use credential_id as the id for deletion
          username: userData?.username || auth.user_id,
          deviceName: auth.device_name,
          createdAt: auth.created_at
        };
      })
    );
    
    return NextResponse.json({
      success: true,
      credentials: enrichedCredentials
    });
  } catch (error) {
    console.error('API: Error getting credentials:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
} 
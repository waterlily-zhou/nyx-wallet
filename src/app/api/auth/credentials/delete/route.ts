import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// POST /api/auth/credentials/delete - Delete a credential
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credentialId } = body;
    
    if (!credentialId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Credential ID is required' 
      }, { status: 400 });
    }
    
    console.log(`API: Deleting credential with ID: ${credentialId}`);
    
    // Get the user_id associated with this credential
    const { data: authData, error: authError } = await supabase
      .from('authenticators')
      .select('user_id')
      .eq('credential_id', credentialId)
      .single();
    
    if (authError) {
      console.error('API: Error finding credential:', authError);
      return NextResponse.json({ 
        success: false, 
        error: 'Credential not found' 
      }, { status: 404 });
    }
    
    // Delete the credential from the database
    const { error: deleteError } = await supabase
      .from('authenticators')
      .delete()
      .eq('credential_id', credentialId);
    
    if (deleteError) {
      console.error('API: Error deleting credential:', deleteError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to delete credential' 
      }, { status: 500 });
    }
    
    // Check if this was the user's last credential
    const { count, error: countError } = await supabase
      .from('authenticators')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authData.user_id);
    
    // If this was the last credential, you might want to:
    // 1. Delete the user's wallets
    // 2. Mark the user as inactive
    // 3. Or keep everything for potential recovery
    if (!countError && count === 0) {
      console.log(`API: User ${authData.user_id} has no remaining credentials`);
      
      // Optional: Mark user as inactive
      const { error: userUpdateError } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', authData.user_id);
      
      if (userUpdateError) {
        console.error('API: Error updating user status:', userUpdateError);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Credential deleted successfully'
    });
  } catch (error) {
    console.error('API: Error deleting credential:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
} 
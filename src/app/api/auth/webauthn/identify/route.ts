/**
 * WebAuthn credential identification endpoint
 * This endpoint identifies a user from a discovered credential
 * without relying on cookies
 */
import { NextRequest, NextResponse } from 'next/server';
import { findAuthenticatorByCredentialId } from '@/lib/utils/user-store';
import { supabase } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    console.log('WebAuthn identify endpoint called');
    
    // Get the credential from the request
    const body = await request.json();
    const { credential } = body;
    
    if (!credential || !credential.id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid credential' 
      }, { status: 400 });
    }
    
    console.log('Looking up credential ID:', credential.id);
    
    // First try to find the authenticator in our database
    // Using the bridge function here that will fallback to file storage if needed
    const authenticator = await findAuthenticatorByCredentialId(credential.id);
    
    if (!authenticator) {
      console.log('No authenticator found for credential ID:', credential.id);
      return NextResponse.json({ 
        success: false, 
        error: 'Authenticator not found',
        credentials: []
      }, { status: 404 });
    }
    
    console.log('Found authenticator:', authenticator.id);
    
    // Try to get the user ID either from the file system or Supabase
    let userId;
    
    // Try Supabase first (if available)
    try {
      const { data, error } = await supabase
        .from('authenticators')
        .select('user_id')
        .eq('credential_id', credential.id)
        .single();
      
      if (!error && data) {
        userId = data.user_id;
        console.log('Found user ID from Supabase:', userId);
      }
    } catch (e) {
      // Supabase may not be configured yet, continue with fallback
      console.log('Supabase query failed, using fallback');
    }
    
    // If we don't have a user ID yet, try to get it from the authenticator
    if (!userId) {
      // In our current structure, we might not have a direct user ID on the authenticator
      // This is a limitation of our current file-based system
      // In Supabase, we'll have a proper relationship
      userId = authenticator.userId || null;
      console.log('Using authenticator userId:', userId);
    }
    
    // Return the user ID and credential information
    return NextResponse.json({
      success: true,
      userId,
      authenticatorId: authenticator.id,
      credentials: [
        {
          id: authenticator.id,
          credentialId: authenticator.credentialID
        }
      ]
    });
  } catch (error) {
    console.error('Error identifying credential:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to identify credential',
        credentials: []
      },
      { status: 500 }
    );
  }
} 
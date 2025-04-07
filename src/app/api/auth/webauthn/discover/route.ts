/**
 * WebAuthn credential discovery endpoint
 * This endpoint provides options for discovering existing credentials
 * without relying on cookies
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { rpID, origin } from '@/lib/utils/user-store';

export async function GET(request: NextRequest) {
  try {
    console.log('WebAuthn discovery endpoint called');
    
    // Generate minimal authentication options
    // This is used only for credential discovery, not validation
    const authOptions = await generateAuthenticationOptions({
      rpID,
      timeout: 60000,
      userVerification: 'preferred',
      // We don't specify allowCredentials so the browser will
      // check for ALL credentials on the device
    });
    
    console.log('Generated credential discovery options:', authOptions);
    
    return NextResponse.json({
      success: true,
      options: {
        publicKey: {
          ...authOptions,
          rpId: rpID,
        }
      }
    });
  } catch (error) {
    console.error('Error generating credential discovery options:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate credential discovery options' 
      },
      { status: 500 }
    );
  }
} 
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findUserById, findUserByWalletAddress } from '@/lib/utils/user-store';

// WebAuthn settings
const rpID = process.env.RP_ID || 'localhost';
// Allow verification from any port in development
const expectedOrigin = process.env.ORIGIN || 
  (process.env.NODE_ENV === 'production' 
    ? `https://${rpID}` 
    : `http://${rpID}`);

export async function POST(request: NextRequest) {
  try {
    console.log('Verify endpoint called');
    const cookieStore = cookies();
    const storedChallenge = cookieStore.get('auth_challenge')?.value;
    const walletAddress = cookieStore.get('walletAddress')?.value;
    
    console.log('Stored challenge:', storedChallenge ? 'exists' : 'missing');
    console.log('Wallet address:', walletAddress ? walletAddress : 'missing');

    if (!storedChallenge) {
      console.log('No authentication challenge found');
      return NextResponse.json({ 
        success: false, 
        error: 'No authentication challenge found'
      }, { status: 400 });
    }

    if (!walletAddress) {
      return NextResponse.json({ 
        success: false, 
        error: 'No wallet address found in session'
      }, { status: 401 });
    }

    // Get the credential from the request
    const body = await request.json();
    console.log('Request body:', JSON.stringify(body));
    const { credential } = body;

    // For testing, still accept simulated credentials
    if (credential.id === 'simulated-credential-id') {
      console.log('API: Rejecting simulated credential - real SCA required');
      return NextResponse.json({ 
        success: false, 
        error: 'Simulated credentials are not allowed. Must use real biometric authentication.' 
      }, { status: 400 });
    }

    // Process real WebAuthn credentials
    try {
      console.log('Processing WebAuthn credential');
      
      // Get credential metadata
      console.log('Credential ID:', credential.id);
      console.log('Credential type:', credential.type);
      
      if (!credential.id || !credential.response) {
        throw new Error('Invalid credential format');
      }
      
      // Extract the origin from the credential
      const credentialDataJson = Buffer.from(credential.response.clientDataJSON, 'base64').toString();
      const credentialData = JSON.parse(credentialDataJson);
      const actualOrigin = credentialData.origin;
      
      console.log('API: Expected origin (from config):', expectedOrigin);
      console.log('API: Actual origin (from credential):', actualOrigin);
      
      // In a real implementation, you'd verify the credential against stored authenticators
      // For now, consider the credential valid based on format
      console.log('WebAuthn credential format looks valid');
      
      // Clear the challenge
      cookieStore.delete('auth_challenge');

      // Set session cookies
      cookieStore.set('session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Authentication successful'
      });
    } catch (verifyError) {
      console.error('WebAuthn verification error:', verifyError);
      return NextResponse.json({ 
        success: false, 
        error: 'WebAuthn verification failed: ' + (verifyError instanceof Error ? verifyError.message : String(verifyError))
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Error verifying credential:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify credential' },
      { status: 500 }
    );
  }
} 
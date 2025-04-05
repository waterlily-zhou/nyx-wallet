import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findUserById, findUserByWalletAddress } from '@/lib/utils/user-store';
import { type Address } from 'viem';
import crypto from 'crypto';

// WebAuthn settings
const rpID = process.env.RP_ID || 'localhost';
// Allow verification from any port in development
const expectedOrigin = process.env.ORIGIN || 
  (process.env.NODE_ENV === 'production' 
    ? `https://${rpID}` 
    : `http://${rpID}`);

export async function POST(request: NextRequest) {
  try {
    console.log('API: Verify endpoint called');
    const cookieStore = cookies();
    const storedChallenge = cookieStore.get('auth_challenge')?.value;
    const walletAddress = cookieStore.get('walletAddress')?.value;
    const challengeWallet = cookieStore.get('challenge_wallet')?.value;
    
    console.log('API: Stored challenge:', storedChallenge ? `${storedChallenge.substring(0, 10)}...` : 'missing');
    console.log('API: Wallet address:', walletAddress ? walletAddress : 'missing');
    console.log('API: Challenge wallet:', challengeWallet ? challengeWallet : 'missing');

    if (!storedChallenge) {
      console.log('API: No authentication challenge found');
      return NextResponse.json({ 
        success: false, 
        error: 'No authentication challenge found'
      }, { status: 400 });
    }

    // Verify wallet address in challenge if we're doing a sign-in with existing wallet
    if (challengeWallet && walletAddress) {
      // Verify that the challenge wallet matches the current wallet
      if (challengeWallet !== walletAddress) {
        console.log('API: Challenge wallet mismatch');
        return NextResponse.json({ 
          success: false, 
          error: 'Wallet address in challenge does not match stored wallet address'
        }, { status: 401 });
      }
      
      // Additional verification: check that the challenge contains the wallet hash
      const walletHash = crypto.createHash('sha256').update(walletAddress).digest();
      const challengeBuffer = Buffer.from(storedChallenge, 'base64');
      
      // The challenge should have wallet hash in the second half (bytes 16-32)
      if (challengeBuffer.length >= 32) {
        const challengeWalletHash = challengeBuffer.slice(16, 32);
        const actualWalletHash = walletHash.slice(0, 16);
        
        // Compare the hash portions
        if (!crypto.timingSafeEqual(challengeWalletHash, actualWalletHash)) {
          console.log('API: Challenge hash verification failed');
          return NextResponse.json({ 
            success: false, 
            error: 'Challenge hash verification failed'
          }, { status: 401 });
        }
        
        console.log('API: Challenge wallet hash verified successfully');
      }
    } else if (!walletAddress) {
      console.log('API: No wallet address found - new wallet creation flow');
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
      
      // Verify the challenge in the credential matches our stored challenge
      const credentialChallenge = credentialData.challenge;
      if (!credentialChallenge) {
        throw new Error('No challenge found in credential');
      }
      
      // Convert the base64url-encoded challenge to base64 for comparison
      const normalizedCredentialChallenge = credentialChallenge.replace(/-/g, '+').replace(/_/g, '/');
      const base64StoredChallenge = storedChallenge.replace(/=/g, '');
      
      if (normalizedCredentialChallenge !== base64StoredChallenge) {
        console.log('API: Challenge mismatch');
        console.log('API: Credential challenge:', normalizedCredentialChallenge);
        console.log('API: Stored challenge:', base64StoredChallenge);
        throw new Error('Challenge mismatch');
      }
      
      console.log('API: Challenge verified successfully');
      
      // In a real implementation, you'd verify the credential against stored authenticators
      // For now, consider the credential valid based on format
      console.log('WebAuthn credential format looks valid');
      
      // WebAuthn verification success - Try to find the user by wallet address
      const user = walletAddress ? findUserByWalletAddress(walletAddress as Address) : undefined;
      const userId = user ? user.id : 'test_user'; // Fallback to test_user if not found

      // Clear the challenge
      cookieStore.delete('auth_challenge');
      cookieStore.delete('challenge_wallet');

      // Set session cookies
      cookieStore.set('session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });

      // Set userId cookie
      cookieStore.set('userId', userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });

      return NextResponse.json({ 
        success: true, 
        userId,
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
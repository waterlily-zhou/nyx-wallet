import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    console.log('API: Challenge endpoint called');
    
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    
    // Generate a random challenge
    const randomBytes = crypto.randomBytes(32);
    
    // If we have a wallet address, include it in the challenge
    let challengeData = randomBytes;
    if (walletAddress) {
      // Create a hash of the wallet address
      const walletHash = crypto.createHash('sha256').update(walletAddress).digest();
      
      // Combine random bytes with wallet hash (first 16 bytes of each)
      challengeData = Buffer.concat([
        randomBytes.slice(0, 16),
        walletHash.slice(0, 16)
      ]);
      
      console.log(`API: Including wallet address ${walletAddress} in challenge`);
    }
    
    // Convert to base64 string for the client
    const challengeBase64 = challengeData.toString('base64');
    
    console.log('API: Generated challenge with length:', challengeBase64.length);
    
    // Store the challenge and wallet address in cookies for verification
    cookieStore.set('auth_challenge', challengeBase64, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 300 // 5 minutes
    });
    
    if (walletAddress) {
      cookieStore.set('challenge_wallet', walletAddress, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 300 // 5 minutes
      });
    }

    return NextResponse.json({
      success: true,
      challenge: challengeBase64,
      walletVerification: !!walletAddress
    });
  } catch (error) {
    console.error('Error generating challenge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate challenge' },
      { status: 500 }
    );
  }
} 
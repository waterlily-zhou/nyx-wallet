import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { rpID, origin } from '@/lib/utils/user-store';
import { supabase } from '@/lib/supabase/server';
import crypto from 'crypto';
import type { 
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialRequestOptionsJSON 
} from '@simplewebauthn/types';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const userId = cookieStore.get('userId')?.value;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Get transaction data from request
    const { to, value, data } = await request.json();

    // Get active authenticator for user
    const { data: authenticator, error } = await supabase
      .from('authenticators')
      .select('credential_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error || !authenticator) {
      return NextResponse.json(
        { error: 'No active authenticator found' },
        { status: 404 }
      );
    }

    // Generate random challenge
    const randomBytes = crypto.randomBytes(32);
    
    // Combine with transaction data
    const transactionData = JSON.stringify({ to, value, data, timestamp: Date.now() });
    const combinedChallenge = Buffer.concat([
      randomBytes,
      Buffer.from(transactionData)
    ]);
    
    // Debug logging for challenge creation
    console.log('🔍 Challenge Creation:', {
      randomBytesLength: randomBytes.length,
      transactionDataLength: Buffer.from(transactionData).length,
      combinedChallengeLength: combinedChallenge.length
    });
    
    // Convert to base64url format that matches WebAuthn's encoding
    // First convert to base64
    const challengeBase64 = combinedChallenge.toString('base64');
    
    // Then convert to base64url by replacing characters
    const challengeBase64url = challengeBase64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    console.log('🔍 Challenge Encoding:', {
      rawLength: combinedChallenge.length,
      base64Length: challengeBase64.length,
      base64urlLength: challengeBase64url.length,
      base64Sample: `${challengeBase64.substring(0, 10)}...${challengeBase64.substring(challengeBase64.length - 10)}`,
      base64urlSample: `${challengeBase64url.substring(0, 10)}...${challengeBase64url.substring(challengeBase64url.length - 10)}`,
      containsPlus: challengeBase64url.includes('+'),
      containsSlash: challengeBase64url.includes('/'),
      containsEquals: challengeBase64url.includes('=')
    });

    // Generate authentication options
    const options: PublicKeyCredentialRequestOptionsJSON = await generateAuthenticationOptions({
      rpID,
      challenge: challengeBase64url,
      allowCredentials: [{
        id: authenticator.credential_id,
        transports: ['internal'] as AuthenticatorTransportFuture[]
      }],
      userVerification: 'required',
      timeout: 60000
    });

    // Log final options and challenge
    console.log('🔍 Final WebAuthn Options:', {
      challenge: options.challenge.substring(0, 10) + '...',
      allowCredentials: options.allowCredentials,
      rpID,
      timeout: options.timeout
    });

    // Store challenge and transaction data in cookies for verification
    cookieStore.set('txChallenge', challengeBase64url, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 300 // 5 minutes
    });

    cookieStore.set('txData', transactionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 300
    });

    return NextResponse.json({
      success: true,
      challenge: challengeBase64url,
      options,
      deviceKeyId: authenticator.credential_id
    });

  } catch (error) {
    console.error('Transaction challenge error:', error);
    return NextResponse.json(
      { error: 'Failed to generate transaction challenge' },
      { status: 500 }
    );
  }
} 
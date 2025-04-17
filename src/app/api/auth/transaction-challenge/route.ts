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
    
    const challengeBase64 = combinedChallenge.toString('base64url');

    // Generate authentication options
    const options: PublicKeyCredentialRequestOptionsJSON = await generateAuthenticationOptions({
      rpID,
      challenge: challengeBase64,
      allowCredentials: [{
        id: authenticator.credential_id,
        transports: ['internal'] as AuthenticatorTransportFuture[]
      }],
      userVerification: 'required',
      timeout: 60000
    });

    // Store challenge and transaction data in cookies for verification
    cookieStore.set('txChallenge', challengeBase64, {
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
      challenge: challengeBase64,
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
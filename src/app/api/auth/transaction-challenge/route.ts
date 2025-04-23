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
import { verifyAuthenticationResponse } from '@simplewebauthn/server';

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
      challenge: combinedChallenge,
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

function preparePublicKeyForVerification(key: string | Buffer): Buffer {
  try {
    if (Buffer.isBuffer(key)) return key;
    const keyString = key as string;
    
    console.log('🔍 Preparing credential public key:', {
      type: typeof keyString,
      startsWithBackslashX: keyString.startsWith('\\x'),
      length: keyString.length
    });
    
    // PostgreSQL bytea format
    if (keyString.startsWith('\\x')) {
      const hexString = keyString.substring(2);
      let decodedString = '';
      for (let i = 0; i < hexString.length; i += 2) {
        decodedString += String.fromCharCode(parseInt(hexString.substring(i, i + 2), 16));
      }
      
      // If it looks like base64-encoded JSON (eyI...)
      if (decodedString.startsWith('eyI')) {
        console.log('✅ Detected base64-encoded JSON in PostgreSQL bytea');
        try {
          // Decode the base64 to get the JSON string
          const jsonString = Buffer.from(decodedString, 'base64').toString();
          console.log('🔍 JSON string preview:', jsonString.substring(0, 50));
          const jsonObj = JSON.parse(jsonString);
          
          // Create a proper COSE_Key Map for CBOR
          const cbor = require('cbor');
          const coseKeyMap = new Map();
          
          // Convert JSON object to Map with numeric keys
          for (const [key, value] of Object.entries(jsonObj)) {
            const numKey = !isNaN(Number(key)) ? Number(key) : key;
            coseKeyMap.set(numKey, value);
          }
          
          console.log('✅ Converting JSON to CBOR Map with keys:', 
                     Array.from(coseKeyMap.keys()).join(', '));
          return cbor.encode(coseKeyMap);
        } catch (e) {
          console.error('❌ Failed to process JSON from base64:', e);
        }
      }
      
      return Buffer.from(hexString, 'hex');
    }
    
    // If it's a base64-encoded JSON string already (not in bytea)
    if (keyString.startsWith('eyI')) {
      console.log('✅ Detected base64-encoded JSON directly');
      try {
        const jsonString = Buffer.from(keyString, 'base64').toString();
        const jsonObj = JSON.parse(jsonString);
        const cbor = require('cbor');
        const coseKeyMap = new Map();
        for (const [key, value] of Object.entries(jsonObj)) {
          coseKeyMap.set(!isNaN(Number(key)) ? Number(key) : key, value);
        }
        return cbor.encode(coseKeyMap);
      } catch (e) {
        console.error('❌ Failed to process direct base64 JSON:', e);
      }
    }
    
    // Last resort - try as raw base64
    return Buffer.from(keyString, 'base64');
  } catch (e) {
    console.error('❌ Failed to prepare public key:', e);
    throw new Error('Failed to prepare credential public key');
  }
}

async function verifyTransaction(request: NextRequest) {
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

    // Get stored challenge and transaction data from cookies
    const storedChallenge = cookieStore.get('txChallenge')?.value;
    const storedTransactionData = cookieStore.get('txData')?.value;

    if (!storedChallenge || !storedTransactionData) {
      return NextResponse.json(
        { error: 'Challenge or transaction data not found' },
        { status: 404 }
      );
    }

    // Prepare public key for verification
    const publicKeyBuffer = preparePublicKeyForVerification(authenticator.credential_public_key);

    // Verify authentication response
    const verification = await verifyAuthenticationResponse({
      response: safeResponse,
      // Use the base64url string directly
      expectedChallenge: storedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        publicKey: publicKeyBuffer,
        id: authenticator.credential_id,
        counter: authenticator.counter || 0
      }
    });

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Authentication verification failed' },
        { status: 400 }
      );
    }

    // Transaction verification logic
    // ...

    return NextResponse.json({
      success: true,
      message: 'Transaction verified successfully'
    });

  } catch (error) {
    console.error('Transaction verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify transaction' },
      { status: 500 }
    );
  }
} 
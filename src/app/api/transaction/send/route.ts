import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { parseEther, Address } from 'viem';
import { sendTransaction } from '@/lib/wallet/send-transaction';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { supabase } from '@/lib/supabase/server';
import { decryptPrivateKey } from '@/lib/utils/key-encryption';
import { rpID, origin } from '@/lib/utils/user-store';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    const userId = cookieStore.get('userId')?.value;
    
    if (!walletAddress || !userId) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      to, 
      value, 
      data, 
      gasPaymentMethod = 'default',
      webAuthnResponse, // WebAuthn response from client
      transactionChallenge // Challenge that was signed
    } = body;

    if (!to || !value || !webAuthnResponse || !transactionChallenge) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // 1. Verify WebAuthn signature
    try {
      // The challenge is already in base64url format, use it directly
      const expectedChallenge = transactionChallenge;
      
      // Get authenticator from database
      const { data: authenticator } = await supabase
        .from('authenticators')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (!authenticator) {
        throw new Error('Authenticator not found');
      }

      // Log challenge details for debugging
      console.log('Transaction verification:', {
        expectedChallenge,
        credentialID: authenticator.credential_id,
        origin,
        rpID
      });

      // Verify the WebAuthn response
      const verification = await verifyAuthenticationResponse({
        response: webAuthnResponse as AuthenticationResponseJSON,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          // The credential public key and ID can be passed directly as base64 strings
          publicKey: authenticator.credential_public_key,
          id: authenticator.credential_id,
          counter: authenticator.counter || 0
        }
      });

      if (!verification.verified) {
        throw new Error('WebAuthn verification failed');
      }

      // Update authenticator counter
      await supabase
        .from('authenticators')
        .update({ 
          counter: verification.authenticationInfo.newCounter,
          last_used: new Date().toISOString()
        })
        .eq('id', authenticator.id);

    } catch (error) {
      console.error('WebAuthn verification failed:', error);
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      );
    }

    // 2. Get server key from database
    const { data: user } = await supabase
      .from('users')
      .select('server_key_encrypted')
      .eq('id', userId)
      .single();

    if (!user?.server_key_encrypted) {
      return NextResponse.json(
        { success: false, error: 'Server key not found' },
        { status: 401 }
      );
    }

    // Decrypt server key
    const serverKey = decryptPrivateKey(
      user.server_key_encrypted, 
      process.env.KEY_ENCRYPTION_KEY || ''
    );

    // Convert value from ETH to Wei and ensure it's a hex string
    const valueInWei = parseEther(value.toString());
    const valueHex = `0x${valueInWei.toString(16)}` as const;

    // Send the transaction
    const result = await sendTransaction(
      walletAddress as Address,
      to as Address,
      valueHex,
      serverKey,
      data || '0x',
      gasPaymentMethod
    );

    return NextResponse.json({
      success: true,
      data: {
        userOpHash: result,
        explorerUrl: `${process.env.EXPLORER_URL}/user-operation/${result}`
      }
    });

  } catch (error) {
    console.error('Error sending transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send transaction' },
      { status: 500 }
    );
  }
} 
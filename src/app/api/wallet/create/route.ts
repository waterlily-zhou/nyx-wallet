import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { rpID, origin } from '@/lib/utils/user-store';
import { supabase } from '@/lib/supabase/server';
import { type Address } from 'viem';
import { 
  findUserById, 
  createSmartAccountFromCredential,
  getOrCreateDKGKeysForUser,
  findWalletAddressByCredentialId,
  findUserIdByCredentialId,
  findAuthenticatorByCredentialId
} from '@/lib/utils/user-store';
import { generateRandomPrivateKey, generateDistributedKeys, encryptPrivateKey } from '@/lib/utils/key-encryption';

export async function POST(request: NextRequest) {
  try {
    console.log('API: /api/wallet/create endpoint called');
    
    const body = await request.json();
    const { credentials, createNewWallet = false, randomSalt, useExistingCredential = false } = body;
    
    console.log('api/wallet/create: Credentials:', credentials);
    
    if (!credentials) {
      throw new Error('No credentials provided');
    }

    // Get all authenticators first to debug
    const { data: allAuthenticators, error: listError } = await supabase
      .from('authenticators')
      .select('credential_id, id');

    // Verify the credential with WebAuthn
    const verification = await verifyAuthenticationResponse({
      response: credentials,
      expectedOrigin: origin,
      expectedRPID: rpID,
      expectedChallenge: credentials.response.clientDataJSON.challenge,
      credential: {
        id: credentials.id,
        publicKey: credentials.response.authenticatorData.publicKey,
        counter: credentials.response.authenticatorData.counter
      }
    });

    if (!verification.verified) {
      throw new Error('WebAuthn verification failed');
    }

    // Get the raw credential ID from verification
    const credentialID = verification.authenticationInfo.credentialID;
    const credentialIdStr = Buffer.from(credentialID).toString('base64url');
    
    console.log('🔄 Credential info:', {
      rawId: credentialID,
      converted: credentialIdStr,
      availableIds: allAuthenticators?.map(a => a.credential_id)
    });

    // Find authenticator in Supabase using the verified credential ID
    let { data: authenticatorData, error: authError } = await supabase
      .from('authenticators')
      .select('*')
      .eq('credential_id', credentialIdStr)
      .single();

    console.log('Found authenticator in Supabase:', authenticatorData);

    if (authError || !authenticatorData) {
      console.error('Error finding authenticator:', authError?.message || 'No authenticator found');
      console.log('Debug info:', {
        originalCredentialId: credentials.id,
        originalRawId: credentials.rawId,
        convertedCredentialId: credentialIdStr,
        error: authError?.message
      });
      throw new Error('No authenticator found for this credential');
    }

    const userId = authenticatorData.user_id;

    // Check for existing wallet
    const walletAddress = await findWalletAddressByCredentialId(credentials.id);

    console.log('api/wallet/create: Wallet address:', walletAddress);

    // If user already has a wallet, return it
    if (walletAddress) {
      console.log(`API: User already has a wallet: ${walletAddress}`);
      return NextResponse.json({ 
        success: true, 
        walletAddress,
        message: 'Existing wallet found',
        isExistingWallet: true
      });
    }

    // Create new wallet with existing credential
    if (useExistingCredential && createNewWallet) {
      console.log('API: Creating a new device key, using existing server key and recovery key');
      
      // Get the existing user's server key
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('server_key_encrypted')
        .eq('id', userId)
        .single();

      if (userError || !userData.server_key_encrypted) {
        throw new Error('Failed to get user server key');
      }

      // Generate new device key
      const newDeviceKey = generateRandomPrivateKey();
      console.log('api/wallet/create: New device key:', newDeviceKey);

      // Generate salt nonce
      const saltNonce = randomSalt 
        ? BigInt(randomSalt)
        : BigInt(Math.floor(Math.random() * 1000000) + 1);
      console.log(`API: Using salt nonce: ${saltNonce}`);
      
      // Create the smart account
      try {
        console.log(`api/wallet/create: Creating smart account`);
        const result = await createSmartAccountFromCredential(
          userId, 
          newDeviceKey,
          'biometric',
          true, // force create new wallet
          saltNonce
        );
        
        if (!result?.address) {
          throw new Error('Failed to create smart account: No address returned');
        }
        
        // Update session cookies
        const cookieStore = cookies();
        cookieStore.set('session', 'authenticated', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 24 * 60 * 60, // 24 hours
        });
        
        cookieStore.set('walletAddress', result.address, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 24 * 60 * 60, // 24 hours
        });
        
        return NextResponse.json({
          success: true,
          walletAddress: result.address,
          message: 'New wallet created successfully'
        });
      } catch (error) {
        console.error('api/wallet/create: Error creating smart account:', error);
        throw new Error(`Failed to create smart account: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error('Invalid request parameters');
  } catch (error) {
    console.error('API: Wallet creation error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create wallet'
    }, { status: 500 });
  }
}
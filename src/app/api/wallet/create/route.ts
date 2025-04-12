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

    // Get the challenge from the clientDataJSON
    const clientDataJSON = JSON.parse(Buffer.from(credentials.response.clientDataJSON, 'base64').toString());
    const challenge = clientDataJSON.challenge;
    
    if (!challenge) {
      throw new Error('No challenge found in credential');
    }

    // Get all authenticators first to debug
    const { data: allAuthenticators, error: listError } = await supabase
      .from('authenticators')
      .select('credential_id, id, credential_public_key');
      
    console.log('🔍 All authenticators in database:', allAuthenticators);

    // First verify the credential with WebAuthn
    const verification = await verifyAuthenticationResponse({
      response: credentials,
      expectedOrigin: origin,
      expectedRPID: rpID,
      expectedChallenge: challenge,
      credential: {
        id: credentials.id,
        publicKey: credentials.response.attestationObject,
        counter: 0
      }
    });

    if (!verification.verified) {
      throw new Error('WebAuthn verification failed');
    }

    // Get the verified credential ID from the verification result
    const verifiedCredentialId = verification.authenticationInfo.credentialID;
    const verifiedCredentialIdStr = Buffer.from(verifiedCredentialId).toString('base64url');
    
    console.log('🔍 Verified credential info:', {
      rawId: verifiedCredentialId,
      base64url: verifiedCredentialIdStr,
      originalId: credentials.id
    });

    // Find authenticator in Supabase using the verified credential ID
    const { data: authenticator, error: authError } = await supabase
      .from('authenticators')
      .select('*')
      .eq('credential_id', verifiedCredentialIdStr)
      .single();

    if (authError || !authenticator) {
      console.error('❌ No authenticator found for verified credential:', {
        verifiedId: verifiedCredentialIdStr,
        originalId: credentials.id,
        error: authError?.message
      });
      throw new Error('No authenticator found for this credential');
    }

    console.log('✅ Found authenticator:', authenticator);

    const userId = authenticator.user_id;

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
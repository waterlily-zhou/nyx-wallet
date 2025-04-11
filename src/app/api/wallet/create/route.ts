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

        // Decode both for comparison
      const clientIdBytes = Buffer.from(credentials.rawId, 'base64url');
      const dbIdBytes = Buffer.from(allAuthenticators[0].credential_id, 'base64url'); // take first for now

      console.log('Byte comparison:', {
        client: Array.from(clientIdBytes),
        db: Array.from(dbIdBytes),
        equal: clientIdBytes.equals(dbIdBytes),
      });
    // Convert the credential ID to base64url format to match what's in the database
    const rawId = credentials.rawId;

    console.log('🔍 rawId:', rawId);

    let decodedRawId: Uint8Array;

    if (typeof rawId === 'string') {
      try {
        decodedRawId = Buffer.from(rawId, 'base64url'); // 💡 this handles base64url correctly
      } catch (e) {
        console.warn('⚠️ Failed to decode rawId as base64url. Fallback logic needed.');
        throw new Error('Invalid credential rawId format');
      }
    } else {
      decodedRawId = new Uint8Array(rawId);
    }

    const credentialIdBase64 = Buffer.from(decodedRawId).toString('base64url')


    console.log('🔄 Credential ID conversion:', {
      original: {
        id: credentials.id,
        rawId: credentials.rawId
      },
      converted: credentialIdBase64
    });

    // Find the authenticator that matches this credential
    const authenticator = allAuthenticators?.find(a => a.credential_id === credentialIdBase64);
    
    if (!authenticator) {
      console.error('❌ No authenticator found for credential:', {
        originalId: credentials.id,
        convertedId: credentialIdBase64,
        availableIds: allAuthenticators?.map(a => a.credential_id)
      });
      throw new Error('No authenticator found for this credential');
    }

    // Verify the credential with WebAuthn
    const verification = await verifyAuthenticationResponse({
      response: credentials,
      expectedOrigin: origin,
      expectedRPID: rpID,
      expectedChallenge: challenge,
      credential: {
        id: authenticator.credential_id,
        publicKey: authenticator.credential_public_key,
        counter: 0 // We'll update this after verification
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
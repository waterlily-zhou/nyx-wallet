import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { rpID, origin, addAuthenticator, updateUser, createSmartAccountFromCredential } from '@/lib/utils/user-store';
import { type Address } from 'viem';
import { AuthenticatorDevice } from '@/lib/types/credentials';
import { supabase } from '@/lib/supabase/server';
import { encryptPrivateKey, validateKeyEncryptionKey } from '@/lib/utils/key-encryption';
import { createHash } from 'crypto';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Registration completion endpoint called');
    
    // Validate KEY_ENCRYPTION_KEY is set and has sufficient entropy
    console.log('KEY_ENCRYPTION_KEY:', process.env.KEY_ENCRYPTION_KEY?.length);
    validateKeyEncryptionKey();
   
    // Get verification data
    const body = await request.json();
    console.log('API: Request body:', JSON.stringify(body).substring(0, 100) + '...');
    const { credential } = body;
    
    const cookieStore = cookies();
    
    // Get stored data
    const challengeBase64 = cookieStore.get('register_challenge')?.value;
    const userId = cookieStore.get('register_user_id')?.value;
    const keysStr = cookieStore.get('register_keys')?.value;
    const deviceName = cookieStore.get('register_device_name')?.value;
    
    console.log('API: Challenge cookie exists:', !!challengeBase64);
    console.log('API: User ID cookie exists:', !!userId);
    console.log('API: Keys cookie exists:', !!keysStr);
    
    if (!challengeBase64 || !userId || !keysStr) {
      console.log('API: Missing required cookies for registration completion');
      return NextResponse.json({ 
        success: false, 
        error: 'Registration session expired' 
      }, { status: 400 });
    }
    
    // Parse and validate the keys
    let keys;
    try {
      keys = JSON.parse(keysStr);
      console.log('API: Parsing keys:', keys, keysStr);
      if (!keys.deviceKey || !keys.serverKey || !keys.recoveryKey) {
        throw new Error('Missing required keys');
      }
    } catch (error) {
      console.error('API: Invalid keys format:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid keys format' 
      }, { status: 400 });
    }
    
    const { deviceKey, serverKey, recoveryKey } = keys;
    
    console.log(`API: Completing registration for user ${userId}`);
    
    // Extract the origin from the credential to handle port changes
    const credentialDataJson = Buffer.from(credential.response.clientDataJSON, 'base64').toString();
    const credentialData = JSON.parse(credentialDataJson);
    const actualOrigin = credentialData.origin;
    
    console.log('API: Expected origin (from config):', origin);
    console.log('API: Actual origin (from credential):', actualOrigin);
    
    // Extract and decode the challenge from the credential data for debugging
    const credentialChallenge = credentialData.challenge;
    console.log('API: Challenge from client data JSON:', credentialChallenge);
    
    // Log the credential object before verification
    console.log('API: Credential object:', JSON.stringify(credential, null, 2));
    
    try {
      // Verify the credential with WebAuthn - using actual origin from credential
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challengeBase64,
        expectedOrigin: actualOrigin,
        expectedRPID: rpID,
      });
      
      console.log('api/auth/register/complete: verifyRegistrationResponse:', verification);
      
      if (!verification.verified) {
        console.error('API: WebAuthn verification failed');
        throw new Error('WebAuthn verification failed');
      }
      
      console.log('API: WebAuthn verification successful');
      
      // Extract authenticator data - with proper type safety
      if (!verification.registrationInfo) {
        throw new Error('Missing registration info');
      }

      const credentialID = verification.registrationInfo.credential.id; //* base64url
      const credentialPublicKey = verification.registrationInfo.credential.publicKey;
      const counter = verification.registrationInfo.credential.counter;
      
      const credentialIdStr = Buffer.isBuffer(credentialID)
        ? Buffer.from(credentialID).toString('base64url')
        : credentialID;

      console.log('api/auth/register/complete: credentialID:', credentialID);
      console.log('api/auth/register/complete: credentialIdStr:', credentialIdStr);
      console.log('api/auth/register/complete: credentialPublicKey:', credentialPublicKey);
      
      try {
        // Store the user's keys in Supabase with proper encryption
        const encryptedServerKey = encryptPrivateKey(serverKey, process.env.KEY_ENCRYPTION_KEY || '');
        const recoveryKeyHash = createHash('sha256').update(recoveryKey).digest('hex');
        
        const { error: userUpdateError } = await supabase
          .from('users')
          .update({
            server_key_encrypted: encryptedServerKey,
            recovery_key_hash: recoveryKeyHash
          })
          .eq('id', userId);

        if (userUpdateError) {
          console.error('API: Error storing user keys in Supabase:', userUpdateError);
          throw new Error('Failed to store encryption keys');
        }

        console.log('🔐 Using Supabase service role client to insert authenticator...');
        
        console.log('🔍 credentialID:', credentialID, typeof credentialID);
      console.log('🔍 base64 credentialID:', Buffer.from(credentialID).toString('base64url'));

        // Store authenticator in Supabase
        const { error: authError } = await supabase
          .from('authenticators')
          .insert({
            id: crypto.randomUUID(),
            user_id: userId,
            credential_id: credentialIdStr,
            credential_public_key: Buffer.from(credentialPublicKey).toString('base64'), // Store as bytea
            counter: counter,
            device_name: deviceName || 'Default Device',
            created_at: new Date().toISOString(),
            last_used: new Date().toISOString(),
            is_active: true
          });
          
        if (authError) {
          console.error('API: Error storing authenticator in Supabase:', authError);
          throw new Error('Failed to store authentication credential');
        }
        
        console.log('API: Authenticator stored in Supabase');

        // Create smart account from the credential using DKG
        console.log('API: Creating smart account...');
        const { address } = await createSmartAccountFromCredential(
          userId,
          deviceKey,
          'biometric',
          true
        );
        console.log(`API: Smart account created with address: ${address}`);
                
        
        // Clear registration cookies
        cookieStore.delete('register_challenge');
        cookieStore.delete('register_user_id');
        cookieStore.delete('register_keys');
        cookieStore.delete('register_device_name');
        
        // Set session cookies
        cookieStore.set('session', 'authenticated', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 24 * 60 * 60, // 24 hours
        });
        
        cookieStore.set('userId', userId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 24 * 60 * 60, // 24 hours
        });
        
        cookieStore.set('walletAddress', address, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 24 * 60 * 60, // 24 hours
        });
        
        // Return success with the recovery key (ONLY ONCE!)
        return NextResponse.json({
          success: true,
          message: 'Registration successful',
          recoveryKey,
          walletAddress: address,
          userId: userId
        });
      } catch (scaError) {
        console.error('API: Error creating Smart Contract Account:', scaError);
        // Create detailed error response with helpful diagnostics
        const errorDetails = {
          message: scaError instanceof Error ? scaError.message : String(scaError),
          stack: scaError instanceof Error ? scaError.stack : undefined,
          type: 'smart_account_creation_error'
        };
        
        // Log detailed error information for debugging
        console.error('API: SCA creation error details:', JSON.stringify(errorDetails));
        
        throw new Error(`Failed to create Smart Contract Account: ${scaError instanceof Error ? scaError.message : String(scaError)}`);
      }
    } catch (verifyError) {
      console.error('API: Verification error:', verifyError);
      
      // Return the error to the client
      return NextResponse.json({
        success: false,
        error: verifyError instanceof Error ? verifyError.message : 'Failed to verify WebAuthn credential'
      }, { status: 400 });
    }
  } catch (error) {
    console.error('API: Registration completion error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Registration completion failed'
    }, { status: 500 });
  }
} 
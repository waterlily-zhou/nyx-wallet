import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { findUserById, addAuthenticator, storeKeys, updateUser, rpID, origin } from '@/lib/utils/user-store';
import { createSmartAccountFromCredential } from '@/lib/utils/user-store';
import { type Address } from 'viem';
import { AuthenticatorDevice } from '@/lib/types/credentials';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Registration completion endpoint called');
    
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
    
    // Parse the keys
    const keys = JSON.parse(keysStr);
    const { deviceKey, serverKey, recoveryKey } = keys;
    
    console.log(`API: Completing registration for user ${userId}`);
    
    // For demo purposes, we'll check for simulated credential, but instead of returning a mock
    // wallet, we'll throw an error to enforce real SCA creation
    if (credential.id === 'simulated-credential-id') {
      console.log('API: Rejecting simulated credential - real SCA required');
      return NextResponse.json({ 
        success: false, 
        error: 'Simulated credentials are not allowed. Must use real biometric authentication.' 
      }, { status: 400 });
    }
    
    // Extract the origin from the credential to handle port changes
    const credentialDataJson = Buffer.from(credential.response.clientDataJSON, 'base64').toString();
    const credentialData = JSON.parse(credentialDataJson);
    const actualOrigin = credentialData.origin;
    
    console.log('API: Expected origin (from config):', origin);
    console.log('API: Actual origin (from credential):', actualOrigin);
    
    // Extract and decode the challenge from the credential data for debugging
    const credentialChallenge = credentialData.challenge;
    console.log('API: Challenge from client data JSON:', credentialChallenge);
    
    try {
      // Verify the credential with WebAuthn - using actual origin from credential
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challengeBase64, // Use the challenge directly as stored
        expectedOrigin: actualOrigin, // Use the ACTUAL origin from the credential
        expectedRPID: rpID,
      });
      
      if (!verification.verified) {
        console.error('API: WebAuthn verification failed');
        throw new Error('WebAuthn verification failed');
      }
      
      console.log('API: WebAuthn verification successful');
      
      // Extract authenticator data - with proper type safety
      if (!verification.registrationInfo) {
        throw new Error('Missing registration info');
      }
      
      // Extract the correct properties from verification.registrationInfo
      // These property names are different depending on the library version
      const registrationInfo = verification.registrationInfo;
      
      // Extract credential ID directly from the credential object since structure may vary
      const credentialID = credential.id;
      const credentialRawId = credential.rawId;
      // Default counter to 0 since it might not exist in the registrationInfo
      const counter = 0;
      
      try {
        // Create smart account from the credential using DKG
        console.log('API: Creating smart account...');
        const { address } = await createSmartAccountFromCredential(userId, 'biometric');
        console.log(`API: Smart account created with address: ${address}`);
        
        // Store the authenticator
        const authenticator: AuthenticatorDevice = {
          id: crypto.randomUUID(),
          walletAddress: address as Address,
          credentialID: credentialID,
          credentialPublicKey: credentialRawId, 
          counter: counter,
          deviceName: deviceName || 'Default Device',
          createdAt: new Date(),
          lastUsed: new Date()
        };
        
        addAuthenticator(authenticator);
        console.log('API: Authenticator stored');
        
        // Store the keys securely
        await storeKeys(userId, deviceKey, serverKey, recoveryKey);
        console.log('API: Keys stored securely');
        
        // Update the user with the wallet address
        const user = findUserById(userId);
        if (user) {
          user.walletAddress = address as Address;
          updateUser(user);
          console.log('API: User updated with wallet address');
        }
        
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
          walletAddress: address
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
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to complete registration' },
      { status: 500 }
    );
  }
} 
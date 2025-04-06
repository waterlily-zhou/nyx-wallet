import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { findAuthenticatorByCredentialId, rpID, origin, findUserById, getWalletsForUser, updateAuthenticator } from '@/lib/utils/user-store';
import { setSessionCookie } from '@/lib/utils/auth-utils';
import type { AuthenticationResponseJSON } from '@simplewebauthn/typescript-types';

export async function POST(request: NextRequest) {
  try {
    // Step 1: Handle the initial request to get authentication options
    const body = await request.json();
    
    // Check if this is a verification request (has credential) or an options request
    if (body.credential) {
      console.log('Verifying authentication response');
      
      // This is verification of an authentication response
      const { credential, userId, challenge } = body;
      
      // Find the user and their authenticator
      const user = findUserById(userId);
      if (!user) {
        console.error(`User ${userId} not found during authentication verification`);
        return NextResponse.json({ 
          success: false, 
          message: 'User not found' 
        }, { status: 400 });
      }
      
      console.log(`Found user ${userId} for authentication verification`);
      
      // Find the authenticator by the credential ID
      const authenticator = findAuthenticatorByCredentialId(credential.id);
      if (!authenticator) {
        console.error(`Authenticator with credential ID ${credential.id} not found`);
        return NextResponse.json({ 
          success: false, 
          message: 'Authenticator not found' 
        }, { status: 400 });
      }
      
      console.log(`Found authenticator for credential ID ${credential.id}`);
      
      // Use the challenge provided in the request, or fallback to an empty string
      const expectedChallenge = challenge || '';
      
      // Verify the authentication response
      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          credential: credential as AuthenticationResponseJSON,
          expectedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: true
        });
      } catch (error) {
        console.error('Error verifying authentication response:', error);
        return NextResponse.json({ 
          success: false, 
          message: `Authentication verification failed: ${error instanceof Error ? error.message : String(error)}` 
        }, { status: 400 });
      }
      
      console.log('Authentication verification result:', verification);
      
      // If verification was successful, update the authenticator counter
      if (verification.verified) {
        authenticator.counter = verification.authenticationInfo.newCounter;
        authenticator.lastUsed = new Date();
        
        // Update the authenticator in storage
        updateAuthenticator(authenticator);
        
        // Get all wallets for this user
        const wallets = getWalletsForUser(userId);
        
        // Create the response with success, user ID, wallet address, etc.
        const response = NextResponse.json({
          success: true,
          userId: userId,
          wallets: wallets,
          existingWallet: wallets.length > 0, // Add existingWallet flag
          message: 'Authentication successful'
        });
        
        // Set session cookies
        setSessionCookie(response, userId, wallets[0]?.address);
        
        return response;
      } else {
        return NextResponse.json({ 
          success: false, 
          message: 'Authentication verification failed' 
        }, { status: 400 });
      }
    } else {
      console.log('Generating authentication options');
      
      // This is a request to get authentication options
      const { username } = body;
      
      // Get the options for authenticating
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'required',
        timeout: 60000
      });
      
      // Return the options
      return NextResponse.json({
        success: true,
        options,
        challenge: options.challenge // Include the challenge so client can use it in verification
      });
    }
  } catch (error) {
    console.error('Error in authentication process:', error);
    return NextResponse.json({ 
      success: false, 
      message: `Authentication error: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
} 
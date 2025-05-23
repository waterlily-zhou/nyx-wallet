import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { createUser, rpName, rpID, origin } from '@/lib/utils/user-store';
import { generateDistributedKeys } from '@/lib/utils/key-encryption';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Registration endpoint called');
    
    // Get username from request
    const body = await request.json();
    console.log('API: Request body:', body);
    
    const { username, deviceName, test } = body;
    
    if (!username) {
      console.log('API: Username missing');
      return NextResponse.json({ 
        success: false, 
        error: 'Username is required' 
      }, { status: 400 });
    }
    
    // Special case for test mode - don't create actual user or keys
    if (test) {
      console.log('API: Test mode requested, returning test options');
      
      // Generate WebAuthn registration options
      try {
        // Convert string ID to Uint8Array for SimpleWebAuthn
        const testUserId = `test-${Date.now()}`;
        const userIdBuffer = new TextEncoder().encode(testUserId);
        
        const registrationOptions = await generateRegistrationOptions({
          rpName,
          rpID,
          userID: userIdBuffer,
          userName: username,
          userDisplayName: username,
          attestationType: 'none',
          authenticatorSelection: {
            userVerification: 'required',
            residentKey: 'required',
            authenticatorAttachment: 'platform' // Use platform authenticator (TouchID/FaceID)
          }
        });
        
        console.log('API: Generated test WebAuthn registration options successfully');
        
        return NextResponse.json({
          success: true,
          options: registrationOptions,
          testMode: true
        });
      } catch (optionsError) {
        console.error('API: Error generating test WebAuthn options:', optionsError);
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to generate WebAuthn options' 
        }, { status: 500 });
      }
    }
    
    // Create a new user
    const newUser = createUser(username, 'biometric');
    console.log(`API: Created new user: ${newUser.id} (${username})`);
    
    // Generate DKG keys
    const { deviceKey, serverKey, recoveryKey } = generateDistributedKeys();
    console.log('API: Generated distributed keys');
    
    // Convert userId to Uint8Array for WebAuthn
    const userIdBuffer = new TextEncoder().encode(newUser.id);
    
    try {
      // Generate WebAuthn registration options - letting the library generate a challenge
      const registrationOptions = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: userIdBuffer,
        userName: username,
        userDisplayName: username,
        attestationType: 'none',
        authenticatorSelection: {
          userVerification: 'required',
          residentKey: 'required',
          authenticatorAttachment: 'platform' // Use platform authenticator (TouchID/FaceID)
        }
      });
      
      // Store the exact challenge string - SimpleWebAuthn's internal format
      const challengeString = registrationOptions.challenge;
      console.log('API: Original raw challenge:', challengeString);
      
      // Store registration data in cookies
      const cookieStore = cookies();
      cookieStore.set('register_challenge', challengeString, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 5 * 60, // 5 minutes
      });
      
      cookieStore.set('register_user_id', newUser.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 5 * 60, // 5 minutes
      });
      
      // Store the keys temporarily
      cookieStore.set('register_keys', JSON.stringify({
        deviceKey,
        serverKey,
        recoveryKey
      }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 5 * 60, // 5 minutes
      });
      
      // Set device name if provided
      if (deviceName) {
        cookieStore.set('register_device_name', deviceName, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 5 * 60, // 5 minutes
        });
      }
      
      console.log('API: Generated WebAuthn registration options successfully');
      
      return NextResponse.json({
        success: true,
        options: registrationOptions
      });
    } catch (optionsError) {
      console.error('API: Error generating WebAuthn options:', optionsError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to generate WebAuthn options' 
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('API: Registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initiate registration' },
      { status: 500 }
    );
  }
}

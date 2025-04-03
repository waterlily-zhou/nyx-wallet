import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { createUser } from '@/lib/utils/user-store';

// WebAuthn settings
const rpName = 'Nyx Wallet';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || `http://${rpID}:3000`;

export async function POST(req: NextRequest) {
  try {
    // Generate a random user ID
    const userId = randomBytes(16).toString('hex');
    
    // Create a new user
    const user = createUser(`user_${userId.substring(0, 4)}`, 'biometric');
    
    // Generate registration options (let simplewebauthn handle the challenge)
    const registrationOptions = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: userId,
      userName: user.username,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'preferred',
        authenticatorAttachment: 'platform',
      },
    });
    
    // Store the challenge in a cookie for verification later
    const response = NextResponse.json({ 
      success: true, 
      options: registrationOptions,
      userId,
      // For demo purposes, we're returning a device key that would normally come from the client
      deviceKey: `0x${randomBytes(32).toString('hex')}`,
    });
    
    // Convert the challenge to string format for the cookie
    const challengeStr = Buffer.from(registrationOptions.challenge).toString('base64');
    
    response.cookies.set('registration_challenge', challengeStr, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 5, // 5 minutes
    });
    
    return response;
  } catch (error) {
    console.error('Error during registration initiation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initiate registration' },
      { status: 500 }
    );
  }
}

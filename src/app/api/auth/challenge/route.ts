import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function GET() {
  try {
    console.log('API: Challenge endpoint called');
    
    const cookieStore = cookies();
    
    // Generate a random challenge
    const challenge = crypto.randomBytes(32);
    
    // Convert to base64 string for the client
    const challengeBase64 = challenge.toString('base64');
    
    console.log('API: Generated challenge with length:', challengeBase64.length);
    
    // Store the challenge in a cookie for verification
    cookieStore.set('auth_challenge', challengeBase64, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 300 // 5 minutes
    });

    return NextResponse.json({
      success: true,
      challenge: challengeBase64
    });
  } catch (error) {
    console.error('Error generating challenge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate challenge' },
      { status: 500 }
    );
  }
} 
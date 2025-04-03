import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function GET() {
  try {
    const cookieStore = cookies();
    
    // Generate a random challenge
    const challenge = crypto.randomBytes(32);
    
    // Convert to array for the client
    const challengeArray = Array.from(challenge);
    
    // Store the challenge in a cookie for verification
    cookieStore.set('auth_challenge', challenge.toString('base64'), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 300 // 5 minutes
    });

    return NextResponse.json({
      success: true,
      challenge: challengeArray
    });
  } catch (error) {
    console.error('Error generating challenge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate challenge' },
      { status: 500 }
    );
  }
} 
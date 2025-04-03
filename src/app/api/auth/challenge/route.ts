import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function GET() {
  try {
    const cookieStore = cookies();
    
    //TODO: Replace this random challenge with a challenge from the user's wallet
    const challenge = crypto.randomBytes(32);
    
    // Store the challenge in a cookie for verification
    cookieStore.set('auth_challenge', challenge.toString('base64'), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 300 // 5 minutes
    });

    return NextResponse.json({
      success: true,
      challenge: Array.from(challenge)
    });
  } catch (error) {
    console.error('Error generating challenge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate challenge' },
      { status: 500 }
    );
  }
} 
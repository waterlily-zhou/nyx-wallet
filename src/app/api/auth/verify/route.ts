import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    const storedChallenge = cookieStore.get('auth_challenge')?.value;

    if (!walletAddress || !storedChallenge) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, type } = body;

    // Verify the credential matches what we expect
    if (!id || type !== 'public-key') {
      return NextResponse.json(
        { success: false, error: 'Invalid credential' },
        { status: 400 }
      );
    }

    // Here you would typically:
    // 1. Verify the credential against stored credentials
    // 2. Verify the challenge response
    // 3. Check the signature
    // For now, we'll just verify the challenge exists and clear it

    // Clear the challenge cookie
    cookieStore.delete('auth_challenge');

    // Set the session cookie
    cookieStore.set('session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 // 1 week
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error verifying credential:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify credential' },
      { status: 500 }
    );
  }
} 
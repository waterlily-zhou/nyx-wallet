import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('Create test wallet endpoint called');
    const { address } = await request.json();
    
    if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }
    
    console.log(`Setting wallet address cookie: ${address}`);
    
    // Set the wallet address in a cookie
    const cookieStore = cookies();
    cookieStore.set('walletAddress', address, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    // Set session status
    cookieStore.set('session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    console.log('Cookies set successfully');
    
    return NextResponse.json({
      success: true,
      address,
    });
  } catch (error) {
    console.error('Error creating test wallet:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create test wallet' },
      { status: 500 }
    );
  }
} 
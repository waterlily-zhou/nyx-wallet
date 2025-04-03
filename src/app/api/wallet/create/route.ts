import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { type Address } from 'viem';

export async function POST(request: NextRequest) {
  try {
    console.log('Wallet creation endpoint called');
    
    // Use a test wallet address
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678' as Address;
    
    // Set the wallet address in cookies
    const cookieStore = cookies();
    cookieStore.set('walletAddress', walletAddress, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    cookieStore.set('session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    console.log('Wallet created with address:', walletAddress);
    
    return NextResponse.json({
      success: true,
      wallet: {
        address: walletAddress
      }
    });
  } catch (error) {
    console.error('Error creating wallet:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create wallet' },
      { status: 500 }
    );
  }
}

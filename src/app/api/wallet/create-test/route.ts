import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { type Address } from 'viem';

// This is a simplified endpoint for testing purposes
// It creates a mock wallet without biometric auth
export async function POST(request: NextRequest) {
  try {
    console.log('Create test wallet endpoint called');
    
    // Use a test wallet address
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678' as Address;
    
    // Set cookies
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
    
    console.log('Setting wallet address cookie:', walletAddress);
    console.log('Cookies set successfully');
    
    return NextResponse.json({
      success: true,
      wallet: {
        address: walletAddress
      },
      message: 'Test wallet created successfully'
    });
  } catch (error) {
    console.error('Error creating test wallet:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create test wallet' },
      { status: 500 }
    );
  }
} 
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('Wallet check endpoint called');
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    const session = cookieStore.get('session')?.value;

    console.log('Checking wallet cookies:', { 
      walletAddress: walletAddress || 'not found', 
      session: session || 'not found' 
    });

    return NextResponse.json({
      walletAddress,
      hasWallet: !!walletAddress,
      isAuthenticated: session === 'authenticated'
    });
  } catch (error) {
    console.error('Error checking wallet:', error);
    return NextResponse.json(
      { error: 'Failed to check wallet status' },
      { status: 500 }
    );
  }
} 
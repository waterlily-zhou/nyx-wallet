import { createWallet } from '@/lib/wallet';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Hex } from 'viem';

export async function POST(req: NextRequest) {
  try {
    console.log('Wallet creation request received');
    
    const body = await req.json();
    const { userId, deviceKey } = body;
    
    console.log(`Processing wallet creation for userId: ${userId}`);
    
    if (!userId || !deviceKey) {
      console.error('Missing required parameters:', { userId, deviceKey });
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    console.log('Creating wallet with params:', { userId, deviceKey: deviceKey.substring(0, 10) + '...' });
    
    const { address, clientSetup } = await createWallet({
      method: 'biometric',
      userId,
      deviceKey: deviceKey as Hex,
    });

    console.log('Wallet created successfully:', { address });

    const cookieStore = cookies();
    const isProd = process.env.NODE_ENV === 'production';

    cookieStore.set('walletAddress', address, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
    });

    cookieStore.set('session', 'authenticated', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return NextResponse.json({ address });
  } catch (error) {
    console.error('Error creating wallet:', error instanceof Error ? error.message : error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
    
    // Return detailed error information in development
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ 
        error: 'Failed to create wallet',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      }, { status: 500 });
    }
    
    return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 });
  }
}

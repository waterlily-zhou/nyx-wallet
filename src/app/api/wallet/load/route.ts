import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSmartAccountFromCredential } from '@/lib/utils/user-store';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Wallet load endpoint called');
    
    // Extract user ID from request
    const body = await request.json();
    const { userId } = body;
    
    if (!userId) {
      console.log('API: Missing user ID');
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`API: Loading wallet for user ${userId}`);
    
    // Load the smart account using biometric authentication
    try {
      const smartAccountResult = await createSmartAccountFromCredential(
        userId,
        'biometric'
      );
      
      console.log(`API: Successfully loaded wallet with address ${smartAccountResult.address}`);
      
      // Set the wallet address in cookies
      const cookieStore = cookies();
      cookieStore.set('walletAddress', smartAccountResult.address, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });
      
      // Set authenticated session
      cookieStore.set('session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });
      
      // Set user ID cookie for future requests
      cookieStore.set('userId', userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });
      
      return NextResponse.json({
        success: true,
        wallet: {
          address: smartAccountResult.address
        },
        message: 'Wallet loaded successfully'
      });
    } catch (error) {
      console.error('API: Error loading smart account:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to load wallet',
          detail: 'Smart account creation failed'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('API: Error in wallet load endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load wallet' },
      { status: 500 }
    );
  }
} 
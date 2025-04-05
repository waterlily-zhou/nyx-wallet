import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findUserById } from '@/lib/utils/user-store';

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
    
    // Find user and check if they already have a wallet address
    const user = findUserById(userId);
    if (!user) {
      console.error(`API: User ${userId} not found`);
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Check if user already has a wallet address
    if (!user.walletAddress) {
      console.log(`API: User ${userId} has no existing wallet address. A wallet needs to be created first.`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'No wallet found for this user. Please create a wallet first.',
          needsWalletCreation: true 
        },
        { status: 404 }
      );
    }
    
    console.log(`API: Found existing wallet with address ${user.walletAddress}`);
    
    // Set the wallet address in cookies
    const cookieStore = cookies();
    cookieStore.set('walletAddress', user.walletAddress, {
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
        address: user.walletAddress
      },
      message: 'Existing wallet loaded successfully'
    });
    
  } catch (error) {
    console.error('API: Error in wallet load endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load wallet' },
      { status: 500 }
    );
  }
} 
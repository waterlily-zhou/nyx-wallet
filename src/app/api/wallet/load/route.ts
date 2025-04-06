import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findUserById, getDefaultWallet, getNewestWallet } from '@/lib/utils/user-store';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Wallet load endpoint called');
    
    const body = await request.json();
    const { userId, includeNewWallet = false } = body;
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required userId parameter' 
      }, { status: 400 });
    }
    
    console.log(`API: Loading wallet for user ${userId}, includeNewWallet: ${includeNewWallet}`);
    
    // Get user from storage
    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Check if user has wallets in the wallets array or a legacy walletAddress
    const wallet = includeNewWallet 
      ? getNewestWallet(userId)  // Get newest wallet if specifically looking for new wallet
      : getDefaultWallet(userId);  // Otherwise get default wallet
    
    const legacyWallet = user.walletAddress;
    
    if (!wallet && !legacyWallet) {
      console.log(`API: User ${userId} does not have a wallet`);
      return NextResponse.json({ 
        success: false, 
        error: 'No wallet found for this user',
        needsWalletCreation: true
      }, { status: 404 });
    }
    
    // Use the selected wallet from the wallets array or fall back to the legacy address
    const walletAddress = wallet?.address || legacyWallet || '';
    
    console.log(`API: Loaded wallet for user ${userId}: ${walletAddress} (includeNewWallet: ${includeNewWallet})`);
    
    // Log all wallets for debugging
    if (user.wallets && user.wallets.length > 0) {
      console.log(`API: User has ${user.wallets.length} wallet(s):`);
      user.wallets.forEach((w, index) => {
        console.log(`API: Wallet #${index}: ${w.address}, created: ${new Date(w.createdAt).toISOString()}, saltNonce: ${w.saltNonce || 'none'}, isDefault: ${w.isDefault}`);
      });
    } else {
      console.log(`API: User has no wallets array or it's empty`);
    }
    
    // Set session cookies
    const cookieStore = cookies();
    cookieStore.set('session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    // Make sure walletAddress is always a string for the cookie
    cookieStore.set('walletAddress', String(walletAddress), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    cookieStore.set('userId', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    // Check if the user has multiple wallets
    const hasMultipleWallets = user.wallets && user.wallets.length > 1;
    
    return NextResponse.json({
      success: true,
      wallet: {
        address: walletAddress,
        name: wallet?.name || 'Primary Wallet',
        chainId: wallet?.chainId || 11155111 // Default to Sepolia
      },
      multipleWallets: hasMultipleWallets
    });
  } catch (error) {
    console.error('API: Wallet load error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error loading wallet' 
    }, { status: 500 });
  }
} 
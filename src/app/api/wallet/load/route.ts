import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findUserById } from '@/lib/utils/user-store';
import { supabase } from '@/lib/supabase/server';

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
    
    // Get user from Supabase
    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Get wallets from Supabase
    const { data: wallets, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (walletError) {
      console.error('API: Error loading wallets:', walletError);
      return NextResponse.json({ 
        success: false, 
        error: 'Error loading wallets'
      }, { status: 500 });
    }
    
    if (!wallets || wallets.length === 0) {
      console.log(`API: User ${userId} does not have a wallet`);
      return NextResponse.json({ 
        success: false, 
        error: 'No wallet found for this user',
        needsWalletCreation: true
      }, { status: 404 });
    }
    
    // Get the wallet based on the request
    let wallet;
    if (includeNewWallet) {
      // Get newest wallet by created_at date
      wallet = wallets[0]; // Already sorted by created_at desc
    } else {
      // Get default wallet
      wallet = wallets.find(w => w.is_default) || wallets[0];
    }
    
    const walletAddress = wallet.address;
    
    console.log(`API: Loaded wallet for user ${userId}: ${walletAddress} (includeNewWallet: ${includeNewWallet})`);
    
    // Log all wallets for debugging
    if (wallets.length > 0) {
      console.log(`API: User has ${wallets.length} wallet(s):`);
      wallets.forEach((w, index) => {
        console.log(`API: Wallet #${index}: ${w.address}, created: ${w.created_at}, saltNonce: ${w.salt_nonce || 'none'}, isDefault: ${w.is_default}`);
      });
    } else {
      console.log(`API: User has no wallets`);
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
    const hasMultipleWallets = wallets.length > 1;
    
    return NextResponse.json({
      success: true,
      wallet: {
        address: walletAddress,
        name: wallet.name || 'Primary Wallet',
        chainId: wallet.chain_id || 11155111 // Default to Sepolia
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
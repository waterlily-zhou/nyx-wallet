import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setUserDefaultWallet, loadUserWallet } from '@/lib/wallet/multi-wallet';
import { type Address } from 'viem';

export async function POST(request: NextRequest) {
  try {
    // Get user ID from cookies
    const cookieStore = cookies();
    const userId = cookieStore.get('userId')?.value;
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Not authenticated. Please sign in first.' 
      }, { status: 401 });
    }
    
    // Get wallet address from request body
    const body = await request.json();
    const { walletAddress } = body;
    
    if (!walletAddress) {
      return NextResponse.json({ 
        success: false, 
        error: 'Wallet address is required' 
      }, { status: 400 });
    }
    
    console.log(`API: Switching wallet for user ${userId} to ${walletAddress}`);
    
    // Load the wallet to verify it exists and belongs to this user
    try {
      const result = await loadUserWallet(userId, walletAddress as Address);
      
      // Set as the current wallet
      setUserDefaultWallet(userId, walletAddress as Address);
      
      // Update wallet address cookie
      cookieStore.set('walletAddress', walletAddress, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });
      
      console.log(`API: Switched to wallet ${walletAddress} (${result.wallet.name})`);
      
      return NextResponse.json({
        success: true,
        wallet: {
          address: result.wallet.address,
          name: result.wallet.name,
          chainId: result.wallet.chainId,
          isDefault: true, // It's now the default
          createdAt: result.wallet.createdAt
        }
      });
    } catch (error) {
      console.error(`API: Error switching to wallet ${walletAddress}:`, error);
      return NextResponse.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to switch wallet' 
      }, { status: 404 });
    }
  } catch (error) {
    console.error('API: Error handling wallet switch:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to switch wallet' },
      { status: 500 }
    );
  }
} 
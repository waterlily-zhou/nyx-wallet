import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserWallets } from '@/lib/wallet/multi-wallet';

export async function GET(request: NextRequest) {
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
    
    console.log(`API: Getting wallets for user ${userId}`);
    
    // Get all wallets for the user
    const wallets = getUserWallets(userId);
    
    // Return the wallets without any sensitive information
    const sanitizedWallets = wallets.map(wallet => ({
      address: wallet.address,
      name: wallet.name,
      chainId: wallet.chainId,
      isDefault: wallet.isDefault,
      createdAt: wallet.createdAt
    }));
    
    console.log(`API: Found ${wallets.length} wallets for user ${userId}`);
    
    return NextResponse.json({
      success: true,
      wallets: sanitizedWallets
    });
  } catch (error) {
    console.error('API: Error listing wallets:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list wallets' },
      { status: 500 }
    );
  }
} 
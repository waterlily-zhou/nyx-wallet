import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdditionalWallet } from '@/lib/wallet/multi-wallet';

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
    
    // Get optional parameters from request body
    const body = await request.json();
    const { name, chainId } = body;
    
    console.log(`API: Creating additional wallet for user ${userId}`);
    
    // Create the additional wallet
    const newWallet = await createAdditionalWallet(userId, name, chainId);
    
    // Set as the current wallet in cookies
    cookieStore.set('walletAddress', newWallet.address, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    console.log(`API: Created new wallet ${newWallet.address} with name "${newWallet.name}"`);
    
    return NextResponse.json({
      success: true,
      wallet: {
        address: newWallet.address,
        name: newWallet.name,
        chainId: newWallet.chainId,
        isDefault: newWallet.isDefault,
        createdAt: newWallet.createdAt
      }
    });
  } catch (error) {
    console.error('API: Error creating additional wallet:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create additional wallet' },
      { status: 500 }
    );
  }
} 
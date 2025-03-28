import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWallet } from '@/lib/wallet';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    
    // Create the wallet
    const walletAddress = await createWallet(account.address);
    
    // Store the private key and wallet address in cookies
    cookieStore.set('privateKey', privateKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
    
    cookieStore.set('walletAddress', walletAddress, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    // Set session cookie
    cookieStore.set('session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 // 24 hours
    });

    return NextResponse.json({
      wallet: {
        address: walletAddress,
        type: 'smart-account'
      }
    });

  } catch (error) {
    console.error('Error creating wallet:', error);
    return NextResponse.json(
      { error: 'Failed to create wallet' },
      { status: 500 }
    );
  }
} 
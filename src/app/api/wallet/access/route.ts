import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from 'fs/promises';
import path from 'path';

export async function POST() {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'No wallet found' },
        { status: 401 }
      );
    }

    // Check if the session is authenticated
    const session = cookieStore.get('session')?.value;
    if (session !== 'authenticated') {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get the wallet data
    const walletPath = path.join(process.cwd(), 'data', 'wallets', `${walletAddress}.json`);
    try {
      const walletData = await fs.readFile(walletPath, 'utf-8');
      const wallet = JSON.parse(walletData);

      // Set the wallet session
      cookieStore.set('walletSession', 'active', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 // 24 hours
      });

      return NextResponse.json({
        success: true,
        data: {
          address: wallet.address,
          // Add any other non-sensitive wallet data
        }
      });
    } catch (error) {
      console.error('Error reading wallet file:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to access wallet' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error accessing wallet:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to access wallet' },
      { status: 500 }
    );
  }
} 
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;

    if (!walletAddress) {
      return NextResponse.json({ hasSavedWallet: false });
    }

    // Check if the wallet file exists
    const walletPath = path.join(process.cwd(), 'data', 'wallets', `${walletAddress}.json`);
    try {
      await fs.access(walletPath);
      return NextResponse.json({ hasSavedWallet: true });
    } catch {
      return NextResponse.json({ hasSavedWallet: false });
    }
  } catch (error) {
    console.error('Error checking wallet:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check wallet' },
      { status: 500 }
    );
  }
} 
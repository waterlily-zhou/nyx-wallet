import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { bundlerClient } from '@/lib/client-setup';
import { Address } from 'viem';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 401 }
      );
    }

    const nonce = await bundlerClient.getUserOperationCount({
      entryPoint: process.env.ENTRYPOINT_ADDRESS!,
      sender: walletAddress as Address
    });

    return NextResponse.json({
      success: true,
      data: { nonce }
    });

  } catch (error) {
    console.error('Error getting nonce:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get nonce' },
      { status: 500 }
    );
  }
} 
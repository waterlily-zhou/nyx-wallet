import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { parseEther, Address } from 'viem';
import { sendTransaction } from '@/lib/wallet';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { to, value, data } = body;

    if (!to || !value) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Convert value from ETH to Wei
    const valueInWei = parseEther(value);

    // Send the transaction
    const userOpHash = await sendTransaction(
      walletAddress as Address,
      to as Address,
      valueInWei,
      data || '0x'
    );

    return NextResponse.json({
      success: true,
      data: {
        userOpHash,
        explorerUrl: `${process.env.EXPLORER_URL}/user-operation/${userOpHash}`
      }
    });

  } catch (error) {
    console.error('Error sending transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send transaction' },
      { status: 500 }
    );
  }
} 
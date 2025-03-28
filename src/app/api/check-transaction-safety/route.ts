import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Address, parseEther } from 'viem';
import { bundlerClient } from '@/lib/client-setup';

interface SafetyCheckResult {
  isSafe: boolean;
  warnings: string[];
}

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

    const warnings: string[] = [];
    
    // Check if the value is reasonable (e.g., not sending entire balance)
    const valueInWei = parseEther(value);
    const balance = await bundlerClient.getBalance({
      address: walletAddress as Address
    });
    
    if (valueInWei >= balance) {
      warnings.push('Transaction value is equal to or greater than current balance');
    }
    
    if (valueInWei > parseEther('1')) {
      warnings.push('Large transaction value detected (> 1 ETH)');
    }

    // Check if the recipient is a contract
    const recipientCode = await bundlerClient.getBytecode({
      address: to as Address
    });
    
    if (recipientCode && recipientCode !== '0x') {
      warnings.push('Recipient is a smart contract');
      
      // If there's additional data, warn about potential contract interaction
      if (data && data !== '0x') {
        warnings.push('Transaction includes contract interaction data');
      }
    }

    // Check if this is the first transaction to this address
    const nonce = await bundlerClient.getUserOperationCount({
      entryPoint: process.env.ENTRYPOINT_ADDRESS!,
      sender: walletAddress as Address
    });
    
    if (Number(nonce) === 0) {
      warnings.push('This is your first transaction from this wallet');
    }

    // Determine if the transaction is safe based on warnings
    const isSafe = warnings.length === 0;

    const result: SafetyCheckResult = {
      isSafe,
      warnings
    };

    return NextResponse.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error checking transaction safety:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check transaction safety' },
      { status: 500 }
    );
  }
} 
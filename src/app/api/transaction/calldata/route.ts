import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { parseEther, Address, encodeFunctionData } from 'viem';
import { bundlerClient } from '@/lib/client-setup';

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

    // Get the current nonce
    const nonce = await bundlerClient.getUserOperationCount({
      entryPoint: process.env.ENTRYPOINT_ADDRESS!,
      sender: walletAddress as Address
    });

    // Prepare the calldata
    let calldata = '0x';
    if (data) {
      // If custom data is provided, use it
      calldata = data;
    } else {
      // Otherwise, encode a simple ETH transfer
      calldata = encodeFunctionData({
        abi: [{
          type: 'function',
          name: 'transfer',
          inputs: [
            { type: 'address', name: 'to' },
            { type: 'uint256', name: 'value' }
          ],
          outputs: [],
          stateMutability: 'payable'
        }],
        args: [to, valueInWei]
      });
    }

    // Format the response
    const formattedCalldata = {
      sender: walletAddress,
      nonce: nonce.toString(),
      to,
      value: {
        wei: valueInWei.toString(),
        eth: value
      },
      data: calldata
    };

    return NextResponse.json({
      success: true,
      data: formattedCalldata
    });

  } catch (error) {
    console.error('Error preparing calldata:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to prepare calldata' },
      { status: 500 }
    );
  }
} 
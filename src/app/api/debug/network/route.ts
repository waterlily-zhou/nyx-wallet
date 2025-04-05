import { NextRequest, NextResponse } from 'next/server';
import { createPublicClientForSepolia } from '@/lib/client-setup';
import { baseSepolia } from 'viem/chains';

export async function GET(request: NextRequest) {
  try {
    // Create public client
    const publicClient = createPublicClientForSepolia();
    
    // Get chain ID and latest block
    const chainId = await publicClient.getChainId();
    const blockNumber = await publicClient.getBlockNumber();
    
    // Check if we're connected to Base Sepolia
    const isBaseSepolia = chainId === baseSepolia.id;
    
    return NextResponse.json({
      success: true,
      network: {
        chainId,
        isBaseSepolia,
        expectedChainId: baseSepolia.id,
        blockNumber: blockNumber.toString(),
        provider: publicClient.transport.url || 'Unknown',
        chain: isBaseSepolia ? 'Base Sepolia' : 'Unknown Chain'
      }
    });
  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 
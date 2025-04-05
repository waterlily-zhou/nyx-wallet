import { NextRequest, NextResponse } from 'next/server';
import { createPublicClientForSepolia } from '@/lib/client-setup';
import { formatEther } from 'viem';
import { withRetry } from '@/lib/utils/retry-utils';

export async function GET(request: NextRequest) {
  try {
    // Extract wallet address from query params
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    
    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address parameter is required' },
        { status: 400 }
      );
    }
    
    console.log(`API: Fetching balance for address ${address}`);
    
    // Create public client with multiple RPC providers and fallback
    const publicClient = createPublicClientForSepolia();
    
    // Fetch the balance with retry logic
    try {
      // Use withRetry to handle rate limits and network issues
      const balance = await withRetry(
        async () => {
          return await publicClient.getBalance({
            address: address as `0x${string}`,
          });
        },
        {
          maxRetries: 5,
          initialDelay: 1000,
          maxDelay: 10000,
          backoffFactor: 2
        }
      );
      
      console.log(`API: Balance fetched: ${formatEther(balance)} ETH`);
      
      return NextResponse.json({
        success: true,
        balance: balance.toString(),
        formattedBalance: formatEther(balance)
      });
    } catch (error) {
      console.error('API: Error fetching balance from blockchain:', error);
      
      // Provide better error message for rate limits
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch balance';
      const isRateLimit = errorMessage.toLowerCase().includes('rate limit') || 
                         errorMessage.toLowerCase().includes('too many request');
      
      return NextResponse.json(
        { 
          success: false, 
          error: isRateLimit 
            ? 'The network is busy right now. Please try again in a few moments.'
            : errorMessage,
          detail: 'RPC request failed',
          isRateLimit
        },
        { status: isRateLimit ? 429 : 500 }
      );
    }
  } catch (error) {
    console.error('API: Error in balance endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
} 
import { NextRequest, NextResponse } from 'next/server';
import { createPublicClientForSepolia } from '@/lib/client-setup';
import { formatEther } from 'viem';
import { withRetry } from '@/lib/utils/retry-utils';

export async function GET(request: NextRequest) {
  try {
    // Extract wallet address from query params
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address parameter is required' },
        { status: 400 }
      );
    }
    
    console.log(`API: Fetching transactions for address ${address}, limit: ${limit}`);
    
    // Create public client with multiple RPC providers and fallback
    const publicClient = createPublicClientForSepolia();
    
    try {
      // First, get the block number to start from (latest) with retry logic
      const latestBlock = await withRetry(
        async () => await publicClient.getBlockNumber(),
        {
          maxRetries: 5,
          initialDelay: 1000
        }
      );
      
      console.log(`API: Latest block: ${latestBlock}`);
      
      // For demonstration, we'll create some mock transactions since
      // getting full transaction history would require an indexer or multiple RPC calls
      // In a production app, you would use a service like Etherscan API, The Graph, or similar
      
      // Seed the random generator with the address to make it deterministic
      let seed = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const deterministicRandom = () => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };
      
      // Generate consistent mock transactions based on the wallet address
      const mockTransactions = [
        {
          hash: '0x' + Array(64).fill(0).map(() => Math.floor(deterministicRandom() * 16).toString(16)).join(''),
          from: address,
          to: '0x' + Array(40).fill(0).map(() => Math.floor(deterministicRandom() * 16).toString(16)).join(''),
          value: (0.01 * 10**18).toString(), // 0.01 ETH
          timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
          status: 'confirmed'
        },
        {
          hash: '0x' + Array(64).fill(0).map(() => Math.floor(deterministicRandom() * 16).toString(16)).join(''),
          from: '0x' + Array(40).fill(0).map(() => Math.floor(deterministicRandom() * 16).toString(16)).join(''),
          to: address,
          value: (0.05 * 10**18).toString(), // 0.05 ETH
          timestamp: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
          status: 'confirmed'
        },
        {
          hash: '0x' + Array(64).fill(0).map(() => Math.floor(deterministicRandom() * 16).toString(16)).join(''),
          from: address,
          to: '0x' + Array(40).fill(0).map(() => Math.floor(deterministicRandom() * 16).toString(16)).join(''),
          value: (0.001 * 10**18).toString(), // 0.001 ETH
          timestamp: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
          status: 'pending'
        }
      ];
      
      // In a real implementation, you would fetch actual transactions from the blockchain
      // Example (pseudocode):
      // const transactions = await fetchTransactionsFromIndexer(address, limit);
      
      console.log(`API: Returning ${mockTransactions.length} mock transactions`);
      
      return NextResponse.json({
        success: true,
        transactions: mockTransactions,
        message: 'Transaction history retrieved successfully (mock data)'
      });
    } catch (error) {
      console.error('API: Error fetching transactions:', error);
      
      // Provide better error message for rate limits
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch transactions';
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
    console.error('API: Error in transactions endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
} 
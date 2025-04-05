import { NextRequest, NextResponse } from 'next/server';
import { createPublicClientForSepolia } from '@/lib/client-setup';
import { formatUnits, parseAbi } from 'viem';
import { withRetry } from '@/lib/utils/retry-utils';

// ERC20 token interface
const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
]);

// Well-known token addresses (on Sepolia testnet)
const TOKEN_LIST = [
  {
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    priceUSD: 1.0
  },
  {
    address: '0x7AF17A48a6336F7dc1beF9D485139f7B6f4FB5F7', // DAI on Sepolia
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
    priceUSD: 1.0
  }
];

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
    
    console.log(`API: Fetching token balances for address ${address}`);
    
    // Create public client
    const publicClient = createPublicClientForSepolia();
    
    try {
      // Fetch ETH balance first
      const ethBalance = await withRetry(
        async () => {
          return await publicClient.getBalance({
            address: address as `0x${string}`,
          });
        },
        {
          maxRetries: 3,
          initialDelay: 1000
        }
      );
      
      // Current ETH price (in USD) - in production, fetch from a price oracle
      const ethPriceUSD = 3150; // Example price
      
      // Add ETH as a native asset
      const assets = [
        {
          type: 'native',
          symbol: 'ETH',
          name: 'Ethereum',
          balance: ethBalance.toString(),
          formattedBalance: formatUnits(ethBalance, 18),
          decimals: 18,
          network: 'Base Sepolia',
          networkId: 84532,
          logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
          priceUSD: ethPriceUSD,
          valueUSD: (Number(formatUnits(ethBalance, 18)) * ethPriceUSD).toString()
        }
      ];
      
      // Fetch token balances
      const tokenPromises = TOKEN_LIST.map(async (token) => {
        try {
          // Using multicall would be more efficient for many tokens
          const balance = await withRetry(
            async () => {
              return await publicClient.readContract({
                address: token.address as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [address as `0x${string}`]
              });
            },
            {
              maxRetries: 3,
              initialDelay: 1000
            }
          );
          
          const formattedBalance = formatUnits(balance as bigint, token.decimals);
          const valueUSD = (Number(formattedBalance) * token.priceUSD).toString();
          
          console.log(`API: Fetched ${token.symbol} balance for ${address}: ${formattedBalance}`);
          
          return {
            type: 'erc20',
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            balance: balance.toString(),
            formattedBalance,
            decimals: token.decimals,
            network: 'Base Sepolia',
            networkId: 84532,
            logoURI: token.logoURI,
            priceUSD: token.priceUSD,
            valueUSD
          };
        } catch (error) {
          console.error(`API: Error fetching balance for token ${token.symbol}:`, error);
          // Return a zero balance instead of null for more consistency
          return {
            type: 'erc20',
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            balance: "0",
            formattedBalance: "0",
            decimals: token.decimals,
            network: 'Base Sepolia',
            networkId: 84532,
            logoURI: token.logoURI,
            priceUSD: token.priceUSD,
            valueUSD: "0"
          };
        }
      });
      
      // Wait for all promises to resolve
      const tokenBalances = (await Promise.all(tokenPromises)).filter(Boolean) as any[];
      
      // Calculate total asset value
      const totalValueUSD = [...assets, ...tokenBalances].reduce(
        (total, asset) => total + Number(asset.valueUSD || 0), 
        0
      );
      
      return NextResponse.json({
        success: true,
        assets: [...assets, ...tokenBalances],
        totalValueUSD: totalValueUSD.toFixed(2)
      });
      
    } catch (error) {
      console.error('API: Error fetching token balances:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch token balances';
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
    console.error('API: Error in token balances endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch token balances' },
      { status: 500 }
    );
  }
} 
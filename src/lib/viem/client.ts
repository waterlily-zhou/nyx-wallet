import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

// Create a public client for baseSepolia
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
}); 
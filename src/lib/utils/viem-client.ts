import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

export function getPublicClient() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error('RPC_URL environment variable is not set');
  }

  return createPublicClient({
    chain: base,
    transport: http(rpcUrl)
  });
} 
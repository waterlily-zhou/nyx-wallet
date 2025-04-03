import { type Address, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { createPublicClient as viemCreatePublicClient, http } from 'viem';

// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address;

// Types
export interface ClientSetup {
  publicClient: any;
  pimlicoClient: any;
  owner: any;
  smartAccount: any;
  smartAccountClient: any;
}

// Functions
export function getActiveChain() {
  return {
    chain: sepolia,
    pimlicoChainName: 'sepolia'
  };
}

export function createPublicClient() {
  return viemCreatePublicClient({
    chain: sepolia,
    transport: http()
  });
}

export function createPimlicoClientInstance(apiKey: string) {
  // Stub implementation
  return {};
}

export function createSafeSmartAccount(publicClient: any, owner: any) {
  // Stub implementation
  return {
    address: '0x1234567890abcdef1234567890abcdef12345678' as Address,
    execute: async () => ({ hash: '0x0' })
  };
}

export function createSmartAccountClientWithPaymaster(
  smartAccount: any,
  pimlicoClient: any,
  pimlicoUrl: string
) {
  // Stub implementation 
  return {};
} 
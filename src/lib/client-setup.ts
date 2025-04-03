import { createPublicClient, http, type Account, type PublicClient, type Transport } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createSmartAccountClient } from 'permissionless';
import { privateKeyToAccount } from 'viem/accounts';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { ISigner } from '@zerodev/sdk';

// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const;

export interface ClientSetup {
  owner: Account;
  smartAccount: any;
  smartAccountClient: any;
  publicClient: PublicClient;
  pimlicoClient: any;
}

// Chain configuration
interface ChainConfig {
  chain: typeof baseSepolia;
  pimlicoChainName: string;
}

export function getActiveChain(): ChainConfig {
  return {
    chain: baseSepolia,
    pimlicoChainName: 'sepolia'
  };
}

// Create owner account from private key
export function createOwnerAccount(privateKey: string): Account {
    return privateKeyToAccount(privateKey as `0x${string}`);
}

// Create public client for Sepolia
export function createPublicClientForSepolia(): PublicClient {
    return createPublicClient({
        chain: baseSepolia,
        transport: http()
    });
}

// Create public client for active chain
export function createChainPublicClient(): PublicClient {
    const activeChain = getActiveChain();
    return createPublicClient({
        chain: activeChain.chain,
        transport: http()
    });
}

// Create Pimlico client instance
export function createPimlicoClientInstance(apiKey: string) {
    return createPimlicoClient({
        transport: http('https://api.pimlico.io/v1/sepolia/rpc'),
        apiKey
    });
}

// Create Safe smart account
export async function createSafeSmartAccount(publicClient: PublicClient, signer: Account | ISigner) {
  return toSafeSmartAccount({
    client: publicClient,
    owners: [signer],
    entryPoint: {
      address: ENTRY_POINT_ADDRESS,
      version: "0.6",
    },
    version: "1.4.1",
  });
}

// Create smart account client with paymaster
export function createSmartAccountClientWithPaymaster(
  smartAccount: any,
  pimlicoClient: any,
  pimlicoUrl: string
) {
  return createSmartAccountClient({
    account: smartAccount,
    chain: baseSepolia,
    transport: http(pimlicoUrl),
    sponsorUserOperation: async (args) => {
      return pimlicoClient.sponsorUserOperation(args);
    }
  });
}

// Validate environment variables
export function validateEnvironment() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY environment variable is not set');
  }
  
  if (!process.env.PIMLICO_API_KEY) {
    throw new Error('PIMLICO_API_KEY environment variable is not set');
  }
  
  return {
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
    pimlicoApiKey: process.env.PIMLICO_API_KEY
  };
}

// Create bundler client
export const bundlerClient = createPimlicoClient({
  transport: http('https://api.pimlico.io/v1/sepolia/rpc'),
  apiKey: process.env.PIMLICO_API_KEY || ''
});

// Create paymaster client
export const paymasterClient = createPimlicoClient({
  transport: http('https://api.pimlico.io/v2/sepolia/rpc'),
  apiKey: process.env.PIMLICO_API_KEY || ''
});
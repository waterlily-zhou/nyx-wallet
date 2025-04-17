import { createPublicClient, http, type Transport } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createSmartAccountClient } from 'permissionless';
import { privateKeyToAccount } from 'viem/accounts';
import { toSafeSmartAccount } from 'permissionless/accounts';
import type { SmartAccountClient, SmartAccountClientConfig } from 'permissionless';
import type { UserOperation } from 'permissionless/types/userOperation';
import type { Chain, PublicClient, Account, Transport as ViemTransport } from 'viem';

// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const;

// Alternative RPC providers for Sepolia with additional options
const SEPOLIA_RPC_URLS = [
  'https://sepolia.base.org',  // Primary Base Sepolia endpoint
  'https://base-sepolia-rpc.publicnode.com', // Base Sepolia public node
];

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
        transport: http(SEPOLIA_RPC_URLS[0], {
            timeout: 10000,
            retryCount: 3,
            retryDelay: 1000,
            batch: {
                batchSize: 4
            }
        })
    });
}

// Create public client for active chain
export function createChainPublicClient(): PublicClient {
    const activeChain = getActiveChain();
    return createPublicClient({
        chain: activeChain.chain,
        transport: http(SEPOLIA_RPC_URLS[0], {
            timeout: 10000,
            retryCount: 3,
            retryDelay: 1000,
            batch: {
                batchSize: 4
            }
        })
    });
}

// Create Pimlico client instance with updated parameters
export function createPimlicoClientInstance(apiKey: string) {
    return createPimlicoClient({
        transport: http('https://api.pimlico.io/v1/sepolia/rpc'),
        entryPoint: {
          address: ENTRY_POINT_ADDRESS,
          version: "0.6" as const
        }
        // Removed apiKey parameter as it's not accepted
    });
}

// Create Safe smart account
export async function createSafeSmartAccount(publicClient: PublicClient, signer: Account) {
  return toSafeSmartAccount({
    client: publicClient,
    owners: [signer],
    entryPoint: {
      address: ENTRY_POINT_ADDRESS,
      version: "0.6" as const,
    },
    version: "1.4.1",
  });
}

// Create a Smart Account Client with Paymaster
export function createSmartAccountClientWithPaymaster(
  smartAccount: Awaited<ReturnType<typeof toSafeSmartAccount>>,
  pimlicoClient: ReturnType<typeof createPimlicoClient>,
  paymasterUrl: string
): SmartAccountClient {
  try {
    return createSmartAccountClient({
      account: smartAccount,
      chain: baseSepolia,
      bundlerTransport: http(paymasterUrl),
      middleware: {
        sponsorUserOperation: async (args: { userOperation: UserOperation }) => {
          try {
            const sponsored = await pimlicoClient.sponsorUserOperation({
              userOperation: args.userOperation
            });
            return sponsored;
          } catch (err) {
            console.error('Sponsorship error:', err);
            return { paymasterAndData: '0x' };
          }
        }
      }
    });
  } catch (error) {
    console.error('Error creating Smart Account Client:', error);
    throw error;
  }
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

// Create bundler client with updated parameters
export const bundlerClient = createPimlicoClient({
  transport: http('https://api.pimlico.io/v1/sepolia/rpc'),
  entryPoint: {
    address: ENTRY_POINT_ADDRESS,
    version: "0.6" as const
  }
  // Removed apiKey parameter
});

// Create paymaster client with updated parameters
export const paymasterClient = createPimlicoClient({
  transport: http('https://api.pimlico.io/v2/sepolia/rpc'),
  entryPoint: {
    address: ENTRY_POINT_ADDRESS,
    version: "0.6" as const
  }
  // Removed apiKey parameter
});
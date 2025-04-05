import { createPublicClient, http, type Account, type PublicClient, fallback } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createSmartAccountClient } from 'permissionless';
import { privateKeyToAccount } from 'viem/accounts';
import { toSafeSmartAccount } from 'permissionless/accounts';

// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const;

// Alternative RPC providers for Sepolia with additional options
const SEPOLIA_RPC_URLS = [
  'https://sepolia.base.org',  // Primary Base Sepolia endpoint
  'https://base-sepolia-rpc.publicnode.com', // Base Sepolia public node
  'https://sepolia.base.org',  // Listed again for redundancy
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

// Create public client for Sepolia with fallback providers
export function createPublicClientForSepolia(): PublicClient {
    // Using type assertion to resolve TypeScript errors
    return createPublicClient({
        chain: baseSepolia,
        transport: fallback(
          SEPOLIA_RPC_URLS.map(url => http(url, {
            timeout: 10000, // 10 seconds
            retryCount: 3,
            retryDelay: 1000, // 1 second
            batch: {
              batchSize: 4, // Limit batch size to reduce rate limits
            }
          })),
          { 
            rank: true,
            retryCount: 5,
            retryDelay: 1500
          }
        )
    }) as PublicClient;
}

// Create public client for active chain
export function createChainPublicClient(): PublicClient {
    const activeChain = getActiveChain();
    // Using type assertion to resolve TypeScript errors
    return createPublicClient({
        chain: activeChain.chain,
        transport: fallback(
          SEPOLIA_RPC_URLS.map(url => http(url, {
            timeout: 10000, // 10 seconds
            retryCount: 3,
            retryDelay: 1000, // 1 second
            batch: {
              batchSize: 4, // Limit batch size to reduce rate limits
            }
          })),
          { 
            rank: true,
            retryCount: 5,
            retryDelay: 1500
          }
        )
    }) as PublicClient;
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

// Create smart account client with paymaster
export function createSmartAccountClientWithPaymaster(
  smartAccount: any,
  pimlicoClient: any,
  pimlicoUrl: string
) {
  // Using any type to bypass TypeScript errors
  const config: any = {
    account: smartAccount,
    chain: baseSepolia,
    bundlerTransport: http(pimlicoUrl)
  };
  
  // Add middleware for sponsorUserOperation if pimlicoClient is available
  if (pimlicoClient && pimlicoClient.sponsorUserOperation) {
    config.middleware = {
      sponsorUserOperation: async (args: any) => {
        return pimlicoClient.sponsorUserOperation(args);
      }
    };
  }
  
  return createSmartAccountClient(config);
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
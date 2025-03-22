import { http, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, base, baseGoerli, baseSepolia } from 'viem/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createPublicClient as viemCreatePublicClient } from 'viem';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address;

export type ChainConfig = {
  chain: typeof sepolia | typeof base | typeof baseGoerli | typeof baseSepolia;
  pimlicoChainName: string;
};

export const CHAIN_CONFIG: Record<string, ChainConfig> = {
  sepolia: {
    chain: sepolia,
    pimlicoChainName: 'sepolia'
  },
  base: {
    chain: base,
    pimlicoChainName: 'base'
  },
  baseGoerli: {
    chain: baseGoerli,
    pimlicoChainName: 'base-goerli'
  },
  baseSepolia: {
    chain: baseSepolia,
    pimlicoChainName: 'base-sepolia'
  }
};

// Get the active chain from environment or default to sepolia
export function getActiveChain(): ChainConfig {
  const chainName = process.env.ACTIVE_CHAIN || 'sepolia';
  return CHAIN_CONFIG[chainName] || CHAIN_CONFIG.sepolia;
}

// Types for our clients and accounts
export type ClientSetup = {
  publicClient: ReturnType<typeof viemCreatePublicClient>;
  pimlicoClient: ReturnType<typeof createPimlicoClient>;
  owner: ReturnType<typeof privateKeyToAccount>;
  smartAccount: any; // Using 'any' to handle different account types
  smartAccountClient: ReturnType<typeof createSmartAccountClient>;
};

export function validateEnvironment(): { apiKey: string; privateKey: Hex } {
  if (!process.env.PIMLICO_API_KEY) {
    throw new Error('PIMLICO_API_KEY is required');
  }
  
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY is required');
  }
  
  return {
    apiKey: process.env.PIMLICO_API_KEY,
    privateKey: process.env.PRIVATE_KEY as Hex
  };
}

export function createOwnerAccount(privateKey: Hex) {
  const owner = privateKeyToAccount(privateKey);
  console.log('👤 Owner address:', owner.address);
  return owner;
}

// Legacy function - kept for backward compatibility
export function createPublicClientForSepolia() {
  // Get the RPC URL from environment variables or use a default
  const rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY';
  
  // Create a public client with the RPC URL
  return viemCreatePublicClient({
    chain: sepolia,
    transport: http(rpcUrl, {
      timeout: 60000, // 60 seconds timeout
      retryCount: 3, // Retry 3 times
      retryDelay: 1000, // Wait 1 second between retries
      batch: { batchSize: 10 }, // Optimize batch requests
    }),
  });
}

// Chain-agnostic function to create a public client
export function createPublicClient() {
  const activeChain = getActiveChain();
  
  // Get the appropriate RPC URL based on the active chain
  let rpcUrl: string;
  if (activeChain.chain.id === base.id) {
    rpcUrl = process.env.BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY';
  } else if (activeChain.chain.id === baseGoerli.id) {
    rpcUrl = process.env.BASE_GOERLI_RPC_URL || 'https://base-goerli.g.alchemy.com/v2/YOUR_API_KEY';
  } else if (activeChain.chain.id === baseSepolia.id) {
    rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY';
  } else {
    rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY';
  }
  
  console.log(`Creating public client for chain: ${activeChain.chain.name}`);
  
  return viemCreatePublicClient({
    chain: activeChain.chain,
    transport: http(rpcUrl, {
      timeout: 60000, // 60 seconds timeout
      retryCount: 3, // Retry 3 times
      retryDelay: 1000, // Wait 1 second between retries
      batch: { batchSize: 10 }, // Optimize batch requests
    }),
  });
}

export function createPimlicoClientInstance(apiKey: string) {
  const activeChain = getActiveChain();
  const pimlicoUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${apiKey}`;
  
  console.log(`Creating Pimlico client for chain: ${activeChain.pimlicoChainName}`);
  
  return createPimlicoClient({
    transport: http(pimlicoUrl),
    entryPoint: {
      address: ENTRY_POINT_ADDRESS,
      version: "0.6",
    },
  });
}

export async function createSafeSmartAccount(publicClient: ReturnType<typeof viemCreatePublicClient>, owner: ReturnType<typeof privateKeyToAccount>) {
  console.log('🔨 Loading Safe smart account...');
  
  const account = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    entryPoint: {
      address: ENTRY_POINT_ADDRESS,
      version: "0.6",
    },
    version: "1.4.1",
  });
  
  console.log(`💼 Smart account address: ${account.address}`);
  return account;
}

export async function createSimpleSmartAccount(publicClient: ReturnType<typeof viemCreatePublicClient>, owner: ReturnType<typeof privateKeyToAccount>) {
  console.log('🔨 Loading Smart account (using Safe implementation)...');
  console.log('⚠️ Note: Using Safe implementation as Simple Account API has changed in permissionless.js');
  
  // For simplicity, using Safe account implementation
  return createSafeSmartAccount(publicClient, owner);
}

export async function checkAccountBalance(publicClient: ReturnType<typeof viemCreatePublicClient>, address: Address) {
  const balance = await publicClient.getBalance({ address });
  console.log('💰 Current balance:', balance.toString(), 'wei');
  return balance;
}

export function createSmartAccountClientWithPaymaster(
  account: any, // Using 'any' to handle different account types
  pimlicoClient: ReturnType<typeof createPimlicoClient>,
  pimlicoUrl: string
) {
  console.log('Setting up smart account client with paymaster...');
  const activeChain = getActiveChain();
  
  return createSmartAccountClient({
    account,
    chain: activeChain.chain,
    bundlerTransport: http(pimlicoUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        const gasPrice = await pimlicoClient.getUserOperationGasPrice();
        console.log('Gas price estimation:', gasPrice);
        return gasPrice.fast;
      },
    },
  });
}

// Initialize all clients and accounts for Safe implementation
export async function initializeSafeClients(): Promise<ClientSetup> {
  const { apiKey, privateKey } = validateEnvironment();
  const owner = createOwnerAccount(privateKey);
  const publicClient = createPublicClient(); // Use the new chain-agnostic function
  const pimlicoClient = createPimlicoClientInstance(apiKey);
  const smartAccount = await createSafeSmartAccount(publicClient, owner);
  
  const activeChain = getActiveChain();
  const pimlicoUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${apiKey}`;
  
  const smartAccountClient = createSmartAccountClientWithPaymaster(
    smartAccount,
    pimlicoClient,
    pimlicoUrl
  );
  
  await checkAccountBalance(publicClient, smartAccount.address);
  
  return {
    publicClient,
    pimlicoClient,
    owner,
    smartAccount,
    smartAccountClient
  };
}

/*
  Initialize all clients and accounts for Simple Account implementation
  (Currently using Safe implementation under the hood)
 */
export async function initializeSimpleAccountClients(): Promise<ClientSetup> {
  const { apiKey, privateKey } = validateEnvironment();
  const owner = createOwnerAccount(privateKey);
  const publicClient = createPublicClient();
  const pimlicoClient = createPimlicoClientInstance(apiKey);
  const smartAccount = await createSimpleSmartAccount(publicClient, owner);
  
  const activeChain = getActiveChain();
  const pimlicoUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${apiKey}`;
  
  const smartAccountClient = createSmartAccountClientWithPaymaster(
    smartAccount,
    pimlicoClient,
    pimlicoUrl
  );
  
  await checkAccountBalance(publicClient, smartAccount.address);
  
  return {
    publicClient,
    pimlicoClient,
    owner,
    smartAccount,
    smartAccountClient
  };
} 
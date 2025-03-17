import { createPublicClient, http, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

// Types for our clients and accounts
export type ClientSetup = {
  publicClient: ReturnType<typeof createPublicClient>;
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

export function createPublicClientForSepolia() {
  return createPublicClient({
    chain: sepolia,
    transport: http("https://rpc.ankr.com/eth_sepolia"),
  });
}

export function createPimlicoClientInstance(apiKey: string) {
  const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
  
  return createPimlicoClient({
    transport: http(pimlicoUrl),
    entryPoint: {
      address: ENTRY_POINT_ADDRESS,
      version: "0.6",
    },
  });
}

export async function createSafeSmartAccount(publicClient: ReturnType<typeof createPublicClient>, owner: ReturnType<typeof privateKeyToAccount>) {
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

export async function createSimpleSmartAccount(publicClient: ReturnType<typeof createPublicClient>, owner: ReturnType<typeof privateKeyToAccount>) {
  console.log('🔨 Loading Smart account (using Safe implementation)...');
  console.log('⚠️ Note: Using Safe implementation as Simple Account API has changed in permissionless.js');
  
  // For simplicity, using Safe account implementation
  return createSafeSmartAccount(publicClient, owner);
}

export async function checkAccountBalance(publicClient: ReturnType<typeof createPublicClient>, address: Address) {
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
  
  return createSmartAccountClient({
    account,
    chain: sepolia,
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
  const publicClient = createPublicClientForSepolia();
  const pimlicoClient = createPimlicoClientInstance(apiKey);
  const smartAccount = await createSafeSmartAccount(publicClient, owner);
  
  const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
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
  const publicClient = createPublicClientForSepolia();
  const pimlicoClient = createPimlicoClientInstance(apiKey);
  const smartAccount = await createSimpleSmartAccount(publicClient, owner);
  
  const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
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
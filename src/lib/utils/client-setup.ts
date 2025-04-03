import { type Address, type Hex, createPublicClient as viemCreatePublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

// Types
export interface ClientSetup {
  publicClient: ReturnType<typeof viemCreatePublicClient>;
  pimlicoClient: any;
  owner: ReturnType<typeof privateKeyToAccount>;
  smartAccount: any;
  smartAccountClient: any;
}

// Get the active chain configuration
export function getActiveChain() {
  return {
    chain: sepolia,
    pimlicoChainName: 'sepolia',
    bundlerUrl: `https://api.pimlico.io/v2/sepolia/rpc?apikey=${process.env.PIMLICO_API_KEY || ''}`
  };
}

// Create a public client connected to the Sepolia testnet
export function createPublicClient() {
  return viemCreatePublicClient({
    chain: sepolia,
    transport: http()
  });
}

// Create a Pimlico client for ERC-4337 transactions
export function createPimlicoClientInstance(apiKey: string) {
  if (!apiKey) {
    console.warn('No Pimlico API key provided, cannot create client');
    throw new Error('Pimlico API key is required');
  }

  try {
    const activeChain = getActiveChain();
    const bundlerUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${apiKey}`;
    
    // We're using dynamic imports to avoid typing issues
    const permissionless = require('permissionless');
    const { createPimlicoClient } = require('permissionless/clients/pimlico');
    
    // Create pimlico client
    const pimlicoClient = createPimlicoClient({
      transport: http(bundlerUrl),
      entryPoint: ENTRY_POINT_ADDRESS,
    });
    
    return pimlicoClient;
  } catch (error) {
    console.error('Error creating Pimlico client:', error);
    throw error; // Propagate the error instead of returning mock client
  }
}

// Create a Safe Smart Account using the owner account
export async function createSafeSmartAccount(publicClient: ReturnType<typeof viemCreatePublicClient>, owner: ReturnType<typeof privateKeyToAccount>) {
  try {
    console.log('Creating Safe Smart Account for address:', owner.address);
    
    // Use dynamic imports with proper error handling for different module formats
    const permissionless = require('permissionless');
    
    // Check if accounts exists and how it's structured
    let safeAccountFn;
    if (permissionless.accounts && permissionless.accounts.toSafeSmartAccount) {
      safeAccountFn = permissionless.accounts.toSafeSmartAccount;
    } else if (permissionless.toSafeSmartAccount) {
      safeAccountFn = permissionless.toSafeSmartAccount;
    } else {
      throw new Error('toSafeSmartAccount function not found in permissionless library');
    }
    
    // Create a real counterfactual Smart Contract Account using Safe
    const smartAccount = await safeAccountFn({
      client: publicClient,
      owners: [owner],
      entryPoint: {
        address: ENTRY_POINT_ADDRESS,
        version: "0.6",
      },
      version: "1.4.1",
    });
    
    console.log('Smart Account created with address:', smartAccount.address);
    
    return smartAccount;
  } catch (error) {
    console.error('Error creating Safe Smart Account:', error);
    
    // Instead of creating a mock account, throw the error
    // to properly handle the failure upstream
    throw new Error(`Failed to create Smart Contract Account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Create a Smart Account Client with Paymaster for gasless transactions
export function createSmartAccountClientWithPaymaster(
  smartAccount: any,
  pimlicoClient: any,
  paymasterUrl: string
) {
  try {
    // We're using dynamic imports to avoid typing issues
    const { createSmartAccountClient } = require('permissionless');
    
    // Create smart account client
    const smartAccountClient = createSmartAccountClient({
      account: smartAccount,
      chain: sepolia,
      bundlerTransport: http(paymasterUrl),
      middleware: {
        sponsorUserOperation: async (args: any) => {
          try {
            if (!pimlicoClient.sponsorUserOperation) {
              throw new Error('Pimlico client not properly initialized');
            }
            
            const response = await pimlicoClient.sponsorUserOperation({
              userOperation: args.userOperation,
              entryPoint: ENTRY_POINT_ADDRESS
            });
            return response;
          } catch (err) {
            console.error('Sponsorship error:', err);
            throw err; // Propagate the error instead of returning mock data
          }
        }
      }
    });
    
    return smartAccountClient;
  } catch (error) {
    console.error('Error creating Smart Account Client:', error);
    throw error; // Propagate the error instead of returning mock client
  }
} 
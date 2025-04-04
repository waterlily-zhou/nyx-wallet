import { type Address, type Hex, createPublicClient as viemCreatePublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
// Import constants and shared types from shared-types.ts
import { ENTRY_POINT_ADDRESS, ClientSetup } from './shared-types';

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
    let permissionless;
    try {
      permissionless = require('permissionless');
    } catch (e) {
      console.error('Failed to load permissionless module:', e);
      throw new Error('Failed to load permissionless module');
    }
    
    let createPimlicoClient;
    try {
      createPimlicoClient = permissionless.clients?.pimlico?.createPimlicoClient;
      
      if (!createPimlicoClient) {
        createPimlicoClient = require('permissionless/clients/pimlico').createPimlicoClient;
      }
    } catch (e) {
      console.error('Failed to load createPimlicoClient:', e);
      throw new Error('Failed to load createPimlicoClient function');
    }
    
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
    let permissionless;
    try {
      permissionless = require('permissionless');
    } catch (e) {
      console.error('Failed to load permissionless module:', e);
      throw new Error('Failed to load permissionless module');
    }
    
    // Check if accounts exists and how it's structured
    let safeAccountFn;
    
    // Try different module paths to find toSafeSmartAccount
    try {
      if (permissionless.accounts && permissionless.accounts.toSafeSmartAccount) {
        safeAccountFn = permissionless.accounts.toSafeSmartAccount;
      } else if (permissionless.toSafeSmartAccount) {
        safeAccountFn = permissionless.toSafeSmartAccount;
      } else if (permissionless.accounts && permissionless.accounts.safeAccount) {
        safeAccountFn = permissionless.accounts.safeAccount;
      } else {
        // Try to import it directly
        try {
          const accountsModule = require('permissionless/accounts');
          if (accountsModule.toSafeSmartAccount) {
            safeAccountFn = accountsModule.toSafeSmartAccount;
          } else if (accountsModule.safeAccount) {
            safeAccountFn = accountsModule.safeAccount;
          }
        } catch (importError) {
          console.error('Error importing permissionless/accounts:', importError);
        }
      }
    } catch (e) {
      console.error('Error finding toSafeSmartAccount function:', e);
    }
    
    if (!safeAccountFn) {
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
    // We're using dynamic imports with better error handling
    let permissionless;
    try {
      permissionless = require('permissionless');
    } catch (e) {
      console.error('Failed to load permissionless module:', e);
      throw new Error('Failed to load permissionless module');
    }
    
    let createSmartAccountClient;
    try {
      createSmartAccountClient = permissionless.createSmartAccountClient;
      
      if (!createSmartAccountClient) {
        // Try to import it directly
        try {
          createSmartAccountClient = require('permissionless/accounts').createSmartAccountClient;
        } catch (importError) {
          console.error('Error importing createSmartAccountClient:', importError);
          throw new Error('Failed to find createSmartAccountClient function');
        }
      }
    } catch (e) {
      console.error('Error finding createSmartAccountClient function:', e);
      throw new Error('Failed to find createSmartAccountClient function');
    }
    
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
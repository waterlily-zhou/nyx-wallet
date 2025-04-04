import { type Address, type Hex, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ClientSetup } from './shared-types';

// Constants
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

/**
 * Creates a Smart Contract Account using permissionless.js
 * This implementation uses the exact function names and parameters from the test script.
 */
export async function createWorkingSCA(privateKey: Hex): Promise<{
  address: Address;
  privateKey: Hex;
  clientSetup: ClientSetup;
}> {
  try {
    console.log('Creating SCA using permissionless.js...');
    
    // Step 1: Create owner account
    const owner = privateKeyToAccount(privateKey);
    console.log(`Using owner account: ${owner.address}`);
    
    // Step 2: Create public client
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http()
    });
    
    // Step 3: Find the right function to create a Safe account
    // Import permissionless module
    const permissionless = require('permissionless');
    
    // Determine which function to use
    let createAccountFn;
    
    if (permissionless.signerToSafeSmartAccount) {
      console.log('Using signerToSafeSmartAccount from top level');
      createAccountFn = permissionless.signerToSafeSmartAccount;
    } else {
      try {
        const accounts = require('permissionless/accounts');
        if (accounts.signerToSafeSmartAccount) {
          console.log('Using signerToSafeSmartAccount from accounts submodule');
          createAccountFn = accounts.signerToSafeSmartAccount;
        } else if (accounts.toSafeSmartAccount) {
          console.log('Using toSafeSmartAccount from accounts submodule');
          createAccountFn = accounts.toSafeSmartAccount;
        } else {
          throw new Error('No Safe account creation function found in permissionless');
        }
      } catch (error) {
        console.error('Error importing permissionless/accounts:', error);
        throw new Error('Failed to import permissionless/accounts');
      }
    }
    
    // Step 4: Create the account with the simplified config
    const accountConfig = {
      entryPoint: ENTRY_POINT,
      client: publicClient,
      // Use the full owner object, not just the address
      owners: [owner],
      // Specify versions explicitly
      safeVersion: "1.4.1",
      // Specify chain ID explicitly
      chainId: sepolia.id,
      // Add salt nonce
      saltNonce: 0n
    };
    
    console.log('Creating Smart Account with config:', JSON.stringify({
      client: 'PublicClient [object]',
      entryPoint: ENTRY_POINT,
      owners: [`Owner (${owner.address})`],
      safeVersion: "1.4.1",
      chainId: sepolia.id,
      saltNonce: "0"
    }));
    
    const smartAccount = await createAccountFn(accountConfig);
    console.log(`Created Smart Account with address: ${smartAccount.address}`);
    
    // Step 5: Setup Pimlico for gas sponsoring (bundler)
    let pimlicoClient;
    let smartAccountClient;
    
    try {
      // Find the right Pimlico client creator
      let createPimlicoClientFn;
      
      if (permissionless.clients?.pimlico?.createPimlicoClient) {
        createPimlicoClientFn = permissionless.clients.pimlico.createPimlicoClient;
      } else {
        try {
          const pimlicoModule = require('permissionless/clients/pimlico');
          if (pimlicoModule.createPimlicoClient) {
            createPimlicoClientFn = pimlicoModule.createPimlicoClient;
          }
        } catch (error) {
          console.warn('Could not import permissionless/clients/pimlico:', error);
        }
      }
      
      if (createPimlicoClientFn) {
        // Create Pimlico client
        const pimlicoApiKey = process.env.PIMLICO_API_KEY || '';
        if (pimlicoApiKey) {
          const bundlerUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${pimlicoApiKey}`;
          
          pimlicoClient = createPimlicoClientFn({
            transport: http(bundlerUrl),
            entryPoint: ENTRY_POINT,
          });
          
          console.log('Created Pimlico client for gas sponsoring');
          
          // Find the smart account client creator
          let createSmartAccountClientFn;
          
          if (permissionless.createSmartAccountClient) {
            createSmartAccountClientFn = permissionless.createSmartAccountClient;
          }
          
          if (createSmartAccountClientFn) {
            // Create smart account client with sponsoring
            smartAccountClient = createSmartAccountClientFn({
              account: smartAccount,
              transport: http(bundlerUrl),
              chain: sepolia,
              sponsorUserOperation: async (args: any) => {
                try {
                  return await pimlicoClient.sponsorUserOperation({
                    userOperation: args.userOperation,
                    entryPoint: ENTRY_POINT
                  });
                } catch (err) {
                  console.error('Error sponsoring user operation:', err);
                  throw err;
                }
              }
            });
            
            console.log('Created Smart Account Client with sponsoring');
          }
        }
      }
    } catch (error) {
      console.warn('Could not set up Pimlico client:', error);
      // Continue without pimlico - not critical
    }
    
    // Step 6: Create the client setup
    const clientSetup: ClientSetup = {
      publicClient,
      pimlicoClient,
      owner,
      smartAccount,
      smartAccountClient
    };
    
    return {
      address: smartAccount.address,
      privateKey,
      clientSetup
    };
  } catch (error) {
    console.error('Error creating SCA with permissionless:', error);
    throw new Error(`Failed to create SCA: ${error instanceof Error ? error.message : String(error)}`);
  }
} 
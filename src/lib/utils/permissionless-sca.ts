import { type Address, type Hex, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ClientSetup, ENTRY_POINT_ADDRESS } from './shared-types';

// Constants
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

/**
 * Creates a Smart Contract Account using permissionless.js
 * This implementation properly handles dynamic imports and module structure.
 * 
 * @param ownerKey The private key of the EOA owner
 * @returns The Smart Contract Account details
 */
export async function createPermissionlessSCA(ownerKey: Hex): Promise<{
  address: Address;
  privateKey: Hex;
  clientSetup: ClientSetup;
}> {
  // Create the owner account from the private key
  const owner = privateKeyToAccount(ownerKey);
  console.log(`Creating permissionless SCA for owner: ${owner.address}`);
  
  // Create public client
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http()
  });
  
  let smartAccount;
  let pimlicoClient;
  let smartAccountClient;
  
  try {
    // First try dynamic import approach using require
    // This is more reliable for Next.js compatibility
    console.log('Trying dynamic imports with require...');
    
    // Import permissionless (will throw if not available)
    const permissionless = require('permissionless');
    console.log('Permissionless imported successfully');
    
    // Find the Safe account creator function - checking all possible locations
    let safeAccountCreator;
    
    if (permissionless.accounts?.signerToSafeSmartAccount) {
      console.log('Using signerToSafeSmartAccount from permissionless.accounts');
      safeAccountCreator = permissionless.accounts.signerToSafeSmartAccount;
    } else if (permissionless.accounts?.toSafeSmartAccount) {
      console.log('Using toSafeSmartAccount from permissionless.accounts');
      safeAccountCreator = permissionless.accounts.toSafeSmartAccount;
    } else if (permissionless.signerToSafeSmartAccount) {
      console.log('Using signerToSafeSmartAccount from permissionless top level');
      safeAccountCreator = permissionless.signerToSafeSmartAccount;
    } else if (permissionless.toSafeSmartAccount) {
      console.log('Using toSafeSmartAccount from permissionless top level');
      safeAccountCreator = permissionless.toSafeSmartAccount;
    } else {
      // Try to import accounts module directly
      try {
        const accounts = require('permissionless/accounts');
        if (accounts.signerToSafeSmartAccount) {
          console.log('Using signerToSafeSmartAccount from permissionless/accounts direct import');
          safeAccountCreator = accounts.signerToSafeSmartAccount;
        } else if (accounts.toSafeSmartAccount) {
          console.log('Using toSafeSmartAccount from permissionless/accounts direct import');
          safeAccountCreator = accounts.toSafeSmartAccount;
        }
      } catch (error) {
        console.error('Failed to import permissionless/accounts:', error);
      }
    }
    
    if (!safeAccountCreator) {
      throw new Error('Could not find any Safe account creation function in permissionless.js');
    }
    
    // Create the smart account
    console.log(`Creating Smart Account for owner ${owner.address}...`);

    // Validate config before calling safeAccountCreator
    const safeAccountConfig = {
      client: publicClient,
      // Different versions of the function accept different parameter names
      owners: [owner],
      owner: owner,
      signer: owner,
      entryPoint: {
        address: ENTRY_POINT,
        version: "0.6",
      },
      safeVersion: "1.4.1",
      version: "1.4.1",
    };

    // Validate each property to ensure nothing is undefined
    const validationErrors = [];
    if (!safeAccountConfig.client) validationErrors.push('client is undefined');
    if (!safeAccountConfig.owners || !safeAccountConfig.owners[0]) validationErrors.push('owners is undefined or empty');
    if (!safeAccountConfig.entryPoint) validationErrors.push('entryPoint is undefined');
    if (!safeAccountConfig.entryPoint?.address) validationErrors.push('entryPoint.address is undefined');

    // Log the entire config object for debugging
    console.log('Safe Account Config:', JSON.stringify({
      client: safeAccountConfig.client ? 'PublicClient [OK]' : 'undefined',
      owners: safeAccountConfig.owners ? 
        (safeAccountConfig.owners[0] ? 
          `[${safeAccountConfig.owners[0].address}]` : 
          'Empty array') : 
        'undefined',
      owner: safeAccountConfig.owner ? safeAccountConfig.owner.address : 'undefined',
      signer: safeAccountConfig.signer ? safeAccountConfig.signer.address : 'undefined',
      entryPoint: safeAccountConfig.entryPoint ? 
        `${safeAccountConfig.entryPoint.address} (v${safeAccountConfig.entryPoint.version})` : 
        'undefined',
      safeVersion: safeAccountConfig.safeVersion,
      version: safeAccountConfig.version
    }, null, 2));

    if (validationErrors.length > 0) {
      console.error('Validation errors in Safe Account config:', validationErrors);
      throw new Error(`Invalid Safe Account config: ${validationErrors.join(', ')}`);
    }

    console.log(`Calling ${safeAccountCreator.name || 'safeAccountCreator'} with validated config...`);

    // Create the smart account
    smartAccount = await safeAccountCreator(safeAccountConfig);
    
    console.log(`Created Smart Account with address: ${smartAccount.address}`);
    
    // Create Pimlico client
    let createPimlicoClient;
    
    if (permissionless.clients?.pimlico?.createPimlicoClient) {
      console.log('Using createPimlicoClient from permissionless.clients.pimlico');
      createPimlicoClient = permissionless.clients.pimlico.createPimlicoClient;
    } else {
      try {
        // Try direct import
        const pimlicoModule = require('permissionless/clients/pimlico');
        if (pimlicoModule.createPimlicoClient) {
          console.log('Using createPimlicoClient from permissionless/clients/pimlico direct import');
          createPimlicoClient = pimlicoModule.createPimlicoClient;
        }
      } catch (error) {
        console.error('Failed to import permissionless/clients/pimlico:', error);
      }
    }
    
    if (!createPimlicoClient) {
      console.warn('Could not find createPimlicoClient function, skipping paymaster integration');
    } else {
      // Create Pimlico client for gasless transactions
      const pimlicoApiKey = process.env.PIMLICO_API_KEY || '';
      if (pimlicoApiKey) {
        const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${pimlicoApiKey}`;
        
        pimlicoClient = createPimlicoClient({
          transport: http(pimlicoUrl),
          entryPoint: ENTRY_POINT,
        });
        
        console.log('Created Pimlico client');
      } else {
        console.warn('No Pimlico API key provided, skipping paymaster client creation');
      }
    }
    
    // Create smart account client
    let createSmartAccountClient;
    
    if (permissionless.createSmartAccountClient) {
      console.log('Using createSmartAccountClient from permissionless top level');
      createSmartAccountClient = permissionless.createSmartAccountClient;
    } else {
      console.warn('Could not find createSmartAccountClient function, skipping client creation');
    }
    
    if (createSmartAccountClient && pimlicoClient) {
      // Create the smart account client with paymaster
      const pimlicoApiKey = process.env.PIMLICO_API_KEY || '';
      const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${pimlicoApiKey}`;
      
      smartAccountClient = createSmartAccountClient({
        account: smartAccount,
        chain: sepolia,
        transport: http(pimlicoUrl),
        bundlerTransport: http(pimlicoUrl),
        middleware: {
          sponsorUserOperation: pimlicoClient 
            ? async (args: any) => {
                try {
                  return await pimlicoClient.sponsorUserOperation({
                    userOperation: args.userOperation,
                    entryPoint: ENTRY_POINT
                  });
                } catch (err) {
                  console.error('Sponsorship error:', err);
                  throw err;
                }
              }
            : undefined
        }
      });
      
      console.log('Created Smart Account Client with paymaster integration');
    } else {
      console.warn('Skipping smart account client creation due to missing dependencies');
    }
    
    // Create the client setup
    const clientSetup: ClientSetup = {
      publicClient,
      pimlicoClient,
      owner,
      smartAccount,
      smartAccountClient
    };
    
    // Return the smart contract account info
    return {
      address: smartAccount.address,
      privateKey: ownerKey,
      clientSetup
    };
  } catch (error) {
    console.error('Error creating SCA with permissionless.js:', error);
    throw new Error(`Failed to create Smart Contract Account: ${error instanceof Error ? error.message : String(error)}`);
  }
} 
import { type Address, type Hex, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ClientSetup, ENTRY_POINT_ADDRESS } from './shared-types';

// Constants
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

/**
 * Creates a Smart Contract Account using permissionless.js v0.2.36
 * 
 * @param ownerKey The private key of the EOA owner
 * @returns The Smart Contract Account details
 */
export async function createPermissionlessSCAv2(ownerKey: Hex): Promise<{
  address: Address;
  privateKey: Hex;
  clientSetup: ClientSetup;
}> {
  console.log('Creating permissionless SCA (v2) for owner');
  
  // Create the owner account from the private key
  const owner = privateKeyToAccount(ownerKey);
  console.log(`Owner EOA address: ${owner.address}`);
  
  // Create public client for Sepolia
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http()
  });
  
  try {
    // Dynamically import permissionless to handle module resolution correctly
    const permissionless = require('permissionless');
    console.log('Permissionless version:', permissionless.version || 'unknown');
    
    // Find the correct function to create a Safe account
    let safeAccountCreator;
    
    // Check if accounts module exists and contains toSafeSmartAccount
    try {
      const accounts = require('permissionless/accounts');
      console.log('Available account functions:');
      Object.keys(accounts).forEach(key => {
        if (key.includes('Safe')) {
          console.log(`- ${key}`);
        }
      });
      
      if (accounts.toSafeSmartAccount) {
        console.log('Using accounts.toSafeSmartAccount');
        safeAccountCreator = accounts.toSafeSmartAccount;
      } else {
        throw new Error('toSafeSmartAccount not found in permissionless/accounts');
      }
    } catch (error) {
      console.error('Error importing permissionless/accounts:', error);
      throw new Error('Failed to import permissionless/accounts module');
    }
    
    if (!safeAccountCreator) {
      throw new Error('Could not find any Safe account creation function');
    }
    
    // Create the account with the correct parameters
    console.log('Creating Safe Smart Account with parameters...');
    
    // Parameters confirmed from permissionless v0.2.36 type definition
    const safeAccountParams = {
      client: publicClient,
      owners: [owner], // Array of owner accounts
      version: "1.4.1" as const, // Safe version
      entryPoint: {
        address: ENTRY_POINT,
        version: "0.6" as const,
      },
      saltNonce: 0n, // Use a fixed salt for deterministic addresses
      chainId: sepolia.id, // Explicitly provide chainId
    };
    
    // Log the parameters for debugging
    console.log('Safe Account Parameters:', JSON.stringify({
      client: 'PublicClient [OK]',
      owners: [`Owner (${owner.address})`],
      version: safeAccountParams.version,
      entryPoint: {
        address: safeAccountParams.entryPoint.address,
        version: safeAccountParams.entryPoint.version,
      },
      saltNonce: '0n',
      chainId: sepolia.id
    }, null, 2));
    
    // Create the smart account
    const smartAccount = await safeAccountCreator(safeAccountParams);
    console.log(`Created Smart Account with address: ${smartAccount.address}`);
    
    // Attempt to create a Pimlico client for gas sponsoring
    let pimlicoClient = null;
    let smartAccountClient = null;
    
    try {
      const { createPimlicoPaymasterClient } = permissionless;
      if (createPimlicoPaymasterClient) {
        const pimlicoApiKey = process.env.PIMLICO_API_KEY || '';
        if (pimlicoApiKey) {
          pimlicoClient = createPimlicoPaymasterClient({
            apiKey: pimlicoApiKey,
            chain: sepolia,
            transport: http(),
          });
          console.log('Created Pimlico paymaster client');
        }
      }
    } catch (error) {
      console.warn('Failed to create Pimlico client:', error);
    }
    
    // Create smart account client if possible
    try {
      if (permissionless.createSmartAccountClient) {
        const pimlicoApiKey = process.env.PIMLICO_API_KEY || '';
        const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${pimlicoApiKey}`;
        
        smartAccountClient = permissionless.createSmartAccountClient({
          account: smartAccount,
          chain: sepolia,
          transport: http(pimlicoUrl),
          bundlerTransport: http(pimlicoUrl),
          middleware: {
            sponsorUserOperation: pimlicoClient ? 
              async (args: any) => {
                try {
                  return await pimlicoClient.sponsorUserOperation({
                    userOperation: args.userOperation,
                    entryPoint: ENTRY_POINT
                  });
                } catch (err) {
                  console.error('Sponsorship error:', err);
                  return { paymasterAndData: '0x' };
                }
              } : 
              undefined
          }
        });
        console.log('Created Smart Account Client');
      }
    } catch (error) {
      console.warn('Failed to create Smart Account Client:', error);
    }
    
    // Create client setup object
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
    console.error('Error creating SCA with permissionless.js v2:', error);
    throw new Error(`Failed to create Smart Contract Account: ${error instanceof Error ? error.message : String(error)}`);
  }
} 
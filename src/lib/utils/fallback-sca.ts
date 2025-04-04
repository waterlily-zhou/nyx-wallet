import { type Address, type Hex, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ClientSetup, ENTRY_POINT_ADDRESS } from './shared-types';
import { createSafeSmartAccountDirect } from './safe-direct';

/**
 * Creates a Smart Contract Account using Safe contracts directly when permissionless.js fails
 * 
 * @param userId The ID of the user
 * @param ownerKey The private key of the owner
 * @param updateUserFn Function to update the user's wallet address
 * @returns The smart account information
 */
export async function createFallbackSmartAccount(
  userId: string,
  ownerKey: Hex,
  updateUserFn: (userId: string, walletAddress: Address) => void
): Promise<{
  address: Address;
  privateKey: Hex;
  clientSetup: ClientSetup;
}> {
  console.log('Creating fallback Smart Contract Account using direct Safe implementation');
  
  // Create the owner account from the private key
  const owner = privateKeyToAccount(ownerKey);
  console.log(`Owner EOA address: ${owner.address}`);
  
  // Create public client
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http()
  });
  
  try {
    // Create a real Smart Contract Account using Safe contracts directly
    const smartAccount = await createSafeSmartAccountDirect(owner);
    console.log(`Created Smart Account directly with address: ${smartAccount.address}`);
    
    // Set up a simplified client setup that matches the expected interface
    const clientSetup: ClientSetup = {
      publicClient,
      pimlicoClient: null,
      owner,
      smartAccount,
      smartAccountClient: null
    };
    
    // Update the user's wallet address
    updateUserFn(userId, smartAccount.address);
    console.log('User updated with wallet address');
    
    // Return the smart contract account info
    return {
      address: smartAccount.address,
      privateKey: ownerKey,
      clientSetup
    };
  } catch (error) {
    console.error('Failed to create fallback Smart Contract Account:', error);
    throw new Error(`Failed to create Smart Contract Account: ${error instanceof Error ? error.message : String(error)}`);
  }
} 
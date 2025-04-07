import { type Address } from 'viem';
import { 
  findUserById, 
  getWalletsForUser, 
  getDefaultWallet,
  createSmartAccountFromCredential,
  updateUserWalletAddress
} from '@/lib/utils/user-store';
import { type Wallet } from '@/lib/types/credentials';
import { type ClientSetup } from '@/lib/client-setup';
import { type Hex } from 'viem';

/**
 * Create an additional wallet for a user
 * 
 * @param userId The user's ID
 * @param deviceKey The device key for DKG
 * @param name Optional name for the wallet
 * @param chainId Optional chain ID (default: Sepolia)
 * @returns The newly created wallet
 */
export async function createAdditionalWallet(
  userId: string,
  deviceKey: Hex,
  name?: string,
  chainId: number = 11155111 // Sepolia
): Promise<Wallet> {
  try {
    // Find the user
    const user = await findUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    
    // Get existing wallets
    const existingWallets = await getWalletsForUser(userId);
    
    // Generate a salt based on the number of existing wallets
    const salt = `wallet-${existingWallets.length + 1}-${Date.now()}`;
    
    // Create a new smart account with the salt
    console.log(`Creating additional wallet for user ${userId} with salt: ${salt}`);
    const result = await createSmartAccountFromCredential(
      userId,
      deviceKey,
      'biometric',
      true,
      BigInt(salt)
    );
    
    // Add the wallet to the user's wallets
    const walletName = name || `Wallet ${existingWallets.length + 1}`;
    await updateUserWalletAddress(userId, result.address, BigInt(salt));
    
    console.log(`Created new wallet ${result.address} for user ${userId}`);
    return {
      address: result.address,
      name: walletName,
      chainId,
      isDefault: false,
      createdAt: Date.now()
    };
  } catch (error) {
    console.error(`Error creating additional wallet for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get all wallets for a user
 * 
 * @param userId The user's ID
 * @returns Array of wallets
 */
export async function getUserWallets(userId: string): Promise<Wallet[]> {
  return getWalletsForUser(userId);
}

/**
 * Get the default wallet for a user
 * 
 * @param userId The user's ID
 * @returns The default wallet or undefined if none exists
 */
export async function getUserDefaultWallet(userId: string): Promise<Wallet | undefined> {
  return getDefaultWallet(userId);
}

/**
 * Set a wallet as the default for a user
 * 
 * @param userId The user's ID
 * @param walletAddress The wallet address to set as default
 */
export async function setUserDefaultWallet(userId: string, walletAddress: Address): Promise<void> {
  await updateUserWalletAddress(userId, walletAddress);
}

/**
 * Load a specific wallet for a user
 * 
 * @param userId The user's ID
 * @param deviceKey The device key for DKG
 * @param walletAddress The wallet address to load
 * @returns The wallet details including client setup
 */
export async function loadUserWallet(
  userId: string,
  deviceKey: Hex,
  walletAddress: Address
): Promise<{
  wallet: Wallet;
  clientSetup: ClientSetup;
}> {
  // Find the user
  const user = await findUserById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  
  // Find the wallet
  const wallets = await getWalletsForUser(userId);
  const wallet = wallets.find(w => w.address.toLowerCase() === walletAddress.toLowerCase());
  
  if (!wallet) {
    throw new Error(`Wallet ${walletAddress} not found for user ${userId}`);
  }
  
  // We need to find which wallet this is (by index) to recreate the salt
  const walletIndex = wallets.findIndex(w => w.address.toLowerCase() === walletAddress.toLowerCase());
  const salt = `wallet-${walletIndex + 1}-${wallet.createdAt}`;
  
  // Load the wallet with the correct salt
  const result = await createSmartAccountFromCredential(
    userId,
    deviceKey,
    'biometric',
    false,
    BigInt(salt)
  );
  
  if (result.address.toLowerCase() !== walletAddress.toLowerCase()) {
    console.warn(`Warning: Recreated wallet address (${result.address}) doesn't match expected address (${walletAddress})`);
  }
  
  if ('exists' in result && result.exists) {
    // We need to create the smart account again since we only got the address
    const newResult = await createSmartAccountFromCredential(
      userId,
      deviceKey,
      'biometric',
      true,
      BigInt(salt)
    );
    
    if (!('smartAccount' in newResult)) {
      throw new Error('Failed to create smart account');
    }
    
    return {
      wallet,
      clientSetup: {
        owner: newResult.owner,
        smartAccount: newResult.smartAccount,
        smartAccountClient: undefined, // This needs to be created separately
        publicClient: newResult.publicClient,
        pimlicoClient: undefined // This needs to be created separately
      }
    };
  }
  
  if (!('smartAccount' in result)) {
    throw new Error('Failed to create smart account');
  }
  
  return {
    wallet,
    clientSetup: {
      owner: result.owner,
      smartAccount: result.smartAccount,
      smartAccountClient: undefined, // This needs to be created separately
      publicClient: result.publicClient,
      pimlicoClient: undefined // This needs to be created separately
    }
  };
} 
import { type Address, type Hex } from 'viem';
import { 
  findUserById, 
  createSmartAccountFromCredential, 
  addWalletToUser,
  getWalletsForUser,
  getDefaultWallet,
  setDefaultWallet
} from '@/lib/utils/user-store';
import { Wallet } from '@/lib/types/credentials';
import { ClientSetup } from '@/lib/utils/shared-types';

/**
 * Create an additional wallet for a user
 * 
 * @param userId The user's ID
 * @param name Optional name for the wallet
 * @param chainId Optional chain ID (default: Sepolia)
 * @returns The newly created wallet
 */
export async function createAdditionalWallet(
  userId: string,
  name?: string,
  chainId: number = 11155111 // Sepolia
): Promise<Wallet> {
  try {
    // Check if user exists
    const user = findUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    
    // Get existing wallets
    const existingWallets = getWalletsForUser(userId);
    
    // Generate a salt based on the number of existing wallets
    const salt = `wallet-${existingWallets.length + 1}-${Date.now()}`;
    
    // Create a new smart account with the salt
    console.log(`Creating additional wallet for user ${userId} with salt: ${salt}`);
    const result = await createSmartAccountFromCredential(userId, 'biometric', salt);
    
    // Add the wallet to the user's wallets
    const walletName = name || `Wallet ${existingWallets.length + 1}`;
    const newWallet = addWalletToUser(userId, result.address, walletName, chainId);
    
    console.log(`Created new wallet ${result.address} for user ${userId}`);
    return newWallet;
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
export function getUserWallets(userId: string): Wallet[] {
  return getWalletsForUser(userId);
}

/**
 * Get the default wallet for a user
 * 
 * @param userId The user's ID
 * @returns The default wallet or undefined if none exists
 */
export function getUserDefaultWallet(userId: string): Wallet | undefined {
  return getDefaultWallet(userId);
}

/**
 * Set a wallet as the default for a user
 * 
 * @param userId The user's ID
 * @param walletAddress The wallet address to set as default
 */
export function setUserDefaultWallet(userId: string, walletAddress: Address): void {
  setDefaultWallet(userId, walletAddress);
}

/**
 * Load a specific wallet for a user
 * 
 * @param userId The user's ID
 * @param walletAddress The wallet address to load
 * @returns The wallet details including client setup
 */
export async function loadUserWallet(
  userId: string,
  walletAddress: Address
): Promise<{
  wallet: Wallet;
  clientSetup: ClientSetup;
}> {
  // Find the user
  const user = findUserById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  
  // Find the wallet
  const wallets = getWalletsForUser(userId);
  const wallet = wallets.find(w => w.address.toLowerCase() === walletAddress.toLowerCase());
  
  if (!wallet) {
    throw new Error(`Wallet ${walletAddress} not found for user ${userId}`);
  }
  
  // We need to find which wallet this is (by index) to recreate the salt
  const walletIndex = wallets.findIndex(w => w.address.toLowerCase() === walletAddress.toLowerCase());
  const salt = `wallet-${walletIndex + 1}-${wallet.createdAt}`;
  
  // Load the wallet with the correct salt
  const result = await createSmartAccountFromCredential(userId, 'biometric', salt);
  
  if (result.address.toLowerCase() !== walletAddress.toLowerCase()) {
    console.warn(`Warning: Recreated wallet address (${result.address}) doesn't match expected address (${walletAddress})`);
  }
  
  return {
    wallet,
    clientSetup: result.clientSetup
  };
} 
import { createHash, randomBytes } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address, type Hex, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
// Import the ClientSetup type from shared-types
import { ClientSetup, ENTRY_POINT_ADDRESS } from './shared-types';
import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import { encryptData, decryptData, generateRandomPrivateKey, generateDistributedKeys, combineKeys as keyCombine, encryptServerKey, decryptServerKey } from './key-encryption';
import { Authenticator, EncryptedKey, AuthenticatorDevice, Wallet } from '../types/credentials';
import { withRetry } from './retry-utils';
import { createPublicClientForSepolia } from '../client-setup';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
// Import Supabase clients with distinct names
import { supabase as supabaseClient } from '../supabase/client';
import { supabase as supabaseServer } from '../supabase/server';
import { entropyToMnemonic } from '@scure/bip39';
// Import wordlist
import { wordlist } from '@scure/bip39/wordlists/english';
import { encryptPrivateKey, decryptPrivateKey } from './key-encryption';

// Use server-side Supabase for all database operations
const supabase = supabaseServer;

// Define WebAuthn settings locally
export const rpName = 'Nyx Wallet';
export const rpID = process.env.NODE_ENV === 'development' ? 'localhost' : process.env.RP_ID || 'localhost';
export const origin = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : process.env.ORIGIN || 'http://localhost:3000';

// Types
export interface UserAccount {
  id: string;
  username: string;
  wallets: Wallet[];        // Array of wallet addresses
  walletAddress?: Address;  // Deprecated: Keep for backward compatibility
  createdAt: number;
  serverKey?: string | EncryptedKey;
  server_key_encrypted?: string; // Encrypted private key from Supabase
  recoveryKeyHash?: string;
  authType?: 'biometric';
  authenticators?: Authenticator[];
  credentials?: any[];
  is_active?: boolean;      // Field from Supabase
}

// Types for distributed key management
export interface DistributedKeys {
  deviceKey: Hex;
  serverKey: Hex;
  recoveryKey: Hex;
}

// Function to combine keys for the DKG system
export function combineKeys(deviceKey: Hex, serverKey: Hex): Hex {
  return `0x${createHash('sha256').update(deviceKey + serverKey).digest('hex')}` as Hex;
}

//* SIGNER: DKG-> SCA
// Create a smart account from biometric credentials using true DKG
export async function createSmartAccountFromCredential(
  userId: string,
  deviceKey: Hex,
  authenticationType: 'biometric' | 'passkey' = 'biometric',
  forceCreate: boolean = false, // Add parameter to control SCA creation
  saltNonce?: bigint // Add salt nonce parameter to create different addresses
) {
  try {
    console.log(`Managing smart account for user ${userId} with ${authenticationType} authentication`);
    
    // Get the user from Supabase
    const user = await findUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!forceCreate) {
      // Get user's wallets from Supabase
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('is_default', true)
        .single();
      
      if (!walletError && walletData) {
        console.log(`User ${userId} already has a default wallet: ${walletData.address}`);
        return {
          address: walletData.address as Address,
          exists: true
        };
      }
    }

    // If we're here, we need to create a new wallet or force create was specified
    console.log(`Creating new smart account for user ${userId}`);
    
    // Get DKG keys using the provided device key
    const { serverKey, combinedKey } = await getDKGKeysForUser(userId, deviceKey);
    console.log(`Using DKG keys for wallet creation`);
    
    // Create the owner account from the combined key
    const owner = privateKeyToAccount(combinedKey);
    console.log(`Created owner account with address: ${owner.address}`);
    
    // Create the smart account
    const result = await createPermissionlessSCA(userId, owner, saltNonce);
    
    // Store the wallet in Supabase
    const { error: walletError } = await supabase
      .from('wallets')
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        address: result.address as string,
        name: 'DKG Wallet created on ' + new Date().toLocaleDateString(),
        chain_id: 11155111, // Sepolia
        is_default: true,
        created_at: new Date().toISOString(),
        salt_nonce: saltNonce?.toString()
      });
      
    if (walletError) {
      console.error('Failed to store wallet in Supabase:', walletError);
      throw new Error(`Failed to store wallet in Supabase: ${walletError.message}`);
    }
    
    console.log(`Stored new wallet ${result.address} in Supabase`);
    
    return {
      ...result,
      exists: false
    };
  } catch (error) {
    console.error('Error in smart account creation:', error);
    throw error;
  }
}

// Updated to use the owner account directly instead of creating from private key
async function createPermissionlessSCA(
  userId: string,
  owner: any,
  saltNonce?: bigint
) {
  try {
    console.log('Creating permissionless SCA with owner from DKG');
    console.log(`Owner EOA address: ${owner.address}`);
    
    // Create public client with better fallback and retry
    const publicClient = createPublicClientForSepolia();
    
    // Safe account parameters
    const safeParams: any = {
      client: publicClient,
      owners: [owner], // Using the owner account from combined keys
      version: "1.4.1",
      entryPoint: {
        address: ENTRY_POINT_ADDRESS,
        version: "0.6" as const,
      },
      saltNonce: saltNonce || BigInt(0),
      chainId: sepolia.id,
    };
    
    console.log('Creating Safe Smart Account with parameters...');
    console.log(`Salt nonce being used: ${safeParams.saltNonce} (type: ${typeof safeParams.saltNonce})`);
    console.log('Safe Account Parameters:', JSON.stringify({
      client: 'PublicClient [OK]',
      owners: [`Owner (${owner.address})`],
      version: safeParams.version,
      entryPoint: safeParams.entryPoint,
      saltNonce: safeParams.saltNonce.toString() + 'n',
      chainId: safeParams.chainId
    }, null, 2));
    
    // Create the smart account
    const smartAccount = await toSafeSmartAccount(safeParams);
    console.log(`Created Smart Account with address: ${smartAccount.address}`);
    
    return {
      address: smartAccount.address,
      smartAccount,
      publicClient,
      owner
    };
  } catch (error) {
    console.error('Error creating permissionless SCA:', error);
    throw error;
  }
}

// Find a user by ID - using Supabase
export async function findUserById(userId: string): Promise<UserAccount | null> {
  try {
    console.log(`Finding user by ID: ${userId}`);
    
    // Query Supabase for the user
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Supabase error finding user:', error.message);
      return null;
    }

    console.log('Raw Supabase user data:', {
      id: data.id,
      server_key_encrypted: data.server_key_encrypted ? 'exists' : 'missing',
      auth_type: data.auth_type
    });
    
    // Get the user's wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId);
    
    if (walletsError) {
      console.error('Error fetching wallets:', walletsError);
    }
    
    // Convert the Supabase data to our UserAccount format
    const user: UserAccount = {
      id: data.id,
      username: data.username || 'Unknown',
      authType: data.auth_type || 'biometric',
      createdAt: new Date(data.created_at).getTime(),
      serverKey: data.server_key_encrypted,
      recoveryKeyHash: data.recovery_key_hash,
      wallets: wallets?.map(wallet => ({
        address: wallet.address as Address,
        name: wallet.name || 'Default Wallet',
        chainId: wallet.chain_id || 11155111,
        isDefault: wallet.is_default || false,
        createdAt: new Date(wallet.created_at).getTime(),
        saltNonce: wallet.salt_nonce
      })) || []
    };

    console.log('Converted UserAccount data:', {
      id: user.id,
      serverKey: user.serverKey ? 'exists' : 'missing',
      authType: user.authType
    });
    
    // Set walletAddress to the default wallet for backward compatibility
    const defaultWallet = user.wallets.find(w => w.isDefault);
    if (defaultWallet) {
      user.walletAddress = defaultWallet.address;
    }
    
    return user;
  } catch (error) {
    console.error('Error finding user by ID:', error);
    return null;
  }
}

// Find a user by wallet address - using Supabase
export async function findUserByWalletAddress(address: Address): Promise<UserAccount | null> {
  try {
    // Find the wallet in Supabase
    const { data, error } = await supabase
      .from('wallets')
      .select('user_id')
      .eq('address', address.toLowerCase())
      .single();
    
    if (error || !data) {
      console.error('Error finding wallet by address:', error?.message || 'Wallet not found');
      return null;
    }
    
    // Get the user by ID
    return await findUserById(data.user_id);
  } catch (error) {
    console.error('Error finding user by wallet address:', error);
    return null;
  }
}

// Find authenticator by credential ID - using Supabase
export async function findAuthenticatorByCredentialId(credentialId: string): Promise<AuthenticatorDevice | undefined> {
  try {
    // Log the incoming credential ID format
    console.log('🔍 Finding authenticator for credential ID:', credentialId);
    
    // Try different formats of the credential ID
    const formats = [];
    
    // Original format
    formats.push(credentialId);
    
    // Format 1: Base64 to base64url (no padding)
    try {
      const decoded = Buffer.from(credentialId, 'base64');
      formats.push(decoded.toString('base64url'));
    } catch (e) {
      console.log('Could not convert from base64 to base64url:', e);
    }
    
    // Format 2: With padding removed
    if (credentialId.endsWith('=')) {
      formats.push(credentialId.replace(/=+$/, ''));
    }
    
    // Format 3: With padding added
    if (!credentialId.endsWith('=')) {
      // Add padding
      let padded = credentialId;
      while (padded.length % 4 !== 0) {
        padded += '=';
      }
      formats.push(padded);
    }
    
    console.log('🔍 Will try these credential ID formats:', formats);
    
    // Try to find the authenticator with any of these credential ID formats
    let authenticatorData = null;
    let formatUsed = null;
    
    for (const format of formats) {
      // Query with the current format
      console.log(`🔍 Trying credential_id="${format}"`);
      
      const { data, error } = await supabase
        .from('authenticators')
        .select('*')
        .eq('credential_id', format);
        
      if (error) {
        console.error(`❌ Error with format "${format}":`, error.message);
        continue;
      }
      
      if (data && data.length > 0) {
        console.log(`✅ Found authenticator with format "${format}"!`);
        authenticatorData = data[0];
        formatUsed = format;
        break;
      } else {
        console.log(`❌ No authenticator found with format "${format}"`);
      }
    }
    
    if (!authenticatorData) {
      console.error('❌ No authenticator found for any credential ID format');
      
      // DEBUG: List all authenticators for troubleshooting
      const { data: allAuths, error: listError } = await supabase
        .from('authenticators')
        .select('credential_id')
        .limit(10);
        
      if (!listError && allAuths) {
        console.log('📋 Available authenticator credential_ids in database:', 
          allAuths.map(a => a.credential_id));
      }
      
      return undefined;
    }
    
    // Get the user's default wallet address
    const { data: walletData, error: walletError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', authenticatorData.user_id)
      .eq('is_default', true);
    
    // If no wallet found, return undefined
    if (walletError || !walletData || walletData.length === 0) {
      console.log('❌ No default wallet found for this authenticator, checking for any wallet');
      
      // Try to find any wallet for this user
      const { data: anyWallet, error: anyWalletError } = await supabase
        .from('wallets')
        .select('address')
        .eq('user_id', authenticatorData.user_id)
        .limit(1);
        
      if (anyWalletError || !anyWallet || anyWallet.length === 0) {
        console.log('❌ No wallets found for this user at all');
        return undefined;
      }
      
      console.log('✅ Found non-default wallet address:', anyWallet[0].address);
      
      // Convert from Supabase to AuthenticatorDevice
      return {
        id: authenticatorData.id,
        walletAddress: anyWallet[0].address as Address,
        credentialID: authenticatorData.credential_id,
        credentialPublicKey: authenticatorData.credential_public_key,
        counter: authenticatorData.counter,
        deviceName: authenticatorData.device_name || 'Unknown Device',
        createdAt: new Date(authenticatorData.created_at),
        lastUsed: authenticatorData.last_used ? new Date(authenticatorData.last_used) : undefined
      };
    }
    
    console.log('✅ Found default wallet address:', walletData[0].address);
    
    // Convert from Supabase to AuthenticatorDevice
    return {
      id: authenticatorData.id,
      walletAddress: walletData[0].address as Address,
      credentialID: authenticatorData.credential_id,
      credentialPublicKey: authenticatorData.credential_public_key,
      counter: authenticatorData.counter,
      deviceName: authenticatorData.device_name || 'Unknown Device',
      createdAt: new Date(authenticatorData.created_at),
      lastUsed: authenticatorData.last_used ? new Date(authenticatorData.last_used) : undefined
    };
  } catch (error) {
    console.error('❌ Error finding authenticator by credential ID:', error);
    return undefined;
  }
}

// Update authenticator counter - using Supabase
export async function updateAuthenticator(authenticator: AuthenticatorDevice): Promise<void> {
  try {
    // Update the authenticator in Supabase
    const { error } = await supabase
      .from('authenticators')
      .update({
        counter: authenticator.counter,
        last_used: authenticator.lastUsed?.toISOString()
      })
      .eq('credential_id', authenticator.credentialID);
    
    if (error) {
      console.error('Error updating authenticator:', error);
      throw new Error(`Failed to update authenticator: ${error.message}`);
    }
  } catch (error) {
    console.error('Error updating authenticator:', error);
    throw error;
  }
}

/* // Update the wallet address for a user - compatible with createPermissionlessSCA
export async function updateUserWalletAddress(userId: string, walletAddress: Address, saltNonce?: bigint): Promise<void> {
  try {
    // We don't need to do anything here as we insert the wallet directly in createSmartAccountFromCredential
    console.log(`Wallet address ${walletAddress} will be stored in Supabase for user ${userId}`);
  } catch (error) {
    console.error('Error updating user wallet address:', error);
    throw error;
  }
} */

// Create a new user in Supabase
export async function createUser(data: Partial<UserAccount> & { id: string }): Promise<UserAccount> {
  const { error } = await supabase
    .from('users')
    .insert({
      id: data.id,
      username: data.username,
      created_at: new Date().toISOString(),
      auth_type: data.authType || 'biometric',
      is_active: true
    });

  if (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }

  const user = await findUserById(data.id);
  if (!user) {
    throw new Error('Failed to retrieve created user');
  }
  return user;
}

// Get wallets for a user - using Supabase
export async function getWalletsForUser(userId: string): Promise<Wallet[]> {
  try {
    // Get wallets from Supabase
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error fetching wallets for user:', error);
      return [];
    }
    
    // Convert to our Wallet format
    return data.map(wallet => ({
      address: wallet.address as Address,
      name: wallet.name || 'Default Wallet',
      chainId: wallet.chain_id || 11155111,
      isDefault: wallet.is_default || false,
      createdAt: new Date(wallet.created_at).getTime(),
      saltNonce: wallet.salt_nonce
    }));
  } catch (error) {
    console.error('Error getting wallets for user:', error);
    return [];
  }
}

// Store keys securely - using Supabase
export async function storeKeys(
  userId: string,
  deviceKey: Hex,
  serverKey: Hex,
  recoveryKey: Hex
): Promise<boolean> {
  try {
    // Update the user in Supabase
    const { error } = await supabase
      .from('users')
      .update({
        server_key_encrypted: encryptPrivateKey(serverKey, process.env.KEY_ENCRYPTION_KEY || ''),
        recovery_key_hash: hashRecoveryKey(recoveryKey)
      })
      .eq('id', userId);
    
    if (error) {
      console.error('Error storing keys in Supabase:', error);
      return false;
    }
    
    console.log(`Stored keys securely for user ${userId} in Supabase`);
    return true;
  } catch (error) {
    console.error('Error storing keys:', error);
    return false;
  }
}

// Add a new authenticator for a wallet - using Supabase
export async function addAuthenticator(authenticator: AuthenticatorDevice): Promise<void> {
  try {
    // Add id if not provided
    if (!authenticator.id) {
      authenticator.id = crypto.randomUUID();
    }
    
    // Set creation time if not provided
    if (!authenticator.createdAt) {
      authenticator.createdAt = new Date();
    }
    
    // Ensure credential ID is in base64url format
    let credentialIdBase64: string;
    try {
      // Check if already base64url encoded
      const decoded = Buffer.from(authenticator.credentialID, 'base64url');
      credentialIdBase64 = decoded.toString('base64url');
      console.log('🔄 Credential ID was already in base64url format');
    } catch {
      // If not base64url, convert it
      credentialIdBase64 = Buffer.from(authenticator.credentialID).toString('base64url');
      console.log('🔄 Converted credential ID to base64url format:', credentialIdBase64);
    }
    
    // Convert Buffer to base64 for Postgres
    let credentialPublicKeyBase64 = null;
    if (authenticator.credentialPublicKey instanceof Buffer) {
      credentialPublicKeyBase64 = Buffer.from(authenticator.credentialPublicKey).toString('base64');
    }
    
    console.log('Adding authenticator:', {
      id: authenticator.id,
      credentialId: credentialIdBase64,
      deviceName: authenticator.deviceName
    });
    
    // Insert the authenticator into Supabase
    const { error } = await supabase
      .from('authenticators')
      .insert({
        id: authenticator.id,
        user_id: await getUserIdForWalletAddress(authenticator.walletAddress),
        credential_id: credentialIdBase64,
        credential_public_key: credentialPublicKeyBase64,
        counter: authenticator.counter,
        device_name: authenticator.deviceName || 'Unknown Device',
        created_at: authenticator.createdAt.toISOString(),
        last_used: authenticator.lastUsed?.toISOString(),
        is_active: true
      });
    
    if (error) {
      console.error('Error adding authenticator to Supabase:', error);
      throw new Error(`Failed to add authenticator: ${error.message}`);
    }
    
    console.log('Successfully added authenticator:', authenticator.id);
  } catch (error) {
    console.error('Error adding authenticator:', error);
    throw error;
  }
}

// Helper function to get user ID for a wallet address
async function getUserIdForWalletAddress(address: Address): Promise<string> {
  try {
    // Find the wallet in Supabase
    const { data, error } = await supabase
      .from('wallets')
      .select('user_id')
      .eq('address', address.toLowerCase())
      .single();
    
    if (error || !data) {
      console.error('Error finding user ID for wallet address:', error?.message || 'Wallet not found');
      throw new Error('Wallet address not found');
    }
    
    return data.user_id;
  } catch (error) {
    console.error('Error getting user ID for wallet address:', error);
    throw error;
  }
}

// Update user - simplified for Supabase
export async function updateUser(updatedUser: Partial<UserAccount> & { id: string }): Promise<void> {
  try {
    // Update the user in Supabase
    const { error } = await supabase
      .from('users')
      .update({
        username: updatedUser.username,
        auth_type: updatedUser.authType,
        server_key_encrypted: updatedUser.serverKey,
        recovery_key_hash: updatedUser.recoveryKeyHash,
        is_active: updatedUser.is_active
      })
      .eq('id', updatedUser.id);
    
    if (error) {
      console.error('Error updating user in Supabase:', error);
      throw new Error(`Failed to update user: ${error.message}`);
    }
    
    console.log(`Updated user ${updatedUser.id} in Supabase`);
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

// Get the default wallet for a user - using Supabase
export async function getDefaultWallet(userId: string): Promise<Wallet | undefined> {
  try {
    // Get wallets from Supabase
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .limit(1);
    
    if (error || !data || data.length === 0) {
      console.error('Error fetching default wallet:', error?.message || 'No wallet found');
      return undefined;
    }
    
    // Convert to our Wallet format
    return {
      address: data[0].address as Address,
      name: data[0].name || 'Default Wallet',
      chainId: data[0].chain_id || 11155111,
      isDefault: data[0].is_default || false,
      createdAt: new Date(data[0].created_at).getTime(),
      saltNonce: data[0].salt_nonce
    };
  } catch (error) {
    console.error('Error getting default wallet:', error);
    return undefined;
  }
}

// Get the newest wallet for a user - using Supabase
export async function getNewestWallet(userId: string): Promise<Wallet | undefined> {
  try {
    // Get wallets from Supabase
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error || !data || data.length === 0) {
      console.error('Error fetching newest wallet:', error?.message || 'No wallet found');
      return undefined;
    }
    
    // Convert to our Wallet format
    return {
      address: data[0].address as Address,
      name: data[0].name || 'Default Wallet',
      chainId: data[0].chain_id || 11155111,
      isDefault: data[0].is_default || false,
      createdAt: new Date(data[0].created_at).getTime(),
      saltNonce: data[0].salt_nonce
    };
  } catch (error) {
    console.error('Error getting newest wallet:', error);
    return undefined;
  }
}

/**
 * DKG Utilities - Distributed Key Generation for secure wallet access
 * Device key is stored only in the device's secure enclave, never in the database
 */

/**
 * Generate a complete set of DKG keys for a new user
 */
export async function generateDKGKeysForUser(userId: string): Promise<{
  serverKey: Hex;
  recoveryKey: string;
  deviceKey: Hex;
  combinedKey: Hex;
  isNew: boolean;
}> {
  try {
    console.log(`Generating DKG keys for user ${userId}`);
    
    // Generate server key
    const serverKey = generateRandomPrivateKey();
    console.log('Generated server key');
    
    // Generate recovery key (only used for recovery situations)
    const recoveryKey = generateRecoveryKey();
    const recoveryKeyHash = createHash('sha256').update(recoveryKey).digest('hex');
    console.log('Generated recovery key');
    
    // Generate device key - this will be returned to client but NOT stored in database
    const deviceKey = generateRandomPrivateKey();
    console.log('Generated device key (for secure local storage only)');
    
    // Store server key in Supabase (encrypted)
    const serverKeyEncrypted = encryptPrivateKey(serverKey, process.env.KEY_ENCRYPTION_KEY || '');
    const { error } = await supabase
      .from('users')
      .update({
        server_key_encrypted: serverKeyEncrypted,
        recovery_key_hash: recoveryKeyHash
      })
      .eq('id', userId);
    
    if (error) {
      console.error('Failed to store keys in Supabase:', error);
      throw new Error(`Failed to store server key: ${error.message}`);
    }
    
    console.log(`Stored server key for user ${userId} in Supabase`);
    
    // Combine keys
    const combinedKey = combineKeys(deviceKey, serverKey);
    
    return {
      serverKey,
      recoveryKey,
      deviceKey,
      combinedKey,
      isNew: true
    };
  } catch (error) {
    console.error('Error generating DKG keys:', error);
    throw error;
  }
}

/**
 * Retrieve DKG keys for an existing user
 * Note: deviceKey must be provided by the client from secure storage
 */
export async function getDKGKeysForUser(userId: string, deviceKey: Hex): Promise<{
  serverKey: Hex;
  deviceKey: Hex;
  combinedKey: Hex;
}> {
  try {
    console.log(`Getting DKG keys for user ${userId}`);
    
    // Get user from Supabase
    const user = await findUserById(userId);
    console.log('Fetched user data:', user);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    
    // Get server key from Supabase
    const serverKeyEncrypted = user.serverKey;
    console.log('Server key encrypted:', serverKeyEncrypted);
    if (!serverKeyEncrypted) {
      console.error('Server key is missing. User data:', {
        id: user.id,
        serverKeyEncrypted: user.serverKey,
      });
      throw new Error(`No server key found for user ${userId}`);
    }
    
    // Decrypt server key
    const serverKey = decryptPrivateKey(serverKeyEncrypted, process.env.KEY_ENCRYPTION_KEY || '');
    console.log('Decrypted server key:', serverKey);
    // Note: We don't need to get the biometric key from Supabase anymore,
    // it's provided by the client from secure storage
    
    // Combine keys
    const combinedKey = combineKeys(deviceKey, serverKey);
    
    return {
      serverKey,
      deviceKey,
      combinedKey
    };
  } catch (error) {
    console.error('Error getting DKG keys:', error);
    throw error;
  }
}

/**
 * Get existing DKG keys or generate new ones
 * Note: For existing users, deviceKey must be provided from secure storage
 */
export async function getOrCreateDKGKeysForUser(
  userId: string, 
  deviceKey?: Hex
): Promise<{
  serverKey: Hex;
  recoveryKey?: string;
  deviceKey: Hex;
  combinedKey: Hex;
  isNew: boolean;
}> {
  try {
    // Get user from Supabase
    const user = await findUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    
    // Check if user has server key
    if (user.server_key_encrypted) {
      console.log(`User ${userId} has existing server key`);
      
      // If deviceKey is not provided, we can't get the combined key
      if (!deviceKey) {
        throw new Error('Device key must be provided for existing users');
      }
      
      // Get existing keys
      const keys = await getDKGKeysForUser(userId, deviceKey);
      
      return {
        ...keys,
        isNew: false
      };
    } else {
      console.log(`User ${userId} has no server key, generating new keys`);
      
      // Generate new keys
      return await generateDKGKeysForUser(userId);
    }
  } catch (error) {
    console.error('Error getting or creating DKG keys:', error);
    throw error;
  }
}

// Generate a secure recovery key (12 words)
function generateRecoveryKey(): string {
  // Generate a random mnemonic (12 words)
  const entropy = randomBytes(16);
  // Convert entropy to Uint8Array for entropyToMnemonic
  const entropyArray = new Uint8Array(entropy);
  // Use English wordlist
  return entropyToMnemonic(entropyArray, wordlist);
}

// Hash the recovery key for safe storage
function hashRecoveryKey(recoveryKey: string): string {
  return createHash('sha256').update(recoveryKey).digest('hex');
}

/**
 * Find wallet address associated with a credential ID
 */
export async function findWalletAddressByCredentialId(credentialId: string): Promise<string | undefined> {
  try {
    // First find the user_id from authenticators table
    const { data: authData, error: authError } = await supabase
      .from('authenticators')
      .select('user_id')
      .eq('credential_id', credentialId)
      .single();

    if (authError || !authData) {
      console.error('Error finding user by credential ID:', authError);
      return undefined;
    }

    // Then find the default wallet for this user
    const { data: walletData, error: walletError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', authData.user_id)
      .eq('is_default', true)
      .single();

    if (walletError || !walletData) {
      console.error('Error finding wallet:', walletError);
      return undefined;
    }

    return walletData.address;
  } catch (error) {
    console.error('Error in findWalletAddressByCredentialId:', error);
    return undefined;
  }
}

/**
 * Find user ID associated with a credential ID
 */

export async function findUserByCredentialId(credentialId: string) {
  try {
    // Log the incoming credential ID format
    console.log('🔍 Finding user for credential ID:', credentialId);
    
    // Try different formats of the credential ID
    const formats = [];
    
    // Original format
    formats.push(credentialId);
    
    // Format 1: Base64 to base64url (no padding)
    try {
      const decoded = Buffer.from(credentialId, 'base64');
      formats.push(decoded.toString('base64url'));
    } catch (e) {
      console.log('Could not convert from base64 to base64url:', e);
    }
    
    // Format 2: With padding removed
    if (credentialId.endsWith('=')) {
      formats.push(credentialId.replace(/=+$/, ''));
    }
    
    // Format 3: With padding added
    if (!credentialId.endsWith('=')) {
      // Add padding
      let padded = credentialId;
      while (padded.length % 4 !== 0) {
        padded += '=';
      }
      formats.push(padded);
    }
    
    // For bytea column handling
    try {
      // Convert to actual bytes and back to different formats
      const decoded = Buffer.from(credentialId, 'base64');
      // Add hex encoding
      formats.push(decoded.toString('hex'));
      // Add raw buffer representation for bytea column
      // Note: Supabase may not handle this correctly in JS
    } catch (e) {
      console.log('Could not perform bytea conversion:', e);
    }
    
    console.log('🔍 Will try these credential ID formats:', formats);
    
    // Try an initial SQL query that doesn't filter by credential_id 
    let authenticator = null;
    let formatUsed = null;
    
    // First, try to get all authenticators and check in JS
    console.log('🔍 Querying all authenticators to check in JS...');
    const { data: allAuths, error: listError } = await supabase
      .from('authenticators')
      .select('credential_id, user_id');
      
    if (listError) {
      console.error('❌ Error querying all authenticators:', listError.message);
    } else if (allAuths && allAuths.length > 0) {
      console.log('✅ Found authenticators:', allAuths.length);
      
      // Try to manually match credential_id with fuzzy matching
      for (const auth of allAuths) {
        const dbCredId = auth.credential_id;
        console.log(`Comparing DB credential ${dbCredId} with ${credentialId}`);
        
        // Try exact match
        if (dbCredId === credentialId) {
          console.log('✅ Found exact match!');
          authenticator = auth;
          formatUsed = 'exact';
          break;
        }
        
        // Try with padding removed
        const normalizedDbCredId = dbCredId.replace(/=+$/, '');
        const normalizedCredId = credentialId.replace(/=+$/, '');
        
        if (normalizedDbCredId === normalizedCredId) {
          console.log('✅ Found match after normalizing padding!');
          authenticator = auth;
          formatUsed = 'normalized';
          break;
        }
      }
    } else {
      console.log('📋 No authenticators found in database');
    }
    
    // If we still don't have a match, try database queries with different formats
    if (!authenticator) {
      for (const format of formats) {
        // Query with the current format
        console.log(`🔍 Trying credential_id="${format}"`);
        
        const { data, error } = await supabase
          .from('authenticators')
          .select('user_id')
          .eq('credential_id', format);
          
        if (error) {
          console.error(`❌ Error with format "${format}":`, error.message);
          continue;
        }
        
        if (data && data.length > 0) {
          console.log(`✅ Found authenticator with format "${format}"!`);
          authenticator = data[0];
          formatUsed = format;
          break;
        } else {
          console.log(`❌ No authenticator found with format "${format}"`);
        }
      }
    }

    // If we didn't find any matching authenticator
    if (!authenticator) {
      console.error('❌ No authenticator found for any credential ID format');
      
      // Try RAW SQL as a last resort
      try {
        const { data: rawData, error: rawError } = await supabase.rpc('find_by_credential', { cred_id: credentialId });
        
        if (!rawError && rawData && rawData.length > 0) {
          console.log('✅ Found user using raw SQL query!', rawData[0]);
          return rawData[0];
        } else {
          console.log('❌ Raw SQL query also failed:', rawError?.message);
        }
      } catch (sqlErr) {
        console.error('❌ Error with raw SQL query:', sqlErr);
      }
      
      // Give up
      return null;
    }

    // Then find the user associated with this authenticator
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authenticator.user_id)
      .single();

    if (userError) {
      console.error('❌ Error finding user:', userError);
      return null;
    }

    console.log('✅ Found user:', user.id);
    
    // Find the user's wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id);
      
    if (walletsError) {
      console.error('❌ Error finding wallets:', walletsError);
    } else {
      console.log(`✅ Found ${wallets.length} wallets for user ${user.id}`);
    }
    
    return user;
  } catch (error) {
    console.error('❌ Error in findUserByCredentialId:', error);
    return null;
  }
} 
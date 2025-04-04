import { randomBytes, createHash } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address, type Hex, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
// Import the ClientSetup type from shared-types
import { ClientSetup, ENTRY_POINT_ADDRESS } from './shared-types';
import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { encryptData, decryptData, generateRandomPrivateKey, generateDistributedKeys, combineKeys, hashRecoveryKey, encryptServerKey, decryptServerKey } from './key-encryption';
import { Authenticator, EncryptedKey, AuthenticatorDevice, Wallet } from '../types/credentials';

// Define WebAuthn settings locally
export const rpName = 'Nyx Wallet';
export const rpID = process.env.RP_ID || 'localhost';
// Use a less strict origin expectation for development, supporting multiple ports
export const origin = process.env.NODE_ENV === 'production' 
  ? `https://${rpID}` 
  : `http://${rpID}`;

// Storage file path
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUTHENTICATORS_FILE = path.join(DATA_DIR, 'authenticators.json');

// Types
export interface UserAccount {
  id: string;
  username: string;
  walletAddress?: Address; // Deprecated: Keep for backward compatibility
  wallets: Wallet[];        // New: Array of wallet addresses
  biometricKey?: string;    // encrypted private key for biometric auth
  socialKey?: string;       // encrypted private key for social auth
  createdAt: number;
  serverKey?: string | EncryptedKey;
  recoveryKeyHash?: string;
  authType?: 'biometric' | 'social' | 'direct';
  authenticators?: Authenticator[];
  credentials?: any[];
}

// Types for distributed key management
export interface DistributedKeys {
  deviceKey: Hex;
  serverKey: Hex;
  recoveryKey: Hex;
}

// In-memory user accounts loaded from persistent storage
export let userAccounts: UserAccount[] = [];
export let authenticatorDevices: AuthenticatorDevice[] = [];

// Initialize storage on startup
export function initializeStorage(): void {
  // Create data directory if it doesn't exist
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log(`Created data directory: ${DATA_DIR}`);
    } catch (error) {
      console.error('Failed to create data directory:', error);
    }
  }
  
  // Load user accounts from storage
  loadUserData();
  loadAuthenticatorData();
  
  // Log the result
  console.log(`Loaded ${userAccounts.length} user accounts from storage`);
  console.log(`Loaded ${authenticatorDevices.length} authenticator devices from storage`);
}

// Create a test user for development
function createTestUser() {
  // Create basic user
  const userId = `test_user_${Date.now()}`;
  const testUser = {
    id: userId,
    username: 'test_user',
    authType: 'biometric' as const,
    wallets: [], // Initialize empty wallets array
    authenticators: [],
    credentials: [],
    createdAt: new Date().getTime()
  } as UserAccount;
  
  // serverKey is required for wallet creation
  testUser.serverKey = encryptPrivateKey(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex, 
    process.env.KEY_ENCRYPTION_KEY || 'default_key'
  );
  
  // Add the user to the users array
  userAccounts.push(testUser);
  
  // Save user data
  saveUserData();
  
  return testUser;
}

// Load user data from storage
function loadUserData(): void {
  try {
    // Check if the users file exists
    if (fs.existsSync(USERS_FILE)) {
      // Read and parse the user data
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      
      // Convert ISO date strings back to Date objects and ensure wallets array exists
      userAccounts = parsedData.map((user: any) => {
        // Ensure wallets array exists
        if (!Array.isArray(user.wallets)) {
          user.wallets = [];
          
          // If there's a legacy walletAddress, add it as a wallet
          if (user.walletAddress) {
            user.wallets.push({
              address: user.walletAddress,
              name: 'Primary Wallet',
              chainId: 11155111, // Sepolia
              isDefault: true,
              createdAt: typeof user.createdAt === 'string' 
                ? new Date(user.createdAt).getTime() 
                : user.createdAt
            });
          }
        }
        
        return {
          ...user,
          createdAt: typeof user.createdAt === 'string' 
            ? new Date(user.createdAt).getTime() 
            : user.createdAt
        };
      });
    } else {
      console.log('No user data file found, starting with empty user accounts');
      userAccounts = [];
      
      // Create a test user for development
      if (process.env.NODE_ENV !== 'production') {
        createTestUser();
      }
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    userAccounts = [];
    
    // Create a test user for development
    if (process.env.NODE_ENV !== 'production') {
      createTestUser();
    }
  }
}

// Load authenticator data from storage
function loadAuthenticatorData(): void {
  try {
    // Check if the authenticators file exists
    if (fs.existsSync(AUTHENTICATORS_FILE)) {
      // Read and parse the authenticator data
      const data = fs.readFileSync(AUTHENTICATORS_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      
      // Convert ISO date strings back to Date objects and Buffer objects
      authenticatorDevices = parsedData.map((device: any) => ({
        ...device,
        createdAt: new Date(device.createdAt),
        lastUsed: device.lastUsed ? new Date(device.lastUsed) : undefined,
        credentialPublicKey: device.credentialPublicKey ? Buffer.from(device.credentialPublicKey, 'base64') : undefined
      }));
    } else {
      console.log('No authenticator data file found, starting with empty authenticators');
      authenticatorDevices = [];
    }
  } catch (error) {
    console.error('Error loading authenticator data:', error);
    authenticatorDevices = [];
  }
}

// Save user data to storage
function saveUserData(): void {
  try {
    // Create the directory if it doesn't exist
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Write user data to file
    const data = JSON.stringify(userAccounts, null, 2);
    fs.writeFileSync(USERS_FILE, data, 'utf8');
    console.log(`Saved ${userAccounts.length} users to storage`);
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

// Save authenticator data to storage
function saveAuthenticatorData(): void {
  try {
    // Create the directory if it doesn't exist
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Convert Buffer objects to base64 strings for storage
    const dataToSave = authenticatorDevices.map(device => ({
      ...device,
      credentialPublicKey: device.credentialPublicKey ? 
        Buffer.from(device.credentialPublicKey).toString('base64') : undefined
    }));
    
    // Write authenticator data to file
    const data = JSON.stringify(dataToSave, null, 2);
    fs.writeFileSync(AUTHENTICATORS_FILE, data, 'utf8');
    console.log(`Saved ${authenticatorDevices.length} authenticators to storage`);
  } catch (error) {
    console.error('Error saving authenticator data:', error);
  }
}

// Encrypt a private key with a password
export function encryptPrivateKey(privateKey: Hex, password: string): string {
  return CryptoJS.AES.encrypt(privateKey, password).toString();
}

// Decrypt a private key with a password
export function decryptPrivateKey(encryptedKey: string, password: string): Hex {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, password);
    return bytes.toString(CryptoJS.enc.Utf8) as Hex;
  } catch (error) {
    console.error('Error decrypting private key:', error);
    // Return a default key for development
    if (process.env.NODE_ENV !== 'production') {
      return '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
    }
    throw error;
  }
}

// Create a smart account from a private key
export async function createSmartAccountFromPrivateKey(privateKey: Hex): Promise<{
  address: Address;
  privateKey: Hex;
}> {
  const owner = privateKeyToAccount(privateKey);
  
  // Create a public client
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http()
  });
  
  // Log which chain we're using for account creation
  console.log(`Creating smart account on Sepolia chain`);
  
  // Import toSafeSmartAccount directly to avoid circular dependencies
  try {
    const permissionless = require('permissionless');
    let toSafeSmartAccountFn;
    
    if (permissionless.accounts && permissionless.accounts.toSafeSmartAccount) {
      toSafeSmartAccountFn = permissionless.accounts.toSafeSmartAccount;
    } else if (permissionless.toSafeSmartAccount) {
      toSafeSmartAccountFn = permissionless.toSafeSmartAccount;
    } else {
      throw new Error('toSafeSmartAccount function not found');
    }
    
    const smartAccount = await toSafeSmartAccountFn({
      client: publicClient,
      owners: [owner],
      entryPoint: {
        address: ENTRY_POINT_ADDRESS,
        version: "0.6",
      },
      safeVersion: "1.4.1",
      chainId: sepolia.id,
      saltNonce: 0n
    });
    
    return {
      address: smartAccount.address,
      privateKey
    };
  } catch (error) {
    console.error('Error creating Smart Account:', error);
    throw new Error(`Failed to create Smart Contract Account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

//* SIGNER 2: BIOMETRICS -> SCA
// Create a smart account from biometric or social credentials
export async function createSmartAccountFromCredential(
  userId: string, 
  authType: 'biometric' | 'social',
  salt: string = '' // Optional salt parameter for creating different wallets
): Promise<{
  address: Address;
  privateKey: Hex;
  clientSetup: ClientSetup;
}> {
  console.log(`Creating smart account for user ${userId} with ${authType} authentication${salt ? ' and salt: ' + salt : ''}`);
  
  // Find the user
  const user = findUserById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  
  // Get the private key based on auth type
  let privateKey: Hex;
  if (authType === 'biometric') {
    if (!user.biometricKey) {
      console.log(`User ${userId} doesn't have a biometric key. Generating a new one...`);
      // Generate a new biometric key
      privateKey = generateRandomPrivateKey();
      // Encrypt and store it for future use
      user.biometricKey = encryptPrivateKey(privateKey, userId);
      updateUser(user);
      console.log('New biometric key generated and stored.');
    } else {
      privateKey = decryptPrivateKey(user.biometricKey, userId);
    }
  } else {
    if (!user.socialKey) {
      console.log(`User ${userId} doesn't have a social key. Generating a new one...`);
      // Generate a new social key
      privateKey = generateRandomPrivateKey();
      // Encrypt and store it for future use
      user.socialKey = encryptPrivateKey(privateKey, userId);
      updateUser(user);
      console.log('New social key generated and stored.');
    } else {
      privateKey = decryptPrivateKey(user.socialKey, userId);
    }
  }
  
  // Generate a combined key that's unique to this user and auth method (with optional salt)
  const combinedKey = generateCombinedKey(privateKey, userId, authType, salt);
  
  try {
    // Try the improved permissionless.js v2 implementation
    try {
      console.log('Creating SCA with improved permissionless.js v2 implementation...');
      
      // Try the JavaScript version first (more reliable with direct requires)
      try {
        const { createPermissionlessSCADirectJS } = require('./permissionless-js-direct');
        return await createPermissionlessSCADirectJS(combinedKey);
      } catch (jsError) {
        console.log('JS implementation failed, trying TypeScript version...');
        const { createPermissionlessSCAv2 } = await import('./permissionless-v2');
        return await createPermissionlessSCAv2(combinedKey);
      }
    } catch (v2Error) {
      console.error('Error creating SCA with improved permissionless.js v2:', v2Error);
      console.log('Falling back to direct Safe Smart Account implementation...');
      
      // If v2 fails, directly use the fallback implementation
      // Define a function to update the user's wallet address
      const updateUserWalletAddress = (id: string, address: Address) => {
        const user = findUserById(id);
        if (user) {
          user.walletAddress = address;
          updateUser(user);
        }
      };
      
      // Import the fallback implementation
      const { createFallbackSmartAccount } = await import('./fallback-sca');
      
      // Create a real Smart Contract Account using our fallback implementation
      return await createFallbackSmartAccount(
        userId,
        combinedKey,
        updateUserWalletAddress
      );
    }
  } catch (error) {
    console.error('All Smart Account creation methods failed:', error);
    throw new Error(`Failed to create Smart Contract Account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Find a user by ID
export function findUserById(userId: string): UserAccount | undefined {
  // If no users are loaded, initialize storage
  if (userAccounts.length === 0) {
    initializeStorage();
  }
  
  const user = userAccounts.find(user => user.id === userId);
  
  // For development, return a mock user if none found
  if (!user && process.env.NODE_ENV !== 'production') {
    console.log(`Creating mock user for ID: ${userId}`);
    const mockUser: UserAccount = {
      id: userId,
      username: `test_${userId.substring(0, 5)}`,
      authType: 'biometric',
      createdAt: new Date().getTime(),
      wallets: [], // Add missing wallets array
      serverKey: encryptPrivateKey(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex, 
        process.env.KEY_ENCRYPTION_KEY || 'default_key'
      )
    };
    userAccounts.push(mockUser);
    saveUserData();
    return mockUser;
  }
  
  return user;
}

// Find a user by wallet address
export function findUserByWalletAddress(address: Address): UserAccount | undefined {
  return userAccounts.find(user => user.walletAddress?.toLowerCase() === address.toLowerCase());
}

// Find authenticator by credential ID
export function findAuthenticatorByCredentialId(credentialId: string): AuthenticatorDevice | undefined {
  return authenticatorDevices.find(device => device.credentialID === credentialId);
}

// Find authenticators by wallet address
export function findAuthenticatorsByWalletAddress(address: Address): AuthenticatorDevice[] {
  return authenticatorDevices.filter(device => device.walletAddress.toLowerCase() === address.toLowerCase());
}

// Add a new authenticator for a wallet
export function addAuthenticator(authenticator: AuthenticatorDevice): void {
  // Add id if not provided
  if (!authenticator.id) {
    authenticator.id = crypto.randomUUID();
  }
  
  // Set creation time if not provided
  if (!authenticator.createdAt) {
    authenticator.createdAt = new Date();
  }
  
  // Add to the list
  authenticatorDevices.push(authenticator);
  
  // Save to storage
  saveAuthenticatorData();
  
  console.log(`Added authenticator ${authenticator.id} for wallet ${authenticator.walletAddress}`);
}

// Update an authenticator
export function updateAuthenticator(authenticator: AuthenticatorDevice): void {
  const index = authenticatorDevices.findIndex(a => a.id === authenticator.id);
  
  if (index === -1) {
    throw new Error(`Authenticator with ID ${authenticator.id} not found`);
  }
  
  // Update the authenticator
  authenticatorDevices[index] = authenticator;
  
  // Save to storage
  saveAuthenticatorData();
  
  console.log(`Updated authenticator ${authenticator.id}`);
}

// Create a new user
export function createUser(
  username: string,
  authType: 'biometric' | 'social' | 'direct',
  walletAddress?: Address,
): UserAccount {
  const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  const user: UserAccount = {
    id: userId,
    username,
    authType,
    walletAddress,
    wallets: [], // Initialize empty wallets array
    authenticators: [],
    credentials: [],
    createdAt: new Date().getTime()
  };
  
  userAccounts.push(user);
  saveUserData(); // Save the updated user list
  return user;
}

// Update an existing user
export function updateUser(updatedUser: UserAccount): void {
  const index = userAccounts.findIndex(user => user.id === updatedUser.id);
  
  if (index === -1) {
    throw new Error(`User with ID ${updatedUser.id} not found`);
  }
  
  // Update the user
  userAccounts[index] = updatedUser;
  
  // Save the updated user data
  saveUserData();
  
  console.log(`Updated user ${updatedUser.id}`);
}

// Store keys securely
export async function storeKeys(
  userId: string,
  deviceKey: Hex,
  serverKey: Hex,
  recoveryKey: Hex
): Promise<boolean> {
  try {
    // Find the user
    const user = findUserById(userId);
    if (!user) {
      console.error(`User ${userId} not found when storing keys`);
      return false;
    }
    
    // Use stronger encryption specifically for server keys
    user.serverKey = encryptServerKey(serverKey);
    
    // Store a hash of the recovery key for verification
    user.recoveryKeyHash = hashRecoveryKey(recoveryKey);
    
    // Save the updated user data
    saveUserData();
    
    console.log(`Stored keys securely for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Error storing keys:', error);
    return false;
  }
}

// Get keys for signing
export async function getKeys(userId: string): Promise<{
  deviceKey: Hex;
  serverKey: Hex;
}> {
  const user = findUserById(userId);
  if (!user) {
    throw new Error(`User with ID ${userId} not found`);
  }

  if (!user.serverKey) {
    throw new Error('Server key not found');
  }

  // Decrypt server key based on format
  let serverKey: string;
  if (typeof user.serverKey === 'string') {
    // Legacy format using simple encryption
    serverKey = decryptPrivateKey(user.serverKey, process.env.KEY_ENCRYPTION_KEY || '');
  } else if (user.serverKey.algorithm === 'AES-256-GCM-SCRYPT') {
    // New format with stronger scrypt-based encryption
    serverKey = decryptServerKey(user.serverKey);
  } else {
    // Standard AES-GCM encryption
    serverKey = decryptData(user.serverKey);
  }
  
  // Device key is retrieved by the client-side code
  // Return a placeholder that will be replaced by the client
  return {
    deviceKey: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
    serverKey: serverKey as Hex
  };
}

// Verify recovery key
export function verifyRecoveryKey(userId: string, recoveryKey: Hex): boolean {
  const user = findUserById(userId);
  if (!user || !user.recoveryKeyHash) {
    return false;
  }

  const providedKeyHash = hashRecoveryKey(recoveryKey);
  return providedKeyHash === user.recoveryKeyHash;
}

// Get the smart account client for a user
export async function getSmartAccountClient(userId: string) {
  // Find the user
  const user = findUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Get the keys
  const { deviceKey, serverKey } = await getKeys(userId);
  
  // Create a deterministic key from the combined device and server keys
  const combinedKey = combineKeys(deviceKey, serverKey);
  
  // Create the owner account
  const owner = privateKeyToAccount(combinedKey);
  
  try {
    // Initialize blockchain clients
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http()
    });
    
    // Try to import the permissionless.js dependencies
    let createSafeSmartAccount;
    let createPimlicoClient;
    let createSmartAccountClient;
    
    try {
      // Dynamic imports to avoid circular dependencies
      const permissionless = require('permissionless');
      const pimlicoClients = require('permissionless/clients/pimlico');
      
      // Get the functions we need from permissionless
      if (permissionless.accounts && permissionless.accounts.toSafeSmartAccount) {
        createSafeSmartAccount = permissionless.accounts.toSafeSmartAccount;
      } else if (permissionless.toSafeSmartAccount) {
        createSafeSmartAccount = permissionless.toSafeSmartAccount;
      } else {
        throw new Error('toSafeSmartAccount function not found');
      }
      
      // Get Pimlico client creator
      createPimlicoClient = pimlicoClients.createPimlicoClient;
      
      // Get smart account client creator
      createSmartAccountClient = permissionless.createSmartAccountClient;
    } catch (importError) {
      console.error('Failed to import permissionless.js dependencies:', importError);
      throw new Error('Failed to import required dependencies');
    }
    
    // Create Pimlico client
    const pimlicoApiKey = process.env.PIMLICO_API_KEY || '';
    if (!pimlicoApiKey) {
      throw new Error('Pimlico API key is required');
    }
    
    const bundlerUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${pimlicoApiKey}`;
    const pimlicoClient = createPimlicoClient({
      transport: http(bundlerUrl),
      entryPoint: ENTRY_POINT_ADDRESS,
    });
    
    // Create the smart account
    const smartAccount = await createSafeSmartAccount({
      client: publicClient,
      owners: [owner],
      entryPoint: {
        address: ENTRY_POINT_ADDRESS,
        version: "0.6",
      },
      chainId: sepolia.id,
      version: "1.4.1",
    });
    
    // Create the smart account client
    const smartAccountClient = createSmartAccountClient({
      account: smartAccount,
      chain: sepolia,
      bundlerTransport: http(bundlerUrl),
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
            throw err;
          }
        }
      }
    });
    
    return {
      smartAccount,
      smartAccountClient
    };
  } catch (error) {
    console.error('Error getting smart account client:', error);
    throw error;
  }
}

/**
 * Generate a deterministic private key that's unique to this user and auth method
 * This ensures we get the same private key each time for the same user+auth combination
 * The optional salt allows creating multiple different wallets for the same user
 */
export function generateCombinedKey(
  privateKey: Hex, 
  userId: string, 
  authType: string,
  salt: string = ''
): Hex {
  // Create a deterministic hash based on the user ID, private key, auth type, and optional salt
  const combinedData = `${userId}-${privateKey}-${authType}-${salt}`;
  const hash = createHash('sha256').update(combinedData).digest('hex');
  
  // Ensure it's a valid private key format (32 bytes)
  return `0x${hash}` as Hex;
}

// Add a new wallet to a user
export function addWalletToUser(
  userId: string, 
  address: Address, 
  name: string = 'My Wallet', 
  chainId: number = 11155111 // Sepolia by default
): Wallet {
  const user = findUserById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  
  // Initialize wallets array if it doesn't exist
  if (!Array.isArray(user.wallets)) {
    user.wallets = [];
  }
  
  // Set the previous default wallet to non-default
  if (user.wallets.length > 0) {
    user.wallets.forEach(wallet => {
      wallet.isDefault = false;
    });
  }
  
  // Create the new wallet
  const newWallet: Wallet = {
    address,
    name,
    chainId,
    isDefault: true,
    createdAt: Date.now()
  };
  
  // Add the wallet to the user's wallets
  user.wallets.push(newWallet);
  
  // For backward compatibility, also set as the main walletAddress
  user.walletAddress = address;
  
  // Save changes
  updateUser(user);
  
  console.log(`Added new wallet ${address} to user ${userId}`);
  return newWallet;
}

// Get all wallets for a user
export function getWalletsForUser(userId: string): Wallet[] {
  const user = findUserById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  
  // Initialize wallets array if it doesn't exist
  if (!Array.isArray(user.wallets)) {
    user.wallets = [];
    
    // If there's a legacy walletAddress, convert it to a wallet
    if (user.walletAddress) {
      user.wallets.push({
        address: user.walletAddress,
        name: 'Primary Wallet',
        chainId: 11155111, // Sepolia
        isDefault: true,
        createdAt: user.createdAt
      });
      updateUser(user);
    }
  }
  
  return user.wallets;
}

// Get the default wallet for a user
export function getDefaultWallet(userId: string): Wallet | undefined {
  const wallets = getWalletsForUser(userId);
  return wallets.find(wallet => wallet.isDefault) || wallets[0];
}

// Set a wallet as the default for a user
export function setDefaultWallet(userId: string, walletAddress: Address): void {
  const user = findUserById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  
  if (!Array.isArray(user.wallets) || user.wallets.length === 0) {
    throw new Error(`User ${userId} has no wallets`);
  }
  
  let foundDefault = false;
  
  // Update isDefault flag for all wallets
  user.wallets.forEach(wallet => {
    const isMatch = wallet.address.toLowerCase() === walletAddress.toLowerCase();
    wallet.isDefault = isMatch;
    if (isMatch) {
      foundDefault = true;
      // Also update the legacy walletAddress for backward compatibility
      user.walletAddress = wallet.address;
    }
  });
  
  if (!foundDefault) {
    throw new Error(`Wallet address ${walletAddress} not found for user ${userId}`);
  }
  
  // Save changes
  updateUser(user);
  console.log(`Set wallet ${walletAddress} as default for user ${userId}`);
}

// Initialize storage on module load
initializeStorage(); 
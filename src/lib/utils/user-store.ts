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
import { withRetry } from './retry-utils';
import { createPublicClientForSepolia } from '../client-setup';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';

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
    console.log('Decrypting private key...');
    const bytes = CryptoJS.AES.decrypt(encryptedKey, password);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    
    // Validate the decrypted string
    if (!decryptedString || decryptedString.length === 0) {
      throw new Error('Decryption resulted in empty string');
    }
    
    console.log('Decrypted key successfully. Format check...');
    
    // Format the key as a proper hex string if needed
    let formattedKey = decryptedString;
    if (!formattedKey.startsWith('0x')) {
      formattedKey = `0x${formattedKey}`;
      console.log('Added 0x prefix to key');
    }
    
    // Check if it's a valid hex string (should only contain 0-9, a-f, A-F after 0x)
    const hexRegex = /^0x[0-9a-fA-F]+$/;
    if (!hexRegex.test(formattedKey)) {
      console.error('Decrypted key is not a valid hex string:', formattedKey.substring(0, 6) + '...');
      throw new Error('Decrypted key is not a valid hex string');
    }
    
    // For a 32-byte private key, there should be 64 hex characters after 0x
    if (formattedKey.length !== 66) {
      console.warn(`Decrypted key has unusual length: ${formattedKey.length} chars (expected 66)`);
    }
    
    return formattedKey as Hex;
  } catch (error) {
    console.error('Error decrypting private key:', error);
    // Return a default key for development
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Using hardcoded test private key for development');
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
  authenticationType: 'biometric' | 'passkey' = 'biometric',
  forceCreate: boolean = false, // Add parameter to control SCA creation
  saltNonce?: bigint // Add salt nonce parameter to create different addresses
) {
  try {
    console.log(`Managing smart account for user ${userId} with ${authenticationType} authentication`);
    
    // Get the user from storage
    const user = findUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // If forceCreate is false and user already has a wallet address, return it
    if (user.walletAddress && !forceCreate) {
      console.log(`User ${userId} already has a wallet address: ${user.walletAddress}`);
      return {
        address: user.walletAddress,
        exists: true
      };
    }

    // If we're here, either we need to create a new wallet or force create was specified
    console.log(`Creating new smart account for user ${userId}`);
    
    // Get private key from the user, handle different authentication types
    let privateKey: string | undefined;
    if (authenticationType === 'biometric') {
      privateKey = user.biometricKey;
    } else if (authenticationType === 'passkey') {
      privateKey = user.socialKey;
    }

    if (!privateKey) {
      throw new Error(`No ${authenticationType} private key found for user ${userId}`);
    }
    
    // Decrypt the private key before using it
    // This is the key fix - we need to make sure the key is in the right format
    let decryptedKey: `0x${string}`;
    try {
      // Try to decrypt the key first
      decryptedKey = decryptPrivateKey(privateKey, userId);
      console.log('Successfully decrypted private key');
      
      // Check if it's a valid hex string
      if (!decryptedKey.startsWith('0x')) {
        console.log('Key is not a valid hex string, adding 0x prefix');
        decryptedKey = `0x${decryptedKey}` as `0x${string}`;
      }
      
      // Ensure correct key length
      if (decryptedKey.length !== 66) { // Should be 0x + 64 hex chars for 32 bytes
        throw new Error(`Invalid key length: ${decryptedKey.length} chars (expected 66)`);
      }
    } catch (decryptError) {
      console.error('Error decrypting private key:', decryptError);
      
      // In development, for testing, use a default key
      if (process.env.NODE_ENV !== 'production') {
        console.log('Using default testing private key in development');
        decryptedKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;
      } else {
        throw new Error(`Failed to decrypt private key: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`);
      }
    }
    
    // Create the smart account with retry logic to handle rate limits
    return await withRetry(
      async () => {
        console.log("Creating SCA with improved permissionless.js v2 implementation...");
        const result = await createPermissionlessSCA(
          userId, 
          decryptedKey, 
          updateUserWalletAddress,
          saltNonce
        );
        
        // Update the user object with the new wallet address
        if (user && result.address) {
          user.walletAddress = result.address;
          updateUser(user);
          console.log(`Updated user ${userId} with wallet address ${result.address}`);
        }
        
        return {
          ...result,
          exists: false // This is a newly created account
        };
      },
      {
        maxRetries: 5,
        initialDelay: 2000,
        maxDelay: 15000,
        backoffFactor: 2,
        retryableErrors: [
          'Too many request',
          'rate limit',
          'Rate limit',
          'too many request',
          'Too Many Requests',
          'too many requests',
          'Request failed with status code 429'
        ]
      }
    );
  } catch (error) {
    console.error('Error creating smart account from credential:', error);
    const errorDetails = error instanceof Error ? error : new Error(String(error));
    
    console.error('API: SCA creation error details:', JSON.stringify({
      message: errorDetails.message,
      stack: errorDetails.stack,
      type: 'smart_account_creation_error'
    }));
    
    throw errorDetails;
  }
}

async function createPermissionlessSCA(
  userId: string,
  privateKey: `0x${string}`,
  updateUserFn: (userId: string, walletAddress: Address, saltNonce?: bigint) => void,
  saltNonce?: bigint
) {
  try {
    console.log('Creating permissionless SCA (JS) for owner');
    
    // Create the owner account from the private key
    const owner = privateKeyToAccount(privateKey);
    console.log(`Owner EOA address: ${owner.address}`);
    
    // Get library version
    const pkgVersion = getPermissionlessVersion();
    console.log(`Permissionless version: ${pkgVersion}`);
    
    // List available account functions
    const accountFunctions = getAvailableAccountFunctions();
    console.log('Available account functions:');
    for (const fn of accountFunctions) {
      console.log(`- ${fn}`);
    }
    
    // Use Safe Smart Account
    console.log('Using accounts.toSafeSmartAccount');
    
    // Create public client with better fallback and retry
    const publicClient = createPublicClientForSepolia();
    
    // Safe account parameters
    const safeParams: any = {
      client: publicClient,
      owners: [owner],
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
    
    // Create Pimlico client for paymaster functionality
    const pimlicoApiKey = process.env.PIMLICO_API_KEY;
    if (!pimlicoApiKey) {
      throw new Error('Pimlico API key is required');
    }
    
    // Create bundler URL with our API key
    const bundlerUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${pimlicoApiKey}`;
    
    // Try multiple RPC endpoints if needed
    const pimlicoClient = await withRetry(
      async () => {
        return createPimlicoClient({
          transport: http(bundlerUrl),
          entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.6" as const,
          },
        });
      },
      {
        maxRetries: 3,
        initialDelay: 1000
      }
    );
    
    // Create the smart account client with retries
    const smartAccountClient = await withRetry(
      async () => {
        // Use any type to bypass TypeScript errors due to library version differences
        const clientConfig: any = {
          account: smartAccount,
          chain: sepolia,
          bundlerTransport: http(bundlerUrl),
          middleware: {
            sponsorUserOperation: async (args: any) => {
              try {
                if (!pimlicoClient.sponsorUserOperation) {
                  throw new Error('Pimlico client not properly initialized');
                }
                
                // Also use any for the sponsorUserOperation parameters
                const sponsorParams: any = {
                  userOperation: args.userOperation,
                  entryPoint: ENTRY_POINT_ADDRESS,
                };
                
                return await pimlicoClient.sponsorUserOperation(sponsorParams);
              } catch (err) {
                console.error('Sponsorship error:', err);
                throw err;
              }
            }
          }
        };
        
        return createSmartAccountClient(clientConfig);
      },
      {
        maxRetries: 3,
        initialDelay: 1000
      }
    );
    
    console.log('Created Smart Account Client');
    
    // Update the user's wallet address - pass the saltNonce to store with the wallet
    updateUserFn(userId, smartAccount.address, safeParams.saltNonce);
    
    // Return the smart account info
    return {
      address: smartAccount.address,
      smartAccount,
      smartAccountClient,
      publicClient,
      pimlicoClient,
      owner
    };
  } catch (error) {
    console.error('Failed to create permissionless Smart Contract Account:', error);
    throw new Error(`Failed to create Smart Contract Account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper function to get permissionless version
function getPermissionlessVersion() {
  try {
    const permissionless = require('permissionless/package.json');
    return permissionless.version;
  } catch (e) {
    return 'unknown';
  }
}

// Helper function to list available account functions
function getAvailableAccountFunctions() {
  try {
    const permissionless = require('permissionless');
    if (permissionless && permissionless.accounts) {
      return Object.keys(permissionless.accounts);
    }
    return [];
  } catch (e) {
    return [];
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
    
    // Default private key for testing (hardhat #0)
    const defaultPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
    
    // Create a mock user with encrypted keys
    const mockUser: UserAccount = {
      id: userId,
      username: `test_${userId.substring(0, 5)}`,
      authType: 'biometric',
      createdAt: new Date().getTime(),
      wallets: [], // Empty wallets array
      
      // Properly encrypt the private key using the user ID as the password
      biometricKey: encryptPrivateKey(defaultPrivateKey, userId),
      
      // Also add server key
      serverKey: encryptPrivateKey(
        defaultPrivateKey, 
        process.env.KEY_ENCRYPTION_KEY || 'default_key'
      )
    };
    
    console.log(`Created mock user with encrypted biometric key`);
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

// Add a wallet to a user
export function addWalletToUser(
  userId: string, 
  walletAddress: Address, 
  isDefault: boolean = false, 
  name: string = 'New Wallet',
  saltNonce?: bigint,
  timestamp?: number
): boolean {
  const user = findUserById(userId);
  if (!user) return false;
  
  // Initialize wallets array if it doesn't exist
  if (!Array.isArray(user.wallets)) {
    user.wallets = [];
  }
  
  // Check if the wallet already exists
  const walletExists = user.wallets.some(wallet => 
    wallet.address.toLowerCase() === walletAddress.toLowerCase()
  );
  
  if (walletExists) {
    console.log(`Wallet ${walletAddress} already exists for user ${userId}`);
    return false;
  }
  
  // If this is set as default, unset other default wallets
  if (isDefault) {
    user.wallets.forEach(wallet => wallet.isDefault = false);
  }
  
  // Add the new wallet
  const createdAt = timestamp || Date.now();
  user.wallets.push({
    address: walletAddress,
    name,
    chainId: 11155111, // Sepolia
    isDefault,
    createdAt: createdAt,
    saltNonce: saltNonce ? saltNonce.toString() : undefined
  });
  
  // For backward compatibility, also set walletAddress property
  if (isDefault || !user.walletAddress) {
    user.walletAddress = walletAddress;
  }
  
  // Save the user
  updateUser(user);
  console.log(`Added wallet ${walletAddress} to user ${userId}${saltNonce ? ` with salt nonce ${saltNonce}` : ''}, created at ${new Date(createdAt).toISOString()}`);
  return true;
}

// Update wallet address for a user - modified to handle multiple wallets
export function updateUserWalletAddress(
  userId: string, 
  walletAddress: Address, 
  saltNonce?: bigint
): void {
  const user = findUserById(userId);
  if (!user) {
    console.error(`User ${userId} not found, can't update wallet address`);
    return;
  }
  
  console.log(`updateUserWalletAddress: Adding wallet ${walletAddress} to user ${userId} with saltNonce ${saltNonce ? saltNonce.toString() : 'none'}`);
  
  // Check if this wallet address already exists (this shouldn't happen with different salt nonces)
  const walletExists = user.wallets?.some(w => w.address.toLowerCase() === walletAddress.toLowerCase());
  if (walletExists) {
    console.log(`updateUserWalletAddress: Wallet ${walletAddress} already exists for user ${userId}`);
  }
  
  // When creating a new wallet with a salt nonce, add it to the wallets array
  // with a unique timestamp to ensure it's properly sorted
  const timestamp = Date.now();
  
  // For new implementation, add to wallets array as a new wallet
  const wasAdded = addWalletToUser(
    userId, 
    walletAddress, 
    saltNonce ? false : true, // Only set as default if not creating a new wallet with salt
    saltNonce ? `New Wallet (${new Date().toLocaleTimeString()})` : 'Primary Wallet', 
    saltNonce,
    timestamp
  );
  
  // For backward compatibility, set walletAddress property if this is default or no other wallet exists
  if (!user.walletAddress || !saltNonce) {
    user.walletAddress = walletAddress;
  }
  
  updateUser(user);
  console.log(`updateUserWalletAddress: Updated user ${userId} with wallet address ${walletAddress} (default: ${!saltNonce}, timestamp: ${timestamp})`);
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
  const user = findUserById(userId);
  if (!user) {
    return undefined;
  }
  
  // First check for wallets in the wallets array
  if (user.wallets && user.wallets.length > 0) {
    // Return the default wallet if one is marked as default
    const defaultWallet = user.wallets.find(wallet => wallet.isDefault === true);
    if (defaultWallet) {
      return defaultWallet;
    }
    
    // If no wallet is marked as default, return the first one
    return user.wallets[0];
  }
  
  // If there are no wallets in the wallets array but there is a legacy walletAddress,
  // create a wallet object from it and return it
  if (user.walletAddress) {
    const legacyWallet: Wallet = {
      address: user.walletAddress,
      name: 'Primary Wallet',
      chainId: 11155111, // Sepolia
      isDefault: true,
      createdAt: user.createdAt
    };
    
    // Add this wallet to the user's wallets array for future use
    if (!user.wallets) {
      user.wallets = [];
    }
    user.wallets.push(legacyWallet);
    saveUserData();
    
    return legacyWallet;
  }
  
  return undefined;
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

// Helper function to find the next nonce value for a user
export function getNextSaltNonce(userId: string): bigint {
  const user = findUserById(userId);
  if (!user) {
    return BigInt(0);
  }
  
  // Initialize wallets array if it doesn't exist
  if (!Array.isArray(user.wallets)) {
    user.wallets = [];
  }
  
  // Find the highest salt nonce used so far
  let highestNonce = BigInt(0);
  user.wallets.forEach(wallet => {
    if (wallet.saltNonce && BigInt(wallet.saltNonce) > highestNonce) {
      highestNonce = BigInt(wallet.saltNonce);
    }
  });
  
  // Return next nonce
  return highestNonce + BigInt(1);
}

// Get the newest wallet for a user based on creation time
export function getNewestWallet(userId: string): Wallet | undefined {
  const user = findUserById(userId);
  if (!user) {
    console.log(`getNewestWallet: User ${userId} not found`);
    return undefined;
  }
  
  // First check for wallets in the wallets array
  if (user.wallets && user.wallets.length > 0) {
    console.log(`getNewestWallet: Found ${user.wallets.length} wallet(s) for user ${userId}`);
    
    // Debug: Log all wallets with creation times
    user.wallets.forEach((wallet, index) => {
      const createdDate = new Date(wallet.createdAt).toISOString();
      console.log(`getNewestWallet: Wallet #${index} - Address: ${wallet.address}, CreatedAt: ${createdDate}, SaltNonce: ${wallet.saltNonce || 'none'}`);
    });
    
    // Return the wallet with the most recent creation time
    const newestWallet = user.wallets.reduce((newest, current) => {
      if (!newest || current.createdAt > newest.createdAt) {
        return current;
      }
      return newest;
    }, undefined as Wallet | undefined);
    
    if (newestWallet) {
      console.log(`getNewestWallet: Selected newest wallet: ${newestWallet.address}, CreatedAt: ${new Date(newestWallet.createdAt).toISOString()}`);
    } else {
      console.log(`getNewestWallet: No newest wallet found despite having wallets array`);
    }
    
    return newestWallet;
  }
  
  // If there are no wallets in the wallets array but there is a legacy walletAddress,
  // create a wallet object from it and return it
  if (user.walletAddress) {
    const legacyWallet: Wallet = {
      address: user.walletAddress,
      name: 'Primary Wallet',
      chainId: 11155111, // Sepolia
      isDefault: true,
      createdAt: user.createdAt
    };
    
    // Add this wallet to the user's wallets array for future use
    if (!user.wallets) {
      user.wallets = [];
    }
    user.wallets.push(legacyWallet);
    saveUserData();
    
    return legacyWallet;
  }
  
  return undefined;
}

// Get the recovery key for a user (for returning to UI when creating additional wallets)
export async function getRecoveryKeyForUser(userId: string): Promise<string | null> {
  try {
    console.log(`Getting recovery key for user ${userId}`);
    
    // Find the user
    const user = findUserById(userId);
    if (!user) {
      console.error(`User ${userId} not found when retrieving recovery key`);
      return null;
    }
    
    // If there's no recovery key hash, there's no stored recovery key
    if (!user.recoveryKeyHash) {
      console.log(`No recovery key hash found for user ${userId}`);
      return null;
    }
    
    // In a real implementation, we would retrieve the recovery key from a secure storage
    // For development purposes, we'll simulate retrieving a recovery key
    // In production, this would be securely stored and encrypted
    if (process.env.NODE_ENV !== 'production') {
      // This is just for testing in development - in production you would use proper key retrieval
      const mockRecoveryKey = `recovery_key_for_${userId}`;
      return mockRecoveryKey;
    }
    
    // For production, we'd need a secure method to retrieve or regenerate the recovery key
    return null;
  } catch (error) {
    console.error('Error retrieving recovery key:', error);
    return null;
  }
} 
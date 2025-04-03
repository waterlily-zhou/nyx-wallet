import { randomBytes, createHash } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address, type Hex } from 'viem';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { ENTRY_POINT_ADDRESS, getActiveChain, createPublicClient as createChainPublicClient, createSafeSmartAccount, createSmartAccountClientWithPaymaster, createPimlicoClientInstance, type ClientSetup } from './client-setup';
import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createPublicClient as viemCreatePublicClient } from 'viem';
import { encryptData, decryptData, generateRandomPrivateKey, generateDistributedKeys, combineKeys, hashRecoveryKey } from './key-encryption';
import { Authenticator, EncryptedKey, AuthenticatorDevice } from '../types/credentials';

// WebAuthn settings
export const rpName = 'Nyx Wallet';
export const rpID = process.env.RP_ID || 'localhost';
export const origin = process.env.ORIGIN || `http://${rpID}:3000`;

// Storage file path
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUTHENTICATORS_FILE = path.join(DATA_DIR, 'authenticators.json');

// Types
export interface UserAccount {
  id: string;
  username: string;
  walletAddress?: Address;
  privateKey?: Hex;
  authType: 'biometric' | 'social' | 'direct';
  authenticators?: Authenticator[];
  credentials?: any[];
  createdAt: Date;
  serverKey?: string | EncryptedKey;
  recoveryKeyHash?: string;
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

// Load user data from storage
function loadUserData(): void {
  try {
    // Check if the users file exists
    if (fs.existsSync(USERS_FILE)) {
      // Read and parse the user data
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      
      // Convert ISO date strings back to Date objects
      userAccounts = parsedData.map((user: any) => ({
        ...user,
        createdAt: new Date(user.createdAt)
      }));
    } else {
      console.log('No user data file found, starting with empty user accounts');
      userAccounts = [];
      
      // Create a test user for development
      if (process.env.NODE_ENV !== 'production') {
        const testUser = createUser('test_user', 'biometric');
        testUser.serverKey = encryptPrivateKey(
          '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex, 
          process.env.KEY_ENCRYPTION_KEY || 'default_key'
        );
        saveUserData();
      }
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    userAccounts = [];
    
    // Create a test user for development
    if (process.env.NODE_ENV !== 'production') {
      const testUser = createUser('test_user', 'biometric');
      testUser.serverKey = encryptPrivateKey(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex, 
        process.env.KEY_ENCRYPTION_KEY || 'default_key'
      );
      saveUserData();
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
  
  // Use the chain-agnostic public client instead of hardcoding Sepolia
  const publicClient = createChainPublicClient();
  
  // Log which chain we're using for account creation
  const activeChain = getActiveChain();
  console.log(`Creating smart account on ${activeChain.chain.name} chain`);
  
  const smartAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    entryPoint: {
      address: ENTRY_POINT_ADDRESS,
      version: "0.6",
    },
    version: "1.4.1",
  });
  
  return {
    address: smartAccount.address,
    privateKey
  };
}

//* SIGNER 2: BIOMETRICS -> SCA
// Create a smart account from biometric or social credentials
export async function createSmartAccountFromCredential(
  userId: string, 
  authType: 'biometric' | 'social'
): Promise<{
  address: Address;
  privateKey: Hex;
  clientSetup: ClientSetup;
}> {
  // Generate distributed keys
  const { deviceKey, serverKey, recoveryKey } = generateDistributedKeys();
  
  // Store the keys securely
  await storeKeys(userId, deviceKey, serverKey, recoveryKey);
  
  // Create a deterministic key from the combined device and server keys
  const combinedKey = combineKeys(deviceKey, serverKey);
  
  // Create the owner account
  const owner = privateKeyToAccount(combinedKey);
  
  // Initialize blockchain clients
  const publicClient = createChainPublicClient();
  const pimlicoClient = createPimlicoClientInstance(process.env.PIMLICO_API_KEY || '');
  
  // Create the smart account
  const smartAccount = await createSafeSmartAccount(publicClient, owner);
  
  // Set up the smart account client with paymaster
  const activeChain = getActiveChain();
  const pimlicoUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
  
  const smartAccountClient = createSmartAccountClientWithPaymaster(
    smartAccount,
    pimlicoClient,
    pimlicoUrl
  );
  
  // Create the complete client setup
  const clientSetup: ClientSetup = {
    publicClient,
    pimlicoClient,
    owner,
    smartAccount,
    smartAccountClient
  };
  
  return {
    address: smartAccount.address,
    privateKey: combinedKey,
    clientSetup
  };
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
      createdAt: new Date(),
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
  privateKey?: Hex
): UserAccount {
  const userId = randomBytes(16).toString('hex');
  
  const user: UserAccount = {
    id: userId,
    username,
    authType,
    walletAddress,
    privateKey,
    authenticators: [],
    credentials: [],
    createdAt: new Date()
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
): Promise<void> {
  // Find the user
  const user = findUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Encrypt the server key with the master key
  user.serverKey = encryptData(serverKey);
  
  // Store a hash of the recovery key for verification
  user.recoveryKeyHash = hashRecoveryKey(recoveryKey);
  
  // Save the updated user data
  saveUserData();
  
  console.log(`Stored keys for user ${userId}`);
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

  // Decrypt server key
  let serverKey: string;
  if (typeof user.serverKey === 'string') {
    // Legacy format
    serverKey = decryptPrivateKey(user.serverKey, process.env.KEY_ENCRYPTION_KEY || '');
  } else {
    // New encrypted format
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
  
  // Initialize blockchain clients
  const publicClient = createChainPublicClient();
  const pimlicoClient = createPimlicoClientInstance(process.env.PIMLICO_API_KEY || '');
  
  // Create the smart account
  const smartAccount = await createSafeSmartAccount(publicClient, owner);
  
  // Set up the smart account client with paymaster
  const activeChain = getActiveChain();
  const pimlicoUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
  
  const smartAccountClient = createSmartAccountClientWithPaymaster(
    smartAccount,
    pimlicoClient,
    pimlicoUrl
  );
  
  return {
    smartAccount,
    smartAccountClient
  };
}

// Initialize storage on module load
initializeStorage(); 
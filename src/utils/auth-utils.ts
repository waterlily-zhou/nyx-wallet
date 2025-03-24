import { randomBytes, createHash } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address, type Hex } from 'viem';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { ENTRY_POINT_ADDRESS, getActiveChain, createPublicClient as createChainPublicClient, createSafeSmartAccount, createSmartAccountClientWithPaymaster, createPimlicoClientInstance, type ClientSetup } from './client-setup.js';
import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createPublicClient as viemCreatePublicClient } from 'viem';

// WebAuthn settings
export const rpName = 'Nyx Wallet';
export const rpID = process.env.RP_ID || 'localhost';
export const origin = process.env.ORIGIN || `http://${rpID}:3000`;

// Storage file path
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Types
export interface UserAccount {
  id: string;
  username: string;
  walletAddress?: Address;
  privateKey?: Hex;
  authType: 'biometric' | 'social' | 'direct';
  credentials?: any[];
  createdAt: Date;
  serverKey?: string;
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
  
  // Log the result
  console.log(`Loaded ${userAccounts.length} user accounts from storage`);
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
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    userAccounts = [];
  }
}

// Generate a random private key
export function generateRandomPrivateKey(): Hex {
  const privateKey = `0x${randomBytes(32).toString('hex')}` as Hex;
  return privateKey;
}

// Create a deterministic private key from a seed
export function generateDeterministicPrivateKey(seed: string): Hex {
  const hash = createHash('sha256').update(seed).digest('hex');
  return `0x${hash}` as Hex;
}

// Encrypt a private key with a password
export function encryptPrivateKey(privateKey: Hex, password: string): string {
  return CryptoJS.AES.encrypt(privateKey, password).toString();
}

// Decrypt a private key with a password
export function decryptPrivateKey(encryptedKey: string, password: string): Hex {
  const bytes = CryptoJS.AES.decrypt(encryptedKey, password);
  return bytes.toString(CryptoJS.enc.Utf8) as Hex;
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
  const combinedKey = `0x${createHash('sha256')
    .update(deviceKey + serverKey)
    .digest('hex')}` as Hex;
  
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
  return userAccounts.find(user => user.id === userId);
}

// Find a user by wallet address
export function findUserByWalletAddress(address: Address): UserAccount | undefined {
  return userAccounts.find(user => user.walletAddress?.toLowerCase() === address.toLowerCase());
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
    credentials: [],
    createdAt: new Date()
  };
  
  userAccounts.push(user);
  saveUserData(); // Save the updated user list
  return user;
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

// Update user credentials (for biometric registration)
export function updateUserCredentials(userId: string, credential: any): void {
  const user = findUserById(userId);
  
  if (!user) {
    throw new Error(`User with ID ${userId} not found`);
  }
  
  // Initialize credentials array if it doesn't exist
  if (!user.credentials) {
    user.credentials = [];
  }
  
  // Add new credential
  user.credentials.push(credential);
  
  // Save user data
  saveUserData();
  
  console.log(`Updated credentials for user ${userId}. Total credentials: ${user.credentials.length}`);
}

// Sign transaction with biometrics
export async function signTransactionWithBiometrics(
  userId: string,
  transactionHash: string,
  deviceKey: Hex
): Promise<{ signature: string }> {
  const user = findUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Get the server key
  const { serverKey } = await getKeys(userId);
  
  // Combine the keys
  const combinedKey = `0x${createHash('sha256')
    .update(deviceKey + serverKey)
    .digest('hex')}` as Hex;
  
  // Sign the transaction hash with the combined key
  const wallet = new ethers.Wallet(combinedKey);
  const messageHashBytes = ethers.utils.arrayify(transactionHash);
  const signature = await wallet.signMessage(messageHashBytes);
  
  return { signature };
}

// Generate distributed keys for a new wallet
function generateDistributedKeys(): DistributedKeys {
  // Generate three separate keys: device, server, and recovery
  const deviceKey = generateRandomPrivateKey();
  const serverKey = generateRandomPrivateKey();
  const recoveryKey = generateRandomPrivateKey();
  
  return {
    deviceKey,
    serverKey,
    recoveryKey
  };
}

// Store keys securely
async function storeKeys(
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
  
  // Store the server key with the user account
  // The device key will be stored in the authenticator
  // The recovery key should be shown to the user for backup
  user.serverKey = serverKey;
  
  // Store a hash of the recovery key for verification
  user.recoveryKeyHash = createHash('sha256')
    .update(recoveryKey.slice(2)) // Remove '0x' prefix
    .digest('hex');
  
  // Save the updated user data
  saveUserData();
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
  const serverKey = decryptPrivateKey(user.serverKey, process.env.KEY_ENCRYPTION_KEY || '');
  
  // Device key is retrieved by the client-side code
  // Return a placeholder that will be replaced by the client
  return {
    deviceKey: '0x0000000000000000000000000000000000000000000000000000000000000000',
    serverKey
  };
}

// Verify recovery key
export function verifyRecoveryKey(userId: string, recoveryKey: Hex): boolean {
  const user = findUserById(userId);
  if (!user || !user.recoveryKeyHash) {
    return false;
  }

  const providedKeyHash = createHash('sha256').update(recoveryKey).digest('hex');
  return providedKeyHash === user.recoveryKeyHash;
}

// Get the smart account client for a user
export async function getSmartAccountClient(userId: string) {
  // Find the user
  const user = findUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Get the server key
  const serverKey = user.serverKey;
  if (!serverKey) {
    throw new Error('Server key not found');
  }
  
  // Get the device key from the authenticator
  // For now, we'll use a placeholder since this will be handled by WebAuthn
  const deviceKey = serverKey; // This is temporary
  
  // Create a deterministic key from the combined device and server keys
  const combinedKey = `0x${createHash('sha256')
    .update(deviceKey + serverKey)
    .digest('hex')}` as Hex;
  
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
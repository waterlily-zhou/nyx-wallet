import { randomBytes, createHash } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address, type Hex } from 'viem';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { ENTRY_POINT_ADDRESS, getActiveChain, createPublicClient as createChainAgnosticPublicClient } from './client-setup.js';
import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';

// WebAuthn settings
export const rpName = 'Nyx Wallet';
export const rpID = process.env.RP_ID || 'localhost';
export const origin = process.env.ORIGIN || `http://${rpID}:3000`;

// Types
export interface UserAccount {
  id: string;
  username: string;
  walletAddress?: Address;
  privateKey?: Hex;
  authType: 'biometric' | 'social' | 'direct';
  credentials?: any[];
  createdAt: Date;
}

// In-memory user accounts (should be replaced with a database in production)
export const userAccounts: UserAccount[] = [];

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
  const publicClient = createChainAgnosticPublicClient();
  
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
}> {
  // Generate a deterministic key from the user ID and auth type
  const seed = `${userId}-${authType}-${process.env.KEY_SEED || 'nyx-wallet-seed'}`;
  const privateKey = generateDeterministicPrivateKey(seed);
  
  return await createSmartAccountFromPrivateKey(privateKey);
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
  return user;
}

// Update user credentials (for WebAuthn)
export function updateUserCredentials(userId: string, credential: any): UserAccount | undefined {
  const user = findUserById(userId);
  if (!user) return undefined;
  
  if (!user.credentials) {
    user.credentials = [];
  }
  
  user.credentials.push(credential);
  return user;
}

// Sign transaction with biometrics
export async function signTransactionWithBiometrics(
  userId: string,
  transactionHash: string
): Promise<{ signature: string }> {
  const user = findUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  if (!user.privateKey) {
    throw new Error('User has no private key');
  }
  
  // Sign the transaction hash with the user's private key
  const wallet = new ethers.Wallet(user.privateKey);
  const messageHashBytes = ethers.utils.arrayify(transactionHash);
  const signature = await wallet.signMessage(messageHashBytes);
  
  return { signature };
} 
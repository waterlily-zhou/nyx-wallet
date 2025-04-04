import { type Address, type Hex, createPublicClient as viemCreatePublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Constants
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

// Types
export interface ClientSetup {
  publicClient: ReturnType<typeof viemCreatePublicClient>;
  pimlicoClient: any;
  owner: ReturnType<typeof privateKeyToAccount>;
  smartAccount: any;
  smartAccountClient: any;
}

// Types for distributed key management
export interface DistributedKeys {
  deviceKey: Hex;
  serverKey: Hex;
  recoveryKey: Hex;
}

// Types for authenticator devices
export interface AuthenticatorDevice {
  id: string;
  walletAddress: Address;
  credentialID: string;
  credentialPublicKey: any;
  counter: number;
  deviceName: string;
  createdAt: Date;
  lastUsed?: Date;
}

// WebAuthn settings
export const rpName = 'Nyx Wallet';
export const rpID = process.env.RP_ID || 'localhost';
// Use a less strict origin expectation for development, supporting multiple ports
export const origin = process.env.ORIGIN || 
  (process.env.NODE_ENV === 'production' 
    ? `https://${rpID}` 
    : `http://${rpID}`); 
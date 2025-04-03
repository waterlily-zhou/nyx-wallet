import { type Address, type Hex } from 'viem';

export interface Authenticator {
  credentialID: string;        // Base64 encoded credential ID
  credentialPublicKey: Buffer; // Raw public key bytes
  counter: number;             // Current counter value
  deviceName?: string;         // User-friendly device name
  lastUsed: Date;              // Last authentication timestamp
}

export interface EncryptedKey {
  iv: string;                  // Initialization vector (Base64)
  data: string;                // Encrypted data (Base64)
  tag?: string;                // Auth tag for GCM mode (Base64)
  algorithm: string;           // Algorithm identifier
}

export interface UserKeys {
  serverKey: EncryptedKey;     // Encrypted server portion of key
  recoveryKeyHash: string;     // Hash of recovery key
}

export interface AuthenticatorDevice {
  id: string;                 // Unique identifier
  walletAddress: Address;     // Associated wallet address
  credentialID: string;       // WebAuthn credential ID
  credentialPublicKey: Buffer; // WebAuthn public key
  counter: number;            // Authentication counter
  deviceName?: string;        // User-provided device name
  createdAt: Date;            // When this authenticator was created
  lastUsed?: Date;            // Last successful authentication
}

export interface DistributedKeyData {
  deviceKey: Hex;             // Key portion stored on device (via WebAuthn)
  serverKey: Hex;             // Key portion stored on server (encrypted)
  recoveryKey: Hex;           // Recovery key (shown to user once)
} 
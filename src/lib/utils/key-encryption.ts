import { randomBytes, createCipheriv, createDecipheriv, createHash, scrypt, scryptSync, pbkdf2Sync } from 'crypto';
import { type Hex } from 'viem';
import { EncryptedKey } from '../types/credentials';

// You should store this in an environment variable
const MASTER_KEY = process.env.KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
// Additional salt for server-side key encryption
const SERVER_KEY_SALT = process.env.SERVER_KEY_SALT || 'server-key-salt-change-in-production';

// Generate a random private key
export function generateRandomPrivateKey(): Hex {
  const privateKey = randomBytes(32);
  return `0x${privateKey.toString('hex')}` as Hex;
}

// Encrypt data with AES-GCM
export function encryptData(data: string): EncryptedKey {
  // Generate a random 16-byte IV
  const iv = randomBytes(16);
  
  // Create a key buffer from the master key
  const key = createHash('sha256').update(MASTER_KEY).digest().subarray(0, 32);
  
  // Create cipher with AES-GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  // Encrypt the data
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // Get the auth tag
  const tag = cipher.getAuthTag().toString('base64');
  
  return {
    iv: iv.toString('base64'),
    data: encrypted,
    tag,
    algorithm: 'AES-256-GCM'
  };
}

// Decrypt data
export function decryptData(encryptedData: EncryptedKey): string {
  try {
    const key = createHash('sha256').update(MASTER_KEY).digest().subarray(0, 32);
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    
    // Set auth tag for GCM mode
    if (encryptedData.tag) {
      decipher.setAuthTag(Buffer.from(encryptedData.tag, 'base64'));
    }
    
    // Decrypt the data
    let decrypted = decipher.update(encryptedData.data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

// Stronger encryption specifically for server keys
export function encryptServerKey(serverKey: Hex): EncryptedKey {
  try {
    // Generate a random salt or use stored one
    const salt = Buffer.from(SERVER_KEY_SALT, 'utf-8');
    
    // Derive a stronger key using scrypt (more resistant to brute force)
    const derivedKey = scryptSync(MASTER_KEY, salt, 32);
    
    // Generate a random IV
    const iv = randomBytes(16);
    
    // Create cipher with AES-GCM
    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
    
    // Encrypt the data
    let encrypted = cipher.update(serverKey, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get the auth tag
    const tag = cipher.getAuthTag().toString('base64');
    
    return {
      iv: iv.toString('base64'),
      data: encrypted,
      tag,
      algorithm: 'AES-256-GCM-SCRYPT',
      salt: salt.toString('base64')
    };
  } catch (error) {
    console.error('Server key encryption error:', error);
    throw new Error('Failed to encrypt server key');
  }
}

// Decrypt server key with stronger protection
export function decryptServerKey(encryptedKey: EncryptedKey): Hex {
  try {
    // Get the salt (or use default if not present)
    const salt = encryptedKey.salt 
      ? Buffer.from(encryptedKey.salt, 'base64')
      : Buffer.from(SERVER_KEY_SALT, 'utf-8');
    
    // Derive the key using the same parameters
    const derivedKey = scryptSync(MASTER_KEY, salt, 32);
    
    // Get the IV
    const iv = Buffer.from(encryptedKey.iv, 'base64');
    
    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
    
    // Set auth tag
    if (encryptedKey.tag) {
      decipher.setAuthTag(Buffer.from(encryptedKey.tag, 'base64'));
    }
    
    // Decrypt
    let decrypted = decipher.update(encryptedKey.data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted as Hex;
  } catch (error) {
    console.error('Server key decryption error:', error);
    throw new Error('Failed to decrypt server key');
  }
}

// Generate distributed keys for a new wallet
export function generateDistributedKeys(): {
  deviceKey: Hex;
  serverKey: Hex;
  recoveryKey: Hex;
} {
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

/**
 * Securely combines device key and server key using PBKDF2
 */
export function combineKeys(deviceKey: Hex, serverKey: Hex): Hex {
  if (!deviceKey || !deviceKey.startsWith('0x') || deviceKey.length !== 66) {
    throw new Error('Invalid device key format');
  }
  if (!serverKey || !serverKey.startsWith('0x') || serverKey.length !== 66) {
    throw new Error('Invalid server key format');
  }

  // Remove '0x' prefix and convert to Buffer
  const deviceKeyBuffer = Buffer.from(deviceKey.slice(2), 'hex');
  const serverKeyBuffer = Buffer.from(serverKey.slice(2), 'hex');
  
  // Use PBKDF2 for secure key derivation
  const derivedKey = pbkdf2Sync(
    deviceKeyBuffer,      // password
    serverKeyBuffer,      // salt
    100000,              // iterations
    32,                  // key length
    'sha256'             // digest
  );
  
  return `0x${derivedKey.toString('hex')}` as Hex;
}

// Create a hash of a recovery key for verification
export function hashRecoveryKey(recoveryKey: Hex): string {
  return createHash('sha256')
    .update(recoveryKey.slice(2)) // Remove '0x' prefix
    .digest('hex');
}

/**
 * Encrypts a private key using AES-256-GCM
 */
export function encryptPrivateKey(privateKey: Hex, encryptionKey: string): string {
  if (!encryptionKey) {
    throw new Error('Encryption key is required');
  }
  if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error('Invalid private key format');
  }

  const iv = randomBytes(12);
  const key = createHash('sha256').update(encryptionKey).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  const privateKeyBuffer = Buffer.from(privateKey.slice(2), 'hex');
  const encrypted = Buffer.concat([
    cipher.update(privateKeyBuffer),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV, encrypted data, and auth tag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
}

/**
 * Decrypts an encrypted private key using AES-256-GCM
 */
export function decryptPrivateKey(encryptedKey: string, encryptionKey: string): Hex {
  if (!encryptionKey) {
    throw new Error('Encryption key is required');
  }
  if (!encryptedKey) {
    throw new Error('Encrypted key is required');
  }

  try {
    const combined = Buffer.from(encryptedKey, 'base64');
    const iv = combined.slice(0, 12);
    const authTag = combined.slice(-16);
    const encrypted = combined.slice(12, -16);
    
    const key = createHash('sha256').update(encryptionKey).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    const privateKey = `0x${decrypted.toString('hex')}` as Hex;
    if (privateKey.length !== 66) {
      throw new Error('Decrypted key has invalid length');
    }
    return privateKey;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to decrypt private key: ${errorMessage}`);
  }
}

/**
 * Validates that KEY_ENCRYPTION_KEY is set and has sufficient entropy
 */
export function validateKeyEncryptionKey(): void {
  const key = process.env.KEY_ENCRYPTION_KEY;
  /* console.log('KEY_ENCRYPTION_KEY:', process.env.KEY_ENCRYPTION_KEY?.length); */
  /* console.log('KEY_ENCRYPTION_KEY:', key); */
  if (!key) {
    throw new Error('KEY_ENCRYPTION_KEY environment variable is not set');
  }
  if (key.length < 32) {
    throw new Error('KEY_ENCRYPTION_KEY must be at least 32 characters long');
  }
  
  // Check that the key contains a mix of characters for sufficient entropy
  const hasUpperCase = /[A-Z]/.test(key);
  const hasLowerCase = /[a-z]/.test(key);
  const hasNumbers = /[0-9]/.test(key);
  const hasSpecial = /[^A-Za-z0-9]/.test(key);
  
  if (!(hasUpperCase && hasLowerCase && hasNumbers && hasSpecial)) {
    throw new Error('KEY_ENCRYPTION_KEY must contain a mix of uppercase, lowercase, numbers, and special characters');
  }
} 
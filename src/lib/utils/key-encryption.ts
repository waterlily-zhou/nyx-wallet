import { randomBytes, createCipheriv, createDecipheriv, createHash, scrypt, scryptSync } from 'crypto';
import { type Hex } from 'viem';
import { EncryptedKey } from '../types/credentials';

// You should store this in an environment variable
const MASTER_KEY = process.env.KEY_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
// Additional salt for server-side key encryption
const SERVER_KEY_SALT = process.env.SERVER_KEY_SALT || 'server-key-salt-change-in-production';

// Generate a random private key
export function generateRandomPrivateKey(): Hex {
  const privateKey = `0x${randomBytes(32).toString('hex')}`;
  return privateKey as Hex;
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

// Create a deterministic key from combining device and server keys
export function combineKeys(deviceKey: Hex, serverKey: Hex): Hex {
  const combinedKey = `0x${createHash('sha256')
    .update(deviceKey.slice(2) + serverKey.slice(2))
    .digest('hex')}`;
  
  return combinedKey as Hex;
}

// Create a hash of a recovery key for verification
export function hashRecoveryKey(recoveryKey: Hex): string {
  return createHash('sha256')
    .update(recoveryKey.slice(2)) // Remove '0x' prefix
    .digest('hex');
} 
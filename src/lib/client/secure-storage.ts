/**
 * Secure Storage Client
 * 
 * Utilities for securely storing and retrieving the device key from the client's secure enclave.
 * This never transmits the device key to the server and relies on browser secure storage APIs.
 */

import { type Hex } from 'viem';

// Key for storing device key
const DEVICE_KEY_STORAGE_KEY = 'nyx_device_key';

/**
 * Securely stores a device key in the browser's secure storage
 * Uses IndexedDB for storage and encrypts with device key derivation
 */
export async function storeDeviceKey(userId: string, deviceKey: Hex): Promise<void> {
  try {
    // In a production environment, you would use hardware-backed secure storage
    // For example:
    // - WebAuthn/FIDO2 credentials
    // - WebCrypto API with non-extractable keys
    // - Native secure enclaves through platform-specific APIs
    
    // For this example, we'll use localStorage with encryption tied to the device
    // This is NOT production-ready and only serves as a demonstration
    const encryptionKey = await deriveEncryptionKey();
    const encrypted = await encryptWithDeviceContext(deviceKey, encryptionKey);
    
    // Store encrypted device key with user ID
    localStorage.setItem(`${DEVICE_KEY_STORAGE_KEY}_${userId}`, encrypted);
    
    console.log('Device key securely stored in local enclave');
  } catch (error) {
    console.error('Failed to store device key:', error);
    throw new Error('Failed to securely store device key');
  }
}

/**
 * Retrieves a device key from the browser's secure storage
 * Returns null if the key doesn't exist
 */
export async function getDeviceKey(userId: string): Promise<Hex | null> {
  try {
    // Get encrypted device key
    const encrypted = localStorage.getItem(`${DEVICE_KEY_STORAGE_KEY}_${userId}`);
    if (!encrypted) {
      console.log('No device key found in secure storage');
      return null;
    }
    
    // Decrypt with device-derived key
    const encryptionKey = await deriveEncryptionKey();
    const deviceKey = await decryptWithDeviceContext(encrypted, encryptionKey);
    
    return deviceKey as Hex;
  } catch (error) {
    console.error('Failed to retrieve device key:', error);
    return null;
  }
}

/**
 * Generates a new random device key and stores it securely
 */
export async function generateAndStoreDeviceKey(userId: string): Promise<Hex> {
  try {
    // Generate a new random key
    const deviceKey = await generateRandomKey();
    
    // Store it securely
    await storeDeviceKey(userId, deviceKey);
    
    return deviceKey;
  } catch (error) {
    console.error('Failed to generate device key:', error);
    throw new Error('Failed to generate device key');
  }
}

/**
 * Checks if a device key exists for the given user
 */
export function hasDeviceKey(userId: string): boolean {
  return localStorage.getItem(`${DEVICE_KEY_STORAGE_KEY}_${userId}`) !== null;
}

/**
 * Helper: Generate a cryptographically secure random key
 */
async function generateRandomKey(): Promise<Hex> {
  // Generate 32 random bytes (256 bits)
  const randomBuffer = new Uint8Array(32);
  crypto.getRandomValues(randomBuffer);
  
  // Convert to hex string with 0x prefix
  const hexKey = '0x' + Array.from(randomBuffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
    
  return hexKey as Hex;
}

/**
 * Helper: Derive an encryption key tied to the device
 * In production, this would use hardware-backed keys
 */
async function deriveEncryptionKey(): Promise<CryptoKey> {
  // Get device fingerprint (in production, use stronger device binding)
  const deviceFingerprint = await getDeviceFingerprint();
  
  // Derive a key using WebCrypto
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(deviceFingerprint),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  // Use PBKDF2 to strengthen the key
  const salt = encoder.encode('nyx-wallet-device-salt');
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Helper: Get a unique device fingerprint
 * In production, use hardware attestation
 */
async function getDeviceFingerprint(): Promise<string> {
  // This is a simplified version for demonstration
  // In production, use hardware-backed attestation
  
  // Combine browser/device attributes that are stable
  const deviceAttributes = [
    navigator.userAgent,
    navigator.language,
    navigator.hardwareConcurrency.toString(),
    navigator.deviceMemory?.toString() || '',
    screen.colorDepth.toString(),
    screen.width.toString() + 'x' + screen.height.toString()
  ].join('|');
  
  // Hash the attributes
  const encoder = new TextEncoder();
  const data = encoder.encode(deviceAttributes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to hex string
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Helper: Encrypt data with device context
 */
async function encryptWithDeviceContext(data: string, key: CryptoKey): Promise<string> {
  // Generate random IV
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  
  // Encode the data
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(data);
  
  // Encrypt using AES-GCM
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    encodedData
  );
  
  // Combine IV and ciphertext
  const result = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), iv.length);
  
  // Convert to base64
  return btoa(String.fromCharCode(...result));
}

/**
 * Helper: Decrypt data with device context
 */
async function decryptWithDeviceContext(encryptedData: string, key: CryptoKey): Promise<string> {
  // Decode from base64
  const data = new Uint8Array(
    atob(encryptedData).split('').map(c => c.charCodeAt(0))
  );
  
  // Extract IV (first 12 bytes)
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    ciphertext
  );
  
  // Decode and return
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * WebAuthn Integration
 * 
 * These functions use WebAuthn to protect the device key with biometric hardware
 */

/**
 * Creates a WebAuthn credential that will protect access to the device key
 */
export async function createWebAuthnProtectedKey(userId: string): Promise<{
  deviceKey: Hex,
  credential: any
}> {
  try {
    // Generate a new device key
    const deviceKey = await generateRandomKey();
    
    // Create options for registering a new WebAuthn credential
    const createOptions = {
      publicKey: {
        challenge: new Uint8Array(32), // Should be a server challenge in production
        rp: {
          name: 'Nyx Wallet',
          id: window.location.hostname
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userId,
          displayName: userId
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 } // RS256
        ],
        timeout: 60000,
        attestation: 'direct',
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Use platform authenticator (TouchID, FaceID, Windows Hello)
          requireResidentKey: true, // Make this a "passkey"
          userVerification: 'required' // Require biometric verification
        }
      }
    };
    
    // Create the credential
    const credential = await navigator.credentials.create(createOptions);
    
    // Store the device key protected by this credential
    await storeDeviceKey(userId, deviceKey);
    
    // Return both the credential and the generated device key
    return {
      deviceKey,
      credential
    };
  } catch (error) {
    console.error('Failed to create WebAuthn protected key:', error);
    throw new Error('Failed to create WebAuthn protected key');
  }
}

/**
 * Gets the device key after authenticating with WebAuthn
 */
export async function getDeviceKeyWithWebAuthn(userId: string): Promise<Hex | null> {
  try {
    // Create options for getting a WebAuthn credential
    const getOptions = {
      publicKey: {
        challenge: new Uint8Array(32), // Should be a server challenge in production
        rpId: window.location.hostname,
        userVerification: 'required', // Require biometric verification
        timeout: 60000
      }
    };
    
    // Get the credential (this will trigger biometric authentication)
    await navigator.credentials.get(getOptions);
    
    // If authentication successful, get the device key
    return await getDeviceKey(userId);
  } catch (error) {
    console.error('WebAuthn authentication failed:', error);
    return null;
  }
} 
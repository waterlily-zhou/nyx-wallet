import { type Hex } from 'viem';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Key storage keys
const DEVICE_KEY_STORAGE_KEY = 'nyx_device_key';
const KEY_ENCRYPTION_KEY = 'nyx_key_encryption';

// Generate a random encryption key for the device key
async function generateEncryptionKey(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Encrypt data with a key
async function encryptData(data: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const keyBuffer = encoder.encode(key);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    dataBuffer
  );
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Decrypt data with a key
async function decryptData(encryptedData: string, key: string): Promise<string> {
  const decoder = new TextDecoder();
  const keyBuffer = new TextEncoder().encode(key);
  
  // Split IV and encrypted data
  const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );
  
  return decoder.decode(decryptedData);
}

// Store device key securely
export async function storeDeviceKey(deviceKey: Hex): Promise<void> {
  try {
    // Generate a unique encryption key for this device
    const encryptionKey = await generateEncryptionKey();
    
    // Encrypt the device key
    const encryptedKey = await encryptData(deviceKey, encryptionKey);
    
    // Store both the encrypted key and the encryption key
    if (Platform.OS === 'web') {
      // For web, use localStorage with encryption
      localStorage.setItem(DEVICE_KEY_STORAGE_KEY, encryptedKey);
      localStorage.setItem(KEY_ENCRYPTION_KEY, encryptionKey);
    } else {
      // For mobile, use SecureStore
      await SecureStore.setItemAsync(DEVICE_KEY_STORAGE_KEY, encryptedKey);
      await SecureStore.setItemAsync(KEY_ENCRYPTION_KEY, encryptionKey);
    }
  } catch (error) {
    console.error('Error storing device key:', error);
    throw new Error('Failed to store device key securely');
  }
}

// Retrieve device key securely
export async function getDeviceKey(): Promise<Hex | null> {
  try {
    let encryptedKey: string | null = null;
    let encryptionKey: string | null = null;
    
    if (Platform.OS === 'web') {
      encryptedKey = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
      encryptionKey = localStorage.getItem(KEY_ENCRYPTION_KEY);
    } else {
      encryptedKey = await SecureStore.getItemAsync(DEVICE_KEY_STORAGE_KEY);
      encryptionKey = await SecureStore.getItemAsync(KEY_ENCRYPTION_KEY);
    }
    
    if (!encryptedKey || !encryptionKey) {
      return null;
    }
    
    // Decrypt the device key
    const deviceKey = await decryptData(encryptedKey, encryptionKey);
    return deviceKey as Hex;
  } catch (error) {
    console.error('Error retrieving device key:', error);
    return null;
  }
}

// Clear device key
export async function clearDeviceKey(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(DEVICE_KEY_STORAGE_KEY);
      localStorage.removeItem(KEY_ENCRYPTION_KEY);
    } else {
      await SecureStore.deleteItemAsync(DEVICE_KEY_STORAGE_KEY);
      await SecureStore.deleteItemAsync(KEY_ENCRYPTION_KEY);
    }
  } catch (error) {
    console.error('Error clearing device key:', error);
    throw new Error('Failed to clear device key');
  }
}

// Check if device key exists
export async function hasDeviceKey(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return !!localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
    } else {
      const key = await SecureStore.getItemAsync(DEVICE_KEY_STORAGE_KEY);
      return !!key;
    }
  } catch (error) {
    console.error('Error checking device key:', error);
    return false;
  }
} 
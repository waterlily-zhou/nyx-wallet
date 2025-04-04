/**
 * Diagnostic utility for inspecting the permissionless.js module structure
 * This helps identify the correct import paths and function names
 */

/**
 * Prints the permissionless.js module structure
 */
export function inspectPermissionlessModule() {
  try {
    // Import permissionless using require (CommonJS)
    const permissionless = require('permissionless');
    
    console.log('=== PERMISSIONLESS MODULE INSPECTION ===');
    console.log('Top-level exports:');
    Object.keys(permissionless).forEach(key => {
      console.log(`- ${key}: ${typeof permissionless[key]}`);
    });
    
    // Check for accounts module
    if (permissionless.accounts) {
      console.log('\nAccounts module exports:');
      Object.keys(permissionless.accounts).forEach(key => {
        console.log(`- ${key}: ${typeof permissionless.accounts[key]}`);
      });
    } else {
      console.log('\nAccounts module not found in top-level exports');
    }
    
    // Check for createSmartAccountClient
    if (permissionless.createSmartAccountClient) {
      console.log('\nFound createSmartAccountClient at top level');
    }
    
    // Try to import accounts module directly
    try {
      const accounts = require('permissionless/accounts');
      console.log('\nDirect permissionless/accounts module exports:');
      Object.keys(accounts).forEach(key => {
        console.log(`- ${key}: ${typeof accounts[key]}`);
      });
    } catch (error) {
      console.log('\nFailed to import permissionless/accounts directly:', error.message);
    }
    
    // Try to import clients module directly
    try {
      const clients = require('permissionless/clients');
      console.log('\nDirect permissionless/clients module exports:');
      Object.keys(clients).forEach(key => {
        console.log(`- ${key}: ${typeof clients[key]}`);
      });
      
      // Check for pimlico client
      if (clients.pimlico) {
        console.log('\nPimlico client exports:');
        Object.keys(clients.pimlico).forEach(key => {
          console.log(`- ${key}: ${typeof clients.pimlico[key]}`);
        });
      }
    } catch (error) {
      console.log('\nFailed to import permissionless/clients directly:', error.message);
    }
    
    console.log('=== END OF INSPECTION ===');
    return true;
  } catch (error) {
    console.error('Failed to inspect permissionless module:', error);
    return false;
  }
}

/**
 * Attempts to create a simple Safe account using permissionless.js
 */
export async function testSafeAccountCreation() {
  try {
    // Imports
    const { privateKeyToAccount } = require('viem/accounts');
    const { createPublicClient, http } = require('viem');
    const { sepolia } = require('viem/chains');
    
    console.log('=== TESTING SAFE ACCOUNT CREATION ===');
    
    // Create a test private key and account
    const testKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const owner = privateKeyToAccount(testKey);
    console.log('Created test owner account:', owner.address);
    
    // Create public client
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http()
    });
    console.log('Created public client for Sepolia');
    
    // Try importing the necessary functions for creating a Safe account
    let safeAccountCreator;
    let createSmartAccountClient;
    
    try {
      // Try permissionless/accounts direct import first
      const accounts = require('permissionless/accounts');
      
      if (accounts.signerToSafeSmartAccount) {
        console.log('Found signerToSafeSmartAccount in permissionless/accounts');
        safeAccountCreator = accounts.signerToSafeSmartAccount;
      } else if (accounts.toSafeSmartAccount) {
        console.log('Found toSafeSmartAccount in permissionless/accounts');
        safeAccountCreator = accounts.toSafeSmartAccount;
      } else {
        console.log('SafeSmartAccount creator not found in accounts module');
      }
    } catch (error) {
      console.log('Error importing from permissionless/accounts:', error.message);
      
      // Try alternative import paths
      try {
        const permissionless = require('permissionless');
        
        if (permissionless.accounts?.signerToSafeSmartAccount) {
          console.log('Found signerToSafeSmartAccount in permissionless.accounts');
          safeAccountCreator = permissionless.accounts.signerToSafeSmartAccount;
        } else if (permissionless.accounts?.toSafeSmartAccount) {
          console.log('Found toSafeSmartAccount in permissionless.accounts');
          safeAccountCreator = permissionless.accounts.toSafeSmartAccount;
        } else if (permissionless.signerToSafeSmartAccount) {
          console.log('Found signerToSafeSmartAccount at top level');
          safeAccountCreator = permissionless.signerToSafeSmartAccount;
        } else if (permissionless.toSafeSmartAccount) {
          console.log('Found toSafeSmartAccount at top level');
          safeAccountCreator = permissionless.toSafeSmartAccount;
        } else {
          console.log('SafeSmartAccount creator not found in permissionless module');
        }
        
        if (permissionless.createSmartAccountClient) {
          console.log('Found createSmartAccountClient at top level');
          createSmartAccountClient = permissionless.createSmartAccountClient;
        }
      } catch (error) {
        console.log('Error importing from permissionless:', error.message);
      }
    }
    
    if (!safeAccountCreator) {
      console.log('Could not find any Safe account creation function');
      return false;
    }
    
    // Attempt to create a Safe account
    console.log('Attempting to create Safe account...');
    
    const result = await safeAccountCreator({
      client: publicClient,
      signer: owner,
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
      safeVersion: '1.4.1',
    });
    
    console.log('Successfully created Safe account:', result.address);
    console.log('=== END OF TESTING ===');
    return true;
  } catch (error) {
    console.error('Failed to test Safe account creation:', error);
    return false;
  }
} 
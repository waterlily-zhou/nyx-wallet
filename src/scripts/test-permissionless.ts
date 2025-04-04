import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Constants
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const TEST_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';

async function testPermissionless() {
  console.log('=== PERMISSIONLESS.JS DIRECT TEST ===');

  try {
    // Step 1: Create owner account and public client
    const owner = privateKeyToAccount(TEST_PRIVATE_KEY);
    console.log(`Created owner account: ${owner.address}`);
    
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http()
    });
    console.log('Created public client for Sepolia');
    
    // Step 2: Check module structure
    console.log('\nChecking permissionless module structure...');
    const permissionless = require('permissionless');
    console.log('Permissionless version:', permissionless.version || 'unknown');
    
    console.log('\nAvailable exports:');
    Object.keys(permissionless).forEach(key => {
      console.log(`- ${key}: ${typeof permissionless[key]}`);
    });
    
    // Step 3: Create a safe smart account
    let safeAccountFn;
    
    // Try to find the account creation function
    if (permissionless.signerToSafeSmartAccount) {
      console.log('\nUsing permissionless.signerToSafeSmartAccount');
      safeAccountFn = permissionless.signerToSafeSmartAccount;
    } else if (permissionless.createSafeSmartAccount) {
      console.log('\nUsing permissionless.createSafeSmartAccount');
      safeAccountFn = permissionless.createSafeSmartAccount;
    } else {
      // Try importing accounts submodule
      try {
        const accounts = require('permissionless/accounts');
        console.log('\nPermissionless/accounts exports:');
        Object.keys(accounts).forEach(key => {
          console.log(`- ${key}: ${typeof accounts[key]}`);
        });
        
        if (accounts.signerToSafeSmartAccount) {
          console.log('\nUsing accounts.signerToSafeSmartAccount');
          safeAccountFn = accounts.signerToSafeSmartAccount;
        } else if (accounts.toSafeSmartAccount) {
          console.log('\nUsing accounts.toSafeSmartAccount');
          safeAccountFn = accounts.toSafeSmartAccount;
        }
      } catch (error) {
        console.error('Failed to import permissionless/accounts:', error);
      }
    }
    
    if (!safeAccountFn) {
      throw new Error('Could not find any Smart Account creation function');
    }
    
    // Create the account with proper parameters
    console.log('\nCreating Safe Smart Account...');
    const accountConfig = {
      client: publicClient,
      signer: owner,
      entryPoint: ENTRY_POINT
    };
    
    console.log('Account config:', JSON.stringify({
      client: 'PublicClient [instance]',
      signer: owner.address,
      entryPoint: ENTRY_POINT
    }, null, 2));
    
    const smartAccount = await safeAccountFn(accountConfig);
    console.log('\nCreated Smart Account successfully!');
    console.log(`Smart Account address: ${smartAccount.address}`);
    
    return {
      success: true,
      address: smartAccount.address
    };
  } catch (error) {
    console.error('\nError testing permissionless.js:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Self-invoke if this script is run directly
if (require.main === module) {
  testPermissionless()
    .then(result => {
      console.log('\nTest result:', result);
      if (result.success) {
        console.log('✅ Permissionless.js is working correctly!');
      } else {
        console.log('❌ Permissionless.js test failed');
      }
    })
    .catch(error => {
      console.error('Unhandled error in test:', error);
    });
}

export default testPermissionless; 
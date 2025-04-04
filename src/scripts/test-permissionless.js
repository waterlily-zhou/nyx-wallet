// Direct permissionless.js test in JavaScript (no TypeScript)
const { createPublicClient, http } = require('viem');
const { sepolia } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

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
    
    // Try importing directly with the full module path
    try {
      console.log('\nDirectly importing from permissionless/accounts/signerToSafeSmartAccount');
      const { signerToSafeSmartAccount } = require('permissionless/accounts/signerToSafeSmartAccount');
      
      if (signerToSafeSmartAccount) {
        console.log('Found signerToSafeSmartAccount via direct import');
        safeAccountFn = signerToSafeSmartAccount;
      }
    } catch (error) {
      console.error('Error directly importing signerToSafeSmartAccount:', error.message);
    }
    
    if (!safeAccountFn) {
      throw new Error('Could not find any Smart Account creation function');
    }
    
    // Print the actual function name to confirm what we're using
    console.log(`Function name: ${safeAccountFn.name || 'anonymous'}`);
    console.log(`Function string: ${safeAccountFn.toString().substring(0, 100)}...`);
    
    // Create the account with proper parameters based on actual function signature
    console.log('\nCreating Safe Smart Account...');

    // Create an account object with the expected structure
    const ownerAccount = {
      address: owner.address,
      account: {
        address: owner.address,
        signMessage: owner.signMessage.bind(owner),
        signTransaction: owner.signTransaction?.bind(owner),
        signTypedData: owner.signTypedData?.bind(owner)
      }
    };

    const accountConfig = {
      client: publicClient,
      // Use properly structured account objects for owners
      owners: [ownerAccount],
      // Add minimal required parameters
      address: undefined, // Optional existing address
      entryPoint: ENTRY_POINT
    };

    console.log('Account config:', JSON.stringify({
      client: 'PublicClient [instance]',
      owners: [`OwnerAccount (${owner.address})`],
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
      error: error.message || String(error)
    };
  }
}

// Run the test
testPermissionless()
  .then(result => {
    console.log('\nTest result:', result);
    if (result.success) {
      console.log('✅ Permissionless.js is working correctly!');
      process.exit(0);
    } else {
      console.log('❌ Permissionless.js test failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unhandled error in test:', error);
    process.exit(1);
  }); 
// Test script for wallet creation with JavaScript
require('dotenv').config();

// Generate a random test private key
function generateRandomPrivateKey() {
  const crypto = require('crypto');
  const randomBytes = crypto.randomBytes(32);
  return '0x' + randomBytes.toString('hex');
}

async function testWalletCreation() {
  console.log('=== WALLET CREATION TEST ===');

  try {
    // Generate a test private key
    const testPrivateKey = generateRandomPrivateKey();
    console.log(`Generated test private key: ${testPrivateKey.substring(0, 10)}...`);
    
    // Import our direct JavaScript implementation
    console.log('Importing direct JavaScript implementation...');
    const { createPermissionlessSCADirectJS } = require('../lib/utils/permissionless-js-direct');
    
    // Try creating a smart account
    console.log('\nCreating Smart Contract Account...');
    const result = await createPermissionlessSCADirectJS(testPrivateKey);
    
    console.log('\n=== SUCCESS ===');
    console.log(`Smart Account address: ${result.address}`);
    console.log('Client setup created successfully');
    
    return {
      success: true,
      address: result.address
    };
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Error creating wallet:', error);
    
    // Let's provide more details about the error
    if (error.cause) {
      console.error('Caused by:', error.cause);
    }
    
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testWalletCreation()
  .then(result => {
    console.log('\nTest completed with result:', result.success ? 'SUCCESS' : 'FAILURE');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 
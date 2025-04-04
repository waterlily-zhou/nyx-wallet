// Test script for the pure JavaScript permissionless.js implementation
require('dotenv').config();

// Constants
const TEST_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';

async function testPermissionlessDirect() {
  console.log('=== PERMISSIONLESS.JS DIRECT JS IMPLEMENTATION TEST ===');

  try {
    // Import our direct JavaScript implementation
    console.log('Importing direct JavaScript implementation...');
    const { createPermissionlessSCADirectJS } = require('../lib/utils/permissionless-js-direct');
    
    // Create the smart account
    console.log('\nCreating Smart Contract Account...');
    const result = await createPermissionlessSCADirectJS(TEST_PRIVATE_KEY);
    
    console.log('\n=== SUCCESS ===');
    console.log(`Smart Account address: ${result.address}`);
    console.log('Client setup created successfully');
    
    return {
      success: true,
      address: result.address
    };
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Error testing permissionless.js direct JS:', error);
    
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
testPermissionlessDirect()
  .then(result => {
    console.log('\nTest completed with result:', result.success ? 'SUCCESS' : 'FAILURE');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 
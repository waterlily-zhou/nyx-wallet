// Test script for wallet loading
require('dotenv').config();

// Hardcoded test user ID (replace with an actual ID from your test environment)
const TEST_USER_ID = 'test_user';

// Import necessary functions
const { createSmartAccountFromCredential } = require('../lib/utils/user-store');

async function testWalletLoading() {
  console.log('=== WALLET LOADING TEST ===');

  try {
    console.log(`Loading wallet for test user: ${TEST_USER_ID}`);
    
    // Create a smart account from credential
    const result = await createSmartAccountFromCredential(TEST_USER_ID, 'biometric');
    
    console.log('\n=== SUCCESS ===');
    console.log(`Smart Account Address: ${result.address}`);
    console.log('Client setup created successfully:');
    console.log('- Public Client:', result.clientSetup.publicClient ? 'OK' : 'Missing');
    console.log('- Pimlico Client:', result.clientSetup.pimlicoClient ? 'OK' : 'Missing');
    console.log('- Smart Account:', result.clientSetup.smartAccount ? 'OK' : 'Missing');
    console.log('- Smart Account Client:', result.clientSetup.smartAccountClient ? 'OK' : 'Missing');
    
    return {
      success: true,
      address: result.address
    };
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Error loading wallet:', error);
    
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
testWalletLoading()
  .then(result => {
    console.log('\nTest completed with result:', result.success ? 'SUCCESS' : 'FAILURE');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 
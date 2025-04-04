// Test script for biometric wallet creation
require('dotenv').config();

// Generate a test user ID
function generateTestUserId() {
  return `test_user_${Date.now()}`;
}

// Generate a random device key
function generateDeviceKey() {
  const crypto = require('crypto');
  const randomBytes = crypto.randomBytes(32);
  return '0x' + randomBytes.toString('hex');
}

async function testBiometricWallet() {
  console.log('=== BIOMETRIC WALLET CREATION TEST ===');

  try {
    // Import modules from the app
    const { createUser, findUserById } = require('../lib/utils/user-store');
    const { createWallet } = require('../lib/wallet');
    
    // Create a test user
    const userId = generateTestUserId();
    console.log(`Creating test user: ${userId}`);
    const user = createUser(`Test User ${Date.now()}`, 'biometric');
    console.log(`Test user created with ID: ${user.id}`);
    
    // Generate a device key (simulating WebAuthn credential)
    const deviceKey = generateDeviceKey();
    console.log(`Generated device key: ${deviceKey.substring(0, 10)}...`);
    
    // Create a wallet with biometric method
    console.log('Creating wallet with biometric method...');
    const result = await createWallet({
      method: 'biometric',
      userId: user.id,
      deviceKey
    });
    
    console.log('\n=== SUCCESS ===');
    console.log(`Smart Account address: ${result.address}`);
    console.log('Client setup created successfully');
    
    // Verify the user has been updated with biometric key
    const updatedUser = findUserById(user.id);
    console.log('User has biometric key:', !!updatedUser.biometricKey);
    console.log('User has server key:', !!updatedUser.serverKey);
    
    return {
      success: true,
      address: result.address,
      userId: user.id
    };
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Error creating biometric wallet:', error);
    
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
testBiometricWallet()
  .then(result => {
    console.log('\nTest completed with result:', result.success ? 'SUCCESS' : 'FAILURE');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 
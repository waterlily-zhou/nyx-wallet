// Test script for wallet creation with TypeScript
import dotenv from 'dotenv';
dotenv.config();

// Importing the necessary functions
import { findUserById, createSmartAccountFromCredential } from '../lib/utils/user-store';

async function testWalletCreation() {
  console.log('=== WALLET CREATION TEST ===');

  try {
    // Use a test user ID or create a new one
    const testUserId = 'test_user';
    console.log(`Testing wallet creation for user: ${testUserId}`);
    
    // Try creating a smart account with biometric authentication
    console.log('Creating Smart Contract Account with biometric authentication...');
    const result = await createSmartAccountFromCredential(testUserId, 'biometric');
    
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
    if (error instanceof Error) {
      if ('cause' in error) {
        console.error('Caused by:', error.cause);
      }
      
      console.error('Stack trace:', error.stack);
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
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
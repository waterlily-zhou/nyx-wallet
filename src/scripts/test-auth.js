// Test script for the authentication flow
require('dotenv').config();
const fetch = require('node-fetch');

// Base URL for API requests
const API_BASE_URL = 'http://localhost:3000';

// Test constants
const TEST_USER_ID = 'test_user';
const TEST_CREDENTIAL_ID = 'test-credential-id';

async function testAuthenticationFlow() {
  console.log('=== AUTHENTICATION FLOW TEST ===');

  try {
    // Step 1: Get the authentication challenge
    console.log('\nStep 1: Getting authentication challenge...');
    const challengeResponse = await fetch(`${API_BASE_URL}/api/auth/challenge`);
    const challengeData = await challengeResponse.json();
    
    if (!challengeData.success) {
      throw new Error(`Failed to get challenge: ${challengeData.error || 'Unknown error'}`);
    }
    
    const challenge = challengeData.challenge;
    console.log(`Challenge received: ${typeof challenge === 'string' ? challenge.substring(0, 10) + '...' : 'NOT A STRING'}`);
    console.log(`Challenge type: ${typeof challenge}`);
    
    if (!challenge || typeof challenge !== 'string') {
      throw new Error(`Invalid challenge format: ${JSON.stringify(challenge)}`);
    }
    
    // Step 2: Simulate biometric authentication with the challenge
    console.log('\nStep 2: Simulating biometric authentication...');
    
    // Create a simulated WebAuthn credential response
    const simulatedCredential = {
      id: TEST_CREDENTIAL_ID,
      rawId: TEST_CREDENTIAL_ID,
      type: 'public-key',
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({
          type: 'webauthn.get',
          challenge: challenge,
          origin: 'http://localhost:3000'
        })).toString('base64'),
        authenticatorData: Buffer.from('simulated-auth-data').toString('base64'),
        signature: Buffer.from('simulated-signature').toString('base64'),
        userHandle: Buffer.from(TEST_USER_ID).toString('base64')
      }
    };
    
    // Step 3: Verify the authentication
    console.log('\nStep 3: Verifying authentication...');
    const verifyResponse = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credential: simulatedCredential
      })
    });
    
    const verifyResult = await verifyResponse.json();
    console.log('Verification result:', verifyResult);
    
    if (!verifyResult.success) {
      throw new Error(`Verification failed: ${verifyResult.error || 'Unknown error'}`);
    }
    
    console.log(`User ID from verification: ${verifyResult.userId || 'Not returned'}`);
    
    // Step 4: Load the wallet
    console.log('\nStep 4: Loading wallet...');
    const loadWalletResponse = await fetch(`${API_BASE_URL}/api/wallet/load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: verifyResult.userId || TEST_USER_ID
      })
    });
    
    const walletData = await loadWalletResponse.json();
    console.log('Wallet loading result:', walletData);
    
    if (!walletData.success) {
      throw new Error(`Failed to load wallet: ${walletData.error || 'Unknown error'}`);
    }
    
    console.log(`Wallet address: ${walletData.wallet.address}`);
    
    // Success!
    console.log('\n=== SUCCESS ===');
    console.log('Authentication flow completed successfully');
    
    return {
      success: true,
      walletAddress: walletData.wallet.address
    };
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Authentication flow error:', error);
    
    if (error.response) {
      try {
        const errorBody = await error.response.json();
        console.error('Response body:', errorBody);
      } catch (e) {
        console.error('Response body could not be parsed');
      }
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
testAuthenticationFlow()
  .then(result => {
    console.log('\nTest completed with result:', result.success ? 'SUCCESS' : 'FAILURE');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 
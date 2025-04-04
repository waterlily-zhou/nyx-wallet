// Test script for the improved permissionless.js v2 implementation
const { createPublicClient, http } = require('viem');
const { sepolia } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

// Constants
const TEST_PRIVATE_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';

async function testPermissionlessV2() {
  console.log('=== PERMISSIONLESS.JS V2 IMPLEMENTATION TEST ===');

  try {
    // Step 1: Create owner account and public client
    const owner = privateKeyToAccount(TEST_PRIVATE_KEY);
    console.log(`Created owner account: ${owner.address}`);
    
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http()
    });
    console.log('Created public client for Sepolia');
    
    // Step 2: Compile TypeScript file and import dynamically
    console.log('\nCompiling TypeScript and importing permissionless-v2 implementation...');
    
    // Execute TypeScript compilation
    console.log('Compiling TypeScript...');
    require('child_process').execSync('npx tsc src/lib/utils/permissionless-v2.ts --outDir dist --esModuleInterop', { stdio: 'inherit' });
    
    // Import the compiled JavaScript file
    console.log('Importing compiled module...');
    const { createPermissionlessSCAv2 } = require('../../dist/lib/utils/permissionless-v2');
    
    // Step 3: Create the smart account
    console.log('\nCreating Smart Contract Account...');
    const result = await createPermissionlessSCAv2(TEST_PRIVATE_KEY);
    
    console.log('\n=== SUCCESS ===');
    console.log(`Smart Account address: ${result.address}`);
    console.log('Client setup created successfully');
    
    return {
      success: true,
      address: result.address
    };
  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Error testing permissionless.js v2:', error);
    
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
testPermissionlessV2()
  .then(result => {
    console.log('\nTest completed with result:', result.success ? 'SUCCESS' : 'FAILURE');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 
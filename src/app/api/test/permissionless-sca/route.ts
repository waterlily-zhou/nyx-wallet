import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address, type Hex } from 'viem';

export async function GET(request: NextRequest) {
  const results: any[] = [];
  
  function log(message: string) {
    console.log(message);
    results.push({ message });
  }
  
  try {
    log('Starting permissionless-sca direct test...');
    
    // Step 1: Import the function directly to avoid any issues with dynamic imports
    log('Importing createPermissionlessSCA function...');
    const { createPermissionlessSCA } = require('@/lib/utils/permissionless-sca');
    log('Import successful');
    
    // Step 2: Create a test private key and account
    const testKey = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
    const owner = privateKeyToAccount(testKey);
    log(`Created test owner account: ${owner.address}`);
    
    // Step 3: Check permissionless module structure
    log('Examining permissionless module structure...');
    const permissionless = require('permissionless');
    
    // Log available exports from permissionless
    log('Permissionless exports:');
    Object.keys(permissionless).forEach(key => {
      log(`- ${key}: ${typeof permissionless[key]}`);
    });
    
    // Check for signerToSafeSmartAccount specifically
    if (permissionless.signerToSafeSmartAccount) {
      log('Found signerToSafeSmartAccount at top level');
    } else if (permissionless.accounts?.signerToSafeSmartAccount) {
      log('Found signerToSafeSmartAccount in accounts submodule');
    } else {
      log('signerToSafeSmartAccount not found - this is the recommended function for permissionless.js v0.2.x');
    }
    
    // Log viem version
    const viemVersion = require('viem/package.json').version;
    log(`Using viem version: ${viemVersion}`);
    
    // Log permissionless version
    try {
      const permissionlessVersion = require('permissionless/package.json').version;
      log(`Using permissionless version: ${permissionlessVersion}`);
    } catch (err) {
      log(`Couldn't determine permissionless version: ${err instanceof Error ? err.message : String(err)}`);
    }
    
    // Check submodule exports
    try {
      const accounts = require('permissionless/accounts');
      log('Permissionless/accounts exports:');
      Object.keys(accounts).forEach(key => {
        log(`- ${key}: ${typeof accounts[key]}`);
      });
    } catch (err) {
      log(`Error importing permissionless/accounts: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const clients = require('permissionless/clients');
      log('Permissionless/clients exports:');
      Object.keys(clients).forEach(key => {
        log(`- ${key}: ${typeof clients[key]}`);
      });
      
      // Check for pimlico client
      if (clients.pimlico) {
        log('Permissionless/clients/pimlico exports:');
        Object.keys(clients.pimlico).forEach(key => {
          log(`- ${key}: ${typeof clients.pimlico[key]}`);
        });
      }
    } catch (err) {
      log(`Error importing permissionless/clients: ${err instanceof Error ? err.message : String(err)}`);
    }
    
    // Step 4: Attempt to create SCA with detailed logging
    log('Attempting to create SCA directly...');
    try {
      const result = await createPermissionlessSCA(testKey);
      log(`Successfully created SCA with address: ${result.address}`);
      
      return NextResponse.json({ 
        success: true, 
        message: 'Successfully created SCA',
        address: result.address,
        results 
      });
    } catch (scaError) {
      log(`Failed to create SCA: ${scaError instanceof Error ? scaError.message : String(scaError)}`);
      if (scaError instanceof Error && scaError.stack) {
        log(`Error stack: ${scaError.stack}`);
      }
      
      // Attempt to determine if this is a permissionless.js issue
      if (scaError instanceof Error && scaError.message.includes('permissionless')) {
        log('This appears to be an issue with permissionless.js library');
      } else if (scaError instanceof Error && scaError.message.includes('viem')) {
        log('This appears to be an issue with viem library or compatibility');
      }
      
      return NextResponse.json({ 
        success: false, 
        error: scaError instanceof Error ? scaError.message : String(scaError),
        results 
      }, { status: 500 });
    }

    // Try to directly use signerToSafeSmartAccount as a final verification
    log('Attempting direct call to signerToSafeSmartAccount...');
    try {
      // Try to import and use signerToSafeSmartAccount directly
      let createFn;
      const accounts = require('permissionless/accounts');
      
      if (accounts.signerToSafeSmartAccount) {
        createFn = accounts.signerToSafeSmartAccount;
        log('Using accounts.signerToSafeSmartAccount');
      } else if (accounts.toSafeSmartAccount) {
        createFn = accounts.toSafeSmartAccount;
        log('Using accounts.toSafeSmartAccount');
      } else if (permissionless.signerToSafeSmartAccount) {
        createFn = permissionless.signerToSafeSmartAccount;
        log('Using permissionless.signerToSafeSmartAccount');
      } else {
        log('No direct Smart Account creation function found');
        // Try importing directly
        try {
          const { signerToSafeSmartAccount } = require('permissionless/accounts/signerToSafeSmartAccount');
          createFn = signerToSafeSmartAccount;
          log('Found signerToSafeSmartAccount via direct import');
        } catch (directError) {
          log(`Direct import failed: ${directError instanceof Error ? directError.message : String(directError)}`);
        }
      }
      
      if (createFn) {
        // Create a public client
        const { createPublicClient, http } = require('viem');
        const { sepolia } = require('viem/chains');
        
        const publicClient = createPublicClient({
          chain: sepolia,
          transport: http()
        });
        
        log('Calling Smart Account creation function directly...');
        
        // Construct the minimal config object
        const config = {
          client: publicClient,
          signer: owner,
          entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
        };
        
        log(`Direct call config: ${JSON.stringify({
          client: 'PublicClient instance',
          signer: owner.address,
          entryPoint: config.entryPoint
        }, null, 2)}`);
        
        const result = await createFn(config);
        log(`Direct call SUCCESSFUL! Created account address: ${result.address}`);
      } else {
        log('Could not find a Smart Account creation function to test directly');
      }
    } catch (directError) {
      log(`Direct call FAILED: ${directError instanceof Error ? directError.message : String(directError)}`);
      if (directError instanceof Error && directError.stack) {
        log(`Direct call error stack: ${directError.stack}`);
      }
    }
  } catch (error) {
    log(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      log(`Error stack: ${error.stack}`);
    }
    
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      results 
    }, { status: 500 });
  }
} 
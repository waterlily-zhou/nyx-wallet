import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Constants
const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

export async function GET(request: NextRequest) {
  const results: any[] = [];
  
  function log(message: string) {
    console.log(message);
    results.push({ message });
  }
  
  try {
    log('Starting permissionless.js diagnostic test');
    
    // Step 1: Check if permissionless.js is installed and accessible
    let permissionless;
    try {
      permissionless = require('permissionless');
      log('Successfully imported permissionless module');
      log(`Permissionless version: ${permissionless.version || 'unknown'}`);
      
      // Log the structure of the permissionless object
      log('Permissionless module structure:');
      for (const key in permissionless) {
        log(`  - ${key}: ${typeof permissionless[key]}`);
        
        // If this is the accounts object, dive deeper
        if (key === 'accounts' && permissionless[key]) {
          log('    Accounts module structure:');
          for (const accountKey in permissionless.accounts) {
            log(`      - ${accountKey}: ${typeof permissionless.accounts[accountKey]}`);
          }
        }
      }
    } catch (error) {
      log(`Failed to import permissionless: ${error instanceof Error ? error.message : String(error)}`);
      return NextResponse.json({ success: false, error: 'Failed to import permissionless', results });
    }
    
    // Step 2: Check for viem compatibility
    try {
      const viemVersion = require('viem/package.json').version;
      log(`Viem version: ${viemVersion}`);
      
      // Check for potential version conflicts
      if (viemVersion.startsWith('2.7')) {
        log('Viem version 2.7.x is being used, which may have compatibility issues with permissionless 0.2.x');
      }
    } catch (error) {
      log(`Failed to check viem version: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Step 3: Try to locate the toSafeSmartAccount function
    let toSafeSmartAccountFn;
    try {
      if (permissionless.accounts && permissionless.accounts.toSafeSmartAccount) {
        toSafeSmartAccountFn = permissionless.accounts.toSafeSmartAccount;
        log('Found toSafeSmartAccount in permissionless.accounts');
      } else if (permissionless.toSafeSmartAccount) {
        toSafeSmartAccountFn = permissionless.toSafeSmartAccount;
        log('Found toSafeSmartAccount directly in permissionless');
      } else {
        // Try alternative import paths
        try {
          const accountsModule = require('permissionless/accounts');
          log('Successfully imported permissionless/accounts module');
          
          if (accountsModule.toSafeSmartAccount) {
            toSafeSmartAccountFn = accountsModule.toSafeSmartAccount;
            log('Found toSafeSmartAccount in permissionless/accounts');
          } else if (accountsModule.safeAccount) {
            toSafeSmartAccountFn = accountsModule.safeAccount;
            log('Found safeAccount in permissionless/accounts, trying this as alternative');
          } else {
            log('Module structure of permissionless/accounts:');
            for (const key in accountsModule) {
              log(`  - ${key}: ${typeof accountsModule[key]}`);
            }
            throw new Error('toSafeSmartAccount or safeAccount not found in accounts module');
          }
        } catch (importError) {
          log(`Failed alternative import: ${importError instanceof Error ? importError.message : String(importError)}`);
          throw new Error('Could not find toSafeSmartAccount in any expected location');
        }
      }
    } catch (error) {
      log(`Failed to locate toSafeSmartAccount: ${error instanceof Error ? error.message : String(error)}`);
      return NextResponse.json({ success: false, error: 'Failed to locate toSafeSmartAccount', results });
    }
    
    // Step 4: Create a test owner account
    try {
      const testKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
      const owner = privateKeyToAccount(testKey);
      log(`Created test owner account: ${owner.address}`);
      
      // Step 5: Create a public client
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http()
      });
      log('Created public client for Sepolia');
      
      // Step 6: Try to create a Safe Smart Account
      try {
        log('Attempting to create Safe Smart Account...');
        log('Function signature check:');
        log(`toSafeSmartAccountFn is type: ${typeof toSafeSmartAccountFn}`);
        
        // Inspect function parameters
        const fnString = toSafeSmartAccountFn.toString().slice(0, 150) + '...';
        log(`Function definition: ${fnString}`);
        
        // Attempt to create the account with explicit parameter object
        const smartAccount = await toSafeSmartAccountFn({
          client: publicClient,
          owners: [owner],
          entryPoint: {
            address: ENTRY_POINT_ADDRESS,
            version: "0.6",
          },
          version: "1.4.1",
        });
        
        log(`Successfully created Smart Account with address: ${smartAccount.address}`);
        
        return NextResponse.json({ 
          success: true, 
          message: 'Successfully created Safe Smart Account',
          address: smartAccount.address,
          results
        });
      } catch (safeError) {
        log(`Failed to create Safe Smart Account: ${safeError instanceof Error ? safeError.message : String(safeError)}`);
        log(`Error stack: ${safeError instanceof Error ? safeError.stack : 'No stack trace'}`);
        return NextResponse.json({ success: false, error: 'Failed to create Safe Smart Account', results });
      }
    } catch (error) {
      log(`Failed to set up test environment: ${error instanceof Error ? error.message : String(error)}`);
      return NextResponse.json({ success: false, error: 'Failed to set up test environment', results });
    }
  } catch (error) {
    log(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ success: false, error: 'Unhandled error', results });
  }
} 
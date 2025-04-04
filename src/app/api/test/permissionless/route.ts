import { NextRequest, NextResponse } from 'next/server';
import { inspectPermissionlessModule, testSafeAccountCreation } from '@/lib/utils/permissionless-diagnostic';

export async function GET(request: NextRequest) {
  try {
    const results: any[] = [];
    
    function log(message: string) {
      console.log(message);
      results.push({ message });
    }
    
    log('Starting permissionless.js diagnostics...');
    
    // Step 1: Get viem version
    try {
      const viemVersion = require('viem/package.json').version;
      log(`Detected viem version: ${viemVersion}`);
    } catch (error) {
      log(`Failed to get viem version: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Step 2: Get permissionless version
    try {
      const permissionlessVersion = require('permissionless/package.json').version;
      log(`Detected permissionless version: ${permissionlessVersion}`);
    } catch (error) {
      log(`Failed to get permissionless version: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Step 3: Inspect module structure
    log('Inspecting permissionless module structure...');
    const inspectionSuccess = inspectPermissionlessModule();
    log(`Module inspection ${inspectionSuccess ? 'successful' : 'failed'}`);
    
    // Step 4: Test account creation
    log('Testing Safe account creation...');
    const testSuccess = await testSafeAccountCreation();
    log(`Account creation test ${testSuccess ? 'successful' : 'failed'}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Diagnostics completed',
      viem: require('viem/package.json').version,
      permissionless: require('permissionless/package.json').version,
      results
    });
  } catch (error) {
    console.error('Error in permissionless diagnostics:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
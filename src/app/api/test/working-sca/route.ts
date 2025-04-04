import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { type Hex } from 'viem';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing working-sca implementation...');
    
    // Step 1: Create a test private key
    const testKey = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
    const owner = privateKeyToAccount(testKey);
    console.log(`Created test owner account: ${owner.address}`);
    
    // Step 2: Import the createWorkingSCA function directly
    const { createWorkingSCA } = require('@/lib/utils/working-sca');
    
    // Step 3: Create the smart account
    console.log('Creating SCA with working implementation...');
    const result = await createWorkingSCA(testKey);
    
    console.log(`Successfully created SCA with address: ${result.address}`);
    
    return NextResponse.json({
      success: true,
      message: 'Smart Contract Account created successfully',
      address: result.address,
      owner: owner.address
    });
  } catch (error) {
    console.error('Error creating SCA:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
} 
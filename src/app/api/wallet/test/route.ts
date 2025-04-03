import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { createSafeSmartAccount, createChainPublicClient } from '@/lib/client-setup';

export async function GET(req: NextRequest) {
  try {
    console.log('Testing wallet creation');
    
    // Use a simple hardcoded private key for testing
    const ownerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const owner = privateKeyToAccount(ownerPrivateKey as `0x${string}`);
    
    console.log('Created owner account:', owner.address);
    
    // Create public client
    const publicClient = createChainPublicClient();
    console.log('Created public client');
    
    // Create smart account
    const smartAccount = await createSafeSmartAccount(publicClient, owner);
    console.log('Created smart account with address:', smartAccount.address);
    
    return NextResponse.json({ 
      success: true,
      address: smartAccount.address,
      owner: owner.address,
    });
  } catch (error) {
    console.error('Error in test wallet creation:', error instanceof Error ? error.message : error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
    
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    }, { status: 500 });
  }
} 
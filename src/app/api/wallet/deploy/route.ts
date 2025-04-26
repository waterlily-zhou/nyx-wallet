import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { handleDeploymentBeforeTransaction } from '@/lib/wallet/deploy';
import { getServerClient } from '@/lib/supabase/server';
import { ClientSetup, createPublicClientForSepolia } from '@/lib/wallet/client';
import { formatEther } from 'viem';

export async function POST(request: NextRequest) {
  try {
    const { userId, walletAddress, deviceKey } = await request.json();
    
    if (!userId || !walletAddress || !deviceKey) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required parameters',
          logs: ['❌ Missing required parameters for deployment']
        }, 
        { status: 400 }
      );
    }
    
    const logs: string[] = [];
    logs.push(`Starting deployment process for wallet ${walletAddress}`);
    
    // Get the server key from the database
    const supabase = getServerClient();
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('server_key_encrypted')
      .eq('id', userId)
      .single();
    
    if (userError || !userData) {
      logs.push(`❌ Failed to retrieve user data: ${userError?.message || 'User not found'}`);
      return NextResponse.json({ 
        success: false, 
        error: userError?.message || 'User not found',
        logs 
      }, { status: 404 });
    }
    
    if (!userData.server_key_encrypted) {
      logs.push('❌ Server key not found for user');
      return NextResponse.json({ 
        success: false, 
        error: 'Server key not found',
        logs 
      }, { status: 400 });
    }
    
    logs.push('Decrypting server key');
    const serverKey = decryptServerKey(userData.server_key_encrypted);
    
    // Combine the device key and server key
    logs.push('Combining device key and server key to create the DKG key');
    const combinedKey = combineKeys(deviceKey, serverKey);
    
    // Check ETH balance
    logs.push(`Checking ETH balance for ${walletAddress}`);
    const publicClient = createPublicClientForSepolia();
    const balance = await publicClient.getBalance({ address: walletAddress as `0x${string}` });
    logs.push(`Current balance: ${formatEther(balance)} ETH`);
    
    if (balance === 0n) {
      logs.push('❌ No ETH found in wallet. Smart account needs funds for deployment.');
      return NextResponse.json({ 
        success: false, 
        message: 'Smart account needs ETH for deployment',
        logs 
      }, { status: 400 });
    }
    
    // Setup the client
    const clientSetup: ClientSetup = {
      publicClient,
      privateKey: combinedKey,
      address: walletAddress as `0x${string}`,
    };
    
    // Deploy the smart account
    logs.push('Deploying smart account...');
    const deployResult = await handleDeploymentBeforeTransaction(clientSetup);
    
    if (deployResult.success) {
      logs.push('✅ Deployment transaction sent successfully');
      logs.push('Transaction hash: ' + deployResult.txHash);
      
      // Return success
      return NextResponse.json({ 
        success: true, 
        txHash: deployResult.txHash,
        logs 
      });
    } else {
      logs.push(`❌ Deployment failed: ${deployResult.error}`);
      return NextResponse.json({ 
        success: false, 
        message: deployResult.error,
        logs 
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Deployment error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      logs: [`❌ Deployment error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    }, { status: 500 });
  }
}

// Function to combine the device key and server key using SHA-256
function combineKeys(deviceKey: string, serverKey: string): string {
  return createHash('sha256')
    .update(deviceKey + serverKey)
    .digest('hex');
}

// Function to decrypt the server key (placeholder - implement actual decryption)
function decryptServerKey(encryptedKey: string): string {
  // TODO: Implement actual decryption logic
  // For now, just return the encrypted key as is (assuming it's stored in plaintext for demo)
  return encryptedKey;
} 
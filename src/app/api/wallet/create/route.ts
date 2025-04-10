import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { type Address } from 'viem';
import { 
  findUserById, 
  createSmartAccountFromCredential,
  getOrCreateDKGKeysForUser
} from '@/lib/utils/user-store';
import { generateRandomPrivateKey, generateDistributedKeys, encryptPrivateKey } from '@/lib/utils/key-encryption';
import { supabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Wallet creation endpoint called');
    
    const body = await request.json();
    const { userId, deviceKey, forceCreate = false, createNewWallet = false, randomSalt, useExistingCredential = false } = body;
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required userId parameter' 
      }, { status: 400 });
    }
    
    console.log(`API: Creating wallet for user ${userId}. Force create: ${forceCreate}, Create new wallet: ${createNewWallet}, Use existing credential: ${useExistingCredential}`);
    
    // Get user from Supabase
    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Check if user already has a wallet and we're not forcing creation or creating a new wallet
    if (user.wallets.length > 0 && !forceCreate && !createNewWallet) {
      const defaultWallet = user.wallets.find(w => w.isDefault) || user.wallets[0];
      console.log(`API: User ${userId} already has a wallet: ${defaultWallet.address}`);
      
      // If using existing credential, we still need to generate and return a recovery key
      if (useExistingCredential) {
        console.log('API: Generating recovery key for existing wallet...');
        const { recoveryKey } = generateDistributedKeys();
        return NextResponse.json({ 
          success: true, 
          walletAddress: defaultWallet.address,
          message: 'Existing wallet found',
          isExistingWallet: true,
          recoveryKey: recoveryKey // Include recovery key even for existing wallet
        });
      }
      
      return NextResponse.json({ 
        success: true, 
        walletAddress: defaultWallet.address,
        message: 'Existing wallet found',
        isExistingWallet: true
      });
    }

    let keys;
    if (useExistingCredential) {
      // If using existing credential, generate new DKG keys
      console.log('API: Using existing WebAuthn credential for DKG');
      const { deviceKey, serverKey, recoveryKey } = generateDistributedKeys();
      console.log('API: Generated DKG keys - recovery key available:', !!recoveryKey);
      
      // Store the server key
      const serverKeyEncrypted = encryptPrivateKey(serverKey, process.env.KEY_ENCRYPTION_KEY || '');
      const { error: updateError } = await supabase
        .from('users')
        .update({
          server_key_encrypted: serverKeyEncrypted
        })
        .eq('id', userId);
        
      if (updateError) {
        console.error('API: Error storing server key:', updateError);
        throw new Error('Failed to store server key');
      }
      
      keys = { deviceKey, serverKey, recoveryKey, isNew: true };
      console.log('API: Keys prepared for response, isNew:', keys.isNew);
    } else {
      // Check for device key - critical for DKG
      if (!deviceKey) {
        console.warn('Missing device key in wallet creation request');
        return NextResponse.json({ 
          success: false, 
          error: 'Device key is required for DKG wallet creation. You must update your client to the latest version.',
          needsDeviceKey: true
        }, { status: 400 });
      }
      
      // Generate or get existing DKG keys
      console.log('API: Getting or creating DKG keys');
      keys = await getOrCreateDKGKeysForUser(userId, deviceKey);
    }
    
    // If we're creating a new wallet with existing keys, 
    // we need to use a different salt nonce
    let saltNonce;
    if (createNewWallet && user.wallets.length > 0) {
      // If a random salt is provided, use it directly
      if (randomSalt) {
        saltNonce = BigInt(randomSalt);
        console.log(`API: Using provided random salt nonce: ${saltNonce}`);
      } else {
        // Generate a random salt nonce between 1 and 1,000,000
        saltNonce = BigInt(Math.floor(Math.random() * 1000000) + 1);
        console.log(`API: Creating new wallet with random salt nonce: ${saltNonce}`);
      }
    }
    
    // Create the smart account
    try {
      console.log(`API: Creating smart account for user ${userId}`);
      const result = await createSmartAccountFromCredential(
        userId, 
        keys.deviceKey,
        'biometric',
        forceCreate || createNewWallet,
        saltNonce
      );
      
      if (!result || !result.address) {
        throw new Error('Failed to create smart account: No address returned');
      }
      
      const isExistingWallet = result.exists === true;
      console.log(`API: Smart account ${isExistingWallet ? 'retrieved' : 'created'} with address ${result.address}`);
      console.log('API: Preparing response - keys.isNew:', keys.isNew, 'recoveryKey present:', !!keys.recoveryKey);
      
      // Update session cookies
      const cookieStore = cookies();
      cookieStore.set('session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });
      
      cookieStore.set('walletAddress', result.address as string, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours
      });
      
      console.log(`API: Responding with wallet address ${result.address} (isExistingWallet: ${isExistingWallet})`);
      
      return NextResponse.json({
        success: true,
        walletAddress: result.address,
        recoveryKey: keys.isNew ? keys.recoveryKey : undefined,
        isExistingWallet: isExistingWallet || false,
        message: isExistingWallet 
          ? 'Existing wallet found' 
          : 'New wallet created successfully'
      });
    } catch (error) {
      console.error('API: Error creating smart account:', error);
      return NextResponse.json({ 
        success: false, 
        error: `Failed to create smart account: ${error instanceof Error ? error.message : String(error)}` 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('API: Wallet creation error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

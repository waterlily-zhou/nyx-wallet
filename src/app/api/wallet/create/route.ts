import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { type Address } from 'viem';
import { 
  findUserById, 
  createSmartAccountFromCredential,
  storeKeys,
  getNextSaltNonce
} from '@/lib/utils/user-store';
import { generateRandomPrivateKey } from '@/lib/utils/key-encryption';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Wallet creation endpoint called');
    
    const body = await request.json();
    const { userId, forceCreate = false, createNewWallet = false, randomSalt } = body;
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required userId parameter' 
      }, { status: 400 });
    }
    
    console.log(`API: Creating wallet for user ${userId}. Force create: ${forceCreate}, Create new wallet: ${createNewWallet}, Random salt: ${randomSalt}`);
    
    // Get user from storage
    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Check if user already has a wallet and we're not forcing creation or creating a new wallet
    if (user.walletAddress && !forceCreate && !createNewWallet) {
      console.log(`API: User ${userId} already has a wallet: ${user.walletAddress}`);
      return NextResponse.json({ 
        success: true, 
        walletAddress: user.walletAddress,
        message: 'Existing wallet found',
        isExistingWallet: true
      });
    }
    
    // Generate keys if needed (for new wallets)
    // Skip if we're using an existing credential that already has keys
    let recoveryKey;
    
    if (!user.biometricKey) {
      console.log(`API: Generating new keys for user ${userId}`);
      const deviceKey = generateRandomPrivateKey();
      const serverKey = generateRandomPrivateKey();
      recoveryKey = generateRandomPrivateKey();
      
      // Store the keys
      await storeKeys(userId, deviceKey, serverKey, recoveryKey);
      
      console.log('API: Keys generated and stored');
    } else {
      console.log(`API: Using existing biometric key for user ${userId}`);
    }
    
    // If we're creating a new wallet with an existing biometric key, 
    // we need to use a different salt nonce
    let saltNonce;
    if (createNewWallet && user.walletAddress) {
      // If a random salt is provided, use it directly
      if (randomSalt) {
        saltNonce = BigInt(randomSalt);
        console.log(`API: Using provided random salt nonce: ${saltNonce}`);
      } else {
        saltNonce = getNextSaltNonce(userId);
        console.log(`API: Creating new wallet with salt nonce: ${saltNonce}`);
      }
      
      // FORCE a non-zero value to ensure we get a new address
      if (saltNonce === BigInt(0)) {
        saltNonce = BigInt(Math.floor(Math.random() * 1000000) + 1);
        console.log(`API: Forcing non-zero salt nonce: ${saltNonce}`);
      }
    }
    
    // Create the smart account
    try {
      console.log(`API: Creating smart account for user ${userId}`);
      const result = await createSmartAccountFromCredential(
        userId, 
        'biometric', 
        forceCreate || createNewWallet,
        saltNonce
      );
      
      if (!result || !result.address) {
        throw new Error('Failed to create smart account: No address returned');
      }
      
      const isExistingWallet = result.exists === true;
      console.log(`API: Smart account ${isExistingWallet ? 'retrieved' : 'created'} with address ${result.address}`);
      
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
        recoveryKey,
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
      error: error instanceof Error ? error.message : 'Unknown error creating wallet' 
    }, { status: 500 });
  }
}

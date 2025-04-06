import { NextRequest, NextResponse } from 'next/server';
import { findUserById, getNewestWallet } from '@/lib/utils/user-store';
import { createPublicClientForSepolia } from '@/lib/client-setup';

export async function POST(request: NextRequest) {
  try {
    console.log('API: Wallet creation-status endpoint called');
    
    const body = await request.json();
    const { userId, createNewWallet = false } = body;
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required userId parameter' 
      }, { status: 400 });
    }
    
    console.log(`API: Checking wallet creation status for user ${userId}, createNewWallet: ${createNewWallet}`);
    
    // Get user from storage
    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // If we're checking for a new wallet, look at the newest wallet instead
    // of the default one (which is typically the first/oldest wallet)
    let walletAddress;
    
    if (createNewWallet) {
      const newestWallet = getNewestWallet(userId);
      if (newestWallet) {
        walletAddress = newestWallet.address;
        console.log(`API: Found newest wallet address: ${walletAddress}`);
        console.log(`API: Wallet details: ${JSON.stringify({
          address: newestWallet.address,
          createdAt: newestWallet.createdAt,
          saltNonce: newestWallet.saltNonce
        })}`);
      } else {
        console.log(`API: No newest wallet found for user ${userId}`);
      }
    } else {
      walletAddress = user.walletAddress;
      console.log(`API: Using default wallet address: ${walletAddress}`);
    }
    
    // Debug - log all wallets for this user
    if (user.wallets && user.wallets.length > 0) {
      console.log(`API: User has ${user.wallets.length} wallet(s):`);
      user.wallets.forEach((wallet, index) => {
        console.log(`API: Wallet #${index}: ${wallet.address}, created: ${new Date(wallet.createdAt).toISOString()}, saltNonce: ${wallet.saltNonce || 'none'}`);
      });
    } else {
      console.log(`API: User has no wallets array or it's empty`);
    }
    
    // If user already has a wallet address in our records, verify it on-chain
    if (walletAddress) {
      console.log(`API: Checking wallet address: ${walletAddress}`);
      
      try {
        // Create a client to check on-chain status
        const publicClient = createPublicClientForSepolia();
        
        // Check if the wallet contract exists on-chain
        const code = await publicClient.getBytecode({
          address: walletAddress
        });
        
        // If code is null or '0x', the contract doesn't exist on-chain
        const contractExists = code !== null && code !== '0x';
        console.log(`API: Wallet contract exists on-chain: ${contractExists}`);
        
        if (contractExists) {
          // Wallet exists on-chain, finalization is complete
          return NextResponse.json({
            success: true,
            isCreating: false,
            isCreated: true,
            wallet: {
              address: walletAddress,
              isNewWallet: createNewWallet
            },
            message: createNewWallet 
              ? 'New wallet has been created and deployed on-chain' 
              : 'Wallet has been created and deployed on-chain'
          });
        } else {
          // Wallet doesn't exist on-chain yet, but we have an address
          // This means creation is still in progress
          return NextResponse.json({
            success: true,
            isCreating: true,
            isCreated: false,
            wallet: {
              address: walletAddress,
              isNewWallet: createNewWallet
            },
            message: createNewWallet
              ? 'New wallet creation in progress - waiting for on-chain confirmation'
              : 'Wallet creation in progress - waiting for on-chain confirmation'
          });
        }
      } catch (error) {
        console.error('API: Error checking wallet on-chain:', error);
        
        // Fallback to assuming it's still being created
        return NextResponse.json({
          success: true,
          isCreating: true,
          isCreated: false,
          wallet: {
            address: walletAddress,
            isNewWallet: createNewWallet
          },
          message: 'Unable to verify on-chain status - assuming creation in progress'
        });
      }
    }
    
    // No wallet address in records - check if we have a biometric key
    // which would indicate creation is in progress
    if (user.biometricKey) {
      console.log(`API: User has biometric key but no wallet address yet`);
      return NextResponse.json({
        success: true,
        isCreating: true,
        isCreated: false,
        message: 'Wallet creation initialized but not yet completed'
      });
    }
    
    // No wallet and no biometric key means nothing is in progress
    return NextResponse.json({
      success: false,
      isCreating: false,
      isCreated: false,
      error: 'No wallet creation process found for this user'
    });
    
  } catch (error) {
    console.error('API: Error checking wallet creation status:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error checking wallet status',
      isCreating: false,
      isCreated: false
    }, { status: 500 });
  }
} 
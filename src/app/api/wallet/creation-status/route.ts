import { NextRequest, NextResponse } from 'next/server';
import { findUserById } from '@/lib/utils/user-store';
import { createPublicClientForSepolia } from '@/lib/client-setup';
import { supabase } from '@/lib/supabase/server';

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
    
    // Get user from Supabase
    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Get wallets from Supabase
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (walletsError) {
      console.error('API: Error fetching wallets:', walletsError);
      return NextResponse.json({
        success: false,
        error: 'Error fetching wallet data',
        isCreating: false,
        isCreated: false
      }, { status: 500 });
    }
    
    // If we're checking for a new wallet, look at the newest wallet
    // Otherwise, look for the default wallet
    let walletAddress;
    
    if (wallets && wallets.length > 0) {
      if (createNewWallet) {
        // Get the newest wallet based on created_at timestamp
        const newestWallet = wallets[0]; // Already sorted by created_at desc
        walletAddress = newestWallet.address;
        console.log(`API: Found newest wallet address: ${walletAddress}`);
        console.log(`API: Wallet details: ${JSON.stringify({
          address: newestWallet.address,
          createdAt: newestWallet.created_at,
          saltNonce: newestWallet.salt_nonce
        })}`);
      } else {
        // Get the default wallet
        const defaultWallet = wallets.find(w => w.is_default) || wallets[0];
        walletAddress = defaultWallet.address;
        console.log(`API: Using default wallet address: ${walletAddress}`);
      }
      
      // Debug - log all wallets for this user
      console.log(`API: User has ${wallets.length} wallet(s):`);
      wallets.forEach((wallet, index) => {
        console.log(`API: Wallet #${index}: ${wallet.address}, created: ${wallet.created_at}, saltNonce: ${wallet.salt_nonce || 'none'}`);
      });
    } else {
      console.log(`API: User has no wallets`);
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
    
    // No wallet address in records - check if we have a server key
    // which would indicate creation is in progress
    if (user.server_key_encrypted) {
      console.log(`API: User has server key but no wallet address yet`);
      return NextResponse.json({
        success: true,
        isCreating: true,
        isCreated: false,
        message: 'Wallet creation initialized but not yet completed'
      });
    }
    
    // No wallet and no server key means nothing is in progress
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
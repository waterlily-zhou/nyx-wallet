import { ClientSetup } from '../client-setup';
import { createPublicClientForSepolia, createSafeSmartAccount, createChainPublicClient, createPimlicoClientInstance, createSmartAccountClientWithPaymaster, getActiveChain } from '../client-setup';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address } from 'viem';
import { supabase } from '../supabase/server';
import { decryptPrivateKey } from '../utils/key-encryption';
import { createSafeAccountClient } from './safe-account';

/**
 * Check if a smart account is deployed by checking its bytecode
 * @param address The address to check
 * @returns A promise resolving to a boolean indicating if the account is deployed
 */
export async function checkSmartAccountDeployed(address: Address): Promise<boolean> {
  try {
    const publicClient = createPublicClientForSepolia();
    console.log(`Checking if smart account ${address} is deployed...`);
    
    const code = await publicClient.getBytecode({
      address,
    }).catch(err => {
      console.error(`Error checking bytecode for ${address}:`, err);
      return null;
    });
    
    const isDeployed = !!code && code.length > 2; // "0x" means no code
    console.log(`Smart account deployed state: ${isDeployed ? 'deployed' : 'not deployed'}`);
    
    return isDeployed;
  } catch (error) {
    console.error('Error checking smart account deployment:', error);
    return false;
  }
}

/**
 * Deploy a smart account using the provided client setup
 * @param clientSetup The client setup containing the account and client
 * @param targetWalletAddress The specific wallet address we want to deploy
 * @returns A promise resolving to a boolean indicating if deployment succeeded
 */
export async function deploySmartAccount(
  clientSetup: ClientSetup,
  targetWalletAddress: Address
): Promise<boolean> {
  try {
    const { smartAccount, smartAccountClient } = clientSetup;
    console.log(`Attempting deployment for smart account ${targetWalletAddress}...`);
    
    // Critical check: make sure we're deploying the right address
    if (smartAccount.address.toLowerCase() !== targetWalletAddress.toLowerCase()) {
      console.error(`Address mismatch: Expected to deploy ${targetWalletAddress} but got ${smartAccount.address}`);
      console.error(`Cannot proceed with deployment - addresses don't match`);
      return false;
    }

    // Send deployment transaction
    const userOp = await smartAccountClient.sendTransaction({
      account: smartAccount,
      to: smartAccount.address,
      data: '0x',
      value: 0n,
    });

    console.log(`Deployment transaction sent with hash: ${userOp}`);

    // Wait for deployment to complete
    await smartAccountClient.waitForUserOperationReceipt({ hash: userOp });
    
    // Verify deployment
    const isDeployed = await checkSmartAccountDeployed(targetWalletAddress);
    if (!isDeployed) {
      console.error('Deployment verification failed - no bytecode found after deployment');
      return false;
    }

    console.log(`Smart account ${targetWalletAddress} deployed successfully`);
    return true;
  } catch (error) {
    console.error('Error deploying smart account:', error);
    return false;
  }
}

/**
 * Handle the deployment process before a transaction
 * This function checks if an account is deployed and deploys it if needed
 * 
 * @param userId The user ID
 * @param walletAddress The wallet address to deploy
 * @returns A promise resolving to a boolean indicating if the account is ready for transactions
 */
export async function handleDeploymentBeforeTransaction(
  userId: string,
  walletAddress: Address
): Promise<boolean> {
  console.log(`Handling deployment for wallet ${walletAddress}`);
  
  try {
    // First check if already deployed
    const isDeployed = await checkSmartAccountDeployed(walletAddress);
    if (isDeployed) {
      console.log(`Smart account ${walletAddress} is already deployed`);
      return true;
    }
    
    console.log('Smart account not deployed, initiating deployment process...');
    
    // Get the server key from database - we'll use this for deployment
    // Note: According to logs, server_key_encrypted exists but device_key_encrypted doesn't
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('server_key_encrypted')
      .eq('id', userId)
      .single();
      
    if (userError) {
      console.error('Failed to fetch user data for deployment:', userError.message);
      return false;
    }

    if (!userData?.server_key_encrypted) {
      console.error('Server key not found for user:', userId);
      return false;
    }
    
    // Get the server key for this user
    const serverKey = decryptPrivateKey(
      userData.server_key_encrypted,
      process.env.KEY_ENCRYPTION_KEY || ''
    );
    
    if (!serverKey) {
      console.error('Failed to decrypt server key');
      return false;
    }
    
    // Create an account from the server key
    const deployAccount = privateKeyToAccount(serverKey as `0x${string}`);
    console.log('Created deployment account:', deployAccount.address);
    
    // Setup the client
    const publicClient = createChainPublicClient();
    const pimlicoClient = createPimlicoClientInstance(process.env.PIMLICO_API_KEY || '');
    
    // Create smart account with the device key as the owner
    const smartAccount = await createSafeSmartAccount(publicClient, deployAccount);
    
    // We'll use the actual wallet address instead of calculating a new one based on the deployment account
    // This ensures we use the address that has the funds
    
    const activeChain = getActiveChain();
    const pimlicoUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
    
    // Create the smart account client (no paymaster, will use the funds in the address)
    const smartAccountClient = createSmartAccountClientWithPaymaster(
      smartAccount,
      pimlicoClient,
      pimlicoUrl
    );
    
    const fullClientSetup = {
      owner: deployAccount,
      smartAccount,
      smartAccountClient,
      publicClient,
      pimlicoClient
    };
    
    // Deploy the account using the funds in the smart account address
    console.log(`Deploying smart account ${walletAddress}...`);
    const deployResult = await deploySmartAccount(fullClientSetup, walletAddress);
    
    if (!deployResult) {
      console.error('Failed to deploy smart account');
      return false;
    }
    
    // Add a small delay to ensure network propagation
    console.log('Waiting for deployment propagation...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Final verification
    const finalCheck = await checkSmartAccountDeployed(walletAddress);
    if (!finalCheck) {
      console.error('Final deployment verification failed');
      return false;
    }
    
    console.log('Smart account deployment confirmed and ready for transactions');
    return true;
  } catch (error) {
    console.error('Unexpected error in deployment process:', error);
    return false;
  }
}

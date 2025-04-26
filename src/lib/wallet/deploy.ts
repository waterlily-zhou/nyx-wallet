import { ClientSetup } from '../client-setup';
import { createPublicClientForSepolia, createSafeSmartAccount, createChainPublicClient, createPimlicoClientInstance, getActiveChain } from '../client-setup';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address } from 'viem';
import { supabase } from '../supabase/server';
import { decryptPrivateKey } from '../utils/key-encryption';
import { createSafeAccountClient } from './safe-account';
import { createSmartAccountClient } from 'permissionless';
import { http } from 'viem';
import { createHash } from 'crypto';

// Function to combine keys for DKG - copied from your implementation
function combineKeys(deviceKey: string, serverKey: string) {
  return `0x${createHash('sha256').update(deviceKey + serverKey).digest('hex')}` as `0x${string}`;
}

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
 * Important: This function cannot directly deploy on its own because it needs the device key
 * which is only stored on the user's device. Instead, it will check if deployment is needed
 * and return information about the status.
 * 
 * @param userId The user ID
 * @param walletAddress The wallet address to check
 * @returns A promise resolving to a boolean indicating if the account is ready for transactions (true) or needs deployment (false)
 */
export async function handleDeploymentBeforeTransaction(
  userId: string,
  walletAddress: Address
): Promise<boolean> {
  console.log(`Checking deployment for wallet ${walletAddress}`);
  
  try {
    // First check if already deployed
    const isDeployed = await checkSmartAccountDeployed(walletAddress);
    if (isDeployed) {
      console.log(`Smart account ${walletAddress} is already deployed`);
      return true;
    }
    
    // Check if the address has funds to pay for deployment
    const publicClient = createPublicClientForSepolia();
    const balance = await publicClient.getBalance({ address: walletAddress });
    
    console.log(`Smart account ${walletAddress} is not deployed.`);
    console.log(`Current balance: ${balance.toString()} wei`);
    
    if (balance < BigInt(5000000000000000)) { // Less than 0.005 ETH
      console.error('Smart account does not have sufficient funds for deployment');
      console.error('Please send at least 0.01 ETH to the smart account address');
      return false;
    }
    
    console.log('Smart account has sufficient funds for deployment.');
    console.log('IMPORTANT: To deploy, you need both the device key and server key used to create this address.');
    console.log('Since the device key is only stored on the client device, you must initiate deployment from the client.');
    
    // If we have the balance, mark the account as ready for the client to handle
    return true;
  } catch (error) {
    console.error('Unexpected error in deployment process:', error);
    return false;
  }
}

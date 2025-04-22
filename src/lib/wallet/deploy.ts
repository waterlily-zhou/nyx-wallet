import { ClientSetup } from '../client-setup';
import { createPublicClientForSepolia } from '../client-setup';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address, type Hex } from 'viem';
import { supabase } from '../supabase/server';
import { decryptPrivateKey } from '../utils/key-encryption';
import { createSafeAccountClient } from './safe-account';

/**
 * Deploy a smart account to the blockchain
 */
export async function deploySmartAccount(clientSetup: ClientSetup): Promise<string> {
  const { smartAccount, smartAccountClient } = clientSetup;

  const userOp = await smartAccountClient.sendTransaction({
    account: smartAccount,
    to: smartAccount.address,
    data: '0x',
    value: 0n,
  });

  await smartAccountClient.waitForUserOperationReceipt({ hash: userOp });
  return smartAccount.address;
}

/**
 * Check if a smart account is deployed and deploy it if not
 * @param clientSetup The client setup with the smart account and client
 * @returns The smart account address
 */
export async function ensureSmartAccountDeployed(clientSetup: ClientSetup): Promise<string> {
  const { smartAccount } = clientSetup;
  const publicClient = createPublicClientForSepolia();
  
  // Check if the account is already deployed
  console.log(`Checking if smart account ${smartAccount.address} is deployed...`);
  const code = await publicClient.getBytecode({
    address: smartAccount.address,
  });
  
  const isDeployed = !!code && code.length > 2; // "0x" means no code
  
  if (isDeployed) {
    console.log(`Smart account ${smartAccount.address} is already deployed`);
    return smartAccount.address;
  }
  
  console.log(`Smart account ${smartAccount.address} is not deployed, deploying now...`);
  return deploySmartAccount(clientSetup);
}

/**
 * Handle the deployment logic before a transaction
 * This function encapsulates the server-side deployment logic
 * 
 * @param userId The user ID
 * @param walletAddress The wallet address to deploy
 * @returns A promise resolving to a boolean indicating if deployment was successful
 */
export async function handleDeploymentBeforeTransaction(
  userId: string,
  walletAddress: Address
): Promise<boolean> {
  console.log(`Handling deployment for wallet ${walletAddress} before transaction`);
  
  try {
    // Create a public client for checking deployment status
    const publicClient = createPublicClientForSepolia();
    
    // Check if the account is already deployed
    console.log(`Checking if smart account ${walletAddress} is deployed...`);
    const code = await publicClient.getBytecode({
      address: walletAddress,
    }).catch(err => {
      console.error(`Error checking bytecode for ${walletAddress}:`, err);
      return null;
    });
    
    const isDeployed = !!code && code.length > 2; // "0x" means no code
    console.log(`Smart account deployed state: ${isDeployed ? 'deployed' : 'not deployed'}`);
    
    if (isDeployed) {
      console.log(`Smart account ${walletAddress} is already deployed, proceeding with transaction`);
      return true;
    }
    
    console.log('Smart account not deployed, attempting to deploy it...');
    
    // Get the server key from the database for deployment
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('server_key_encrypted')
      .eq('id', userId)
      .single();
      
    if (userError) {
      console.error('Failed to fetch user data for deployment:', userError.message, userError.code, userError.details);
      return false;
    }
    
    if (!userData?.server_key_encrypted) {
      console.error('Server key not found for user:', userId);
      return false;
    }
    
    // Get the server key (this is safer than using device key)
    let serverKey;
    try {
      serverKey = decryptPrivateKey(
        userData.server_key_encrypted,
        process.env.KEY_ENCRYPTION_KEY || ''
      );
      
      if (!serverKey) {
        console.error('Failed to decrypt server key for user:', userId);
        return false;
      }
    } catch (decryptError) {
      console.error('Error decrypting server key:', decryptError);
      return false;
    }
    
    // Create an account for deployment only (using server key)
    const deploymentAccount = privateKeyToAccount(serverKey as `0x${string}`);
    console.log('Created deployment account:', deploymentAccount.address);
    
    // Create the account client
    let clientSetup;
    try {
      clientSetup = await createSafeAccountClient(deploymentAccount);
      
      // Create the proper ClientSetup object
      const fullClientSetup = {
        owner: deploymentAccount,
        smartAccount: clientSetup.smartAccount,
        smartAccountClient: clientSetup.smartAccountClient,
        publicClient: clientSetup.publicClient,
        pimlicoClient: clientSetup.pimlicoClient
      };
      
      console.log('Deploying smart account...');
      // Deploy the account using the existing function
      await deploySmartAccount(fullClientSetup);
    } catch (setupError) {
      console.error('Error setting up or deploying smart account:', setupError);
      return false;
    }
    
    console.log('Smart account deployed successfully, waiting a moment for propagation...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify the deployment worked
    try {
      const verifyCode = await publicClient.getBytecode({
        address: walletAddress,
      });
      
      if (!verifyCode || verifyCode.length <= 2) {
        console.error('Smart account deployment verification failed, bytecode not found');
        return false;
      }
      
      console.log('Smart account deployment confirmed, proceeding with transaction');
      return true;
    } catch (verifyError) {
      console.error('Error verifying smart account deployment:', verifyError);
      return false;
    }
  } catch (error) {
    console.error('Unexpected error deploying smart account:', error);
    return false;
  }
}

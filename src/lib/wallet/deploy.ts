import { ClientSetup } from '../client-setup';
import { createPublicClientForSepolia } from '../client-setup';
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
 * @returns A promise resolving to the deployed account address or null if deployment failed
 */
export async function deploySmartAccount(clientSetup: ClientSetup): Promise<Address | null> {
  try {
    const { smartAccount, smartAccountClient } = clientSetup;
    console.log(`Deploying smart account ${smartAccount.address}...`);

    // Send deployment transaction
    const userOp = await smartAccountClient.sendTransaction({
      account: smartAccount,
      to: smartAccount.address,
      data: '0x',
      value: 0n,
    });

    // Wait for deployment to complete
    await smartAccountClient.waitForUserOperationReceipt({ hash: userOp });
    
    // Verify deployment
    const isDeployed = await checkSmartAccountDeployed(smartAccount.address);
    if (!isDeployed) {
      console.error('Deployment verification failed - no bytecode found after deployment');
      return null;
    }

    console.log(`Smart account ${smartAccount.address} deployed successfully`);
    return smartAccount.address;
  } catch (error) {
    console.error('Error deploying smart account:', error);
    return null;
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
    
    // Get the server key from the database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('server_key_encrypted')
      .eq('id', userId);
      
    if (userError) {
      console.error('Failed to fetch user data for deployment:', userError.message, userError.code, userError.details);
      return false;
    }

    if (!userData || userData.length === 0 || !userData[0]?.server_key_encrypted) {
      console.error('Server key not found for user:', userId);
      return false;
    }
    
    // Get the server key (this is safer than using device key)
    let serverKey;
    try {
      serverKey = decryptPrivateKey(
        userData[0].server_key_encrypted,
        process.env.KEY_ENCRYPTION_KEY || ''
      );
      
      if (!serverKey) {
        console.error('Failed to decrypt server key');
        return false;
      }
    } catch (error) {
      console.error('Error decrypting server key:', error);
      return false;
    }
    
    // Create deployment account and client setup
    const deploymentAccount = privateKeyToAccount(serverKey as `0x${string}`);
    console.log('Created deployment account:', deploymentAccount.address);
    
    // Setup the client
    const clientSetup = await createSafeAccountClient(deploymentAccount);
    const fullClientSetup = {
      owner: deploymentAccount,
      smartAccount: clientSetup.smartAccount,
      smartAccountClient: clientSetup.smartAccountClient,
      publicClient: clientSetup.publicClient,
      pimlicoClient: clientSetup.pimlicoClient
    };
    
    // Deploy the account
    const deployedAddress = await deploySmartAccount(fullClientSetup);
    if (!deployedAddress) {
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

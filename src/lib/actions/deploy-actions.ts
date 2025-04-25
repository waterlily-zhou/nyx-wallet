'use server';

import { checkSmartAccountDeployed, handleDeploymentBeforeTransaction } from '@/lib/wallet/deploy';
import { Address, formatEther, parseEther } from 'viem';

// Map to store logs for each wallet address
const deploymentLogs = new Map<string, string[]>();

/**
 * Server-side function to check if a smart account is deployed
 */
export async function checkDeploymentStatus(address: Address): Promise<{
  isDeployed: boolean;
  logs: string[];
}> {
  // Initialize logs for this address if not exists (case insensitive)
  const addressLower = address.toLowerCase();
  if (!deploymentLogs.has(addressLower)) {
    deploymentLogs.set(addressLower, []);
  }
  
  const logs = deploymentLogs.get(addressLower) || [];
  logs.push(`Checking if smart account ${address} is deployed...`);
  
  try {
    const isDeployed = await checkSmartAccountDeployed(address);
    logs.push(`Smart account deployed status: ${isDeployed ? 'YES' : 'NO'}`);
    
    return {
      isDeployed,
      logs: [...logs]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`Error checking deployment: ${errorMessage}`);
    
    return {
      isDeployed: false,
      logs: [...logs]
    };
  }
}

/**
 * Function to check the balance of an address
 */
async function checkBalance(address: Address): Promise<{
  balance: bigint;
  hasEnoughFunds: boolean;
}> {
  try {
    // Import publicClient dynamically to avoid issues with server components
    const { publicClient } = await import('@/lib/viem/client');
    
    const balance = await publicClient.getBalance({ address });
    const minRequired = parseEther('0.005'); // ~0.005 ETH minimum
    
    return {
      balance,
      hasEnoughFunds: balance >= minRequired
    };
  } catch (error) {
    console.error('Failed to check balance:', error);
    return { balance: 0n, hasEnoughFunds: false };
  }
}

/**
 * Server-side function to deploy a smart account
 */
export async function deploySmartAccount(userId: string, address: Address): Promise<{
  success: boolean;
  message: string;
  logs: string[];
}> {
  // Initialize logs for this address if not exists
  const addressLower = address.toLowerCase();
  if (!deploymentLogs.has(addressLower)) {
    deploymentLogs.set(addressLower, []);
  }
  
  const logs = deploymentLogs.get(addressLower) || [];
  logs.push(`Starting deployment process for address: ${address}`);
  
  try {
    // First check if already deployed
    const isDeployed = await checkSmartAccountDeployed(address);
    if (isDeployed) {
      logs.push(`Smart account is already deployed! No action needed.`);
      return {
        success: true,
        message: 'Smart account is already deployed',
        logs: [...logs]
      };
    }
    
    logs.push(`Smart account is not yet deployed. Checking for funds...`);
    
    // Check if the address has enough ETH for deployment
    const { balance, hasEnoughFunds } = await checkBalance(address);
    logs.push(`Current balance: ${formatEther(balance)} ETH`);
    
    if (!hasEnoughFunds) {
      logs.push(`IMPORTANT: Your smart account needs ETH to pay for its own deployment.`);
      logs.push(`Please ensure address ${address} has at least 0.01 ETH before continuing.`);
      return {
        success: false,
        message: 'Smart account needs more ETH for deployment',
        logs: [...logs]
      };
    }
    
    logs.push(`Found sufficient funds (${formatEther(balance)} ETH). Proceeding with deployment...`);
    
    // Actually deploy the smart account using handleDeploymentBeforeTransaction
    logs.push(`Initiating smart account deployment...`);
    
    // This is where we actually call the deployment function
    const deploymentResult = await handleDeploymentBeforeTransaction(userId, address);
    
    if (deploymentResult) {
      logs.push(`Deployment transaction sent successfully!`);
      logs.push(`Waiting for confirmation...`);
      
      // Add a small delay to ensure network propagation
      await new Promise(r => setTimeout(r, 3000));
      
      // Verify that deployment was successful
      const verificationResult = await checkSmartAccountDeployed(address);
      
      if (verificationResult) {
        logs.push(`Deployment successful! Your smart account is now ready to use.`);
        return {
          success: true, 
          message: 'Smart account deployed successfully',
          logs: [...logs]
        };
      } else {
        logs.push(`Deployment transaction was processed, but verification failed.`);
        logs.push(`This could be due to network delays. Try again in a few moments.`);
        return {
          success: false,
          message: 'Deployment transaction sent but not yet confirmed',
          logs: [...logs]
        };
      }
    } else {
      logs.push(`Deployment failed. Please check your wallet's funds and try again.`);
      return {
        success: false,
        message: 'Failed to deploy smart account',
        logs: [...logs]
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`Deployment failed: ${errorMessage}`);
    
    return {
      success: false,
      message: `Failed to deploy: ${errorMessage}`,
      logs: [...logs]
    };
  }
} 
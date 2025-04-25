'use server';

import { checkSmartAccountDeployed, handleDeploymentBeforeTransaction } from '@/lib/wallet/deploy';
import { Address } from 'viem';

/**
 * Server-side function to check if a smart account is deployed
 */
export async function checkDeploymentStatus(address: Address): Promise<boolean> {
  try {
    return await checkSmartAccountDeployed(address);
  } catch (error) {
    console.error('Error checking deployment status:', error);
    return false;
  }
}

/**
 * Server-side function to handle deployment
 */
export async function deploySmartAccount(userId: string, address: Address): Promise<{
  success: boolean;
  message: string;
  logs: string[];
}> {
  const logs: string[] = [];
  
  // Create a custom logger
  const originalLog = console.log;
  const originalError = console.error;
  
  // Override console methods to capture logs
  console.log = (...args) => {
    originalLog(...args);
    if (typeof args[0] === 'string') {
      logs.push(`[LOG] ${args[0]}`);
    }
  };
  
  console.error = (...args) => {
    originalError(...args);
    if (typeof args[0] === 'string') {
      logs.push(`[ERROR] ${args[0]}`);
    }
  };
  
  try {
    logs.push(`[INFO] Starting deployment for address ${address}`);
    logs.push(`[INFO] Using userId: ${userId}`);
    
    // Check if user exists in the database before trying to deploy
    const { supabase } = await import('@/lib/supabase/server');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, server_key_encrypted')
      .eq('id', userId);
      
    if (userError) {
      logs.push(`[ERROR] Database error when checking user: ${userError.message}`);
      return {
        success: false,
        message: `Database error: ${userError.message}`,
        logs
      };
    }
    
    if (!userData || userData.length === 0) {
      logs.push(`[ERROR] No user found with ID: ${userId}`);
      return {
        success: false,
        message: 'User not found in database',
        logs
      };
    }
    
    if (userData.length > 1) {
      logs.push(`[WARNING] Multiple users found with ID: ${userId} (count: ${userData.length})`);
    }
    
    if (!userData[0].server_key_encrypted) {
      logs.push(`[ERROR] User found but server_key_encrypted is missing`);
      return {
        success: false,
        message: 'User does not have a server key',
        logs
      };
    }
    
    logs.push(`[INFO] User verified, proceeding with deployment`);
    
    const success = await handleDeploymentBeforeTransaction(userId, address);
    
    if (success) {
      logs.push('[SUCCESS] Smart account deployed successfully');
      return {
        success: true,
        message: 'Smart account deployed successfully',
        logs
      };
    } else {
      logs.push('[FAILED] Smart account deployment failed');
      return {
        success: false,
        message: 'Failed to deploy smart account',
        logs
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logs.push(`[ERROR] Exception: ${errorMessage}`);
    
    return {
      success: false,
      message: errorMessage,
      logs
    };
  } finally {
    // Restore console methods
    console.log = originalLog;
    console.error = originalError;
  }
} 
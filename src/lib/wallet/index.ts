import { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { findUserById, updateUser } from '@/lib/utils/user-store';
import { createHash } from 'crypto';
import { ClientSetup, createSafeSmartAccount, createSmartAccountClientWithPaymaster, createChainPublicClient, createPimlicoClientInstance, getActiveChain } from '@/lib/client-setup';
import { generateRandomPrivateKey, encryptPrivateKey, decryptPrivateKey } from '@/lib/utils/key-encryption';
import { EncryptedKey } from '@/lib/types/credentials';
import { supabase } from '@/lib/supabase/server';

export type WalletCreationParams = {
  method: 'biometric';
  userId: string;
  deviceKey: Hex;
};

export async function createWallet(params: WalletCreationParams): Promise<{
  address: string;
  clientSetup: ClientSetup;
}> {
  try {
    console.log('Creating wallet with params:', params.method, params.userId);
    const { method, userId, deviceKey } = params;

    if (method === 'biometric') {
      console.log('Finding user by ID:', userId);
      const user = await findUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Check if we need to update the user with keys
      let needsServerKey = false;
      let needsBiometricKey = false;
      
      // If no server key exists, we'll need to generate one
      if (!user.serverKey && !user.server_key_encrypted) {
        console.log(`User ${userId} doesn't have a server key. Will generate a new one...`);
        needsServerKey = true;
      }

      // If no biometric key exists, we'll need to generate one
      if (!user.biometricKey) {
        console.log(`User ${userId} doesn't have a biometric key. Will generate a new one...`);
        needsBiometricKey = true;
      }
      
      // Generate and store keys if needed
      if (needsServerKey || needsBiometricKey) {
        const updates: any = {};
        
        if (needsServerKey) {
          const newServerKey = generateRandomPrivateKey();
          // Store as encrypted string for Supabase
          updates.server_key_encrypted = encryptPrivateKey(newServerKey, userId);
          console.log('New server key generated.');
        }
        
        if (needsBiometricKey) {
          const newBiometricKey = generateRandomPrivateKey();
          updates.biometric_key = encryptPrivateKey(newBiometricKey, userId);
          console.log('New biometric key generated.');
        }
        
        // Update the user in Supabase
        const { error } = await supabase
          .from('users')
          .update(updates)
          .eq('id', userId);
          
        if (error) {
          console.error('Error updating user keys:', error);
          throw new Error('Failed to store encryption keys');
        }
        
        console.log('New keys stored in Supabase.');
      }

      console.log('Getting server key');
      // Handle server key based on its type
      let serverKeyStr = '';
      if (user.serverKey && typeof user.serverKey === 'string') {
        serverKeyStr = user.serverKey;
      } else if (user.server_key_encrypted) {
        serverKeyStr = user.server_key_encrypted;
      } else {
        throw new Error('Cannot find valid server key');
      }
      
      const serverKey = decryptPrivateKey(serverKeyStr, process.env.KEY_ENCRYPTION_KEY || 'default_key');
      
      console.log('Combining keys');
      const combinedKey = `0x${createHash('sha256').update(deviceKey + serverKey).digest('hex')}` as Hex;
      const owner = privateKeyToAccount(combinedKey);

      console.log('Creating chain client');
      const publicClient = createChainPublicClient();
      console.log('Creating Pimlico client');
      const pimlicoClient = createPimlicoClientInstance(process.env.PIMLICO_API_KEY || '');
      console.log('Creating smart account');
      const smartAccount = await createSafeSmartAccount(publicClient, owner);

      const activeChain = getActiveChain();
      console.log('Active chain:', activeChain.pimlicoChainName);
      const pimlicoUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
      console.log('Creating smart account client');
      const smartAccountClient = createSmartAccountClientWithPaymaster(
        smartAccount,
        pimlicoClient,
        pimlicoUrl
      );

      console.log('Smart account created successfully with address:', smartAccount.address);
      return {
        address: smartAccount.address,
        clientSetup: {
          owner,
          smartAccount,
          smartAccountClient,
          publicClient,
          pimlicoClient,
        }
      };
    }

    throw new Error(`Unsupported wallet creation method: ${method}`);
  } catch (error) {
    console.error('Error in createWallet:', error);
    throw error;
  }
}
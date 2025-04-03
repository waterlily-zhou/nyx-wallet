import { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { findUserById, decryptPrivateKey } from '@/lib/utils/user-store';
import { createHash } from 'crypto';
import { ClientSetup, createSafeSmartAccount, createSmartAccountClientWithPaymaster, createChainPublicClient, createPimlicoClientInstance, getActiveChain } from '@/lib/client-setup';

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
      const user = findUserById(userId);
      if (!user || !user.serverKey) {
        throw new Error('User or server key not found');
      }

      console.log('Decrypting server key');
      const serverKey = decryptPrivateKey(user.serverKey, process.env.KEY_ENCRYPTION_KEY || 'default_key');
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
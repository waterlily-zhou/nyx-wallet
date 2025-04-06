import { createSafeSmartAccount, createSmartAccountClientWithPaymaster, createChainPublicClient, createPimlicoClientInstance, getActiveChain } from '@/lib/client-setup';
import { privateKeyToAccount, type Account } from 'viem/accounts';
import { Hex } from 'viem';
import { findUserById, decryptPrivateKey, getDKGKeysForUser } from '@/lib/utils/user-store';
import { createHash } from 'crypto';

export async function createSafeAccountClient(signer: Account) {
  const publicClient = createChainPublicClient();
  const pimlicoClient = createPimlicoClientInstance(process.env.PIMLICO_API_KEY || '');
  const smartAccount = await createSafeSmartAccount(publicClient, signer);

  const activeChain = getActiveChain();
  const pimlicoUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;

  const smartAccountClient = createSmartAccountClientWithPaymaster(
    smartAccount,
    pimlicoClient,
    pimlicoUrl
  );

  return {
    smartAccount,
    smartAccountClient,
    publicClient,
    pimlicoClient,
  };
}

export async function createSafeAccountFromBiometric(userId: string, deviceKey: Hex): Promise<{
  address: string;
  combinedKey: Hex;
  clientSetup: {
    owner: Account;
    smartAccount: any;
    smartAccountClient: any;
    publicClient: any;
    pimlicoClient: any;
  };
}> {
  try {
    // Note: deviceKey is now provided directly from the client's secure storage
    // We don't check it against any stored value because we don't store it anymore
    
    // Get DKG keys using the provided device key
    const { serverKey, combinedKey } = await getDKGKeysForUser(userId, deviceKey);
    
    // Use the combined key from DKG
    const owner = privateKeyToAccount(combinedKey);
    console.log(`Using DKG combined key to create owner with address: ${owner.address}`);

    const publicClient = createChainPublicClient();
    const pimlicoClient = createPimlicoClientInstance(process.env.PIMLICO_API_KEY || '');
    const smartAccount = await createSafeSmartAccount(publicClient, owner);

    const activeChain = getActiveChain();
    const pimlicoUrl = `https://api.pimlico.io/v2/${activeChain.pimlicoChainName}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
    const smartAccountClient = createSmartAccountClientWithPaymaster(smartAccount, pimlicoClient, pimlicoUrl);

    return {
      address: smartAccount.address,
      combinedKey,
      clientSetup: {
        publicClient,
        pimlicoClient,
        smartAccount,
        smartAccountClient,
        owner,
      }
    };
  } catch (error) {
    console.error('Error creating Safe account from biometric:', error);
    throw error;
  }
}
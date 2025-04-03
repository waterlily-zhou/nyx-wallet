import { createSafeSmartAccount, createSmartAccountClientWithPaymaster, createChainPublicClient, createPimlicoClientInstance, getActiveChain } from '@/lib/client-setup';
import { ISigner } from '@zerodev/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { Hex } from 'viem';
import { findUserById, decryptPrivateKey } from '@/lib/utils/user-store';
import { createHash } from 'crypto';

export async function createSafeAccountClient(signer: ISigner) {
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
  clientSetup: ReturnType<typeof createSafeAccountClient> & {
    owner: ReturnType<typeof privateKeyToAccount>;
  };
}> {
  const user = findUserById(userId);
  if (!user || !user.serverKey) {
    throw new Error('User or server key not found');
  }

  const serverKey = decryptPrivateKey(user.serverKey, process.env.KEY_ENCRYPTION_KEY || '');
  const combinedKey = `0x${createHash('sha256').update(deviceKey + serverKey).digest('hex')}` as Hex;
  const owner = privateKeyToAccount(combinedKey);

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
}
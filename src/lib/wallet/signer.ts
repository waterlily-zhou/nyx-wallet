import { createHash, randomBytes } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { Hex } from 'viem';
import { findUserById, decryptPrivateKey } from '@/lib/utils/user-store';

export function combineKeys(deviceKey: Hex, serverKey: Hex): Hex {
  return `0x${createHash('sha256').update(deviceKey + serverKey).digest('hex')}` as Hex;
}

export async function createWalletSigner(userId: string, deviceKey: Hex) {
  const user = findUserById(userId);
  if (!user || !user.serverKey) {
    throw new Error('User or server key not found');
  }

  const serverKey = decryptPrivateKey(user.serverKey, process.env.KEY_ENCRYPTION_KEY || '');
  const combinedKey = combineKeys(deviceKey, serverKey);
  const owner = privateKeyToAccount(combinedKey);

  return {
    address: owner.address,
    signMessage: async ({ message }: { message: Uint8Array | string }) => {
      return owner.signMessage({ message });
    },
    signTransaction: async (tx: any) => {
      return owner.signTransaction(tx);
    },
  };
}

export async function getSignerForTransaction(userId: string, deviceKey: Hex) {
  const user = findUserById(userId);
  if (!user || !user.serverKey) {
    throw new Error('User or server key not found');
  }

  const serverKey = decryptPrivateKey(user.serverKey, process.env.KEY_ENCRYPTION_KEY || '');
  const combinedKey = combineKeys(deviceKey, serverKey);
  
  return {
    privateKey: combinedKey,
    signerAddress: privateKeyToAccount(combinedKey).address
  };
}

export function generateRandomPrivateKey(): Hex {
  return `0x${randomBytes(32).toString('hex')}` as Hex;
}

export function generateDistributedKeys(): {
  deviceKey: Hex;
  serverKey: Hex;
  recoveryKey: Hex;
} {
  const deviceKey = generateRandomPrivateKey();
  const serverKey = generateRandomPrivateKey();
  const recoveryKey = generateRandomPrivateKey();
  return { deviceKey, serverKey, recoveryKey };
}

export async function getCombinedKeys(userId: string): Promise<{
  deviceKey: Hex;
  serverKey: Hex;
  combinedKey: Hex;
}> {
  const user = findUserById(userId);
  if (!user || !user.serverKey) throw new Error('Missing keys');
  const serverKey = decryptPrivateKey(user.serverKey, process.env.KEY_ENCRYPTION_KEY || '');
  const deviceKey = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const combinedKey = combineKeys(deviceKey, serverKey);
  return { deviceKey, serverKey, combinedKey };
}

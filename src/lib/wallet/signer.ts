import { createHash, randomBytes } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address, type Hex, type SignableMessage } from 'viem';
import { findUserById, decryptPrivateKey } from '@/lib/utils/user-store';
import { EncryptedKey } from '@/lib/types/credentials';

export function combineKeys(deviceKey: Hex, serverKey: Hex): Hex {
  return `0x${createHash('sha256').update(deviceKey + serverKey).digest('hex')}` as Hex;
}

export async function createWalletSigner(userId: string, deviceKey: Hex) {
  const user = await findUserById(userId);
  if (!user || !user.serverKey) {
    throw new Error('User or server key not found');
  }

  // Handle different key formats
  const serverKeyStr = typeof user.serverKey === 'string' 
    ? user.serverKey 
    : (user.server_key_encrypted || '');
  
  const serverKey = decryptPrivateKey(serverKeyStr, process.env.KEY_ENCRYPTION_KEY || '');
  const combinedKey = combineKeys(deviceKey, serverKey);
  const owner = privateKeyToAccount(combinedKey);

  return {
    address: owner.address,
    signMessage: async ({ message }: { message: SignableMessage }) => {
      return owner.signMessage({ message });
    },
    signTransaction: async (tx: any) => {
      return owner.signTransaction(tx);
    },
  };
}

export async function getSignerForTransaction(userId: string, deviceKey: Hex) {
  const user = await findUserById(userId);
  if (!user || !user.serverKey) {
    throw new Error('User or server key not found');
  }

  // Handle different key formats
  const serverKeyStr = typeof user.serverKey === 'string' 
    ? user.serverKey 
    : (user.server_key_encrypted || '');
  
  const serverKey = decryptPrivateKey(serverKeyStr, process.env.KEY_ENCRYPTION_KEY || '');
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
  const user = await findUserById(userId);
  if (!user || !user.serverKey) throw new Error('Missing keys');
  
  // Handle different key formats
  const serverKeyStr = typeof user.serverKey === 'string' 
    ? user.serverKey 
    : (user.server_key_encrypted || '');
  
  const serverKey = decryptPrivateKey(serverKeyStr, process.env.KEY_ENCRYPTION_KEY || '');
  const deviceKey = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
  const combinedKey = combineKeys(deviceKey, serverKey);
  return { deviceKey, serverKey, combinedKey };
}

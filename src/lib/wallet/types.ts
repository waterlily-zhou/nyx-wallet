import { Hex } from 'viem';

export type WalletCreationParams = {
  method: 'biometric';
  userId: string;
  deviceKey: Hex;
};
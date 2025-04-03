import { ClientSetup } from '../client-setup';

export async function deploySmartAccount(clientSetup: ClientSetup): Promise<string> {
  const { smartAccount, smartAccountClient } = clientSetup;

  const userOp = await smartAccountClient.sendTransaction({
    account: smartAccount,
    to: smartAccount.address,
    data: '0x',
    value: 0n,
  });

  await smartAccountClient.waitForUserOperationReceipt({ hash: userOp });
  return smartAccount.address;
}

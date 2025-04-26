'use client';

import { useEffect, useState } from 'react';
import { storeDeviceKey } from '@/lib/client/secure-storage';
import { type Hex } from 'viem';

interface DeviceKeyStorageProps {
  userId: string;
  deviceKey: Hex;
}

export default function DeviceKeyStorage({ userId, deviceKey }: DeviceKeyStorageProps) {
  const [stored, setStored] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storeKey = async () => {
      if (!userId || !deviceKey) {
        console.error('Missing userId or deviceKey');
        setError('Missing required data for device key storage');
        return;
      }

      try {
        console.log(`Storing device key for user ${userId}`);
        await storeDeviceKey(userId, deviceKey);
        console.log('Device key stored successfully in local storage');
        setStored(true);
      } catch (err) {
        console.error('Error storing device key:', err);
        setError(err instanceof Error ? err.message : 'Failed to store device key');
      }
    };

    storeKey();
  }, [userId, deviceKey]);

  // This component doesn't render anything visible
  return null;
} 
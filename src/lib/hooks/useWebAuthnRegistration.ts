'use client';

import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/typescript-types';
import { useRouter } from 'next/navigation';

// Helper function to convert base64 to Uint8Array
function base64ToUint8Array(base64String: string): Uint8Array {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface RegistrationOptions {
  username: string;
  deviceName?: string;
}

interface RegistrationResult {
  success: boolean;
  walletAddress?: string;
  recoveryKey?: string;
  userId?: string;
  error?: string;
}

interface ServerResponse {
  success: boolean;
  options: PublicKeyCredentialCreationOptionsJSON;
}

export function useWebAuthnRegistration() {
  const router = useRouter();
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationResult, setRegistrationResult] = useState<RegistrationResult | null>(null);

  const register = async ({ username, deviceName }: RegistrationOptions): Promise<RegistrationResult> => {
    try {
      setIsRegistering(true);
      setError(null);
      
      console.log(`Starting registration for ${username}${deviceName ? ` on ${deviceName}` : ''}`);
      
      // Step 1: Start registration
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username, 
          deviceName 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Registration failed');
      }
      
      const data = await response.json() as ServerResponse;
      
      if (!data.success || !data.options) {
        throw new Error('Failed to get registration options');
      }
      
      // Log the exact options we received
      console.log('Raw registration options:', JSON.stringify(data.options, null, 2));
      
      // Step 2: Initiate WebAuthn registration with properly formatted options
      const attResp = await startRegistration({
        optionsJSON: data.options
      });
      
      console.log('Biometric registration successful, verifying with server...');
      
      // Step 3: Complete registration
      const verificationResp = await fetch('/api/auth/register/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: attResp,
        }),
      });
      
      if (!verificationResp.ok) {
        const errorData = await verificationResp.json();
        throw new Error(errorData.error || 'Registration verification failed');
      }
      
      const verificationData = await verificationResp.json();
      
      if (!verificationData.success) {
        throw new Error(verificationData.error || 'Registration verification failed');
      }
      
      console.log('Registration completed successfully');
      
      const result = {
        success: true,
        walletAddress: verificationData.walletAddress,
        recoveryKey: verificationData.recoveryKey,
        userId: verificationData.userId,
      };
      
      setRegistrationResult(result);
      return result;
      
    } catch (err) {
      console.error('Registration error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      
      const result = {
        success: false,
        error: errorMessage
      };
      
      setRegistrationResult(result);
      return result;
    } finally {
      setIsRegistering(false);
    }
  };

  const resetRegistration = () => {
    setRegistrationResult(null);
    setError(null);
  };

  return {
    register,
    resetRegistration,
    isRegistering,
    error,
    registrationResult
  };
} 
'use client';

import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';

interface RegistrationOptions {
  username: string;
  deviceName?: string;
}

interface RegistrationResult {
  success: boolean;
  walletAddress?: string;
  recoveryKey?: string;
  error?: string;
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
      
      const { success, options } = await response.json();
      
      if (!success || !options) {
        throw new Error('Failed to get registration options');
      }
      
      console.log('Got registration options, triggering biometric prompt...');
      
      // Step 2: Initiate WebAuthn registration
      const attResp = await startRegistration(options);
      
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
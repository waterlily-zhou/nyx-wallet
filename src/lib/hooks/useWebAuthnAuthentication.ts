'use client';

import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';

export function useWebAuthnAuthentication() {
  const router = useRouter();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticate = async (): Promise<boolean> => {
    try {
      setIsAuthenticating(true);
      setError(null);
      
      console.log('Starting WebAuthn authentication process...');
      
      // Step 1: Get challenge from server
      const challengeResponse = await fetch('/api/auth/challenge');
      
      if (!challengeResponse.ok) {
        const errorData = await challengeResponse.json();
        throw new Error(errorData.error || 'Failed to get authentication challenge');
      }
      
      const challengeData = await challengeResponse.json();
      
      if (!challengeData.success || !challengeData.challenge) {
        throw new Error('Invalid challenge data from server');
      }
      
      console.log('Got authentication challenge, triggering biometric prompt...');
      
      // Step 2: Start WebAuthn authentication process
      // Format the options according to the SimpleWebAuthn API
      const credential = await startAuthentication({
        optionsJSON: {
          challenge: challengeData.challenge,
          timeout: 60000,
          rpId: window.location.hostname,
          userVerification: 'required',
          allowCredentials: []
        }
      });
      
      console.log('Biometric authentication successful, verifying with server...');
      
      // Step 3: Verify the credential with our server
      const verificationResponse = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential,
        }),
      });
      
      if (!verificationResponse.ok) {
        const errorData = await verificationResponse.json();
        throw new Error(errorData.error || 'Server verification failed');
      }
      
      const verification = await verificationResponse.json();
      
      if (!verification.success) {
        throw new Error(verification.error || 'Authentication failed');
      }
      
      console.log('Authentication successful');
      return true;
      
    } catch (err) {
      console.error('Authentication error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  };

  return {
    authenticate,
    isAuthenticating,
    error,
  };
} 
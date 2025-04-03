'use client';

import { useState, useEffect } from 'react';

export function useBiometricAuth() {
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkBiometricsAvailability = async () => {
      try {
        // Check if the browser supports WebAuthn
        if (!window.PublicKeyCredential) {
          console.log('WebAuthn is not supported in this browser');
          return;
        }

        // Check if platform authenticator is available
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setIsBiometricsAvailable(available);
        console.log('Platform authenticator available:', available);
      } catch (error) {
        console.error('Error checking biometrics availability:', error);
        setIsBiometricsAvailable(false);
      }
    };

    checkBiometricsAvailability();
  }, []);

  const authenticateWithBiometrics = async (challenge: string): Promise<boolean> => {
    try {
      console.log('Starting authentication process...');
      setError(null);

      if (!isBiometricsAvailable) {
        console.error('Biometrics not available');
        setError('Biometrics not available');
        return false;
      }

      console.log('Challenge received:', challenge.substring(0, 10) + '...');
      
      // Create the authentication options
      const options: CredentialRequestOptions = {
        publicKey: {
          challenge: new Uint8Array(Buffer.from(challenge, 'base64')),
          timeout: 60000,
          userVerification: 'required',
          rpId: window.location.hostname,
        },
      };

      console.log('Requesting credential with options:', JSON.stringify({
        timeout: options.publicKey?.timeout,
        userVerification: options.publicKey?.userVerification,
        rpId: options.publicKey?.rpId,
      }));

      // Trigger actual WebAuthn authentication with biometric prompt
      console.log('Requesting platform authenticator via WebAuthn...');
      const credential = await navigator.credentials.get(options);
      
      if (!credential) {
        throw new Error('No credential received');
      }

      // Get the credential as PublicKeyCredential
      const pkCredential = credential as PublicKeyCredential;
      const response = pkCredential.response as AuthenticatorAssertionResponse;

      // Convert ArrayBuffer to Base64 strings
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(pkCredential.rawId)));
      const clientDataJSON = btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON)));
      const authenticatorData = btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData)));
      const signature = btoa(String.fromCharCode(...new Uint8Array(response.signature)));
      
      console.log('WebAuthn authentication successful, sending to server for verification...');
      
      // Send to server for verification
      const verifyResponse = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: {
            type: 'public-key',
            id: credentialId,
            rawId: credentialId,
            response: {
              clientDataJSON,
              authenticatorData,
              signature,
              userHandle: response.userHandle ? btoa(String.fromCharCode(...new Uint8Array(response.userHandle))) : null
            }
          },
        }),
      });

      console.log('Verify response status:', verifyResponse.status);
      const result = await verifyResponse.json();
      console.log('Verify response body:', result);
      
      return result.success;

    } catch (error) {
      console.error('Biometric authentication error:', error);
      setError(error instanceof Error ? error.message : 'Unknown authentication error');
      return false;
    }
  };

  const registerWithBiometrics = async (options: PublicKeyCredentialCreationOptions): Promise<any> => {
    try {
      console.log('Starting registration process...');
      setError(null);

      if (!isBiometricsAvailable) {
        console.error('Biometrics not available');
        setError('Biometrics not available');
        throw new Error('Biometrics not available');
      }

      // Create a new credential
      const credential = await navigator.credentials.create({
        publicKey: options,
      });

      if (!credential) {
        throw new Error('No credential received');
      }

      // Get the credential as PublicKeyCredential
      const pkCredential = credential as PublicKeyCredential;
      const response = pkCredential.response as AuthenticatorAttestationResponse;

      // Convert ArrayBuffer to Base64 strings
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(pkCredential.rawId)));
      const clientDataJSON = btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON)));
      const attestationObject = btoa(String.fromCharCode(...new Uint8Array(response.attestationObject)));

      return {
        type: 'public-key',
        id: credentialId,
        rawId: credentialId,
        response: {
          clientDataJSON,
          attestationObject,
        },
      };
    } catch (error) {
      console.error('Biometric registration error:', error);
      setError(error instanceof Error ? error.message : 'Unknown registration error');
      throw error;
    }
  };

  return {
    isBiometricsAvailable,
    authenticateWithBiometrics,
    registerWithBiometrics,
    error,
  };
} 
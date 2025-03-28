'use client';

import { useState, useEffect } from 'react';

export function useBiometricAuth() {
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState(false);

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
      } catch (error) {
        console.error('Error checking biometrics availability:', error);
        setIsBiometricsAvailable(false);
      }
    };

    checkBiometricsAvailability();
  }, []);

  const authenticateWithBiometrics = async (challenge: string): Promise<boolean> => {
    try {
      // Create the authentication options
      const options: CredentialRequestOptions = {
        publicKey: {
          challenge: new Uint8Array(Buffer.from(challenge, 'base64')),
          timeout: 60000,
          userVerification: 'required',
          rpId: window.location.hostname,
        },
      };

      // Request the credential
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

      // Verify the credential with the server
      const verifyResponse = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'public-key',
          id: credentialId,
          rawId: credentialId,
          response: {
            clientDataJSON,
            authenticatorData,
            signature,
            userHandle: null
          }
        }),
      });

      const result = await verifyResponse.json();
      return result.success;
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return false;
    }
  };

  return {
    isBiometricsAvailable,
    authenticateWithBiometrics,
  };
} 
'use client';

import { useState, useEffect } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/typescript-types';

export type WebAuthnCredential = {
  id: string;
  type: string;
  rawId: string;
  response: any;
};

export type WebAuthnResult = {
  success: boolean;
  error?: string;
  credential?: WebAuthnCredential;
  userId?: string;
  walletAddress?: string;
  recoveryKey?: string;
  deviceKey?: string;
};

/**
 * Advanced WebAuthn hook that properly uses the secure enclave
 * and doesn't rely on cookies for credential discovery
 */
export function useAdvancedWebAuthn() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableCredentials, setAvailableCredentials] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  /**
   * Discover existing credentials on the device without relying on cookies
   */
  const discoverExistingCredentials = async (): Promise<any> => {
    try {
      setIsDiscovering(true);
      // Get the options for credential discovery
      const response = await fetch('/api/auth/challenge');
      
      if (!response.ok) {
        throw new Error(`Failed to get discover options: ${response.status}`);
      }
      
      const { challenge } = await response.json();
      
      // Format the options correctly for WebAuthn
      const credential = await startAuthentication({
        optionsJSON: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [],
          userVerification: 'required',
          timeout: 60000
        }
      });

      console.log('🔥 Credential in startAuthentication:', credential);
      
      if (!credential) {
        console.log('No credentials discovered');
        return [];
      }
      
/*       // Send discovered credential to server to identify
      const identifyResponse = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      }); */
      
      /* if (!identifyResponse.ok) {
        console.error('Failed to identify credential:', await identifyResponse.json());
        return [];
      } */
      
/*       const { userId } = await identifyResponse.json();
      if (userId) {
        setAvailableCredentials([credential.id]);
        return [credential.id];
      } */
      return credential;
    } catch (error) {
      console.error('Error in credential discovery:', error);
      return [];
    } finally {
      setIsDiscovering(false);
    }
  };

  /**
   * Authenticate using WebAuthn
   * This doesn't require prior knowledge of which user is authenticating
   */
  const authenticate = async (): Promise<WebAuthnResult> => {
    setIsAuthenticating(true);
    setError(null);
    
    try {
      // Get authentication options from server
      const response = await fetch('/api/auth/challenge');
      
      if (!response.ok) {
        throw new Error(`Failed to get authentication options: ${response.status}`);
      }
      
      const { challenge } = await response.json();
      
      // Format the options according to the SimpleWebAuthn API
      // and trigger the WebAuthn authentication process
      const credential = await startAuthentication({
        optionsJSON: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [],
          userVerification: 'required',
          timeout: 60000
        }
      });
      
      // Verify the credential with the server
      const verificationResponse = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      
      if (!verificationResponse.ok) {
        const error = await verificationResponse.json();
        throw new Error(error.message || 'Authentication verification failed');
      }
      
      const result = await verificationResponse.json();
      
      return {
        success: true,
        credential,
        userId: result.userId
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsAuthenticating(false);
    }
  };

  /**
   * Register a new credential
   */
  const register = async (
    username: string, 
    deviceName?: string,
    existingOptions?: PublicKeyCredentialCreationOptionsJSON
  ): Promise<WebAuthnResult> => {
    setIsRegistering(true);
    setError(null);
    
    try {
      let options;
      
      if (!existingOptions) {
        // Get registration options from server
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, deviceName })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to get registration options');
        }
        
        const data = await response.json();
        options = data.options;
      } else {
        options = existingOptions;
      }
      
      // Ensure challenge and user.id are strings
      if (typeof options.challenge !== 'string') {
        throw new Error('Challenge is not a string');
      }
      if (typeof options.user.id !== 'string') {
        throw new Error('User ID is not a string');
      }
      console.log('Challenge:', options.challenge, typeof options.challenge);
      console.log('User ID:', options.user.id, typeof options.user.id);
      // Format the options and trigger the WebAuthn registration process
      const credential = await startRegistration({
        optionsJSON: {
          ...options,
          challenge: options.challenge,
          user: {
            ...options.user,
            id: options.user.id
          }
        }
      });
      
      // Verify the registration with the server
      const verificationResponse = await fetch('/api/auth/register/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      
      if (!verificationResponse.ok) {
        const error = await verificationResponse.json();
        throw new Error(error.error || 'Registration verification failed');
      }
      
      const result = await verificationResponse.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Registration verification failed');
      }
      
      // Add the new credential to our list
      setAvailableCredentials(prev => [...prev, credential.id]);
      
      // Return the full result including deviceKey if it exists
      return {
        success: true,
        credential,
        userId: result.userId,
        walletAddress: result.walletAddress,
        recoveryKey: result.recoveryKey,
        deviceKey: result.deviceKey
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsRegistering(false);
    }
  };

  return {
    authenticate,
    register,
    discoverExistingCredentials,
    isAuthenticating,
    isRegistering,
    isDiscovering,
    error,
    hasCredentials: availableCredentials.length > 0,
    availableCredentials
  };
} 
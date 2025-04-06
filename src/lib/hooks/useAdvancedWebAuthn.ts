'use client';

import { useState, useEffect } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

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

  // Check for available credentials on mount
  useEffect(() => {
    discoverExistingCredentials()
      .then(credentialIds => {
        if (credentialIds && credentialIds.length > 0) {
          setAvailableCredentials(credentialIds);
          console.log('Found existing credentials:', credentialIds);
        } else {
          console.log('No existing credentials found');
        }
      })
      .catch(err => {
        console.error('Error discovering credentials:', err);
      });
  }, []);

  /**
   * Discover existing credentials on the device without relying on cookies
   */
  const discoverExistingCredentials = async (): Promise<string[]> => {
    try {
      // Get the options for credential discovery
      const response = await fetch('/api/auth/webauthn/discover');
      
      if (!response.ok) {
        throw new Error(`Failed to get discover options: ${response.status}`);
      }
      
      const { options } = await response.json();
      
      // Use conditional UI and discovery to find credentials
      // This uses the device's credential store rather than cookies
      const credential = await navigator.credentials.get({
        publicKey: {
          ...options.publicKey,
          rpId: window.location.hostname,
          userVerification: 'preferred',
        },
        mediation: 'optional' // Allow the browser to show a credential chooser
      });
      
      if (!credential) {
        console.log('No credentials discovered');
        return [];
      }
      
      // Send discovered credential to server to identify
      const identifyResponse = await fetch('/api/auth/webauthn/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      
      if (!identifyResponse.ok) {
        console.error('Failed to identify credential:', await identifyResponse.json());
        return [];
      }
      
      const { credentials } = await identifyResponse.json();
      return credentials.map((c: any) => c.id);
    } catch (error) {
      console.error('Error in credential discovery:', error);
      return [];
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
      const response = await fetch('/api/auth/webauthn/authenticate');
      
      if (!response.ok) {
        throw new Error(`Failed to get authentication options: ${response.status}`);
      }
      
      const { options } = await response.json();
      
      // Format the options according to the SimpleWebAuthn API
      // and trigger the WebAuthn authentication process
      const credential = await startAuthentication({
        ...options,
        rpId: window.location.hostname,
      });
      
      // Verify the credential with the server
      const verificationResponse = await fetch('/api/auth/webauthn/verify', {
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
  const register = async (username: string, deviceName?: string): Promise<WebAuthnResult> => {
    setIsRegistering(true);
    setError(null);
    
    try {
      // Get registration options from server
      const response = await fetch('/api/auth/webauthn/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, deviceName })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get registration options');
      }
      
      const { options } = await response.json();
      
      // Format the options and trigger the WebAuthn registration process
      const credential = await startRegistration(options);
      
      // Verify the registration with the server
      const verificationResponse = await fetch('/api/auth/webauthn/verify-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      
      if (!verificationResponse.ok) {
        const error = await verificationResponse.json();
        throw new Error(error.message || 'Registration verification failed');
      }
      
      const result = await verificationResponse.json();
      
      // Add the new credential to our list
      setAvailableCredentials(prev => [...prev, credential.id]);
      
      return {
        success: true,
        credential,
        userId: result.userId
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
    error,
    hasCredentials: availableCredentials.length > 0,
    availableCredentials
  };
} 
/**
 * DKG Registration Component
 * 
 * This component handles the registration flow for Distributed Key Generation
 * It securely generates and stores the device key in the local secure enclave
 * while coordinating with the server for the server-side key.
 */

import React, { useState } from 'react';
import { 
  generateAndStoreDeviceKey, 
  createWebAuthnProtectedKey 
} from '@/lib/client/secure-storage';
import { type Hex } from 'viem';

interface DKGRegistrationProps {
  userId: string;
  onComplete: (walletAddress: string) => void;
  onError: (error: Error) => void;
}

export function DKGRegistration({ userId, onComplete, onError }: DKGRegistrationProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'registering' | 'completing' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Handle registration process
  const startRegistration = async () => {
    try {
      setStatus('generating');
      
      // Generate new device key and store it in the secure enclave
      let deviceKey: Hex;
      
      try {
        // Try to use WebAuthn if available
        const { deviceKey: webAuthnKey } = await createWebAuthnProtectedKey(userId);
        deviceKey = webAuthnKey;
        console.log('Created WebAuthn-protected device key');
      } catch (error) {
        console.warn('WebAuthn not available, falling back to secure storage:', error);
        deviceKey = await generateAndStoreDeviceKey(userId);
        console.log('Created device key with secure storage');
      }
      
      // Now that we have the device key stored securely, register with the server
      setStatus('registering');
      
      // Call the wallet creation API with the device key
      const response = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          deviceKey,
          forceCreate: true,
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create wallet');
      }
      
      // Registration complete!
      setStatus('completing');
      onComplete(result.walletAddress);
      
    } catch (error) {
      console.error('DKG Registration error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : String(error));
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  };
  
  return (
    <div className="dkg-registration">
      <h2>Secure Wallet Setup</h2>
      
      {status === 'idle' && (
        <div>
          <p>
            We'll create a secure wallet using Distributed Key Generation (DKG).
            This approach keeps part of your key on this device and part on our servers,
            making your wallet more secure.
          </p>
          <button 
            onClick={startRegistration}
            className="primary-button"
          >
            Set Up Secure Wallet
          </button>
        </div>
      )}
      
      {status === 'generating' && (
        <div>
          <p>Generating your device key...</p>
          <div className="loading-spinner"></div>
        </div>
      )}
      
      {status === 'registering' && (
        <div>
          <p>Creating your wallet...</p>
          <div className="loading-spinner"></div>
        </div>
      )}
      
      {status === 'completing' && (
        <div>
          <p>Wallet creation successful!</p>
          <p>Your key has been securely stored on this device.</p>
        </div>
      )}
      
      {status === 'error' && (
        <div className="error-container">
          <p>Error creating wallet: {errorMessage}</p>
          <button 
            onClick={() => {
              setStatus('idle');
              setErrorMessage(null);
            }}
            className="retry-button"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
} 
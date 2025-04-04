'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBiometricAuth } from '@/lib/hooks/useBiometricAuth';
import { useWebAuthnRegistration } from '@/lib/hooks/useWebAuthnRegistration';

export default function LoginForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isBiometricsAvailable, authenticateWithBiometrics } = useBiometricAuth();
  const { register, isRegistering, registrationResult } = useWebAuthnRegistration();
  const [hasSavedWallet, setHasSavedWallet] = useState(false);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    // Check if there's a saved wallet
    const checkSavedWallet = async () => {
      try {
        const response = await fetch('/api/wallet/check', {
          method: 'GET',
        });
        const data = await response.json();
        setHasSavedWallet(data.hasSavedWallet);
      } catch (err) {
        console.error('Failed to check saved wallet:', err);
      }
    };

    checkSavedWallet();
  }, []);
  
  useEffect(() => {
    // If registration completed successfully, show the recovery key
    if (registrationResult?.success && registrationResult.recoveryKey) {
      setRecoveryKey(registrationResult.recoveryKey);
      setWalletAddress(registrationResult.walletAddress || null);
      setShowRecoveryKey(true);
    }
  }, [registrationResult]);

  const createWallet = async () => {
    console.log('createWallet called');
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Generate a default username based on timestamp
      const defaultUsername = `user_${Date.now()}`;
      console.log('Using default username:', defaultUsername);
      
      // Use WebAuthn registration with DKG
      const result = await register({ username: defaultUsername });
      console.log('Registration result:', result);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create wallet');
      }
      
      // Registration result will be handled in the useEffect
      // It will display the recovery key to the user
      
    } catch (err) {
      console.error('Wallet creation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get the challenge
      const challengeResponse = await fetch('/api/auth/challenge');
      const challengeData = await challengeResponse.json();

      if (!challengeData.success) {
        throw new Error('Failed to get authentication challenge');
      }

      if (!challengeData.challenge) {
        throw new Error('Authentication challenge is missing');
      }

      console.log('Challenge type:', typeof challengeData.challenge);
      if (typeof challengeData.challenge !== 'string') {
        console.error('Challenge is not a string:', challengeData.challenge);
        throw new Error('Authentication challenge format is invalid');
      }

      // Authenticate with biometrics
      const authResult = await authenticateWithBiometrics(challengeData.challenge);
      
      if (!authResult.success) {
        throw new Error(authResult.error || 'Authentication failed');
      }

      console.log('Biometric authentication successful, loading wallet');
      
      // Load the wallet using the authenticated user ID
      const loadWalletResponse = await fetch('/api/wallet/load', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userId: authResult.userId 
        }),
      });
      
      const walletData = await loadWalletResponse.json();
      
      if (!walletData.success) {
        console.error('Wallet loading failed:', walletData.error);
        throw new Error(walletData.error || 'Failed to load wallet');
      }
      
      console.log('Wallet loaded successfully with address:', walletData.wallet.address);

      // Redirect to dashboard
      router.push('/');
    } catch (err) {
      console.error('Authentication error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleContinueAfterRecovery = () => {
    setShowRecoveryKey(false);
    router.push('/');
  };
  
  // Show the recovery key screen
  if (showRecoveryKey && recoveryKey) {
    return (
      <div className="mt-8 space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Important!</strong>
          <p className="block sm:inline"> Save this recovery key securely. It will only be shown once.</p>
        </div>
        
        <div className="bg-gray-100 p-4 rounded text-center font-mono break-all">
          {recoveryKey}
        </div>
        
        {walletAddress && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700">Wallet Address:</h3>
            <div className="bg-gray-100 p-2 rounded text-center font-mono break-all text-sm">
              {walletAddress}
            </div>
          </div>
        )}
        
        <p className="text-sm text-gray-600">
          This is your wallet recovery key. Store it in a secure password manager or write it down and keep it safe.
          If you lose access to your device, you'll need this key to recover your wallet.
        </p>
        
        <button
          onClick={handleContinueAfterRecovery}
          className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          I've saved my recovery key - Continue to Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Sign in button - shown regardless of conditions */}
        <button
          onClick={handleBiometricAuth}
          disabled={isLoading || isRegistering}
          className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Authenticating...
            </span>
          ) : (
            'Sign in to your wallet'
          )}
        </button>

        <button
          onClick={createWallet}
          disabled={isLoading || isRegistering}
          className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading || isRegistering ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating Wallet...
            </span>
          ) : (
            'Create a new wallet'
          )}
        </button>
      </div>

      <div className="text-center">
        <p className="text-sm text-gray-600">
          By creating a wallet, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
} 
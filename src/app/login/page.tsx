'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBiometricAuth } from '@/lib/hooks/useBiometricAuth';
import { useWebAuthnRegistration } from '@/lib/hooks/useWebAuthnRegistration';

export default function LoginPage() {
  const router = useRouter();
  const [showDebugger, setShowDebugger] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
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
    addDebugLog('Login page loaded');
  }, []);
  
  useEffect(() => {
    // If registration completed successfully, show the recovery key
    if (registrationResult?.success && registrationResult.recoveryKey) {
      setRecoveryKey(registrationResult.recoveryKey);
      setWalletAddress(registrationResult.walletAddress || null);
      setShowRecoveryKey(true);
    }
  }, [registrationResult]);
  
  const addDebugLog = (message: string) => {
    console.log(message);
    setDebugLog(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]}: ${message}`]);
  };
  
  const formatError = (err: any): string => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    // Handle rate limit errors
    if (errorMessage.includes('429') && errorMessage.includes('Too many request')) {
      return 'The network is busy right now. Please try again in a few moments (Rate limit exceeded).';
    }
    
    // Handle WebAuthn/biometric errors
    if (errorMessage.includes('NotAllowedError') || 
        errorMessage.includes('operation either timed out or was not allowed')) {
      return 'Biometric authentication was denied or timed out. Please ensure your device supports biometrics and try again.';
    }
    
    return errorMessage;
  };
  
  const handleBiometricAuth = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      addDebugLog('Starting biometric authentication...');

      // Check if biometrics are available
      if (!isBiometricsAvailable) {
        throw new Error('Biometric authentication is not available on this device.');
      }

      // Get the challenge
      const challengeResponse = await fetch('/api/auth/challenge');
      const challengeData = await challengeResponse.json();

      if (!challengeData.success || !challengeData.challenge) {
        throw new Error('Failed to get authentication challenge');
      }

      addDebugLog(`Challenge received, wallet verification: ${challengeData.walletVerification ? 'Yes' : 'No'}`);

      // Authenticate with biometrics
      const authResult = await authenticateWithBiometrics(challengeData.challenge);
      
      if (!authResult.success) {
        throw new Error(authResult.error || 'Authentication failed');
      }

      addDebugLog('Biometric authentication successful, loading wallet');
      
      // Show a message about connecting to the blockchain
      setError('Looking up your wallet...');
      
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
      
      // Check for 404 error that indicates no wallet found
      if (loadWalletResponse.status === 404) {
        const errorData = await loadWalletResponse.json();
        
        // If the error indicates the user needs to create a wallet
        if (errorData.needsWalletCreation) {
          addDebugLog('No wallet found for this user. Prompting to create one.');
          setError('Your biometric credential has no wallet associated with it. Please create a wallet first.');
          setIsSigningIn(false);
          return; // Exit early - will need to create a wallet
        }
      }
      
      if (!loadWalletResponse.ok) {
        // Special handling for rate limits
        if (loadWalletResponse.status === 429) {
          addDebugLog('Rate limit exceeded, please try again later');
          throw new Error('The Sepolia network is busy right now. Please try again in a few moments (Rate limit exceeded).');
        }
        
        const errorText = await loadWalletResponse.text();
        throw new Error(`Failed to load wallet: ${errorText}`);
      }
      
      const walletData = await loadWalletResponse.json();
      
      if (!walletData.success) {
        throw new Error(walletData.error || 'Failed to load wallet');
      }
      
      addDebugLog(`Wallet loaded: ${walletData.wallet.address}`);
      setError(null);
      
      // Redirect to dashboard
      router.push('/');
    } catch (err) {
      console.error('Authentication error:', err);
      const errorMsg = formatError(err);
      addDebugLog(`Error: ${errorMsg}`);
      setError(errorMsg);
    } finally {
      setIsSigningIn(false);
    }
  };
  
  const createWallet = async () => {
    try {
      setIsCreatingWallet(true);
      setError(null);
      addDebugLog('Creating new wallet...');
      
      // Generate a default username based on timestamp
      const defaultUsername = `user_${Date.now()}`;
      
      // Use WebAuthn registration with better error handling
      addDebugLog('Starting WebAuthn registration process');
      setError('Setting up WebAuthn key, please follow the prompts...');
      
      // First phase: Register the WebAuthn credential
      const result = await register({ username: defaultUsername });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create wallet');
      }
      
      addDebugLog('WebAuthn registration successful');
      setError('Connecting to Sepolia blockchain, this may take a moment...');
      
      // Registration result will be handled in the useEffect
      // It will display the recovery key to the user
      addDebugLog('Wallet creation initiated, waiting for blockchain confirmation');
      
    } catch (err) {
      console.error('Wallet creation error:', err);
      const errorMsg = formatError(err);
      addDebugLog(`Error: ${errorMsg}`);
      setError(errorMsg);
      
      // If this is a rate limit error, provide more specific guidance
      if (typeof errorMsg === 'string' && (
        errorMsg.toLowerCase().includes('rate limit') || 
        errorMsg.toLowerCase().includes('too many request')
      )) {
        setError('The Sepolia network is busy right now. Please try again in a few minutes. This is common on test networks.');
      }
    } finally {
      setIsCreatingWallet(false);
    }
  };
  
  const addExistingWallet = () => {
    addDebugLog('Add existing wallet feature not implemented yet');
    // Could navigate to an import page, or open a modal
    // router.push('/import-wallet');
  };
  
  const handleContinueAfterRecovery = () => {
    setShowRecoveryKey(false);
    router.push('/');
  };

  // Show the recovery key screen
  if (showRecoveryKey && recoveryKey) {
    return (
      <div className="w-full max-w-md p-4">
        <div className="bg-yellow-900/30 border border-yellow-600 text-yellow-200 px-4 py-3 rounded-lg mb-4" role="alert">
          <strong className="font-bold">Important!</strong>
          <p className="mt-1"> Save this recovery key securely. It will only be shown once.</p>
        </div>
        
        <div className="bg-gray-900 p-4 rounded-lg text-center font-mono break-all text-gray-200">
          {recoveryKey}
        </div>
        
        {walletAddress && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-400">Wallet Address:</h3>
            <div className="bg-gray-900 p-2 rounded-lg text-center font-mono break-all text-sm text-gray-300">
              {walletAddress}
            </div>
          </div>
        )}
        
        <p className="text-sm text-gray-400 mt-4">
          This is your wallet recovery key. Store it in a secure password manager or write it down and keep it safe.
          If you lose access to your device, you'll need this key to recover your wallet.
        </p>
        
        <button
          onClick={handleContinueAfterRecovery}
          className="w-full mt-6 py-3 px-4 bg-violet-600 text-white rounded-lg hover:bg-violet-700 focus:outline-none"
        >
          I've saved my recovery key - Continue to Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full p-4">
      {error && (
        <div className="p-4 bg-red-900/50 border border-red-600 rounded-lg text-center text-white mb-4">
          {error}
        </div>
      )}
      
      <div className="grid gap-4">
          <button 
            onClick={handleBiometricAuth}
            disabled={isSigningIn || isCreatingWallet}
            className="w-full bg-violet-500 text-gray-100 py-8 px-8 rounded-lg flex flex-row items-center justify-center cursor-pointer hover:bg-violet-700 disabled:opacity-50"
          >
              {isSigningIn ? (
                <svg className="animate-spin h-8 w-8 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg 
                  className="h-8 w-8 mr-2"
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="1.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  {/* Top left, right, bottom left, bottom right corner */}
                  <path d="M7 3h-4v4" />
                  <path d="M17 3h4v4" />
                  <path d="M7 21h-4v-4" />
                  <path d="M17 21h4v-4" />
                  {/* Eyes */}
                  <circle cx="9" cy="9" r="0.6" />
                  <circle cx="15" cy="9" r="0.6" />
                  {/* Smile */}
                  <path d="M9 15c.83 1.5 5.17 1.5 6 0" />
                </svg>
              )}
            <div className="flex flex-col ml-2">
              <div>Sign in to your wallet</div>
              <div className="text-xs mt-1 text-gray-200">(FaceID / fingerprint)</div>
            </div>
          </button>

        <div className="flex flex-col gap-4">
          <button
            onClick={addExistingWallet}
            disabled={isSigningIn || isCreatingWallet}
            className="w-full bg-black border border-violet-500 text-violet-500 py-4 px-4 rounded-lg flex flex-row items-center justify-center cursor-pointer hover:border-violet-700 disabled:opacity-50"
          >
            <svg className="h-8 w-8 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
            <div>Add an existing wallet</div>
          </button>
          
          <button
            onClick={createWallet}
            disabled={isSigningIn || isCreatingWallet || isRegistering}
            className="w-full bg-black border border-violet-500 text-violet-500 py-4 px-4 rounded-lg flex flex-row items-center justify-center cursor-pointer hover:border-violet-700 disabled:opacity-50"
          >
            {isCreatingWallet || isRegistering ? (
              <svg className="animate-spin h-8 w-8 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="h-8 w-8 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
              </svg>
            )}
            <div>Create a new wallet</div>
          </button>
        </div>
      </div>
      
      <div className="mt-4 text-center">
        <button
          onClick={() => setShowDebugger(!showDebugger)}
          className="text-gray-600 border border-gray-300 px-3 py-1 rounded text-xs cursor-pointer hover:bg-gray-100"
        >
          {showDebugger ? 'Hide Debug Logs' : 'Show Debug Logs'}
        </button>
      </div>
      
      {showDebugger && (
        <div className="mt-4 p-4 bg-gray-100 border border-gray-300 rounded-lg font-mono text-xs max-h-40 overflow-y-auto">
          <div>
            {debugLog.map((log, i) => (
              <div key={i} className="mb-2 text-gray-700">{log}</div>
            ))}
            {debugLog.length === 0 && <div className="text-gray-500">No logs yet</div>}
          </div>
        </div>
      )}
    </div>
  );
}
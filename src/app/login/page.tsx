'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBiometricAuth } from '@/lib/hooks/useBiometricAuth';

export default function LoginPage() {
  const router = useRouter();
  const { isBiometricsAvailable, authenticateWithBiometrics } = useBiometricAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState<boolean>(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  useEffect(() => {
    // Check if user has a wallet by making a request to the server
    const checkWallet = async () => {
      try {
        addDebugLog('Checking if user has a wallet...');
        const response = await fetch('/api/wallet/check', {
          method: 'GET',
        });
        const data = await response.json();
        addDebugLog(`Wallet check response: ${JSON.stringify(data)}`);
        setHasWallet(!!data.walletAddress);
        addDebugLog(`HasWallet set to: ${!!data.walletAddress}`);
      } catch (err) {
        console.error('Error checking wallet:', err);
        addDebugLog(`Error checking wallet: ${err instanceof Error ? err.message : String(err)}`);
        setHasWallet(false);
      }
    };

    checkWallet();
    addDebugLog(`WebAuthn available: ${isBiometricsAvailable}`);
  }, [isBiometricsAvailable]);

  // Add direct event listener setup
  useEffect(() => {
    const signInBtn = document.querySelector('button:nth-child(1)');
    const addWalletBtn = document.querySelector('button:nth-child(2)');
    const createWalletBtn = document.querySelector('button:nth-child(3)');
    
    if (signInBtn) {
      addDebugLog('Sign in button found in DOM');
      signInBtn.addEventListener('click', () => {
        addDebugLog('Sign in button clicked via direct event listener');
      });
    } else {
      addDebugLog('Sign in button NOT found in DOM');
    }
    
    if (createWalletBtn) {
      addDebugLog('Create wallet button found in DOM');
      createWalletBtn.addEventListener('click', () => {
        addDebugLog('Create wallet button clicked via direct event listener');
      });
    } else {
      addDebugLog('Create wallet button NOT found in DOM');
    }
    
    return () => {
      if (signInBtn) signInBtn.removeEventListener('click', () => {});
      if (addWalletBtn) addWalletBtn.removeEventListener('click', () => {});
      if (createWalletBtn) createWalletBtn.removeEventListener('click', () => {});
    };
  }, []);

  const addDebugLog = (message: string) => {
    console.log(message);
    setDebugLog(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]}: ${message}`]);
  };

  const handleSignIn = async () => {
    try {
      addDebugLog('Sign in button clicked');
      const btnState = {
        loading: loading !== null,
        isBiometricsAvailable: isBiometricsAvailable,
        hasWallet: hasWallet
      };
      addDebugLog(`Button state: ${JSON.stringify(btnState)}`);
      
      // Additional check - is the button disabled?
      const isDisabled = loading !== null || !isBiometricsAvailable || !hasWallet;
      addDebugLog(`Button should be disabled: ${isDisabled}`);
      
      if (isDisabled) {
        if (loading !== null) addDebugLog('Reason: Loading is in progress');
        if (!isBiometricsAvailable) addDebugLog('Reason: Biometrics not available');
        if (!hasWallet) addDebugLog('Reason: No wallet detected');
        return; // Don't proceed if the button should be disabled
      }
      
      setLoading('signin');
      setError(null);
      
      // Request a challenge from the server
      addDebugLog('Requesting challenge from server...');
      const challengeResponse = await fetch('/api/auth/challenge');
      if (!challengeResponse.ok) {
        throw new Error(`Failed to get authentication challenge: ${challengeResponse.status}`);
      }
      
      const challengeData = await challengeResponse.json();
      addDebugLog(`Challenge response: ${JSON.stringify(challengeData)}`);
      
      if (!challengeData.success || !challengeData.challenge) {
        throw new Error(challengeData.error || 'Invalid challenge response');
      }
      
      // Convert the challenge from array to base64 string
      const challengeArray = new Uint8Array(challengeData.challenge);
      const challengeBase64 = Buffer.from(challengeArray).toString('base64');
      addDebugLog('Challenge converted to base64');
      
      // Trigger biometric authentication
      addDebugLog('Starting biometric authentication...');
      const authResult = await authenticateWithBiometrics(challengeBase64);
      addDebugLog(`Authentication result: ${authResult}`);
      
      if (authResult) {
        addDebugLog('Authentication successful, redirecting...');
        router.push('/'); // Redirect to dashboard on success
      } else {
        throw new Error('Authentication failed');
      }
    } catch (err) {
      console.error('Sign in error:', err);
      addDebugLog(`Sign in error: ${err instanceof Error ? err.message : String(err)}`);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(null);
    }
  };

  const handleAddExisting = async () => {
    try {
      setLoading('add');
      setError(null);
      
      // Placeholder for adding existing wallet
      alert('Add existing wallet feature coming soon');
      
      // Simulate loading
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error('Add wallet error:', err);
      setError(err instanceof Error ? err.message : 'Failed to add wallet');
    } finally {
      setLoading(null);
    }
  };

  const handleCreateWallet = async () => {
    try {
      addDebugLog('Create wallet button clicked');
      setLoading('create');
      setError(null);
      
      // Use a server-side API to create a test wallet
      addDebugLog('Creating a test wallet via server API...');
      
      const response = await fetch('/api/wallet/create-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: '0x1234567890abcdef1234567890abcdef12345678',
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create test wallet: ${response.status}`);
      }
      
      const data = await response.json();
      addDebugLog(`Wallet creation response: ${JSON.stringify(data)}`);
      
      // Refresh the page to reflect wallet creation
      addDebugLog('Reloading page to reflect wallet creation...');
      window.location.reload();
    } catch (error) {
      console.error('Error creating wallet:', error);
      addDebugLog(`Create wallet error: ${error instanceof Error ? error.message : String(error)}`);
      setError(error instanceof Error ? error.message : 'Failed to create wallet');
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-black text-white">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">nyx_wallet</h1>
          <p className="text-gray-400 text-sm mb-8">Your secure biometric wallet</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleSignIn}
            disabled={loading !== null}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading === 'signin' ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            )}
            Sign in to your wallet
            <span className="text-xs opacity-70">(FaceID / Fingerprint)</span>
          </button>

          <button
            onClick={handleAddExisting}
            disabled={loading !== null}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading === 'add' ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
              </svg>
            )}
            Add an existing wallet
          </button>

          <button
            onClick={handleCreateWallet}
            disabled={loading !== null}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading === 'create' ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            )}
            Create a new wallet
          </button>
        </div>

        {/* Debug logs panel */}
        <div className="mt-8 p-4 bg-gray-900 rounded-lg text-xs font-mono overflow-auto max-h-40">
          <h3 className="font-bold mb-2">Debug Logs:</h3>
          <div>
            {debugLog.map((log, i) => (
              <div key={i} className="mb-1">{log}</div>
            ))}
            {debugLog.length === 0 && <div className="text-gray-500">No logs yet</div>}
          </div>
        </div>

        {/* Display state information */}
        <div className="mt-4 p-4 bg-gray-900 rounded-lg text-xs font-mono">
          <h3 className="font-bold mb-2">State:</h3>
          <div>isBiometricsAvailable: {isBiometricsAvailable ? 'true' : 'false'}</div>
          <div>hasWallet: {hasWallet ? 'true' : 'false'}</div>
          <div>loading: {loading === null ? 'null' : loading}</div>
        </div>
      </div>
    </main>
  );
}
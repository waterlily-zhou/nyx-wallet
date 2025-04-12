'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBiometricAuth } from '@/lib/hooks/useBiometricAuth';
import { useAdvancedWebAuthn, type WebAuthnResult } from '@/lib/hooks/useAdvancedWebAuthn';
import { generateAndStoreDeviceKey } from '@/lib/client/secure-storage';
import { type Hex } from 'viem';

export default function LoginPage() {
  const router = useRouter();
  const [showDebugger, setShowDebugger] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isBiometricsAvailable, authenticateWithBiometrics } = useBiometricAuth();
  const { authenticate, register, discoverExistingCredentials, isAuthenticating, isRegistering: webAuthnRegistering } = useAdvancedWebAuthn();
  const [hasSavedWallet, setHasSavedWallet] = useState(false);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [showExistingWalletOptions, setShowExistingWalletOptions] = useState(false);
  const [createNewWallet, setCreateNewWallet] = useState(false);
  const [existingWalletAddress, setExistingWalletAddress] = useState<string | null>(null);
  const [showNoWalletMessage, setShowNoWalletMessage] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const addDebugLog = (message: string) => {
    console.log(message);
    setDebugLog(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]}: ${message}`]);
  };
  
  const formatError = (err: any): string => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    // Handle rate limit errors
    if (errorMessage.includes('429') && errorMessage.includes('Too many request')) {
      return 'The network is busy right now. Please try again in a few moments.';
    }
    
    // Handle WebAuthn/biometric errors
    if (errorMessage.includes('NotAllowedError') || 
        errorMessage.includes('operation either timed out or was not allowed')) {
      return 'Biometric authentication was denied or timed out.';
    }
    
    return errorMessage;
  };
  
  // Used in Sign In with Biometrics
  const handleBiometricAuth = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      addDebugLog('Starting biometric authentication...');
      
      // Get authentication challenge
      const challengeResponse = await fetch('/api/auth/challenge');
      if (!challengeResponse.ok) {
        throw new Error('Failed to get authentication challenge');
      }
      
      const challengeData = await challengeResponse.json();
      
      addDebugLog(`Challenge received, wallet verification: ${challengeData.walletVerification ? 'Yes' : 'No'}`);

      // Authenticate with biometrics
      const authResult = await authenticateWithBiometrics(challengeData.challenge);
      
      if (!authResult.success) {
        if (authResult.error === 'No user found. Please register first.') {
          // Show registration options
          setError(null);
          setIsSigningIn(false);
          setShowNoWalletMessage(true);
          return;
        }
        throw new Error(authResult.error || 'Authentication failed');
      }

      addDebugLog('Biometric authentication successful, loading wallet');
      
      // Store user ID for later use with wallet creation if needed
      setAuthenticatedUserId(authResult.userId ?? null);
      
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
      
      // Read the response body once
      const responseData = await loadWalletResponse.json();
      
/*       // Check for 404 error that indicates no wallet found
      if (loadWalletResponse.status === 404) {
        // If the error indicates the user needs to create a wallet
        if (responseData.needsWalletCreation) {
          // User has a biometric credential but no wallet
          addDebugLog('No wallet found for this user.');
          
          // Set an informative message and flag
          setError(null); // Clear error state since this is a normal flow
          setIsSigningIn(false);
          setShowNoWalletMessage(true);
          
          return;
        }
      } */
      
      // Check if there are multiple wallets associated with this credential
      if (loadWalletResponse.ok) {
        if (responseData.success) {
          if (responseData.multipleWallets) {
            addDebugLog('Multiple wallets found for this credential');
          }
          
          // Success - proceed to dashboard
          addDebugLog(`Wallet loaded: ${responseData.wallet.address}`);
          setError(null);
          
          // Redirect to dashboard
          router.push('/');
          return;
        }
      }
      
      // Handle other errors
      if (!loadWalletResponse.ok) {
        if (loadWalletResponse.status === 429) {
          addDebugLog('Rate limit exceeded, please try again later');
          throw new Error('The Sepolia network is busy right now. Please try again in a few moments (Rate limit exceeded).');
        }
        
        throw new Error(`Failed to load wallet: ${responseData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Authentication error:', err);
      const errorMsg = formatError(err);
      addDebugLog(`Error: ${errorMsg}`);
      setError(errorMsg);
    } finally {
      setIsSigningIn(false);
    }
  };
  
  const checkBiometricCredential = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const credentials = await discoverExistingCredentials();

      /* const credentials = await discoverExistingCredentials(); */
      //* Path 1: Found existing credential -> wallet creation
      if (credentials && credentials.id) {
        addDebugLog('Found existing credential, starting create wallet process...');

        const response = await fetch('/api/wallet/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            useExistingCredential: true,
            credentials: credentials
          }),
        });

        const data = await response.json();
        console.log('Wallet creation response data:', data);
        if (!data.success) {
          throw new Error(data.error || 'Failed to create wallet');
        }

        // Always log what we received
        addDebugLog(`Wallet created with address: ${data.walletAddress}`);
        addDebugLog(`Recovery key present: ${!!data.recoveryKey}`);
        console.log('Recovery key from response:', data.recoveryKey);

        if (data.recoveryKey) {
          addDebugLog('Showing recovery key UI');
          setRecoveryKey(data.recoveryKey);
          setWalletAddress(data.walletAddress);
          setShowRecoveryKey(true);
        } else if (data.isExistingWallet) {
          // Show options for existing wallet instead of redirecting
          addDebugLog('Existing wallet found, showing options');
          setExistingWalletAddress(data.walletAddress);
          setShowExistingWalletOptions(true);
        } else {
          // This case shouldn't happen - we should always have a recovery key for new wallets
          console.error('No recovery key found for new wallet');
          setError('Wallet created but recovery key is missing. Please contact support.');
        }
      } else {
       // Add this check at the start of checkBiometricCredential()
        const cookieStore = cookies();
        const session = cookieStore.get('session')?.value;
        const existingUserId = cookieStore.get('userId')?.value;

        if (session === 'authenticated' && existingUserId) {
          setError('Cannot register while logged in. Please log out first.');
          return;
        }
        
        //* Path 2: No credential found, create a new bio credential -> wallet creation
        addDebugLog('Starting registration...');
        const username = `user_${Date.now()}`;
        
        //? Register the user & device
        const registrationResponse = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            username,
            deviceName: 'Default Device',
          }),
        });

        if (!registrationResponse.ok) {
          const error = await registrationResponse.json();
          throw new Error(error.error || 'Failed to start registration');
        }

        const { options } = await registrationResponse.json();
        addDebugLog('Got registration options from server');

        // Now use the advanced WebAuthn hook to complete registration
        const result = await register(username, 'Default Device', options);
        console.log('Registration result:', result);
        
        if (result.success) {
          // Extract userId from the registration result
          const userId = result.userId;
          if (!userId) {
            console.error('Registration successful but no userId returned');
            setError('Registration failed - missing user ID');
            return;
          }

          // Check if we already got a wallet address from registration
          if (result.walletAddress && result.recoveryKey) {
            addDebugLog(`Registration successful with wallet address: ${result.walletAddress}`);
            setRecoveryKey(result.recoveryKey);
            setWalletAddress(result.walletAddress);
            setShowRecoveryKey(true);
            return;
          }

          // Only call wallet creation if we didn't get a wallet from registration
          addDebugLog('Registration successful, creating wallet...');
          const response = await fetch('/api/wallet/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: userId,
              useExistingCredential: true,
              credentialId: result.credential?.id
            }),
          });

          const data = await response.json();
          console.log('Wallet creation response data:', data);
          if (!data.success) {
            throw new Error(data.error || 'Failed to create wallet');
          }

          // Always log what we received
          addDebugLog(`Wallet created with address: ${data.walletAddress}`);
          addDebugLog(`Recovery key present: ${!!data.recoveryKey}`);
          console.log('Recovery key from response:', data.recoveryKey);

          if (data.recoveryKey) {
            addDebugLog('Showing recovery key UI');
            setRecoveryKey(data.recoveryKey);
            setWalletAddress(data.walletAddress);
            setShowRecoveryKey(true);
          } else if (data.isExistingWallet) {
            // Show options for existing wallet instead of redirecting
            addDebugLog('Existing wallet found, showing options');
            setExistingWalletAddress(data.walletAddress);
            setAuthenticatedUserId(userId);
            setShowExistingWalletOptions(true);
          } else {
            // This case shouldn't happen - we should always have a recovery key for new wallets
            console.error('No recovery key found for new wallet');
            setError('Wallet created but recovery key is missing. Please contact support.');
          }
        } else {
          // Only treat it as an error if success is false
          console.error('Registration failed:', result.error);
          setError(result.error || 'Registration failed - please try again');
        }
      }
    } catch (error) {
      console.error('Error in biometric check:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      addDebugLog(`Error: ${errorMessage}`);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  const addExistingWallet = () => {
    setShowNoWalletMessage(false);
    addDebugLog('Add existing wallet feature not implemented yet');
    // Could navigate to an import page, or open a modal
    // router.push('/import-wallet');
  };
  
  const handleContinueAfterRecovery = () => {
    setShowRecoveryKey(false);
    router.push('/');
  };

  // Add a function to copy text to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addDebugLog('Wallet address copied to clipboard');
      // You could also add a toast notification here
    } catch (err) {
      console.error('Failed to copy: ', err);
      addDebugLog('Failed to copy wallet address');
    }
  };

  // Success UI with recovery key
  if (showRecoveryKey && recoveryKey) {
    return (
      <div className="w-full max-w-md p-4">
        <div className="bg-yellow-900/30 border border-yellow-600 text-yellow-200 px-4 py-3 rounded-lg mb-4" role="alert">
          <strong className="font-bold">Important!</strong>
          <div className="bg-gray-900 p-4 rounded-lg text-center font-mono break-all text-gray-200">
          {recoveryKey}
         </div>
          <p className="mt-1"> Save this recovery key securely. It will only be shown once.  If you lose access to your device, you'll need this key to recover your wallet.</p>
        </div>
        
        {walletAddress && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-400">Wallet Address:</h3>
            <div className="bg-gray-900 p-2 rounded-lg flex items-center justify-between text-sm text-gray-300">
              <div className="font-mono break-all flex-1 mr-2 overflow-hidden text-ellipsis">
                {walletAddress}
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => copyToClipboard(walletAddress)}
                  className="p-1.5 text-gray-400 hover:text-gray-200 bg-gray-800 rounded-md transition-colors"
                  title="Copy to clipboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <a 
                  href={`https://sepolia.basescan.org/address/${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-400 hover:text-gray-200 bg-gray-800 rounded-md transition-colors"
                  title="View on Basescan"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        )}
        
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
    <div className="w-full max-w-md mx-auto my-auto">
      {error && (
        <div className="p-4 bg-red-900/50 border border-red-600 rounded-lg text-center text-white mb-4">
          {error}
        </div>
      )}
      
      {/* Show "no wallet" message when appropriate */}
      {showNoWalletMessage && (
        <div className="p-2 mb-4 bg-transparent border border-red-500 rounded-lg text-center">
          <p className="text-red-300 text-sm">You have no wallet yet</p>
        </div>
      )}
      
      {showExistingWalletOptions && authenticatedUserId ? (
        <div className="bg-gray-900 border border-violet-500 rounded-lg p-6">
          <p className="mb-3 text-center">You have an existing wallet:</p>
          
          {existingWalletAddress && (
            <div className="bg-gray-800 p-3 rounded-lg text-center mb-6 font-mono text-sm overflow-hidden">
              {existingWalletAddress}
            </div>
          )}
          
          <div className="flex flex-col gap-4">
            <button 
              onClick={() => {
                // Navigate directly to dashboard instead of showing creation handler
                router.push('/');
              }}
              className="py-3 px-4 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center justify-center"
            >
              Use This Wallet
            </button>
            
            <div className="relative flex items-center my-2">
              <div className="flex-grow border-t border-gray-600"></div>
              <span className="flex-shrink mx-4 text-gray-400 text-sm">OR</span>
              <div className="flex-grow border-t border-gray-600"></div>
            </div>
            
            <button 
              onClick={() => {
                // Create a new wallet with the same biometric credential
                setShowExistingWalletOptions(false);
                setCreateNewWallet(true);
                checkBiometricCredential();
              }}
              className="py-3 px-4 bg-black border border-violet-500 text-violet-500 rounded-lg hover:border-violet-600 flex items-center justify-center"
            >
              <svg className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
              </svg>
              Create A New Wallet
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <button 
            onClick={handleBiometricAuth}
            disabled={isSigningIn}
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
          
          <button
            onClick={addExistingWallet}
            disabled={isSigningIn}
            className="w-full bg-black border border-violet-500 text-violet-500 py-4 px-4 rounded-lg flex flex-row items-center justify-center cursor-pointer hover:border-violet-700 disabled:opacity-50"
          >
            <svg className="h-8 w-8 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
            <div>Add an existing wallet</div>
          </button>
          
          <button
            onClick={checkBiometricCredential}
            disabled={isSigningIn || webAuthnRegistering}
            className="w-full bg-black border border-violet-500 text-violet-500 py-4 px-4 rounded-lg flex flex-row items-center justify-center cursor-pointer hover:border-violet-700 disabled:opacity-50"
          >
            {webAuthnRegistering ? (
              <svg className="animate-spin h-8 w-8 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mr-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                </svg>
                Create a new wallet
              </>
            )}
          </button>
        </div>
      )}
      
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
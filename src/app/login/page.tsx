'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBiometricAuth } from '@/lib/hooks/useBiometricAuth';
import { useWebAuthnRegistration } from '@/lib/hooks/useWebAuthnRegistration';
import WalletCreationHandler from './WalletCreationHandler';

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
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [showCreationHelper, setShowCreationHelper] = useState(false);
  const [showExistingWalletOptions, setShowExistingWalletOptions] = useState(false);
  const [createNewWallet, setCreateNewWallet] = useState(false);
  const [existingWalletAddress, setExistingWalletAddress] = useState<string | null>(null);
  const [createdWalletAddress, setCreatedWalletAddress] = useState<string | null>(null);
  const [createdWalletRecoveryKey, setCreatedWalletRecoveryKey] = useState<string | null>(null);
  
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
      
      // Store recovery key in localStorage for potential retrieval later
      if (registrationResult.recoveryKey) {
        try {
          localStorage.setItem(
            `recovery_key_${registrationResult.userId || 'default'}`, 
            registrationResult.recoveryKey
          );
        } catch (e) {
          console.error('Failed to store recovery key:', e);
        }
      }
    }
  }, [registrationResult]);
  
  // If we have an authenticated user ID and an error or loading state persists,
  // show the wallet creation handler to check real status
  useEffect(() => {
    if (authenticatedUserId && (error || isCreatingWallet)) {
      setShowCreationHelper(true);
    }
  }, [authenticatedUserId, error, isCreatingWallet]);
  
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

      // First check if there's a biometric credential registered
      if (!challengeData.walletVerification) {
        throw new Error('No biometric credential found. Please create a wallet first.');
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
          // User has a biometric credential but no wallet - ask if they want to create one
          addDebugLog('No wallet found for this user. Prompting to create one.');
          
          // Store user ID for later use
          setAuthenticatedUserId(authResult.userId ?? null);
          
          // Set an informative message and offer to create a wallet
          setError('Your biometric credential has no wallet associated with it. Please create a wallet first.');
          
          // Show the creation handler
          setShowCreationHelper(true);
          setCreateNewWallet(false);
          
          // Create a wallet using the existing authenticated user ID
          const createWalletResponse = await fetch('/api/wallet/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              userId: authResult.userId,
              forceCreate: true
            }),
          });
          
          if (!createWalletResponse.ok) {
            const errorData = await createWalletResponse.json();
            throw new Error(errorData.error || 'Failed to create wallet with existing credential');
          }
          
          setIsSigningIn(false);
          return;
        }
      }
      
      // Check if there are multiple wallets associated with this credential
      if (loadWalletResponse.ok) {
        const walletData = await loadWalletResponse.json();
        
        if (walletData.success) {
          if (walletData.multipleWallets) {
            // TODO: Implement wallet selection UI if needed
            addDebugLog('Multiple wallets found for this credential');
          }
          
          // Success - proceed to dashboard
          addDebugLog(`Wallet loaded: ${walletData.wallet.address}`);
          setError(null);
          
          // Redirect to dashboard
          router.push('/');
          return;
        }
      }
      
      // Handle other errors
      if (!loadWalletResponse.ok) {
        // Special handling for rate limits
        if (loadWalletResponse.status === 429) {
          addDebugLog('Rate limit exceeded, please try again later');
          throw new Error('The Sepolia network is busy right now. Please try again in a few moments (Rate limit exceeded).');
        }
        
        const errorText = await loadWalletResponse.text();
        throw new Error(`Failed to load wallet: ${errorText}`);
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
      setIsCreatingWallet(true);
      setError(null);
      addDebugLog('Checking for existing biometric credentials...');
      
      // First check if the user has existing WebAuthn credentials
      const challengeResponse = await fetch('/api/auth/challenge');
      if (!challengeResponse.ok) {
        throw new Error('Failed to get challenge for credential check');
      }
      
      const challengeData = await challengeResponse.json();
      
      // If walletVerification is true, it means there's a credential
      if (challengeData.walletVerification) {
        addDebugLog('Found existing biometric credential, authenticating...');
        
        // Try to authenticate with existing biometric credential
        const authResult = await authenticateWithBiometrics(challengeData.challenge);
        
        if (!authResult.success) {
          throw new Error(authResult.error || 'Authentication failed');
        }
        
        addDebugLog(`Authenticated with existing credential, user ID: ${authResult.userId}`);
        
        // First check if the user already has a wallet
        const checkWalletResponse = await fetch('/api/wallet/load', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            userId: authResult.userId 
          }),
        });
        
        if (checkWalletResponse.ok) {
          const walletData = await checkWalletResponse.json();
          
          if (walletData.success && walletData.wallet && walletData.wallet.address) {
            // User has an existing wallet - ask if they want to use it or create a new one
            const walletAddress = walletData.wallet.address;
            const shortenedAddress = `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`;
            
            // Clear any error message as this is not really an error
            setError(null);
            
            // Store user ID for later use
            setAuthenticatedUserId(authResult.userId ?? null);
            
            // Show the existing wallet options
            setShowExistingWalletOptions(true);
            setIsCreatingWallet(false);
            addDebugLog(`Found existing wallet: ${walletAddress}. Showing options.`);
            setExistingWalletAddress(walletAddress);
            return;
          }
        }
        
        // If we get here, there's a credential but no wallet associated with it
        addDebugLog('Credential exists but no wallet found. Creating new wallet with existing credential.');
        
        // Use this authenticated credential to create a new wallet
        setError(null);
        
        // Store user ID for helper component
        setAuthenticatedUserId(authResult.userId ?? null);
        
        // Show the creation handler to track real-time status
        setShowCreationHelper(true);
        setCreateNewWallet(false);
        
        // Create a wallet using the existing authenticated user ID
        const createWalletResponse = await fetch('/api/wallet/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            userId: authResult.userId,
            forceCreate: true
          }),
        });
        
        if (!createWalletResponse.ok) {
          const errorData = await createWalletResponse.json();
          throw new Error(errorData.error || 'Failed to create wallet with existing credential');
        }
        
        return;
      } else {
        // No existing credential, so register a new one and create a wallet
        addDebugLog('No existing credential found. Starting WebAuthn registration process');
        
        // Generate a default username based on timestamp
        const defaultUsername = `user_${Date.now()}`;
        
        // First phase: Register the WebAuthn credential
        const result = await register({ username: defaultUsername });
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to create wallet');
        }
        
        addDebugLog('WebAuthn registration successful');
        setError('Connecting to Sepolia blockchain, this may take a moment...');
      }
    } catch (err) {
      console.error('Credential check error:', err);
      const errorMsg = formatError(err);
      addDebugLog(`Error: ${errorMsg}`);
      setError(errorMsg);
    } finally {
      setIsCreatingWallet(false);
    }
  };
  
  const createWallet = async (createNew = false) => {
    try {
      setIsCreatingWallet(true);
      setError(null);
      setCreateNewWallet(createNew);
      addDebugLog('Creating new wallet with existing credential...');
      
      // If we're here from the "Create New Wallet" option on the existing wallet panel,
      // we already have the authenticatedUserId
      if (createNew && authenticatedUserId) {
        // Force a random salt nonce for new wallet
        const randomSalt = Math.floor(Math.random() * 1000000) + 1;
        addDebugLog(`Using random salt nonce: ${randomSalt} to force new wallet address`);
        
        // Show the creation helper with createNewWallet flag set to true
        setShowCreationHelper(true);
        
        // Clear any old wallet address from previous creation
        setExistingWalletAddress(null);
        
        // Create a wallet using the existing authenticated user ID
        const createWalletResponse = await fetch('/api/wallet/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            userId: authenticatedUserId,
            forceCreate: true,
            createNewWallet: true,
            randomSalt: randomSalt
          }),
        });
        
        if (!createWalletResponse.ok) {
          const errorData = await createWalletResponse.json();
          throw new Error(errorData.error || 'Failed to create new wallet with existing credential');
        }
        
        const walletData = await createWalletResponse.json();
        
        // Store the wallet address directly in state
        if (walletData.walletAddress) {
          addDebugLog(`New wallet address created: ${walletData.walletAddress}`);
          
          // Set the new wallet address directly in state for the creation handler to use
          setCreatedWalletAddress(walletData.walletAddress);
          
          // Clear any previous wallet address
          setExistingWalletAddress(null);
        }
        
        // Store recovery key directly in state
        if (walletData.recoveryKey) {
          addDebugLog(`Got recovery key for wallet ${walletData.walletAddress}`);
          setCreatedWalletRecoveryKey(walletData.recoveryKey);
        } else {
          addDebugLog('Warning: No recovery key received from API for the new wallet');
        }
        
        return;
      }
      
      // For new users, let the checkBiometricCredential handle the flow
      setIsCreatingWallet(false);
      checkBiometricCredential();
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
    <div className="w-full max-w-md mx-auto my-auto">
      {error && !showCreationHelper && (
        <div className="p-4 bg-red-900/50 border border-red-600 rounded-lg text-center text-white mb-4">
          {error}
        </div>
      )}
      
      {/* Show helper component when wallet creation is in progress */}
      {showCreationHelper && authenticatedUserId ? (
        <WalletCreationHandler 
          userId={authenticatedUserId} 
          createNewWallet={createNewWallet}
          createdWalletAddress={createdWalletAddress}
          createdWalletRecoveryKey={createdWalletRecoveryKey}
        />
      ) : showExistingWalletOptions && authenticatedUserId ? (
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
                // Just show the wallet creation handler with the existing wallet
                setShowCreationHelper(true);
                setCreateNewWallet(false);
                setShowExistingWalletOptions(false);
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
                createWallet(true);
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
            onClick={() => checkBiometricCredential()}
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
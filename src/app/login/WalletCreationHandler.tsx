import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface WalletCreationHandlerProps {
  userId: string;
  createNewWallet?: boolean;
  createdWalletAddress?: string | null;
  createdWalletRecoveryKey?: string | null;
}

export default function WalletCreationHandler({ 
  userId, 
  createNewWallet = false,
  createdWalletAddress = null,
  createdWalletRecoveryKey = null
}: WalletCreationHandlerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'success' | 'failed'>('checking');
  const [message, setMessage] = useState(
    createNewWallet 
      ? "Creating a new wallet with your existing biometric credential..." 
      : "Creating wallet with your biometric credential..."
  );
  const [walletAddress, setWalletAddress] = useState<string | null>(createdWalletAddress);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(createdWalletRecoveryKey);
  const [error, setError] = useState<string | null>(null);
  
  // If we already have the wallet address and recovery key directly passed in, show success immediately
  useEffect(() => {
    if (createdWalletAddress) {
      console.log(`Using provided created wallet address: ${createdWalletAddress}`);
      setWalletAddress(createdWalletAddress);
      setStatus('success');
      setMessage(createNewWallet 
        ? `Your new wallet has been created successfully.` 
        : `Your wallet has been created successfully.`
      );
    }
    
    if (createdWalletRecoveryKey) {
      console.log('Using provided created wallet recovery key');
      setRecoveryKey(createdWalletRecoveryKey);
    }
  }, [createdWalletAddress, createdWalletRecoveryKey, createNewWallet]);
  
  // Update when new props are received
  useEffect(() => {
    if (createdWalletAddress && createdWalletAddress !== walletAddress) {
      setWalletAddress(createdWalletAddress);
      setStatus('success');
    }
    
    if (createdWalletRecoveryKey && createdWalletRecoveryKey !== recoveryKey) {
      setRecoveryKey(createdWalletRecoveryKey);
    }
  }, [createdWalletAddress, createdWalletRecoveryKey, walletAddress, recoveryKey]);
  
  useEffect(() => {
    // If we already have the wallet address directly passed in, no need to poll
    if (createdWalletAddress) {
      return;
    }
    
    let intervalId: NodeJS.Timeout;
    let isActive = true;
    
    // Removed localStorage checks since we're now using direct props
    
    const checkWalletStatus = async () => {
      // Only proceed if component is still mounted
      if (!isActive) return;
      
      try {
        // First try using the creation-status endpoint with createNewWallet flag
        const creationStatusResponse = await fetch('/api/wallet/creation-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            userId,
            createNewWallet 
          }),
        });
        
        if (creationStatusResponse.ok) {
          const statusData = await creationStatusResponse.json();
          console.log('Wallet creation status response:', statusData);
          
          // Check if we're getting a "no wallet" error consistently
          if (!statusData.success && statusData.error && statusData.error.includes('No wallet creation process found')) {
            console.log('No wallet found and no creation process active - stopping polling');
            // Stop polling after confirming user doesn't have a wallet
            clearInterval(intervalId);
            return;
          }
          
          // Check for wallet address - if we have one, we're done
          if (statusData.success && statusData.wallet && statusData.wallet.address) {
            if (createNewWallet && walletAddress !== null && walletAddress !== statusData.wallet.address) {
              console.log(`Wallet address mismatch: UI has ${walletAddress}, latest response has ${statusData.wallet.address}`);
            }
            
            if (isActive) {
              console.log(`Setting wallet address in UI to: ${statusData.wallet.address} (from creation-status, createNewWallet: ${createNewWallet})`);
              setStatus('success');
              setWalletAddress(statusData.wallet.address);
              setMessage(createNewWallet 
                ? `Your new wallet has been created successfully.` 
                : `Your wallet has been created successfully.`
              );
              
              // Try to get recovery key if available
              const storedRecoveryKey = localStorage.getItem(`recovery_key_${userId}`);
              if (storedRecoveryKey) {
                setRecoveryKey(storedRecoveryKey);
                console.log('Recovery key found and set in UI');
              } else {
                console.log('No recovery key found in localStorage');
              }
              
              // We can stop polling now
              clearInterval(intervalId);
            }
            return;
          }
          
          // If wallet creation is in progress, update the message
          if (statusData.isCreating) {
            if (isActive) {
              setMessage(statusData.message || 'Wallet creation in progress...');
            }
            return;
          }
        }
        
        // Fallback to /api/wallet/load with includeNewWallet parameter
        const loadResponse = await fetch('/api/wallet/load', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            userId,
            includeNewWallet: createNewWallet 
          }),
        });
        
        if (loadResponse.ok) {
          const data = await loadResponse.json();
          console.log('Wallet load response:', data);
          
          if (data.success && data.wallet && data.wallet.address) {
            if (isActive) {
              console.log(`Setting wallet address in UI to: ${data.wallet.address} (from wallet-load, includeNewWallet: ${createNewWallet})`);
              setStatus('success');
              setWalletAddress(data.wallet.address);
              setMessage(createNewWallet 
                ? `Your new wallet has been created successfully.` 
                : `Your wallet has been created successfully.`
              );
              
              // Try to get recovery key from storage
              const storedRecoveryKey = localStorage.getItem(`recovery_key_${userId}`);
              if (storedRecoveryKey) {
                setRecoveryKey(storedRecoveryKey);
              }
              
              // Stop polling
              clearInterval(intervalId);
            }
            return;
          }
        } else if (loadResponse.status === 404) {
          // Wallet not found - stop polling after confirming
          const errorData = await loadResponse.json();
          if (errorData.needsWalletCreation) {
            console.log('No wallet found for this user - stopping polling');
            // Stop polling since we've confirmed the user needs to create a wallet
            clearInterval(intervalId);
            
            // Update status to reflect "no wallet" state
            if (isActive) {
              setStatus('failed');
              setError('No wallet found for this user.');
              setMessage('You need to create a wallet first.');
            }
          }
          return;
        }
      } catch (err) {
        console.error('Error checking wallet status:', err);
        if (isActive) {
          setStatus('failed');
          setError(err instanceof Error ? err.message : 'Failed to check wallet status');
          setMessage('Error occurred while checking wallet status');
          
          // Stop polling on error
          clearInterval(intervalId);
        }
      }
    };
    
    // Initial check
    checkWalletStatus();
    
    // Set up polling every 3 seconds instead of every second
    intervalId = setInterval(checkWalletStatus, 3000);
    
    // Cleanup on unmount
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [userId, createNewWallet]);
  
  // Success UI with wallet address and recovery key
  if (status === 'success') {
    return (
      <div className="bg-gray-900 border border-violet-500 rounded-lg p-6">
        <div className="bg-green-900/40 border border-green-600 rounded-lg p-4 mb-4">
          <h3 className="text-xl text-green-400 font-semibold">Success!</h3>
          <p className="text-white">
            {createNewWallet 
              ? "Your new wallet has been created successfully." 
              : "Your wallet has been loaded successfully."}
          </p>
        </div>
        
        <div className="mb-4">
          <p className="text-gray-400 mb-1">Wallet Address:</p>
          <div className="bg-black p-4 rounded-lg text-sm font-mono overflow-auto flex justify-between items-center">
            <span className="break-all">{walletAddress}</span>
            <button 
              onClick={() => {
                if (walletAddress) {
                  navigator.clipboard.writeText(walletAddress);
                }
              }}
              className="ml-2 p-1 text-gray-400 hover:text-white focus:outline-none"
              title="Copy to clipboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
          </div>
        </div>
        
        {recoveryKey ? (
          <div className="mb-4">
            <div className="bg-yellow-900/40 border border-yellow-600 rounded-lg p-4 mb-2">
              <h3 className="text-yellow-400 font-semibold mb-1">Important: Save Your Recovery Key!</h3>
              <p className="text-white text-sm">
                Store this key securely. You'll need it to recover your wallet if you lose access to your device.
              </p>
            </div>
            
            <div className="bg-black p-3 rounded-lg text-center font-mono break-all text-sm text-yellow-300 relative">
              {recoveryKey}
              <button 
                onClick={() => {
                  if (recoveryKey) {
                    navigator.clipboard.writeText(recoveryKey);
                  }
                }}
                className="absolute top-2 right-2 p-1 text-gray-400 hover:text-white focus:outline-none"
                title="Copy to clipboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button>
            </div>
          </div>
        ) : createNewWallet ? (
          <div className="mb-4 bg-gray-900/30 border border-gray-600 text-gray-200 px-4 py-3 rounded-lg">
            <p className="mt-1 text-sm">
              The recovery key is the same as your first wallet.
            </p>
          </div>
        ) : null}
        
        <button
          onClick={() => router.push('/')}
          className="w-full py-3 px-4 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 focus:outline-none"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }
  
  // Failed UI with error details
  if (status === 'failed') {
    return (
      <div className="p-4 bg-gray-900 border border-red-500 rounded-lg">
        <div className="mb-4 bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded-lg" role="alert">
          <strong className="font-bold">Creation Failed</strong>
          <p className="mt-1">{message}</p>
        </div>
        
        {error && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-400 mb-1">Error Details:</h3>
            <div className="bg-black p-2 rounded-lg text-sm text-red-400 overflow-auto">
              {error}
            </div>
          </div>
        )}
        
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 py-3 px-4 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-700"
          >
            Try Again
          </button>
          
          <button
            onClick={() => router.push('/')}
            className="flex-1 py-3 px-4 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  // Loading/checking UI
  return (
    <div className="p-4 bg-black text-white rounded-lg">
      <div className="flex items-center mb-4">
        <svg className="animate-spin h-5 w-5 mr-3 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p>{message}</p>
      </div>
      
      <p className="text-sm text-gray-400">
        Verifying wallet creation on the blockchain...
      </p>
    </div>
  );
} 
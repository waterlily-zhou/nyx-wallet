'use client';

import { useState, useEffect, useRef } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { getDeviceKey } from '@/lib/client/secure-storage';
import type { Hex } from 'viem';

interface TransactionDetails {
  recipient: string;
  amount: string;
  network: string;
}

interface TransactionStatusProps {
  walletAddress: string;
  transactionDetails: TransactionDetails;
  gasOption: 'default' | 'sponsored' | 'usdc' | 'bundler';
  onFinish: () => void;
}

interface TransactionResult {
  success: boolean;
  userOpHash?: string;
  explorerUrl?: string;
  error?: string;
}

export default function TransactionStatus({ 
  walletAddress, 
  transactionDetails, 
  gasOption,
  onFinish 
}: TransactionStatusProps) {
  const [status, setStatus] = useState<'submitting' | 'authenticating' | 'success' | 'error'>('submitting');
  const [result, setResult] = useState<TransactionResult | null>(null);
  
  // Create refs outside useEffect to persist across re-renders
  const transactionInProgress = useRef<string | null>(null);
  const isTransactionActive = useRef(false);
  const isMounted = useRef(true);
  
  // Generate transaction ID once on mount
  const transactionId = useRef(`${walletAddress}-${Date.now()}`);
  
  // Handle component mount/unmount
  useEffect(() => {
    console.log('🔄 Component mounted');
    isMounted.current = true;
    return () => {
      console.log('🔄 Component unmounting');
      isMounted.current = false;
      // Clean up any ongoing transaction
      if (transactionInProgress.current) {
        console.log('🧹 Cleaning up transaction on unmount:', transactionInProgress.current);
        transactionInProgress.current = null;
        isTransactionActive.current = false;
      }
    };
  }, []); // Empty dependency array since this only handles mount/unmount

  // Safe state setter that only updates if component is mounted
  const safeSetState = (setter: Function, value: any) => {
    if (isMounted.current) {
      setter(value);
    }
  };
  
  // Separate useEffect for transaction logic
  useEffect(() => {
    // Don't start a new transaction if one is already in progress
    if (transactionInProgress.current || isTransactionActive.current) {
      console.log('🔄 Transaction already in progress, skipping:', transactionInProgress.current);
      return;
    }

    const currentTransactionId = transactionId.current;
    
    const sendTransaction = async () => {
      // Set transaction as active immediately
      isTransactionActive.current = true;
      transactionInProgress.current = currentTransactionId;

      console.log('🚀 Starting transaction flow:', {
        transactionId: currentTransactionId,
        walletAddress,
        recipient: transactionDetails.recipient,
        amount: transactionDetails.amount,
        gasOption
      });

      try {
        // 1. Get WebAuthn challenge and device key in a single request
        console.log('📤 Requesting transaction challenge...');
        const challengeResponse = await fetch('/api/auth/transaction-challenge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: transactionDetails.recipient,
            value: transactionDetails.amount,
            data: '0x', // Simple ETH transfer
            includeDeviceKey: true
          })
        });

        if (!isMounted.current) {
          console.log('⚠️ Component unmounted during challenge request');
          return;
        }

        if (!challengeResponse.ok) {
          throw new Error('Failed to get transaction challenge');
        }

        const { challenge, options, deviceKeyId } = await challengeResponse.json();
        
        // Set status before starting WebAuthn
        safeSetState(setStatus, 'authenticating');

        // 2. Get WebAuthn signature
        let webAuthnResponse;
        try {
          webAuthnResponse = await startAuthentication({ optionsJSON: options });
          
          if (!isMounted.current) {
            console.log('⚠️ Component unmounted during WebAuthn');
            return;
          }
        } catch (webAuthnError) {
          if (isMounted.current) {
            console.error('❌ WebAuthn authentication failed:', webAuthnError);
          }
          throw webAuthnError;
        }

        // Set status back to submitting for transaction
        safeSetState(setStatus, 'submitting');

        // 3. Send the transaction
        const response = await fetch('/api/transaction/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: transactionDetails.recipient,
            value: transactionDetails.amount,
            data: '0x',
            gasPaymentMethod: gasOption,
            webAuthnResponse,
            transactionChallenge: challenge
          })
        });

        if (!isMounted.current) {
          console.log('⚠️ Component unmounted during transaction send');
          return;
        }

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Transaction failed to send');
        }

        safeSetState(setStatus, 'success');
        safeSetState(setResult, {
          success: true,
          userOpHash: data.data?.userOpHash,
          explorerUrl: data.data?.explorerUrl
        });

      } catch (error) {
        if (isMounted.current) {
          console.error('❌ Transaction error:', error);
          safeSetState(setStatus, 'error');
          safeSetState(setResult, {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send transaction'
          });
        }
      } finally {
        if (isMounted.current) {
          console.log('🧹 Cleaning up transaction state:', currentTransactionId);
          transactionInProgress.current = null;
          isTransactionActive.current = false;
        }
      }
    };

    // Start transaction if mounted
    if (isMounted.current) {
      sendTransaction();
    }

    // Cleanup function
    return () => {
      if (transactionInProgress.current === currentTransactionId) {
        console.log('🔄 Cleaning up specific transaction:', currentTransactionId);
        transactionInProgress.current = null;
        isTransactionActive.current = false;
      }
    };
  }, [walletAddress, transactionDetails.recipient, transactionDetails.amount, gasOption]); // Include all dependencies

  // Update the render logic to use the new status state
  return (
    <div className="w-full max-w-lg mx-auto text-center">
      {status === 'submitting' || status === 'authenticating' ? (
        // Loading state
        <div className="space-y-8">
          <h2 className="text-3xl font-bold">
            {status === 'authenticating' ? 'Waiting for Authentication' : 'Processing Transaction'}
          </h2>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-20 w-20 border-b-2 border-violet-500"></div>
          </div>
          <p className="text-gray-300">
            {status === 'authenticating' 
              ? 'Please complete the authentication request...'
              : 'Your transaction is being processed. Please wait...'}
          </p>
        </div>
      ) : status === 'success' ? (
        // Success state
        <div className="space-y-8">
          <h2 className="text-3xl font-bold">Transaction completed!</h2>
          
          <div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          
          <p className="text-gray-300">
            It will take a few minutes to be confirmed on chain.
          </p>
          
          {result?.userOpHash && (
            <div className="p-4 bg-gray-900 rounded-lg inline-block mx-auto text-center mt-4">
              <p className="text-sm text-gray-400 mb-2">Transaction Hash:</p>
              <p className="font-mono text-sm break-all">{result.userOpHash}</p>
            </div>
          )}
          
          {result?.explorerUrl && (
            <div>
              <button
                onClick={() => window.open(result.explorerUrl, '_blank')}
                className="text-violet-400 hover:text-violet-300 flex items-center justify-center mx-auto"
              >
                <span>Check on</span>
                <span className="ml-1">→</span>
                <span className="ml-1">Etherscan</span>
              </button>
            </div>
          )}
          
          <button
            onClick={onFinish}
            className="mt-8 px-6 py-3 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700"
          >
            Back to Dashboard
          </button>
        </div>
      ) : (
        // Error state
        <div className="space-y-8">
          <h2 className="text-3xl font-bold">Transaction Failed</h2>
          
          <div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          
          <p className="text-gray-300">
            There was an error processing your transaction.
          </p>
          
          {result?.error && (
            <div className="p-4 bg-red-900/20 border border-red-600 rounded-lg mx-auto text-left mt-4">
              <p className="text-sm text-red-300">{result.error}</p>
            </div>
          )}
          
          <div className="flex gap-4 justify-center">
            <button
              onClick={onFinish}
              className="px-6 py-3 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 
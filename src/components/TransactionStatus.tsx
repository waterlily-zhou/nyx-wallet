'use client';

import { useState, useEffect, useRef } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { getDeviceKey } from '@/lib/client/secure-storage';
import { useTransaction } from '@/contexts/TransactionContext';
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
  visible: boolean;
}

interface TransactionResult {
  success: boolean;
  userOpHash?: string;
  explorerUrl?: string;
  error?: string;
}

// Global flag to track if WebAuthn is in progress across all component instances
let globalWebAuthnInProgress = false;

export default function TransactionStatus({ 
  walletAddress, 
  transactionDetails, 
  gasOption,
  onFinish,
  visible
}: TransactionStatusProps) {
  const [status, setStatus] = useState<'submitting' | 'authenticating' | 'success' | 'error'>('submitting');
  const [result, setResult] = useState<TransactionResult | null>(null);
  
  // Get transaction context for tracking transaction in progress
  const { 
    setTransactionInProgress, 
    getCurrentTransactionId,
    generateTransactionId
  } = useTransaction();
  
  // Create refs outside useEffect to persist across re-renders
  const isMountedRef = useRef(true);
  const hasStartedRef = useRef(false);
  const transactionIdRef = useRef<string | null>(null);
  const pendingChallengeRef = useRef<any>(null);

  // Debug effect for visibility changes
  useEffect(() => {
    console.log('[TransactionStatus] Visibility changed to:', visible, {
      hasDetails: !!transactionDetails, 
      hasWalletAddress: !!walletAddress,
      gasOption,
      hasStarted: hasStartedRef.current,
      txId: transactionIdRef.current,
      status,
      contextTxId: getCurrentTransactionId(),
      hasPendingChallenge: !!pendingChallengeRef.current
    });
  }, [visible, transactionDetails, walletAddress, gasOption, status, getCurrentTransactionId]);
  
  // Component lifecycle logging
  useEffect(() => {
    console.log(`📱 [TX] Component mounted. Visible: ${visible}, gasOption: ${gasOption}`);
    console.log(`📱 [TX] Transaction details:`, JSON.stringify(transactionDetails));
    
    return () => {
      // Important: Release global WebAuthn lock when unmounting if this component owns it
      if (globalWebAuthnInProgress && hasStartedRef.current) {
        console.log(`🔓 [TX] Releasing global WebAuthn lock on unmount`);
        globalWebAuthnInProgress = false;
        setTransactionInProgress(false);
      }
      
      isMountedRef.current = false;
    };
  }, []);

  // Visibility change handler
  useEffect(() => {
    console.log(`👁️ [TX] Visibility changed to: ${visible}`);
    
    // Clean up when visibility is turned off
    if (!visible && hasStartedRef.current) {
      console.log(`🧹 [TX] Transaction flow cleanup due to visibility change`);
      
      // Release WebAuthn lock if we own it
      if (globalWebAuthnInProgress) {
        console.log(`🔓 [TX] Releasing global WebAuthn lock due to visibility change`);
        globalWebAuthnInProgress = false;
        setTransactionInProgress(false);
      }
      
      hasStartedRef.current = false;
      transactionIdRef.current = null;
      pendingChallengeRef.current = null;
    }
  }, [visible, setTransactionInProgress]);

  // Main transaction effect - only triggered when component becomes visible and hasn't started yet
  useEffect(() => {
    if (!visible || hasStartedRef.current || !isMountedRef.current) {
      return;
    }
    
    // Generate a unique transaction ID for tracing using the context
    const txId = getCurrentTransactionId() || generateTransactionId();
    console.log(`🚀 [TX] Starting transaction flow ${txId}`);
    transactionIdRef.current = txId;
    hasStartedRef.current = true;
    
    // Main transaction function - ONLY fetch challenge, don't do WebAuthn here
    const prepareTransaction = async () => {
      try {
        // Check if we're resuming a transaction first
        if (transactionIdRef.current && pendingChallengeRef.current) {
          console.log(`🔄 [TX] Skipping challenge fetch - resuming transaction ${transactionIdRef.current}`);
          
          // Just update the status if needed and return
          if (status !== 'authenticating') {
            setStatus('authenticating');
          }
          return;
        }
        
        // Set initial status
        setStatus('submitting');
        
        // 1. Check for global WebAuthn lock before proceeding
        if (globalWebAuthnInProgress) {
          console.log(`⚠️ [TX] ${txId}: Global WebAuthn already in progress, cannot start new transaction`);
          throw new Error('Another authentication is already in progress. Please try again in a moment.');
        }
        
        // 2. Fetch transaction challenge
        console.log(`🔍 [TX] ${txId}: Requesting transaction challenge`);
        const challengeRes = await fetch('/api/auth/transaction-challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: transactionDetails.recipient,
            value: transactionDetails.amount,
            data: '0x',
            includeDeviceKey: true
          })
        });

        // 3. Validate challenge response
        if (!challengeRes.ok) {
          console.error(`❌ [TX] ${txId}: Challenge request failed:`, await challengeRes.text());
          throw new Error('Failed to get transaction challenge');
        }
        
        // 4. Parse challenge data
        const challengeData = await challengeRes.json();
        console.log(`✅ [TX] ${txId}: Challenge received, preparing WebAuthn flow`);
        pendingChallengeRef.current = challengeData;
        
        // 5. Final validation before setting authenticating status
        if (!isMountedRef.current) {
          console.log(`🛑 [TX] ${txId}: Transaction aborted before WebAuthn - component not mounted`);
          return;
        }
        
        // 6. Set WebAuthn UI state - don't set global lock here yet
        setStatus('authenticating');
        console.log(`🔐 [TX] ${txId}: Setting status to authenticating, txId is stable`);
        
      } catch (err: any) {
        // Only update UI if component is still mounted and this transaction is still relevant
        if (isMountedRef.current && transactionIdRef.current === txId) {
          console.error(`❌ [TX] ${txId}: Error in transaction preparation:`, err);
          setStatus('error');
          setResult({ 
            success: false, 
            error: err.message || 'Error preparing transaction' 
          });
        }
      }
    };

    // Start the transaction preparation
    prepareTransaction();
  }, [visible, transactionDetails?.recipient, transactionDetails?.amount, getCurrentTransactionId, generateTransactionId]); // Minimal dependencies

  // Create a separate WebAuthn dedicated effect that only runs when status is 'authenticating' and txId is set
  useEffect(() => {
    // Only run the WebAuthn flow when we're in authenticating state and all prerequisites are met
    if (status !== 'authenticating') {
      return;
    }
    
    // Check if we have the challenge data and transaction ID
    if (!pendingChallengeRef.current || !transactionIdRef.current) {
      console.log('[WebAuthn] Missing challenge data or txId, cannot proceed', {
        hasPendingChallenge: !!pendingChallengeRef.current,
        hasTxId: !!transactionIdRef.current
      });
      return;
    }
    
    // Other checks can be more lenient as we may have recovered from global state
    if (!visible || !transactionDetails || !walletAddress) {
      console.log('[WebAuthn] Missing required props, pausing WebAuthn flow', {
        visible,
        hasTransactionDetails: !!transactionDetails,
        hasWalletAddress: !!walletAddress
      });
      return;
    }
    
    console.log(`[WebAuthn] Preparing to launch WebAuthn for ${transactionIdRef.current}`, {
      status,
      visible,
      hasTransactionId: !!transactionIdRef.current,
      hasPendingChallenge: !!pendingChallengeRef.current
    });
    
    // Don't do anything if WebAuthn is already in progress
    if (globalWebAuthnInProgress) {
      console.log(`⚠️ [TX] WebAuthn already in progress, skipping duplicate request`);
      return;
    }
    
    const doWebAuthn = async () => {
      const challengeData = pendingChallengeRef.current;
      const txId = transactionIdRef.current;
      
      if (!challengeData || !txId) {
        console.error('[WebAuthn] Missing challenge data or txId, cannot proceed');
        return;
      }
      
      try {
        // Set the global WebAuthn flag and update context
        globalWebAuthnInProgress = true;
        setTransactionInProgress(true);
        console.log(`🔒 [TX] Starting WebAuthn with stable txId: ${txId}`);
        
        // The actual WebAuthn call
        console.log('[WebAuthn] Launching navigator.credentials.get...');
        const webAuthnResponse = await startAuthentication({ 
          optionsJSON: challengeData.options 
        });
        
        console.log(`✅ [TX] ${txId}: WebAuthn authentication completed successfully`);
        
        // Verification check after WebAuthn completes
        if (!isMountedRef.current) {
          console.log(`🛑 [TX] ${txId}: Transaction aborted after WebAuthn - component not mounted`);
          globalWebAuthnInProgress = false;
          setTransactionInProgress(false);
          return;
        }
        
        // Update UI state
        setStatus('submitting');
        console.log(`📤 [TX] ${txId}: Sending signed transaction to server`);
        
        // Send transaction with signature
        const response = await fetch('/api/transaction/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            to: transactionDetails.recipient,
            value: transactionDetails.amount,
            data: '0x',
            gasPaymentMethod: gasOption,
            webAuthnResponse,
            transactionChallenge: challengeData.challenge
          })
        });
        
        // Parse server response
        const data = await response.json();
        
        // Final state check before updating UI
        if (!isMountedRef.current) {
          console.log(`🛑 [TX] ${txId}: Transaction aborted after server response - component not mounted`);
          globalWebAuthnInProgress = false;
          setTransactionInProgress(false);
          return;
        }
        
        // Handle error response
        if (!response.ok) {
          console.error(`❌ [TX] ${txId}: Server returned error:`, data);
          throw new Error(data.error || 'Transaction failed');
        }
        
        // Success path
        console.log(`✅ [TX] ${txId}: Transaction completed successfully!`);
        setStatus('success');
        setResult({
          success: true,
          userOpHash: data.data?.userOpHash,
          explorerUrl: data.data?.explorerUrl
        });
        
      } catch (webAuthnError: any) {
        console.error(`❌ [TX] WebAuthn error:`, {
          name: webAuthnError.name,
          message: webAuthnError.message,
          code: webAuthnError.code,
          type: typeof webAuthnError,
          stack: webAuthnError.stack?.slice(0, 200) || 'No stack trace',
          isAbortError: webAuthnError.name === 'AbortError',
          isNotAllowedError: webAuthnError.name === 'NotAllowedError'
        });
        
        if (isMountedRef.current && transactionIdRef.current === txId) {
          setStatus('error');
          setResult({
            success: false,
            error: webAuthnError.name === 'AbortError' 
              ? 'Authentication was aborted. Please try again.' 
              : webAuthnError.message || 'Authentication failed'
          });
        }
      } finally {
        globalWebAuthnInProgress = false;
        setTransactionInProgress(false);
        console.log(`🔓 [TX] Released global WebAuthn lock for ${txId}`);
      }
    };
    
    console.log(`[WebAuthn] Starting WebAuthn flow for stable txId: ${transactionIdRef.current}`);
    doWebAuthn();
  }, [status, transactionDetails, walletAddress, visible, gasOption, setTransactionInProgress]);

  // Don't render anything when not visible
  if (!visible) return null;

  // UI based on current transaction status
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
              ? 'Please complete the authentication request on your device...'
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
              onClick={() => {
                // Reset transaction state and global lock if we own it
                if (globalWebAuthnInProgress) {
                  console.log(`🔓 [TX] Releasing global WebAuthn lock on retry`);
                  globalWebAuthnInProgress = false;
                  setTransactionInProgress(false);
                }
                
                hasStartedRef.current = false;
                transactionIdRef.current = null;
                pendingChallengeRef.current = null;
                
                // Reset UI state
                setStatus('submitting');
                setResult(null);
              }}
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
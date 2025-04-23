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
  error?: string;
  txHash?: string;
  message?: string;
  userOpHash?: string;
  explorerUrl?: string;
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
    generateTransactionId,
    currentStep
  } = useTransaction();
  
  // Create refs outside useEffect to persist across re-renders
  const isMountedRef = useRef(true);
  const hasStartedRef = useRef(false);
  const transactionIdRef = useRef<string | null>(null);
  const pendingChallengeRef = useRef<any>(null);
  const hasStartedTransaction = useRef(false);
  const isAuthenticated = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const challengeRef = useRef<any>(null);

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
    
    // Check WebAuthn availability
    checkWebAuthnAvailability();
    
    // Generate a consistent transaction ID that stays stable for this component instance
    if (!transactionIdRef.current) {
      transactionIdRef.current = generateUUID();
      console.log(`🆔 [TX] Generated stable transaction ID: ${transactionIdRef.current}`);
    }
    
    return () => {
      // Important: Release global WebAuthn lock when unmounting if this component owns it
      if (globalWebAuthnInProgress && hasStartedRef.current) {
        console.log(`🔓 [TX] Releasing global WebAuthn lock on unmount`);
        globalWebAuthnInProgress = false;
        setTransactionInProgress(false);
      }
      
      // Cancel any in-progress WebAuthn operations
      if (abortControllerRef.current) {
        console.log(`🛑 [TX] Aborting any in-progress operations on unmount`);
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      // Clear all refs and state
      console.log(`🧹 [TX] Cleaning up on unmount`);
      pendingChallengeRef.current = null;
      challengeRef.current = null;
      hasStartedRef.current = false;
      hasStartedTransaction.current = false;
      isAuthenticated.current = false;
      
      isMountedRef.current = false;
    };
  }, []);

  // Function to check if WebAuthn is available in this browser
  const checkWebAuthnAvailability = () => {
    console.log('⚙️ [WebAuthn] Checking availability...');
    
    try {
      // Check if running in a secure context
      if (window.isSecureContext) {
        console.log('✅ [WebAuthn] Running in a secure context');
      } else {
        console.error('❌ [WebAuthn] Not running in a secure context. WebAuthn requires HTTPS (or localhost)');
      }
      
      // Check for cross-origin issues
      try {
        const currentOrigin = window.location.origin;
        console.log(`✅ [WebAuthn] Current origin: ${currentOrigin}`);
      } catch (originError) {
        console.error('❌ [WebAuthn] Error accessing origin:', originError);
      }
      
      // Check if PublicKeyCredential is available
      if (window.PublicKeyCredential) {
        console.log('✅ [WebAuthn] PublicKeyCredential API is available');
        
        // Check if conditional mediation is supported (for autofill)
        if ('conditional' in window.PublicKeyCredential) {
          console.log('✅ [WebAuthn] Conditional mediation is supported');
        } else {
          console.log('ℹ️ [WebAuthn] Conditional mediation is not supported');
        }
        
        // Check if user verification is available
        if ('isUserVerifyingPlatformAuthenticatorAvailable' in window.PublicKeyCredential) {
          window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
            .then(available => {
              if (available) {
                console.log('✅ [WebAuthn] Platform authenticator is available');
              } else {
                console.log('ℹ️ [WebAuthn] Platform authenticator is not available');
              }
            })
            .catch(err => {
              console.error('❌ [WebAuthn] Error checking platform authenticator:', err);
            });
        }
      } else {
        console.error('❌ [WebAuthn] PublicKeyCredential API is not available in this browser');
        return false;
      }
      
      // Check if navigator.credentials.get exists
      if (navigator.credentials && typeof navigator.credentials.get === 'function') {
        console.log('✅ [WebAuthn] navigator.credentials.get is available');
      } else {
        console.error('❌ [WebAuthn] navigator.credentials.get is not available');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ [WebAuthn] Error checking availability:', error);
      return false;
    }
  };

  // Visibility change handler
  useEffect(() => {
    console.log(`👁️ [TX] Visibility changed to: ${visible}, transaction ID: ${transactionIdRef.current}`);
    
    // Start transaction when component becomes visible and hasn't started yet
    if (visible && !hasStartedRef.current && transactionDetails && walletAddress) {
      console.log(`🚀 [TX] Starting transaction with ID: ${transactionIdRef.current}`);
      
      // Generate a transaction ID if we don't have one
      if (!transactionIdRef.current) {
        transactionIdRef.current = generateUUID();
      }
      
      hasStartedRef.current = true;
      hasStartedTransaction.current = true;
      
      // Start the transaction
      prepareTransaction();
    }
    
    // Clean up when visibility is turned off
    if (!visible && hasStartedRef.current) {
      console.log(`🧹 [TX] Transaction flow cleanup due to visibility change`);
      
      // Cancel any in-progress operations
      if (abortControllerRef.current) {
        console.log(`🛑 [TX] Aborting in-progress operations due to visibility change`);
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      // Release WebAuthn lock if we own it
      if (globalWebAuthnInProgress) {
        console.log(`🔓 [TX] Releasing global WebAuthn lock due to visibility change`);
        globalWebAuthnInProgress = false;
        setTransactionInProgress(false);
      }
      
      // Reset all transaction state
      hasStartedRef.current = false;
      hasStartedTransaction.current = false;
      isAuthenticated.current = false;
      pendingChallengeRef.current = null;
      challengeRef.current = null;
      
      // Reset displayed status (will be hidden anyway due to !visible in render)
      setStatus('submitting');
    }
  }, [visible, transactionDetails, walletAddress, setTransactionInProgress]);

  // Main transaction effect - handles WebAuthn flow once challenge is fetched
  useEffect(() => {
    // We only run this for WebAuthn authentication after the challenge is fetched
    // The transaction starting is now managed by the visibility effect
    if (!visible || !isMountedRef.current) {
      return;
    }
    
    // Skip if we don't have challenge data or if transaction hasn't started
    if (!pendingChallengeRef.current || !hasStartedTransaction.current) {
      return;
    }
    
    // If status is already authenticating and we have pendingChallenge, 
    // we should proceed with WebAuthn
    if (status === 'authenticating' && pendingChallengeRef.current) {
      console.log(`[TX] Status is authenticating and we have challenge, proceeding with WebAuthn`);
    } else {
      // Otherwise, just wait for the authentication status to be set by the visibility effect
      return;
    }
    
    // Check global lock before proceeding
    if (globalWebAuthnInProgress) {
      console.log(`[TX] Global WebAuthn in progress, waiting...`);
      return;
    }
    
    // Main WebAuthn handler
    const doWebAuthn = async () => {
      const challengeData = pendingChallengeRef.current;
      const txId = transactionIdRef.current;
      
      if (!challengeData || !txId) {
        console.error('[WebAuthn] Missing challenge data or txId, cannot proceed', {
          hasChallengeData: !!challengeData,
          txId,
          challengeOptions: challengeData?.options ? 'exists' : 'missing'
        });
        return;
      }
      
      try {
        // Set the global WebAuthn flag and update context
        globalWebAuthnInProgress = true;
        setTransactionInProgress(true);
        console.log(`🔒 [TX] Starting WebAuthn with stable txId: ${txId}`);
        
        // Log full challenge data for debugging
        console.log('[WebAuthn] Challenge data:', {
          challenge: challengeData.challenge ? challengeData.challenge.slice(0, 20) + '...' : 'missing',
          optionsExists: !!challengeData.options,
          optionsKeys: challengeData.options ? Object.keys(challengeData.options) : [],
          fullOptions: challengeData.options
        });
        
        // The actual WebAuthn call - ensure options are properly formatted
        console.log('[WebAuthn] Launching navigator.credentials.get...');
        
        let webAuthnResponse: any;
        
        try {
          // Direct WebAuthn call with simplified options to ensure it's called
          webAuthnResponse = await startAuthentication({ 
            optionsJSON: challengeData.options 
          });
          
          console.log(`✅ [TX] ${txId}: WebAuthn authentication completed successfully`, {
            responseType: typeof webAuthnResponse,
            responseKeys: Object.keys(webAuthnResponse || {})
          });
          isAuthenticated.current = true;
        } catch (error: any) {
          console.error('[WebAuthn] Error during navigator.credentials.get call:', {
            error,
            name: error.name,
            message: error.message
          });
          
          // Try a fallback with a simple structure if the original options fail
          if (challengeData.options && challengeData.options.challenge) {
            try {
              console.log('[WebAuthn] Attempting fallback authentication...');
              
              // Create a simplified version of the options
              const simplifiedOptions = {
                challenge: challengeData.options.challenge,
                allowCredentials: challengeData.options.allowCredentials,
                rpId: challengeData.options.rpId || window.location.hostname,
                timeout: 60000,
                userVerification: "required" as const
              };
              
              webAuthnResponse = await startAuthentication({ 
                optionsJSON: simplifiedOptions 
              });
              
              console.log(`✅ [TX] ${txId}: WebAuthn fallback authentication successful`);
              isAuthenticated.current = true;
            } catch (fallbackError: any) {
              console.error('[WebAuthn] Fallback authentication also failed:', {
                error: fallbackError,
                name: fallbackError.name,
                message: fallbackError.message
              });
              throw fallbackError;
            }
          } else {
            throw error;
          }
        }
        
        // Verification check after WebAuthn completes
        if (!isMountedRef.current) {
          console.log(`🛑 [TX] ${txId}: Transaction aborted after WebAuthn - component not mounted`);
          globalWebAuthnInProgress = false;
          setTransactionInProgress(false);
          return;
        }
        
        // Check if we have a valid WebAuthn response
        if (!webAuthnResponse) {
          throw new Error('WebAuthn authentication failed - no response received');
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
            gasOption: gasOption,
            webauthnResponse: webAuthnResponse
          }),
          signal: abortControllerRef.current?.signal
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
          explorerUrl: data.data?.explorerUrl,
          txHash: data.data?.txHash,
          message: data.data?.message
        });
        pendingChallengeRef.current = null; 
        
      } catch (webAuthnError: any) {
        console.error(`❌ [TX] WebAuthn error:`, {
          name: webAuthnError.name,
          message: webAuthnError.message,
          code: webAuthnError.code,
          type: typeof webAuthnError,
          stack: webAuthnError.stack?.slice(0, 200) || 'No stack trace',
          isAbortError: webAuthnError.name === 'AbortError',
          isNotAllowedError: webAuthnError.name === 'NotAllowedError',
          isOperationError: webAuthnError.name === 'OperationError'
        });
        
        // Check if this is a user cancellation or abort error
        const isAbortOrCancel = 
          webAuthnError.name === 'AbortError' || 
          webAuthnError.name === 'NotAllowedError' ||
          (webAuthnError.message && webAuthnError.message.toLowerCase().includes('abort')) ||
          (webAuthnError.message && webAuthnError.message.toLowerCase().includes('cancel'));
        
        // Map WebAuthn errors to user-friendly messages
        let userMessage = 'Authentication failed';
        if (isAbortOrCancel) {
          userMessage = 'Authentication was cancelled. Please try again.';
        } else if (webAuthnError.name === 'InvalidStateError') {
          userMessage = 'Browser is in an invalid state. Please refresh the page and try again.';
        } else if (webAuthnError.name === 'SecurityError') {
          userMessage = 'Security error: The operation is insecure. Try using HTTPS or localhost.';
        } else if (webAuthnError.name === 'NetworkError') {
          userMessage = 'Network error occurred. Please check your connection and try again.';
        } else if (webAuthnError.message) {
          // Use the error message if available
          userMessage = webAuthnError.message;
        }
        
        if (isMountedRef.current) {
          // Only show error UI if it's not a simple abort/cancel
          if (!isAbortOrCancel) {
            setStatus('error');
            setResult({
              success: false,
              error: userMessage
            });
          } else {
            // For cancellations, reset state to let user retry
            console.log('⚠️ [TX] WebAuthn was cancelled or aborted by user');
            setStatus('authenticating');
            // Clear challenge data to prevent auto-restart
            pendingChallengeRef.current = null;
          }
          
          // Reset transaction state to allow retry
          hasStartedRef.current = false;
          hasStartedTransaction.current = false;
          isAuthenticated.current = false;
        }
      } finally {
        globalWebAuthnInProgress = false;
        setTransactionInProgress(false);
        console.log(`🔓 [TX] Released global WebAuthn lock for ${txId}`);
        
        // Clear the abort controller after completion
        abortControllerRef.current = null;
      }
    };
    
    console.log(`[WebAuthn] Starting WebAuthn flow for stable txId: ${transactionIdRef.current}`);
    doWebAuthn();
  }, [visible, status, transactionDetails, walletAddress, gasOption, setTransactionInProgress]);

  // Add an effect to synchronize with context state on mount or visibility change
  useEffect(() => {
    console.log(`[TransactionStatus] Component ${visible ? 'visible' : 'hidden'}, currentStep=${currentStep}, status=${status}`);
    
    // If we're becoming visible and the context already indicates we're in a specific step,
    // ensure our internal status matches the external state
    if (visible) {
      if (currentStep === 'complete' && status == 'submitting') {
        // If context says we're in complete step, we should be in authenticating
        // unless we've already succeeded
        setStatus('authenticating');
      }
    }
  }, [visible, currentStep, status]);

  // Reset the status when component visibility changes
  useEffect(() => {
    console.log('TransactionStatus visibility changed:', visible);
    
    if (visible) {
      // Only reset state when component becomes visible from an invisible state 
      // AND we don't have an ongoing transaction AND we don't have pending challenge
      if (!hasStartedRef.current && !hasStartedTransaction.current && !pendingChallengeRef.current) {
        console.log('Resetting status on becoming visible (no transaction in progress)');
        
        if (status !== 'submitting') {
          console.log('Setting status to submitting');
          setStatus('submitting');
        }
        
        if (result !== null) {
          console.log('Clearing previous transaction result');
          setResult(null);
        }
      } else {
        console.log('Not resetting status on visibility change - transaction in progress or challenge pending', {
          hasStarted: hasStartedRef.current,
          hasStartedTransaction: hasStartedTransaction.current,
          hasPendingChallenge: !!pendingChallengeRef.current
        });
      }
    }
  }, [visible, status, result]);

  // Initialize component state and verify WebAuthn when mounted
  useEffect(() => {
    console.log('🔄 [TX] TransactionStatus component mounted');
    // Check WebAuthn availability on mount
    const webAuthnAvailable = checkWebAuthnAvailability();
    console.log(`🔄 [TX] WebAuthn availability: ${webAuthnAvailable ? 'Available' : 'Not available'}`);
    
    // Start transaction if component is visible and we haven't started yet
    if (visible && !hasStartedRef.current) {
      hasStartedRef.current = true;
      const txId = generateUUID();
      console.log(`🔄 [TX] Starting transaction with ID: ${txId}`);
      transactionIdRef.current = txId;
      prepareTransaction();
    }
    
    return () => {
      console.log('🔄 [TX] TransactionStatus component unmounting');
    };
  }, [visible]);

  // Clear WebAuthn state when challenge changes
  useEffect(() => {
    if (challengeRef.current) {
      console.log('🔄 [TX] Got new challenge, preparing WebAuthn options');
      
      // Log challenge format for debugging
      console.log('🔍 [WebAuthn] Challenge options:', JSON.stringify({
        options: challengeRef.current,
        allowCredentialsCount: challengeRef.current?.allowCredentials?.length || 0,
        hasChallenge: !!challengeRef.current?.challenge,
        challengeLength: challengeRef.current?.challenge ? challengeRef.current.challenge.length : 0
      }));
      
      // Attempt immediate WebAuthn start if appropriate
      if (status === 'authenticating' && challengeRef.current) {
        console.log('🔄 [TX] Attempting immediate WebAuthn start');
        attemptWebAuthnStart();
      }
    }
  }, [challengeRef.current, status]);

  // Effect for component unmount cleanup
  useEffect(() => {
    return () => {
      console.log('[TransactionStatus] Component fully unmounted - resetting state');
      
      // Reset transaction state when component fully unmounts
      hasStartedTransaction.current = false;
      isAuthenticated.current = false;
      if (abortControllerRef.current) {
        console.log('[TransactionStatus] Aborting any pending transactions');
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Generate a UUID for transaction tracking
  const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  // Prepare the transaction by fetching challenge and setting up WebAuthn
  const prepareTransaction = async () => {
    try {
      // Check for global WebAuthn lock before proceeding
      if (globalWebAuthnInProgress) {
        console.log(`⚠️ [TX] Global WebAuthn already in progress, cannot start new transaction`);
        throw new Error('Another authentication is already in progress. Please try again in a moment.');
      }
      
      // Set the status to submitting immediately
      setStatus('submitting');
      
      // Fetch transaction challenge
      console.log(`🔍 [TX] ${transactionIdRef.current}: Requesting transaction challenge`);
      
      try {
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

        // Validate challenge response
        if (!challengeRes.ok) {
          console.error(`❌ [TX] ${transactionIdRef.current}: Challenge request failed:`, await challengeRes.text());
          throw new Error('Failed to get transaction challenge');
        }
        
        // Parse challenge data
        const challengeData = await challengeRes.json();
        console.log(`✅ [TX] ${transactionIdRef.current}: Challenge received:`, {
          success: challengeData.success,
          hasChallenge: !!challengeData.challenge,
          hasOptions: !!challengeData.options,
          optionsPreview: challengeData.options ? 
            Object.keys(challengeData.options).join(', ') : 'none'
        });
        
        // Store the challenge data for the WebAuthn effect
        challengeRef.current = challengeData.options;
        pendingChallengeRef.current = challengeData;
        
        // Check if we have valid challenge data
        if (!challengeData.options || !challengeData.challenge) {
          console.error(`❌ [TX] ${transactionIdRef.current}: Invalid challenge data received`);
          throw new Error('Invalid challenge data received from server');
        }
        
        // Set WebAuthn UI state immediately
        console.log(`🔐 [TX] ${transactionIdRef.current}: Setting status to authenticating`);
        setStatus('authenticating');
        
        // Important: Set the flag to indicate transaction has started to prevent re-triggers
        hasStartedTransaction.current = true;
        
        // Directly attempt to start WebAuthn authentication now that we have the challenge
        // This provides immediate authentication rather than waiting for the effect
        console.log(`🔐 [TX] ${transactionIdRef.current}: Directly starting WebAuthn with challenge`);
        setTimeout(() => {
          attemptWebAuthnStart();
        }, 100); // Small delay to ensure state updates are processed first
        
      } catch (err) {
        console.error(`❌ [TX] Error fetching challenge:`, err);
        throw err;
      }
      
    } catch (err) {
      console.error(`❌ [TX] Error starting transaction:`, err);
      setStatus('error');
      setResult({ 
        success: false, 
        error: err instanceof Error ? err.message : 'Failed to start transaction' 
      });
    }
  };

  // Attempt to start WebAuthn authentication with current challenge
  const attemptWebAuthnStart = async () => {
    try {
      if (!challengeRef.current) {
        console.error('❌ [WebAuthn] Cannot start - no challenge available');
        return;
      }

      console.log('[WebAuthn] Starting authentication with options:', challengeRef.current);
      
      // Create a new abort controller for this attempt
      abortControllerRef.current = new AbortController();
      
      try {
        // Try the library approach first
        console.log('[WebAuthn] Attempting with simplewebauthn library...');
        const response = await startAuthentication({ 
          optionsJSON: challengeRef.current 
        });
        
        console.log('✅ [WebAuthn] Authentication completed!', response);
        
        // Handle the successful response by sending it to the server
        await submitSignedTransaction(response);
        
      } catch (libError: any) {
        console.error('[WebAuthn] Library approach failed:', {
          error: libError,
          name: libError?.name,
          message: libError?.message
        });
        
        // If it's an AbortError, don't treat as a failure
        if (libError?.name === 'AbortError') {
          console.log('[WebAuthn] Authentication was aborted by user or system');
          return;
        }
        
        // For non-abort errors, set error state
        setStatus('error');
        setResult({
          success: false,
          error: libError?.message || 'Authentication failed'
        });
      }
    } catch (err) {
      console.error('❌ [WebAuthn] Error during authentication:', err);
      setStatus('error');
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Authentication failed'
      });
      pendingChallengeRef.current = null; 
    }
  };

  // Submit the signed transaction to the server
  const submitSignedTransaction = async (webAuthnResponse: any) => {
    try {
      console.log(`🔐 [TX] ${transactionIdRef.current}: Submitting signed transaction`);
      
      const response = await fetch('/api/transaction/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: transactionDetails.recipient,
          value: transactionDetails.amount,
          data: '0x',
          gasOption: gasOption,
          webauthnResponse: webAuthnResponse
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [TX] ${transactionIdRef.current}: Transaction failed:`, errorText);
        throw new Error(`Transaction failed: ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ [TX] ${transactionIdRef.current}: Transaction succeeded:`, data);
      
      setStatus('success');
      setResult({
        success: true,
        txHash: data.txHash || 'unknown',
        message: 'Transaction submitted successfully!'
      });
      pendingChallengeRef.current = null;
      
    } catch (error) {
      console.error(`❌ [TX] ${transactionIdRef.current}: Error submitting transaction:`, error);
      setStatus('error');
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit transaction'
      });
      pendingChallengeRef.current = null; 
    }
  };

  // Don't render anything when not visible
  if (!visible) return null;

  // UI based on current transaction status
  return (
    <div className={`w-full max-w-lg mx-auto text-center ${visible ? 'transaction-status-active' : 'transaction-status-hidden'}`}>
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
                
                // Reset all transaction state flags
                hasStartedRef.current = false;
                transactionIdRef.current = null;
                pendingChallengeRef.current = null;
                hasStartedTransaction.current = false;
                isAuthenticated.current = false;
                
                // Abort any pending network requests
                if (abortControllerRef.current) {
                  console.log('[TransactionStatus] Aborting any pending requests on retry');
                  abortControllerRef.current.abort();
                  abortControllerRef.current = null;
                }
                
                // Reset UI state
                setStatus('submitting');
                setResult(null);
                
                console.log('[TransactionStatus] State reset for retry, transaction will restart');
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
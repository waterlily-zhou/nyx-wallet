'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import TransactionForm from './TransactionForm';
import TransactionConfirmation from './TransactionConfirmation';
import TransactionStatus from './TransactionStatus';
import { useTransaction } from '../contexts/TransactionContext';

interface TransactionFlowProps {
  walletAddress: string;
  onClose: () => void;
  visible: boolean;
}

// Interface for the built-in StepIndicator component
interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

// Simple StepIndicator component defined inline
function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex justify-center items-center w-full">
      {steps.map((step, index) => (
        <div key={step} className="flex flex-col items-center relative w-32">
          <div className="flex items-center w-full justify-center">
            {/* Line before dot (except for first step) */}
            {index > 0 && (
              <div 
                className={`absolute w-full h-0.5 top-1.5 right-1/2 ${
                  index <= currentStep ? 'bg-violet-500' : 'bg-gray-700'
                }`}
              />
            )}
            {/* Dot and text */}
            <div className="flex flex-col items-center relative z-10">
              <div 
                className={`w-3 h-3 rounded-full ${
                  index === currentStep 
                    ? 'bg-violet-500' 
                    : index < currentStep
                      ? 'bg-violet-400'
                      : 'bg-gray-600'
                }`}
              />
              <span className={`text-sm mt-2 capitalize ${
                index === currentStep 
                  ? 'text-violet-500'
                  : index < currentStep
                    ? 'text-violet-400'
                    : 'text-gray-600'
              }`}>
                {step}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TransactionFlow({ walletAddress, onClose, visible }: TransactionFlowProps) {
  const { 
    currentStep, 
    transactionDetails, 
    gasOption, 
    transactionInProgress,
    goToStep,
    moveToConfirmStep,
    moveToCompleteStep,
    resetTransaction
  } = useTransaction();
  
  console.log(`TransactionFlow: contextStep=${currentStep}, inProgress=${transactionInProgress}, visible=${visible}`);

  // Boolean ref to track if TransactionStatus was ever initialized
  const hasInitializedRef = useRef(false);
  
  // Memoize transaction details to prevent unnecessary re-renders
  const stableTransactionDetails = useMemo(() => ({
    recipient: transactionDetails?.recipient || '',
    amount: transactionDetails?.amount || '',
    network: transactionDetails?.network || ''
  }), [transactionDetails?.recipient, transactionDetails?.amount, transactionDetails?.network]);

  // Ensure transaction details are available for components
  const hasValidTransactionDetails = useMemo(() => {
    return !!(
      transactionDetails?.recipient && 
      transactionDetails?.amount && 
      transactionDetails?.network
    );
  }, [transactionDetails]);
  
  // Once we have valid details, mark as initialized to prevent unmounting
  useEffect(() => {
    if (hasValidTransactionDetails && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      console.log('TransactionStatus has been initialized and will not be unmounted');
    }
  }, [hasValidTransactionDetails]);

  // Handle form submission
  const handleFormSubmit = (formData: { recipient: string; amount: string; network: string }) => {
    try {
      console.log('TransactionFlow: handleFormSubmit received data', formData);
      
      // Debug the current transaction details
      console.log('Before update - transactionDetails:', JSON.stringify(transactionDetails));
      
      // Create a stable local copy of the transaction details
      const localDetails = {
        recipient: formData.recipient,
        amount: formData.amount,
        network: formData.network
      };
      
      // IMPORTANT: Use the combined context method to update transaction details and move to confirm step
      console.log('Moving to confirm step with details:', localDetails);
      moveToConfirmStep(localDetails);
      
      // Force re-render to ensure we show the confirmation page immediately
      setTimeout(() => {
        console.log('Step changed - currentStep=confirm, showing confirmation screen');
      }, 50);
      
      // Return false to ensure no navigation happens
      return false;
    } catch (error) {
      console.error('Error in handleFormSubmit:', error);
      // Ensure we don't propagate errors that could cause navigation
    }
  };

  // Handle confirmation
  const handleConfirmation = (selectedGasOption: 'default' | 'sponsored' | 'usdc' | 'bundler') => {
    console.log('Confirmation received with gas option:', selectedGasOption);
    
    // Use the combined method to update gas option and move to complete step
    moveToCompleteStep(selectedGasOption);
  };

  // Handle back button on confirmation screen
  const handleBackToForm = () => {
    goToStep('create');
  };

  // Handle finish transaction flow
  const handleFinishTransaction = () => {
    // Only reset if no transaction is in progress
    if (!transactionInProgress) {
      resetTransaction();
      onClose();
    } else {
      console.log('Cannot finish while transaction is in progress');
    }
  };

  // Prevent closing if a transaction is in progress
  const handleClose = () => {
    if (transactionInProgress) {
      console.log('Cannot close - transaction in progress');
      return;
    }
    onClose();
  };

  // This helps debugging issues
  useEffect(() => {
    console.log('TransactionFlow component mounted, currentStep:', currentStep);
    
    // Only reset to create step when component becomes visible AND no transaction is in progress
    // Also don't reset if we are already in the complete step with visible component
    if (visible && currentStep === 'complete' && !transactionInProgress) {
      const shouldReset = document.querySelector('.transaction-status-active') === null;
      
      if (shouldReset) {
        console.log('Resetting to create step on mount (no transaction in progress)');
        goToStep('create');
      } else {
        console.log('Transaction content visible, not resetting to create step');
      }
    } else if (transactionInProgress) {
      console.log('Transaction in progress, not resetting step on mount');
    }
    
    // Prevent unmounting from resetting the context
    const currentDetails = transactionDetails;
    const currentStateStep = currentStep;
    
    return () => {
      console.log('TransactionFlow component is unmounting, preserving state:', {
        step: currentStateStep,
        hasDetails: !!currentDetails,
        inProgress: transactionInProgress
      });
      
      // IMPORTANT: Don't reset state on unmount to prevent state loss
      // Only do cleanup if explicitly requested by other actions
    };
  }, [visible, currentStep, transactionDetails, goToStep, transactionInProgress]);

  // Log state changes for debugging
  useEffect(() => {
    console.log('currentStep changed to:', currentStep);
  }, [currentStep]);

  // Add additional debugging for render
  useEffect(() => {
    console.log('RENDER DEBUG - currentStep:', currentStep, 
                'transactionDetails:', transactionDetails ? 'exists' : 'null',
                'confirmShouldShow:', currentStep === 'confirm' && !!transactionDetails);
  });

  // Add logging whenever transaction details change
  useEffect(() => {
    console.log('Transaction details updated:', JSON.stringify(transactionDetails));
  }, [transactionDetails]);

  // Don't render anything when not visible, but only after all hooks have been called
  if (!visible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-75 p-4">
      <div className="relative bg-zinc-900 rounded-lg p-12 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Step Indicator - Directly inline the JSX */}
        <div className="mb-8">
          <StepIndicator steps={['create', 'confirm', 'complete']} currentStep={['create', 'confirm', 'complete'].indexOf(currentStep)} />
        </div>

        {/* Debug what's being rendered - make visible */}
        <div className="text-xs text-gray-500 mb-4">
          Debug: currentStep={currentStep}, 
          hasDetails={hasValidTransactionDetails ? 'yes' : 'no'},
          details={JSON.stringify(stableTransactionDetails)}
        </div>

        {currentStep === 'create' && (
          <TransactionForm 
            walletAddress={walletAddress} 
            onNext={handleFormSubmit} 
          />
        )}
        
        {currentStep === 'confirm' && (
          <TransactionConfirmation 
            walletAddress={walletAddress}
            transactionDetails={stableTransactionDetails}
            onConfirm={handleConfirmation}
            onBack={handleBackToForm}
          />
        )}
        
        {/* Render TransactionStatus directly, but keep it mounted once initialized */}
        {(hasInitializedRef.current || currentStep === 'complete') && hasValidTransactionDetails && (
          <div style={{ display: currentStep === 'complete' ? 'block' : 'none' }}>
            <TransactionStatus
              walletAddress={walletAddress}
              transactionDetails={stableTransactionDetails}
              gasOption={gasOption}
              onFinish={handleFinishTransaction}
              visible={currentStep === 'complete'}
            />
          </div>
        )}

        {/* Close button - only visible when no transaction is in progress */}
        {currentStep !== 'complete' && !transactionInProgress && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
} 
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import TransactionForm from './TransactionForm';
import TransactionConfirmation from './TransactionConfirmation';
import TransactionStatus from './TransactionStatus';
import { useTransaction } from '../contexts/TransactionContext';

interface TransactionFlowProps {
  walletAddress: string;
  onClose: () => void;
}

export default function TransactionFlow({ walletAddress, onClose }: TransactionFlowProps) {
  // Local state for UI only
  const [viewState, setViewState] = useState<'create' | 'confirm' | 'complete'>('create');
  
  const { 
    currentStep, 
    transactionDetails, 
    gasOption, 
    transactionInProgress,
    goToStep,
    setTransactionDetails: updateTransactionDetails,
    setGasOption: updateGasOption,
    resetTransaction
  } = useTransaction();
  
  console.log(`TransactionFlow: viewState=${viewState}, contextStep=${currentStep}, inProgress=${transactionInProgress}`);

  // Memoize transaction details to prevent unnecessary re-renders
  const stableTransactionDetails = useMemo(() => ({
    recipient: transactionDetails?.recipient || '',
    amount: transactionDetails?.amount || '',
    network: transactionDetails?.network || ''
  }), [transactionDetails?.recipient, transactionDetails?.amount, transactionDetails?.network]);

  // Sync context step with local view state when component mounts
  useEffect(() => {
    if (currentStep !== viewState) {
      setViewState(currentStep as 'create' | 'confirm' | 'complete');
    }
  }, [currentStep]);

  // Step indicator dots
  const renderStepIndicator = () => (
    <div className="flex justify-center items-center mb-8">
      {['create', 'confirm', 'complete'].map((step, index) => (
        <div key={step} className="flex flex-col items-center relative w-32">
          <div className="flex items-center w-full justify-center">
            {/* Line before dot (except for first step) */}
            {index > 0 && (
              <div 
                className={`absolute w-full h-0.5 top-1.5 right-1/2 ${
                  index <= ['create', 'confirm', 'complete'].indexOf(viewState)
                    ? 'bg-gray-400'
                    : 'bg-gray-700'
                }`}
              />
            )}
            {/* Dot and text as a unified component */}
            <div className="flex flex-col items-center relative z-10">
              <div 
                className={`w-3 h-3 rounded-full ${
                  step === viewState 
                    ? 'bg-violet-500' 
                    : index < ['create', 'confirm', 'complete'].indexOf(viewState)
                      ? 'bg-gray-400'
                      : 'bg-gray-600'
                }`}
              />
              <span className={`text-sm mt-2 capitalize ${
                step === viewState 
                  ? 'text-violet-500'
                  : index < ['create', 'confirm', 'complete'].indexOf(viewState)
                    ? 'text-gray-400'
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

  // Handle form submission
  const handleFormSubmit = (formData: { recipient: string; amount: string; network: string }) => {
    console.log('TransactionFlow: handleFormSubmit received data', formData);
    
    // Debug the current transaction details
    console.log('Before update - transactionDetails:', transactionDetails);
    
    // Update context - IMPORTANT: set context first
    updateTransactionDetails(formData);
    
    // Log after update
    console.log('After update - formData:', formData);
    
    // Now that we have set transaction details, we can change step
    setTimeout(() => {
      // Update UI immediately
      setViewState('confirm');
      
      // Then update context step
      goToStep('confirm');
      
      console.log('Step changed - viewState=confirm, showing confirmation screen');
    }, 0);
  };

  // Handle confirmation
  const handleConfirmation = (selectedGasOption: 'default' | 'sponsored' | 'usdc' | 'bundler') => {
    console.log('Confirmation received with gas option:', selectedGasOption);
    
    // Update context
    updateGasOption(selectedGasOption);
    goToStep('complete');
    
    // Update UI immediately 
    setViewState('complete');
  };

  // Handle back button on confirmation screen
  const handleBackToForm = () => {
    goToStep('create');
    setViewState('create');
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

  // This helps debugging issues
  useEffect(() => {
    console.log('TransactionFlow component mounted, viewState:', viewState);
    return () => {
      console.log('TransactionFlow component is unmounting');
      if (!transactionInProgress) {
        resetTransaction();
      }
    };
  }, [resetTransaction, transactionInProgress]);

  // Prevent closing if a transaction is in progress
  const handleClose = () => {
    if (transactionInProgress) {
      console.log('Cannot close - transaction in progress');
      return;
    }
    onClose();
  };

  // Log state changes for debugging
  useEffect(() => {
    console.log('viewState changed to:', viewState);
  }, [viewState]);

  // Add additional debugging for render
  useEffect(() => {
    console.log('RENDER DEBUG - viewState:', viewState, 
                'transactionDetails:', transactionDetails ? 'exists' : 'null',
                'confirmShouldShow:', viewState === 'confirm' && !!transactionDetails);
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-75 p-4">
      <div className="relative bg-zinc-900 rounded-lg p-12 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {renderStepIndicator()}

        {/* Debug what's being rendered */}
        <div className="hidden">
          Debug: viewState={viewState}, 
          hasTransactionDetails={transactionDetails ? 'yes' : 'no'}
        </div>

        {viewState === 'create' && (
          <TransactionForm 
            walletAddress={walletAddress} 
            onNext={handleFormSubmit} 
          />
        )}
        
        {viewState === 'confirm' && (
          <TransactionConfirmation 
            walletAddress={walletAddress}
            transactionDetails={stableTransactionDetails}
            onConfirm={handleConfirmation}
            onBack={handleBackToForm}
          />
        )}
        
        {viewState === 'complete' && transactionDetails && (
          <TransactionStatus
            key="transaction-status"
            walletAddress={walletAddress}
            transactionDetails={stableTransactionDetails}
            gasOption={gasOption}
            onFinish={handleFinishTransaction}
            visible={true}
          />
        )}

        {/* Close button - only visible when no transaction is in progress */}
        {viewState !== 'complete' && !transactionInProgress && (
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
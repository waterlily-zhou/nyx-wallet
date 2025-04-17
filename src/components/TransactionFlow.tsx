'use client';

import React, { useState, useMemo } from 'react';
import TransactionForm from './TransactionForm';
import TransactionConfirmation from './TransactionConfirmation';
import TransactionStatus from './TransactionStatus';

interface TransactionFlowProps {
  walletAddress: string;
  onClose: () => void;
}

type TransactionStep = 'create' | 'confirm' | 'complete';
type GasOption = 'default' | 'sponsored' | 'usdc' | 'bundler';

interface TransactionDetails {
  recipient: string;
  amount: string;
  network: string;
}

// Custom hook to create memoized TransactionStatus component
function useTransactionStatus() {
  return useMemo(() => {
    const TransactionStatusWrapper = ({
      walletAddress,
      transactionDetails,
      gasOption,
      onFinish,
      show
    }: {
      walletAddress: string;
      transactionDetails: TransactionDetails;
      gasOption: GasOption;
      onFinish: () => void;
      show: boolean;
    }) => {
      // Only render if show is true
      if (!show) return null;

      return (
        <TransactionStatus
          walletAddress={walletAddress}
          transactionDetails={transactionDetails}
          gasOption={gasOption}
          onFinish={onFinish}
        />
      );
    };

    return React.memo(TransactionStatusWrapper);
  }, []); // Empty deps since this should never change
}

export default function TransactionFlow({ walletAddress, onClose }: TransactionFlowProps) {
  const [currentStep, setCurrentStep] = useState<TransactionStep>('create');
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetails | null>(null);
  const [gasOption, setGasOption] = useState<GasOption>('default');

  // Get memoized TransactionStatus component
  const MemoizedTransactionStatus = useTransactionStatus();

  // Memoize transaction details to prevent unnecessary re-renders
  const stableTransactionDetails = useMemo(() => ({
    recipient: transactionDetails?.recipient || '',
    amount: transactionDetails?.amount || '',
    network: transactionDetails?.network || ''
  }), [transactionDetails?.recipient, transactionDetails?.amount, transactionDetails?.network]);

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
                  index <= ['create', 'confirm', 'complete'].indexOf(currentStep)
                    ? 'bg-gray-400'
                    : 'bg-gray-700'
                }`}
              />
            )}
            {/* Dot and text as a unified component */}
            <div className="flex flex-col items-center relative z-10">
              <div 
                className={`w-3 h-3 rounded-full ${
                  step === currentStep 
                    ? 'bg-violet-500' 
                    : index < ['create', 'confirm', 'complete'].indexOf(currentStep)
                      ? 'bg-gray-400'
                      : 'bg-gray-600'
                }`}
              />
              <span className={`text-sm mt-2 capitalize ${
                step === currentStep 
                  ? 'text-violet-500'
                  : index < ['create', 'confirm', 'complete'].indexOf(currentStep)
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
    setTransactionDetails(formData);
    setCurrentStep('confirm');
  };

  // Handle confirmation
  const handleConfirmation = (selectedGasOption: GasOption) => {
    setGasOption(selectedGasOption);
    setCurrentStep('complete');
  };

  // Handle back button on confirmation screen
  const handleBackToForm = () => {
    setCurrentStep('create');
  };

  // Handle finish transaction flow
  const handleFinishTransaction = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-75 p-4">
      <div className="relative bg-zinc-900 rounded-lg p-12 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {renderStepIndicator()}
        
        {/* Memoized TransactionStatus that won't unmount */}
        {transactionDetails && (
          <MemoizedTransactionStatus
            walletAddress={walletAddress}
            transactionDetails={stableTransactionDetails}
            gasOption={gasOption}
            onFinish={handleFinishTransaction}
            show={currentStep === 'complete'}
          />
        )}
        
        {currentStep === 'create' && (
          <TransactionForm 
            walletAddress={walletAddress} 
            onNext={handleFormSubmit} 
          />
        )}
        
        {currentStep === 'confirm' && transactionDetails && (
          <TransactionConfirmation 
            walletAddress={walletAddress}
            transactionDetails={stableTransactionDetails}
            onConfirm={handleConfirmation}
            onBack={handleBackToForm}
          />
        )}

        {/* Close button - only visible on first two steps */}
        {currentStep !== 'complete' && (
          <button
            onClick={onClose}
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
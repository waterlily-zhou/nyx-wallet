'use client';

import { useState } from 'react';
import TransactionForm from './TransactionForm';
import TransactionConfirmation from './TransactionConfirmation';
import TransactionStatus from './TransactionStatus';

interface TransactionFlowProps {
  walletAddress: string;
  onClose: () => void;
}

type TransactionStep = 'create' | 'confirm' | 'complete';

export default function TransactionFlow({ walletAddress, onClose }: TransactionFlowProps) {
  const [currentStep, setCurrentStep] = useState<TransactionStep>('create');
  const [transactionDetails, setTransactionDetails] = useState<{
    recipient: string;
    amount: string;
    network: string;
  } | null>(null);
  const [gasOption, setGasOption] = useState<'default' | 'sponsored' | 'usdc' | 'bundler'>('sponsored');

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
  const handleConfirmation = (selectedGasOption: 'default' | 'sponsored' | 'usdc' | 'bundler') => {
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
        
        {currentStep === 'create' && (
          <TransactionForm 
            walletAddress={walletAddress} 
            onNext={handleFormSubmit} 
          />
        )}
        
        {currentStep === 'confirm' && transactionDetails && (
          <TransactionConfirmation 
            walletAddress={walletAddress}
            transactionDetails={transactionDetails}
            onConfirm={handleConfirmation}
            onBack={handleBackToForm}
          />
        )}
        
        {currentStep === 'complete' && transactionDetails && (
          <TransactionStatus 
            walletAddress={walletAddress}
            transactionDetails={transactionDetails}
            gasOption={gasOption}
            onFinish={handleFinishTransaction}
          />
        )}

        {/* Close button - only visible on first two steps */}
        {currentStep !== 'complete' && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
} 
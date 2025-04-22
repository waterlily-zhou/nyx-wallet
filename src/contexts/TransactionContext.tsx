'use client';

import React, { createContext, useState, useContext, useMemo, useRef, ReactNode, useEffect } from 'react';

type TransactionStep = 'create' | 'confirm' | 'complete';
type GasOption = 'default' | 'sponsored' | 'usdc' | 'bundler';

export interface TransactionDetails {
  recipient: string;
  amount: string;
  network: string;
}

interface TransactionContextType {
  // State
  currentStep: TransactionStep;
  transactionDetails: TransactionDetails | null;
  gasOption: GasOption;
  transactionInProgress: boolean;
  
  // Actions
  setCurrentStep: (step: TransactionStep) => void;
  setTransactionDetails: (details: TransactionDetails | null) => void;
  setGasOption: (option: GasOption) => void;
  setTransactionInProgress: (inProgress: boolean) => void;
  
  // Helper methods
  goToStep: (step: TransactionStep) => void;
  moveToConfirmStep: (details: TransactionDetails) => void;
  moveToCompleteStep: (selectedGasOption: GasOption) => void;
  resetTransaction: () => void;
  getCurrentTransactionId: () => string | null;
  generateTransactionId: () => string;
}

// Create context with default values
const TransactionContext = createContext<TransactionContextType>({
  currentStep: 'create',
  transactionDetails: null,
  gasOption: 'default',
  transactionInProgress: false,
  
  setCurrentStep: () => {},
  setTransactionDetails: () => {},
  setGasOption: () => {},
  setTransactionInProgress: () => {},
  
  goToStep: () => {},
  moveToConfirmStep: () => {},
  moveToCompleteStep: () => {},
  resetTransaction: () => {},
  getCurrentTransactionId: () => null,
  generateTransactionId: () => '',
});

// Provider component
export function TransactionProvider({ children }: { children: ReactNode }) {
  // Initialize state from localStorage if available
  const initializeStateFromStorage = () => {
    if (typeof window === 'undefined') {
      console.log('Running on server, skipping localStorage initialization');
      return null;
    }
    
    try {
      console.log('Attempting to load transaction state from localStorage');
      const savedState = localStorage.getItem('transactionState');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        console.log('Successfully loaded transaction state:', parsed);
        return parsed;
      }
      console.log('No saved transaction state found in localStorage');
    } catch (error) {
      console.error('Error reading transaction state from localStorage:', error);
    }
    return null;
  };

  const savedState = initializeStateFromStorage();
  
  const [currentStep, setCurrentStep] = useState<TransactionStep>(savedState?.currentStep || 'create');
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetails | null>(
    savedState?.transactionDetails || null
  );
  const [gasOption, setGasOption] = useState<GasOption>(savedState?.gasOption || 'default');
  const [transactionInProgress, setTransactionInProgress] = useState<boolean>(
    savedState?.transactionInProgress || false
  );
  
  // Use a ref to store the current transaction ID to ensure it persists across renders
  const currentTransactionIdRef = useRef<string | null>(savedState?.transactionId || null);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stateToSave = {
        currentStep,
        transactionDetails,
        gasOption,
        transactionInProgress,
        transactionId: currentTransactionIdRef.current
      };
      
      console.log('Saving transaction state to localStorage:', stateToSave);
      localStorage.setItem('transactionState', JSON.stringify(stateToSave));
    } catch (error) {
      console.error('Error saving transaction state to localStorage:', error);
    }
  }, [currentStep, transactionDetails, gasOption, transactionInProgress]);

  // Generate a unique transaction ID
  const generateTransactionId = () => {
    const newId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    currentTransactionIdRef.current = newId;
    return newId;
  };

  // Get the current transaction ID
  const getCurrentTransactionId = () => {
    return currentTransactionIdRef.current;
  };

  // Helper function for going to a specific step
  const goToStep = (step: TransactionStep) => {
    console.log(`TransactionContext: going to step ${step} from current step ${currentStep}`);
    setCurrentStep(step);
  };

  // Helper functions
  const moveToConfirmStep = (details: TransactionDetails) => {
    console.log(`TransactionContext: moving to confirm step with details:`, details);
    setTransactionDetails(details);
    goToStep('confirm');
  };

  const moveToCompleteStep = (selectedGasOption: GasOption) => {
    console.log('Confirmation received, transitioning to complete step with gas option:', selectedGasOption);
    setGasOption(selectedGasOption);
    goToStep('complete');
    // Generate a new transaction ID when moving to complete step
    generateTransactionId();
  };

  const resetTransaction = () => {
    // Only reset if there's no transaction in progress
    if (!transactionInProgress) {
      setCurrentStep('create');
      setTransactionDetails(null);
      setGasOption('default');
      currentTransactionIdRef.current = null;
    } else {
      console.log('Cannot reset transaction while one is in progress');
    }
  };

  // Create a stable value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // State
    currentStep,
    transactionDetails,
    gasOption,
    transactionInProgress,
    
    // Actions
    setCurrentStep,
    setTransactionDetails,
    setGasOption,
    setTransactionInProgress,
    
    // Helper methods
    goToStep,
    moveToConfirmStep,
    moveToCompleteStep,
    resetTransaction,
    getCurrentTransactionId,
    generateTransactionId,
  }), [currentStep, transactionDetails, gasOption, transactionInProgress]);

  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  );
}

// Custom hook for using the context
export function useTransaction() {
  const context = useContext(TransactionContext);
  
  if (context === undefined) {
    throw new Error('useTransaction must be used within a TransactionProvider');
  }
  
  return context;
} 
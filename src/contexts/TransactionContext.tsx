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

// Create a more stable storage key
const STORAGE_KEY = 'nyx_wallet_transaction_state';

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
      const savedState = localStorage.getItem(STORAGE_KEY);
      
      // Don't clear localStorage here - only clear it when transaction finishes or is canceled
      // This prevents component cycle remounting issues with WebAuthn
      
      if (savedState) {
        const parsed = JSON.parse(savedState);
        console.log('Successfully loaded transaction state:', parsed);
        
        // Don't reset to create step - maintain the existing step
        // This prevents breaking WebAuthn flow which requires component stability
        
        return parsed;
      }
      console.log('No saved transaction state found in localStorage');
    } catch (error) {
      console.error('Error reading transaction state from localStorage:', error);
    }
    return null;
  };

  // Get initial state from localStorage
  const initialState = initializeStateFromStorage();
  
  // Guard against state corruption by validating initialState fields
  const validInitialState = initialState && 
    typeof initialState.currentStep === 'string' && 
    ['create', 'confirm', 'complete'].includes(initialState.currentStep);
    
  // Define state variables with proper initialization
  const [currentStep, setCurrentStep] = useState<TransactionStep>(
    validInitialState ? initialState.currentStep as TransactionStep : 'create'
  );
  
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetails | null>(
    validInitialState && initialState.transactionDetails ? initialState.transactionDetails : null
  );
  
  const [gasOption, setGasOption] = useState<GasOption>(
    validInitialState && initialState.gasOption ? initialState.gasOption as GasOption : 'default'
  );
  
  const [transactionInProgress, setTransactionInProgress] = useState<boolean>(
    validInitialState && typeof initialState.transactionInProgress === 'boolean' 
      ? initialState.transactionInProgress : false
  );
  
  // Use a ref to store the current transaction ID to ensure it persists across renders
  const currentTransactionIdRef = useRef<string | null>(
    validInitialState && initialState.transactionId ? initialState.transactionId : null
  );

  // More reliable state persistence
  const saveStateToStorage = (state: any) => {
    if (typeof window === 'undefined') return;
    
    try {
      console.log('Saving transaction state to localStorage:', state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving transaction state to localStorage:', error);
    }
  };

  // Save state to localStorage whenever it changes (with debounce)
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Cancel any pending save
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
    }
    
    // Create a new state object
    const stateToSave = {
      currentStep,
      transactionDetails,
      gasOption,
      transactionInProgress,
      transactionId: currentTransactionIdRef.current
    };
    
    // Debounce saves to reduce writes and potential race conditions
    saveTimeout.current = setTimeout(() => {
      saveStateToStorage(stateToSave);
    }, 50);
    
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
    };
  }, [currentStep, transactionDetails, gasOption, transactionInProgress]);

  // Generate a unique transaction ID
  const generateTransactionId = () => {
    const newId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    currentTransactionIdRef.current = newId;
    // Save immediately when ID changes
    saveStateToStorage({
      currentStep,
      transactionDetails,
      gasOption,
      transactionInProgress,
      transactionId: newId
    });
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
    // Save immediately when step changes
    saveStateToStorage({
      currentStep: step,
      transactionDetails,
      gasOption,
      transactionInProgress,
      transactionId: currentTransactionIdRef.current
    });
  };

  // Helper functions
  const moveToConfirmStep = (details: TransactionDetails) => {
    console.log(`TransactionContext: moving to confirm step with details:`, details);
    setTransactionDetails(details);
    // Use setTimeout to ensure details are set before changing step
    setTimeout(() => {
      goToStep('confirm');
    }, 0);
  };

  const moveToCompleteStep = (selectedGasOption: GasOption) => {
    console.log('Confirmation received, transitioning to complete step with gas option:', selectedGasOption);
    setGasOption(selectedGasOption);
    // Use setTimeout to ensure gas option is set before changing step
    setTimeout(() => {
      goToStep('complete');
      // Generate a new transaction ID when moving to complete step
      generateTransactionId();
    }, 0);
  };

  const resetTransaction = () => {
    // Only reset if there's no transaction in progress
    if (!transactionInProgress) {
      setCurrentStep('create');
      setTransactionDetails(null);
      setGasOption('default');
      currentTransactionIdRef.current = null;
      
      // Now it's safe to clear localStorage
      if (typeof window !== 'undefined') {
        console.log('Transaction complete or canceled - clearing localStorage state');
        localStorage.removeItem(STORAGE_KEY);
      }
      
      // Save reset state immediately
      saveStateToStorage({
        currentStep: 'create',
        transactionDetails: null,
        gasOption: 'default',
        transactionInProgress: false,
        transactionId: null
      });
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
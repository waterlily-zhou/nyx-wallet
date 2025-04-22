'use client';

import { TransactionData, TransactionStatus } from '@/contexts/TransactionContext';

export interface TransactionState {
  id: string | null;
  status: TransactionStatus;
  details: TransactionData | null;
  result: TransactionResult | null;
  error: string | null;
}

export interface TransactionResult {
  hash: string;
  blockNumber?: number;
  timestamp?: number;
}

// Type for subscribers to transaction state changes
type Subscriber = (state: TransactionState) => void;

class TransactionService {
  private state: TransactionState = {
    id: null,
    status: 'idle',
    details: null,
    result: null,
    error: null
  };

  private subscribers: Subscriber[] = [];
  private transactionInProgress = false;

  // Subscribe to state changes
  subscribe(callback: Subscriber): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  // Notify all subscribers of state changes
  private notifySubscribers(): void {
    this.subscribers.forEach(subscriber => subscriber({ ...this.state }));
  }

  // Update the state
  private updateState(newState: Partial<TransactionState>): void {
    this.state = { ...this.state, ...newState };
    this.notifySubscribers();
  }

  // Get current state
  getState(): TransactionState {
    return { ...this.state };
  }

  // Check if a transaction is in progress
  isTransactionInProgress(): boolean {
    return this.transactionInProgress;
  }

  // Start a new transaction
  async startTransaction(details: TransactionData): Promise<void> {
    if (this.transactionInProgress) {
      throw new Error('Transaction already in progress');
    }

    // Generate a unique transaction ID
    const transactionId = Date.now().toString();
    
    // Update state to indicate transaction has started
    this.transactionInProgress = true;
    this.updateState({
      id: transactionId,
      status: 'confirm',
      details,
      result: null,
      error: null
    });

    try {
      // This would be replaced with actual transaction logic
      this.updateState({ status: 'processing' });
      
      // Simulate transaction process
      // In a real implementation, this would call the blockchain
      // and handle WebAuthn authentication
      const result = await this.sendTransaction(details);
      
      this.updateState({
        status: 'complete',
        result
      });
    } catch (error) {
      console.error('Transaction failed:', error);
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      this.transactionInProgress = false;
    }
  }

  // Send the transaction to the blockchain
  private async sendTransaction(details: TransactionData): Promise<TransactionResult> {
    // This would be replaced with actual API calls
    // For now, just returning a mock response after a delay
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          hash: `0x${Math.random().toString(16).substring(2)}`,
          blockNumber: Math.floor(Math.random() * 1000000),
          timestamp: Date.now()
        });
      }, 2000);
    });
  }

  // Reset the transaction state
  resetTransaction(): void {
    this.transactionInProgress = false;
    this.updateState({
      id: null,
      status: 'idle',
      details: null,
      result: null,
      error: null
    });
  }
}

// Create a singleton instance
export const transactionService = new TransactionService(); 
/**
 * Retry utility functions to handle rate limiting and network errors
 */

interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 5,
  initialDelay: 500,
  maxDelay: 10000,
  backoffFactor: 1.5,
  retryableErrors: [
    'Too many request',
    'rate limit',
    'Rate limit',
    'too many request',
    'Too Many Requests',
    'too many requests',
    'Request failed with status code 429'
  ]
};

/**
 * Retry a function with exponential backoff
 * 
 * @param fn The function to retry
 * @param options Retry options
 * @returns The function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const retryOptions: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;
  
  for (let attempt = 0; attempt < retryOptions.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if this error is retryable
      const errorMessage = lastError.message.toLowerCase();
      const isRetryable = retryOptions.retryableErrors?.some(
        retryableError => errorMessage.includes(retryableError.toLowerCase())
      );
      
      // If not retryable or this is the last attempt, throw
      if (!isRetryable || attempt === retryOptions.maxRetries - 1) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        retryOptions.initialDelay * Math.pow(retryOptions.backoffFactor, attempt),
        retryOptions.maxDelay
      );
      
      // Log retry attempt
      console.log(`[Retry] Attempt ${attempt + 1}/${retryOptions.maxRetries} failed, retrying in ${delay}ms:`, 
        lastError.message);
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This shouldn't be reached due to the throw in the loop, but TypeScript requires it
  throw lastError!;
}

/**
 * Helper for retrying fetch requests with exponential backoff
 * 
 * @param url The URL to fetch
 * @param options Fetch options
 * @param retryOptions Retry options
 * @returns The fetch response
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions?: Partial<RetryOptions>
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, options);
      
      // Throw error for non-2xx responses to trigger retry
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed with status ${response.status}: ${text}`);
      }
      
      return response;
    },
    retryOptions
  );
} 
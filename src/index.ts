import * as dotenv from 'dotenv';
import { initializeStorage } from './utils/auth-utils.js';

// Load environment variables
dotenv.config();

/**
 * Main function to initialize the server
 */
async function main() {
  try {
    // Initialize storage for user accounts and credentials
    initializeStorage();
    
    console.log('✅ Server initialized successfully');
  } catch (error) {
    console.error('❌ Error in setup:', error);
    throw error;
  }
}

// Run the main function
main()
  .catch((error) => console.error('❌ Error:', error)); 
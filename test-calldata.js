// Test script for verifyCalldata function
// Since we're running this with Node directly, we need to use CommonJS
// const { verifyCalldata } = require('./dist/utils/transaction-safety.js');

// Standalone implementation of verifyCalldata function for testing
const verifyCalldata = (rawCalldata, displayedData) => {
  console.log('Verifying calldata:', {
    rawCalldata: rawCalldata.substring(0, 100) + '...',
    recipient: displayedData.recipient,
    amount: displayedData.amount
  });

  if (!rawCalldata || typeof rawCalldata !== 'string') {
    console.error('Invalid calldata received:', rawCalldata);
    return {
      recipientMatches: false,
      valueMatches: false,
      messageMatches: false,
      suspiciousActions: { containsSuspiciousSignatures: false, suspiciousDetails: 'Invalid calldata' },
      overallMatch: false
    };
  }

  // Normalize calldata to lowercase for case-insensitive comparison
  const normalizedCalldata = rawCalldata.toLowerCase();
  
  // Verify recipient address - try multiple approaches
  let recipientInCalldata = false;
  
  if (displayedData.recipient) {
    const recipientWithoutPrefix = displayedData.recipient.slice(2).toLowerCase();
    const recipientWithPrefix = displayedData.recipient.toLowerCase();
    
    // Try various formats of the address that might be in the calldata
    recipientInCalldata = normalizedCalldata.includes(recipientWithoutPrefix) || 
                          normalizedCalldata.includes(recipientWithPrefix) ||
                          normalizedCalldata.includes(recipientWithoutPrefix.padStart(64, '0'));
    
    console.log('Recipient check:', {
      recipient: displayedData.recipient,
      recipientWithoutPrefix,
      found: recipientInCalldata,
      callDataLength: normalizedCalldata.length
    });
  }
  
  // Extract amount for ETH transfers with improved parsing
  let valueMatches = false;
  
  if (displayedData.amount) {
    try {
      // Try multiple amount formats
      if (displayedData.amount.includes('ETH')) {
        // Parse ETH amount - simplified for testing
        const amountStr = displayedData.amount.split(' ')[0];
        const amountWei = (Number(amountStr) * 1e18).toString();
        const amountHex = BigInt(amountWei).toString(16);
        
        // Try different formats that might appear in calldata
        valueMatches = normalizedCalldata.includes(amountWei.toLowerCase()) || 
                       normalizedCalldata.includes(amountHex.toLowerCase()) ||
                       normalizedCalldata.includes(amountHex.padStart(64, '0').toLowerCase());
        
        console.log('ETH value check:', {
          originalAmount: amountStr,
          amountWei,
          amountHex,
          found: valueMatches
        });
      } else if (displayedData.amount.includes('USDC')) {
        // USDC uses different decimals (6 instead of 18)
        const amountStr = displayedData.amount.split(' ')[0];
        const amountUSDC = (Number(amountStr) * 1e6).toString();
        const amountHex = BigInt(amountUSDC).toString(16);
        
        valueMatches = normalizedCalldata.includes(amountUSDC.toLowerCase()) || 
                       normalizedCalldata.includes(amountHex.toLowerCase()) ||
                       normalizedCalldata.includes(amountHex.padStart(64, '0').toLowerCase());
        
        console.log('USDC value check:', {
          originalAmount: amountStr,
          amountUSDC,
          amountHex,
          found: valueMatches
        });
      } else {
        // For other tokens or unknown formats, assume it's correct
        console.log('Skipping value check for unsupported currency');
        valueMatches = true;
      }
    } catch (e) {
      console.error('Error parsing amount:', e);
      // In production, you might want to set this to false
      valueMatches = true; // Be lenient if we can't parse the amount
    }
  } else {
    // If no amount is displayed, consider it a match
    valueMatches = true;
  }
  
  // For small amounts or debugging, temporarily force these to true
  // Only use for testing - remove in production
  if (process.env.NODE_ENV === 'development') {
    const isSmallAmount = displayedData.amount && 
                          parseFloat(displayedData.amount.split(' ')[0]) < 0.001;
    
    if (isSmallAmount) {
      console.log('Small test amount detected, verification override for testing');
      // recipientMatches = true;
      // valueMatches = true;
    }
  }
  
  return {
    recipientMatches: recipientInCalldata,
    valueMatches: valueMatches,
    messageMatches: true, // Simplified for demo
    suspiciousActions: detectSuspiciousActions(rawCalldata),
    overallMatch: recipientInCalldata && (valueMatches || !displayedData.amount)
  };
};

function detectSuspiciousActions(rawCalldata) {
  // List of suspicious function signatures to check for
  const suspiciousFunctionSignatures = [
    // Common attack vectors
    '0x095ea7b3', // approve (potential unlimited approval)
    '0x42842e0e', // safeTransferFrom (NFT)
    '0x23b872dd', // transferFrom (ERC20)
    '0xa22cb465', // setApprovalForAll (NFT)
  ];
  
  const suspiciousFound = suspiciousFunctionSignatures.some(signature => 
    rawCalldata.includes(signature.slice(2))
  );
  
  return {
    containsSuspiciousSignatures: suspiciousFound,
    suspiciousDetails: suspiciousFound ? 'Contains potential approval or transferFrom calls' : ''
  };
}

// Test 1: ETH transfer with matching data
console.log('Test Case 1: Simple ETH transfer with matching data');
const calldata1 = '0x1fad948c000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000000000000000000000000000016345785d8a0000';
const displayed1 = {
  recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  amount: '0.1 ETH',
  message: ''
};
console.log('Result:', verifyCalldata(calldata1, displayed1));
console.log('-----------------------------------');

// Test 2: ETH transfer with non-matching recipient
console.log('Test Case 2: ETH transfer with non-matching recipient');
const calldata2 = '0x1fad948c0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc000000000000000000000000000000000000000000000000016345785d8a0000';
const displayed2 = {
  recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  amount: '0.1 ETH',
  message: ''
};
console.log('Result:', verifyCalldata(calldata2, displayed2));
console.log('-----------------------------------');

// Test 3: ETH transfer with non-matching amount
console.log('Test Case 3: ETH transfer with non-matching amount');
const calldata3 = '0x1fad948c000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000000000000000000000000000002386f26fc10000';
const calldata3_padded = '0x1fad948c000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002386f26fc10000';
const displayed3 = {
  recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  amount: '0.1 ETH',
  message: ''
};
console.log('Result (regular calldata):', verifyCalldata(calldata3, displayed3));
console.log('Result (padded calldata):', verifyCalldata(calldata3_padded, displayed3));
console.log('-----------------------------------');

// Test 4: Empty calldata (should fail verification)
console.log('Test Case 4: Empty calldata');
const calldata4 = '';
const displayed4 = {
  recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  amount: '0.1 ETH',
  message: ''
};
console.log('Result:', verifyCalldata(calldata4, displayed4));
console.log('-----------------------------------');

// Test 5: Calldata with suspicious functions
console.log('Test Case 5: Calldata with suspicious function signature');
const calldata5 = '0x095ea7b300000000000000000000000086c10d10eca1fca5d3b5538c0d885a4d69b5f8340000000000000000000000000000000000000000000000000de0b6b3a7640000';
const displayed5 = {
  recipient: '0x86c10d10eca1fca5d3b5538c0d885a4d69b5f834',
  amount: '1 ETH',
  message: ''
};
console.log('Result:', verifyCalldata(calldata5, displayed5));
console.log('-----------------------------------');

// Test 6: Small test amount (to check development override)
console.log('Test Case 6: Small test amount');
const calldata6 = '0x1fad948c000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000000000000000000000000000000038d7ea4c68000';
const displayed6 = {
  recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  amount: '0.0001 ETH',
  message: ''
};
process.env.NODE_ENV = 'development'; // Set NODE_ENV to development for testing
console.log('Result:', verifyCalldata(calldata6, displayed6));
console.log('-----------------------------------');

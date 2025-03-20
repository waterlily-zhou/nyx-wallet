document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const addAddressBtn = document.getElementById('addAddressBtn');
  const saveAddressBtn = document.getElementById('saveAddressBtn');
  const sendTransactionForm = document.getElementById('sendTransactionForm');
  const refreshWalletBtn = document.getElementById('refreshWalletBtn');
  const savedAddressesList = document.getElementById('savedAddressesList');
  const transactionStatus = document.getElementById('transactionStatus');
  const transactionLoading = document.getElementById('transactionLoading');
  const transactionResult = document.getElementById('transactionResult');
  const transactionError = document.getElementById('transactionError');
  const errorMessage = document.getElementById('errorMessage');
  const transactionHash = document.getElementById('transactionHash');
  const viewOnEtherscan = document.getElementById('viewOnEtherscan');
  
  // Bootstrap modal instances - only initialize if elements exist
  let addAddressModal, errorModal;
  
  const addAddressModalElement = document.getElementById('addAddressModal');
  if (addAddressModalElement) {
    try {
      addAddressModal = new bootstrap.Modal(addAddressModalElement);
    } catch (error) {
      console.error('Error initializing addAddressModal:', error);
    }
  }
  
  const errorModalElement = document.getElementById('errorModal');
  if (errorModalElement) {
    try {
      errorModal = new bootstrap.Modal(errorModalElement);
    } catch (error) {
      console.error('Error initializing errorModal:', error);
    }
  }
  
  // Function to show an error in the modal
  function showError(message) {
    console.log('Error:', message);
    const errorModalText = document.getElementById('errorModalText');
    if (errorModalText) {
      errorModalText.textContent = message;
    }
    
    if (errorModal) {
      errorModal.show();
    } else {
      // Fallback if modal isn't available
      alert(message);
    }
  }
  
  // Open the add address modal
  if (addAddressBtn && addAddressModal) {
    addAddressBtn.addEventListener('click', function() {
      const addAddressForm = document.getElementById('addAddressForm');
      if (addAddressForm) {
        addAddressForm.reset();
      }
      addAddressModal.show();
    });
  }
  
  // Save a new address
  if (saveAddressBtn) {
    saveAddressBtn.addEventListener('click', function() {
      const nameInput = document.getElementById('addressName');
      const addressInput = document.getElementById('addressValue');
      
      if (!nameInput || !addressInput) {
        showError('Form elements not found.');
        return;
      }
      
      const name = nameInput.value.trim();
      const address = addressInput.value.trim();
      
      if (!name) {
        showError('Please enter a name for this address.');
        return;
      }
      
      if (!address || !address.startsWith('0x') || address.length !== 42) {
        showError('Please enter a valid Ethereum address (42 characters, starts with 0x).');
        return;
      }
      
      // API call to save the address
      fetch('/api/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, address }),
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            // Reload the page to refresh the address list
            window.location.reload();
          } else {
            showError(data.error || 'Failed to save address.');
          }
        })
        .catch(error => {
          showError('An error occurred while saving the address.');
          console.error('Error saving address:', error);
        });
    });
  }
  
  // Delete an address
  if (savedAddressesList) {
    savedAddressesList.addEventListener('click', function(event) {
      if (event.target.classList.contains('delete-address-btn') || 
          event.target.closest('.delete-address-btn')) {
        
        const btn = event.target.classList.contains('delete-address-btn') ? 
                    event.target : 
                    event.target.closest('.delete-address-btn');
        
        const index = btn.dataset.index;
        
        if (confirm('Are you sure you want to delete this address?')) {
          // API call to delete the address
          fetch(`/api/addresses/${index}`, {
            method: 'DELETE',
          })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                // Reload the page to refresh the address list
                window.location.reload();
              } else {
                showError(data.error || 'Failed to delete address.');
              }
            })
            .catch(error => {
              showError('An error occurred while deleting the address.');
              console.error('Error deleting address:', error);
            });
        }
      }
      
      // Select an address for sending
      if (event.target.classList.contains('select-address-btn') || 
          event.target.closest('.select-address-btn')) {
        
        const card = event.target.closest('.address-card');
        if (!card) return;
        
        const address = card.dataset.address;
        
        if (address) {
          const recipientInput = document.getElementById('recipient');
          if (recipientInput) {
            recipientInput.value = address;
            // Scroll to the send transaction form
            const formHeader = document.querySelector('.card-header i.fa-paper-plane');
            if (formHeader) {
              formHeader.scrollIntoView({ behavior: 'smooth' });
            }
          }
        }
      }
    });
  }
  
  // Refresh wallet info
  if (refreshWalletBtn) {
    refreshWalletBtn.addEventListener('click', function() {
      window.location.reload();
    });
  }
  
  // Send a transaction
  if (sendTransactionForm) {
    console.log('Found sendTransactionForm, adding event listener');
    
    // Get the smart account address for the preview
    const smartAccountElement = document.querySelector('.wallet-address');
    const smartAccountAddress = smartAccountElement ? smartAccountElement.textContent.trim() : '';
    
    // Elements for transaction preview
    const reviewTransactionBtn = document.getElementById('reviewTransactionBtn');
    const editTransactionBtn = document.getElementById('editTransactionBtn');
    const confirmTransactionBtn = document.getElementById('confirmTransactionBtn');
    const transactionPreview = document.getElementById('transactionPreview');
    
    // Helper functions to get selected methods
    function getSelectedGasPaymentMethod() {
      const selectedGasOptionEl = document.querySelector('input[name="gasPayment"]:checked');
      return selectedGasOptionEl ? selectedGasOptionEl.value : 'default';
    }
    
    function getSelectedSubmissionMethod() {
      const selectedSubmissionMethodEl = document.querySelector('input[name="submissionMethod"]:checked');
      return selectedSubmissionMethodEl ? selectedSubmissionMethodEl.value : 'direct';
    }
    
    // Preview elements
    const previewFrom = document.getElementById('previewFrom');
    const previewTo = document.getElementById('previewTo');
    const previewAmount = document.getElementById('previewAmount');
    const previewMessage = document.getElementById('previewMessage');
    
    // Handle transaction form submission
    if (reviewTransactionBtn) {
      reviewTransactionBtn.addEventListener('click', function() {
        const recipientInput = document.getElementById('recipient');
        const messageInput = document.getElementById('message');
        const amountInput = document.getElementById('amount');
        const currencySelect = document.getElementById('currency');
        const selectedGasOptionEl = document.querySelector('input[name="gasPayment"]:checked');
        const selectedSubmissionMethodEl = document.querySelector('input[name="submissionMethod"]:checked');
        
        if (!recipientInput || !messageInput || !amountInput || !currencySelect ||
            !selectedGasOptionEl || !selectedSubmissionMethodEl) {
          showError('Form elements not found.');
          return;
        }
        
        const recipient = recipientInput.value.trim();
        const message = messageInput.value.trim();
        const amount = amountInput.value.trim() || '0';
        const currency = currencySelect.value;
        const gasPaymentMethod = selectedGasOptionEl.value;
        const submissionMethod = selectedSubmissionMethodEl.value;
        
        // Validate inputs
        if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
          showError('Please enter a valid Ethereum address.');
          return;
        }
        
        // New validation logic: either message or amount (or both) must be provided
        if (!message && (!amount || amount === '0')) {
          showError('Please enter either a message or an amount (or both).');
          return;
        }
        
        // Format wallet addresses
        const fromAddress = document.querySelector('.wallet-address') ? 
          document.querySelector('.wallet-address').textContent.trim() : 
          smartAccountAddress;
        const toAddress = recipient;
        
        // Get nonce from the server
        fetch('/api/get-nonce')
          .then(response => response.json())
          .then(data => {
            const nonce = data.nonce || 'N/A';
            
            // Check if this is a new recipient
            isNewRecipient(recipient)
              .then(isNew => {
                const recipientWarning = document.getElementById('recipientWarning');
                if (recipientWarning) {
                  recipientWarning.style.display = isNew ? 'block' : 'none';
                }
                
                // Update all preview elements
                updatePreviewFields({
                  fromAddress,
                  toAddress,
                  amount,
                  currency,
                  message,
                  nonce,
                  gasPaymentMethod,
                  submissionMethod
                });
                
                // Scroll to preview
                const transactionPreview = document.getElementById('transactionPreview');
                if (transactionPreview) {
                  transactionPreview.scrollIntoView({ behavior: 'smooth' });
                }
                
                // Run security check after a short delay
                setTimeout(() => {
                  // Run security check automatically when preview is shown
                  checkTransactionSafety();
                  
                  // Add "Re-run Security Check" button to the preview (in case they want to run it again)
                  const previewButtons = document.querySelector('.d-flex.justify-content-between.mt-4');
                  if (previewButtons && !document.getElementById('safetyCheckBtn')) {
                    const safetyCheckBtn = document.createElement('button');
                    safetyCheckBtn.type = 'button';
                    safetyCheckBtn.id = 'safetyCheckBtn';
                    safetyCheckBtn.className = 'btn btn-warning';
                    safetyCheckBtn.innerHTML = '<i class="fas fa-shield-alt me-2"></i> Re-run Security Check';
                    safetyCheckBtn.onclick = checkTransactionSafety;
                    
                    previewButtons.insertBefore(safetyCheckBtn, previewButtons.lastElementChild);
                  }
                }, 1000);
              })
              .catch(error => {
                console.error('Error checking recipient:', error);
                
                // Update preview anyway even if we couldn't check if recipient is new
                updatePreviewFields({
                  fromAddress,
                  toAddress,
                  amount,
                  currency,
                  message,
                  nonce,
                  gasPaymentMethod,
                  submissionMethod
                });
                
                // Show preview even if we couldn't check if recipient is new
                const transactionPreview = document.getElementById('transactionPreview');
                if (transactionPreview) {
                  transactionPreview.scrollIntoView({ behavior: 'smooth' });
                }
                
                // Still run the security check
                setTimeout(() => checkTransactionSafety(), 1000);
              });
          })
          .catch(error => {
            console.error('Error fetching nonce:', error);
            
            // Update with placeholder nonce
            updatePreviewFields({
              fromAddress,
              toAddress,
              amount,
              currency,
              message,
              nonce: 'N/A', 
              gasPaymentMethod,
              submissionMethod
            });
            
            // Show preview anyway
            const transactionPreview = document.getElementById('transactionPreview');
            if (transactionPreview) {
              transactionPreview.scrollIntoView({ behavior: 'smooth' });
            }
            
            // Still try to run security check
            setTimeout(() => checkTransactionSafety(), 1000);
          });
      });
    }
    
    // Function to check if an address is a new recipient
    function isNewRecipient(address) {
      return new Promise((resolve, reject) => {
        fetch('/api/check-recipient?address=' + encodeURIComponent(address))
          .then(response => response.json())
          .then(data => {
            resolve(data.isNew);
          })
          .catch(error => {
            console.error('Error checking recipient:', error);
            reject(error);
          });
      });
    }
    
    // Add these global variables to store transaction data securely
    let currentTransactionData = {
      rawCalldata: null,
      decodedCalldata: null,
      recipient: null,
      amount: null,
      currency: null,
      message: null,
      fromAddress: null,
      nonce: null,
      gasPaymentMethod: null,
      submissionMethod: null
    };

    // Update the updatePreviewFields function to use our secure approach
    function updatePreviewFields(data) {
      const transactionPreview = document.getElementById('transactionPreview');
      if (!transactionPreview) return;
      
      // Display the transaction preview
      transactionPreview.style.display = 'block';
      
      // Store data securely in our global variable
      currentTransactionData.recipient = data.toAddress;
      currentTransactionData.amount = data.amount;
      currentTransactionData.currency = data.currency;
      currentTransactionData.message = data.message;
      currentTransactionData.fromAddress = data.fromAddress;
      currentTransactionData.nonce = data.nonce;
      currentTransactionData.gasPaymentMethod = data.gasPaymentMethod;
      currentTransactionData.submissionMethod = data.submissionMethod;
      
      // Set values in UI elements
      // Transaction parameters
      const previewType = document.getElementById('previewType');
      if (previewType) previewType.textContent = parseFloat(data.amount) > 0 ? 
        `${data.currency} Transfer` : 'Message Only';
      
      const previewNetwork = document.getElementById('previewNetwork');
      if (previewNetwork) previewNetwork.textContent = 'Sepolia Testnet';
      
      const previewNonce = document.getElementById('previewNonce');
      if (previewNonce) previewNonce.textContent = data.nonce;
      
      const previewEstimatedTime = document.getElementById('previewEstimatedTime');
      if (previewEstimatedTime) previewEstimatedTime.textContent = '~15 seconds';
      
      // Addresses
      const previewFromAddress = document.getElementById('previewFromAddress');
      if (previewFromAddress) previewFromAddress.textContent = data.fromAddress;
      
      const previewToAddress = document.getElementById('previewToAddress');
      if (previewToAddress) previewToAddress.textContent = data.toAddress;
      
      // Message and amount
      const previewMessage = document.getElementById('previewMessage');
      if (previewMessage) {
        if (data.message) {
          previewMessage.textContent = data.message;
          previewMessage.parentElement.style.display = 'block';
        } else {
          previewMessage.parentElement.style.display = 'none';
        }
      }
      
      const previewAmount = document.getElementById('previewAmount');
      if (previewAmount) {
        if (parseFloat(data.amount) > 0) {
          previewAmount.textContent = `${data.amount} ${data.currency}`;
          previewAmount.parentElement.style.display = 'block';
        } else {
          previewAmount.parentElement.style.display = 'none';
        }
      }
      
      // Gas payment method
      const previewGasPaymentMethod = document.getElementById('previewGasPaymentMethod');
      if (previewGasPaymentMethod) {
        let gasMethod = 'Self-paid (ETH)';
        if (data.gasPaymentMethod === 'sponsored') {
          gasMethod = 'Sponsored (free)';
        } else if (data.gasPaymentMethod === 'usdc') {
          gasMethod = 'Pay with USDC';
        }
        previewGasPaymentMethod.textContent = gasMethod;
      }
      
      // Gas estimation (simplified)
      const previewEstimatedGasCost = document.getElementById('previewEstimatedGasCost');
      if (previewEstimatedGasCost) {
        if (data.gasPaymentMethod === 'sponsored') {
          previewEstimatedGasCost.innerHTML = '0 ETH <span class="text-success">(sponsored)</span>';
        } else if (data.gasPaymentMethod === 'usdc') {
          previewEstimatedGasCost.innerHTML = '~0.50 USDC';
        } else {
          previewEstimatedGasCost.textContent = '~0.0005 ETH';
        }
      }
      
      // Estimated total cost
      const previewEstimatedTotalCost = document.getElementById('previewEstimatedTotalCost');
      if (previewEstimatedTotalCost) {
        if (data.currency === 'ETH' && parseFloat(data.amount) > 0) {
          const gasCost = data.gasPaymentMethod === 'sponsored' ? 0 : 0.0005;
          const totalETH = data.gasPaymentMethod === 'usdc' || data.gasPaymentMethod === 'sponsored' ? 
            parseFloat(data.amount) : 
            parseFloat(data.amount) + gasCost;
          previewEstimatedTotalCost.textContent = `~${totalETH.toFixed(4)} ETH`;
        } else if (data.currency === 'USDC' && parseFloat(data.amount) > 0) {
          if (data.gasPaymentMethod === 'usdc') {
            const totalUSDC = parseFloat(data.amount) + 0.5;
            previewEstimatedTotalCost.textContent = `~${totalUSDC.toFixed(2)} USDC`;
          } else if (data.gasPaymentMethod === 'sponsored') {
            previewEstimatedTotalCost.textContent = `${data.amount} USDC`;
          } else {
            previewEstimatedTotalCost.textContent = `${data.amount} USDC + ~0.0005 ETH (gas)`;
          }
        } else {
          // Message only
          if (data.gasPaymentMethod === 'sponsored') {
            previewEstimatedTotalCost.textContent = '0 ETH (sponsored)';
          } else if (data.gasPaymentMethod === 'usdc') {
            previewEstimatedTotalCost.textContent = '~0.50 USDC (gas only)';
          } else {
            previewEstimatedTotalCost.textContent = '~0.0005 ETH (gas only)';
          }
        }
      }
      
      // Submission method
      const previewSubmissionMethod = document.getElementById('previewSubmissionMethod');
      if (previewSubmissionMethod) {
        let submissionMethod = 'Direct (Bundler API)';
        if (data.submissionMethod === 'flashbots') {
          submissionMethod = 'Flashbots Protect';
        } else if (data.submissionMethod === 'private') {
          submissionMethod = 'Private RPC';
        }
        previewSubmissionMethod.textContent = submissionMethod;
      }
      
      // Wallet balance change
      const previewBalanceChange = document.getElementById('previewBalanceChange');
      if (previewBalanceChange) {
        if (data.currency === 'ETH' && parseFloat(data.amount) > 0) {
          const gasCost = data.gasPaymentMethod === 'sponsored' ? 0 : 0.0005;
          const totalETH = data.gasPaymentMethod === 'usdc' || data.gasPaymentMethod === 'sponsored' ? 
            parseFloat(data.amount) : 
            parseFloat(data.amount) + gasCost;
          
          previewBalanceChange.innerHTML = `-${totalETH.toFixed(4)} ETH`;
        } else if (data.currency === 'USDC' && parseFloat(data.amount) > 0) {
          if (data.gasPaymentMethod === 'usdc') {
            const totalUSDC = parseFloat(data.amount) + 0.5;
            previewBalanceChange.innerHTML = `-${totalUSDC.toFixed(2)} USDC`;
          } else if (data.gasPaymentMethod === 'sponsored') {
            previewBalanceChange.innerHTML = `-${data.amount} USDC`;
          } else {
            previewBalanceChange.innerHTML = `-${data.amount} USDC, -0.0005 ETH (gas)`;
          }
        } else {
          // Message only
          if (data.gasPaymentMethod === 'sponsored') {
            previewBalanceChange.innerHTML = `0 ETH (sponsored)`;
          } else if (data.gasPaymentMethod === 'usdc') {
            previewBalanceChange.innerHTML = `-0.50 USDC (gas only)`;
          } else {
            previewBalanceChange.innerHTML = `-0.0005 ETH (gas only)`;
          }
        }
      }
      
      // Calldata (raw and decoded) - Set loading state here and fetch async in separate function
      const previewRawCalldata = document.getElementById('previewRawCalldata');
      const previewDecodedCalldata = document.getElementById('previewDecodedCalldata');
      
      // Set a loading state for the calldata
      if (previewRawCalldata) previewRawCalldata.innerHTML = '<div class="spinner-border spinner-border-sm text-light" role="status"><span class="visually-hidden">Loading...</span></div> Generating calldata...';
      if (previewDecodedCalldata) previewDecodedCalldata.innerHTML = '<div class="spinner-border spinner-border-sm text-light" role="status"><span class="visually-hidden">Loading...</span></div> Decoding calldata...';
      
      // Fetch calldata separately using our secure getCalldata function
      getCalldata().catch(error => {
        console.error('Error in getCalldata:', error);
      });
    }

    // Replace the existing getCalldata function with our secure implementation
    async function getCalldata() {
      if (!currentTransactionData.fromAddress || !currentTransactionData.recipient) {
        console.error('Missing required transaction data');
        throw new Error('Missing required transaction data');
      }
      
      try {
        // Create request payload from our stored data
        const calldataRequest = {
          fromAddress: currentTransactionData.fromAddress,
          toAddress: currentTransactionData.recipient,
          amount: currentTransactionData.amount,
          currency: currentTransactionData.currency,
          message: currentTransactionData.message,
          nonce: currentTransactionData.nonce || '0',
          gasPaymentMethod: currentTransactionData.gasPaymentMethod || getSelectedGasPaymentMethod(),
          submissionMethod: currentTransactionData.submissionMethod || getSelectedSubmissionMethod()
        };
        
        // Fetch the actual calldata from the backend
        const response = await fetch('/api/get-calldata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(calldataRequest),
        });
        
        const calldataResult = await response.json();
        
        if (!calldataResult.success) {
          throw new Error(calldataResult.error || 'Failed to generate calldata');
        }
        
        // Store the calldata securely in our variable
        currentTransactionData.rawCalldata = calldataResult.rawCalldata;
        currentTransactionData.decodedCalldata = calldataResult.decodedCalldata;
        
        // Update UI elements
        const previewRawCalldata = document.getElementById('previewRawCalldata');
        const previewDecodedCalldata = document.getElementById('previewDecodedCalldata');
        
        if (previewRawCalldata) {
          previewRawCalldata.textContent = calldataResult.rawCalldata;
        }
        
        if (previewDecodedCalldata) {
          previewDecodedCalldata.innerHTML = calldataResult.decodedCalldata;
        }
        
        return true;
      } catch (error) {
        console.error('Error getting calldata:', error);
        
        // Update UI to show error
        const previewRawCalldata = document.getElementById('previewRawCalldata');
        const previewDecodedCalldata = document.getElementById('previewDecodedCalldata');
        
        if (previewRawCalldata) {
          previewRawCalldata.textContent = 'Error generating calldata';
        }
        
        if (previewDecodedCalldata) {
          // Show simplified fallback
          let fallbackDecodedHtml = `
            <div class="text-danger">Failed to fetch calldata from server</div>
            <div class="small mt-2">
              <p>Basic transaction info:</p>
              <ul>
                <li>From: ${currentTransactionData.fromAddress}</li>
                <li>To: ${currentTransactionData.recipient}</li>
                <li>Amount: ${currentTransactionData.amount} ${currentTransactionData.currency}</li>
                ${currentTransactionData.message ? `<li>Message: "${currentTransactionData.message}"</li>` : ''}
              </ul>
            </div>
          `;
          previewDecodedCalldata.innerHTML = fallbackDecodedHtml;
        }
        
        displayError(`Failed to generate transaction: ${error.message}`);
        return false;
      }
    }
    
    // Return to edit mode
    if (editTransactionBtn) {
      editTransactionBtn.addEventListener('click', function() {
        if (transactionPreview) transactionPreview.style.display = 'none';
      });
    }
    
    // Add toggleAdvancedSafetyDetails to window for global access
    window.toggleAdvancedSafetyDetails = function() {
      const detailsSection = document.getElementById('advancedSafetyDetails');
      if (detailsSection) {
        if (detailsSection.classList.contains('d-none')) {
          detailsSection.classList.remove('d-none');
        } else {
          detailsSection.classList.add('d-none');
        }
      }
    };

    // Secure implementation of checkTransactionSafety
    async function checkTransactionSafety() {
      // Use the securely stored transaction data instead of reading from DOM
      if (!currentTransactionData.rawCalldata) {
        console.error('No transaction data available');
        displaySecurityError('No transaction data available. Please try again.');
        return;
      }
      
      // Get the current submission preferences that might have changed
      const selectedGasOptionEl = document.querySelector('input[name="gasPayment"]:checked');
      const selectedSubmissionMethodEl = document.querySelector('input[name="submissionMethod"]:checked');
      
      // Display data that's shown to the user - create this from our stored data
      const displayedData = {
        recipient: currentTransactionData.recipient,
        amount: `${currentTransactionData.amount} ${currentTransactionData.currency}`,
        message: currentTransactionData.message
      };
      
      // Show loading indicator in the security verification section
      const securityVerification = document.querySelector('.alert-warning');
      if (securityVerification) {
        securityVerification.innerHTML = `
          <div class="d-flex">
            <div class="me-3">
              <div class="spinner-border text-warning" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            </div>
            <div>
              <h5 class="mb-2">Security Analysis in Progress...</h5>
              <p class="mb-2">Our AI is analyzing your transaction for potential risks. This may take a few seconds.</p>
              <div class="progress mb-2" style="height: 8px;">
                <div class="progress-bar progress-bar-striped progress-bar-animated bg-warning" style="width: 100%"></div>
              </div>
              <ul class="small mb-0">
                <li><i class="fas fa-circle-notch fa-spin me-1"></i> Verifying call data...</li>
                <li><i class="fas fa-circle-notch fa-spin me-1"></i> Checking recipient risk...</li>
                <li><i class="fas fa-circle-notch fa-spin me-1"></i> Simulating transaction...</li>
                <li><i class="fas fa-circle-notch fa-spin me-1"></i> Analyzing with AI...</li>
              </ul>
            </div>
          </div>
        `;
      }
      
      try {
        // Call the API endpoint with our securely stored data
        const response = await fetch('/api/transaction-safety-check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: currentTransactionData.fromAddress,
            recipient: currentTransactionData.recipient,
            amount: currentTransactionData.amount,
            currency: currentTransactionData.currency,
            message: currentTransactionData.message,
            calldata: currentTransactionData.rawCalldata,
            displayedData,
            gasPaymentMethod: selectedGasOptionEl ? selectedGasOptionEl.value : 'default',
            submissionMethod: selectedSubmissionMethodEl ? selectedSubmissionMethodEl.value : 'direct'
          }),
        });
        
        const safetyResults = await response.json();
        
        if (!safetyResults.success) {
          throw new Error(safetyResults.error || 'Safety check failed');
        }
        
        // Display results
        displayTransactionSafetyResults(safetyResults);
        
      } catch (error) {
        console.error('Error checking transaction safety:', error);
        displaySecurityError(error.message);
      }
    }

    // Helper function for displaying security errors
    function displaySecurityError(errorMessage) {
      const securityVerification = document.querySelector('.alert-warning');
      if (securityVerification) {
        securityVerification.innerHTML = `
          <div class="d-flex">
            <div class="me-3">
              <i class="fas fa-exclamation-triangle fa-2x text-danger"></i>
            </div>
            <div>
              <h5 class="mb-2">Security Analysis Failed</h5>
              <p>We couldn't complete the security analysis. Please review the transaction carefully before sending.</p>
              <p class="text-danger">Error: ${errorMessage}</p>
            </div>
          </div>
        `;
      }
    }

    // Function to display transaction safety check results
    function displayTransactionSafetyResults(safetyResults) {
      const securityVerification = document.querySelector('.alert-warning');
      if (!securityVerification) return;
      
      const aiAnalysis = safetyResults.aiAnalysis;
      const safetyScore = aiAnalysis.safetyScore;
      
      // Determine color based on safety score
      let scoreColor = 'success';
      if (safetyScore < 50) {
        scoreColor = 'danger';
      } else if (safetyScore < 80) {
        scoreColor = 'warning';
      }
      
      // Create recommendations list
      const recommendationsList = aiAnalysis.recommendations 
        ? aiAnalysis.recommendations.map(rec => `<li>${rec}</li>`).join('')
        : '';
      
      // Create red flags list
      const redFlagsList = aiAnalysis.redFlags && aiAnalysis.redFlags.length > 0
        ? `<div class="mt-2">
             <strong class="text-danger">Red Flags:</strong>
             <ul class="mb-0 text-danger">
               ${aiAnalysis.redFlags.map(flag => `<li>${flag}</li>`).join('')}
             </ul>
           </div>`
        : '';
      
      // Display the results
      securityVerification.innerHTML = `
        <div class="d-flex">
          <div class="me-3 text-center">
            <div class="position-relative" style="width: 50px; height: 50px;">
              <div class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center">
                <span class="fw-bold">${safetyScore}</span>
              </div>
              <svg viewBox="0 0 36 36" width="50" height="50">
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#444"
                  stroke-width="1"
                  stroke-dasharray="100, 100"
                />
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="var(--bs-${scoreColor})"
                  stroke-width="3"
                  stroke-dasharray="${safetyScore}, 100"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <div class="small text-${scoreColor} fw-bold">Safety Score</div>
          </div>
          <div>
            <h5 class="mb-2">AI Security Analysis</h5>
            <p>${aiAnalysis.safetyAnalysis}</p>
            
            <div class="mt-2">
              <strong>Recommendations:</strong>
              <ul class="mb-0">
                ${recommendationsList}
              </ul>
            </div>
            
            ${redFlagsList}
            
            <div class="mt-3 d-flex justify-content-between">
              <div>
                <small class="text-muted">Analysis powered by ${aiAnalysis.aiServiceUsed || 'AI'}</small>
              </div>
              <div>
                <button type="button" class="btn btn-sm btn-outline-primary" onclick="toggleAdvancedSafetyDetails()">
                  <i class="fas fa-chart-bar me-1"></i> View Detailed Report
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div id="advancedSafetyDetails" class="mt-3 pt-3 border-top d-none">
          <h6>Detailed Safety Analysis</h6>
          
          <div class="row">
            <div class="col-md-6">
              <div class="card bg-dark text-light mb-2">
                <div class="card-header py-1">Call Data Verification</div>
                <div class="card-body py-2" style="height: 90px; overflow-y: auto;">
                  <ul class="mb-0 small">
                    <li>Recipient matches: <span class="${safetyResults.calldataVerification.recipientMatches ? 'text-success' : 'text-danger'}">${safetyResults.calldataVerification.recipientMatches ? 'Yes' : 'No'}</span></li>
                    <li>Value matches: <span class="${safetyResults.calldataVerification.valueMatches ? 'text-success' : 'text-danger'}">${safetyResults.calldataVerification.valueMatches ? 'Yes' : 'No'}</span></li>
                    <li>Suspicious actions: <span class="${!safetyResults.calldataVerification.suspiciousActions.containsSuspiciousSignatures ? 'text-success' : 'text-danger'}">${safetyResults.calldataVerification.suspiciousActions.containsSuspiciousSignatures ? 'Yes' : 'No'}</span></li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div class="col-md-6">
              <div class="card bg-dark text-light mb-2">
                <div class="card-header py-1">Recipient Risk Assessment</div>
                <div class="card-body py-2" style="height: 90px; overflow-y: auto;">
                  ${safetyResults.recipientRisk.riskIndicators && safetyResults.recipientRisk.riskIndicators.length > 0 ? 
                    `<div class="mb-0 small">
                      <p class="mb-1">Risk indicators: ${safetyResults.recipientRisk.riskIndicators.length}</p>
                      <ul class="mb-0 text-warning">
                        ${safetyResults.recipientRisk.riskIndicators.map(indicator => `<li>${indicator}</li>`).join('')}
                      </ul>
                    </div>` : 
                    '<p class="mb-0 small">Risk indicators: 0</p>'
                  }
                </div>
              </div>
            </div>
          </div>
          
          <div class="row">
            <div class="col-md-6">
              <div class="card bg-dark text-light mb-2">
                <div class="card-header py-1">Transaction Simulation</div>
                <div class="card-body py-2" style="height: 90px; overflow-y: auto;">
                  <ul class="mb-0 small">
                    <li>Success: <span class="${safetyResults.simulationResults.success ? 'text-success' : 'text-danger'}">${safetyResults.simulationResults.success ? 'Yes' : 'No'}</span></li>
                    <li>Simulated: ${safetyResults.simulationResults.simulated ? 'Yes' : 'No (skipped)'}</li>
                    ${safetyResults.simulationResults.warnings && safetyResults.simulationResults.warnings.length > 0 ? 
                      `<li>Warnings: <span class="text-warning">${safetyResults.simulationResults.warnings.join(', ')}</span></li>` : 
                      '<li>Warnings: <span class="text-success">None</span></li>'
                    }
                  </ul>
                </div>
              </div>
            </div>
            
            <div class="col-md-6">
              <div class="card bg-dark text-light mb-2">
                <div class="card-header py-1">Etherscan Data</div>
                <div class="card-body py-2" style="height: 90px; overflow-y: auto;">
                  <ul class="mb-0 small">
                    ${safetyResults.etherscanData.isContract ? 
                      `<li>Contract: <span class="text-warning">${safetyResults.etherscanData.contractName || 'Unknown'}</span></li>
                       <li>Verified: <span class="${safetyResults.etherscanData.isVerified ? 'text-success' : 'text-danger'}">${safetyResults.etherscanData.isVerified ? 'Yes' : 'No'}</span></li>` : 
                      '<li>Regular address (not a contract)</li>'
                    }
                    <li>Transaction volume: ${safetyResults.etherscanData.transactionVolume || 'Unknown'}</li>
                    ${safetyResults.etherscanData.warnings && safetyResults.etherscanData.warnings.length > 0 ? 
                      `<li>Warnings: <span class="text-warning">${safetyResults.etherscanData.warnings.join(', ')}</span></li>` : 
                      '<li>Warnings: <span class="text-success">None</span></li>'
                    }
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Form submission handler
    sendTransactionForm.addEventListener('submit', function(event) {
      console.log('Form submit event triggered!');
      event.preventDefault();
      
      const recipientInput = document.getElementById('recipient');
      const messageInput = document.getElementById('message');
      const amountInput = document.getElementById('amount');
      const currencySelect = document.getElementById('currency');
      const selectedGasOptionEl = document.querySelector('input[name="gasPayment"]:checked');
      const selectedSubmissionMethodEl = document.querySelector('input[name="submissionMethod"]:checked');
      
      if (!recipientInput || !messageInput || !amountInput || !currencySelect || 
          !selectedGasOptionEl || !selectedSubmissionMethodEl) {
        showError('Form elements not found.');
        return;
      }
      
      const recipient = recipientInput.value.trim();
      const message = messageInput.value.trim();
      const amount = amountInput.value.trim() || '0';
      const currency = currencySelect.value;
      const gasPaymentMethod = selectedGasOptionEl.value;
      const submissionMethod = selectedSubmissionMethodEl.value;
      
      console.log('Form data:', { 
        recipient, 
        message,
        amount,
        currency,
        gasPaymentMethod,
        submissionMethod 
      });
      
      // Validate the recipient
      if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
        showError('Please enter a valid Ethereum address.');
        return;
      }
      
      // Check that either message or amount is provided
      if (!message && (!amount || amount === '0')) {
        showError('Please enter either a message or an amount (or both).');
        return;
      }
      
      // Hide preview and show status
      if (transactionPreview) transactionPreview.style.display = 'none';
      
      // Show the transaction status area
      if (transactionStatus) transactionStatus.style.display = 'block';
      if (transactionLoading) transactionLoading.style.display = 'block';
      if (transactionResult) transactionResult.style.display = 'none';
      if (transactionError) transactionError.style.display = 'none';
      
      // Update loading message based on selected options
      const loadingMessage = document.getElementById('loadingMessage');
      if (loadingMessage) {
        let methodText = '';
        
        if (submissionMethod === 'bundler') {
          methodText = 'via bundler service';
        } else {
          methodText = 'via direct submission';
        }
        
        if (gasPaymentMethod === 'default') {
          loadingMessage.textContent = `Processing transaction ${methodText} (trying sponsorship first)...`;
        } else if (gasPaymentMethod === 'sponsored') {
          loadingMessage.textContent = `Processing sponsored transaction ${methodText}...`;
        } else if (gasPaymentMethod === 'usdc') {
          loadingMessage.textContent = `Processing transaction with USDC payment ${methodText}...`;
        }
      }
      
      // Scroll to the status area
      if (transactionStatus) {
        transactionStatus.scrollIntoView({ behavior: 'smooth' });
      }
      
      // API call to send the transaction
      fetch('/api/send-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          recipient, 
          message,
          amount,
          currency, 
          gasPaymentMethod,
          submissionMethod
        }),
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (transactionLoading) transactionLoading.style.display = 'none';
          
          if (data.success) {
            // Show success message
            if (transactionResult) transactionResult.style.display = 'block';
            if (transactionHash) transactionHash.value = data.transactionHash;
            if (viewOnEtherscan) viewOnEtherscan.href = data.explorerUrl;
          } else {
            // Show error message
            if (transactionError) transactionError.style.display = 'block';
            if (errorMessage) errorMessage.textContent = data.error || 'Transaction failed.';
          }
        })
        .catch(error => {
          console.error('Error sending transaction:', error);
          
          // Show error message
          if (transactionLoading) transactionLoading.style.display = 'none';
          if (transactionError) transactionError.style.display = 'block';
          if (errorMessage) errorMessage.textContent = 'An error occurred while sending the transaction: ' + error.message;
        });
    });
  } else {
    console.error('sendTransactionForm not found in the DOM');
  }
}); 
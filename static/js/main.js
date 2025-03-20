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
    
    // Preview elements
    const previewFrom = document.getElementById('previewFrom');
    const previewTo = document.getElementById('previewTo');
    const previewAmount = document.getElementById('previewAmount');
    const previewMessage = document.getElementById('previewMessage');
    
    // Show transaction preview
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
        
        // Determine transaction type
        let txType = '';
        if (message && (!amount || amount === '0')) {
          txType = 'Send Message';
        } else if ((!message || message === '') && amount && amount !== '0') {
          txType = `Send ${currency}`;
        } else {
          txType = `Send ${currency} with Message`;
        }
        
        // Format wallet addresses
        const fromAddress = smartAccountAddress;
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
                  txType,
                  nonce,
                  fromAddress,
                  toAddress,
                  amount,
                  currency,
                  message,
                  gasPaymentMethod,
                  submissionMethod
                });
                
                // Show preview
                if (transactionPreview) transactionPreview.style.display = 'block';
                
                // Scroll to preview
                transactionPreview.scrollIntoView({ behavior: 'smooth' });
              })
              .catch(error => {
                console.error('Error checking recipient:', error);
                updatePreviewFields({
                  txType,
                  nonce,
                  fromAddress,
                  toAddress,
                  amount,
                  currency,
                  message,
                  gasPaymentMethod,
                  submissionMethod
                });
                
                // Show preview even if we couldn't check if recipient is new
                if (transactionPreview) transactionPreview.style.display = 'block';
                transactionPreview.scrollIntoView({ behavior: 'smooth' });
              });
          })
          .catch(error => {
            console.error('Error fetching nonce:', error);
            // Update with placeholder nonce
            updatePreviewFields({
              txType: txType,
              nonce: 'N/A',
              fromAddress,
              toAddress,
              amount,
              currency,
              message,
              gasPaymentMethod,
              submissionMethod
            });
            
            // Show preview anyway
            if (transactionPreview) transactionPreview.style.display = 'block';
            transactionPreview.scrollIntoView({ behavior: 'smooth' });
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
    
    // Function to update all transaction preview fields
    function updatePreviewFields(data) {
      // Update basic transaction info
      const previewTxType = document.getElementById('previewTxType');
      if (previewTxType) previewTxType.textContent = data.txType;
      
      const previewNonce = document.getElementById('previewNonce');
      if (previewNonce) previewNonce.textContent = data.nonce;
      
      // Update addresses
      const previewFromAddress = document.getElementById('previewFromAddress');
      if (previewFromAddress) previewFromAddress.textContent = data.fromAddress;
      
      const previewToAddress = document.getElementById('previewToAddress');
      if (previewToAddress) previewToAddress.textContent = data.toAddress;
      
      // Update amount and message
      const previewAmount = document.getElementById('previewAmount');
      if (previewAmount) previewAmount.textContent = `${data.amount} ${data.currency}`;
      
      // Update estimated fiat value
      const previewFiatValue = document.getElementById('previewFiatValue');
      if (previewFiatValue) {
        // Current rough price estimates (would be fetched from an API in production)
        const priceMap = {
          'ETH': 2500,
          'USDC': 1
        };
        const price = priceMap[data.currency] || 0;
        const estimatedValue = parseFloat(data.amount) * price; 
        previewFiatValue.textContent = `≈ $${estimatedValue.toFixed(2)} USD`;
      }
      
      const previewMessage = document.getElementById('previewMessage');
      if (previewMessage) {
        if (data.message) {
          previewMessage.textContent = data.message;
          previewMessage.style.display = 'block';
        } else {
          previewMessage.textContent = '(No message)';
          previewMessage.style.display = 'block';
        }
      }
      
      // Update gas details
      const previewGasMethod = document.getElementById('previewGasMethod');
      if (previewGasMethod) {
        let iconClass = 'fas fa-gift text-success';
        let methodText = 'Try Sponsorship First (with USDC fallback)';
        
        if (data.gasPaymentMethod === 'sponsored') {
          methodText = 'Sponsored Only (free, may be rejected)';
        } else if (data.gasPaymentMethod === 'usdc') {
          iconClass = 'fas fa-money-bill';
          methodText = 'USDC Payment Only';
        }
        
        previewGasMethod.innerHTML = `<i class="${iconClass} me-2"></i> ${methodText}`;
      }
      
      // Update estimated gas cost
      const previewGasCost = document.getElementById('previewGasCost');
      if (previewGasCost) {
        // Fixed estimate for demo purposes. In production, this would be a real calculation.
        const gasEstimate = '~0.0001 ETH';
        previewGasCost.textContent = gasEstimate;
      }
      
      // Update submission method
      const previewSubmissionMethod = document.getElementById('previewSubmissionMethod');
      if (previewSubmissionMethod) {
        if (data.submissionMethod === 'direct') {
          previewSubmissionMethod.innerHTML = '<i class="fas fa-network-wired me-2"></i> Direct RPC Submission';
        } else {
          previewSubmissionMethod.innerHTML = '<i class="fas fa-box me-2"></i> Bundler Service';
        }
      }
      
      // Update balance change
      const previewBalanceChange = document.getElementById('previewBalanceChange');
      if (previewBalanceChange) {
        if (parseFloat(data.amount) > 0) {
          previewBalanceChange.textContent = `-${data.amount} ${data.currency} (plus gas fees)`;
        } else {
          previewBalanceChange.textContent = 'Only gas fees';
        }
      }
      
      // Update transaction data
      const previewTxData = document.getElementById('previewTxData');
      if (previewTxData) {
        // Create a placeholder for the transaction data
        let txData = '0x';
        if (data.message) {
          // Use browser-friendly encoding without Buffer
          txData = '0x' + Array.from(new TextEncoder().encode(data.message))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        }
        previewTxData.textContent = txData;
      }
      
      // Generate and update calldata
      const previewRawCalldata = document.getElementById('previewRawCalldata');
      const previewCalldataTo = document.getElementById('previewCalldataTo');
      const previewCalldataValue = document.getElementById('previewCalldataValue');
      const previewCalldataMessage = document.getElementById('previewCalldataMessage');
      const previewDecodedCalldata = document.getElementById('previewDecodedCalldata');
      
      if (previewRawCalldata && previewDecodedCalldata) {
        // Instead of generating calldata in the frontend, fetch it from the backend
        const calldataRequest = {
          fromAddress: data.fromAddress,
          toAddress: data.toAddress,
          amount: data.amount,
          currency: data.currency,
          message: data.message,
          nonce: data.nonce,
          gasPaymentMethod: data.gasPaymentMethod,
          submissionMethod: data.submissionMethod
        };
        
        // Set a loading state for the calldata
        if (previewRawCalldata) previewRawCalldata.innerHTML = '<div class="spinner-border spinner-border-sm text-light" role="status"><span class="visually-hidden">Loading...</span></div> Generating calldata...';
        if (previewDecodedCalldata) previewDecodedCalldata.innerHTML = '<div class="spinner-border spinner-border-sm text-light" role="status"><span class="visually-hidden">Loading...</span></div> Decoding calldata...';
        
        // Fetch the actual calldata from the backend
        fetch('/api/get-calldata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(calldataRequest),
        })
          .then(response => response.json())
          .then(calldataResult => {
            // Update the raw calldata display with the complete calldata from backend
            if (previewRawCalldata && calldataResult.rawCalldata) {
              previewRawCalldata.textContent = calldataResult.rawCalldata;
            } else {
              previewRawCalldata.textContent = 'Error fetching calldata';
            }
            
            // Update the decoded calldata with the properly decoded version from backend
            if (previewDecodedCalldata && calldataResult.decodedCalldata) {
              previewDecodedCalldata.innerHTML = calldataResult.decodedCalldata;
            } else {
              // Fallback to a simplified view if backend doesn't provide proper decoded view
              // This is just a fallback - the backend should be doing the proper decoding
              let decodedHtml = '';
              
              if (parseFloat(data.amount) > 0 && data.currency === 'ETH') {
                decodedHtml = `
                  <div><span class="text-danger">EntryPoint:</span> <span class="text-info">handleOps</span>(UserOperation[] calldata ops, address payable beneficiary)</div>
                  <div class="ms-3"><span class="text-warning">ops[0].sender:</span> <span class="text-success">${data.fromAddress}</span></div>
                  <div class="ms-3"><span class="text-warning">ops[0].nonce:</span> <span class="text-success">${data.nonce}</span></div>
                  <div class="ms-3"><span class="text-warning">ops[0].callData:</span> <span class="text-info">execute</span>(address to, uint256 value, bytes data)</div>
                  <div class="ms-5"><span class="text-warning">to:</span> <span class="text-success">${data.toAddress}</span></div>
                  <div class="ms-5"><span class="text-warning">value:</span> <span class="text-success">${data.amount} ETH</span></div>
                  <div class="ms-5"><span class="text-warning">data:</span> <span class="text-success">0x</span> <span class="text-muted">(empty)</span></div>
                  <div class="ms-3"><span class="text-muted">... and more UserOperation fields ...</span></div>
                `;
              } else if (parseFloat(data.amount) > 0 && data.currency === 'USDC') {
                decodedHtml = `
                  <div><span class="text-danger">EntryPoint:</span> <span class="text-info">handleOps</span>(UserOperation[] calldata ops, address payable beneficiary)</div>
                  <div class="ms-3"><span class="text-warning">ops[0].sender:</span> <span class="text-success">${data.fromAddress}</span></div>
                  <div class="ms-3"><span class="text-warning">ops[0].nonce:</span> <span class="text-success">${data.nonce}</span></div>
                  <div class="ms-3"><span class="text-warning">ops[0].callData:</span> <span class="text-info">execute</span>(address to, uint256 value, bytes data)</div>
                  <div class="ms-5"><span class="text-warning">to:</span> <span class="text-success">USDC Contract</span></div>
                  <div class="ms-5"><span class="text-warning">value:</span> <span class="text-success">0 ETH</span></div>
                  <div class="ms-5"><span class="text-warning">data:</span> <span class="text-info">transfer</span>(address,uint256)</div>
                  <div class="ms-3"><span class="text-muted">... and more UserOperation fields ...</span></div>
                `;
              } else if (data.message) {
                decodedHtml = `
                  <div><span class="text-danger">EntryPoint:</span> <span class="text-info">handleOps</span>(UserOperation[] calldata ops, address payable beneficiary)</div>
                  <div class="ms-3"><span class="text-warning">ops[0].sender:</span> <span class="text-success">${data.fromAddress}</span></div>
                  <div class="ms-3"><span class="text-warning">ops[0].nonce:</span> <span class="text-success">${data.nonce}</span></div>
                  <div class="ms-3"><span class="text-warning">ops[0].callData:</span> <span class="text-info">execute</span>(address to, uint256 value, bytes data)</div>
                  <div class="ms-5"><span class="text-warning">to:</span> <span class="text-success">${data.toAddress}</span></div>
                  <div class="ms-5"><span class="text-warning">value:</span> <span class="text-success">0 ETH</span></div>
                  <div class="ms-5"><span class="text-warning">message:</span> <span class="text-success">"${data.message}"</span></div>
                  <div class="ms-3"><span class="text-muted">... and more UserOperation fields ...</span></div>
                `;
              } else {
                decodedHtml = `<div class="text-muted">(No calldata available - invalid transaction)</div>`;
              }
              
              previewDecodedCalldata.innerHTML = decodedHtml;
            }
          })
          .catch(error => {
            console.error('Error fetching calldata:', error);
            previewRawCalldata.textContent = 'Error generating calldata';
            
            // Show simplified fallback
            let fallbackDecodedHtml = `
              <div class="text-danger">Failed to fetch calldata from server</div>
              <div class="small mt-2">
                <p>Basic transaction info:</p>
                <ul>
                  <li>From: ${data.fromAddress}</li>
                  <li>To: ${data.toAddress}</li>
                  <li>Amount: ${data.amount} ${data.currency}</li>
                  ${data.message ? `<li>Message: "${data.message}"</li>` : ''}
                </ul>
              </div>
            `;
            previewDecodedCalldata.innerHTML = fallbackDecodedHtml;
          });
      }
      
      // Update UserOperation parameters
      const previewCallGasLimit = document.getElementById('previewCallGasLimit');
      if (previewCallGasLimit) previewCallGasLimit.textContent = '90000'; // Fixed example value
      
      const previewVerificationGasLimit = document.getElementById('previewVerificationGasLimit');
      if (previewVerificationGasLimit) previewVerificationGasLimit.textContent = '100000'; // Fixed example value
      
      const previewPreVerificationGas = document.getElementById('previewPreVerificationGas');
      if (previewPreVerificationGas) previewPreVerificationGas.textContent = '21000'; // Fixed example value
      
      // Update max fee parameters
      const previewMaxFeePerGas = document.getElementById('previewMaxFeePerGas');
      if (previewMaxFeePerGas) previewMaxFeePerGas.textContent = '1000000000'; // 1 Gwei
      
      const previewMaxPriorityFeePerGas = document.getElementById('previewMaxPriorityFeePerGas');
      if (previewMaxPriorityFeePerGas) previewMaxPriorityFeePerGas.textContent = '100000000'; // 0.1 Gwei
      
      // Set Etherscan simulation link
      const previewEtherscanLink = document.getElementById('previewEtherscanLink');
      if (previewEtherscanLink) {
        // Set link to Sepolia Etherscan with recipient address
        previewEtherscanLink.href = `https://sepolia.etherscan.io/address/${data.toAddress}`;
      }
    }
    
    // Return to edit mode
    if (editTransactionBtn) {
      editTransactionBtn.addEventListener('click', function() {
        if (transactionPreview) transactionPreview.style.display = 'none';
      });
    }
    
    // Add this function after the updatePreviewFields function but before the form submission handler
    async function checkTransactionSafety() {
      // Get the current transaction data
      const recipient = document.getElementById('recipient').value.trim();
      const message = document.getElementById('message').value.trim();
      const amount = document.getElementById('amount').value.trim() || '0';
      const currency = document.getElementById('currency').value;
      const fromAddress = document.getElementById('previewFromAddress').textContent;
      const calldata = document.getElementById('previewRawCalldata').textContent;
      const selectedGasOptionEl = document.querySelector('input[name="gasPayment"]:checked');
      const selectedSubmissionMethodEl = document.querySelector('input[name="submissionMethod"]:checked');
      
      // Display data that's shown to the user
      const displayedData = {
        recipient: document.getElementById('previewToAddress').textContent,
        amount: document.getElementById('previewAmount').textContent,
        message: message
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
              <p>Our AI is analyzing your transaction for potential security issues. This may take a few seconds.</p>
            </div>
          </div>
        `;
      }
      
      try {
        // Call the API endpoint
        const response = await fetch('/api/transaction-safety-check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: fromAddress,
            recipient,
            amount,
            currency,
            message,
            calldata,
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
        
        // Show error in security verification section
        if (securityVerification) {
          securityVerification.innerHTML = `
            <div class="d-flex">
              <div class="me-3">
                <i class="fas fa-exclamation-triangle fa-2x text-danger"></i>
              </div>
              <div>
                <h5 class="mb-2">Security Analysis Failed</h5>
                <p>We couldn't complete the security analysis. Please review the transaction carefully before sending.</p>
                <p class="text-danger">Error: ${error.message}</p>
              </div>
            </div>
          `;
        }
      }
    }

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
                <div class="card-body py-2">
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
                <div class="card-body py-2">
                  <ul class="mb-0 small">
                    <li>Risk score: <span class="fw-bold text-${safetyResults.recipientRisk.riskCategory === 'Low' ? 'success' : safetyResults.recipientRisk.riskCategory === 'Medium' ? 'warning' : 'danger'}">${safetyResults.recipientRisk.riskScore}/100 (${safetyResults.recipientRisk.riskCategory})</span></li>
                    <li>New address: <span class="${!safetyResults.recipientRisk.isNewAddress ? 'text-success' : 'text-warning'}">${safetyResults.recipientRisk.isNewAddress ? 'Yes' : 'No'}</span></li>
                    <li>Is contract: <span class="${!safetyResults.recipientRisk.isContract ? 'text-success' : 'text-warning'}">${safetyResults.recipientRisk.isContract ? 'Yes' : 'No'}</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          
          <div class="row">
            <div class="col-md-6">
              <div class="card bg-dark text-light mb-2">
                <div class="card-header py-1">Transaction Simulation</div>
                <div class="card-body py-2">
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
                <div class="card-body py-2">
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

    // Add toggleAdvancedSafetyDetails to window for global access
    window.toggleAdvancedSafetyDetails = function() {
      const detailsDiv = document.getElementById('advancedSafetyDetails');
      if (detailsDiv) {
        detailsDiv.classList.toggle('d-none');
      }
    }

    // Add the safety check to the review transaction button
    if (document.getElementById('reviewTransactionBtn')) {
      const originalReviewTransactionBtnClick = document.getElementById('reviewTransactionBtn').onclick;
      
      document.getElementById('reviewTransactionBtn').onclick = function() {
        if (originalReviewTransactionBtnClick) {
          originalReviewTransactionBtnClick.call(this);
        }
        
        // Add a small delay to ensure the preview is shown
        setTimeout(() => {
          // Add "Check Transaction Safety" button to the preview
          const previewButtons = document.querySelector('.d-flex.justify-content-between.mt-4');
          if (previewButtons && !document.getElementById('safetyCheckBtn')) {
            const safetyCheckBtn = document.createElement('button');
            safetyCheckBtn.type = 'button';
            safetyCheckBtn.id = 'safetyCheckBtn';
            safetyCheckBtn.className = 'btn btn-warning';
            safetyCheckBtn.innerHTML = '<i class="fas fa-shield-alt me-2"></i> Check Transaction Safety';
            safetyCheckBtn.onclick = checkTransactionSafety;
            
            previewButtons.insertBefore(safetyCheckBtn, previewButtons.lastElementChild);
          }
        }, 500);
      };
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
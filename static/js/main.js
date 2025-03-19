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
        
        if (!recipientInput || !messageInput || !amountInput || !currencySelect) {
          showError('Form elements not found.');
          return;
        }
        
        const recipient = recipientInput.value.trim();
        const message = messageInput.value.trim();
        const amount = amountInput.value.trim() || '0';
        const currency = currencySelect.value;
        
        // Validate inputs
        if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
          showError('Please enter a valid Ethereum address.');
          return;
        }
        
        if (!message) {
          showError('Please enter a message to send.');
          return;
        }
        
        // Update preview elements
        if (previewFrom) previewFrom.textContent = smartAccountAddress;
        if (previewTo) previewTo.textContent = recipient;
        if (previewAmount) previewAmount.textContent = `${amount} ${currency}`;
        if (previewMessage) previewMessage.textContent = message;
        
        // Show preview
        if (transactionPreview) transactionPreview.style.display = 'block';
        
        // Scroll to preview
        transactionPreview.scrollIntoView({ behavior: 'smooth' });
      });
    }
    
    // Return to edit mode
    if (editTransactionBtn) {
      editTransactionBtn.addEventListener('click', function() {
        if (transactionPreview) transactionPreview.style.display = 'none';
      });
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
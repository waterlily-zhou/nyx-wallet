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
  
  // Bootstrap modal instances
  const addAddressModal = new bootstrap.Modal(document.getElementById('addAddressModal'));
  const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
  
  // Function to show an error in the modal
  function showError(message) {
    document.getElementById('errorModalText').textContent = message;
    errorModal.show();
  }
  
  // Open the add address modal
  if (addAddressBtn) {
    addAddressBtn.addEventListener('click', function() {
      document.getElementById('addAddressForm').reset();
      addAddressModal.show();
    });
  }
  
  // Save a new address
  if (saveAddressBtn) {
    saveAddressBtn.addEventListener('click', function() {
      const nameInput = document.getElementById('addressName');
      const addressInput = document.getElementById('addressValue');
      
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
        const address = card.dataset.address;
        
        if (address) {
          document.getElementById('recipient').value = address;
          // Scroll to the send transaction form
          document.querySelector('.card-header i.fa-paper-plane').scrollIntoView({ behavior: 'smooth' });
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
    sendTransactionForm.addEventListener('submit', function(event) {
      event.preventDefault();
      
      const recipient = document.getElementById('recipient').value.trim();
      const message = document.getElementById('message').value.trim();
      const selectedGasOption = document.querySelector('input[name="gasPayment"]:checked').value;
      
      if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
        showError('Please enter a valid Ethereum address.');
        return;
      }
      
      if (!message) {
        showError('Please enter a message to send.');
        return;
      }
      
      // Show the transaction status area
      transactionStatus.style.display = 'block';
      transactionLoading.style.display = 'block';
      transactionResult.style.display = 'none';
      transactionError.style.display = 'none';
      
      // Update loading message based on selected gas option
      const loadingMessage = document.getElementById('loadingMessage');
      if (selectedGasOption === 'bundler') {
        loadingMessage.textContent = 'Processing transaction via bundler service...';
      } else if (selectedGasOption === 'hybrid') {
        loadingMessage.textContent = 'Processing transaction (trying sponsorship first)...';
      } else if (selectedGasOption === 'sponsored') {
        loadingMessage.textContent = 'Processing sponsored transaction...';
      } else if (selectedGasOption === 'usdc') {
        loadingMessage.textContent = 'Processing transaction with USDC payment...';
      }
      
      // Scroll to the status area
      transactionStatus.scrollIntoView({ behavior: 'smooth' });
      
      // API call to send the transaction
      fetch('/api/send-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          recipient, 
          message, 
          gasPaymentMethod: selectedGasOption
        }),
      })
        .then(response => response.json())
        .then(data => {
          transactionLoading.style.display = 'none';
          
          if (data.success) {
            // Show success message
            transactionResult.style.display = 'block';
            transactionHash.textContent = data.transactionHash;
            viewOnEtherscan.href = data.explorerUrl;
          } else {
            // Show error message
            transactionError.style.display = 'block';
            errorMessage.textContent = data.error || 'Transaction failed.';
          }
        })
        .catch(error => {
          // Show error message
          transactionLoading.style.display = 'none';
          transactionError.style.display = 'block';
          errorMessage.textContent = 'An error occurred while sending the transaction.';
          console.error('Error sending transaction:', error);
        });
    });
  }
}); 
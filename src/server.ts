import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import views from '@ladjs/koa-views';
import cors from '@koa/cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { Hex } from 'viem';
import { validateEnvironment, createOwnerAccount, createPublicClientForSepolia, createPimlicoClientInstance, createSafeSmartAccount } from './utils/client-setup.js';
import { sendTransaction, GasPaymentMethod } from './usdc-gas-payment.js';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to saved addresses
const savedAddressesPath = join(__dirname, '../data/saved-addresses.json');

// Ensure directory exists
const dataDir = join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize or load saved addresses
let savedAddresses: { name: string; address: string }[] = [];
try {
  if (fs.existsSync(savedAddressesPath)) {
    const data = fs.readFileSync(savedAddressesPath, 'utf8');
    savedAddresses = JSON.parse(data);
  } else {
    // Initialize with some example addresses
    savedAddresses = [
      { name: 'Vitalik', address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' },
      { name: 'Pimlico', address: '0x3e8c6142bbe4e9adccdfcf2c6ad2eca0fc1d813c' }
    ];
    fs.writeFileSync(savedAddressesPath, JSON.stringify(savedAddresses, null, 2));
  }
} catch (error) {
  console.error('Error loading saved addresses:', error);
  // Continue with empty array
  savedAddresses = [];
}

// Function to save addresses to file
function saveAddresses() {
  try {
    fs.writeFileSync(savedAddressesPath, JSON.stringify(savedAddresses, null, 2));
  } catch (error) {
    console.error('Error saving addresses:', error);
  }
}

// Function to initialize wallet
async function initializeWallet() {
  try {
    const { apiKey, privateKey } = validateEnvironment();
    const owner = createOwnerAccount(privateKey);
    const publicClient = createPublicClientForSepolia();
    const pimlicoClient = createPimlicoClientInstance(apiKey);
    
    console.log('Loading Safe smart account...');
    const safeAccount = await createSafeSmartAccount(publicClient, owner);
    
    console.log(`Smart account address: ${safeAccount.address}`);
    
    // Check ETH balance
    const ethBalance = await publicClient.getBalance({
      address: safeAccount.address,
    });
    
    return {
      owner,
      publicClient,
      pimlicoClient,
      safeAccount,
      ethBalance
    };
  } catch (error) {
    console.error('Failed to initialize wallet:', error);
    throw error;
  }
}

// Create a new Koa application
const app = new Koa();
const router = new Router();

// Set application name
const APP_NAME = 'Nyx Wallet';
console.log(`Initializing ${APP_NAME}...`);

// Middleware
app.use(bodyParser());
app.use(cors());

// Set up static file serving
app.use(async (ctx, next) => {
  if (ctx.path.startsWith('/static/')) {
    try {
      const filePath = join(__dirname, '..', ctx.path);
      
      if (fs.existsSync(filePath)) {
        // Set appropriate content type
        if (ctx.path.endsWith('.css')) {
          ctx.type = 'text/css';
        } else if (ctx.path.endsWith('.js')) {
          ctx.type = 'application/javascript';
        } else if (ctx.path.endsWith('.png')) {
          ctx.type = 'image/png';
        } else if (ctx.path.endsWith('.jpg') || ctx.path.endsWith('.jpeg')) {
          ctx.type = 'image/jpeg';
        } else if (ctx.path.endsWith('.svg')) {
          ctx.type = 'image/svg+xml';
        }
        
        ctx.body = fs.readFileSync(filePath, 'utf8');
        console.log(`Served static file: ${ctx.path}`);
        return;
      }
    } catch (error) {
      console.error(`Error serving static file: ${ctx.path}`, error);
    }
  }
  await next();
});

// Configure views with a simpler approach
app.use(views(join(__dirname, '../views'), { 
  extension: 'ejs',
  map: { html: 'ejs' }
}));

// Routes
router.get('/', async (ctx) => {
  try {
    const wallet = await initializeWallet();
    
    await ctx.render('index', {
      layout: 'test-layout',
      title: `${APP_NAME} - Bringing Light to Crypto`,
      wallet: {
        address: wallet.safeAccount.address,
        ownerAddress: wallet.owner.address,
        ethBalance: wallet.ethBalance.toString()
      },
      savedAddresses
    });
  } catch (error) {
    console.error('Render error:', error);
    await ctx.render('error', { 
      layout: 'test-layout',
      title: `${APP_NAME} - Error`,
      error 
    });
  }
});

// Add a new route for the standalone page
router.get('/standalone', async (ctx) => {
  try {
    console.log(`Rendering ${APP_NAME} standalone page`);
    const wallet = await initializeWallet();
    
    // Render standalone page without layout
    await ctx.render('standalone', {
      title: `${APP_NAME} - Standalone`,
      wallet: {
        address: wallet.safeAccount.address,
        ownerAddress: wallet.owner.address,
        ethBalance: wallet.ethBalance.toString()
      },
      savedAddresses
    });
    console.log('Standalone page rendered successfully');
  } catch (error: unknown) {
    console.error('Standalone render error:', error);
    ctx.body = `<h1>${APP_NAME} - Error</h1><pre>${error instanceof Error ? error.stack || error.message : 'Unknown error'}</pre>`;
  }
});

// Add a direct HTML route without using the view engine
router.get('/raw-html', async (ctx) => {
  try {
    console.log('Serving raw HTML page');
    const wallet = await initializeWallet();
    
    // Create a simple raw HTML page
    ctx.type = 'text/html';
    ctx.body = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Raw HTML Test</title>
        <style>
          body {
            background-color: black;
            color: white;
            font-family: Arial, sans-serif;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: #333;
            padding: 20px;
            border-radius: 10px;
          }
          .header {
            background-color: #6246ea;
            color: white;
            padding: 10px;
            text-align: center;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          .info {
            background-color: #444;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 15px;
          }
          .address {
            font-family: monospace;
            word-break: break-all;
            background-color: #222;
            padding: 8px;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Raw HTML Test</h1>
            <p>Testing direct HTML response</p>
          </div>
          
          <div class="info">
            <h2>Wallet Info</h2>
            <p>Smart Account:</p>
            <div class="address">${wallet.safeAccount.address}</div>
            <p>Owner Account:</p>
            <div class="address">${wallet.owner.address}</div>
            <p>ETH Balance: ${wallet.ethBalance.toString()} wei</p>
          </div>
          
          <div class="info">
            <h2>Saved Addresses</h2>
            ${savedAddresses.map(addr => `
              <div>
                <strong>${addr.name}</strong>
                <div class="address">${addr.address}</div>
              </div>
            `).join('<hr>')}
          </div>
        </div>
      </body>
      </html>
    `;
    console.log('Raw HTML page served successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Raw HTML error:', errorMessage);
    ctx.body = `<h1>Error</h1><pre>${errorStack || errorMessage}</pre>`;
  }
});

// Direct route for CSS files
router.get('/static/css/style.css', async (ctx) => {
  try {
    const cssPath = join(__dirname, '../static/css/style.css');
    if (fs.existsSync(cssPath)) {
      ctx.type = 'text/css';
      ctx.body = fs.readFileSync(cssPath, 'utf8');
      console.log('Served CSS file directly');
    } else {
      ctx.status = 404;
      ctx.body = 'CSS file not found';
    }
  } catch (error) {
    console.error('Error serving CSS file:', error);
    ctx.status = 500;
    ctx.body = 'Error serving CSS file';
  }
});

// API to get saved addresses
router.get('/api/addresses', (ctx) => {
  ctx.body = savedAddresses;
});

// API to add a new address
router.post('/api/addresses', (ctx) => {
  const { name, address } = ctx.request.body as any;
  
  if (!name || !address) {
    ctx.status = 400;
    ctx.body = { error: 'Name and address are required' };
    return;
  }
  
  if (!address.startsWith('0x') || address.length !== 42) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid Ethereum address format' };
    return;
  }
  
  savedAddresses.push({ name, address });
  saveAddresses();
  
  ctx.body = { success: true, addresses: savedAddresses };
});

// API to delete an address
router.delete('/api/addresses/:index', (ctx) => {
  const index = parseInt(ctx.params.index, 10);
  
  if (isNaN(index) || index < 0 || index >= savedAddresses.length) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid address index' };
    return;
  }
  
  savedAddresses.splice(index, 1);
  saveAddresses();
  
  ctx.body = { success: true, addresses: savedAddresses };
});

// API to send a transaction
router.post('/api/send-transaction', async (ctx) => {
  try {
    const { 
      recipient, 
      message, 
      amount = '0', 
      currency = 'ETH',
      gasPaymentMethod = 'default', 
      submissionMethod = 'direct' 
    } = ctx.request.body as any;
    
    if (!recipient || !message) {
      ctx.status = 400;
      ctx.body = { error: 'Recipient and message are required' };
      return;
    }
    
    if (!recipient.startsWith('0x') || recipient.length !== 42) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid Ethereum address format' };
      return;
    }
    
    // Convert message to hex
    const messageHex = '0x' + Buffer.from(message).toString('hex') as Hex;
    
    // Parse amount to send
    let valueToSend = 0n;
    
    if (amount && parseFloat(amount) > 0) {
      if (currency === 'ETH') {
        // Convert ETH amount to wei (1 ETH = 10^18 wei)
        valueToSend = BigInt(Math.floor(parseFloat(amount) * 1e18));
      }
      // Note: If currency is USDC, we'll handle it differently in the transaction
      // This is just for logging, the actual USDC transfer would be handled in the contract interaction
    }
    
    console.log(`Sending message to ${recipient}`);
    console.log(`Message: "${message}"`);
    console.log(`Amount: ${amount} ${currency}`);
    console.log(`Value in wei: ${valueToSend.toString()}`);
    console.log(`Gas payment method: ${gasPaymentMethod}`);
    console.log(`Submission method: ${submissionMethod}`);
    
    // Send the transaction using the specified methods
    let hash;
    
    if (submissionMethod === 'bundler') {
      // Use bundler service from bundler-service.js
      const { sendUserOperation, waitForUserOperationReceipt } = await import('./utils/bundler-service.js');
      const { apiKey, privateKey } = validateEnvironment();
      
      let txData: `0x${string}` = messageHex as `0x${string}`;
      
      // If sending USDC, we would need to create proper contract call data here
      // (Not implementing full USDC transfer logic, just illustrating)
      if (currency === 'USDC' && parseFloat(amount) > 0) {
        console.log('USDC transfer functionality would be implemented here');
        // Would need to prepare ERC20 transfer call data
      }
      
      hash = await sendUserOperation({
        privateKey,
        apiKey,
        to: recipient as `0x${string}`,
        data: txData,
        value: currency === 'ETH' ? valueToSend : 0n
      });
      
      // Wait for receipt
      await waitForUserOperationReceipt(hash, privateKey, apiKey);
    } else {
      // Use standard transaction methods based on gas payment preference
      hash = await sendTransaction({
        recipient,
        data: messageHex,
        value: currency === 'ETH' ? valueToSend : 0n,
        gasPaymentMethod: gasPaymentMethod as typeof GasPaymentMethod[keyof typeof GasPaymentMethod]
        // Note: If currency is USDC, the actual token transfer would need to be 
        // implemented through contract interactions in the sendTransaction function
      });
    }
    
    ctx.body = {
      success: true,
      transactionHash: hash,
      explorerUrl: `https://sepolia.etherscan.io/tx/${hash}`
    };
  } catch (error) {
    console.error('Transaction failed:', error);
    ctx.status = 500;
    ctx.body = { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

// Use the router
app.use(router.routes()).use(router.allowedMethods());

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${APP_NAME} server running at http://localhost:${PORT}/`);
});

export default app; 
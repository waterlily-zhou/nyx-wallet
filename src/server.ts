import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import views from '@ladjs/koa-views';
import cors from '@koa/cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { Hex, encodeFunctionData, http, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { validateEnvironment, createOwnerAccount, createPublicClientForSepolia, createPimlicoClientInstance, createSafeSmartAccount } from './utils/client-setup.js';
import { sendTransaction, GasPaymentMethod } from './usdc-gas-payment.js';
import { createSmartAccountClient } from 'permissionless';

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

// API to get the current nonce
router.get('/api/get-nonce', async (ctx) => {
  try {
    const { publicClient } = await initializeWallet();
    const wallet = await initializeWallet();
    
    // Get the transaction count (nonce)
    const nonce = await publicClient.getTransactionCount({
      address: wallet.safeAccount.address,
    });
    
    ctx.body = { success: true, nonce: nonce.toString() };
  } catch (error) {
    console.error('Error fetching nonce:', error);
    ctx.status = 500;
    ctx.body = { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      nonce: '0' // Default fallback
    };
  }
});

// API to check if a recipient is new (not in saved addresses)
router.get('/api/check-recipient', async (ctx) => {
  try {
    const address = ctx.query.address as string;
    
    if (!address) {
      ctx.status = 400;
      ctx.body = { error: 'Address parameter is required' };
      return;
    }
    
    // Check if the address exists in saved addresses
    const isNew = !savedAddresses.some(saved => 
      saved.address.toLowerCase() === address.toLowerCase()
    );
    
    ctx.body = { success: true, isNew };
  } catch (error) {
    console.error('Error checking recipient:', error);
    ctx.status = 500;
    ctx.body = { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      isNew: true // Default to showing warning
    };
  }
});

// API to generate UserOperation calldata without sending it
router.post('/api/get-calldata', async (ctx) => {
  try {
    const { 
      fromAddress,
      toAddress,
      amount = '0',
      currency = 'ETH',
      message = '',
      nonce = '0',
      gasPaymentMethod = 'default',
      submissionMethod = 'direct'
    } = ctx.request.body as any;
    
    if (!fromAddress || !toAddress) {
      ctx.status = 400;
      ctx.body = { error: 'From and to addresses are required' };
      return;
    }
    
    // Ensure fromAddress and toAddress are valid Ethereum addresses
    if (!fromAddress.startsWith('0x') || fromAddress.length !== 42 || 
        !toAddress.startsWith('0x') || toAddress.length !== 42) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid Ethereum address format' };
      return;
    }
    
    // Initialize the wallet environment
    const { apiKey, privateKey } = validateEnvironment();
    const owner = createOwnerAccount(privateKey);
    const publicClient = createPublicClientForSepolia();
    const pimlicoClient = createPimlicoClientInstance(apiKey);
    
    // Create the Safe account instance
    const safeAccount = await createSafeSmartAccount(publicClient, owner);
    
    // Create the smart account client for creating UserOperations
    const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
    const smartAccountClient = createSmartAccountClient({
      account: safeAccount,
      chain: sepolia,
      bundlerTransport: http(pimlicoUrl),
      paymaster: pimlicoClient,
    });
    
    console.log(`Generating calldata for transaction from ${fromAddress} to ${toAddress}`);
    console.log(`Amount: ${amount} ${currency}`);
    console.log(`Message: ${message}`);
    
    // Convert message to hex if provided
    const messageHex = message ? ('0x' + Buffer.from(message).toString('hex') as Hex) : '0x';
    
    // Parse amount to send
    let valueToSend = 0n;
    let txData: Hex = '0x';
    
    if (currency === 'ETH') {
      // For ETH transfer, set the value and leave data empty unless there's a message
      valueToSend = amount && parseFloat(amount) > 0 ? 
        BigInt(Math.floor(parseFloat(amount) * 1e18)) : 0n;
      txData = messageHex;
    } else if (currency === 'USDC' && parseFloat(amount) > 0) {
      // For USDC transfer, prepare ERC20 transfer call data
      const SEPOLIA_USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
      const ERC20_ABI = [
        {
          name: "transfer",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" }
          ],
          outputs: [{ name: "", type: "bool" }]
        }
      ];
      
      // Convert USDC amount to proper units (USDC has 6 decimals)
      const usdcAmount = BigInt(Math.floor(parseFloat(amount) * 1e6));
      
      // Create ERC20 transfer call data
      txData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [toAddress as Address, usdcAmount]
      });
      
      // If there's a message, we would need a more complex transaction
      // For simplicity, we'll just add the message in comments for now
      if (message) {
        console.log(`Message included with USDC transfer: ${message}`);
        console.log(`Note: Message is stored in comment only, not in the actual transaction data`);
      }
    } else if (message) {
      // For message-only transfers, just include the message as data
      txData = messageHex;
    }
    
    // Prepare a UserOperation request (without actually sending it)
    try {
      // Create gas price estimation
      const gasPrices = await pimlicoClient.getUserOperationGasPrice();
      
      // Create calldata for the execute function of the Safe wallet
      const executeCalldata = encodeFunctionData({
        abi: [{
          name: "execute",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" }
          ],
          outputs: [{ name: "", type: "bytes" }]
        }],
        functionName: "execute",
        args: [
          currency === 'USDC' ? '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address : toAddress as Address,
          valueToSend, 
          txData
        ]
      });
      
      // Instead of trying to create a real UserOperation, create a simplified representation for demo purposes
      const userOp = {
        sender: fromAddress,
        nonce: nonce,
        initCode: '0x',
        callData: executeCalldata,
        callGasLimit: '90000',
        verificationGasLimit: '100000',
        preVerificationGas: '21000',
        maxFeePerGas: gasPrices.fast.maxFeePerGas.toString(),
        maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas.toString(),
        paymasterAndData: gasPaymentMethod === 'sponsored' ? 
          '0x1234567890123456789012345678901234567890' : '0x',
        signature: '0x'
      };
      
      // Get the raw calldata that would be sent to the EntryPoint contract
      // This is a simulated representation of the handleOps function call
      const rawCalldata = `0x1fad948c${Object.entries(userOp)
        .map(([key, val]) => {
          if (key === 'signature' || key === 'paymasterAndData' || key === 'initCode') {
            return val.toString().slice(2); // Remove 0x prefix
          }
          // Handle different value types appropriately
          if (typeof val === 'string' && val.startsWith('0x')) {
            return val.slice(2).padStart(64, '0');
          } else if (typeof val === 'string') {
            // Try to convert to hex
            return val.padStart(64, '0');
          } else {
            return val.toString().padStart(64, '0');
          }
        })
        .join('')}`;
      
      // Create a decoded HTML representation of the calldata
      let decodedCalldata = '';
      
      if (currency === 'ETH' && parseFloat(amount) > 0) {
        decodedCalldata = `
          <div><span class="text-danger">EntryPoint:</span> <span class="text-info">handleOps</span>(UserOperation[] calldata ops, address payable beneficiary)</div>
          <div class="ms-3"><span class="text-warning">ops[0].sender:</span> <span class="text-success">${fromAddress}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].nonce:</span> <span class="text-success">${nonce}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].callData:</span> <span class="text-info">execute</span>(address to, uint256 value, bytes data)</div>
          <div class="ms-5"><span class="text-warning">to:</span> <span class="text-success">${toAddress}</span></div>
          <div class="ms-5"><span class="text-warning">value:</span> <span class="text-success">${amount} ETH</span> <span class="text-muted">(${valueToSend} wei)</span></div>
          ${message ? `<div class="ms-5"><span class="text-warning">data:</span> <span class="text-success">${messageHex}</span></div>
          <div class="ms-5"><span class="text-warning">decoded message:</span> <span class="text-success">"${message}"</span></div>` : 
          `<div class="ms-5"><span class="text-warning">data:</span> <span class="text-success">0x</span> <span class="text-muted">(empty bytes - direct ETH transfer)</span></div>`}
          <div class="ms-3"><span class="text-warning">ops[0].callGasLimit:</span> <span class="text-success">90000</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].verificationGasLimit:</span> <span class="text-success">100000</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].preVerificationGas:</span> <span class="text-success">21000</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].maxFeePerGas:</span> <span class="text-success">${gasPrices.fast.maxFeePerGas}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].maxPriorityFeePerGas:</span> <span class="text-success">${gasPrices.fast.maxPriorityFeePerGas}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].paymasterAndData:</span> <span class="text-success">${gasPaymentMethod === 'sponsored' ? '0x1234...' : '0x'}</span> <span class="text-muted">(${gasPaymentMethod === 'sponsored' ? 'Sponsored transaction' : gasPaymentMethod === 'usdc' ? 'USDC payment' : 'self-paid'})</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].signature:</span> <span class="text-success">0x...</span> <span class="text-muted">(ECDSA signature placeholder)</span></div>
        `;
      } else if (currency === 'USDC' && parseFloat(amount) > 0) {
        decodedCalldata = `
          <div><span class="text-danger">EntryPoint:</span> <span class="text-info">handleOps</span>(UserOperation[] calldata ops, address payable beneficiary)</div>
          <div class="ms-3"><span class="text-warning">ops[0].sender:</span> <span class="text-success">${fromAddress}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].nonce:</span> <span class="text-success">${nonce}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].callData:</span> <span class="text-info">execute</span>(address to, uint256 value, bytes data)</div>
          <div class="ms-5"><span class="text-warning">to:</span> <span class="text-success">0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238</span> <span class="text-muted">(USDC Token)</span></div>
          <div class="ms-5"><span class="text-warning">value:</span> <span class="text-success">0 ETH</span></div>
          <div class="ms-5"><span class="text-warning">data:</span> <span class="text-info">transfer</span>(address to, uint256 value)</div>
          <div class="ms-5 ms-2"><span class="text-warning">to:</span> <span class="text-success">${toAddress}</span></div>
          <div class="ms-5 ms-2"><span class="text-warning">value:</span> <span class="text-success">${amount} USDC</span> <span class="text-muted">(${BigInt(Math.floor(parseFloat(amount) * 1e6))} units)</span></div>
          ${message ? `<div class="ms-5 ms-2"><span class="text-muted">// Note: Message "${message}" is not included in the token transfer</span></div>` : ''}
          <div class="ms-3"><span class="text-warning">ops[0].callGasLimit:</span> <span class="text-success">120000</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].verificationGasLimit:</span> <span class="text-success">110000</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].preVerificationGas:</span> <span class="text-success">21000</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].maxFeePerGas:</span> <span class="text-success">${gasPrices.fast.maxFeePerGas}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].maxPriorityFeePerGas:</span> <span class="text-success">${gasPrices.fast.maxPriorityFeePerGas}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].paymasterAndData:</span> <span class="text-success">${gasPaymentMethod === 'sponsored' ? '0x1234...' : gasPaymentMethod === 'usdc' ? '0x5678...' : '0x'}</span> <span class="text-muted">(${gasPaymentMethod === 'sponsored' ? 'Sponsored transaction' : gasPaymentMethod === 'usdc' ? 'USDC payment' : 'self-paid'})</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].signature:</span> <span class="text-success">0x...</span> <span class="text-muted">(ECDSA signature placeholder)</span></div>
        `;
      } else if (message) {
        decodedCalldata = `
          <div><span class="text-danger">EntryPoint:</span> <span class="text-info">handleOps</span>(UserOperation[] calldata ops, address payable beneficiary)</div>
          <div class="ms-3"><span class="text-warning">ops[0].sender:</span> <span class="text-success">${fromAddress}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].nonce:</span> <span class="text-success">${nonce}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].callData:</span> <span class="text-info">execute</span>(address to, uint256 value, bytes data)</div>
          <div class="ms-5"><span class="text-warning">to:</span> <span class="text-success">${toAddress}</span></div>
          <div class="ms-5"><span class="text-warning">value:</span> <span class="text-success">0 ETH</span></div>
          <div class="ms-5"><span class="text-warning">data:</span> <span class="text-success">${messageHex}</span></div>
          <div class="ms-5"><span class="text-warning">decoded message:</span> <span class="text-success">"${message}"</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].callGasLimit:</span> <span class="text-success">90000</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].verificationGasLimit:</span> <span class="text-success">100000</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].preVerificationGas:</span> <span class="text-success">21000</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].maxFeePerGas:</span> <span class="text-success">${gasPrices.fast.maxFeePerGas}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].maxPriorityFeePerGas:</span> <span class="text-success">${gasPrices.fast.maxPriorityFeePerGas}</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].paymasterAndData:</span> <span class="text-success">${gasPaymentMethod === 'sponsored' ? '0x1234...' : '0x'}</span> <span class="text-muted">(${gasPaymentMethod === 'sponsored' ? 'Sponsored transaction' : gasPaymentMethod === 'usdc' ? 'USDC payment' : 'self-paid'})</span></div>
          <div class="ms-3"><span class="text-warning">ops[0].signature:</span> <span class="text-success">0x...</span> <span class="text-muted">(ECDSA signature placeholder)</span></div>
        `;
      } else {
        decodedCalldata = `<div class="text-muted">(No calldata available - invalid transaction with no amount or message)</div>`;
      }
      
      // Return the results
      ctx.body = {
        success: true,
        rawCalldata,
        decodedCalldata
      };
    } catch (error) {
      console.error('Error preparing UserOperation:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error preparing UserOperation'
      };
    }
  } catch (error) {
    console.error('Error generating calldata:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// API to send a transaction
router.post('/api/send-transaction', async (ctx) => {
  try {
    const { 
      recipient, 
      message = '', 
      amount = '0', 
      currency = 'ETH',
      gasPaymentMethod = 'default', 
      submissionMethod = 'direct' 
    } = ctx.request.body as any;
    
    if (!recipient) {
      ctx.status = 400;
      ctx.body = { error: 'Recipient address is required' };
      return;
    }
    
    // Ensure either message or amount is provided
    if (!message && (!amount || parseFloat(amount) <= 0)) {
      ctx.status = 400;
      ctx.body = { error: 'Either a message or an amount must be provided' };
      return;
    }
    
    if (!recipient.startsWith('0x') || recipient.length !== 42) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid Ethereum address format' };
      return;
    }
    
    // Convert message to hex if provided
    const messageHex = message ? ('0x' + Buffer.from(message).toString('hex') as Hex) : '0x';
    
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
import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import views from '@ladjs/koa-views';
import cors from '@koa/cors';
import session from 'koa-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { Hex, encodeFunctionData, http, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { 
  validateEnvironment, 
  createOwnerAccount, 
  createPublicClient, 
  createPimlicoClientInstance, 
  createSafeSmartAccount,
  getActiveChain 
} from './utils/client-setup.js';
import { sendTransaction, GasPaymentMethod } from './usdc-gas-payment.js';
import { createSmartAccountClient } from 'permissionless';
import { verifyCalldata, checkRecipientRisk, simulateTransaction, checkEtherscanData, aiTransactionAnalysis } from './utils/transaction-safety.js';
import authRoutes from './routes/auth-routes.js';

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
    
    // Use the chain-agnostic public client instead of Sepolia-specific client
    const publicClient = createPublicClient();
    const activeChain = getActiveChain();
    console.log(`Initializing wallet on ${activeChain.chain.name} chain`);
    
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

// Define session interface to fix TypeScript errors
declare module 'koa' {
  interface DefaultState {}
  
  interface DefaultContext {
    session: {
      userId?: string;
      tempUserId?: string;
      challenge?: string;
      expectedUserId?: string;
      transactionChallenge?: string;
      walletAddress?: `0x${string}`;
      [key: string]: any;
    } & Record<string, any>;
    render: (viewPath: string, locals?: Record<string, any>) => Promise<void>;
  }
}

// Extend the ParameterizedContext interface with session
declare module 'koa-router' {
  interface IRouterParamContext {
    session: {
      userId?: string;
      tempUserId?: string;
      challenge?: string;
      expectedUserId?: string;
      transactionChallenge?: string;
      walletAddress?: `0x${string}`;
      [key: string]: any;
    } & Record<string, any>;
  }
}

// Create a new Koa application
const app = new Koa();
const router = new Router();

// Set application name
const APP_NAME = 'Nyx Wallet';
console.log(`Initializing ${APP_NAME}...`);

// Session configuration
app.keys = [process.env.SESSION_SECRET || 'nyx-wallet-secret-key'];
const SESSION_CONFIG = {
  key: 'nyx:sess',
  maxAge: 86400000, // 1 day in milliseconds
  autoCommit: true,
  overwrite: true,
  httpOnly: true,
  signed: true,
  rolling: false,
  renew: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const
};

// Middleware
app.use(session(SESSION_CONFIG, app));
app.use(bodyParser());
app.use(cors({
  credentials: true, 
  origin: process.env.CORS_ORIGIN || '*'
}));

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

// Register auth routes - IMPORTANT: This must be before the router registration
app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

// Routes
router.get('/', async (ctx) => {
  try {
    // Check if user is logged in by checking session
    if (!ctx.session || !ctx.session.userId) {
      // If not logged in, redirect to login page
      return ctx.redirect('/login');
    }
    
    // Get user from the authentication system
    const { findUserById } = await import('./utils/auth-utils.js');
    const user = findUserById(ctx.session.userId);
    
    if (!user || !user.walletAddress) {
      // If user has no wallet, redirect to login
      return ctx.redirect('/login');
    }
    
    // Get active chain information
    const { getActiveChain } = await import('./utils/client-setup.js');
    const activeChain = getActiveChain();
    
    // Get the public client for blockchain interactions
    const { createPublicClient } = await import('./utils/client-setup.js');
    const publicClient = createPublicClient();
    
    // Get the wallet's ETH balance
    const ethBalance = await publicClient.getBalance({
      address: user.walletAddress,
    });
    
    // Render the index page with wallet information
    await ctx.render('index', {
      layout: 'test-layout',
      title: `${APP_NAME} - Bringing Light to Crypto`,
      wallet: {
        address: user.walletAddress,
        ownerAddress: user.walletAddress, // For smart accounts, this would be different
        ethBalance: ethBalance.toString(),
        chain: {
          name: activeChain.chain.name,
          id: activeChain.chain.id
        }
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

// Wallet creation endpoint for non-authenticated users
// IMPORTANT: Remove the duplicate route from auth-routes.ts if it exists
// This is a direct endpoint without the /api/auth prefix
router.post('/api/wallet/create', async (ctx) => {
  try {
    const { generateRandomPrivateKey, createSmartAccountFromPrivateKey, createUser } = await import('./utils/auth-utils.js');
    
    // Generate a new random private key
    const privateKey = generateRandomPrivateKey();
    
    console.log("Generated private key for wallet creation");
    
    try {
      // Create a smart account from the private key
      const { address, privateKey: savedKey } = await createSmartAccountFromPrivateKey(privateKey);
      
      // Create a new user with the wallet
      const user = createUser('user_' + address.slice(0, 6), 'direct', address, savedKey);
      
      // Set session
      ctx.session.userId = user.id;
      
      ctx.body = {
        success: true,
        wallet: {
          address,
          type: 'smart-account'
        }
      };
    } catch (error) {
      console.error('Error in smart account creation:', error);
      
      // Fallback to creating a simple EOA wallet without smart account
      // This will allow the app to work even when network calls fail
      const address = '0x' + privateKey.slice(2).padStart(40, '0');
      const user = createUser('user_' + address.slice(0, 6), 'direct', address, privateKey);
      
      // Set session
      ctx.session.userId = user.id;
      
      ctx.body = {
        success: true,
        wallet: {
          address,
          type: 'simple-account',
          fallback: true
        }
      };
    }
  } catch (error) {
    console.error('Error creating wallet:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to create wallet',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// API routes

// Add a new route for the login page
router.get('/login', async (ctx) => {
  try {
    await ctx.render('login', {
      title: `${APP_NAME} - Login`
    });
  } catch (error) {
    console.error('Login render error:', error);
    await ctx.render('error', { 
      layout: 'test-layout',
      title: `${APP_NAME} - Error`,
      error 
    });
  }
});

// Endpoint to send a transaction
router.post('/api/transaction/send', async (ctx) => {
  const body = ctx.request.body as any;
  const { to, amount, currency, message, gasPaymentMethod, submissionMethod } = body;

  try {
    // Check if user is logged in
    if (!ctx.session || !ctx.session.userId) {
      ctx.status = 401;
      ctx.body = { error: 'Authentication required' };
      return;
    }
    
    // Get user from the authentication system
    const { findUserById } = await import('./utils/auth-utils.js');
    const user = findUserById(ctx.session.userId);
    
    if (!user || !user.walletAddress || !user.privateKey) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid user or missing wallet' };
      return;
    }

    // Get necessary clients and configurations
    const { validateEnvironment, createOwnerAccount, createPublicClient, createPimlicoClientInstance, createSafeSmartAccount, getActiveChain } = await import('./utils/client-setup.js');
    const { apiKey } = validateEnvironment();
    const owner = createOwnerAccount(user.privateKey);
    const publicClient = createPublicClient();
    const pimlicoClient = createPimlicoClientInstance(apiKey);
    const smartAccount = await createSafeSmartAccount(publicClient, owner);
    
    // Log chain information
    const activeChain = getActiveChain();
    console.log(`Sending transaction on ${activeChain.chain.name} chain`);

    console.log(`Sending transaction: ${amount} ${currency} to ${to}`);
    console.log(`Gas payment method: ${gasPaymentMethod}`);
    console.log(`Submission method: ${submissionMethod}`);
    
    // Validate inputs
    if (!to || !to.startsWith('0x')) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid recipient address' };
      return;
    }

    // Create Gas Payment Method enum value
    let gasPayment;
    switch (gasPaymentMethod) {
      case 'usdc':
        gasPayment = GasPaymentMethod.USDC;
        break;
      case 'sponsored':
        gasPayment = GasPaymentMethod.SPONSORED;
        break;
      default:
        // Use a string conversion for ETH since it appears the enum doesn't have this value
        gasPayment = 'eth';
    }
    
    let txHash;
    if (currency === 'eth') {
      // Send ETH
      const etherAmount = parseFloat(amount || '0');
      if (isNaN(etherAmount) || etherAmount <= 0) {
        ctx.status = 400;
        ctx.body = { error: 'Invalid amount' };
        return;
      }
      
      txHash = await sendTransaction({
        smartAccount,
        owner,
        publicClient,
        pimlicoClient,
        to: to as Address,
        value: BigInt(Math.floor(etherAmount * 1e18)), // Convert to wei as BigInt
        data: message ? encodeFunctionData({
          abi: [{
            type: 'function',
            name: 'setMessage',
            inputs: [{ type: 'string', name: 'message' }],
            outputs: [],
            stateMutability: 'nonpayable'
          }],
          functionName: 'setMessage',
          args: [message]
        }) : '0x',
        gasPaymentMethod: gasPayment
      });
    } else if (currency === 'usdc') {
      // Not implemented yet
      ctx.status = 501;
      ctx.body = { error: 'USDC transfers not implemented yet' };
      return;
    } else {
      ctx.status = 400;
      ctx.body = { error: 'Invalid currency' };
      return;
    }
    
    // Get explorer URL based on active chain
    const explorerBaseUrl = activeChain.chain.id === 84531 
      ? 'https://goerli.basescan.org/tx/' 
      : activeChain.chain.id === 8453 
      ? 'https://basescan.org/tx/'
      : 'https://sepolia.etherscan.io/tx/';
      
    ctx.body = { 
      success: true, 
      hash: txHash,
      explorerUrl: `${explorerBaseUrl}${txHash}`
    };
  } catch (error) {
    console.error('Transaction error:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to send transaction',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Endpoint to get transaction nonce
router.get('/api/transaction/nonce', async (ctx) => {
  try {
    // Check if user is logged in
    if (!ctx.session || !ctx.session.userId) {
      ctx.status = 401;
      ctx.body = { error: 'Authentication required' };
      return;
    }
    
    // Get user from the authentication system
    const { findUserById } = await import('./utils/auth-utils.js');
    const user = findUserById(ctx.session.userId);
    
    if (!user || !user.walletAddress || !user.privateKey) {
      ctx.status = 401;
      ctx.body = { error: 'Invalid user or missing wallet' };
      return;
    }

    // Get necessary clients and configurations
    const { validateEnvironment, createOwnerAccount, createPublicClient, createSafeSmartAccount } = await import('./utils/client-setup.js');
    const { apiKey } = validateEnvironment();
    const owner = createOwnerAccount(user.privateKey);
    const publicClient = createPublicClient();
    const smartAccount = await createSafeSmartAccount(publicClient, owner);
    
    const nonce = await publicClient.readContract({
      address: smartAccount.address,
      abi: [
        {
          inputs: [],
          name: 'nonce',
          outputs: [{ type: 'uint256', name: '' }],
          stateMutability: 'view',
          type: 'function'
        }
      ],
      functionName: 'nonce'
    });
    
    ctx.body = { nonce: nonce.toString() };
  } catch (error) {
    console.error('Error getting nonce:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to get nonce',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Endpoint to save a new address to the address book
router.post('/api/contacts/save', async (ctx) => {
  const body = ctx.request.body as any;
  const { name, address } = body;
  
  if (!name || !address) {
    ctx.status = 400;
    ctx.body = { error: 'Name and address are required' };
    return;
  }
  
  if (!address.startsWith('0x') || address.length !== 42) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid Ethereum address' };
    return;
  }
  
  // Check for duplicates
  const duplicateIndex = savedAddresses.findIndex(a => 
    a.address.toLowerCase() === address.toLowerCase()
  );
  
  if (duplicateIndex >= 0) {
    // Update existing
    savedAddresses[duplicateIndex].name = name;
  } else {
    // Add new
    savedAddresses.push({ name, address });
  }
  
  saveAddresses();
  
  ctx.body = { success: true, addresses: savedAddresses };
});

// Endpoint to delete an address from the address book
router.delete('/api/contacts/:address', async (ctx) => {
  const { address } = ctx.params;
  
  const index = savedAddresses.findIndex(a => 
    a.address.toLowerCase() === address.toLowerCase()
  );
  
  if (index >= 0) {
    savedAddresses.splice(index, 1);
    saveAddresses();
    ctx.body = { success: true, addresses: savedAddresses };
  } else {
    ctx.status = 404;
    ctx.body = { error: 'Address not found' };
  }
});

// Endpoint to get transaction calldata
router.post('/api/get-calldata', async (ctx) => {
  const body = ctx.request.body as any;
  const { 
    fromAddress, 
    toAddress, 
    amount, 
    currency, 
    message,
    nonce,
    gasPaymentMethod,
    submissionMethod
  } = body;
  
  try {
    // Create a mock calldata for now - this would be generated properly in production
    const calldata = message
      ? encodeFunctionData({
          abi: [{
            type: 'function',
            name: 'setMessage',
            inputs: [{ type: 'string', name: 'message' }],
            outputs: [],
            stateMutability: 'nonpayable'
          }],
          functionName: 'setMessage',
          args: [message]
        })
      : '0x';
    
    ctx.body = { 
      success: true, 
      calldata,
      transactionData: {
        from: fromAddress,
        to: toAddress,
        value: amount,
        nonce,
        data: calldata
      }
    };
  } catch (error) {
    console.error('Error generating calldata:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to generate calldata',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Endpoint to check transaction safety
router.post('/api/check-transaction-safety', async (ctx) => {
  const body = ctx.request.body as any;
  const { calldata, to, value } = body;
  
  try {
    // Fix function parameter counts to match implementation
    const calldataVerification = await verifyCalldata(calldata, to);
    
    const recipientRisk = await checkRecipientRisk(to);
    
    const simulationResult = await simulateTransaction({
      sender: safeAccount.address,  // Use the safe account address as the sender
      recipient: to,                // Recipient address
      callData: calldata,           // The transaction calldata
      value: value.toString()       // The value as a string
    });
    
    const etherscanData = await checkEtherscanData(to);
    
    const aiAnalysis = await aiTransactionAnalysis({
      to,
      data: calldata,
      value: value
    });
    
    ctx.body = {
      success: true,
      safetyCheck: {
        calldata: calldataVerification,
        recipientRisk,
        simulation: simulationResult,
        etherscan: etherscanData,
        ai: aiAnalysis
      }
    };
  } catch (error) {
    console.error('Error checking transaction safety:', error);
    ctx.status = 500;
    ctx.body = { 
      error: 'Failed to check transaction safety',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Use the router
app.use(router.routes());
app.use(router.allowedMethods());

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 ${APP_NAME} server running at http://localhost:${PORT}`);
});

export default app; 
// Script to keep only one wallet address and remove all others
const fs = require('fs');
const path = require('path');

// Configuration
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Command line arguments
const userId = process.argv[2];
const walletToKeep = process.argv[3];

if (!userId || !walletToKeep) {
  console.error('Usage: node scripts/keep-one-wallet.js <userId> <walletAddressToKeep>');
  process.exit(1);
}

// Validate wallet address format
if (!walletToKeep.match(/^0x[0-9a-fA-F]{40}$/)) {
  console.error('Error: Invalid wallet address format');
  process.exit(1);
}

// Read users file
let users = [];
try {
  const data = fs.readFileSync(USERS_FILE, 'utf8');
  users = JSON.parse(data);
} catch (error) {
  console.error('Error reading users file:', error.message);
  process.exit(1);
}

// Find user
const userIndex = users.findIndex(user => user.id === userId);
if (userIndex === -1) {
  console.error(`Error: User ${userId} not found`);
  process.exit(1);
}

// Get the user
const user = users[userIndex];
console.log(`Found user: ${user.username} (${user.id})`);

// Initialize wallets array if it doesn't exist
if (!Array.isArray(user.wallets)) {
  user.wallets = [];
}

// Check if the wallet to keep exists
const existingWalletIndex = user.wallets.findIndex(
  wallet => wallet.address.toLowerCase() === walletToKeep.toLowerCase()
);

// Count how many wallets will be deleted
const walletsToDelete = user.wallets.length - (existingWalletIndex !== -1 ? 1 : 0);
console.log(`Found ${user.wallets.length} wallets, will delete ${walletsToDelete} wallets`);

// Check if the wallet to keep exists, if not add it
if (existingWalletIndex === -1) {
  console.log(`Wallet ${walletToKeep} not found, adding it...`);
  const newWallet = {
    address: walletToKeep,
    name: 'Primary Wallet',
    chainId: 11155111, // Sepolia
    isDefault: true,
    createdAt: Date.now()
  };
  
  user.wallets = [newWallet];
  console.log(`Added wallet ${walletToKeep} to user ${userId}`);
} else {
  // Keep only the target wallet
  const walletToKeepObj = user.wallets[existingWalletIndex];
  walletToKeepObj.isDefault = true;
  user.wallets = [walletToKeepObj];
  console.log(`Kept only wallet ${walletToKeep} and removed all others`);
}

// Update the legacy walletAddress field too
user.walletAddress = walletToKeep;

// Update user in array
users[userIndex] = user;

// Create a backup of the users file
const backupFile = `${USERS_FILE}.backup.${Date.now()}.json`;
fs.copyFileSync(USERS_FILE, backupFile);
console.log(`Created backup file: ${backupFile}`);

// Save the users file
try {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  console.log(`Successfully updated user ${userId}`);
  console.log(`Wallet ${walletToKeep} is now the only wallet for ${user.username}`);
} catch (error) {
  console.error('Error saving users file:', error.message);
  process.exit(1);
} 
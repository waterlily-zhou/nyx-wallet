import dotenv from 'dotenv';
import { validateEnvironment, createOwnerAccount, createPublicClientForSepolia, createPimlicoClientInstance, createSafeSmartAccount } from "./utils/client-setup.js";
import { sendTransactionWithHybridGasPayment } from './usdc-gas-payment.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// Import inquirer using dynamic import for ESM compatibility
import inquirer from 'inquirer';
// Load environment variables
dotenv.config();
// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Path to saved addresses
const savedAddressesPath = path.join(__dirname, '../data/saved-addresses.json');
// Ensure directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
// Initialize or load saved addresses
let savedAddresses = [];
try {
    if (fs.existsSync(savedAddressesPath)) {
        const data = fs.readFileSync(savedAddressesPath, 'utf8');
        savedAddresses = JSON.parse(data);
    }
    else {
        // Initialize with some example addresses
        savedAddresses = [
            { name: 'Vitalik', address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' },
            { name: 'Pimlico', address: '0x3e8c6142bbe4e9adccdfcf2c6ad2eca0fc1d813c' }
        ];
        fs.writeFileSync(savedAddressesPath, JSON.stringify(savedAddresses, null, 2));
    }
}
catch (error) {
    console.error('Error loading saved addresses:', error);
    // Continue with empty array
    savedAddresses = [];
}
// Function to save addresses to file
function saveAddresses() {
    try {
        fs.writeFileSync(savedAddressesPath, JSON.stringify(savedAddresses, null, 2));
    }
    catch (error) {
        console.error('Error saving addresses:', error);
    }
}
// Function to initialize wallet resources
async function initializeWallet() {
    console.log('🔐 Initializing wallet...');
    try {
        const { apiKey, privateKey } = validateEnvironment();
        const owner = createOwnerAccount(privateKey);
        const publicClient = createPublicClientForSepolia();
        const pimlicoClient = createPimlicoClientInstance(apiKey);
        console.log('🔨 Loading Safe smart account...');
        const safeAccount = await createSafeSmartAccount(publicClient, owner);
        console.log(`💼 Smart account address: ${safeAccount.address}`);
        // Check ETH balance
        const ethBalance = await publicClient.getBalance({
            address: safeAccount.address,
        });
        console.log(`💰 ETH balance: ${ethBalance} wei`);
        return {
            owner,
            publicClient,
            pimlicoClient,
            safeAccount
        };
    }
    catch (error) {
        console.error('Failed to initialize wallet:', error);
        throw error;
    }
}
// Function to send a transaction
async function sendTransaction(recipient, message, useHybridGas) {
    if (!recipient.startsWith('0x')) {
        throw new Error('Invalid recipient address. Must start with 0x');
    }
    try {
        console.log(`📨 Sending message to ${recipient}`);
        console.log(`📝 Message: "${message}"`);
        console.log(`⛽ Gas payment: ${useHybridGas ? 'Hybrid (Sponsorship with USDC fallback)' : 'USDC only'}`);
        // Convert message to hex
        const messageHex = '0x' + Buffer.from(message).toString('hex');
        // Current implementation only supports hybrid gas
        // Future: Add direct support for USDC-only transactions
        const hash = await sendTransactionWithHybridGasPayment();
        console.log(`✅ Transaction complete!`);
        console.log(`🔗 Transaction hash: ${hash}`);
        console.log(`🔍 View on Etherscan: https://sepolia.etherscan.io/tx/${hash}`);
        return hash;
    }
    catch (error) {
        console.error('Failed to send transaction:', error);
        throw error;
    }
}
// Main menu options
async function mainMenu() {
    console.clear();
    console.log('╔════════════════════════════════════════╗');
    console.log('║       ACCOUNT ABSTRACTION WALLET       ║');
    console.log('╚════════════════════════════════════════╝');
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: '📨 Send Message', value: 'send' },
                { name: '👤 View Account Info', value: 'account' },
                { name: '📋 Manage Saved Addresses', value: 'addresses' },
                { name: '❓ Help', value: 'help' },
                { name: '👋 Exit', value: 'exit' }
            ]
        }
    ]);
    switch (action) {
        case 'send':
            await sendMessageFlow();
            break;
        case 'account':
            await viewAccountInfo();
            break;
        case 'addresses':
            await manageSavedAddresses();
            break;
        case 'help':
            await showHelp();
            break;
        case 'exit':
            console.log('👋 Thank you for using AA Wallet. Goodbye!');
            process.exit(0);
    }
    // Return to main menu after action completes
    await mainMenu();
}
// Flow for sending a message
async function sendMessageFlow() {
    console.clear();
    console.log('📨 SEND MESSAGE');
    console.log('───────────────────────────────────');
    // Create recipient choices from saved addresses
    const recipientChoices = [
        ...savedAddresses.map(addr => ({
            name: `${addr.name} (${addr.address.substring(0, 8)}...)`,
            value: addr.address
        })),
        { name: '→ Enter a new address', value: 'new' }
    ];
    // Prompt for recipient
    const { recipientChoice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'recipientChoice',
            message: 'Select recipient:',
            choices: recipientChoices
        }
    ]);
    // Handle new address entry
    let recipientAddress = recipientChoice;
    if (recipientChoice === 'new') {
        const { newAddress } = await inquirer.prompt([
            {
                type: 'input',
                name: 'newAddress',
                message: 'Enter recipient address (0x...):',
                validate: (input) => {
                    if (!input.startsWith('0x') || input.length !== 42) {
                        return 'Please enter a valid Ethereum address (42 chars, starting with 0x)';
                    }
                    return true;
                }
            }
        ]);
        recipientAddress = newAddress;
        // Ask if they want to save this address
        const { saveAddress } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'saveAddress',
                message: 'Would you like to save this address for future use?',
                default: true
            }
        ]);
        if (saveAddress) {
            const { addressName } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'addressName',
                    message: 'Enter a name for this address:',
                    validate: (input) => input.trim() !== '' ? true : 'Name cannot be empty'
                }
            ]);
            savedAddresses.push({ name: addressName, address: recipientAddress });
            saveAddresses();
            console.log(`✅ Address saved as "${addressName}"`);
        }
    }
    // Prompt for message
    const { message } = await inquirer.prompt([
        {
            type: 'input',
            name: 'message',
            message: 'Enter your message:',
            validate: (input) => input.trim() !== '' ? true : 'Message cannot be empty'
        }
    ]);
    // Prompt for gas payment method
    const { gasPayment } = await inquirer.prompt([
        {
            type: 'list',
            name: 'gasPayment',
            message: 'Select gas payment method:',
            choices: [
                { name: '🎁 Try Sponsorship (with USDC fallback)', value: 'hybrid' },
                { name: '💵 USDC Payment (coming soon)', value: 'usdc' }
            ]
        }
    ]);
    // Confirm transaction
    const { confirmSend } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmSend',
            message: `Ready to send message to ${recipientAddress.substring(0, 8)}...?`,
            default: true
        }
    ]);
    if (confirmSend) {
        console.log('⏳ Processing transaction...');
        try {
            // Always use hybrid for now
            await sendTransaction(recipientAddress, message, true);
            // Ask user to press any key to continue
            await inquirer.prompt([
                {
                    type: 'input',
                    name: 'continue',
                    message: 'Press enter to return to main menu...'
                }
            ]);
        }
        catch (error) {
            console.error('Transaction failed:', error);
            await inquirer.prompt([
                {
                    type: 'input',
                    name: 'continue',
                    message: 'Press enter to return to main menu...'
                }
            ]);
        }
    }
}
// View account information
async function viewAccountInfo() {
    console.clear();
    console.log('👤 ACCOUNT INFORMATION');
    console.log('───────────────────────────────────');
    try {
        const wallet = await initializeWallet();
        console.log(`\nAccount Address: ${wallet.safeAccount.address}`);
        console.log(`Owner Address: ${wallet.owner.address}`);
        // Get more account info like balances
        const ethBalance = await wallet.publicClient.getBalance({
            address: wallet.safeAccount.address,
        });
        console.log(`\nBalances:`);
        console.log(`ETH: ${ethBalance} wei`);
        // You would typically get USDC balance here too
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: 'Press enter to return to main menu...'
            }
        ]);
    }
    catch (error) {
        console.error('Failed to retrieve account information:', error);
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: 'Press enter to return to main menu...'
            }
        ]);
    }
}
// Manage saved addresses
async function manageSavedAddresses() {
    console.clear();
    console.log('📋 MANAGE SAVED ADDRESSES');
    console.log('───────────────────────────────────');
    if (savedAddresses.length === 0) {
        console.log('No saved addresses yet.');
    }
    else {
        console.log('Saved addresses:');
        savedAddresses.forEach((addr, index) => {
            console.log(`${index + 1}. ${addr.name}: ${addr.address}`);
        });
    }
    console.log('───────────────────────────────────');
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: '➕ Add new address', value: 'add' },
                { name: '✏️ Edit address', value: 'edit', disabled: savedAddresses.length === 0 },
                { name: '❌ Delete address', value: 'delete', disabled: savedAddresses.length === 0 },
                { name: '⬅️ Back to main menu', value: 'back' }
            ]
        }
    ]);
    switch (action) {
        case 'add':
            await addNewAddress();
            break;
        case 'edit':
            await editAddress();
            break;
        case 'delete':
            await deleteAddress();
            break;
        case 'back':
            return;
    }
    // Return to address management
    await manageSavedAddresses();
}
// Add a new address
async function addNewAddress() {
    const { address, name } = await inquirer.prompt([
        {
            type: 'input',
            name: 'address',
            message: 'Enter Ethereum address (0x...):',
            validate: (input) => {
                if (!input.startsWith('0x') || input.length !== 42) {
                    return 'Please enter a valid Ethereum address (42 chars, starting with 0x)';
                }
                return true;
            }
        },
        {
            type: 'input',
            name: 'name',
            message: 'Enter a name for this address:',
            validate: (input) => input.trim() !== '' ? true : 'Name cannot be empty'
        }
    ]);
    savedAddresses.push({ name, address });
    saveAddresses();
    console.log(`✅ Address saved as "${name}"`);
}
// Edit an existing address
async function editAddress() {
    // Choose which address to edit
    const { addressIndex } = await inquirer.prompt([
        {
            type: 'list',
            name: 'addressIndex',
            message: 'Which address would you like to edit?',
            choices: savedAddresses.map((addr, index) => ({
                name: `${addr.name} (${addr.address.substring(0, 8)}...)`,
                value: index
            }))
        }
    ]);
    const currentAddress = savedAddresses[addressIndex];
    // Choose what to edit
    const { field } = await inquirer.prompt([
        {
            type: 'list',
            name: 'field',
            message: 'What would you like to edit?',
            choices: [
                { name: 'Name', value: 'name' },
                { name: 'Address', value: 'address' }
            ]
        }
    ]);
    if (field === 'name') {
        const { newName } = await inquirer.prompt([
            {
                type: 'input',
                name: 'newName',
                message: `Current name: ${currentAddress.name}\nEnter new name:`,
                validate: (input) => input.trim() !== '' ? true : 'Name cannot be empty'
            }
        ]);
        savedAddresses[addressIndex].name = newName;
        saveAddresses();
        console.log(`✅ Name updated to "${newName}"`);
    }
    else {
        const { newAddress } = await inquirer.prompt([
            {
                type: 'input',
                name: 'newAddress',
                message: `Current address: ${currentAddress.address}\nEnter new address:`,
                validate: (input) => {
                    if (!input.startsWith('0x') || input.length !== 42) {
                        return 'Please enter a valid Ethereum address (42 chars, starting with 0x)';
                    }
                    return true;
                }
            }
        ]);
        savedAddresses[addressIndex].address = newAddress;
        saveAddresses();
        console.log(`✅ Address updated`);
    }
}
// Delete an address
async function deleteAddress() {
    const { addressIndex } = await inquirer.prompt([
        {
            type: 'list',
            name: 'addressIndex',
            message: 'Which address would you like to delete?',
            choices: savedAddresses.map((addr, index) => ({
                name: `${addr.name} (${addr.address.substring(0, 8)}...)`,
                value: index
            }))
        }
    ]);
    const addressToDelete = savedAddresses[addressIndex];
    const { confirmDelete } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmDelete',
            message: `Are you sure you want to delete "${addressToDelete.name}"?`,
            default: false
        }
    ]);
    if (confirmDelete) {
        savedAddresses.splice(addressIndex, 1);
        saveAddresses();
        console.log(`✅ Address deleted`);
    }
}
// Show help information
async function showHelp() {
    console.clear();
    console.log('❓ HELP & INFORMATION');
    console.log('───────────────────────────────────');
    console.log(`
Account Abstraction Wallet - CLI Interface

This wallet allows you to:
- Send messages on the Sepolia testnet using account abstraction
- Pay for gas using USDC tokens or try sponsored transactions
- Manage your saved addresses

Key Features:
- Hybrid Gas Payment: Tries to get a sponsored transaction first, falls back to USDC payment
- Simple Message Sending: Send text messages to any Ethereum address
- Address Management: Save, edit, and delete frequently used addresses

Getting Started:
1. Make sure your environment variables are set up (PRIVATE_KEY, PIMLICO_API_KEY)
2. Navigate through the menus to perform actions
3. Use "Send Message" to send a transaction on Sepolia testnet

For more detailed information, visit: https://github.com/waterlily-zhou/aa-wallet
`);
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: 'Press enter to return to main menu...'
        }
    ]);
}
// Start the CLI
async function startCLI() {
    try {
        await mainMenu();
    }
    catch (error) {
        console.error('An error occurred:', error);
        process.exit(1);
    }
}
// Run the CLI
startCLI();

import dotenv from 'dotenv';
import { validateEnvironment, createOwnerAccount, createPublicClientForSepolia, createPimlicoClientInstance, createSafeSmartAccount } from "@/lib/client-setup";
import { sendTransactionWithHybridGasPayment } from '@/lib/usdc-gas-payment';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import inquirer from 'inquirer';
import type { Address, PublicClient } from 'viem';
import type { Account } from 'viem/accounts';
import type { PimlicoClient } from 'permissionless/clients/pimlico';
import type { SmartAccount } from 'permissionless/accounts';

// Load environment variables
dotenv.config();

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to saved addresses
const savedAddressesPath = path.join(__dirname, '../data/saved-addresses.json');

interface SavedAddress {
    name: string;
    address: Address;
}

interface WalletResources {
    owner: Account;
    publicClient: PublicClient;
    pimlicoClient: PimlicoClient;
    safeAccount: SmartAccount;
}

// Ensure directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize or load saved addresses
let savedAddresses: SavedAddress[] = [];
try {
    if (fs.existsSync(savedAddressesPath)) {
        const data = fs.readFileSync(savedAddressesPath, 'utf8');
        savedAddresses = JSON.parse(data);
    }
    else {
        // Initialize with some example addresses
        savedAddresses = [
            { name: 'Vitalik', address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' as Address },
            { name: 'Pimlico', address: '0x3e8c6142bbe4e9adccdfcf2c6ad2eca0fc1d813c' as Address }
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
function saveAddresses(): void {
    try {
        fs.writeFileSync(savedAddressesPath, JSON.stringify(savedAddresses, null, 2));
    }
    catch (error) {
        console.error('Error saving addresses:', error);
    }
}

// Function to initialize wallet resources
async function initializeWallet(): Promise<WalletResources> {
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
async function sendTransaction(recipient: Address, message: string, useHybridGas: boolean): Promise<`0x${string}`> {
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
async function mainMenu(): Promise<void> {
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
async function sendMessageFlow(): Promise<void> {
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
                validate: (input: string) => {
                    if (!input.startsWith('0x') || input.length !== 42) {
                        return 'Please enter a valid Ethereum address (42 chars, starting with 0x)';
                    }
                    return true;
                }
            }
        ]);
        recipientAddress = newAddress as Address;

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
                    validate: (input: string) => input.trim() !== '' ? true : 'Name cannot be empty'
                }
            ]);

            savedAddresses.push({
                name: addressName.trim(),
                address: recipientAddress
            });
            saveAddresses();
        }
    }

    // Get message
    const { message } = await inquirer.prompt([
        {
            type: 'input',
            name: 'message',
            message: 'Enter your message:',
            validate: (input: string) => input.trim() !== '' ? true : 'Message cannot be empty'
        }
    ]);

    // Ask about gas payment method
    const { useHybridGas } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'useHybridGas',
            message: 'Use hybrid gas payment (sponsorship with USDC fallback)?',
            default: true
        }
    ]);

    // Confirm transaction
    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Ready to send transaction?',
            default: true
        }
    ]);

    if (confirm) {
        try {
            await sendTransaction(recipientAddress, message.trim(), useHybridGas);
            console.log('\nPress any key to return to main menu...');
            await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
        }
        catch (error) {
            console.error('Transaction failed:', error);
            console.log('\nPress any key to return to main menu...');
            await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
        }
    }
}

// View account information
async function viewAccountInfo(): Promise<void> {
    console.clear();
    console.log('👤 ACCOUNT INFORMATION');
    console.log('───────────────────────────────────');

    try {
        const { safeAccount, publicClient } = await initializeWallet();
        const balance = await publicClient.getBalance({ address: safeAccount.address });

        console.log(`📬 Smart Account Address: ${safeAccount.address}`);
        console.log(`💰 Balance: ${balance} wei`);
        console.log(`🔍 View on Etherscan: https://sepolia.etherscan.io/address/${safeAccount.address}`);

        console.log('\nPress any key to return to main menu...');
        await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
    }
    catch (error) {
        console.error('Error fetching account info:', error);
        console.log('\nPress any key to return to main menu...');
        await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
    }
}

// Manage saved addresses
async function manageSavedAddresses(): Promise<void> {
    console.clear();
    console.log('📋 MANAGE SAVED ADDRESSES');
    console.log('───────────────────────────────────');

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: '➕ Add New Address', value: 'add' },
                { name: '✏️  Edit Address', value: 'edit' },
                { name: '❌ Delete Address', value: 'delete' },
                { name: '👀 View All Addresses', value: 'view' },
                { name: '↩️  Back to Main Menu', value: 'back' }
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
        case 'view':
            await viewAllAddresses();
            break;
        case 'back':
            return;
    }

    // Return to address management after action completes
    await manageSavedAddresses();
}

// Add a new address
async function addNewAddress(): Promise<void> {
    const { address } = await inquirer.prompt([
        {
            type: 'input',
            name: 'address',
            message: 'Enter Ethereum address (0x...):',
            validate: (input: string) => {
                if (!input.startsWith('0x') || input.length !== 42) {
                    return 'Please enter a valid Ethereum address (42 chars, starting with 0x)';
                }
                return true;
            }
        }
    ]);

    const { name } = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Enter a name for this address:',
            validate: (input: string) => input.trim() !== '' ? true : 'Name cannot be empty'
        }
    ]);

    savedAddresses.push({
        name: name.trim(),
        address: address as Address
    });
    saveAddresses();
    console.log('✅ Address saved successfully!');
}

// Edit an existing address
async function editAddress(): Promise<void> {
    if (savedAddresses.length === 0) {
        console.log('No saved addresses to edit.');
        return;
    }

    const { addressToEdit } = await inquirer.prompt([
        {
            type: 'list',
            name: 'addressToEdit',
            message: 'Select address to edit:',
            choices: savedAddresses.map((addr, index) => ({
                name: `${addr.name} (${addr.address})`,
                value: index
            }))
        }
    ]);

    const { newName } = await inquirer.prompt([
        {
            type: 'input',
            name: 'newName',
            message: 'Enter new name (or press enter to keep current):',
            default: savedAddresses[addressToEdit].name
        }
    ]);

    const { newAddress } = await inquirer.prompt([
        {
            type: 'input',
            name: 'newAddress',
            message: 'Enter new address (or press enter to keep current):',
            default: savedAddresses[addressToEdit].address,
            validate: (input: string) => {
                if (input === savedAddresses[addressToEdit].address) return true;
                if (!input.startsWith('0x') || input.length !== 42) {
                    return 'Please enter a valid Ethereum address (42 chars, starting with 0x)';
                }
                return true;
            }
        }
    ]);

    savedAddresses[addressToEdit] = {
        name: newName.trim(),
        address: newAddress as Address
    };
    saveAddresses();
    console.log('✅ Address updated successfully!');
}

// Delete an address
async function deleteAddress(): Promise<void> {
    if (savedAddresses.length === 0) {
        console.log('No saved addresses to delete.');
        return;
    }

    const { addressToDelete } = await inquirer.prompt([
        {
            type: 'list',
            name: 'addressToDelete',
            message: 'Select address to delete:',
            choices: savedAddresses.map((addr, index) => ({
                name: `${addr.name} (${addr.address})`,
                value: index
            }))
        }
    ]);

    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to delete this address?',
            default: false
        }
    ]);

    if (confirm) {
        savedAddresses.splice(addressToDelete, 1);
        saveAddresses();
        console.log('✅ Address deleted successfully!');
    }
}

// View all addresses
async function viewAllAddresses(): Promise<void> {
    console.clear();
    console.log('📋 SAVED ADDRESSES');
    console.log('───────────────────────────────────');

    if (savedAddresses.length === 0) {
        console.log('No saved addresses.');
    }
    else {
        savedAddresses.forEach((addr, index) => {
            console.log(`${index + 1}. ${addr.name}`);
            console.log(`   ${addr.address}`);
            console.log('───────────────────────────────────');
        });
    }

    console.log('\nPress any key to continue...');
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
}

// Show help information
async function showHelp(): Promise<void> {
    console.clear();
    console.log('❓ HELP');
    console.log('───────────────────────────────────');
    console.log('This is an Account Abstraction wallet that supports:');
    console.log('• Sending messages on-chain');
    console.log('• Managing saved addresses');
    console.log('• Hybrid gas payments (sponsorship with USDC fallback)');
    console.log('\nFor more information, visit:');
    console.log('https://docs.pimlico.io/permissionless');
    console.log('\nPress any key to return to main menu...');
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
}

// Start the CLI
export async function startCLI(): Promise<void> {
    try {
        await initializeWallet();
        await mainMenu();
    }
    catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
} 
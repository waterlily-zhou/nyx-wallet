/**
 * Script to migrate data from file-based storage to Supabase
 * 
 * Usage:
 * node scripts/migrate-to-supabase.js
 * 
 * Prerequisites:
 * - Supabase project is set up with the correct schema
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set as environment variables
 */

// This script will be fully implemented once we have the Supabase package installed
// and the database schema created. For now, this is a placeholder.

const fs = require('fs');
const path = require('path');

// Paths to our data files
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUTHENTICATORS_FILE = path.join(DATA_DIR, 'authenticators.json');

async function migrateToSupabase() {
  console.log('Starting migration to Supabase...');
  
  try {
    // Step 1: Load data from files
    console.log('Loading data from files...');
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const authenticators = JSON.parse(fs.readFileSync(AUTHENTICATORS_FILE, 'utf8'));
    
    console.log(`Loaded ${users.length} users and ${authenticators.length} authenticators`);
    
    // Step A: Check if the Supabase package is installed
    try {
      // This will throw an error if @supabase/supabase-js is not installed
      require('@supabase/supabase-js');
      console.log('Supabase package is installed');
    } catch (error) {
      console.error('Supabase package is not installed. Please run:');
      console.error('npm install @supabase/supabase-js --legacy-peer-deps');
      process.exit(1);
    }
    
    // Step B: Check if environment variables are set
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase environment variables are not set. Please set:');
      console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }
    
    console.log('Environment variables are set');
    
    // Step 2: Initialize Supabase
    console.log('Initializing Supabase client...');
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Step 3: Migrate users
    console.log('Migrating users...');
    let successCount = 0;
    let errorCount = 0;
    
    // Create a backup of the migration status
    const backupDir = path.join(process.cwd(), 'migration_backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    // Step 4: Migrate users to Supabase
    for (const user of users) {
      try {
        // Transform user data to match Supabase schema
        const transformedUser = {
          id: user.id,
          username: user.username,
          created_at: new Date(user.createdAt || Date.now()).toISOString(),
          biometric_key_hash: user.biometricKeyHash || null,
          active_wallet_id: user.wallets && user.wallets.length > 0 && user.wallets.find(w => w.isDefault)
            ? user.wallets.find(w => w.isDefault).address
            : user.wallets && user.wallets.length > 0
              ? user.wallets[0].address
              : null
        };
        
        // Insert user into Supabase
        const { data, error } = await supabase
          .from('users')
          .insert(transformedUser);
        
        if (error) {
          console.error(`Error migrating user ${user.id}:`, error);
          errorCount++;
        } else {
          successCount++;
          
          // Step 5: Migrate wallets for this user
          if (user.wallets && user.wallets.length > 0) {
            for (const wallet of user.wallets) {
              const transformedWallet = {
                id: wallet.id || `${user.id}_${wallet.address}`,
                address: wallet.address,
                name: wallet.name || 'Wallet',
                chain_id: wallet.chainId || 11155111,
                user_id: user.id,
                is_default: wallet.isDefault || false,
                created_at: new Date(wallet.createdAt || Date.now()).toISOString(),
                salt_nonce: wallet.saltNonce || null
              };
              
              const { error: walletError } = await supabase
                .from('wallets')
                .insert(transformedWallet);
              
              if (walletError) {
                console.error(`Error migrating wallet ${wallet.address}:`, walletError);
              } else {
                console.log(`Migrated wallet ${wallet.address} for user ${user.id}`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
        errorCount++;
      }
    }
    
    // Step 6: Migrate authenticators
    console.log('Migrating authenticators...');
    let authSuccessCount = 0;
    let authErrorCount = 0;
    
    for (const auth of authenticators) {
      try {
        // Transform authenticator data to match Supabase schema
        const transformedAuth = {
          id: auth.id,
          credential_id: auth.credentialID,
          credential_public_key: auth.credentialPublicKey,
          counter: auth.counter || 0,
          user_id: auth.userId || null, // This may need to be derived from other data
          device_name: auth.deviceName || 'Default Device',
          created_at: new Date(auth.createdAt || Date.now()).toISOString(),
          last_used: auth.lastUsed ? new Date(auth.lastUsed).toISOString() : null
        };
        
        // Insert authenticator into Supabase
        const { error: authError } = await supabase
          .from('authenticators')
          .insert(transformedAuth);
        
        if (authError) {
          console.error(`Error migrating authenticator ${auth.id}:`, authError);
          authErrorCount++;
        } else {
          authSuccessCount++;
        }
      } catch (error) {
        console.error(`Error processing authenticator ${auth.id}:`, error);
        authErrorCount++;
      }
    }
    
    // Step 7: Create a backup of the data
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    fs.copyFileSync(USERS_FILE, path.join(backupDir, `users_${timestamp}.json`));
    fs.copyFileSync(AUTHENTICATORS_FILE, path.join(backupDir, `authenticators_${timestamp}.json`));
    
    console.log('Migration completed:');
    console.log(`- Users: ${successCount} succeeded, ${errorCount} failed`);
    console.log(`- Authenticators: ${authSuccessCount} succeeded, ${authErrorCount} failed`);
    console.log(`- Backup created in ${backupDir}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Only run if executed directly (not imported)
if (require.main === module) {
  migrateToSupabase().catch(console.error);
}

module.exports = { migrateToSupabase }; 
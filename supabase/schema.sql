-- Supabase schema for Nyx Wallet
-- This schema creates the necessary tables for the application with proper relationships

-- Enable RLS
ALTER DATABASE postgres SET "app.settings.enable_rls" TO 'on';

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  auth_type TEXT DEFAULT 'biometric',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  active_wallet_id TEXT,
  server_key_encrypted TEXT, -- For the split key approach if needed
  recovery_key_hash TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

-- Create wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  user_id TEXT REFERENCES users(id) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  salt_nonce TEXT
);

-- Create authenticators table
CREATE TABLE IF NOT EXISTS authenticators (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,
  credential_public_key BYTEA NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  user_id TEXT REFERENCES users(id) NOT NULL,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_authenticator_user_id ON authenticators(user_id);
CREATE INDEX IF NOT EXISTS idx_authenticator_credential_id ON authenticators(credential_id);
CREATE INDEX IF NOT EXISTS idx_wallet_address ON wallets(address);

-- Update active wallet ID when a default wallet is added or changed
CREATE OR REPLACE FUNCTION update_active_wallet()
RETURNS TRIGGER AS $$
BEGIN
  -- If wallet is set as default, update the user's active_wallet_id
  IF NEW.is_default = TRUE THEN
    -- Set all other wallets for this user to non-default
    UPDATE wallets 
    SET is_default = FALSE 
    WHERE user_id = NEW.user_id AND id != NEW.id;
    
    -- Update the user's active_wallet_id
    UPDATE users 
    SET active_wallet_id = NEW.id 
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update active wallet when a wallet's is_default is changed
CREATE TRIGGER wallet_default_changed
AFTER INSERT OR UPDATE OF is_default ON wallets
FOR EACH ROW
WHEN (NEW.is_default = TRUE)
EXECUTE FUNCTION update_active_wallet();

-- Function to ensure at least one wallet is set as default
CREATE OR REPLACE FUNCTION ensure_default_wallet()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if there's no default wallet for this user
  IF NOT EXISTS (
    SELECT 1 FROM wallets 
    WHERE user_id = NEW.user_id AND is_default = TRUE
  ) THEN
    -- Set the new wallet as default
    UPDATE wallets SET is_default = TRUE WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to ensure at least one wallet is default after insert
CREATE TRIGGER ensure_default_wallet_insert
AFTER INSERT ON wallets
FOR EACH ROW
EXECUTE FUNCTION ensure_default_wallet();

-- Row-Level Security Policies
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE authenticators ENABLE ROW LEVEL SECURITY;

-- Policies for wallets table
CREATE POLICY wallet_user_access ON wallets
FOR ALL
USING (user_id = auth.uid());

-- Policies for authenticators table
CREATE POLICY authenticator_user_access ON authenticators
FOR ALL
USING (user_id = auth.uid());

-- Policies for users table
CREATE POLICY user_self_access ON users
FOR ALL
USING (id = auth.uid());

-- Custom function to find user by credential ID
CREATE OR REPLACE FUNCTION find_user_by_credential_id(cred_id TEXT)
RETURNS TABLE (
  user_id TEXT,
  username TEXT,
  auth_type TEXT,
  active_wallet_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.auth_type, u.active_wallet_id
  FROM users u
  JOIN authenticators a ON u.id = a.user_id
  WHERE a.credential_id = cred_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 
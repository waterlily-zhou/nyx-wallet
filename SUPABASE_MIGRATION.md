# Nyx Wallet Supabase Migration Guide

This document provides instructions for migrating Nyx Wallet from the file-based storage system to Supabase.

## Overview

We're moving our storage from JSON files to Supabase (PostgreSQL) to improve:
- Security of user data and credentials
- Reliability of the authentication system
- Persistence of biometric credentials across browser sessions
- Proper WebAuthn implementation without relying on cookies

## Prerequisites

1. Create a Supabase account at [supabase.com](https://supabase.com/)
2. Create a new Supabase project
3. Get your Supabase URL and service key from the project settings

## Step 1: Set Up Supabase Schema

1. Go to your Supabase project's SQL Editor
2. Copy the contents of `supabase/schema.sql` from this repository
3. Run the SQL to create all required tables and triggers

## Step 2: Set Environment Variables

Add these environment variables to your project:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

## Step 3: Install Supabase Client

```bash
npm install @supabase/supabase-js --legacy-peer-deps
```

## Step 4: Run Migration Script

```bash
# Run the migration script
node scripts/migrate-to-supabase.js
```

## Step 5: Update Client Configuration

Once the migration is complete:

1. Open `/src/lib/supabase/client.ts`
2. Uncomment the real Supabase client code at the bottom
3. Comment out or remove the file-based implementation

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);
```

## Step 6: Test the Application

1. Start your application
2. Verify that authentication works with your biometric credentials
3. Check that wallets are correctly displayed

## Rollback Plan

If issues occur, you can rollback to the file-based system:

1. Revert changes to `client.ts`
2. Your original data is preserved in `data/` directory
3. Migration backups can be found in `migration_backup/`

## Implementation Strategy

This migration follows a phased approach:

1. **Phase 1: Parallel Storage**
   - Implement changes in both file system and Supabase
   - Fall back to file system when Supabase fails

2. **Phase 2: Supabase Primary**
   - Use Supabase as the primary data source
   - Keep file system as backup

3. **Phase 3: Full Migration**
   - Remove file-based implementation
   - Use Supabase exclusively

## File Changes

- `/src/lib/supabase/client.ts` - Supabase client
- `/src/lib/supabase/user-store-bridge.ts` - Bridge implementation
- `/scripts/migrate-to-supabase.js` - Migration script
- `/supabase/schema.sql` - Database schema 
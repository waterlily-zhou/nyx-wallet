# WebAuthn Implementation Improvements

This document outlines the improvements to our WebAuthn implementation to ensure secure, reliable authentication that doesn't depend on cookies.

## Current Issues

1. **Cookie Dependence**: The current implementation relies on cookies to store mapping between credentials and users
2. **Session State Coupling**: Authentication state is tightly coupled with browser session state
3. **Credential Persistence**: Credentials aren't properly persisted across browser sessions
4. **Missing Credential Discovery**: The app doesn't properly discover existing credentials on the device

## Architecture Improvements

### 1. Proper Credential Storage

| Storage Location | Data Stored |
|------------------|-------------|
| **Secure Enclave** | Biometric private keys (via WebAuthn) |
| **Database** | User accounts, wallet addresses, credential mappings |
| **Cookies** | Only minimal session data (JWT token) |

### 2. WebAuthn Flow Improvements

#### Registration Flow
1. Generate registration options on server
2. Register credential through WebAuthn API
3. Store credential ID and public key in database with user reference
4. Generate a JWT token for session management

#### Authentication Flow
1. **Discover credentials** on device without requiring cookies
2. Use discovered credential to identify the user
3. Verify the credential against the database
4. Issue a JWT token for session management

### 3. Credential Discovery

```javascript
// Client side discovery without cookies
const discoverExistingCredentials = async () => {
  // Get minimal options from server
  const { options } = await fetch('/api/auth/webauthn/discover').then(r => r.json());
  
  // Use conditional UI and device credential store
  const credential = await navigator.credentials.get({
    publicKey: options.publicKey,
    mediation: 'optional' // Show credential chooser UI
  });
  
  if (credential) {
    // Send to server to identify the user
    return await fetch('/api/auth/webauthn/identify', {
      method: 'POST',
      body: JSON.stringify({ credential })
    }).then(r => r.json());
  }
  
  return null;
};
```

## Implementation Changes

### New Server Endpoints

- `/api/auth/webauthn/discover` - Get options for credential discovery
- `/api/auth/webauthn/identify` - Identify user from a discovered credential
- `/api/auth/webauthn/authenticate` - Get authentication options
- `/api/auth/webauthn/verify` - Verify an authentication assertion

### New Client Code

- `useAdvancedWebAuthn.ts` - Hook for improved WebAuthn operations
- `CredentialDiscovery.tsx` - Component to discover and display credentials

### Database Changes

The Supabase migration includes tables designed specifically for proper WebAuthn credential storage:

```sql
CREATE TABLE authenticators (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,
  credential_public_key BYTEA NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  user_id TEXT REFERENCES users(id) NOT NULL,
  wallet_address TEXT,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_authenticator_credential_id ON authenticators(credential_id);
```

## Testing the Improved Implementation

1. Register a credential
2. Clear browser cookies
3. Reload the page
4. The application should still recognize your device credential
5. You should be able to authenticate without re-registering

## Security Benefits

- **Phishing Resistance**: WebAuthn is designed to be phishing-resistant
- **Cookie Independence**: Authentication doesn't rely on cookies being present
- **Biometric Hardware Security**: Private keys are stored in secure hardware
- **Multiple Device Support**: Users can register multiple devices securely

## References

- [Web Authentication API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)
- [SimpleWebAuthn Documentation](https://simplewebauthn.dev/docs/packages/browser)
- [FIDO2 Specification](https://fidoalliance.org/specifications/) 
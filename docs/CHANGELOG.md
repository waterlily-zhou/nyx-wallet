# Changelog

## [Unreleased]

### Added
- Real Smart Contract Account support using permissionless.js v0.2.36
- Direct Safe implementation as fallback for maximum reliability
- Support for gas abstraction via Pimlico paymaster
- Utilities for clearing Next.js cache to resolve build errors
- Documentation for Smart Contract Account implementation
- Automatic key generation for users without existing biometric or server keys

### Fixed
- Fixed permissionless.js integration to create real counterfactual addresses
- Fixed Smart Account Client creation with proper transport parameters
- Simplified fallback mechanism to improve reliability
- Addressed webpack caching issues in Next.js development
- Fixed "User does not have a biometric key" error during wallet creation

### Changed
- Replaced mock SCA implementation with real Smart Contract Accounts 
- Updated user-store.ts to use the improved permissionless.js v2 implementation
- Added direct JavaScript implementation for better compatibility
- Improved error handling and logging during SCA creation 
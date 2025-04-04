#!/bin/bash

# Script to clear Next.js cache to resolve build errors
echo "Clearing Next.js cache..."

# Remove the .next directory
rm -rf .next

# Remove node_modules/.cache directory
rm -rf node_modules/.cache

# If needed, can also clear node modules and reinstall
# Uncomment these lines to fully reset dependencies
# echo "Removing node_modules..."
# rm -rf node_modules
# echo "Reinstalling dependencies..."
# npm install

echo "Cache cleared. You can now rebuild the app with 'npm run dev'" 
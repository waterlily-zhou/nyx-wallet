#!/usr/bin/env node

// This script runs the permissionless.js test directly with ts-node
// to bypass any Next.js issues

const { execSync } = require('child_process');
const path = require('path');

try {
  console.log('Running permissionless.js direct test...');
  console.log('====================================');
  
  // Execute the TypeScript file with ts-node
  execSync('npx ts-node -T src/scripts/test-permissionless.ts', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '--no-warnings'
    }
  });
  
  console.log('====================================');
  console.log('Test completed');
} catch (error) {
  console.error('Error running test:', error.message);
  process.exit(1);
} 
#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Building mobile version of Bux Spades...');

// Check if we're in the right directory
if (!fs.existsSync('package.json')) {
  console.error('❌ Please run this script from the client directory');
  process.exit(1);
}

try {
  // Install dependencies if needed
  console.log('📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });

  // Build for mobile using the mobile config
  console.log('🔨 Building mobile app...');
  execSync('npx vite build --config vite.mobile.config.ts', { stdio: 'inherit' });

  // Copy mobile-specific files
  console.log('📱 Copying mobile assets...');
  if (fs.existsSync('dist')) {
    // Copy mobile CSS
    if (fs.existsSync('src/mobile.css')) {
      fs.copyFileSync('src/mobile.css', 'dist/mobile.css');
    }
    
    // Update index.html for mobile
    const indexPath = 'dist/index.html';
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf8');
      
      // Add mobile-specific meta tags
      const mobileMetaTags = `
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="mobile-web-app-capable" content="yes">
    <link rel="stylesheet" href="/mobile.css">
`;
      
      html = html.replace('</head>', `${mobileMetaTags}\n  </head>`);
      fs.writeFileSync(indexPath, html);
    }
  }

  console.log('✅ Mobile build completed successfully!');
  console.log('📱 You can now deploy the contents of the dist/ folder to your mobile hosting platform');
  console.log('🌐 The web version remains unchanged and fully functional');

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
} 
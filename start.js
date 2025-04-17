const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
// Load .env file
require('dotenv').config();

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Create an empty index.html to allow server to start immediately
const indexPath = path.join(distDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  fs.writeFileSync(indexPath, '<!DOCTYPE html><html><head><title>Building...</title></head><body><h1>Building the app...</h1></body></html>');
}

try {
  // Start the server in the background
  const server = require('./server/index');
  
  console.log('Building Vue application with Vite...');
  
  // Build the Vue app
  execSync('npx vite build', { stdio: 'inherit' });
  
  console.log('Build completed successfully!');
  console.log('Server is running at http://localhost:8000');
} catch (error) {
  console.error('Error during build or server start:', error);
  process.exit(1);
}
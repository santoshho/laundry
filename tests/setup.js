// Test setup file
const fs = require('fs');
const path = require('path');

// Ensure data directory exists for tests
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Set test timeout
jest.setTimeout(10000);
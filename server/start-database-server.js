#!/usr/bin/env node

/**
 * DATABASE-FIRST SERVER STARTUP SCRIPT
 * Use this instead of the regular server for database-first architecture
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the database-first server
import('./src/databaseIndex.js').catch(error => {
  console.error('[STARTUP] Failed to start database-first server:', error);
  process.exit(1);
});

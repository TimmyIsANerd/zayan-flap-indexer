import { DatabaseManager } from './database.js';
import { Indexer } from './indexer.js';
import { ApiServer } from './api.js';
import { config } from './config.js';

console.log('Initializing Database...');
const db = new DatabaseManager();

console.log('Initializing Indexer...');
const indexer = new Indexer(db);

console.log('Initializing API Server...');
const apiServer = new ApiServer(db, indexer);

// Start the background indexer loop
indexer.start().catch((error) => {
  console.error('Fatal error in indexer:', error);
  process.exit(1);
});

console.log(`Starting API server on port ${config.PORT}`);
Bun.serve({
  port: config.PORT,
  fetch: apiServer.app.fetch,
});
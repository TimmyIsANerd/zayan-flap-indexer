import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  PORTAL_CONTRACT_ADDRESS: string;
  BUY_FEE_RATE: number; // in bps (basis points)
  SELL_FEE_RATE: number; // in bps (basis points)
  CHAIN_NAME: string;
  RPC_URL: string | undefined;
  DEFAULT_START_BLOCK: number | undefined;
  INDEX_BATCH_SIZE: number;
  INDEX_INTERVAL: number; // in milliseconds
  PORT: number;
  DATABASE_FILE: string;
}

// Default configuration for Morph chain
export const config: Config = {
  PORTAL_CONTRACT_ADDRESS: process.env.PORTAL_CONTRACT_ADDRESS || '0x...',
  BUY_FEE_RATE: parseInt(process.env.BUY_FEE_RATE || '250'), // 2.5%
  SELL_FEE_RATE: parseInt(process.env.SELL_FEE_RATE || '250'), // 2.5%
  CHAIN_NAME: process.env.CHAIN_NAME || 'morph',
  RPC_URL: process.env.RPC_URL,
  DEFAULT_START_BLOCK: process.env.DEFAULT_START_BLOCK 
    ? parseInt(process.env.DEFAULT_START_BLOCK) 
    : undefined,
  INDEX_BATCH_SIZE: parseInt(process.env.INDEX_BATCH_SIZE || '200'),
  INDEX_INTERVAL: parseInt(process.env.INDEX_INTERVAL || '200'),
  PORT: parseInt(process.env.PORT || '3000'),
  DATABASE_FILE: process.env.DATABASE_FILE || 'tokens.db',
};
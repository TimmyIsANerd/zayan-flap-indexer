import { Database } from 'bun:sqlite';
import { config } from './config.js';

export interface TokenRow {
  address: string;
  nonce: number;
  name: string;
  symbol: string;
  meta: string;
  status: 'bonding_curve_phase' | 'listed_on_dex';
  creator: string;
  created_at: number;
  created_block: number;
  quote_token: string;
  r: string;
  h: string;
  k: string;
  circulating_supply: string;
  dex_supply_threshold: string;
  tax: string;
  pool: string | null;
}

export interface MetaRow {
  key: string;
  value: string;
}

export class DatabaseManager {
  private db: Database;

  constructor() {
    this.db = new Database(config.DATABASE_FILE);
    this.init();
  }

  private init() {
    // Create tokens table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        address TEXT PRIMARY KEY,
        nonce INTEGER NOT NULL,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        meta TEXT NOT NULL,
        status TEXT NOT NULL,
        creator TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        created_block INTEGER NOT NULL,
        quote_token TEXT NOT NULL,
        r TEXT NOT NULL,
        h TEXT NOT NULL,
        k TEXT NOT NULL,
        circulating_supply TEXT NOT NULL,
        dex_supply_threshold TEXT NOT NULL,
        tax TEXT NOT NULL,
        pool TEXT
      )
    `);

    // Create meta table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator);
      CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
      CREATE INDEX IF NOT EXISTS idx_tokens_created_block ON tokens(created_block);
    `);
  }

  // Token operations
  insertToken(token: Omit<TokenRow, 'address'> & { address: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO tokens (
        address, nonce, name, symbol, meta, status, creator, created_at,
        created_block, quote_token, r, h, k, circulating_supply,
        dex_supply_threshold, tax, pool
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      token.address.toLowerCase(),
      token.nonce,
      token.name,
      token.symbol,
      token.meta,
      token.status,
      token.creator.toLowerCase(),
      token.created_at,
      token.created_block,
      token.quote_token.toLowerCase(),
      token.r,
      token.h,
      token.k,
      token.circulating_supply,
      token.dex_supply_threshold,
      token.tax,
      token.pool ? token.pool.toLowerCase() : null
    );
  }

  getToken(address: string): TokenRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM tokens WHERE address = ?');
    return stmt.get(address.toLowerCase()) as TokenRow | undefined;
  }

  getTotalTokens(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM tokens');
    const row = stmt.get() as { count: number };
    return row.count;
  }

  updateTokenCurve(address: string, r: string, h: string, k: string): void {
    const stmt = this.db.prepare('UPDATE tokens SET r = ?, h = ?, k = ? WHERE address = ?');
    stmt.run(r, h, k, address.toLowerCase());
  }

  updateTokenDexSupplyThreshold(address: string, threshold: string): void {
    const stmt = this.db.prepare('UPDATE tokens SET dex_supply_threshold = ? WHERE address = ?');
    stmt.run(threshold, address.toLowerCase());
  }

  updateTokenQuoteToken(address: string, quoteToken: string): void {
    const stmt = this.db.prepare('UPDATE tokens SET quote_token = ? WHERE address = ?');
    stmt.run(quoteToken.toLowerCase(), address.toLowerCase());
  }

  updateTokenTax(address: string, tax: string): void {
    const stmt = this.db.prepare('UPDATE tokens SET tax = ? WHERE address = ?');
    stmt.run(tax, address.toLowerCase());
  }

  updateTokenCirculatingSupply(address: string, supply: string): void {
    const stmt = this.db.prepare('UPDATE tokens SET circulating_supply = ? WHERE address = ?');
    stmt.run(supply, address.toLowerCase());
  }

  updateTokenDexListing(address: string, pool: string): void {
    const stmt = this.db.prepare('UPDATE tokens SET status = ?, pool = ? WHERE address = ?');
    stmt.run('listed_on_dex', pool.toLowerCase(), address.toLowerCase());
  }

  // Meta operations
  getMeta(key: string): string | undefined {
    const stmt = this.db.prepare('SELECT value FROM meta WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    stmt.run(key, value);
  }

  getLastProcessedBlock(): number | undefined {
    const value = this.getMeta('last_processed_block');
    return value ? parseInt(value) : undefined;
  }

  setLastProcessedBlock(blockNumber: number): void {
    this.setMeta('last_processed_block', blockNumber.toString());
  }

  close(): void {
    this.db.close();
  }
}
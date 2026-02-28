import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { DatabaseManager } from './database.js';
import { CDPV2 } from './curve.js';
import { config } from './config.js';
import { Decimal } from 'decimal.js';
import type { Indexer } from './indexer.js';

export interface TokenResponse {
  address: string;
  name: string;
  symbol: string;
  meta: string;
  status: string;
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
  current_price: string | null;
  progress: string;
}

export interface QuoteResponse {
  token: string;
  side: 'buy' | 'sell';
  input_amount: string;
  output_amount: string;
  quote_token: string;
}

export class ApiServer {
  public app: Hono;
  private db: DatabaseManager;
  private indexer: Indexer | undefined;

  constructor(db: DatabaseManager, indexer?: Indexer) {
    this.db = db;
    this.indexer = indexer;
    this.app = new Hono();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use('*', logger());
    this.app.use('*', cors());
  }

  private setupRoutes(): void {
    this.app.get('/health', async (c) => {
      const lastProcessedBlock = this.db.getLastProcessedBlock();
      const totalTokens = this.db.getTotalTokens();
      let currentBlock = 0;
      
      if (this.indexer) {
        currentBlock = await this.indexer.getCurrentBlock();
      }

      let syncStatus = 'unknown';
      if (currentBlock > 0 && lastProcessedBlock) {
        const diff = currentBlock - lastProcessedBlock;
        syncStatus = diff < 1000 ? 'synced' : 'syncing';
      }

      return c.json({
        status: 'ok',
        timestamp: Date.now(),
        last_processed_block: lastProcessedBlock || null,
        current_block: currentBlock || null,
        total_tokens: totalTokens,
        sync_status: syncStatus
      });
    });

    this.app.get('/token/:address', async (c) => this.getToken(c));
    this.app.get('/quote', async (c) => this.getQuote(c));
  }

  private async getToken(c: any) {
    try {
      const address = c.req.param('address').toLowerCase();
      const try_remediation = c.req.query('try_remediation');

      if (!address) {
        return c.json({ error: 'Token address is required' }, 400);
      }

      let token = this.db.getToken(address);

      if (!token && try_remediation === 'true' && this.indexer) {
        try {
          console.log(`Attempting data remediation for token ${address}`);
          await this.indexer.remediateTokenData(address as `0x${string}`);
          token = this.db.getToken(address);
        } catch (error) {
          console.error(`Data remediation failed for token ${address}:`, error);
          return c.json({ error: 'Token not found and data remediation failed (token may not exist)' }, 404);
        }
      }

      if (!token) {
        return c.json({ error: 'Token not found' }, 404);
      }

      const curve = new CDPV2(
        parseFloat(token.r),
        parseFloat(token.h),
        parseFloat(token.k)
      );

      const currentPrice = token.status === 'listed_on_dex' ? null : curve.price(token.circulating_supply);

      let progress: string;
      const circulatingSupply = new Decimal(token.circulating_supply);
      const dexSupplyThreshold = new Decimal(token.dex_supply_threshold);

      if (circulatingSupply.gte(dexSupplyThreshold)) {
        progress = "1.0000";
      } else {
        const currReserve = curve.estimateReserve(token.circulating_supply);
        const expectedReserveToMigrate = curve.estimateReserve(token.dex_supply_threshold);

        if (expectedReserveToMigrate.lte(0)) {
          progress = "0.0000";
        } else {
          const progressRatio = currReserve.div(expectedReserveToMigrate);
          progress = progressRatio.toFixed(4);
        }
      }

      const { nonce, ...tokenData } = token;

      const response: TokenResponse = {
        ...tokenData,
        current_price: currentPrice ? currentPrice.toString() : null,
        progress
      };

      return c.json(response);
    } catch (error) {
      console.error('Error in getToken:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  }

  private async getQuote(c: any) {
    try {
      const tokenAddress = c.req.query('token');
      const side = c.req.query('side');
      const inputAmountParam = c.req.query('input_amount');
      const try_remediation = c.req.query('try_remediation');

      if (!tokenAddress || !side || !inputAmountParam) {
        return c.json({ error: 'token, side, and input_amount parameters are required' }, 400);
      }

      if (side !== 'buy' && side !== 'sell') {
        return c.json({ error: 'side must be either "buy" or "sell"' }, 400);
      }

      let token = this.db.getToken(tokenAddress);

      if (!token && try_remediation === 'true' && this.indexer) {
        try {
          console.log(`Attempting data remediation for token ${tokenAddress}`);
          await this.indexer.remediateTokenData(tokenAddress as `0x${string}`);
          token = this.db.getToken(tokenAddress);
        } catch (error) {
          console.error(`Data remediation failed for token ${tokenAddress}:`, error);
          return c.json({ error: 'Token not found and data remediation failed (token may not exist)' }, 404);
        }
      }

      if (!token) {
        return c.json({ error: 'Token not found' }, 404);
      }

      if (token.status === 'listed_on_dex') {
        return c.json({ error: 'Token is already listed on DEX, quotes not available' }, 400);
      }

      const curve = new CDPV2(
        parseFloat(token.r),
        parseFloat(token.h),
        parseFloat(token.k)
      );

      const inputAmount = inputAmountParam;
      let outputAmount: string;

      if (side === 'buy') {
        outputAmount = this.calculateBuyQuote(curve, token, inputAmount);
      } else {
        outputAmount = this.calculateSellQuote(curve, token, inputAmount);
      }

      const response: QuoteResponse = {
        token: token.address,
        side: side as 'buy' | 'sell',
        input_amount: inputAmount,
        output_amount: outputAmount,
        quote_token: token.quote_token
      };

      return c.json(response);
    } catch (error) {
      console.error('Error in getQuote:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  }

  private calculateBuyQuote(curve: CDPV2, token: any, inputEth: string): string {
    const currCirculatingSupply = new Decimal(token.circulating_supply);
    const dexSupplyThreshold = new Decimal(token.dex_supply_threshold);
    const currReserve = curve.estimateReserve(currCirculatingSupply.toString());
    const maxReserve = curve.estimateReserve(dexSupplyThreshold.toString());
    const feeRate = new Decimal(config.BUY_FEE_RATE).div(10000);
    const inputAfterFee = new Decimal(inputEth).mul(new Decimal(1).sub(feeRate));
    
    let newReserve: Decimal;
    if (curve.h === 0) {
      newReserve = currReserve.add(inputAfterFee);
    } else {
      const maxAddition = maxReserve.sub(currReserve);
      const actualAddition = Decimal.min(inputAfterFee, maxAddition);
      newReserve = currReserve.add(actualAddition);
    }
    
    const newCirculatingSupply = curve.estimateSupply(newReserve.toString());
    const outputAmount = newCirculatingSupply.sub(currCirculatingSupply);
    
    return outputAmount.toString();
  }

  private calculateSellQuote(curve: CDPV2, token: any, inputTokenAmount: string): string {
    const currCirculatingSupply = new Decimal(token.circulating_supply);
    const inputAmount = new Decimal(inputTokenAmount);
    const currReserve = curve.estimateReserve(currCirculatingSupply.toString());
    const newCirculatingSupply = currCirculatingSupply.sub(inputAmount);
    const newReserve = curve.estimateReserve(newCirculatingSupply.toString());
    const outputBeforeFee = currReserve.sub(newReserve);
    const feeRate = new Decimal(config.SELL_FEE_RATE).div(10000);
    const outputAmount = outputBeforeFee.mul(new Decimal(1).sub(feeRate));
    
    return outputAmount.toString();
  }
}
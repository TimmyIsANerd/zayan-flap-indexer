import { createPublicClient, http, fallback, formatEther, decodeEventLog } from 'viem';
import type { Address, Log } from 'viem';
import { DatabaseManager } from './database.js';
import type { TokenRow } from './database.js';
import { config } from './config.js';
import { 
  PORTAL_ABI, 
  ERC20_ABI,
  TokenStatus,
  DEFAULT_DEX_SUPPLY_THRESHOLD,
  DEFAULT_R,
  DEFAULT_H,
  DEFAULT_K,
  ZERO_ADDRESS
} from './types.js';
import type { 
  TokenCreatedEvent, 
  TokenCurveSetEvent, 
  TokenCurveSetV2Event,
  TokenDexSupplyThreshSetEvent,
  TokenQuoteSetEvent,
  FlapTokenTaxSetEvent,
  FlapTokenCirculatingSupplyChangedEvent,
  LaunchedToDEXEvent,
  TokenStateV5,
} from './types.js';

export class Indexer {
  private db: DatabaseManager;
  private client: any;
  private running = false;

  constructor(db: DatabaseManager) {
    this.db = db;
    
    let transport;
    
    // Check if chain is BSC and apply the failover logic like in zayan bot
    if (config.CHAIN_NAME.toLowerCase() === 'bsc' || config.CHAIN_NAME.toLowerCase() === 'bnb') {
      const bscFallbacks = [
        "https://bsc-mainnet.infura.io/v3/3c577009c5eb4b34b9542a2e60b855a9",
        "https://bsc-dataseed1.ninicoin.io",
        "https://bsc-dataseed2.ninicoin.io",
        "https://bsc-dataseed3.ninicoin.io",
        "https://bsc-dataseed.bnbchain.org",
        "https://bsc-dataseed1.defibit.io",
        "https://bsc-dataseed2.defibit.io",
        "https://bsc-dataseed3.defibit.io",
        "https://bsc-dataseed4.defibit.io"
      ];
      const transports = [];
      if (config.RPC_URL) transports.push(http(config.RPC_URL, { batch: true, retryCount: 3, retryDelay: 1000 }));
      transports.push(...bscFallbacks.map(url => http(url, { batch: true, retryCount: 3, retryDelay: 1000 })));
      
      transport = fallback(transports, { rank: true });
    } else {
      // Multiple RPC URLs provided via comma separation
      if (config.RPC_URL && config.RPC_URL.includes(',')) {
        const urls = config.RPC_URL.split(',').map(url => url.trim());
        transport = fallback(urls.map(url => http(url, { batch: true, retryCount: 3, retryDelay: 1000 })), { rank: true });
      } else {
        transport = http(config.RPC_URL, { batch: true });
      }
    }

    this.client = createPublicClient({
      transport,
    });
  }

  async start(): Promise<void> {
    this.running = true;
    console.log('Starting indexer...');

    while (this.running) {
      try {
        await this.processNextBatch();
        await this.sleep(config.INDEX_INTERVAL);
      } catch (error) {
        console.error('Error in indexer:', error);
        await this.sleep(config.INDEX_INTERVAL * 2); // Wait longer on error
      }
    }
  }

  stop(): void {
    this.running = false;
    console.log('Stopping indexer...');
  }

  public async getCurrentBlock(): Promise<number> {
    try {
      return Number(await this.client.getBlockNumber());
    } catch (e) {
      return 0;
    }
  }

  private async processNextBatch(): Promise<void> {
    const lastProcessedBlock = this.db.getLastProcessedBlock();
    const currentBlock = await this.client.getBlockNumber();
    
    let fromBlock: number;
    if (lastProcessedBlock) {
      fromBlock = lastProcessedBlock + 1;
    } else {
      fromBlock = config.DEFAULT_START_BLOCK ?? Number(currentBlock) - 10000;
    }

    const toBlock = Math.min(fromBlock + config.INDEX_BATCH_SIZE - 1, Number(currentBlock));

    if (fromBlock > toBlock) {
      return; // Nothing to process
    }

    console.log(`Processing blocks ${fromBlock} to ${toBlock}`);

    // Use batch call to get both block number and logs
    const [blockNumber, logs] = await Promise.all([
      this.client.getBlockNumber(),
      this.client.getLogs({
        address: config.PORTAL_CONTRACT_ADDRESS as Address,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock),
      })
    ]);

    // Ensure we're not getting stale data
    if (blockNumber < BigInt(toBlock)) {
      console.log('RPC node returned stale data, retrying...');
      return;
    }

    await this.processLogs(logs);
    this.db.setLastProcessedBlock(toBlock);
  }

  private async processLogs(logs: Log[]): Promise<void> {
    for (const log of logs) {
      try {
        await this.processLog(log);
      } catch (error) {
        console.error('Error processing log:', error, log);
      }
    }
  }

  private async processLog(log: Log): Promise<void> {
    try {
      // Decode the log to get the event name and args
      const decoded = decodeEventLog({
        abi: PORTAL_ABI,
        data: log.data,
        topics: log.topics,
      });

      const eventName = decoded.eventName;
      if (!eventName) {
        return;
      }

      switch (eventName) {
        case 'TokenCreated':
          await this.handleTokenCreated(log, decoded.args as any);
          break;
        case 'TokenCurveSet':
          await this.handleTokenCurveSet(log, decoded.args as any);
          break;
        case 'TokenCurveSetV2':
          await this.handleTokenCurveSetV2(log, decoded.args as any);
          break;
        case 'TokenDexSupplyThreshSet':
          await this.handleTokenDexSupplyThreshSet(log, decoded.args as any);
          break;
        case 'TokenQuoteSet':
          await this.handleTokenQuoteSet(log, decoded.args as any);
          break;
        case 'FlapTokenTaxSet':
          await this.handleFlapTokenTaxSet(log, decoded.args as any);
          break;
        case 'FlapTokenCirculatingSupplyChanged':
          await this.handleFlapTokenCirculatingSupplyChanged(log, decoded.args as any);
          break;
        case 'LaunchedToDEX':
          await this.handleLaunchedToDEX(log, decoded.args as any);
          break;
      }
    } catch (error) {
      // Log might not be one of our events, skip it
      console.log('Skipping unknown event or decode error:', error);
    }
  }

  private async handleTokenCreated(log: Log, args: any): Promise<void> {
    const { ts, creator, nonce, token, name, symbol, meta } = args;

    const tokenData: Omit<TokenRow, 'address'> & { address: string } = {
      address: token,
      nonce: Number(nonce),
      name,
      symbol,
      meta,
      status: 'bonding_curve_phase',
      creator,
      created_at: Number(ts),
      created_block: Number(log.blockNumber),
      quote_token: ZERO_ADDRESS,
      r: DEFAULT_R,
      h: DEFAULT_H,
      k: DEFAULT_K,
      circulating_supply: "0",
      dex_supply_threshold: DEFAULT_DEX_SUPPLY_THRESHOLD,
      tax: "0",
      pool: null
    };

    this.db.insertToken(tokenData);
    console.log(`Token created: ${token}`);
  }

  private async handleTokenCurveSet(log: Log, args: any): Promise<void> {
    const { token, curveParameter } = args;
    
    const r = formatEther(curveParameter);
    const h = "0";
    const k = formatEther(curveParameter * BigInt(1e9));

    this.db.updateTokenCurve(token, r, h, k);
    console.log(`Token curve set: ${token}, r=${r}`);
  }

  private async handleTokenCurveSetV2(log: Log, args: any): Promise<void> {
    const { token, r, h, k } = args;
    
    this.db.updateTokenCurve(
      token,
      formatEther(r),
      formatEther(h),
      formatEther(k)
    );
    console.log(`Token curve set V2: ${token}`);
  }

  private async handleTokenDexSupplyThreshSet(log: Log, args: any): Promise<void> {
    const { token, dexSupplyThresh } = args;
    
    this.db.updateTokenDexSupplyThreshold(token, formatEther(dexSupplyThresh));
    console.log(`Token dex supply threshold set: ${token}`);
  }

  private async handleTokenQuoteSet(log: Log, args: any): Promise<void> {
    const { token, quoteToken } = args;
    
    this.db.updateTokenQuoteToken(token, quoteToken);
    console.log(`Token quote set: ${token}, quote=${quoteToken}`);
  }

  private async handleFlapTokenTaxSet(log: Log, args: any): Promise<void> {
    const { token, tax } = args;
    
    // Convert from bps (4 decimals) to decimal string
    const taxDecimal = (Number(tax) / 10000).toString();
    this.db.updateTokenTax(token, taxDecimal);
    console.log(`Token tax set: ${token}, tax=${taxDecimal}`);
  }

  private async handleFlapTokenCirculatingSupplyChanged(log: Log, args: any): Promise<void> {
    const { token, newSupply } = args;
    
    // Check if token exists, if not try to remediate
    let tokenData = this.db.getToken(token);
    if (!tokenData) {
      await this.remediateTokenData(token);
      tokenData = this.db.getToken(token);
      if (!tokenData) {
        console.error(`Failed to remediate token data for ${token}`);
        return;
      }
    }

    this.db.updateTokenCirculatingSupply(token, formatEther(newSupply));
    console.log(`Token circulating supply updated: ${token}, supply=${formatEther(newSupply)}`);
  }

  private async handleLaunchedToDEX(log: Log, args: any): Promise<void> {
    const { token, pool } = args;
    
    // Check if token exists, if not try to remediate
    let tokenData = this.db.getToken(token);
    if (!tokenData) {
      await this.remediateTokenData(token);
      tokenData = this.db.getToken(token);
      if (!tokenData) {
        console.error(`Failed to remediate token data for ${token}`);
        return;
      }
    }

    this.db.updateTokenDexListing(token, pool);
    console.log(`Token launched to DEX: ${token}, pool=${pool}`);
  }

  public async remediateTokenData(tokenAddress: Address): Promise<void> {
    try {
      console.log(`Attempting to remediate token data for ${tokenAddress}`);
      
      const tokenStateRaw = await this.client.readContract({
        address: config.PORTAL_CONTRACT_ADDRESS as Address,
        abi: PORTAL_ABI,
        functionName: 'getTokenV5',
        args: [tokenAddress]
      }) as [number, bigint, bigint, bigint, number, bigint, bigint, bigint, bigint, Address, boolean, string];

      // Map the tuple to a TokenStateV5 object
      const tokenState: TokenStateV5 = {
        status: tokenStateRaw[0],
        reserve: tokenStateRaw[1],
        circulatingSupply: tokenStateRaw[2],
        price: tokenStateRaw[3],
        tokenVersion: tokenStateRaw[4],
        r: tokenStateRaw[5],
        h: tokenStateRaw[6],
        k: tokenStateRaw[7],
        dexSupplyThresh: tokenStateRaw[8],
        quoteTokenAddress: tokenStateRaw[9],
        nativeToQuoteSwapEnabled: tokenStateRaw[10],
        extensionID: tokenStateRaw[11]
      };

      // Fetch name, symbol, and meta from the token contract
      let name = 'Unknown';
      let symbol = 'UNKNOWN';
      let meta = '';

      try {
        name = await this.client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'name'
        }) as string;
      } catch (error) {
        console.warn(`Failed to fetch name for token ${tokenAddress}:`, error);
      }

      try {
        symbol = await this.client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'symbol'
        }) as string;
      } catch (error) {
        console.warn(`Failed to fetch symbol for token ${tokenAddress}:`, error);
      }

      try {
        meta = await this.client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'metaURI'
        }) as string;
      } catch (error) {
        console.warn(`Failed to fetch metaURI for token ${tokenAddress}:`, error);
      }

      // Create token data with fetched values
      const tokenData: Omit<TokenRow, 'address'> & { address: string } = {
        address: tokenAddress,
        nonce: 0, // We don't have this from the contract
        name,
        symbol,
        meta,
        status: tokenState.status === TokenStatus.DEX ? 'listed_on_dex' : 'bonding_curve_phase',
        creator: ZERO_ADDRESS, // We don't have this from the contract
        created_at: 0, // We don't have this from the contract
        created_block: 0, // We don't have this from the contract
        quote_token: tokenState.quoteTokenAddress,
        r: formatEther(tokenState.r),
        h: formatEther(tokenState.h),
        k: formatEther(tokenState.k),
        circulating_supply: formatEther(tokenState.circulatingSupply),
        dex_supply_threshold: formatEther(tokenState.dexSupplyThresh),
        tax: "0", // We don't have this from the contract
        pool: null // We don't have this from the contract
      };

      this.db.insertToken(tokenData);
      console.log(`Remediated token data for ${tokenAddress}`);
    } catch (error) {
      console.error(`Failed to remediate token data for ${tokenAddress}:`, error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
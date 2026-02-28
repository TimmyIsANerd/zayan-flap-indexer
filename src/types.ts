import { parseAbi } from 'viem';
import type { Address } from 'viem';

// Event interfaces
export interface TokenCreatedEvent {
  ts: bigint;
  creator: Address;
  nonce: bigint;
  token: Address;
  name: string;
  symbol: string;
  meta: string;
}

export interface TokenCurveSetEvent {
  token: Address;
  curve: Address;
  curveParameter: bigint;
}

export interface TokenCurveSetV2Event {
  token: Address;
  r: bigint;
  h: bigint;
  k: bigint;
}

export interface TokenDexSupplyThreshSetEvent {
  token: Address;
  dexSupplyThresh: bigint;
}

export interface TokenQuoteSetEvent {
  token: Address;
  quoteToken: Address;
}

export interface FlapTokenTaxSetEvent {
  token: Address;
  tax: bigint;
}

export interface FlapTokenCirculatingSupplyChangedEvent {
  token: Address;
  newSupply: bigint;
}

export interface LaunchedToDEXEvent {
  token: Address;
  pool: Address;
  amount: bigint;
  eth: bigint;
}

// Contract structs
export interface TokenStateV5 {
  status: number; // TokenStatus enum
  reserve: bigint;
  circulatingSupply: bigint;
  price: bigint;
  tokenVersion: number; // TokenVersion enum
  r: bigint;
  h: bigint;
  k: bigint;
  dexSupplyThresh: bigint;
  quoteTokenAddress: Address;
  nativeToQuoteSwapEnabled: boolean;
  extensionID: string; // bytes32
}

// ABI definitions
export const PORTAL_ABI = parseAbi([
  'event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)',
  'event TokenCurveSet(address token, address curve, uint256 curveParameter)',
  'event TokenCurveSetV2(address token, uint256 r, uint256 h, uint256 k)',
  'event TokenDexSupplyThreshSet(address token, uint256 dexSupplyThresh)',
  'event TokenQuoteSet(address token, address quoteToken)',
  'event FlapTokenTaxSet(address token, uint256 tax)',
  'event FlapTokenCirculatingSupplyChanged(address token, uint256 newSupply)',
  'event LaunchedToDEX(address token, address pool, uint256 amount, uint256 eth)',
  
  'function getTokenV5(address token) external view returns ((uint8,uint256,uint256,uint256,uint8,uint256,uint256,uint256,uint256,address,bool,bytes32))'
]);

export const ERC20_ABI = parseAbi([
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function metaURI() external view returns (string)'
]);

// Enums
export enum TokenStatus {
  Invalid = 0,
  Tradable = 1,
  InDuel = 2,
  Killed = 3,
  DEX = 4
}

export enum CurveType {
  CURVE_LEGACY_15 = 0,
  CURVE_4 = 1,
  CURVE_0_974 = 2,
  CURVE_0_5 = 3,
  CURVE_1000 = 4,
  CURVE_20000 = 5,
  CURVE_2500 = 6,
  CURVE_3 = 7,
  CURVE_2 = 8,
  CURVE_6 = 9,
  CURVE_75 = 10,
  CURVE_4M = 11,
  CURVE_28 = 12,
  CURVE_21_25 = 13,
  CURVE_RH_UNUSED = 14,
  CURVE_RH_28D25_108002126 = 15,
}

export enum DexThreshType {
  TWO_THIRDS = 0,
  FOUR_FIFTHS = 1,
  HALF = 2,
  _95_PERCENT = 3,
  _81_PERCENT = 4,
  _1_PERCENT = 5,
}

// Default values
export const DEFAULT_DEX_SUPPLY_THRESHOLD = "666700000"; // 6.67e8 ether
export const DEFAULT_R = "15";
export const DEFAULT_H = "0";
export const DEFAULT_K = "15000000000"; // 15 * 1e9
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
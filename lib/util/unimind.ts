import { UNIMIND_DEV_SWAPPER_ADDRESS } from "./constants";
import { UnimindParameters } from "../repositories/unimind-parameters-repository";
import { UnimindStatistics } from "../crons/unimind-algorithm";
import { default as Logger } from 'bunyan'
import { QuoteMetadata } from "../repositories/quote-metadata-repository";
import { UNIMIND_LIST } from "../config/unimind-list";
import { keccak256 } from "ethers/lib/utils";

export const UNIMIND_ADDRESS_SAMPLE_PERCENT = 100;
export const UNIMIND_TRADE_SAMPLE_PERCENT = 100;

export function unimindAddressFilter(address: string) {
  // Always include the dev swapper address
  if (address.toLowerCase() === UNIMIND_DEV_SWAPPER_ADDRESS.toLowerCase()) {
    return true;
  }
  
  // Hash address to avoid bias from vanity addresses
  const hash = keccak256(Buffer.from(address.toLowerCase()));
  
  // Take the last 2 bytes (4 hex chars) and convert to number
  const lastFourChars = hash.slice(-4);
  const value = parseInt(lastFourChars, 16);
  
  // Check if in sample range (1-100)
  return (value % 100) + 1 <= UNIMIND_ADDRESS_SAMPLE_PERCENT;
}

export function unimindTradeFilter(quoteId: string): boolean {
  // Hash the quoteId for deterministic, consistent sampling
  const hash = keccak256(Buffer.from(quoteId.toLowerCase()));
  
  // Same technique as address filter - use last 4 hex chars
  const lastFourChars = hash.slice(-4);
  const value = parseInt(lastFourChars, 16);
  
  // Check if in sample range (1-100)
  return (value % 100) + 1 <= UNIMIND_TRADE_SAMPLE_PERCENT;
}

export function supportedUnimindTokens(pair: string) {
  // Extract addresses from pair (address1-address2-chainId)
  const [address1, address2, chainId] = pair.split('-')
  const chainIdInt = parseInt(chainId)
  // Check if both addresses are in the UNIMIND_LIST
  const token1 = UNIMIND_LIST.find(token => token.address.toLowerCase() === address1.toLowerCase() && token.chainId === chainIdInt)
  const token2 = UNIMIND_LIST.find(token => token.address.toLowerCase() === address2.toLowerCase() && token.chainId === chainIdInt)
  return token1 !== undefined && token2 !== undefined
}

export interface IUnimindAlgorithm<T> {
  /**
 * @notice Adjusts Unimind parameters (intrinsic values) based on historical order statistics
 * @param statistics Aggregated order data containing arrays of wait times, fill statuses, and price impacts
 * @param pairData Previous parameters intrinsic values stored for the pair
 * @return Updated intrinsic parameters
 */
  unimindAlgorithm(statistics: UnimindStatistics, pairData: UnimindParameters, log: Logger): T;
  computePi(intrinsicValues: T, extrinsicValues: QuoteMetadata): number;
  computeTau(intrinsicValues: T, extrinsicValues: QuoteMetadata): number;
}
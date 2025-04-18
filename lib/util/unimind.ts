import { UNIMIND_DEV_SWAPPER_ADDRESS } from "./constants";
import { UnimindParameters } from "../repositories/unimind-parameters-repository";
import { UnimindStatistics } from "../crons/unimind-algorithm";
import { default as Logger } from 'bunyan'
import { QuoteMetadata } from "../repositories/quote-metadata-repository";
import { UNIMIND_LIST } from "../config/unimind-list";

export function unimindAddressFilter(address: string) {
  // Always include the dev swapper address
  if (address.toLowerCase() === UNIMIND_DEV_SWAPPER_ADDRESS.toLowerCase()) {
    return true;
  }
  
  // Sample 1% of other addresses by using the last 4 hex characters
  const lastFourChars = address.slice(-4);
  const value = parseInt(lastFourChars, 16);
  return value % 100 === 0; // 1% chance
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
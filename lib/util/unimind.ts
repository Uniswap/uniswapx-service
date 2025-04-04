import { UNIMIND_DEV_SWAPPER_ADDRESS } from "./constants";
import { UnimindParameters } from "../repositories/unimind-parameters-repository";
import { UnimindStatistics } from "../crons/unimind-algorithm";
import { default as Logger } from 'bunyan'
import { QuoteMetadata } from "../repositories/quote-metadata-repository";

export function unimindAddressFilter(address: string) {
  return address.toLowerCase() === UNIMIND_DEV_SWAPPER_ADDRESS.toLowerCase()
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
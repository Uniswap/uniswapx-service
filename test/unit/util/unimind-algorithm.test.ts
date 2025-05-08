import Logger from 'bunyan';
import { getStatistics } from '../../../lib/crons/unimind-algorithm';
import { DutchV3OrderEntity } from '../../../lib/entities';
import { ORDER_STATUS } from '../../../lib/entities/Order';
import { mock } from 'jest-mock-extended';
import { UNIMIND_ALGORITHM_VERSION, UNIMIND_DEV_SWAPPER_ADDRESS, UNIMIND_MAX_TAU_BPS, UNIMIND_UPDATE_THRESHOLD } from '../../../lib/util/constants';
import { PriceImpactStrategy } from '../../../lib/unimind/priceImpactStrategy';
import { BatchedStrategy } from '../../../lib/unimind/batchedStrategy';
import { unimindAddressFilter, UNIMIND_SAMPLE_PERCENT } from '../../../lib/util/unimind';
import { calculateParameters } from '../../../lib/handlers/get-unimind/handler';
import { QuoteMetadata } from '../../../lib/repositories/quote-metadata-repository';

describe('unimind-algorithm', () => {
  const log = mock<Logger>()
  describe('getStatistics', () => {
    it('should filter out indices with undefined values while preserving order', () => {
      // Mock data with some undefined values
      const mockOrders = [
        // All values defined
        {
          fillBlock: 100,
          cosignerData: { decayStartBlock: 90 },
          orderStatus: ORDER_STATUS.FILLED,
          priceImpact: 0.01
        },
        // undefined priceImpact
        {
          fillBlock: 120,
          cosignerData: { decayStartBlock: 100 },
          orderStatus: ORDER_STATUS.FILLED,
          priceImpact: undefined
        },
        // waitTime should be undefined
        {
          fillBlock: -1,
          cosignerData: { decayStartBlock: 130 },
          orderStatus: ORDER_STATUS.EXPIRED,
          priceImpact: 0.04
        },
        // All values defined
        {
          fillBlock: 200,
          cosignerData: { decayStartBlock: 180 },
          orderStatus: ORDER_STATUS.FILLED,
          priceImpact: 0.05
        }
      ] as DutchV3OrderEntity[];

      const result = getStatistics(mockOrders, log);

      // Expected outcomes:
      // - Index 0: All defined
      // - Index 1: undefined priceImpact (should be filtered out)
      // - Index 2: undefined waitTime due to EXPIRED status (should not be filtered out)
      // - Index 3: All defined
      
      // Only indices 0, 2, 3 should remain
      expect(result.waitTimes).toEqual([10, undefined, 20]);
      expect(result.fillStatuses).toEqual([1, 0, 1]);
      expect(result.priceImpacts).toEqual([0.01, 0.04,0.05]);
      expect(result.waitTimes.length).toBe(3);
      expect(result.fillStatuses.length).toBe(3);
      expect(result.priceImpacts.length).toBe(3);
    });

    it('should handle edge case with all undefined values', () => {
      const mockOrders = [
        {
          fillBlock: undefined,
          cosignerData: { decayStartBlock: 90 },
          orderStatus: ORDER_STATUS.EXPIRED,
          priceImpact: undefined
        },
        {
          fillBlock: undefined,
          cosignerData: undefined,
          orderStatus: ORDER_STATUS.FILLED,
          priceImpact: undefined
        }
      ] as DutchV3OrderEntity[];

      const result = getStatistics(mockOrders, log);

      expect(result.waitTimes).toEqual([]);
      expect(result.fillStatuses).toEqual([]);
      expect(result.priceImpacts).toEqual([]);
    });

    it('should handle empty orders array', () => {
      const mockOrders: DutchV3OrderEntity[] = [];

      const result = getStatistics(mockOrders, log);

      expect(result.waitTimes).toEqual([]);
      expect(result.fillStatuses).toEqual([]);
      expect(result.priceImpacts).toEqual([]);
    });

    it('should handle missing cosignerData (intentionally corrupted data)', () => {
      const mockOrders = [
        {
          fillBlock: 100,
          cosignerData: undefined,
          orderStatus: ORDER_STATUS.FILLED,
          priceImpact: 0.01
        },
        {
          fillBlock: 200,
          cosignerData: { decayStartBlock: 180 },
          orderStatus: ORDER_STATUS.FILLED,
          priceImpact: 0.02
        }
      ] as DutchV3OrderEntity[];

      const result = getStatistics(mockOrders, log);

      // Only the second order should remain
      expect(result.waitTimes).toEqual([20]);
      expect(result.fillStatuses).toEqual([1]);
      expect(result.priceImpacts).toEqual([0.02]);
    });
  });

  describe('unimindAlgorithm', () => {
    it('should return the same parameters if the statistics are empty', () => {
      const strategy = new PriceImpactStrategy()
      const previousParameters = { intrinsicValues: JSON.stringify({ pi: 0.5, tau: 0.5 }), pair: '0x000-0x111-123', count: 25, version: UNIMIND_ALGORITHM_VERSION };
      const statistics = { waitTimes: [], fillStatuses: [], priceImpacts: [] };
      const result = strategy.unimindAlgorithm(statistics, previousParameters, log);
      expect(result).toEqual(JSON.parse(previousParameters.intrinsicValues));
    });
    it('should treat negative wait times as 0', () => {
      const strategy = new PriceImpactStrategy()
      const previousParameters = { intrinsicValues: JSON.stringify({ pi: 0.5, tau: 0.5 }), pair: '0x000-0x111-123', count: 25, version: UNIMIND_ALGORITHM_VERSION };
      const statistics = { waitTimes: [-1, 1, 2], fillStatuses: [1, 1, 1], priceImpacts: [0.01, 0.02, 0.03] };
      strategy.unimindAlgorithm(statistics, previousParameters, log);
      expect(statistics.waitTimes).toEqual([0, 1, 2]);
    });
    it('should treat undefined wait times as auction duration (32) for average calculation', () => {
      const strategy = new BatchedStrategy()
      const previousParameters = { intrinsicValues: JSON.stringify({ pi: 5, tau: 5 }), pair: '0x000-0x111-123', count: 25, version: UNIMIND_ALGORITHM_VERSION };
      
      // Four defined wait times (all value 2) and one undefined wait time
      const statistics = { 
        waitTimes: [2, 2, 2, 2, undefined], 
        fillStatuses: [1, 1, 1, 1, 0], 
        priceImpacts: [0.01, 0.01, 0.01, 0.01, 0.02] 
      };
      
      const result = strategy.unimindAlgorithm(statistics, previousParameters, log);
      
      // Expected average: (2 + 2 + 2 + 2 + 32) / 5 = 40 / 5 = 8
      // With objective_wait_time = 2, wait_time_proportion = (2 - 8) / 2 = -3
      // With learning_rate = 2, pi update = 5 + (2 * -3) = 5 - 6 = -1
      expect(result.pi).toBeCloseTo(-1);
    });
    it('small price impact strategy test', () => {
      const strategy = new PriceImpactStrategy()
      const intrinsicValues = { intrinsicValues: JSON.stringify({lambda1: 0, lambda2: 8, Sigma: -9.210340371976182}), count: UNIMIND_UPDATE_THRESHOLD, pair: '0x000-0x111-123', version: UNIMIND_ALGORITHM_VERSION };
      const statistics = {
        priceImpacts: [71.326195,37.776453,65.712047,36.1534175,44.643392,65.690826,47.046204,60.366931,55.34904,53.1279089],
        waitTimes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        fillStatuses: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
      }
      const result = strategy.unimindAlgorithm(statistics, intrinsicValues, log);
      // Test that they match to 5 decimal places
      expect(result.lambda1).toBeCloseTo(-0.0003691483060532844, 5)
      expect(result.lambda2).toBeCloseTo(189.63562199074985, 5)
      expect(result.Sigma).toBeCloseTo(-9.210349582316553, 5)
    });
    
    it('price impact strategy test', () => {
      const strategy = new PriceImpactStrategy()
      const priceImpacts = [71.326195,37.776453,65.712047,36.153417999999995,44.643392999999996,65.690826,47.046204,60.366931,55.34904,53.127908999999995,54.423511999999995,65.19417,62.022089,28.424546,49.078837,60.291282,31.713279,31.788921,70.89384600000001,56.324037000000004,53.515316,36.00114,69.551742,50.28837000000001,6.034174,42.604586,51.818982000000005,40.301666000000004,67.99754300000001,54.95465899999999,63.586809,62.746431,44.801485,62.056180000000005,70.62629700000001,56.774623999999996,37.786426,61.479227,42.824314,61.774944,70.264211,69.505023,45.516844,64.30273600000001,23.470843,24.29946,39.499266,44.837317,59.333055,35.663519,65.081785,70.32589,25.96255,41.386369,21.869225,64.201201,71.04847,71.655709,32.122751,43.039179,65.179817,6.391489,66.003474,2.740532,59.078206,51.044363999999995,72.25811,49.290612,11.821516,63.689742];
      const fillStatuses = [1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1];
      const waitTimes = [0,0,0,0,0,0,0,0,0,0,0,0,0,undefined,undefined,undefined,undefined,undefined,0,0,0,0,0,0,0,8,0,6,0,0,0,0,0,4,0,0,0,0,0,0,0,0,0,0,4,3,0,2,0,2,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0];
      const intrinsicValues = { intrinsicValues: JSON.stringify({lambda1: 0, lambda2: 8, Sigma: -9.210340371976182}), count: UNIMIND_UPDATE_THRESHOLD, pair: '0x000-0x111-123', version: UNIMIND_ALGORITHM_VERSION };
      const statistics = {
        priceImpacts,
        waitTimes,
        fillStatuses
      }
      const result = strategy.unimindAlgorithm(statistics, intrinsicValues, log);
      expect(result.lambda1).toBeCloseTo(-0.0003484873949757183, 5)
      expect(result.lambda2).toBeCloseTo(188.50087749284407, 5)
      expect(result.Sigma).toBeCloseTo(-9.210333135280175, 5)
    });

    it('Price impact with real data <=1% price impact', () => {
      const strategy = new PriceImpactStrategy()
      const intrinsicValues = { intrinsicValues: JSON.stringify({lambda1: 1.211937426072722e-9, lambda2: 4.237036738493101, Sigma: -0.41228565543852524}), count: UNIMIND_UPDATE_THRESHOLD, pair: '0x000-0x111-123', version: UNIMIND_ALGORITHM_VERSION };
      const waitTimes = [25, 3, 2, 1, 2, 2, 2, 1, 3, 2, 2, 2, 2, 3, 16, 2, 3, 2, 2, 7, 2, 1, 3, 2, 3, 1, 2, 2, 1, 2, 4, 2, 1, 2, 1, 2, 2, undefined, 21, 9, 1, 6, 1, 5, 1, 2, undefined, 10, 3, 3];
      const priceImpacts = [0.28, 0.45, 0.02, 0.07, 0.66, 0.43, 0.38, 0.13, 0.81, 0.57, 0.40, 0.07, 1.00, 0.64, 0.89, 0.41, 0.37, 0.26, 0.13, 0.25, 0.34, 0.53, 0.58, 0.46, 0.08, 0.49, 0.15, 0.27, 0.30, 0.25, 0.56, 0.39, 0.50, 0.48, 0.46, 0.33, 0.29, 0.69, 0.45, 0.10, 0.10, 0.45, 0.52, 0.73, 0.15, 0.61, 0.29, 0.89, 0.44, 0.65];
      const statistics = {
        priceImpacts,
        waitTimes,
        fillStatuses: waitTimes.map(wt => typeof wt === 'number' ? 1 : 0)
      }
      const result = strategy.unimindAlgorithm(statistics, intrinsicValues, log);
      expect(result.lambda1).toBeCloseTo(1.130312497556507e-9, 5)
      expect(result.lambda2).toBeCloseTo(4.237736453567317, 5)
      expect(result.Sigma).toBeCloseTo(-0.41228565543852524, 5)
    });

    it('price impact strategy test on extrinsic values', () => {
      const strategy = new PriceImpactStrategy()
      const intrinsicValues = { intrinsicValues: JSON.stringify({lambda1: 0, lambda2: 8, Sigma: Math.log(0.00005)}), count: UNIMIND_UPDATE_THRESHOLD, pair: '0x000-0x111-123', version: UNIMIND_ALGORITHM_VERSION };
      const extrinsicValues: QuoteMetadata = { priceImpact: 0.01, quoteId: '0x000-0x111-123', referencePrice: '100', blockNumber: 100, route: { quote: '100', quoteGasAdjusted: '100', gasPriceWei: '100', gasUseEstimateQuote: '100', gasUseEstimate: '100', methodParameters: {calldata: '0x', value: '0', to: '0x0000000000000000000000000000000000000000'}}, pair: '0x000-0x111-123', usedUnimind: true }
      const result = calculateParameters(strategy, intrinsicValues, extrinsicValues)

      expect(result.pi).toBeCloseTo(0.999764, 5)
      expect(result.tau).toBeCloseTo(15.000235519, 5)
    })

    it('ceiling on tau for price impact strategy', () => {
      const strategy = new PriceImpactStrategy()
      const intrinsicValues = { intrinsicValues: JSON.stringify({lambda1: 0, lambda2: 8, Sigma: Math.log(0.0002)}), count: UNIMIND_UPDATE_THRESHOLD, pair: '0x000-0x111-123', version: UNIMIND_ALGORITHM_VERSION };
      const extrinsicValues: QuoteMetadata = { priceImpact: 0.01, quoteId: '0x000-0x111-123', referencePrice: '100', blockNumber: 100, route: { quote: '100', quoteGasAdjusted: '100', gasPriceWei: '100', gasUseEstimateQuote: '100', gasUseEstimate: '100', methodParameters: {calldata: '0x', value: '0', to: '0x0000000000000000000000000000000000000000'}}, pair: '0x000-0x111-123', usedUnimind: true }
      const result = calculateParameters(strategy, intrinsicValues, extrinsicValues)

      expect(result.pi).toBeCloseTo(0.999764, 5)
      expect(result.tau).toBe(UNIMIND_MAX_TAU_BPS)
    })
  });
});

describe('unimindAddressFilter', () => {
  it('should return true for the dev swapper address', () => {
    expect(unimindAddressFilter(UNIMIND_DEV_SWAPPER_ADDRESS)).toBe(true);
  });

  it('should return true for the dev swapper address regardless of case', () => {
    // Create a mixed-case version of the dev address
    const mixedCaseAddress = UNIMIND_DEV_SWAPPER_ADDRESS.toUpperCase();
    expect(unimindAddressFilter(mixedCaseAddress)).toBe(true);
  });

  it(`should sample approximately ${UNIMIND_SAMPLE_PERCENT}% of addresses`, () => {
    const sampleSize = 10000;
    const addresses = Array.from({ length: sampleSize }, () => {
      // Generate a random Ethereum address (40 hex chars with 0x prefix)
      let addr = '0x';
      for (let i = 0; i < 40; i++) {
        addr += '0123456789abcdef'[Math.floor(Math.random() * 16)];
      }
      return addr;
    });

    // Count how many addresses pass the filter
    const passedCount = addresses.filter(addr => 
      unimindAddressFilter(addr)
    ).length;

    // Check that the percentage is approximately UNIMIND_SAMPLE_PERCENT%
    const percentage = (passedCount / sampleSize) * 100;
    expect(percentage).toBeGreaterThanOrEqual(UNIMIND_SAMPLE_PERCENT - 1);
    expect(percentage).toBeLessThanOrEqual(UNIMIND_SAMPLE_PERCENT + 1);
  });
});
import Logger from 'bunyan';
import { getStatistics } from '../../../lib/crons/unimind-algorithm';
import { DutchV3OrderEntity } from '../../../lib/entities';
import { ORDER_STATUS } from '../../../lib/entities/Order';
import { mock } from 'jest-mock-extended';
import { UNIMIND_UPDATE_THRESHOLD } from '../../../lib/util/constants';
import { PriceImpactStrategy } from '../../../lib/unimind/priceImpactStrategy';

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
    const strategy = new PriceImpactStrategy()
    it('should return the same parameters if the statistics are empty', () => {
      const previousParameters = { intrinsicValues: JSON.stringify({ pi: 0.5, tau: 0.5 }), pair: '0x000-0x111-123', count: 25 };
      const statistics = { waitTimes: [], fillStatuses: [], priceImpacts: [] };
      const result = strategy.unimindAlgorithm(statistics, previousParameters, log);
      expect(result).toEqual(JSON.parse(previousParameters.intrinsicValues));
    });
    it('should treat negative wait times as 0', () => {
      const previousParameters = { intrinsicValues: JSON.stringify({ pi: 0.5, tau: 0.5 }), pair: '0x000-0x111-123', count: 25 };
      const statistics = { waitTimes: [-1, 1, 2], fillStatuses: [1, 1, 1], priceImpacts: [0.01, 0.02, 0.03] };
      strategy.unimindAlgorithm(statistics, previousParameters, log);
      expect(statistics.waitTimes).toEqual([0, 1, 2]);
    });
    // TODO: Get test case to confirm
    /*
    it('should treat undefined wait times as auction duration (32) for average calculation', () => {
      const previousParameters = { intrinsicValues: JSON.stringify({ pi: 5, tau: 5 }), pair: '0x000-0x111-123', count: 25 };
      
      // Four defined wait times (all value 2) and one undefined wait time
      const statistics = { 
        waitTimes: [2, 2, 2, 2, undefined], 
        fillStatuses: [1, 1, 1, 1, 0], 
        priceImpacts: [0.01, 0.01, 0.01, 0.01, 0.02] 
      };
      
      const result = unimindAlgorithm(statistics, previousParameters, log);
      
      // Expected average: (2 + 2 + 2 + 2 + 32) / 5 = 40 / 5 = 8
      // With objective_wait_time = 2, wait_time_proportion = (2 - 8) / 2 = -3
      // With learning_rate = 2, pi update = 5 + (2 * -3) = 5 - 6 = -1
      expect(result.pi).toBeCloseTo(-1);
    });
    */
    it('small price impact strategy test', () => {
      const intrinsicValues = { intrinsicValues: JSON.stringify({lambda1: 0, lambda2: 8, Sigma: -9.210340371976182}), count: UNIMIND_UPDATE_THRESHOLD, pair: '0x000-0x111-123',  };
      const statistics = {
        priceImpacts: [0.337679, 0.656096, 0.722515, 0.586959, 0.618894, 0.691221, 0.339553, 0.075393, 0.455130, 0.371522],
        waitTimes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        fillStatuses: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
      }
      const result = strategy.unimindAlgorithm(statistics, intrinsicValues, log);
      // Test that they match to 5 decimal places
      expect(result.lambda1).toBeCloseTo(-0.8926286443665061, 5)
      expect(result.lambda2).toBeCloseTo(8.455536567148847, 5)
      expect(result.Sigma).toBeCloseTo(-10.131374409173803, 5)
    });
    
    it('price impact strategy test', () => {
      const priceImpacts = [0.71326195, 0.37776453, 0.65712047, 0.36153418, 0.44643393, 0.65690826, 0.47046204, 0.60366931, 0.5534904, 0.53127909, 0.54423512, 0.6519417, 0.62022089, 0.28424546, 0.49078837, 0.60291282, 0.31713279, 0.31788921, 0.70893846, 0.56324037, 0.53515316, 0.3600114, 0.69551742, 0.5028837, 0.06034174, 0.42604586, 0.51818982, 0.40301666, 0.67997543, 0.54954659, 0.63586809, 0.62746431, 0.44801485, 0.6205618, 0.70626297, 0.56774624, 0.37786426, 0.61479227, 0.42824314, 0.61774944, 0.70264211, 0.69505023, 0.45516844, 0.64302736, 0.23470843, 0.2429946, 0.39499266, 0.44837317, 0.59333055, 0.35663519, 0.65081785, 0.7032589, 0.2596255, 0.41386369, 0.21869225, 0.64201201, 0.7104847, 0.71655709, 0.32122751, 0.43039179, 0.65179817, 0.06391489, 0.66003474, 0.02740532, 0.59078206, 0.51044364, 0.7225811, 0.49290612, 0.11821516, 0.63689742]
      const fillStatuses = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
      const waitTimes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, undefined, undefined, undefined, undefined, undefined, 0, 0, 0, 0, 0, 0, 0, 8, 0, 6, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 3, 0, 2, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0];
      const intrinsicValues = { intrinsicValues: JSON.stringify({lambda1: 0, lambda2: 8, Sigma: -9.210340371976182}), count: UNIMIND_UPDATE_THRESHOLD, pair: '0x000-0x111-123',  };
      const statistics = {
        priceImpacts,
        waitTimes,
        fillStatuses
      }
      const result = strategy.unimindAlgorithm(statistics, intrinsicValues, log);
      expect(result.lambda1).toBeCloseTo(-0.7343412540547882, 5)
      expect(result.lambda2).toBeCloseTo(8.413365316358917, 5)
      expect(result.Sigma).toBeCloseTo(-8.486670771320908, 5)
    });
  });
});

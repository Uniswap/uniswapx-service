import Logger from 'bunyan';
import { getStatistics } from '../../../lib/crons/unimind-algorithm';
import { unimindAlgorithm } from '../../../lib/util/unimind';
import { DutchV3OrderEntity } from '../../../lib/entities';
import { ORDER_STATUS } from '../../../lib/entities/Order';
import { mock } from 'jest-mock-extended';
import { UNIMIND_UPDATE_THRESHOLD } from '../../../lib/util/constants';

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
      const previousParameters = { intrinsicValues: JSON.stringify({ pi: 0.5, tau: 0.5 }), pair: '0x000-0x111-123', count: 25 };
      const statistics = { waitTimes: [], fillStatuses: [], priceImpacts: [] };
      const result = unimindAlgorithm(statistics, previousParameters, log);
      expect(result).toEqual(JSON.parse(previousParameters.intrinsicValues));
    });
    it('should treat negative wait times as 0', () => {
      const previousParameters = { intrinsicValues: JSON.stringify({ pi: 0.5, tau: 0.5 }), pair: '0x000-0x111-123', count: 25 };
      const statistics = { waitTimes: [-1, 1, 2], fillStatuses: [1, 1, 1], priceImpacts: [0.01, 0.02, 0.03] };
      unimindAlgorithm(statistics, previousParameters, log);
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
  });
  
  it('price impact strategy test', () => {
    const intrinsicValues = { intrinsicValues: JSON.stringify({lambda1: 0, lambda2: 8, Sigma: -9.210340371976182}), count: UNIMIND_UPDATE_THRESHOLD, pair: '0x000-0x111-123',  };
    const statistics = {
      priceImpacts: [0.713262, 0.377765, 0.657120, 0.361534, 0.446434, 0.656908, 0.470462, 0.603669, 0.553490, 0.531279, 0.544235, 0.651942, 0.620221, 0.284245, 0.490788, 0.602913, 0.317133, 0.317889, 0.708938, 0.563240, 0.535153, 0.360011, 0.695517, 0.502884, 0.060342, 0.426046, 0.518190, 0.403017, 0.679975, 0.549547, 0.635868, 0.627464, 0.448015, 0.620562, 0.706263, 0.567746, 0.377864, 0.614792, 0.428243, 0.617749, 0.702642, 0.695050, 0.455168, 0.643027, 0.234708, 0.242995, 0.394993, 0.448373, 0.593331, 0.356635, 0.650818, 0.703259, 0.259625, 0.413864, 0.218692, 0.642012, 0.710485, 0.716557, 0.321228, 0.430392, 0.651798, 0.063915, 0.660035, 0.027405, 0.590782, 0.510444, 0.722581, 0.492906, 0.118215, 0.636897],
      waitTimes: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, undefined, undefined, undefined, undefined, undefined, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 8.0, 0.0, 6.0, 0.0, 0.0, 0.0, 0.0, 0.0, 5.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 5.0, 3.0, 0.0, 2.0, 0.0, 2.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.0, 0.0],
      fillStatuses: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    }
    const result = unimindAlgorithm(statistics, intrinsicValues, log);
    expect(result.lambda1).toEqual(-2.5599464604107958)
    expect(result.lambda2).toEqual(9.337889150589335)
    expect(result.Sigma).toEqual(-9.868221827117335)
  });
});

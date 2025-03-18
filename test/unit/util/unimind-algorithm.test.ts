import { getStatistics } from '../../../lib/crons/unimind-algorithm';
import { DutchV3OrderEntity } from '../../../lib/entities';
import { ORDER_STATUS } from '../../../lib/entities/Order';

describe('unimind-algorithm', () => {
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

      const result = getStatistics(mockOrders);

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

      const result = getStatistics(mockOrders);

      expect(result.waitTimes).toEqual([]);
      expect(result.fillStatuses).toEqual([]);
      expect(result.priceImpacts).toEqual([]);
    });

    it('should handle empty orders array', () => {
      const mockOrders: DutchV3OrderEntity[] = [];

      const result = getStatistics(mockOrders);

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

      const result = getStatistics(mockOrders);

      // Only the second order should remain
      expect(result.waitTimes).toEqual([20]);
      expect(result.fillStatuses).toEqual([1]);
      expect(result.priceImpacts).toEqual([0.02]);
    });
  });
});

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
        // undefined waitTime (missing fillBlock)
        {
          fillBlock: undefined,
          cosignerData: { decayStartBlock: 80 },
          orderStatus: ORDER_STATUS.FILLED,
          priceImpact: 0.02
        },
        // undefined priceImpact
        {
          fillBlock: 120,
          cosignerData: { decayStartBlock: 100 },
          orderStatus: ORDER_STATUS.FILLED,
          priceImpact: undefined
        },
        // All values defined
        {
          fillBlock: undefined,
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
      // - Index 1: undefined waitTime (should be filtered out)
      // - Index 2: undefined priceImpact (should be filtered out)
      // - Index 3: undefined waitTime due to EXPIRED status (should be filtered out)
      // - Index 4: All defined
      
      // Only indices 0 and 4 should remain
      expect(result.waitTime).toEqual([10, 20]);
      expect(result.fillStatus).toEqual([1, 1]);
      expect(result.priceImpact).toEqual([0.01, 0.05]);
      expect(result.waitTime.length).toBe(2);
      expect(result.fillStatus.length).toBe(2);
      expect(result.priceImpact.length).toBe(2);
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

      expect(result.waitTime).toEqual([]);
      expect(result.fillStatus).toEqual([]);
      expect(result.priceImpact).toEqual([]);
    });

    it('should handle empty orders array', () => {
      const mockOrders: DutchV3OrderEntity[] = [];

      const result = getStatistics(mockOrders);

      expect(result.waitTime).toEqual([]);
      expect(result.fillStatus).toEqual([]);
      expect(result.priceImpact).toEqual([]);
    });

    it('should handle missing cosignerData', () => {
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
      expect(result.waitTime).toEqual([20]);
      expect(result.fillStatus).toEqual([1]);
      expect(result.priceImpact).toEqual([0.02]);
    });
  });
});

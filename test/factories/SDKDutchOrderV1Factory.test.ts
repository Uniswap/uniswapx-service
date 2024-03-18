import { SDKDutchOrderFactory } from './SDKDutchOrderV1Factory'

describe('SDKDutchOrderV1Factory', () => {
  describe('Dutch Order', () => {
    it('smoke test - builds a default Dutch Order', () => {
      const o = SDKDutchOrderFactory.buildDutchOrder().toJSON()
      console.log(JSON.stringify(o))
      expect(SDKDutchOrderFactory.buildDutchOrder(1)).toBeDefined()
    })

    it('smoke test - accepts multiple outputs', () => {
      expect(
        SDKDutchOrderFactory.buildDutchOrder(1, {
          outputs: [
            {
              startAmount: '20',
              endAmount: '10',
              token: '0xabc',
              recipient: '0def',
            },
            {
              startAmount: '40',
              endAmount: '30',
              token: '0xghi',
              recipient: '0jkl',
            },
          ],
        })
      ).toBeDefined()
    })
  })

  describe('Limit Order', () => {
    it('smoke test - builds a default Limit order', () => {
      expect(SDKDutchOrderFactory.buildLimitOrder(1)).toBeDefined()
    })

    it('smoke test - accepts multiple outputs are provided', () => {
      expect(
        SDKDutchOrderFactory.buildLimitOrder(1, {
          outputs: [
            {
              startAmount: '10',
              endAmount: '10',
              token: '0xabc',
              recipient: '0def',
            },
            {
              startAmount: '20',
              endAmount: '20',
              token: '0xghi',
              recipient: '0jkl',
            },
          ],
        })
      ).toBeDefined()
    })

    it('throws if an override output has mismatched start and end amounts', () => {
      expect(() =>
        SDKDutchOrderFactory.buildLimitOrder(1, {
          outputs: [
            {
              startAmount: '10',
              endAmount: '20',
              token: '0xabc',
              recipient: '0def',
            },
          ],
        })
      ).toThrow('Limit order with output overrides must have matching startAmount + endAmount')
    })
  })
})

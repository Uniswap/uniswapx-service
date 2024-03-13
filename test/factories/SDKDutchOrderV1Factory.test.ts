import { SDKDutchOrderFactory } from './SDKDutchOrderV1Factory'

describe('SDKDutchOrderV1Factory', () => {
  describe('Dutch Order', () => {
    it('builds a default Dutch Order', () => {
      expect(SDKDutchOrderFactory.buildDutchOrder(1)).toBeDefined()
    })

    it('throws if multiple outputs are provided', () => {
      expect(() =>
        SDKDutchOrderFactory.buildLimitOrder(1, {
          outputs: [
            {
              startAmount: '10',
              endAmount: '20',
              token: '0xabc',
              recipient: '0def',
            },
            {
              startAmount: '10',
              endAmount: '20',
              token: '0xabc',
              recipient: '0def',
            },
          ],
        })
      ).toThrow(
        "SDKDutchOrderFactory currently only supports one output override. Enhance the 'buildDutchOrder' to support multiple."
      )
    })
  })

  describe('Limit Order', () => {
    it('builds a default Limit order', () => {
      expect(SDKDutchOrderFactory.buildLimitOrder(1)).toBeDefined()
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

    it('throws if multiple outputs are provided', () => {
      expect(() =>
        SDKDutchOrderFactory.buildLimitOrder(1, {
          outputs: [
            {
              startAmount: '10',
              endAmount: '20',
              token: '0xabc',
              recipient: '0def',
            },
            {
              startAmount: '10',
              endAmount: '20',
              token: '0xabc',
              recipient: '0def',
            },
          ],
        })
      ).toThrow(
        "SDKDutchOrderFactory currently only supports one output override. Enhance the 'buildDutchOrder' to support multiple."
      )
    })
  })
})

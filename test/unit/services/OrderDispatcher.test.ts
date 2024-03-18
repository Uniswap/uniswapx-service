import { Logger } from '@aws-lambda-powertools/logger'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS } from '../../../lib/entities'
import { NoHandlerConfiguredError } from '../../../lib/errors/NoHandlerConfiguredError'
import { DutchV1Order } from '../../../lib/models/DutchV1Order'
import { LimitOrder } from '../../../lib/models/LimitOrder'
import { OrderDispatcher } from '../../../lib/services/OrderDispatcher'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SIGNATURE } from '../fixtures'

describe('OrderDispatcher', () => {
  const logger = mock<Logger>()
  describe('createOrder', () => {
    it('invokes the UniswapXOrderService for DutchV1 orders', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      uniswapXServiceMock.createOrder.mockResolvedValueOnce('orderHash')
      const dispatcher = new OrderDispatcher(uniswapXServiceMock, logger)
      const result = await dispatcher.createOrder(
        DutchV1Order.fromSDK(ChainId.MAINNET, SIGNATURE, SDKDutchOrderFactory.buildDutchOrder(), ORDER_STATUS.OPEN)
      )
      expect(result).toEqual('orderHash')
    })

    it('invokes the UniswapXOrderService for Limit orders', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      uniswapXServiceMock.createOrder.mockResolvedValueOnce('orderHash')
      const dispatcher = new OrderDispatcher(uniswapXServiceMock, logger)
      const result = await dispatcher.createOrder(
        LimitOrder.fromSDK(ChainId.MAINNET, SIGNATURE, SDKDutchOrderFactory.buildLimitOrder(), ORDER_STATUS.OPEN)
      )
      expect(result).toEqual('orderHash')
    })

    it('throws for unhandled order types', async () => {
      expect.assertions(1)
      const dispatcher = new OrderDispatcher(mock<UniswapXOrderService>(), logger)
      try {
        await dispatcher.createOrder({
          orderType: 'foo',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(err).toEqual(new NoHandlerConfiguredError('foo' as any))
      }
    })
  })
})

import { Logger } from '@aws-lambda-powertools/logger'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS } from '../../../lib/entities'
import { NoHandlerConfiguredError } from '../../../lib/errors/NoHandlerConfiguredError'
import { DutchV2Order, RelayOrder } from '../../../lib/models'
import { DutchV1Order } from '../../../lib/models/DutchV1Order'
import { OrderDispatcher } from '../../../lib/services/OrderDispatcher'
import { RelayOrderService } from '../../../lib/services/RelayOrderService'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { SDKRelayOrderFactory } from '../../factories/SDKRelayOrderFactory'
import { QueryParamsBuilder } from '../builders/QueryParamsBuilder'
import { SIGNATURE } from '../fixtures'

describe('OrderDispatcher', () => {
  const logger = mock<Logger>()
  describe('createOrder', () => {
    it('invokes the UniswapXOrderService for DutchV1 orders', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      uniswapXServiceMock.createOrder.mockResolvedValueOnce('orderHash')
      const dispatcher = new OrderDispatcher(uniswapXServiceMock, mock<RelayOrderService>(), logger)
      const result = await dispatcher.createOrder(
        new DutchV1Order(SDKDutchOrderFactory.buildDutchOrder(), SIGNATURE, ChainId.MAINNET)
      )
      expect(result).toEqual('orderHash')
    })

    it('invokes the UniswapXOrderService for Limit orders', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      uniswapXServiceMock.createOrder.mockResolvedValueOnce('orderHash')
      const dispatcher = new OrderDispatcher(uniswapXServiceMock, mock<RelayOrderService>(), logger)
      const result = await dispatcher.createOrder(
        new DutchV1Order(SDKDutchOrderFactory.buildDutchOrder(), SIGNATURE, ChainId.MAINNET)
      )
      expect(result).toEqual('orderHash')
    })

    it('throws for unhandled order types', async () => {
      expect.assertions(1)
      const dispatcher = new OrderDispatcher(mock<UniswapXOrderService>(), mock<RelayOrderService>(), logger)
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

  describe('getOrders', () => {
    test('with orderType Dutch, calls uniswapXService', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      const mockOrder = new DutchV1Order(SDKDutchOrderFactory.buildDutchOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
      uniswapXServiceMock.getDutchOrders.mockResolvedValue({
        orders: [mockOrder],
        cursor: '',
      })
      const dispatcher = new OrderDispatcher(uniswapXServiceMock, mock<RelayOrderService>(), logger)

      const response = await dispatcher.getOrder(OrderType.Dutch, {
        params: new QueryParamsBuilder().withChainId(1).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(uniswapXServiceMock.getDutchOrders).toHaveBeenCalled()
      expect(response.orders[0]).toEqual(mockOrder)
    })

    test('with orderType Dutch_V2, calls uniswapXService', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      const mockOrder = new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), '', 1).toEntity(ORDER_STATUS.OPEN)

      uniswapXServiceMock.getDutchV2AndDutchOrders.mockResolvedValue({
        orders: [mockOrder],
        cursor: '',
      })

      const dispatcher = new OrderDispatcher(uniswapXServiceMock, mock<RelayOrderService>(), logger)

      const response = await dispatcher.getOrder(OrderType.Dutch_V2, {
        params: new QueryParamsBuilder().withChainId(1).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(uniswapXServiceMock.getDutchV2AndDutchOrders).toHaveBeenCalled()
      expect(response.orders[0]).toEqual(mockOrder)
    })

    test('with orderType Limit, calls uniswapXService', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      const mockOrder = new DutchV1Order(SDKDutchOrderFactory.buildLimitOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)

      uniswapXServiceMock.getLimitOrders.mockResolvedValue({
        orders: [mockOrder],
        cursor: '',
      })

      const dispatcher = new OrderDispatcher(uniswapXServiceMock, mock<RelayOrderService>(), logger)

      const response = await dispatcher.getOrder(OrderType.Limit, {
        params: new QueryParamsBuilder().withChainId(1).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(uniswapXServiceMock.getLimitOrders).toHaveBeenCalled()
      expect(response.orders[0]).toEqual(mockOrder)
    })

    test('with orderType Relay, calls relayOrderService', async () => {
      const relayServiceMock = mock<RelayOrderService>()
      const mockOrder = new RelayOrder(SDKRelayOrderFactory.buildRelayOrder(), '', 1).toGetResponse()

      relayServiceMock.getOrders.mockResolvedValue({
        orders: [mockOrder],
        cursor: '',
      })

      const dispatcher = new OrderDispatcher(mock<UniswapXOrderService>(), relayServiceMock, logger)

      const response = await dispatcher.getOrder(OrderType.Relay, {
        params: new QueryParamsBuilder().withChainId(1).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(relayServiceMock.getOrders).toHaveBeenCalled()
      expect(response.orders[0]).toEqual(mockOrder)
    })
  })
})

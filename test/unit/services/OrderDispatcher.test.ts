import { default as Logger } from 'bunyan'
import { mock } from 'jest-mock-extended'
import { ORDER_STATUS } from '../../../lib/entities'
import { NoHandlerConfiguredError } from '../../../lib/errors/NoHandlerConfiguredError'
import { GetOrderTypeQueryParamEnum } from '../../../lib/handlers/get-orders/schema/GetOrderTypeQueryParamEnum'
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
import { DutchV3Order } from '../../../lib/models/DutchV3Order'
import { SDKDutchOrderV3Factory } from '../../factories/SDKDutchOrderV3Factory'

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

      const response = await dispatcher.getOrder(GetOrderTypeQueryParamEnum.Dutch, {
        params: new QueryParamsBuilder().withChainId(1).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(uniswapXServiceMock.getDutchOrders).toHaveBeenCalled()
      expect(response.orders[0]).toEqual(mockOrder)
    })

    test('with orderType Dutch_V2, calls uniswapXService', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      const dutchV2Order = new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), '', 1)

      uniswapXServiceMock.getDutchV2Orders.mockResolvedValue({
        orders: [dutchV2Order.toGetResponse()],
        cursor: '',
      })

      const dispatcher = new OrderDispatcher(uniswapXServiceMock, mock<RelayOrderService>(), logger)

      const response = await dispatcher.getOrder(GetOrderTypeQueryParamEnum.Dutch_V2, {
        params: new QueryParamsBuilder().withChainId(1).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(uniswapXServiceMock.getDutchV2Orders).toHaveBeenCalled()
      expect(response.orders[0]).toEqual(dutchV2Order.toGetResponse())
    })

    test('with orderType Dutch_V3, calls uniswapXService', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      const dutchV3Order = new DutchV3Order(SDKDutchOrderV3Factory.buildDutchV3Order(), '', ChainId.ARBITRUM_ONE)

      uniswapXServiceMock.getDutchV3Orders.mockResolvedValue({
        orders: [dutchV3Order.toGetResponse()],
        cursor: '',
      })

      const dispatcher = new OrderDispatcher(uniswapXServiceMock, mock<RelayOrderService>(), logger)

      const response = await dispatcher.getOrder(GetOrderTypeQueryParamEnum.Dutch_V3, {
        params: new QueryParamsBuilder().withChainId(42161).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(uniswapXServiceMock.getDutchV3Orders).toHaveBeenCalled()
      expect(response.orders[0]).toEqual(dutchV3Order.toGetResponse())
    })

    test('with orderType [Dutch,Dutch_V2], calls uniswapXService', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      const mockOrder = new DutchV1Order(SDKDutchOrderFactory.buildDutchOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)
      const mockV2Order = new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), '', 1).toEntity(
        ORDER_STATUS.OPEN
      )

      uniswapXServiceMock.getDutchV2AndDutchOrders.mockResolvedValue({
        orders: [mockOrder, mockV2Order],
        cursor: '',
      })

      const dispatcher = new OrderDispatcher(uniswapXServiceMock, mock<RelayOrderService>(), logger)

      const response = await dispatcher.getOrder(GetOrderTypeQueryParamEnum.Dutch_V1_V2, {
        params: new QueryParamsBuilder().withChainId(1).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(uniswapXServiceMock.getDutchV2AndDutchOrders).toHaveBeenCalled()
      expect(response.orders).toEqual([mockOrder, mockV2Order])
    })

    test('with orderType Limit, calls uniswapXService', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      const mockOrder = new DutchV1Order(SDKDutchOrderFactory.buildLimitOrder(), '', 1).toEntity(ORDER_STATUS.OPEN)

      uniswapXServiceMock.getLimitOrders.mockResolvedValue({
        orders: [mockOrder],
        cursor: '',
      })

      const dispatcher = new OrderDispatcher(uniswapXServiceMock, mock<RelayOrderService>(), logger)

      const response = await dispatcher.getOrder(GetOrderTypeQueryParamEnum.Limit, {
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

      const response = await dispatcher.getOrder(GetOrderTypeQueryParamEnum.Relay, {
        params: new QueryParamsBuilder().withChainId(1).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(relayServiceMock.getOrders).toHaveBeenCalled()
      expect(response.orders[0]).toEqual(mockOrder)
    })
  })
})

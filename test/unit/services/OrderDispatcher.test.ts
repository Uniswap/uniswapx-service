import { mock } from 'jest-mock-extended'
import { GetOrderTypeQueryParamEnum } from '../../../lib/handlers/get-orders/schema/GetOrderTypeQueryParamEnum'
import { DutchV2Order } from '../../../lib/models/DutchV2Order'
import { OrderDispatcher } from '../../../lib/services/OrderDispatcher'
import { UniswapXOrderService } from '../../../lib/services/UniswapXOrderService'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { QueryParamsBuilder } from '../builders/QueryParamsBuilder'
import { DutchV3Order } from '../../../lib/models/DutchV3Order'
import { SDKDutchOrderV3Factory } from '../../factories/SDKDutchOrderV3Factory'
import { dutchOrderEntity } from '../../factories/order-entities'
import { toOrderEntity } from '../../../lib/core/orders/storedRow'

describe('OrderDispatcher', () => {
  describe('getOrders', () => {
    test('with orderType Dutch, calls uniswapXService', async () => {
      const uniswapXServiceMock = mock<UniswapXOrderService>()
      const mockOrder = dutchOrderEntity(SDKDutchOrderFactory.buildDutchOrder(), '')
      uniswapXServiceMock.getDutchOrders.mockResolvedValue({
        orders: [mockOrder],
        cursor: '',
      })
      const dispatcher = new OrderDispatcher(uniswapXServiceMock)

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

      const dispatcher = new OrderDispatcher(uniswapXServiceMock)

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

      const dispatcher = new OrderDispatcher(uniswapXServiceMock)

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
      const mockOrder = dutchOrderEntity(SDKDutchOrderFactory.buildDutchOrder(), '')
      const mockV2Order = toOrderEntity(new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), '', 1))

      uniswapXServiceMock.getDutchV2AndDutchOrders.mockResolvedValue({
        orders: [mockOrder, mockV2Order],
        cursor: '',
      })

      const dispatcher = new OrderDispatcher(uniswapXServiceMock)

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
      const mockOrder = dutchOrderEntity(SDKDutchOrderFactory.buildLimitOrder(), '')

      uniswapXServiceMock.getLimitOrders.mockResolvedValue({
        orders: [mockOrder],
        cursor: '',
      })

      const dispatcher = new OrderDispatcher(uniswapXServiceMock)

      const response = await dispatcher.getOrder(GetOrderTypeQueryParamEnum.Limit, {
        params: new QueryParamsBuilder().withChainId(1).build(),
        limit: 50,
        cursor: undefined,
      })

      expect(uniswapXServiceMock.getLimitOrders).toHaveBeenCalled()
      expect(response.orders[0]).toEqual(mockOrder)
    })
  })
})

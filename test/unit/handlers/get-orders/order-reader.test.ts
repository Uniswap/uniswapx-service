import { OrderType } from '@uniswap/uniswapx-sdk'
import { toOrderEntity } from '../../../../lib/core/orders/storedRow'
import { UniswapXOrderEntity } from '../../../../lib/entities'
import { MAX_QUERY_RETRY, OrderReader, SINGLE_PAGE } from '../../../../lib/handlers/get-orders/order-reader'
import { GetOrdersQueryParams } from '../../../../lib/handlers/get-orders/schema'
import { GetOrderTypeQueryParamEnum } from '../../../../lib/handlers/get-orders/schema/GetOrderTypeQueryParamEnum'
import { toPriorityResponse, toV2Response, toV3Response } from '../../../../lib/handlers/get-orders/toResponse'
import { DutchV2Order } from '../../../../lib/models/DutchV2Order'
import { DutchV3Order } from '../../../../lib/models/DutchV3Order'
import { PriorityOrder } from '../../../../lib/models/PriorityOrder'
import { QueryResult } from '../../../../lib/repositories/base'
import { ChainId } from '../../../../lib/util/chain'
import { DUTCH_LIMIT } from '../../../../lib/util/order'
import { dutchOrderEntity } from '../../../factories/order-entities'
import { SDKDutchOrderFactory } from '../../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from '../../../factories/SDKDutchOrderV3Factory'
import { SDKPriorityOrderFactory } from '../../../factories/SDKPriorityOrderFactory'
import { QueryParamsBuilder } from '../../builders/QueryParamsBuilder'

type Call = { limit: number; params: GetOrdersQueryParams; types: string[]; cursor: string | undefined }

// Serves its pages in order and repeats the last one.
class PagedRepository {
  public readonly calls: Call[] = []

  constructor(private readonly pages: QueryResult<UniswapXOrderEntity>[] = [{ orders: [] }]) {}

  async getOrdersFilteredByType(
    limit: number,
    params: GetOrdersQueryParams,
    types: string[],
    cursor: string | undefined
  ): Promise<QueryResult<UniswapXOrderEntity>> {
    this.calls.push({ limit, params, types, cursor })
    return this.pages[Math.min(this.calls.length - 1, this.pages.length - 1)]
  }
}

const v1Row = () => dutchOrderEntity(SDKDutchOrderFactory.buildDutchOrder(), '')
const limitRow = () => dutchOrderEntity(SDKDutchOrderFactory.buildLimitOrder(), '')
const v2Row = () => toOrderEntity(new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), '', 1))
const v3Row = () =>
  toOrderEntity(
    new DutchV3Order(SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE), '', ChainId.ARBITRUM_ONE)
  )
const priorityRow = () => toOrderEntity(new PriorityOrder(SDKPriorityOrderFactory.buildPriorityOrder(), '', 1))

type Case = {
  orderType: GetOrderTypeQueryParamEnum
  table: 'orders' | 'limitOrders'
  storedTypes: string[]
  rows: () => UniswapXOrderEntity[]
  toResponse: (row: UniswapXOrderEntity) => unknown
  fillsPage: boolean
}

const CASES: Case[] = [
  {
    orderType: GetOrderTypeQueryParamEnum.Dutch_V1_V2,
    table: 'orders',
    storedTypes: [OrderType.Dutch, DUTCH_LIMIT, OrderType.Dutch_V2],
    rows: () => [v1Row(), v2Row(), v1Row()],
    // V1 rows go out as stored, V2 rows as V2 responses.
    toResponse: (row) => (row.type === OrderType.Dutch_V2 ? toV2Response(row) : row),
    fillsPage: false,
  },
  {
    orderType: GetOrderTypeQueryParamEnum.Dutch_V2,
    table: 'orders',
    storedTypes: [OrderType.Dutch_V2],
    rows: () => [v2Row(), v2Row(), v2Row()],
    toResponse: toV2Response,
    fillsPage: true,
  },
  {
    orderType: GetOrderTypeQueryParamEnum.Dutch_V3,
    table: 'orders',
    storedTypes: [OrderType.Dutch_V3],
    rows: () => [v3Row(), v3Row(), v3Row()],
    toResponse: toV3Response,
    fillsPage: true,
  },
  {
    orderType: GetOrderTypeQueryParamEnum.Dutch,
    table: 'orders',
    storedTypes: [OrderType.Dutch, DUTCH_LIMIT],
    rows: () => [v1Row(), v1Row(), v1Row()],
    toResponse: (row) => row,
    fillsPage: true,
  },
  {
    orderType: GetOrderTypeQueryParamEnum.Priority,
    table: 'orders',
    storedTypes: [OrderType.Priority],
    rows: () => [priorityRow(), priorityRow(), priorityRow()],
    toResponse: toPriorityResponse,
    fillsPage: true,
  },
  {
    // Limit orders are stored as Dutch (DAT-313).
    orderType: GetOrderTypeQueryParamEnum.Limit,
    table: 'limitOrders',
    storedTypes: [OrderType.Dutch],
    rows: () => [limitRow(), limitRow(), limitRow()],
    toResponse: (row) => row,
    fillsPage: false,
  },
]

const PARAMS = new QueryParamsBuilder().withDesc().withSort().withSortKey().withChainId().build()

function readerFor(table: Case['table'], pages: QueryResult<UniswapXOrderEntity>[], maxQueryRetry?: number) {
  const repository = new PagedRepository(pages)
  const other = new PagedRepository()
  const reader =
    table === 'orders'
      ? new OrderReader(repository, other, maxQueryRetry)
      : new OrderReader(other, repository, maxQueryRetry)
  return { reader, repository, other }
}

describe('OrderReader', () => {
  test('has a case for every orderType', () => {
    expect(CASES.map((c) => c.orderType).sort()).toEqual(Object.values(GetOrderTypeQueryParamEnum).sort())
  })

  describe.each(CASES)('orderType $orderType', ({ orderType, table, storedTypes, rows, toResponse, fillsPage }) => {
    test(`reads the ${table} table for ${storedTypes.join(', ')} and maps each row`, async () => {
      const stored = rows()
      const { reader, repository, other } = readerFor(table, [{ orders: stored, cursor: 'next' }])

      const response = await reader.getOrders(orderType, { params: PARAMS, limit: 3, cursor: 'start' })

      expect(response).toEqual({ orders: stored.map(toResponse), cursor: 'next' })
      expect(repository.calls).toEqual([{ limit: 3, params: PARAMS, types: storedTypes, cursor: 'start' }])
      expect(other.calls).toEqual([])
    })

    if (fillsPage) {
      test('follows the cursor past a short page', async () => {
        const stored = rows()
        const { reader, repository } = readerFor(table, [{ orders: [], cursor: 'cursor' }, { orders: stored }])

        const response = await reader.getOrders(orderType, { params: PARAMS, limit: 50, cursor: undefined })

        expect(response).toEqual({ orders: stored.map(toResponse), cursor: undefined })
        expect(repository.calls.map((c) => c.cursor)).toEqual([undefined, 'cursor'])
        expect(repository.calls.map((c) => c.types)).toEqual([storedTypes, storedTypes])
      })

      test('returns every row of the page that fills the limit, even past it', async () => {
        const stored = rows()
        const { reader } = readerFor(table, [{ orders: [], cursor: 'cursor' }, { orders: stored }])

        const response = await reader.getOrders(orderType, { params: PARAMS, limit: 1, cursor: undefined })

        expect(response.orders).toHaveLength(stored.length)
      })

      test('stops after MAX_QUERY_RETRY follow-ups by default and returns the last cursor', async () => {
        const { reader, repository } = readerFor(table, [{ orders: [], cursor: 'cursor' }])

        const response = await reader.getOrders(orderType, { params: PARAMS, limit: 50, cursor: undefined })

        expect(response).toEqual({ orders: [], cursor: 'cursor' })
        expect(repository.calls).toHaveLength(MAX_QUERY_RETRY + 1)
      })

      test('a SINGLE_PAGE reader never follows the cursor', async () => {
        const { reader, repository } = readerFor(table, [{ orders: [], cursor: 'cursor' }], SINGLE_PAGE)

        const response = await reader.getOrders(orderType, { params: PARAMS, limit: 50, cursor: undefined })

        expect(response).toEqual({ orders: [], cursor: 'cursor' })
        expect(repository.calls).toHaveLength(1)
      })
    } else {
      test('reads one page even when it is short and has a cursor', async () => {
        const { reader, repository } = readerFor(table, [{ orders: [], cursor: 'cursor' }])

        const response = await reader.getOrders(orderType, { params: PARAMS, limit: 50, cursor: undefined })

        expect(response).toEqual({ orders: [], cursor: 'cursor' })
        expect(repository.calls).toHaveLength(1)
      })
    }
  })

  test('GET /limit-orders wiring: every orderType reads the limit-orders table', async () => {
    const limitOrders = new PagedRepository([{ orders: [v2Row()] }])
    const reader = new OrderReader(limitOrders, limitOrders)

    await reader.getOrders(GetOrderTypeQueryParamEnum.Dutch_V2, { params: PARAMS, limit: 50, cursor: undefined })
    await reader.getOrders(GetOrderTypeQueryParamEnum.Limit, { params: PARAMS, limit: 50, cursor: undefined })

    expect(limitOrders.calls.map((c) => c.types)).toEqual([[OrderType.Dutch_V2], [OrderType.Dutch]])
  })

  test('an orderType with no read plan throws', async () => {
    const reader = new OrderReader(new PagedRepository(), new PagedRepository())

    await expect(
      reader.getOrders('Unknown' as GetOrderTypeQueryParamEnum, { params: PARAMS, limit: 50, cursor: undefined })
    ).rejects.toThrow('Unsupported orderType: Unknown')
  })
})

import { OrderType } from '@uniswap/uniswapx-sdk'
import { UniswapXOrderEntity } from '../../entities'
import { BaseOrdersRepository, QueryResult } from '../../repositories/base'
import { DUTCH_LIMIT } from '../../util/order'
import { GetOrdersQueryParams } from './schema'
import { GetDutchV2OrderResponse } from './schema/GetDutchV2OrderResponse'
import { GetDutchV3OrderResponse } from './schema/GetDutchV3OrderResponse'
import { GetOrdersResponse } from './schema/GetOrdersResponse'
import { GetOrderTypeQueryParamEnum } from './schema/GetOrderTypeQueryParamEnum'
import { GetPriorityOrderResponse } from './schema/GetPriorityOrderResponse'
import { toPriorityResponse, toV2Response, toV3Response } from './toResponse'

export const MAX_QUERY_RETRY = 10
// For endpoints that serve exactly one page: never follow a cursor into further reads.
export const SINGLE_PAGE = 0

export type OrderResponse =
  | UniswapXOrderEntity
  | GetDutchV2OrderResponse
  | GetDutchV3OrderResponse
  | GetPriorityOrderResponse

type OrdersRepository = Pick<BaseOrdersRepository<UniswapXOrderEntity>, 'getOrdersFilteredByType'>

type ReadPlan = {
  table: 'orders' | 'limitOrders'
  // The stored `type` values the query keeps.
  storedTypes: string[]
  // Whether to follow the cursor to fill the limit, up to the reader's retry budget.
  fillsPage: boolean
  toResponse: (order: UniswapXOrderEntity) => OrderResponse
}

const asStored = (order: UniswapXOrderEntity): OrderResponse => order

// What each orderType reads, and from which table.
export const READ_PLANS: Record<GetOrderTypeQueryParamEnum, ReadPlan> = {
  [GetOrderTypeQueryParamEnum.Dutch_V1_V2]: {
    table: 'orders',
    storedTypes: [OrderType.Dutch, DUTCH_LIMIT, OrderType.Dutch_V2],
    fillsPage: false,
    toResponse: (order) => (order.type === OrderType.Dutch_V2 ? toV2Response(order) : order),
  },
  [GetOrderTypeQueryParamEnum.Dutch_V2]: {
    table: 'orders',
    storedTypes: [OrderType.Dutch_V2],
    fillsPage: true,
    toResponse: toV2Response,
  },
  [GetOrderTypeQueryParamEnum.Dutch_V3]: {
    table: 'orders',
    storedTypes: [OrderType.Dutch_V3],
    fillsPage: true,
    toResponse: toV3Response,
  },
  [GetOrderTypeQueryParamEnum.Dutch]: {
    table: 'orders',
    storedTypes: [OrderType.Dutch, DUTCH_LIMIT],
    fillsPage: true,
    toResponse: asStored,
  },
  [GetOrderTypeQueryParamEnum.Priority]: {
    table: 'orders',
    storedTypes: [OrderType.Priority],
    fillsPage: true,
    toResponse: toPriorityResponse,
  },
  // TODO: DAT-313: Fix order type for Limit Orders (they are stored as Dutch)
  [GetOrderTypeQueryParamEnum.Limit]: {
    table: 'limitOrders',
    storedTypes: [OrderType.Dutch],
    fillsPage: false,
    toResponse: asStored,
  },
}

// GET reads filtered by orderType.
export class OrderReader {
  // GET /limit-orders: every orderType reads the limit-orders table, with the default retry budget.
  static forLimitOrders(limitOrdersRepository: OrdersRepository): OrderReader {
    return new OrderReader(limitOrdersRepository, limitOrdersRepository)
  }

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly limitOrdersRepository: OrdersRepository,
    // How many extra pages a filling read may follow. GET /orders passes SINGLE_PAGE: every
    // follow-up is an uncached read against the same hot partition, and the handler discards
    // the resulting cursor anyway.
    private readonly maxQueryRetry: number = MAX_QUERY_RETRY
  ) {}

  async getOrders(
    orderType: GetOrderTypeQueryParamEnum,
    { params, limit, cursor }: { params: GetOrdersQueryParams; limit: number; cursor: string | undefined }
  ): Promise<GetOrdersResponse<OrderResponse>> {
    const plan = READ_PLANS[orderType]
    if (!plan) {
      throw new Error(`Unsupported orderType: ${orderType}`)
    }
    const repository = plan.table === 'orders' ? this.ordersRepository : this.limitOrdersRepository
    const result = await this.fetchOrderPages(
      repository,
      limit,
      params,
      plan.storedTypes,
      cursor,
      plan.fillsPage ? this.maxQueryRetry : 0
    )
    return { orders: result.orders.map((order) => plan.toResponse(order)), cursor: result.cursor }
  }

  /**
   * orderType is a filter, not a key condition, so one page can match fewer rows than the
   * limit. Follow the cursor until the limit fills, the pages run out, or the retry budget
   * is spent -- a caller that still wants more follows the returned cursor.
   */
  private async fetchOrderPages(
    repository: OrdersRepository,
    limit: number,
    params: GetOrdersQueryParams,
    types: string[],
    cursor: string | undefined,
    maxRetry: number
  ): Promise<QueryResult<UniswapXOrderEntity>> {
    let queryResults = await repository.getOrdersFilteredByType(limit, params, types, cursor)
    const orders = [...queryResults.orders]

    let retryCount = 0
    while (orders.length < limit && queryResults.cursor && retryCount < maxRetry) {
      queryResults = await repository.getOrdersFilteredByType(limit, params, types, queryResults.cursor)
      orders.push(...queryResults.orders)
      retryCount++
    }

    return { orders, cursor: queryResults.cursor }
  }
}

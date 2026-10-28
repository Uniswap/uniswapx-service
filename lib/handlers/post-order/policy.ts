import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { UniswapXOrderEntity } from '../../entities'
import { BaseOrdersRepository } from '../../repositories/base'
import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { ONE_DAY_IN_SECONDS, ONE_YEAR_IN_SECONDS } from '../../util/constants'
import {
  DEFAULT_MAX_OPEN_LIMIT_ORDERS,
  DEFAULT_MAX_OPEN_ORDERS,
  HIGH_MAX_OPEN_ORDERS,
  HIGH_MAX_OPEN_ORDERS_SWAPPERS,
} from '../constants'
import { DUTCH_AUCTION_ORDER_ROUTE, LIMIT_ORDER_ROUTE, PostOrderRoute } from './routes'

// Everything the two post Lambdas do differently.
export type PostRoutePolicy = {
  // Also the name of the handler's bunyan logger.
  handlerName: string
  route: PostOrderRoute
  createRepository: (documentClient: DocumentClient) => BaseOrdersRepository<UniswapXOrderEntity>
  deadlineValidityPeriodSeconds: number
  skipDecayStartTimeValidation: boolean
  getMaxOpenOrders: (offerer: string) => number
  // Whether a posted order with an exclusive filler is pushed to that filler right away.
  notifyExclusiveFiller: boolean
}

export function getMaxOpenOrders(offerer: string): number {
  if (HIGH_MAX_OPEN_ORDERS_SWAPPERS.includes(offerer.toLowerCase())) {
    return HIGH_MAX_OPEN_ORDERS
  }

  return DEFAULT_MAX_OPEN_ORDERS
}

export function getMaxLimitOpenOrders(offerer: string): number {
  if (HIGH_MAX_OPEN_ORDERS_SWAPPERS.includes(offerer.toLowerCase())) {
    return HIGH_MAX_OPEN_ORDERS
  }

  return DEFAULT_MAX_OPEN_LIMIT_ORDERS
}

export const DUTCH_POST_POLICY: PostRoutePolicy = {
  handlerName: 'postOrdersHandler',
  route: DUTCH_AUCTION_ORDER_ROUTE,
  createRepository: DutchOrdersRepository.create,
  deadlineValidityPeriodSeconds: ONE_DAY_IN_SECONDS,
  skipDecayStartTimeValidation: false,
  getMaxOpenOrders,
  notifyExclusiveFiller: true,
}

export const LIMIT_POST_POLICY: PostRoutePolicy = {
  handlerName: 'postLimitOrdersHandler',
  route: LIMIT_ORDER_ROUTE,
  createRepository: LimitOrdersRepository.create,
  deadlineValidityPeriodSeconds: ONE_YEAR_IN_SECONDS,
  skipDecayStartTimeValidation: true,
  getMaxOpenOrders: getMaxLimitOpenOrders,
  notifyExclusiveFiller: false,
}

import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { GET_LIMIT_ORDERS_HANDLER_OPTIONS, GetOrdersHandler } from '../get-orders/handler'
import { OrderReader } from '../get-orders/order-reader'
import { createReadPathDocumentClient } from '../shared/dynamo'
import { getLimitOrdersQueryCache } from './query-cache'

// This Lambda only reads, so its repositories share the sub-second query cache. Write
// paths build them without it -- see query-cache.ts. Its DocumentClient fails fast on
// throttles -- see shared/dynamo.ts.
const repo = LimitOrdersRepository.create(createReadPathDocumentClient(), getLimitOrdersQueryCache)

const getLimitOrdersHandler = new GetOrdersHandler(
  'getLimitOrdersHandler',
  repo,
  // Every orderType reads the limit-orders table here.
  new OrderReader(repo, repo),
  GET_LIMIT_ORDERS_HANDLER_OPTIONS
)

module.exports = {
  getLimitOrdersHandler: getLimitOrdersHandler.handler,
}

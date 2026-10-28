import { GetOrdersHandler } from './handler'

import { DutchOrdersRepository } from '../../repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../repositories/limit-orders-repository'
import { createReadPathDocumentClient } from '../shared/dynamo'
import { OrderReader, SINGLE_PAGE } from './order-reader'
import { getOrdersQueryCache } from './query-cache'

// This Lambda only reads, so its repositories share the sub-second query cache. Write
// paths build them without it -- see query-cache.ts. Its DocumentClient fails fast on
// throttles -- see shared/dynamo.ts.
const repo = DutchOrdersRepository.create(createReadPathDocumentClient(), getOrdersQueryCache)
const limitRepo = LimitOrdersRepository.create(createReadPathDocumentClient(), getOrdersQueryCache)

const getOrdersHandler = new GetOrdersHandler('getOrdersHandler', repo, new OrderReader(repo, limitRepo, SINGLE_PAGE))

module.exports = {
  getOrdersHandler: getOrdersHandler.handler,
}

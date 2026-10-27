import { buildPostOrderLambda } from '../post-order/lambda'
import { LIMIT_POST_POLICY } from '../post-order/policy'

const postLimitOrderHandler = buildPostOrderLambda(LIMIT_POST_POLICY)

module.exports = {
  postLimitOrderHandler: postLimitOrderHandler.handler,
}

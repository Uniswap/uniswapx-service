import { buildPostOrderLambda } from './lambda'
import { DUTCH_POST_POLICY } from './policy'

const postOrderHandler = buildPostOrderLambda(DUTCH_POST_POLICY)

module.exports = {
  postOrderHandler: postOrderHandler.handler,
}

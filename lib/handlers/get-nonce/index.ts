import { GetNonceHandler } from './handler'
import { GetNonceInjector } from './injector'

const getNonceInjectorPromise = new GetNonceInjector('getNonceInjector').build()
const getNonceHandler = new GetNonceHandler('getNonceHandler', getNonceInjectorPromise)

module.exports = {
  getNonceHandler: getNonceHandler.handler,
}

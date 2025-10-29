import { GetUnimindHandler } from './handler'
import { GetUnimindInjector } from './injector'

const getUnimindInjectorPromise = new GetUnimindInjector('getUnimindInjector').build()
const getUnimindHandler = new GetUnimindHandler('getUnimindHandler', getUnimindInjectorPromise)

module.exports = {
  getUnimindHandler: getUnimindHandler.handler,
}

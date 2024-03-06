import { GetDocsHandler } from './GetDocsHandler'
import { GetDocsInjector } from './GetDocsInjector'
import { GetDocsUIHandler } from './GetDocsUIHandler'
import { GetDocsUIInjector } from './GetDocsUIInjector'

const getDocsInjectorPromise = new GetDocsInjector('getDocsInjector').build()
const getDocsHandler = new GetDocsHandler('get-docs', getDocsInjectorPromise)

const getDocsUIInjectorPromise = new GetDocsUIInjector('getDocsUIInjector').build()
const getDocsUIHandler = new GetDocsUIHandler('get-docs', getDocsUIInjectorPromise)

module.exports = {
  getDocsHandler: getDocsHandler.handler,
  getDocsUIHandler: getDocsUIHandler.handler,
}

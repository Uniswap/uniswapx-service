import { GetDocsHandler } from './GetDocsHandler'
import { GetDocsUIHandler } from './GetDocsUIHandler'

const getDocsHandler = new GetDocsHandler('get-docs')
const getDocsUIHandler = new GetDocsUIHandler('get-docs')

module.exports = {
  getDocsHandler: getDocsHandler.handler,
  getDocsUIHandler: getDocsUIHandler.handler,
}

import { NonceRepository } from '../../repositories/nonce-repository'
import { sharedStoreClient } from '../../repositories/store-client'
import { GetNonceHandler } from './handler'
import { RequestTimeProviderMap } from './request-time-provider-map'

const getNonceHandler = new GetNonceHandler(
  'getNonceHandler',
  NonceRepository.create(sharedStoreClient()),
  new RequestTimeProviderMap()
)

module.exports = {
  getNonceHandler: getNonceHandler.handler,
}

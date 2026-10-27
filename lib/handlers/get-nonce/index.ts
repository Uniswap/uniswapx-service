import { DynamoDB } from 'aws-sdk'
import { NonceRepository } from '../../repositories/nonce-repository'
import { GetNonceHandler } from './handler'
import { RequestTimeProviderMap } from './request-time-provider-map'

const getNonceHandler = new GetNonceHandler(
  'getNonceHandler',
  NonceRepository.create(new DynamoDB.DocumentClient()),
  new RequestTimeProviderMap()
)

module.exports = {
  getNonceHandler: getNonceHandler.handler,
}

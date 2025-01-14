import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { default as bunyan, default as Logger } from 'bunyan'
import { updateIntrinsicValues } from '../../../lib/crons/unimind-algorithm'
import { DynamoIntrinsicValuesRepository } from '../../../lib/repositories/intrinsic-values-repository'

const dynamoConfig = {
  convertEmptyValues: true,
  endpoint: 'localhost:8000',
  region: 'local-env',
  sslEnabled: false,
  credentials: {
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
  },
}

const documentClient = new DocumentClient(dynamoConfig)
const intrinsicValuesRepository = DynamoIntrinsicValuesRepository.create(documentClient)

const log: Logger = bunyan.createLogger({
  name: 'test',
  serializers: bunyan.stdSerializers,
  level: 'fatal',
})

describe('updateIntrinsicValues Test', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should update intrinsic values', async () => {
    await updateIntrinsicValues(intrinsicValuesRepository, log)
    
    const updatedValues = await intrinsicValuesRepository.getByPair('ETH-USDC')
    expect(updatedValues).toBeDefined()
    expect(updatedValues?.pair).toBe('ETH-USDC')
    expect(updatedValues?.pi).toBe(3.14)
    expect(typeof updatedValues?.tau).toBe('number')
  })
}) 
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { default as bunyan, default as Logger } from 'bunyan'
import { updateParameters } from '../../../lib/crons/unimind-algorithm'
import { DynamoUnimindParametersRepository } from '../../../lib/repositories/unimind-parameters-repository'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'

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
const unimindParametersRepository = DynamoUnimindParametersRepository.create(documentClient)
const ordersTable = DutchOrdersRepository.create(documentClient) as DutchOrdersRepository

const log: Logger = bunyan.createLogger({
  name: 'test',
  serializers: bunyan.stdSerializers,
  level: 'fatal',
})

describe('updateParameters Test', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should update unimind parameters without throwing an error', async () => {
    await expect(async () => {
      await updateParameters(unimindParametersRepository, ordersTable, log)
    }).not.toThrow();
  })
}) 
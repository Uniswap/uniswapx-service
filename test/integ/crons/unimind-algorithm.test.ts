import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { default as bunyan, default as Logger } from 'bunyan'
import { updateParameters } from '../../../lib/crons/unimind-algorithm'
import { DynamoUnimindParametersRepository } from '../../../lib/repositories/unimind-parameters-repository'

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

const log: Logger = bunyan.createLogger({
  name: 'test',
  serializers: bunyan.stdSerializers,
  level: 'fatal',
})

describe('updateParameters Test', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should update unimind parameters', async () => {
    await updateParameters(unimindParametersRepository, log)
    
    const updatedValues = await unimindParametersRepository.getByPair('0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123')
    expect(updatedValues).toBeDefined()
    expect(updatedValues?.pair).toBe('0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123')
    expect(updatedValues?.pi).toBe(3.14)
    expect(typeof updatedValues?.tau).toBe('number')
  })
}) 
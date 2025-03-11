import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { default as bunyan, default as Logger } from 'bunyan'
import { updateParameters } from '../../../lib/crons/unimind-algorithm'
import { DynamoUnimindParametersRepository } from '../../../lib/repositories/unimind-parameters-repository'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { DutchV3OrderEntity, ORDER_STATUS } from '../../../lib/entities'
import { OrderType } from '@uniswap/uniswapx-sdk'

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
const mockOrder : DutchV3OrderEntity = {
  type: OrderType.Dutch_V3,
  encodedOrder: '0x',
  signature: '0x',
  nonce: '0x',
  orderHash: '0x',
  orderStatus: ORDER_STATUS.EXPIRED,
  chainId: 42161,
  offerer: '0x',
  reactor: '0x',
  deadline: 1,
  input: {
    token: '0x',
    startAmount: '0x',
    maxAmount: '0x',
    adjustmentPerGweiBaseFee: '0x',
  },
  outputs: [],
  startingBaseFee: '0x',
  cosignerData: {
    decayStartBlock: 1,
    exclusiveFiller: '0x',
    inputOverride: '0x',
    outputOverrides: [],
  },
  cosignature: '0x',
  pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-42161',
}

beforeAll(async () => {
  await ordersTable.putOrderAndUpdateNonceTransaction(mockOrder)
})

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
    await updateParameters(unimindParametersRepository, ordersTable, log)
  })
}) 
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { default as bunyan, default as Logger } from 'bunyan'
import { updateParameters } from '../../../lib/crons/unimind-algorithm'
import { DynamoUnimindParametersRepository } from '../../../lib/repositories/unimind-parameters-repository'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { DutchV3OrderEntity, ORDER_STATUS } from '../../../lib/entities'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { DEFAULT_UNIMIND_PARAMETERS } from '../../../lib/util/constants'

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
const mockNewPair = '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-42161'
const mockNewPairOrder : DutchV3OrderEntity = {
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
  pair: mockNewPair,
}
const mockOldPair = '0x4444444444444444444444444444444444444444-0x2222222222222222222222222222222222222222-42161'
const mockOldPairOrder: DutchV3OrderEntity = {
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
  pair: mockOldPair,
}

beforeAll(async () => {
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

  it('should update unimind parameters for a new pair with default parameters', async () => {
    await ordersTable.putOrderAndUpdateNonceTransaction(mockNewPairOrder)
    await updateParameters(unimindParametersRepository, ordersTable, log)
    const pairData = await unimindParametersRepository.getByPair(mockNewPair)
    expect(pairData).toBeDefined()
    expect(pairData?.pi).toEqual(DEFAULT_UNIMIND_PARAMETERS.pi)
    expect(pairData?.tau).toEqual(DEFAULT_UNIMIND_PARAMETERS.tau)
  })

  it('should not update unimind parameters for a pair with existing parameters before meeting threshold', async () => {
    await unimindParametersRepository.put({
      pair: mockOldPair,
      pi: 22,
      tau: 33,
      count: 1,
    })
    await ordersTable.putOrderAndUpdateNonceTransaction(mockOldPairOrder)
    await updateParameters(unimindParametersRepository, ordersTable, log)
    const pairData = await unimindParametersRepository.getByPair(mockOldPair)
    expect(pairData?.pi).toEqual(22)
    expect(pairData?.tau).toEqual(33)
    expect(pairData?.count).toEqual(2) // successfully updated the count
  })
}) 
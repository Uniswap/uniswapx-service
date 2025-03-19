import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { default as bunyan, default as Logger } from 'bunyan'
import { updateParameters } from '../../../lib/crons/unimind-algorithm'
import { DynamoUnimindParametersRepository } from '../../../lib/repositories/unimind-parameters-repository'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { DutchV3OrderEntity, ORDER_STATUS } from '../../../lib/entities'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { DEFAULT_UNIMIND_PARAMETERS, UNIMIND_UPDATE_THRESHOLD } from '../../../lib/util/constants'

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

const mockOrder: DutchV3OrderEntity = {
  type: OrderType.Dutch_V3,
  encodedOrder: "0x000000",
  signature: "0123",
  nonce: "2345",
  orderHash: "0x678967896789",
  chainId: 42161,
  orderStatus: ORDER_STATUS.EXPIRED,
  offerer: "0xasdf",
  startingBaseFee: "0",
  input: {
    token: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    startAmount: "2000000000000000",
    curve: {
      relativeBlocks: [8],
      relativeAmounts: ["21"]
    },
    maxAmount: "2000000000000000",
    adjustmentPerGweiBaseFee: "0"
  },
  outputs: [{
    token: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    startAmount: "6270",
    curve: {
      relativeBlocks: [8],
      relativeAmounts: ["21"]
    },
    minAmount: "6249",
    recipient: "0xasdf",
    adjustmentPerGweiBaseFee: "0"
  }],
  reactor: "0xqwer",
  deadline: Date.now()/1000 + 100,
  filler: "0x0000000000000000000000000000000000000000",
  cosignerData: {
    decayStartBlock: 315641558,
    exclusiveFiller: "0x0000000000000000000000000000000000000000",
    inputOverride: "0",
    outputOverrides: ["0"]
  },
  fillBlock: 315641562,
  cosignature: "0xzxcv",
  quoteId: "12345678-1234-1234-1234-123456789012",
  referencePrice: "1234567890",
  priceImpact: 0.46,
  route: {
    gasUseEstimate: "1234",
    gasUseEstimateQuote: "1234",
    gasPriceWei: "1234",
    quote: "1234",
    quoteGasAdjusted: "1234",
    methodParameters: {
      calldata: "0x3593",
      value: "0x00",
      to: "0xghjk"
    }
  },
  pair: "0x1-0x2-21"
}

const mockOldPair = '0x4444444444444444444444444444444444444444-0x2222222222222222222222222222222222222222-42161'
const mockOldPairOrder: DutchV3OrderEntity = {
  ...mockOrder,
  orderHash: '0x1',
  pair: mockOldPair,
}

const mockNewPair = '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-42161'
const mockNewPairOrder : DutchV3OrderEntity = {
  ...mockOrder,
  orderHash: '0x0',
  pair: mockNewPair,
}

afterAll(async () => {
  await ordersTable.deleteOrders([mockOrder.orderHash, mockOldPairOrder.orderHash, mockNewPairOrder.orderHash])
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

  it('should update unimind parameters for a pair with existing parameters after meeting threshold', async () => {
    await unimindParametersRepository.put({
      pair: mockOrder.pair as string,
      pi: 22,
      tau: 33,
      count: UNIMIND_UPDATE_THRESHOLD - 1,
    })
    await ordersTable.putOrderAndUpdateNonceTransaction(mockOrder)
    await updateParameters(unimindParametersRepository, ordersTable, log)
    const pairData = await unimindParametersRepository.getByPair(mockOrder.pair as string)
    expect(pairData?.pi).not.toEqual(22)
    expect(pairData?.tau).not.toEqual(33)
    expect(pairData?.count).toEqual(0)
  })
}) 
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { default as bunyan, default as Logger } from 'bunyan'
import { updateParameters } from '../../../lib/crons/unimind-algorithm'
import { DynamoUnimindParametersRepository } from '../../../lib/repositories/unimind-parameters-repository'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { DutchV3OrderEntity, ORDER_STATUS } from '../../../lib/entities'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { DEFAULT_UNIMIND_PARAMETERS, UNIMIND_ALGORITHM_VERSION, UNIMIND_DEV_SWAPPER_ADDRESS, UNIMIND_UPDATE_THRESHOLD } from '../../../lib/util/constants'

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
  offerer: UNIMIND_DEV_SWAPPER_ADDRESS,
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
  pair: "0x1-0x2-21",
  usedUnimind: true,
}

const mockOldPair = '0x4444444444444444444444444444444444444444-0x2222222222222222222222222222222222222222-42161'
const mockOldPairOrder: DutchV3OrderEntity = {
  ...mockOrder,
  orderHash: '0x1',
  pair: mockOldPair,
  usedUnimind: true,
}

const mockNewPair = '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-42161'
const mockNewPairOrder : DutchV3OrderEntity = {
  ...mockOrder,
  orderHash: '0x0',
  pair: mockNewPair,
  usedUnimind: true,
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
    const intrinsicValues = JSON.parse(pairData?.intrinsicValues ?? '{}')
    expect(intrinsicValues.pi).toEqual(JSON.parse(DEFAULT_UNIMIND_PARAMETERS).pi)
    expect(intrinsicValues.tau).toEqual(JSON.parse(DEFAULT_UNIMIND_PARAMETERS).tau)
  })

  it('should not update unimind parameters for a pair with existing parameters before meeting threshold', async () => {
    await unimindParametersRepository.put({
      pair: mockOldPair,
      intrinsicValues: JSON.stringify({
        lambda1: 1,
        lambda2: 2,
        Sigma: 0.1
      }),
      version: UNIMIND_ALGORITHM_VERSION,
      count: 1,
      batchNumber: 0
    })
    await ordersTable.putOrderAndUpdateNonceTransaction(mockOldPairOrder)
    await updateParameters(unimindParametersRepository, ordersTable, log)
    const pairData = await unimindParametersRepository.getByPair(mockOldPair)
    const intrinsicValues = JSON.parse(pairData?.intrinsicValues ?? '{}')
    expect(intrinsicValues.lambda1).toEqual(1)
    expect(intrinsicValues.lambda2).toEqual(2)
    expect(intrinsicValues.Sigma).toEqual(0.1)
    expect(pairData?.count).toEqual(2) // successfully updated the count
  })

  it('should update unimind parameters for a pair with existing parameters after meeting threshold', async () => {
    await unimindParametersRepository.put({
      pair: mockOrder.pair as string,
      intrinsicValues: JSON.stringify({
        lambda1: 1,
        lambda2: 2,
        Sigma: 0.1
      }),
      count: UNIMIND_UPDATE_THRESHOLD - 1,
      version: UNIMIND_ALGORITHM_VERSION,
      batchNumber: 0
    })
    await ordersTable.putOrderAndUpdateNonceTransaction(mockOrder)
    await updateParameters(unimindParametersRepository, ordersTable, log)
    const pairData = await unimindParametersRepository.getByPair(mockOrder.pair as string)
    expect(pairData?.count).toEqual(0)
  })

  it('should reset parameters if the version of saved parameters is not the same as the current version', async () => {
    await unimindParametersRepository.put({
      pair: mockOrder.pair as string,
      intrinsicValues: JSON.stringify({
        lambda1: 1,
        lambda2: 2,
        Sigma: 0.1
      }),
      count: UNIMIND_UPDATE_THRESHOLD - 1,
      version: UNIMIND_ALGORITHM_VERSION - 1,
      batchNumber: 0
    })
    await ordersTable.putOrderAndUpdateNonceTransaction(mockOrder)
    await updateParameters(unimindParametersRepository, ordersTable, log)
    const pairData = await unimindParametersRepository.getByPair(mockOrder.pair as string)
    expect(pairData?.count).toEqual(1)
    expect(pairData?.version).toEqual(UNIMIND_ALGORITHM_VERSION)
    // Check that the intrinsic values are the default parameters
    const intrinsicValues = JSON.parse(pairData?.intrinsicValues ?? '{}')
    expect(intrinsicValues.lambda1).toEqual(JSON.parse(DEFAULT_UNIMIND_PARAMETERS).lambda1)
    expect(intrinsicValues.lambda2).toEqual(JSON.parse(DEFAULT_UNIMIND_PARAMETERS).lambda2)
    expect(intrinsicValues.Sigma).toEqual(JSON.parse(DEFAULT_UNIMIND_PARAMETERS).Sigma)
  })

  // Skipping because we are currently sampling 100% of addresses
  it.skip('should not update parameters for pairs that do not pass the unimind address filter', async () => {
    const failPair = '0x111-0x222-FAIL'
    await ordersTable.putOrderAndUpdateNonceTransaction({
      ...mockOrder,
      pair: failPair,
      offerer: '0x1234', // does not pass unimind address filter
    })
    await updateParameters(unimindParametersRepository, ordersTable, log)
    const pairData = await unimindParametersRepository.getByPair(failPair)
    expect(pairData).toBeUndefined()
  })

  describe('Batch number tracking', () => {
    const testPair = '0xTEST-0xBATCH-42161'
    const testOrder: DutchV3OrderEntity = {
      ...mockOrder,
      orderHash: '0xBATCH123',
      pair: testPair,
      usedUnimind: true,
    }

    afterEach(async () => {
      await ordersTable.deleteOrders([testOrder.orderHash])
    })

    it('should initialize new pairs with batchNumber 0', async () => {
      await ordersTable.putOrderAndUpdateNonceTransaction(testOrder)
      await updateParameters(unimindParametersRepository, ordersTable, log)
      
      const pairData = await unimindParametersRepository.getByPair(testPair)
      expect(pairData).toBeDefined()
      expect(pairData?.batchNumber).toBe(0)
      expect(pairData?.lastUpdatedAt).toBeDefined()
    })

    it('should increment batchNumber on threshold update', async () => {
      await unimindParametersRepository.put({
        pair: testPair,
        intrinsicValues: DEFAULT_UNIMIND_PARAMETERS,
        count: UNIMIND_UPDATE_THRESHOLD - 1,
        version: UNIMIND_ALGORITHM_VERSION,
        batchNumber: 5,
        lastUpdatedAt: Math.floor(Date.now() / 1000)
      })
      
      await ordersTable.putOrderAndUpdateNonceTransaction(testOrder)
      await updateParameters(unimindParametersRepository, ordersTable, log)
      
      const pairData = await unimindParametersRepository.getByPair(testPair)
      expect(pairData?.batchNumber).toBe(6)
      expect(pairData?.count).toBe(0) // Reset count after threshold
      expect(pairData?.lastUpdatedAt).toBeDefined()
    })

    it('should preserve batchNumber on count-only updates', async () => {
      const previousTimestamp = Math.floor(Date.now() / 1000) - 100
      await unimindParametersRepository.put({
        pair: testPair,
        intrinsicValues: DEFAULT_UNIMIND_PARAMETERS,
        count: 10,
        version: UNIMIND_ALGORITHM_VERSION,
        batchNumber: 3,
        lastUpdatedAt: previousTimestamp
      })
      
      await ordersTable.putOrderAndUpdateNonceTransaction(testOrder)
      await updateParameters(unimindParametersRepository, ordersTable, log)
      
      const pairData = await unimindParametersRepository.getByPair(testPair)
      expect(pairData?.batchNumber).toBe(3) // Should preserve existing batch number
      expect(pairData?.count).toBe(11) // Should increment count
      expect(pairData?.lastUpdatedAt).toBe(previousTimestamp) // Should preserve timestamp
    })

    it('should handle missing batchNumber gracefully', async () => {
      await unimindParametersRepository.put({
        pair: testPair,
        intrinsicValues: DEFAULT_UNIMIND_PARAMETERS,
        count: UNIMIND_UPDATE_THRESHOLD - 1,
        version: UNIMIND_ALGORITHM_VERSION,
        // batchNumber is undefined
      } as any)
      
      await ordersTable.putOrderAndUpdateNonceTransaction(testOrder)
      await updateParameters(unimindParametersRepository, ordersTable, log)
      
      const pairData = await unimindParametersRepository.getByPair(testPair)
      expect(pairData?.batchNumber).toBe(1) // Should start at 1 when undefined
      expect(pairData?.count).toBe(0)
      expect(pairData?.lastUpdatedAt).toBeDefined()
    })

    it('should reset batchNumber to 0 on version mismatch', async () => {
      await unimindParametersRepository.put({
        pair: testPair,
        intrinsicValues: JSON.stringify({
          lambda1: 1,
          lambda2: 2,
          Sigma: 0.1
        }),
        count: 10,
        version: UNIMIND_ALGORITHM_VERSION - 1, // Old version
        batchNumber: 10,
        lastUpdatedAt: Math.floor(Date.now() / 1000)
      })
      
      await ordersTable.putOrderAndUpdateNonceTransaction(testOrder)
      await updateParameters(unimindParametersRepository, ordersTable, log)
      
      const pairData = await unimindParametersRepository.getByPair(testPair)
      expect(pairData?.batchNumber).toBe(0) // Reset to 0 on version mismatch
      expect(pairData?.version).toBe(UNIMIND_ALGORITHM_VERSION)
      expect(pairData?.lastUpdatedAt).toBeDefined()
    })
  })
}) 

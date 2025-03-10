import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { default as bunyan, default as Logger } from 'bunyan'
import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS } from '../../../lib/entities'
import * as unimindAlgorithmModule from '../../../lib/crons/unimind-algorithm'
import { updateParameters } from '../../../lib/crons/unimind-algorithm'
import { DynamoUnimindParametersRepository } from '../../../lib/repositories/unimind-parameters-repository'
import { DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'

jest.mock('../../../lib/crons/unimind-algorithm', () => {
  const originalModule = jest.requireActual('../../../lib/crons/unimind-algorithm');
  return {
    ...originalModule,
    getOrdersByTimeRange: jest.fn()
  };
});

const mockOrder = {
  "type": OrderType.Dutch_V3, 
  "orderStatus": ORDER_STATUS.EXPIRED, 
  "signature": "0x1234",
  "encodedOrder": "0x1234",
  "chainId": 42161,
  "nonce": "1234",
  "orderHash": "0x1234",
  "offerer": "0x1234", 
  "reactor": "0xf4c37d77623d476f52225df3bbe8a874209a1149",
  "deadline": 1741631234,
  "startingBaseFee": "0",
  "input": {
    "token": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "startAmount": "2000000000000000",
    "curve": {
      "relativeBlocks": [8],
      "relativeAmounts": ["21"]
    },
    "maxAmount": "2000000000000000",
    "adjustmentPerGweiBaseFee": "0"
  },
  "outputs": [{
    "token": "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    "startAmount": "6270",
    "curve": {
      "relativeBlocks": [8],
      "relativeAmounts": ["21"]
    },
    "minAmount": "6249",
    "recipient": "0x2b813964306D8F12bdaB5504073a52e5802f049D",
    "adjustmentPerGweiBaseFee": "0"
  }],
  "cosignerData": {
    "decayStartBlock": 314331234,
    "exclusiveFiller": "0x0000000000000000000000000000000000000000",
    "inputOverride": "0",
    "outputOverrides": ["0"]
  },
  "cosignature": "0x1234",
  "quoteId": "1234123-1234-1234-1234-123412341234",
  "createdAt": 1741631234
};

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
  beforeEach(() => {
    (unimindAlgorithmModule.getOrdersByTimeRange as jest.Mock).mockResolvedValue([mockOrder]);
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should update unimind parameters without throwing an error', async () => {
    await expect(async () => {
      await updateParameters(unimindParametersRepository, ordersTable, log)
    }).not.toThrow();
  })
}) 
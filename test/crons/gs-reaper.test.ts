/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { OrderType, REACTOR_ADDRESS_MAPPING } from '@uniswap/uniswapx-sdk'
import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { default as bunyan, default as Logger } from 'bunyan'
import { BATCH_WRITE_MAX, deleteStaleOrders } from '../../lib/crons/gs-reaper'
import { ORDER_STATUS } from '../../lib/entities'
import { DutchOrdersRepository } from '../../lib/repositories/dutch-orders-repository'

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
const ordersRepository = DutchOrdersRepository.create(documentClient)

const MOCK_ORDER = {
  encodedOrder: '0x01',
  chainId: 1,
  filler: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  signature:
    '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010',
  nonce: '40',
  orderHash: '0x0',
  orderStatus: ORDER_STATUS.OPEN,
  offerer: '0x0000000000000000000000000000000000000001',
  reactor: REACTOR_ADDRESS_MAPPING[1][OrderType.Dutch].toLowerCase(),
  decayStartTime: 20,
  decayEndTime: 10,
  deadline: 10,
  quoteId: '55e2cfca-5521-4a0a-b597-7bfb569032d7',
  type: 'Dutch',
  input: {
    endAmount: '30',
    startAmount: '30',
    token: '0x0000000000000000000000000000000000000003',
  },
  outputs: [
    {
      endAmount: '50',
      startAmount: '60',
      token: '0x0000000000000000000000000000000000000005',
      recipient: '0x0000000000000000000000000000000000000004',
    },
  ],
}
const log: Logger = bunyan.createLogger({
  name: 'test',
  serializers: bunyan.stdSerializers,
  level: 'fatal',
})

describe('deleteStaleOrders Test', () => {
  beforeEach(async () => {
    const orders = await ordersRepository.getByOrderStatus(ORDER_STATUS.OPEN)
    if (orders.orders.length) {
      await ordersRepository.deleteOrders(orders.orders.map((order) => order.orderHash))
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should delete stale orders', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER)
    let staleOrders = await ordersRepository.getByOrderStatus(ORDER_STATUS.OPEN)
    expect(staleOrders.orders.length).toBe(1)
    await deleteStaleOrders(ordersRepository, log)
    staleOrders = await ordersRepository.getByOrderStatus(ORDER_STATUS.OPEN)
    expect(staleOrders.orders.length).toBe(0)
  })

  it('should page through all stale orders if necessary', async () => {
    for (let i = 0; i < BATCH_WRITE_MAX + 1; i++) {
      await ordersRepository.putOrderAndUpdateNonceTransaction({ ...MOCK_ORDER, orderHash: `0x${i}` })
    }
    await deleteStaleOrders(ordersRepository, log)
    for (let i = 0; i < BATCH_WRITE_MAX + 1; i++) {
      expect(await ordersRepository.getByHash(`0x${i}`)).toBeUndefined()
    }
  })
})

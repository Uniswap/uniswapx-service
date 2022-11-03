import { DocumentClient } from 'aws-sdk/clients/dynamodb'
import { parseOrder } from 'gouda-sdk'
import { OrderEntity, ORDER_STATUS } from '../../lib/entities/Order'
import { DynamoOrdersRepository } from '../../lib/repositories/orders-repository'
import * as nonceUtil from '../../lib/util/nonce'

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

const MOCK_ORDER_1: OrderEntity = {
  orderHash: '0x1',
  offerer: 'hayden.eth',
  encodedOrder: 'order1',
  signature: 'sig1',
  nonce: '1',
  orderStatus: ORDER_STATUS.OPEN,
}

const MOCK_ORDER_2: OrderEntity = {
  orderHash: '0x2',
  offerer: 'hayden.eth',
  encodedOrder: 'order2',
  signature: 'sig2',
  nonce: '2',
  orderStatus: ORDER_STATUS.OPEN,
}

const documentClient = new DocumentClient(dynamoConfig)
const ordersRepository = new DynamoOrdersRepository()
DynamoOrdersRepository.initialize(documentClient)

beforeAll(async () => {
  console.log(
    parseOrder(
      '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000e9781560d93c27aa4c4f3543631d191d10608d20000000000000000000000000496d57839975e5c0bd36d39ffa27336b078b1b16000000000000000000000000000000000000000000000000000000000000002800000000000000000000000000000000000000000000000000000000633f664000000000000000000000000000000000000000000000000000000000633f6604000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000016345785d8a0000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000010000000000000000000000006b175474e89094c44da98b954eedeac495271d0f00000000000000000000000000000000000000000000001b1ae4d6e2ef500000000000000000000000000000000000000000000000000015af1d78b58c400000000000000000000000000000496d57839975e5c0bd36d39ffa27336b078b1b11'
    )
  )
  await ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER_1)
  await ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER_2)
})

describe('OrdersRepository put item test', () => {
  it('should successfully put an item in table', async () => {
    expect(() => {
      ordersRepository.putOrderAndUpdateNonceTransaction(MOCK_ORDER_1)
    }).not.toThrow()
  })
})

describe('OrdersRepository get item test', () => {
  it('should successfully get an item from table', async () => {
    const order1 = await ordersRepository.getByHash(MOCK_ORDER_1.orderHash)
    // dynamodb-toolbox auto-generates 'created' and 'modified' fields
    expect(order1).toEqual(expect.objectContaining(MOCK_ORDER_1))

    const order2 = await ordersRepository.getByHash(MOCK_ORDER_2.orderHash)
    expect(order2).toEqual(expect.objectContaining(MOCK_ORDER_2))
  })

  it('should return undefined if item does not exist', async () => {
    const res = await ordersRepository.getByHash('0x3')
    expect(res).toBeUndefined()
  })
})

describe('OrdersRepository get nonce test', () => {
  it('should successfully get last posted nonce from table', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_1,
      nonce: '3',
    })
    const nonce = await ordersRepository.getNonceByAddress('hayden.eth')
    expect(nonce).toEqual('3')
  })

  it('should get last used nonce when there are multiple orders with that nonce value in the DB', async () => {
    await ordersRepository.putOrderAndUpdateNonceTransaction({
      ...MOCK_ORDER_1,
      nonce: '2',
      orderHash: '0x3',
    })
    // at this point, there are three orders in the DB, two with nonce 2
    const nonce = await ordersRepository.getNonceByAddress('hayden.eth')
    expect(nonce).toEqual('2')
  })

  it('should generate random nonce for new address', async () => {
    const spy = jest.spyOn(nonceUtil, 'generateRandomNonce')
    const res = await ordersRepository.getNonceByAddress('random.eth')
    expect(res).not.toBeUndefined()
    expect(spy).toHaveBeenCalled()
  })
})

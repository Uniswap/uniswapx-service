import { Logger } from '@aws-lambda-powertools/logger'
import { CosignedPriorityOrder } from '@uniswap/uniswapx-sdk'
import { Entity, Table } from 'dynamodb-toolbox'
import { mock } from 'jest-mock-extended'
import { DYNAMODB_TYPES, TABLE_KEY } from '../../../lib/config/dynamodb'
import { StatusUpdateFill, toOrderEntity, toStatusUpdate, toStoredRow } from '../../../lib/core/orders/storedRow'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { PostOrderBodyParser } from '../../../lib/handlers/post-order/PostOrderBodyParser'
import { PostOrderRequestBody } from '../../../lib/handlers/post-order/schema'
import { PriorityOrder } from '../../../lib/models/PriorityOrder'
import { MODEL_NAME } from '../../../lib/repositories/base'
import { ORDER_ATTRIBUTES } from '../../../lib/repositories/create-orders-repository'
import { DUTCH_ORDER_ATTRIBUTES, DutchOrdersRepository } from '../../../lib/repositories/dutch-orders-repository'
import { LimitOrdersRepository } from '../../../lib/repositories/limit-orders-repository'
import { getTableIndices, TABLE_NAMES } from '../../../lib/repositories/util'
import { freezeClock, restoreClock } from '../../fakes/clock'
import { TEST_STORE_CONTEXT } from '../../fakes/orders-repository'
import { AcceptedPosts, PRIORITY_COSIGNED_ENCODED_ORDER } from '../contract/fixtures/post-order'
import { deleteRawItems, documentClient, putRawItems, rawItem } from '../contract/harness'
import { createdAtTick, setClockToTick, tickMs } from './store-fixtures'

// The store now writes through @aws-sdk/lib-dynamodb while the GET list queries still read
// through dynamodb-toolbox. These pin the store to what toolbox wrote and read, attribute for
// attribute, on DynamoDB Local.

// No other suite cleans up this chain or these key prefixes.
const CHAIN = 8453
const PREFIX = '0xparity-'

// A real posted order of each type, moved onto this suite's keys.
function postedEntity(name: keyof typeof AcceptedPosts): UniswapXOrderEntity {
  const parsed = new PostOrderBodyParser(mock<Logger>()).fromPostRequest(
    AcceptedPosts[name].request as PostOrderRequestBody
  )
  const order =
    parsed instanceof PriorityOrder
      ? new PriorityOrder(
          CosignedPriorityOrder.parse(PRIORITY_COSIGNED_ENCODED_ORDER, parsed.chainId),
          parsed.signature,
          parsed.chainId,
          parsed.quoteId,
          parsed.requestId
        )
      : parsed
  return {
    ...toOrderEntity(order),
    orderHash: `${PREFIX}${name.toLowerCase()}`,
    offerer: `${PREFIX}swapper-${name.toLowerCase()}`,
    chainId: CHAIN,
  }
}

const TABLES = [
  {
    tableName: TABLE_NAMES.Orders,
    create: DutchOrdersRepository.create,
    entityName: MODEL_NAME.DUTCH,
    attributes: DUTCH_ORDER_ATTRIBUTES,
    orders: ['Dutch_V2', 'Dutch_V3', 'Priority'] as const,
  },
  {
    tableName: TABLE_NAMES.LimitOrders,
    create: LimitOrdersRepository.create,
    entityName: MODEL_NAME.LIMIT,
    attributes: ORDER_ATTRIBUTES,
    orders: ['Limit'] as const,
  },
]

// What the repository used before this change, built the same way.
function toolboxStore(tableName: TABLE_NAMES, entityName: string, attributes: typeof ORDER_ATTRIBUTES) {
  const table = new Table({
    name: tableName,
    partitionKey: 'orderHash',
    DocumentClient: documentClient,
    indexes: getTableIndices(),
  })
  const entity = new Entity({ name: entityName, attributes, table } as const)
  const nonces = new Entity({
    name: 'Nonce',
    attributes: {
      offerer: { partitionKey: true, type: DYNAMODB_TYPES.STRING },
      nonce: { type: DYNAMODB_TYPES.STRING, required: true },
    },
    table: new Table({ name: TABLE_NAMES.Nonces, partitionKey: 'offerer', DocumentClient: documentClient }),
  } as const)
  return {
    entity,
    put: (row: UniswapXOrderEntity, createdAt: number) =>
      table.transactWrite(
        [
          entity.putTransaction(toStoredRow(row, createdAt)),
          nonces.updateTransaction({ offerer: `${row.offerer}-${row.chainId}`, nonce: row.nonce }),
        ],
        { capacity: 'total', execute: true }
      ),
    updateStatus: (row: UniswapXOrderEntity, status: ORDER_STATUS, fill?: StatusUpdateFill) =>
      entity.update(
        toStatusUpdate(row, status, fill),
        status === ORDER_STATUS.FILLED
          ? {}
          : { conditions: [{ attr: TABLE_KEY.ORDER_STATUS, ne: ORDER_STATUS.FILLED }] }
      ),
  }
}

const FILL: StatusUpdateFill = {
  txHash: '0xfill',
  fillBlock: 123,
  fillTimestamp: createdAtTick(2),
  settledAmounts: [{ tokenOut: '0x01', amountOut: '1', tokenIn: '0x02', amountIn: '2' }],
}

beforeAll(() => {
  freezeClock(tickMs(0))
})

afterAll(() => {
  restoreClock()
})

describe.each(TABLES)('$tableName', ({ tableName, create, entityName, attributes, orders }) => {
  const repository = create(documentClient)
  const toolbox = toolboxStore(tableName, entityName, attributes)

  const keysOf = (row: UniswapXOrderEntity) => ({
    order: { orderHash: row.orderHash },
    nonce: { offerer: `${row.offerer}-${row.chainId}` },
  })
  const raw = async (row: UniswapXOrderEntity) => ({
    order: await rawItem(tableName, keysOf(row).order),
    nonce: await rawItem(TABLE_NAMES.Nonces, keysOf(row).nonce),
  })
  const remove = async (row: UniswapXOrderEntity) => {
    await deleteRawItems(tableName, [keysOf(row).order])
    await deleteRawItems(TABLE_NAMES.Nonces, [keysOf(row).nonce])
  }

  describe.each(orders)('%s', (name) => {
    const row = postedEntity(name)
    afterEach(() => remove(row))

    it('puts the order and its nonce exactly as toolbox did', async () => {
      setClockToTick(1)
      await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, row, createdAtTick(1))
      const written = await raw(row)
      await remove(row)

      await toolbox.put(row, createdAtTick(1))
      expect(written).toEqual(await raw(row))
      expect(written.order).toEqual(expect.objectContaining({ _et: entityName, createdAt: createdAtTick(1) }))
    })

    it('rewrites the nonce row as toolbox did, keeping its first created stamp', async () => {
      setClockToTick(1)
      await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, row, createdAtTick(1))
      setClockToTick(2)
      await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, { ...row, nonce: '99' }, createdAtTick(2))
      const written = await raw(row)
      await remove(row)

      setClockToTick(1)
      await toolbox.put(row, createdAtTick(1))
      setClockToTick(2)
      await toolbox.put({ ...row, nonce: '99' }, createdAtTick(2))
      expect(written.nonce).toEqual((await raw(row)).nonce)
    })

    it.each([
      ['filled with every fill detail', ORDER_STATUS.FILLED, FILL],
      ['expired', ORDER_STATUS.EXPIRED, undefined],
      ['cancelled with empty fill details', ORDER_STATUS.CANCELLED, { txHash: '', fillBlock: 0 }],
    ])('updates the status (%s) exactly as toolbox did', async (_case, status, fill) => {
      setClockToTick(1)
      await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, row, createdAtTick(1))
      setClockToTick(2)
      await repository.updateOrderStatus(TEST_STORE_CONTEXT, row.orderHash, status, fill)
      const written = await raw(row)
      await remove(row)

      setClockToTick(1)
      await toolbox.put(row, createdAtTick(1))
      setClockToTick(2)
      await toolbox.updateStatus(toStoredRow(row, createdAtTick(1)), status, fill)
      expect(written).toEqual(await raw(row))
    })

    it('reads what toolbox wrote as toolbox read it, and toolbox reads what it writes', async () => {
      setClockToTick(1)
      await toolbox.put(row, createdAtTick(1))
      const viaToolbox = (await toolbox.entity.get({ orderHash: row.orderHash }, { execute: true })).Item
      expect(await repository.getByHash(TEST_STORE_CONTEXT, row.orderHash)).toEqual(viaToolbox)
      await remove(row)

      await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, row, createdAtTick(1))
      expect((await toolbox.entity.get({ orderHash: row.orderHash }, { execute: true })).Item).toEqual(
        await repository.getByHash(TEST_STORE_CONTEXT, row.orderHash)
      )
    })
  })

  describe('rows toolbox never stamped', () => {
    const LEGACY_HASH = `${PREFIX}legacy-${entityName.toLowerCase()}`
    afterEach(() => deleteRawItems(tableName, [{ orderHash: LEGACY_HASH }]))

    it('reads a 2023-shaped row as stored: no stamps, millisecond createdAt', async () => {
      const legacy = {
        orderHash: LEGACY_HASH,
        orderStatus: ORDER_STATUS.EXPIRED,
        offerer: `${PREFIX}legacy-swapper`,
        chainId: 1,
        encodedOrder: '0x00',
        signature: '0x00',
        type: 'DutchLimit',
        createdAt: 1_675_000_000_000,
      }
      await putRawItems(tableName, [legacy])
      expect(await repository.getByHash(TEST_STORE_CONTEXT, LEGACY_HASH)).toEqual(legacy)
    })

    it('rejects a row missing a key callers read', async () => {
      await putRawItems(tableName, [{ orderHash: LEGACY_HASH, orderStatus: ORDER_STATUS.OPEN, chainId: 1 }])
      await expect(repository.getByHash(TEST_STORE_CONTEXT, LEGACY_HASH)).rejects.toThrow('Malformed order row')
    })
  })

  describe('countOpenOrders', () => {
    const OFFERER = `${PREFIX}counted-${entityName.toLowerCase()}`
    const rows = [1, 2, 3].map((i) => ({
      ...postedEntity(orders[0]),
      orderHash: `${PREFIX}counted-${entityName.toLowerCase()}-${i}`,
      offerer: OFFERER,
    }))

    beforeAll(async () => {
      for (const row of rows) {
        await repository.putOrderAndUpdateNonce(TEST_STORE_CONTEXT, row, createdAtTick(1))
      }
    })

    afterAll(async () => {
      await deleteRawItems(
        tableName,
        rows.map(({ orderHash }) => ({ orderHash }))
      )
      await deleteRawItems(TABLE_NAMES.Nonces, [{ offerer: `${OFFERER}-${CHAIN}` }])
    })

    it('counts every open order when there are at most max', async () => {
      expect(await repository.countOpenOrders(TEST_STORE_CONTEXT, OFFERER, 3)).toEqual(3)
    })

    it('counts max + 1 when there is one more than max, so the post is rejected', async () => {
      expect(await repository.countOpenOrders(TEST_STORE_CONTEXT, OFFERER, 2)).toEqual(3)
    })

    it('stops counting at max + 1', async () => {
      expect(await repository.countOpenOrders(TEST_STORE_CONTEXT, OFFERER, 1)).toEqual(2)
    })

    it('counts only OPEN orders', async () => {
      await repository.updateOrderStatus(TEST_STORE_CONTEXT, rows[0].orderHash, ORDER_STATUS.EXPIRED)
      expect(await repository.countOpenOrders(TEST_STORE_CONTEXT, OFFERER, 3)).toEqual(2)
    })
  })
})

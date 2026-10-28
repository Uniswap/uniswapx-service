import { CosignedPriorityOrder } from '@uniswap/uniswapx-sdk'
import { toOrderEntity, toStatusUpdate, toStoredRow } from '../../../../lib/core/orders/storedRow'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../../lib/entities'
import { PostOrderBodyParser } from '../../../../lib/handlers/post-order/PostOrderBodyParser'
import { PostOrderRequestBody } from '../../../../lib/handlers/post-order/schema'
import { DutchV2Order } from '../../../../lib/models/DutchV2Order'
import { DutchV3Order } from '../../../../lib/models/DutchV3Order'
import { LimitOrder } from '../../../../lib/models/LimitOrder'
import { PriorityOrder } from '../../../../lib/models/PriorityOrder'
import { DUTCH_ORDER_ATTRIBUTES } from '../../../../lib/repositories/dutch-orders-repository'
import { updateExpression } from '../../../../lib/repositories/toolbox-compat'
import { ChainId } from '../../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../../factories/SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from '../../../factories/SDKDutchOrderV3Factory'
import { NOW_SECONDS, QUOTE_ID, REQUEST_ID, SIGNATURE } from '../../../integ/contract/fixtures/orders'
import { AcceptedPosts, PRIORITY_COSIGNED_ENCODED_ORDER } from '../../../integ/contract/fixtures/post-order'
import { MOCK_ORDER_ENTITY } from '../../../test-data'

// The post path's order: the request parsed as the handler parses it, and for Priority the
// cosigner data and cosignature the service adds (as the stored row encodes them).
function postedOrder(request: object) {
  const order = new PostOrderBodyParser().fromPostRequest(request as PostOrderRequestBody)
  if (!(order instanceof PriorityOrder)) {
    return order
  }
  return new PriorityOrder(
    CosignedPriorityOrder.parse(PRIORITY_COSIGNED_ENCODED_ORDER, order.chainId),
    order.signature,
    order.chainId,
    QUOTE_ID,
    REQUEST_ID
  )
}

// The A8 stored row without the attributes dynamodb-toolbox stamps on write.
function withoutToolboxMeta(row: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _et, _ct, _md, ...rest } = row
  return rest
}

describe('toStoredRow(toOrderEntity(order))', () => {
  it.each(Object.entries(AcceptedPosts))('builds the %s row the contract pins', (_name, { request, expected }) => {
    const row = toStoredRow(toOrderEntity(postedOrder(request)), NOW_SECONDS)
    expect(row).toStrictEqual(withoutToolboxMeta(expected.storedRow))
  })

  it('writes the entity analytics and the immediate notice receive, plus index fields and createdAt', () => {
    const entity = toOrderEntity(postedOrder(AcceptedPosts.Dutch_V2.request))
    const row = toStoredRow(entity, NOW_SECONDS)
    expect(entity).not.toHaveProperty('createdAt')
    expect(row).toEqual({ ...entity, ...row, createdAt: NOW_SECONDS })
    expect(row.offerer_orderStatus).toEqual(`${entity.offerer}_open`)
  })

  it("keeps Priority's 'undefined_*' index keys: priority orders have no filler", () => {
    const row = toStoredRow(toOrderEntity(postedOrder(AcceptedPosts.Priority.request)), NOW_SECONDS)
    expect(row.filler).toBeUndefined()
    expect(row.filler_orderStatus).toEqual('undefined_open')
    expect(row.chainId_filler).toEqual(`${row.chainId}_undefined`)
  })
})

describe('toStatusUpdate', () => {
  const ROW: UniswapXOrderEntity = toStoredRow(toOrderEntity(postedOrder(AcceptedPosts.Dutch_V2.request)), NOW_SECONDS)
  const { offerer, filler, chainId, orderHash } = ROW

  it('sets the status and every index field that includes it', () => {
    expect(toStatusUpdate(ROW, ORDER_STATUS.EXPIRED)).toEqual({
      orderHash,
      orderStatus: 'expired',
      offerer_orderStatus: `${offerer}_expired`,
      filler_orderStatus: `${filler}_expired`,
      filler_offerer_orderStatus: `${filler}_${offerer}_expired`,
      chainId_orderStatus: `${chainId}_expired`,
      chainId_orderStatus_filler: `${chainId}_expired_${filler}`,
    })
  })

  it('carries the fill details that are set', () => {
    const settledAmounts = [{ tokenOut: '0x01', amountOut: '1', tokenIn: '0x02', amountIn: '2' }]
    expect(
      toStatusUpdate(ROW, ORDER_STATUS.FILLED, { txHash: '0xabc', fillBlock: 7, fillTimestamp: 9, settledAmounts })
    ).toEqual(
      expect.objectContaining({
        orderStatus: 'filled',
        txHash: '0xabc',
        fillBlock: 7,
        fillTimestamp: 9,
        settledAmounts,
      })
    )
  })

  it('drops an empty txHash and a zero fillBlock or fillTimestamp, leaving the stored values', () => {
    const update = toStatusUpdate(ROW, ORDER_STATUS.FILLED, { txHash: '', fillBlock: 0, fillTimestamp: 0 })
    expect(update).not.toHaveProperty('txHash')
    expect(update).not.toHaveProperty('fillBlock')
    expect(update).not.toHaveProperty('fillTimestamp')
    expect(update).not.toHaveProperty('settledAmounts')
  })

  it('marks the row skipNotify only when a repair asks, and the store writes it', () => {
    expect(toStatusUpdate(ROW, ORDER_STATUS.FILLED, { txHash: '0xabc' })).not.toHaveProperty('skipNotify')

    const update = toStatusUpdate(ROW, ORDER_STATUS.FILLED, { txHash: '0xabc', skipNotify: true })
    expect(update).toEqual(expect.objectContaining({ skipNotify: true }))
    const expression = updateExpression(update, DUTCH_ORDER_ATTRIBUTES, 'Order', new Date(0))
    expect(expression.UpdateExpression).toContain('#skipNotify = :skipNotify')
    expect(expression.ExpressionAttributeValues[':skipNotify']).toBe(true)
  })
})

describe('index fields', () => {
  const order = (orderStatus: ORDER_STATUS): UniswapXOrderEntity => ({
    ...MOCK_ORDER_ENTITY,
    orderStatus,
    offerer: '0xOfferer',
    filler: '0xFiller',
    chainId: 5,
    pair: '0x0000000000000000000000000000000000000000-0x1111111111111111111111111111111111111111-123',
  })

  it('toStoredRow writes every index field from the order', () => {
    expect(toStoredRow(order(ORDER_STATUS.FILLED), NOW_SECONDS)).toEqual(
      expect.objectContaining({
        chainId_filler: '5_0xFiller',
        chainId_orderStatus: '5_filled',
        chainId_orderStatus_filler: '5_filled_0xFiller',
        filler_offerer: '0xFiller_0xOfferer',
        filler_offerer_orderStatus: '0xFiller_0xOfferer_filled',
        filler_orderStatus: '0xFiller_filled',
        offerer_orderStatus: '0xOfferer_filled',
      })
    )
  })

  it('toStatusUpdate rewrites the index fields that include the status', () => {
    const { orderHash } = MOCK_ORDER_ENTITY
    expect(toStatusUpdate(order(ORDER_STATUS.OPEN), ORDER_STATUS.INSUFFICIENT_FUNDS)).toEqual({
      orderHash,
      chainId_orderStatus: '5_insufficient-funds',
      chainId_orderStatus_filler: '5_insufficient-funds_0xFiller',
      filler_offerer_orderStatus: '0xFiller_0xOfferer_insufficient-funds',
      filler_orderStatus: '0xFiller_insufficient-funds',
      offerer_orderStatus: '0xOfferer_insufficient-funds',
      orderStatus: 'insufficient-funds',
    })
  })
})

describe('toOrderEntity quirks the rows keep', () => {
  // Mixed case, so lowercasing is visible.
  const FILLER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

  it('stores the exclusive filler lowercased for every order type that has one', () => {
    const v2 = SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET)
    v2.info.cosignerData.exclusiveFiller = FILLER
    const v3 = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE)
    v3.info.cosignerData.exclusiveFiller = FILLER
    const limit = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET, { exclusiveFiller: FILLER })

    expect(toOrderEntity(new DutchV2Order(v2, SIGNATURE, ChainId.MAINNET)).filler).toEqual(FILLER.toLowerCase())
    expect(toOrderEntity(new DutchV3Order(v3, SIGNATURE, ChainId.ARBITRUM_ONE)).filler).toEqual(FILLER.toLowerCase())
    expect(toOrderEntity(new LimitOrder(limit, SIGNATURE, ChainId.MAINNET)).filler).toEqual(FILLER.toLowerCase())
  })

  it("stores a limit order's deadline as its decayEndTime, whatever the order's decay end", () => {
    const now = Math.floor(Date.now() / 1000)
    const limit = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET, { decayEndTime: now + 60, deadline: now + 600 })
    expect(limit.info.decayEndTime).not.toEqual(limit.info.deadline)

    const entity = toOrderEntity(new LimitOrder(limit, SIGNATURE, ChainId.MAINNET))
    expect(entity).toEqual(expect.objectContaining({ decayEndTime: limit.info.deadline }))
  })
})

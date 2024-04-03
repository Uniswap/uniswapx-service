import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, RelayOrderEntity } from '../../../lib/entities'
import { GetRelayOrderResponse } from '../../../lib/handlers/get-orders/schema/GetRelayOrderResponse'
import { RelayOrder } from '../../../lib/models'
import { ChainId } from '../../../lib/util/chain'
import { SDKRelayOrderFactory } from '../../factories/SDKRelayOrderFactory'
import { MOCK_SIGNATURE } from '../../test-data'

describe('RelayOrder Model', () => {
  test('toEntity', () => {
    const order = new RelayOrder(SDKRelayOrderFactory.buildRelayOrder(), MOCK_SIGNATURE, ChainId.MAINNET)
    const entity: RelayOrderEntity = order.toEntity(ORDER_STATUS.OPEN)

    expect(entity.signature).toEqual(MOCK_SIGNATURE)
    expect(entity.encodedOrder).toEqual(order.inner.serialize())
    expect(entity.orderStatus).toEqual(ORDER_STATUS.OPEN)
    expect(entity.orderHash).toEqual(order.inner.hash())
    expect(entity.type).toEqual(OrderType.Relay)
  })

  test('fromEntity', () => {
    const order = new RelayOrder(
      SDKRelayOrderFactory.buildRelayOrder(),
      MOCK_SIGNATURE,
      ChainId.MAINNET,
      ORDER_STATUS.OPEN
    )
    const entity: RelayOrderEntity = order.toEntity(ORDER_STATUS.OPEN)
    const fromEntity = RelayOrder.fromEntity(entity)

    expect(order).toEqual(fromEntity)
  })

  test('toGetResponse', () => {
    const order = new RelayOrder(
      SDKRelayOrderFactory.buildRelayOrder(),
      MOCK_SIGNATURE,
      ChainId.MAINNET,
      ORDER_STATUS.OPEN
    )
    const response: GetRelayOrderResponse = order.toGetResponse()

    expect(response.type).toEqual(OrderType.Relay)
    expect(response.orderStatus).toEqual(order.orderStatus)
    expect(response.signature).toEqual(order.signature)
    expect(response.encodedOrder).toEqual(order.inner.serialize())
    expect(response.chainId).toEqual(order.chainId)
    expect(response.orderHash).toEqual(order.inner.hash())
    expect(response.swapper).toEqual(order.inner.info.swapper)
    expect(response.reactor).toEqual(order.inner.info.reactor)
    expect(response.deadline).toEqual(order.inner.info.deadline)
    expect(response.input.token).toEqual(order.inner.info.input.token)
    expect(response.input.amount).toEqual(order.inner.info.input.amount.toString())
    expect(response.input.recipient).toEqual(order.inner.info.input.recipient)
    expect(response.relayFee.token).toEqual(order.inner.info.fee.token)
    expect(response.relayFee.startAmount).toEqual(order.inner.info.fee.startAmount.toString())
    expect(response.relayFee.endAmount).toEqual(order.inner.info.fee.endAmount.toString())
    expect(response.relayFee.startTime).toEqual(order.inner.info.fee.startTime)
    expect(response.relayFee.endTime).toEqual(order.inner.info.fee.endTime)
  })
})

import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { GetDutchV2OrderResponse } from '../../../lib/handlers/get-orders/schema/GetDutchV2OrderResponse'
import { DutchV2Order } from '../../../lib/models'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { MOCK_SIGNATURE } from '../../test-data'

describe('DutchV2 Model', () => {
  test('toEntity', () => {
    const order = new DutchV2Order(SDKDutchOrderV2Factory.buildDutchV2Order(), MOCK_SIGNATURE, ChainId.MAINNET)
    const entity: UniswapXOrderEntity = order.toEntity(ORDER_STATUS.OPEN)

    expect(entity.signature).toEqual(MOCK_SIGNATURE)
    expect(entity.encodedOrder).toEqual(order.inner.serialize())
    expect(entity.orderStatus).toEqual(ORDER_STATUS.OPEN)
    expect(entity.orderHash).toEqual(order.inner.hash())
    expect(entity.type).toEqual(OrderType.Dutch_V2)
  })

  test('fromEntity', () => {
    const order = new DutchV2Order(
      SDKDutchOrderV2Factory.buildDutchV2Order(),
      MOCK_SIGNATURE,
      ChainId.MAINNET,
      ORDER_STATUS.OPEN,
      undefined,
      undefined,
      undefined,
      100
    )
    const entity: UniswapXOrderEntity = order.toEntity(ORDER_STATUS.OPEN)
    const fromEntity = DutchV2Order.fromEntity(entity)

    expect(order).toEqual(fromEntity)
    expect(order.createdAt).toEqual(100)
  })

  test('toGetResponse', () => {
    const order = new DutchV2Order(
      SDKDutchOrderV2Factory.buildDutchV2Order(),
      MOCK_SIGNATURE,
      ChainId.MAINNET,
      ORDER_STATUS.OPEN,
      undefined,
      undefined,
      undefined,
      100
    )
    const response: GetDutchV2OrderResponse = order.toGetResponse()

    expect(response.type).toEqual(OrderType.Dutch_V2)
    expect(response.orderStatus).toEqual(order.orderStatus)
    expect(response.signature).toEqual(order.signature)
    expect(response.encodedOrder).toEqual(order.inner.serialize())
    expect(response.chainId).toEqual(order.chainId)
    expect(response.orderHash).toEqual(order.inner.hash())
    expect(response.swapper).toEqual(order.inner.info.swapper)
    expect(response.reactor).toEqual(order.inner.info.reactor)
    expect(response.deadline).toEqual(order.inner.info.deadline)
    expect(response.input.token).toEqual(order.inner.info.input.token)
    expect(response.input.startAmount).toEqual(order.inner.info.input.startAmount.toString())
    expect(response.input.endAmount).toEqual(order.inner.info.input.endAmount.toString())
    response.outputs.forEach((o, i) => {
      expect(o.startAmount).toEqual(order.inner.info.outputs[i].startAmount.toString())
      expect(o.endAmount).toEqual(order.inner.info.outputs[i].endAmount.toString())
      expect(o.token).toEqual(order.inner.info.outputs[i].token)
      expect(o.recipient).toEqual(order.inner.info.outputs[i].recipient)
    })
    expect(response.cosignature).toEqual(order.inner.info.cosignature)
    expect(response.cosignerData.decayEndTime).toEqual(order.inner.info.cosignerData.decayEndTime)
    expect(response.cosignerData.decayStartTime).toEqual(order.inner.info.cosignerData.decayStartTime)
    expect(response.cosignerData.exclusiveFiller).toEqual(order.inner.info.cosignerData.exclusiveFiller)
    expect(response.cosignerData.inputOverride).toEqual(order.inner.info.cosignerData.inputOverride.toString())
    response.cosignerData.outputOverrides.forEach((o, i) => {
      expect(o).toEqual(order.inner.info.cosignerData.outputOverrides[i].toString())
    })
    expect(order.createdAt).toEqual(100)
  })
})

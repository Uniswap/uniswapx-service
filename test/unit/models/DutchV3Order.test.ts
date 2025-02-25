import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { GetDutchV3OrderResponse } from '../../../lib/handlers/get-orders/schema/GetDutchV3OrderResponse'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderV3Factory } from '../../factories/SDKDutchOrderV3Factory'
import { MOCK_SIGNATURE } from '../../test-data'
import { DutchV3Order } from '../../../lib/models/DutchV3Order'
import { mock } from 'jest-mock-extended'
import Logger from 'bunyan'

describe('DutchV3 Model', () => {
  const log = mock<Logger>()
  test('toEntity', () => {
    const order = new DutchV3Order(SDKDutchOrderV3Factory.buildDutchV3Order(), MOCK_SIGNATURE, ChainId.ARBITRUM_ONE)
    const entity: UniswapXOrderEntity = order.toEntity(ORDER_STATUS.OPEN)

    expect(entity.signature).toEqual(MOCK_SIGNATURE)
    expect(entity.encodedOrder).toEqual(order.inner.serialize())
    expect(entity.orderStatus).toEqual(ORDER_STATUS.OPEN)
    expect(entity.orderHash).toEqual(order.inner.hash())
    expect(entity.type).toEqual(OrderType.Dutch_V3)
  })

  test('fromEntity', () => {
    const order = new DutchV3Order(
      SDKDutchOrderV3Factory.buildDutchV3Order(),
      MOCK_SIGNATURE,
      ChainId.ARBITRUM_ONE,
      ORDER_STATUS.OPEN,
      undefined,
      undefined,
      undefined,
      undefined,
      100
    )
    const entity: UniswapXOrderEntity = order.toEntity(ORDER_STATUS.OPEN)
    const fromEntity = DutchV3Order.fromEntity(entity, log)

    expect(order).toEqual(fromEntity)
    expect(order.createdAt).toEqual(100)
  })

  test('toGetResponse', () => {
    const order = new DutchV3Order(
      SDKDutchOrderV3Factory.buildDutchV3Order(),
      MOCK_SIGNATURE,
      ChainId.ARBITRUM_ONE,
      ORDER_STATUS.OPEN,
      undefined,
      undefined,
      undefined,
      undefined,
      100
    )
    const response: GetDutchV3OrderResponse = order.toGetResponse()

    expect(response.type).toEqual(OrderType.Dutch_V3)
    expect(response.orderStatus).toEqual(order.orderStatus)
    expect(response.signature).toEqual(order.signature)
    expect(response.encodedOrder).toEqual(order.inner.serialize())
    expect(response.chainId).toEqual(order.chainId)
    expect(response.startingBaseFee).toEqual(order.inner.info.startingBaseFee.toString())
    expect(response.orderHash).toEqual(order.inner.hash())
    expect(response.swapper).toEqual(order.inner.info.swapper)
    expect(response.reactor).toEqual(order.inner.info.reactor)
    expect(response.deadline).toEqual(order.inner.info.deadline)
    expect(response.input.token).toEqual(order.inner.info.input.token)
    expect(response.input.startAmount).toEqual(order.inner.info.input.startAmount.toString())
    expect(response.input.maxAmount).toEqual(order.inner.info.input.maxAmount.toString())
    expect(response.input.adjustmentPerGweiBaseFee).toEqual(order.inner.info.input.adjustmentPerGweiBaseFee.toString())
    expect(JSON.stringify(response.input.curve.relativeAmounts)).toEqual(
      JSON.stringify(order.inner.info.input.curve.relativeAmounts)
    )
    expect(JSON.stringify(response.input.curve.relativeBlocks)).toEqual(
      JSON.stringify(order.inner.info.input.curve.relativeBlocks)
    )
    response.outputs.forEach((o, i) => {
      expect(o.startAmount).toEqual(order.inner.info.outputs[i].startAmount.toString())
      expect(o.token).toEqual(order.inner.info.outputs[i].token)
      expect(o.recipient).toEqual(order.inner.info.outputs[i].recipient)
      expect(o.minAmount).toEqual(order.inner.info.outputs[i].minAmount.toString())
      expect(o.adjustmentPerGweiBaseFee).toEqual(order.inner.info.outputs[i].adjustmentPerGweiBaseFee.toString())
      expect(JSON.stringify(o.curve.relativeAmounts)).toEqual(
        JSON.stringify(order.inner.info.outputs[i].curve.relativeAmounts)
      )
      expect(JSON.stringify(o.curve.relativeBlocks)).toEqual(
        JSON.stringify(order.inner.info.outputs[i].curve.relativeBlocks)
      )
    })
    expect(response.cosignature).toEqual(order.inner.info.cosignature)
    expect(response.cosignerData.decayStartBlock).toEqual(order.inner.info.cosignerData.decayStartBlock)
    expect(response.cosignerData.exclusiveFiller).toEqual(order.inner.info.cosignerData.exclusiveFiller)
    expect(response.cosignerData.inputOverride).toEqual(order.inner.info.cosignerData.inputOverride.toString())
    response.cosignerData.outputOverrides.forEach((o, i) => {
      expect(o).toEqual(order.inner.info.cosignerData.outputOverrides[i].toString())
    })
    expect(order.createdAt).toEqual(100)
  })
})

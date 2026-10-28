import { OrderType } from '@uniswap/uniswapx-sdk'
import { DutchV2OrderEntity, ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { DutchV2Order } from '../../../lib/models/DutchV2Order'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { MOCK_SIGNATURE } from '../../test-data'
import { toOrderEntity } from '../../../lib/core/orders/storedRow'

describe('DutchV2 Model', () => {
  test('toEntity', () => {
    const decayStartTime = 1_800_000_000
    const sdkOrder = SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, {
      deadline: decayStartTime + 240,
      cosignerData: { decayStartTime, decayEndTime: decayStartTime + 60 },
    })
    const order = new DutchV2Order(sdkOrder, MOCK_SIGNATURE, ChainId.MAINNET)
    const entity: UniswapXOrderEntity = toOrderEntity(order)

    expect(entity.signature).toEqual(MOCK_SIGNATURE)
    expect(entity.encodedOrder).toEqual(order.inner.serialize())
    expect(entity.orderStatus).toEqual(ORDER_STATUS.OPEN)
    expect(entity.orderHash).toEqual(order.inner.hash())
    expect(entity.type).toEqual(OrderType.Dutch_V2)
    // decay runs over the cosigner's window; the order then sits at its end amounts until the deadline
    expect((entity as DutchV2OrderEntity).decayStartTime).toEqual(order.inner.info.cosignerData.decayStartTime)
    expect((entity as DutchV2OrderEntity).decayEndTime).toEqual(order.inner.info.cosignerData.decayEndTime)
    expect((entity as DutchV2OrderEntity).deadline).toEqual(order.inner.info.deadline)
  })
})

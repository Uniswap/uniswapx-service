import { OrderType } from '@uniswap/uniswapx-sdk'
import { ORDER_STATUS, UniswapXOrderEntity } from '../../../lib/entities'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderV3Factory } from '../../factories/SDKDutchOrderV3Factory'
import { MOCK_SIGNATURE } from '../../test-data'
import { DutchV3Order } from '../../../lib/models/DutchV3Order'
import { toOrderEntity } from '../../../lib/core/orders/storedRow'

describe('DutchV3 Model', () => {
  test('toEntity', () => {
    const order = new DutchV3Order(SDKDutchOrderV3Factory.buildDutchV3Order(), MOCK_SIGNATURE, ChainId.ARBITRUM_ONE)
    const entity: UniswapXOrderEntity = toOrderEntity(order)

    expect(entity.signature).toEqual(MOCK_SIGNATURE)
    expect(entity.encodedOrder).toEqual(order.inner.serialize())
    expect(entity.orderStatus).toEqual(ORDER_STATUS.OPEN)
    expect(entity.orderHash).toEqual(order.inner.hash())
    expect(entity.type).toEqual(OrderType.Dutch_V3)
  })
})

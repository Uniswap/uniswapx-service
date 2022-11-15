import { TABLE_KEY } from '../../lib/config/dynamodb'
import { getValidKeys } from '../../lib/entities'

describe('Testing getValidKeys', () => {
  it.each([
    ['offererIndex', [TABLE_KEY.OFFERER, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]],
    ['orderStatusIndex', [TABLE_KEY.ORDER_STATUS, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]],
    ['sellTokenIndex', [TABLE_KEY.SELL_TOKEN, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]],
    ['offererOrderStatusIndex', [TABLE_KEY.OFFERER_ORDER_STATUS, TABLE_KEY.SELL_TOKEN, TABLE_KEY.ORDER_HASH]],
    ['offererSellTokenIndex', [TABLE_KEY.OFFERER_SELL_TOKEN, TABLE_KEY.ORDER_HASH]],
    ['sellTokenOrderStatusIndex', [TABLE_KEY.SELL_TOKEN_ORDER_STATUS, TABLE_KEY.ORDER_HASH]],
    ['default', [TABLE_KEY.ORDER_HASH]],
  ])('should return valid keys for %p', async (index, keys) => {
    expect(getValidKeys(index)).toEqual(keys)
  })
})

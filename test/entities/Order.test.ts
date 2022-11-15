import { TABLE_KEY } from '../../lib/config/dynamodb'
import { getValidKeys } from '../../lib/entities'

describe('Testing getValidKeys', () => {
  it.each([
    ['offerer-createdAt-index', [TABLE_KEY.OFFERER, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]],
    ['orderStatus-createdAt-index', [TABLE_KEY.ORDER_STATUS, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]],
    ['sellToken-createdAt-index', [TABLE_KEY.SELL_TOKEN, TABLE_KEY.CREATED_AT, TABLE_KEY.ORDER_HASH]],
    [
      'offererOrderStatus-createdAt-index',
      [TABLE_KEY.OFFERER_ORDER_STATUS, TABLE_KEY.SELL_TOKEN, TABLE_KEY.ORDER_HASH, TABLE_KEY.CREATED_AT],
    ],
    ['offererSellToken-createdAt-index', [TABLE_KEY.OFFERER_SELL_TOKEN, TABLE_KEY.ORDER_HASH, TABLE_KEY.CREATED_AT]],
    [
      'sellTokenOrderStatus-createdAt-index',
      [TABLE_KEY.SELL_TOKEN_ORDER_STATUS, TABLE_KEY.ORDER_HASH, TABLE_KEY.CREATED_AT],
    ],
    ['default', [TABLE_KEY.ORDER_HASH]],
  ])('should return valid keys for %p', async (index, keys) => {
    expect(getValidKeys(index)).toEqual(keys)
  })
})

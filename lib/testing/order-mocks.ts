import { ORDER_STATUS } from '../entities'

export const MOCK_ORDER_1 = {
  orderHash: '0x1',
  offerer: 'hayden.eth',
  encodedOrder: 'order1',
  signature: 'sig1',
  nonce: '1',
  orderStatus: ORDER_STATUS.OPEN,
  sellToken: 'weth',
  offererOrderStatus: `hayden.eth-${ORDER_STATUS.OPEN}`,
  offererSellToken: 'hayden.eth-weth',
  sellTokenOrderStatus: `weth-${ORDER_STATUS.OPEN}`,
}

export const MOCK_ORDER_2 = {
  orderHash: '0x2',
  offerer: 'riley.eth',
  encodedOrder: 'order2',
  signature: 'sig2',
  nonce: '2',
  orderStatus: ORDER_STATUS.OPEN,
  sellToken: 'uni',
  offererOrderStatus: `riley.eth-${ORDER_STATUS.OPEN}`,
  offererSellToken: 'riley.eth-uni',
  sellTokenOrderStatus: `uni-${ORDER_STATUS.OPEN}`,
}

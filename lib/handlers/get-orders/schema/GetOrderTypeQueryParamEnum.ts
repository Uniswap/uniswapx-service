import { OrderType } from '@uniswap/uniswapx-sdk'

export enum GetOderTypeQueryParamEnum {
  Dutch = OrderType.Dutch,
  Dutch_V2 = OrderType.Dutch_V2,
  Relay = OrderType.Relay,
  Limit = OrderType.Limit,

  Dutch_V1_V2 = 'Dutch_V1_V2',
}

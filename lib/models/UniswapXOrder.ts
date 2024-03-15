import { DutchV1Order } from './DutchV1Order'
import { DutchV2Order } from './DutchV2Order'
import { LimitOrder } from './LimitOrder'

export type UniswapXOrder = DutchV1Order | LimitOrder | DutchV2Order

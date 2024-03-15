import { OrderType } from '@uniswap/uniswapx-sdk'
import { UnexpectedOrderTypeError } from '../../../lib/errors/UnexpectedOrderTypeError'

describe('UnexpectedErrorTypeError', () => {
  it('encodes the order type into the message', () => {
    expect(() => {
      throw new UnexpectedOrderTypeError(OrderType.Relay)
    }).toEqual('unexpected order type: Relay')
  })
})

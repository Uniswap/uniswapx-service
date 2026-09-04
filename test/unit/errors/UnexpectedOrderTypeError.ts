import { OrderType } from '@uniswap/uniswapx-sdk'
import { UnexpectedOrderTypeError } from '../../../lib/errors/UnexpectedOrderTypeError'

describe('UnexpectedErrorTypeError', () => {
  it('encodes the order type into the message', () => {
    expect(() => {
      throw new UnexpectedOrderTypeError(OrderType.Priority)
    }).toEqual('unexpected order type: Priority')
  })
})

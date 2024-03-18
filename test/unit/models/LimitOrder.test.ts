import { OrderType } from '@uniswap/uniswapx-sdk'
import { BigNumber } from 'ethers'
import { ORDER_STATUS } from '../../../lib/entities'
import { LimitOrder } from '../../../lib/models/LimitOrder'
import { ChainId } from '../../../lib/util/chain'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { QUOTE_ID, SIGNATURE, Tokens } from '../fixtures'

describe('LimitOrder', () => {
  const nowInSeconds = Date.now()
  const futureTime = nowInSeconds + 30

  it('builds an order from the SDK DutchOrder', () => {
    const sdkOrder = SDKDutchOrderFactory.buildLimitOrder(ChainId.MAINNET, {
      deadline: futureTime,
      decayEndTime: futureTime,
      decayStartTime: nowInSeconds,
      swapper: '0x0000000000000000000000000000000000000001',
      nonce: '500',
      input: {
        token: Tokens.MAINNET.USDC,
        startAmount: '9000000',
        endAmount: '3000000',
      },
      outputs: [
        {
          token: Tokens.MAINNET.UNI,
          startAmount: '1000000000000000000',
          endAmount: '1000000000000000000',
          recipient: '0x0000000000000000000000000000000000000005',
        },
      ],
    })

    const order = LimitOrder.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, ORDER_STATUS.OPEN, QUOTE_ID)

    expect(order.chainId).toEqual(ChainId.MAINNET)
    expect(order.orderType).toEqual(OrderType.Limit)
    expect(order.signature).toEqual(SIGNATURE)

    expect(order.deadline).toEqual(futureTime)
    expect(order.decayEndTime).toEqual(futureTime)
    expect(order.decayStartTime).toEqual(nowInSeconds)

    expect(order.offerer).toEqual('0x0000000000000000000000000000000000000001')
    expect(order.nonce).toEqual(BigNumber.from('500'))

    expect(order.input).toEqual({
      token: Tokens.MAINNET.USDC,
      startAmount: BigNumber.from('9000000'),
      endAmount: BigNumber.from('3000000'),
    })

    expect(order.outputs).toEqual([
      {
        token: Tokens.MAINNET.UNI,
        startAmount: BigNumber.from('1000000000000000000'),
        endAmount: BigNumber.from('1000000000000000000'),
        recipient: '0x0000000000000000000000000000000000000005',
      },
    ])
    expect(order.orderStatus).toEqual(ORDER_STATUS.OPEN)
    expect(order.quoteId).toEqual(QUOTE_ID)
  })

  it('to/fromEntity - single output', () => {
    const nowInSeconds = Date.now()
    const futureTime = nowInSeconds + 30

    const sdkOrder = SDKDutchOrderFactory.buildDutchOrder(ChainId.MAINNET, {
      deadline: futureTime,
      decayEndTime: futureTime,
      decayStartTime: nowInSeconds,
      swapper: '0x0000000000000000000000000000000000000001',
      nonce: '500',
      input: {
        token: Tokens.MAINNET.USDC,
        startAmount: '3000000',
        endAmount: '3000000',
      },
      outputs: [
        {
          token: Tokens.MAINNET.UNI,
          startAmount: '1000000000000000000',
          endAmount: '1000000000000000000',
          recipient: '0x0000000000000000000000000000000000000000',
        },
      ],
    })
    const order = LimitOrder.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, ORDER_STATUS.OPEN, QUOTE_ID)

    const orderEntity = order.toEntity()

    expect(orderEntity).toEqual({
      chainId: 1,
      deadline: futureTime,
      decayEndTime: futureTime,
      decayStartTime: nowInSeconds,
      encodedOrder: sdkOrder.serialize(),
      filler: '0x0000000000000000000000000000000000000000',
      input: {
        endAmount: '3000000',
        startAmount: '3000000',
        token: Tokens.MAINNET.USDC,
      },
      nonce: '500',
      offerer: '0x0000000000000000000000000000000000000001',
      orderHash: sdkOrder.hash().toLowerCase(),
      orderStatus: 'open',
      outputs: [
        {
          endAmount: '1000000000000000000',
          recipient: '0x0000000000000000000000000000000000000000',
          startAmount: '1000000000000000000',
          token: Tokens.MAINNET.UNI,
        },
      ],
      quoteId: QUOTE_ID,
      reactor: '0x6000da47483062a0d734ba3dc7576ce6a0b645c4',
      signature: SIGNATURE,
      type: 'Limit',
    })

    expect(LimitOrder.fromEntity(orderEntity)).toEqual(order)
  })

  it('toEntity - multiple outputs', () => {
    const nowInSeconds = Date.now()
    const futureTime = nowInSeconds + 30

    const sdkOrder = SDKDutchOrderFactory.buildDutchOrder(ChainId.MAINNET, {
      deadline: futureTime,
      decayEndTime: futureTime,
      decayStartTime: nowInSeconds,
      swapper: '0x0000000000000000000000000000000000000001',
      nonce: '500',
      input: {
        token: Tokens.MAINNET.USDC,
        startAmount: '3000000',
        endAmount: '3000000',
      },
      outputs: [
        {
          token: Tokens.MAINNET.UNI,
          startAmount: '1000000000000000000',
          endAmount: '1000000000000000000',
          recipient: '0x0000000000000000000000000000000000000000',
        },
        {
          token: Tokens.MAINNET.WETH,
          startAmount: '2000000000000000000',
          endAmount: '2000000000000000000',
          recipient: '0x0000000000000000000000000000000000000003',
        },
      ],
    })
    const order = LimitOrder.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, ORDER_STATUS.OPEN, QUOTE_ID)

    const orderEntity = order.toEntity()

    expect(orderEntity).toEqual({
      chainId: 1,
      deadline: futureTime,
      decayEndTime: futureTime,
      decayStartTime: nowInSeconds,
      encodedOrder: sdkOrder.serialize(),
      filler: '0x0000000000000000000000000000000000000000',
      input: {
        endAmount: '3000000',
        startAmount: '3000000',
        token: Tokens.MAINNET.USDC,
      },
      nonce: '500',
      offerer: '0x0000000000000000000000000000000000000001',
      orderHash: sdkOrder.hash().toLowerCase(),
      orderStatus: 'open',
      outputs: [
        {
          endAmount: '1000000000000000000',
          recipient: '0x0000000000000000000000000000000000000000',
          startAmount: '1000000000000000000',
          token: Tokens.MAINNET.UNI,
        },
        {
          endAmount: '2000000000000000000',
          recipient: '0x0000000000000000000000000000000000000003',
          startAmount: '2000000000000000000',
          token: Tokens.MAINNET.WETH,
        },
      ],
      quoteId: QUOTE_ID,
      reactor: '0x6000da47483062a0d734ba3dc7576ce6a0b645c4',
      signature: SIGNATURE,
      type: 'Limit',
    })
    expect(LimitOrder.fromEntity(orderEntity)).toEqual(order)
  })

  it('toSDK - single output', () => {
    const nowInSeconds = Date.now()
    const futureTime = nowInSeconds + 30

    const sdkOrder = SDKDutchOrderFactory.buildDutchOrder(ChainId.MAINNET, {
      deadline: futureTime,
      decayEndTime: futureTime,
      decayStartTime: nowInSeconds,
      swapper: '0x0000000000000000000000000000000000000001',
      nonce: '500',
      input: {
        token: Tokens.MAINNET.USDC,
        startAmount: '3000000',
        endAmount: '3000000',
      },
      outputs: [
        {
          token: Tokens.MAINNET.UNI,
          startAmount: '1000000000000000000',
          endAmount: '1000000000000000000',
          recipient: '0x0000000000000000000000000000000000000000',
        },
      ],
    })
    const order = LimitOrder.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, ORDER_STATUS.OPEN, QUOTE_ID)
    expect(order.toSDK()).toEqual(sdkOrder)
  })

  it('toSDK - multiple outputs', () => {
    const nowInSeconds = Date.now()
    const futureTime = nowInSeconds + 30

    const sdkOrder = SDKDutchOrderFactory.buildDutchOrder(ChainId.MAINNET, {
      deadline: futureTime,
      decayEndTime: futureTime,
      decayStartTime: nowInSeconds,
      swapper: '0x0000000000000000000000000000000000000001',
      nonce: '500',
      input: {
        token: Tokens.MAINNET.USDC,
        startAmount: '3000000',
        endAmount: '3000000',
      },
      outputs: [
        {
          token: Tokens.MAINNET.UNI,
          startAmount: '1000000000000000000',
          endAmount: '1000000000000000000',
          recipient: '0x0000000000000000000000000000000000000000',
        },
        {
          token: Tokens.MAINNET.WETH,
          startAmount: '2000000000000000000',
          endAmount: '2000000000000000000',
          recipient: '0x0000000000000000000000000000000000000003',
        },
      ],
    })
    const order = LimitOrder.fromSDK(ChainId.MAINNET, SIGNATURE, sdkOrder, ORDER_STATUS.OPEN, QUOTE_ID)
    expect(order.toSDK()).toEqual(sdkOrder)
  })
})

import { BigNumber } from 'ethers'
import { ChainId } from '../../lib/util/chain'
import { SDKHybridOrderFactory } from './SDKHybridOrderFactory'

describe('SDKHybridOrderFactory', () => {
  it('smoke test - builds a default Hybrid Order', () => {
    expect(SDKHybridOrderFactory.buildHybridOrder()).toBeDefined()
  })

  it('respects auctionTargetBlock overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      cosignerData: {
        auctionTargetBlock: '20000000',
      },
    })
    expect(actual.info.cosignerData.auctionTargetBlock).toEqual(BigNumber.from(20000000))
  })

  it('respects auctionStartBlock overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      auctionStartBlock: '20000000',
    })
    expect(actual.info.auctionStartBlock).toEqual(BigNumber.from('20000000'))
  })

  it('respects baselinePriorityFeeWei overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      baselinePriorityFeeWei: '5000000000',
    })
    expect(actual.info.baselinePriorityFeeWei).toEqual(BigNumber.from('5000000000'))
  })

  it('respects scalingFactor overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      scalingFactor: '1500000000000000000',
    })
    expect(actual.info.scalingFactor).toEqual(BigNumber.from('1500000000000000000'))
  })

  it('respects priceCurve overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      priceCurve: ['100', '200', '300'],
    })
    expect(actual.info.priceCurve).toEqual([BigNumber.from('100'), BigNumber.from('200'), BigNumber.from('300')])
  })

  it('respects empty priceCurve (priority-only mode)', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      priceCurve: [],
    })
    expect(actual.info.priceCurve).toEqual([])
  })

  it('respects supplementalPriceCurve overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      cosignerData: {
        supplementalPriceCurve: ['400', '500', '600'],
      },
    })
    expect(actual.info.cosignerData.supplementalPriceCurve).toEqual([
      BigNumber.from('400'),
      BigNumber.from('500'),
      BigNumber.from('600'),
    ])
  })

  it('respects input token overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      input: {
        token: '0xabc',
      },
    })
    expect(actual.info.input.token).toEqual('0xabc')
  })

  it('respects input maxAmount overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      input: {
        maxAmount: '5000000',
      },
    })
    expect(actual.info.input.maxAmount).toEqual(BigNumber.from('5000000'))
  })

  it('respects single output overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      outputs: [
        {
          token: '0xdef',
          minAmount: '2000000000000000000',
          recipient: '0x123',
        },
      ],
    })
    expect(actual.info.outputs).toEqual([
      {
        token: '0xdef',
        minAmount: BigNumber.from('2000000000000000000'),
        recipient: '0x123',
      },
    ])
  })

  it('respects partial output overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      outputs: [
        {
          token: '0xabc',
        },
      ],
    })
    expect(actual.info.outputs.length).toEqual(1)
    expect(actual.info.outputs[0].token).toEqual('0xabc')
  })

  it('respects multiple output overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      outputs: [
        {
          token: '0xabc',
          minAmount: '3000000000000000000',
          recipient: '0xdef',
        },
        {
          token: '0xghi',
          minAmount: '4000000000000000000',
          recipient: '0xjkl',
        },
      ],
    })
    expect(actual.info.outputs).toEqual([
      {
        token: '0xabc',
        minAmount: BigNumber.from('3000000000000000000'),
        recipient: '0xdef',
      },
      {
        token: '0xghi',
        minAmount: BigNumber.from('4000000000000000000'),
        recipient: '0xjkl',
      },
    ])
  })

  it('respects nonce overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      nonce: '1000',
    })
    expect(actual).toBeDefined()
    expect(actual.info.nonce).toEqual(BigNumber.from('1000'))
  })

  it('respects swapper overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      swapper: '0x1234567890123456789012345678901234567890',
    })
    expect(actual.info.swapper).toEqual('0x1234567890123456789012345678901234567890')
  })

  it('respects cosigner overrides', () => {
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      cosigner: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    })
    expect(actual.info.cosigner).toEqual('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
  })

  it('respects deadline overrides', () => {
    const deadline = Math.floor(Date.now() / 1000) + 100
    const actual = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET, {
      deadline,
    })
    expect(actual.info.deadline).toEqual(deadline)
  })

  it('builds with different chainIds', () => {
    const mainnetOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.MAINNET)
    expect(mainnetOrder.chainId).toEqual(ChainId.MAINNET)

    const arbitrumOrder = SDKHybridOrderFactory.buildHybridOrder(ChainId.ARBITRUM_ONE)
    expect(arbitrumOrder.chainId).toEqual(ChainId.ARBITRUM_ONE)
  })
})

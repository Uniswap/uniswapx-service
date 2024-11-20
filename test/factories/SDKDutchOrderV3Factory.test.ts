import { BigNumber } from 'ethers'
import { SDKDutchOrderV3Factory } from './SDKDutchOrderV3Factory'
import { ChainId } from '../../lib/util/chain'

describe('SDKDutchOrderV3Factory', () => {
  it('smoke test - builds a default DutchV3 Order', () => {
    expect(SDKDutchOrderV3Factory.buildDutchV3Order()).toBeDefined()
  })

  it('respects decayStartBlock overrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosignerData: {
        decayStartBlock: 20000000,
      },
    })
    expect(actual.info.cosignerData.decayStartBlock).toEqual(20000000)
  })

  it('respects startingBaseFee overrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      startingBaseFee: '20000000',
    })
    expect(actual.info.startingBaseFee).toEqual(BigNumber.from('20000000'))
  })

  it('respects input startAmount overrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      input: {
        startAmount: '20000000',
      },
    })
    expect(actual.info.input.startAmount).toEqual(BigNumber.from('20000000'))
  })

  it('respects input curve overrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      input: {
        curve: {
          relativeBlocks: [1, 2, 3],
          relativeAmounts: [BigInt(4), BigInt(5), BigInt(6)],
        },
      },
    })
    expect(actual.info.input.curve).toEqual({
      relativeBlocks: [1, 2, 3],
      relativeAmounts: [BigInt(4), BigInt(5), BigInt(6)],
    })
  })

  it('respects input maxAmount overrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      input: {
        maxAmount: '5000',
      },
    })
    expect(actual.info.input.maxAmount).toEqual(BigNumber.from('5000'))
  })

  it('respects input adjustmentPerGweiBaseFee overrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      input: {
        adjustmentPerGweiBaseFee: '5000',
      },
    })
    expect(actual.info.input.adjustmentPerGweiBaseFee).toEqual(BigNumber.from('5000'))
  })

  it('respects input cosignerData inputOveride', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosignerData: {
        inputOverride: '5000',
      },
    })
    expect(actual.info.cosignerData.inputOverride).toEqual(BigNumber.from('5000'))
  })

  it('respects single output overrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      outputs: [
        {
          token: '0xabc',
          startAmount: '4000000000000000000',
          minAmount: '3000000000000000000',
          adjustmentPerGweiBaseFee: '5000',
          curve: {
            relativeBlocks: [1, 2, 3],
            relativeAmounts: [BigInt(4), BigInt(5), BigInt(6)],
          },
          recipient: '0xdef',
        },
      ],
      cosignerData: { outputOverrides: ['4000000000000000000'] },
    })
    expect(actual.info.outputs).toEqual([
      {
        token: '0xabc',
        startAmount: BigNumber.from('4000000000000000000'),
        minAmount: BigNumber.from('3000000000000000000'),
        adjustmentPerGweiBaseFee: BigNumber.from('5000'),
        curve: {
          relativeBlocks: [1, 2, 3],
          relativeAmounts: [BigInt(4), BigInt(5), BigInt(6)],
        },
        recipient: '0xdef',
      },
    ])
  })

  it('respects partial output overrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
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
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      outputs: [
        {
          token: '0xabc',
          startAmount: '4000000000000000000',
          minAmount: BigNumber.from('3000000000000000000'),
          adjustmentPerGweiBaseFee: BigNumber.from('5000'),
          curve: {
            relativeBlocks: [1, 2, 3],
            relativeAmounts: [BigInt(4), BigInt(5), BigInt(6)],
          },
          recipient: '0xdef',
        },
        {
          token: '0xghi',
          startAmount: '6000000000000000000',
          minAmount: BigNumber.from('5000000000000000000'),
          adjustmentPerGweiBaseFee: BigNumber.from('5000'),
          curve: {
            relativeBlocks: [1, 2, 3],
            relativeAmounts: [BigInt(4), BigInt(5), BigInt(6)],
          },
          recipient: '0xjkl',
        },
      ],
      cosignerData: { outputOverrides: ['4000000000000000000', '6000000000000000000'] },
    })
    expect(actual.info.outputs).toEqual([
      {
        token: '0xabc',
        startAmount: BigNumber.from('4000000000000000000'),
        minAmount: BigNumber.from('3000000000000000000'),
        adjustmentPerGweiBaseFee: BigNumber.from('5000'),
        curve: {
          relativeBlocks: [1, 2, 3],
          relativeAmounts: [BigInt(4), BigInt(5), BigInt(6)],
        },
        recipient: '0xdef',
      },
      {
        token: '0xghi',
        startAmount: BigNumber.from('6000000000000000000'),
        minAmount: BigNumber.from('5000000000000000000'),
        adjustmentPerGweiBaseFee: BigNumber.from('5000'),
        curve: {
          relativeBlocks: [1, 2, 3],
          relativeAmounts: [BigInt(4), BigInt(5), BigInt(6)],
        },
        recipient: '0xjkl',
      },
    ])
  })

  it('respects outputOverrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosignerData: {
        outputOverrides: ['3000000000000000000'],
      },
    })

    expect(actual.info.cosignerData.outputOverrides).toEqual([BigNumber.from('3000000000000000000')])
  })

  it('respects nonce overrides', () => {
    const actual = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      nonce: '1000',
    })
    expect(actual).toBeDefined()
    expect(actual.info.nonce).toEqual(BigNumber.from('1000'))
  })
})

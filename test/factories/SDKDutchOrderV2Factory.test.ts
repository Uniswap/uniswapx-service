import { BigNumber } from 'ethers'
import { SDKDutchOrderV2Factory } from './SDKDutchOrderV2Factory'

describe('SDKDutchOrderV2Factory', () => {
  it.only('smoke test - builds a default DutchV2 Order', () => {
    expect(SDKDutchOrderV2Factory.buildDutchV2Order()).toBeDefined()
  })

  it('smoke test - builds a non-mainnet DutchV2 Order', () => {
    expect(SDKDutchOrderV2Factory.buildDutchV2Order(137)).toBeDefined()
  })

  it('respects input startAmount overrides', () => {
    const actual = SDKDutchOrderV2Factory.buildDutchV2Order(1, {
      input: {
        startAmount: '200000',
      },
    })
    expect(actual.info.input.startAmount).toEqual(BigNumber.from('200000'))
  })

  it('respects input endAmount overrides', () => {
    const actual = SDKDutchOrderV2Factory.buildDutchV2Order(1, {
      input: {
        endAmount: '400000',
      },
    })
    expect(actual.info.input.endAmount).toEqual(BigNumber.from('400000'))
  })

  it('respects input cosignerData inputOveride', () => {
    const actual = SDKDutchOrderV2Factory.buildDutchV2Order(1, {
      cosignerData: {
        inputOverride: '50000000',
      },
    })
    expect(actual.info.cosignerData.inputOverride).toEqual(BigNumber.from('50000000'))
  })

  it('respects single output overrides', () => {
    const actual = SDKDutchOrderV2Factory.buildDutchV2Order(1, {
      outputs: [
        {
          token: '0xabc',
          startAmount: '4000000000000000000',
          endAmount: '3000000000000000000',
          recipient: '0xdef',
        },
      ],
    })
    expect(actual.info.outputs).toEqual([
      {
        token: '0xabc',
        startAmount: BigNumber.from('4000000000000000000'),
        endAmount: BigNumber.from('3000000000000000000'),
        recipient: '0xdef',
      },
    ])
  })

  it('respects partial output overrides', () => {
    const actual = SDKDutchOrderV2Factory.buildDutchV2Order(1, {
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
    const actual = SDKDutchOrderV2Factory.buildDutchV2Order(1, {
      outputs: [
        {
          token: '0xabc',
          startAmount: '4000000000000000000',
          endAmount: '3000000000000000000',
          recipient: '0xdef',
        },
        {
          token: '0xghi',
          startAmount: '6000000000000000000',
          endAmount: '5000000000000000000',
          recipient: '0xjkl',
        },
      ],
    })
    expect(actual.info.outputs).toEqual([
      {
        token: '0xabc',
        startAmount: BigNumber.from('4000000000000000000'),
        endAmount: BigNumber.from('3000000000000000000'),
        recipient: '0xdef',
      },
      {
        token: '0xghi',
        startAmount: BigNumber.from('6000000000000000000'),
        endAmount: BigNumber.from('5000000000000000000'),
        recipient: '0xjkl',
      },
    ])
  })

  it('respects outputOverrides', () => {
    const actual = SDKDutchOrderV2Factory.buildDutchV2Order(1, {
      cosignerData: {
        outputOverrides: ['3000000'],
      },
    })

    expect(actual.info.cosignerData.outputOverrides).toEqual([BigNumber.from('3000000')])
  })

  it('respects nonce overrides', () => {
    const actual = SDKDutchOrderV2Factory.buildDutchV2Order(1, {
      nonce: '1000',
    })
    expect(actual).toBeDefined()
    expect(actual.info.nonce).toEqual(BigNumber.from('1000'))
  })
})

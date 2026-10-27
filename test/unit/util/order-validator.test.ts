import {
  CosignedPriorityOrder,
  CosignedV2DutchOrder,
  CosignedV3DutchOrder,
  DutchOrder,
  OrderType,
  REACTOR_ADDRESS_MAPPING,
} from '@uniswap/uniswapx-sdk'
import dotenv from 'dotenv'
import { BigNumber } from 'ethers'
import { ChainId, SUPPORTED_CHAINS } from '../../../lib/util/chain'
import { ONE_DAY_IN_SECONDS, ONE_YEAR_IN_SECONDS } from '../../../lib/util/constants'
import { OffChainUniswapXOrderValidator } from '../../../lib/util/OffChainUniswapXOrderValidator'
import { SDKDutchOrderFactory } from '../../factories/SDKDutchOrderV1Factory'
import { SDKDutchOrderV2Factory } from '../../factories/SDKDutchOrderV2Factory'
import { SDKDutchOrderV3Factory } from '../../factories/SDKDutchOrderV3Factory'
import { SDKPriorityOrderFactory } from '../../factories/SDKPriorityOrderFactory'
import { Tokens } from '../fixtures'

dotenv.config()

// The cosigners the validator accepts, fixed here so no case depends on a .env.
const COSIGNER = '0x0000000000000000000000000000000000001105'
const PRIORITY_COSIGNER = '0x0000000000000000000000000000000000002205'
process.env.LABS_COSIGNER = COSIGNER
process.env.LABS_PRIORITY_COSIGNER = PRIORITY_COSIGNER

const CURRENT_TIME = 10
const validationProvider = new OffChainUniswapXOrderValidator(() => CURRENT_TIME, ONE_DAY_IN_SECONDS)
const INPUT_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000022'
const OUTPUT_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000033'
const EXCLUSIVE_FILLER = '0x0000000000000000000000000000000000000044'
const ONE_DAY = 60 * 60 * 24
const SWAPPER = '0x0000000000000000000000000000000000032100'
const RECIPIENT = '0x0000000000000000000000000000000000045600'
const INPUT = { token: INPUT_TOKEN_ADDRESS, startAmount: BigNumber.from('1'), endAmount: BigNumber.from('2') }
const OUTPUT = {
  token: OUTPUT_TOKEN_ADDRESS,
  startAmount: BigNumber.from('3'),
  endAmount: BigNumber.from('2'),
  recipient: RECIPIENT,
}
const REACTOR = REACTOR_ADDRESS_MAPPING[1][OrderType.Dutch]
const VALIDATION_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000'
const VALIDATION_DATA = '0x'

function newOrder({
  decayStartTime = 5,
  deadline = 20,
  exclusiveFiller = EXCLUSIVE_FILLER,
  exclusivityOverrideBps = BigNumber.from(0),
  nonce = BigNumber.from(30),
  swapper = SWAPPER,
  input = INPUT,
  output = OUTPUT,
  reactor = REACTOR as string,
  chainId = 1,
  additionalValidationContract = VALIDATION_CONTRACT_ADDRESS,
  additionalValidationData = VALIDATION_DATA,
}): DutchOrder {
  return new DutchOrder(
    {
      decayStartTime,
      decayEndTime: deadline,
      exclusiveFiller,
      exclusivityOverrideBps,
      deadline,
      nonce,
      swapper,
      input,
      outputs: [output],
      reactor,
      additionalValidationContract,
      additionalValidationData,
    },
    chainId
  )
}

describe('Testing off chain validation', () => {
  describe('Testing orderType', () => {
    it('Should set orderType with CosignedV2DutchOrder', () => {
      const order = SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, { cosigner: process.env.LABS_COSIGNER })
      const validationResp = new OffChainUniswapXOrderValidator(() => Date.now() / 1000, ONE_DAY_IN_SECONDS).validate(
        order
      )
      expect(validationResp).toEqual({ valid: true })
    })

    it('Should set orderType with DutchOrder', () => {
      const order = SDKDutchOrderFactory.buildDutchOrder()
      const validationResp = new OffChainUniswapXOrderValidator(() => Date.now() / 1000, ONE_DAY_IN_SECONDS).validate(
        order
      )
      expect(validationResp).toEqual({ valid: true })
    })

    it('Should throw with invalid orderType', () => {
      const order = SDKDutchOrderV2Factory.buildDutchV2Order()
      const noInstanceOrder = { ...order }
      const validationResp = new OffChainUniswapXOrderValidator(() => Date.now() / 1000, ONE_DAY_IN_SECONDS).validate(
        noInstanceOrder as any
      )
      expect(validationResp).toEqual({ valid: false, errorString: 'Invalid orderType' })
    })
  })

  describe('Testing deadline', () => {
    it('Testing deadline < current time.', async () => {
      const order = newOrder({ deadline: 9 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ errorString: 'Deadline must be in the future', valid: false })
    })
    it('Testing deadline longer than one day', async () => {
      const order = newOrder({ deadline: CURRENT_TIME + ONE_DAY + 1 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString: 'Deadline field invalid: Order expiry cannot be larger than 1440 minutes',
        valid: false,
      })
    })
    it('Testing valid deadline.', async () => {
      const order = newOrder({ deadline: CURRENT_TIME + ONE_DAY })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ valid: true })
    })
  })

  describe('Testing decayStartTime', () => {
    it('Testing parsed decayStartTime > deadline.', async () => {
      const order = newOrder({ deadline: 20, decayStartTime: 21 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ errorString: 'Invalid decayStartTime: decayStartTime > deadline', valid: false })
    })
    it('Testing parsed decayStartTime > deadline but ignored', async () => {
      const order = newOrder({ deadline: 20, decayStartTime: 21 })
      const validationProvider = new OffChainUniswapXOrderValidator(() => CURRENT_TIME, ONE_DAY_IN_SECONDS, {
        SkipDecayStartTimeValidation: true,
      })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ valid: true })
    })
    it('Testing parsed decayStartTime == deadline.', async () => {
      const order = newOrder({ deadline: 20, decayStartTime: 20 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ valid: true })
    })
    it('Testing parsed decayStartTime < deadline.', async () => {
      const order = newOrder({ deadline: 20, decayStartTime: 10 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ valid: true })
    })
  })

  describe('Testing swapper', () => {
    it('Testing invalid parsed swapper.', async () => {
      const order = newOrder({ swapper: '0xbad_actor' })
      const validationResp = validationProvider.validate(order)

      expect(validationResp).toEqual({
        errorString: 'Invalid swapper: ValidationError: VALIDATION ERROR: Invalid address',
        valid: false,
      })
    })
  })

  describe('Testing reactor', () => {
    it('Testing invalid parsed reactor.', async () => {
      const order = newOrder({ reactor: '0x0000000000000000000000000000000000000000' })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString: 'Invalid reactor address',
        valid: false,
      })
    })
  })

  describe('Testing nonce', () => {
    it('Testing nonce too big.', async () => {
      const nonce = BigNumber.from('1').shl(256)
      const order = newOrder({ nonce })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString:
          'Invalid nonce: ValidationError: Error code "VALIDATION ERROR: Nonce is larger than max uint256 integer" is not defined, your custom type is missing the correct messages definition',
        valid: false,
      })
    })

    it('Testing nonce being negative.', async () => {
      const nonce = BigNumber.from('-1')
      const order = newOrder({ nonce })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString:
          'Invalid nonce: ValidationError: "value" with value "-1" fails to match the required pattern: /^[0-9]+$/',
        valid: false,
      })
    })
  })

  describe('Testing input token', () => {
    it('invalid address.', async () => {
      const order = newOrder({
        input: { token: '0xbad_token', startAmount: BigNumber.from(1), endAmount: BigNumber.from(1) },
      })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString: 'Invalid input token: ValidationError: VALIDATION ERROR: Invalid address',
        valid: false,
      })
    })

    it('invalid amount: negative', async () => {
      const order = newOrder({
        input: { token: INPUT_TOKEN_ADDRESS, startAmount: BigNumber.from(-1), endAmount: BigNumber.from(-1) },
      })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString: 'Invalid input amount: -1',
        valid: false,
      })
    })

    it('invalid amount: too big', async () => {
      const order = newOrder({
        input: {
          token: INPUT_TOKEN_ADDRESS,
          startAmount: BigNumber.from(1).shl(256),
          endAmount: BigNumber.from(1).shl(256),
        },
      })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString:
          'Invalid input amount: 115792089237316195423570985008687907853269984665640564039457584007913129639936',
        valid: false,
      })
    })

    it('invalid amount: only endAmount too big', async () => {
      const order = newOrder({
        input: {
          token: INPUT_TOKEN_ADDRESS,
          startAmount: BigNumber.from(1),
          endAmount: BigNumber.from(1).shl(256),
        },
      })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString:
          'Invalid input amount: 115792089237316195423570985008687907853269984665640564039457584007913129639936',
        valid: false,
      })
    })
  })

  describe('Testing parsed outputs', () => {
    describe('Testing endAmount', () => {
      it('Testing invalid endAmount: negative', () => {
        const order = newOrder({
          output: {
            token: OUTPUT_TOKEN_ADDRESS,
            startAmount: BigNumber.from(2),
            endAmount: BigNumber.from(-1),
            recipient: RECIPIENT,
          },
        })
        const validationResp = validationProvider.validate(order)
        expect(validationResp).toEqual({ errorString: 'Invalid endAmount -1', valid: false })
      })

      it('Testing invalid endAmount: too large', () => {
        const order = newOrder({
          output: {
            token: OUTPUT_TOKEN_ADDRESS,
            startAmount: BigNumber.from(2),
            endAmount: BigNumber.from(1).shl(256),
            recipient: RECIPIENT,
          },
        })
        const validationResp = validationProvider.validate(order)
        expect(validationResp).toEqual({
          errorString:
            'Invalid endAmount 115792089237316195423570985008687907853269984665640564039457584007913129639936',
          valid: false,
        })
      })
    })

    describe('Testing startAmount', () => {
      it('Testing invalid startAmount: negative', () => {
        const order = newOrder({
          output: {
            token: OUTPUT_TOKEN_ADDRESS,
            startAmount: BigNumber.from(-1),
            endAmount: BigNumber.from(2),
            recipient: RECIPIENT,
          },
        })
        const validationResp = validationProvider.validate(order)
        expect(validationResp).toEqual({ errorString: 'Invalid startAmount -1', valid: false })
      })

      it('Testing invalid startAmount: too large', () => {
        const order = newOrder({
          output: {
            token: OUTPUT_TOKEN_ADDRESS,
            startAmount: BigNumber.from(1).shl(256),
            endAmount: BigNumber.from(2),
            recipient: RECIPIENT,
          },
        })
        const validationResp = validationProvider.validate(order)
        expect(validationResp).toEqual({
          errorString:
            'Invalid startAmount 115792089237316195423570985008687907853269984665640564039457584007913129639936',
          valid: false,
        })
      })

      it('Testing startAmount >= endAmount', () => {
        const order = newOrder({
          output: {
            token: OUTPUT_TOKEN_ADDRESS,
            startAmount: BigNumber.from(2),
            endAmount: BigNumber.from(3),
            recipient: RECIPIENT,
          },
        })
        const validationResp = validationProvider.validate(order)
        expect(validationResp).toEqual({ errorString: 'Invalid endAmount > startAmount', valid: false })
      })
    })

    describe('Testing recipient', () => {
      it('Testing invalid recipient.', () => {
        const order = newOrder({
          output: {
            token: OUTPUT_TOKEN_ADDRESS,
            startAmount: BigNumber.from(2),
            endAmount: BigNumber.from(1),
            recipient: '0xfoo',
          },
        })
        const validationResp = validationProvider.validate(order)
        expect(validationResp).toEqual({ errorString: 'Invalid recipient 0xfoo', valid: false })
      })
    })
    describe('Testing token', () => {
      it('Testing invalid recipient.', () => {
        const order = newOrder({
          output: {
            token: '0xfoo',
            startAmount: BigNumber.from(2),
            endAmount: BigNumber.from(1),
            recipient: RECIPIENT,
          },
        })
        const validationResp = validationProvider.validate(order)
        expect(validationResp).toEqual({ errorString: 'Invalid output token 0xfoo', valid: false })
      })
    })
  })

  describe('Testing order hash', () => {
    it('Testing invalid hash.', async () => {
      const order = newOrder({})
      order.hash = () => '0xfoo'
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString:
          'Invalid orderHash: ValidationError: "value" with value "0xfoo" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{64}$/',
        valid: false,
      })
    })
  })

  describe('Testing v3 order validation', () => {
    it('Should return valid', () => {
      const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
        cosigner: process.env.LABS_COSIGNER,
      })
      order.info.deadline = CURRENT_TIME + ONE_DAY
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        valid: true,
      })
    })

    it('Should throw invalid deadline', () => {
      const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
        cosigner: process.env.LABS_COSIGNER,
      })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        valid: false,
        errorString: 'Deadline field invalid: Order expiry cannot be larger than 1440 minutes',
      })
    })

    it('Should throw missing cosigner', () => {
      const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE)
      // Invalid cosigner
      order.info.cosigner = '0x0000000000000000000000000000000000000001'
      order.info.deadline = CURRENT_TIME + ONE_DAY
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        valid: false,
        errorString: expect.stringContaining('Invalid cosigner: ValidationError: "value" must be'),
      })
    })

    it('Should throw invalid input curve with mismatched lengths', () => {
      const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
        cosigner: process.env.LABS_COSIGNER,
        input: {
          curve: {
            relativeBlocks: [1],
            relativeAmounts: [BigInt(1000000000000000000)],
          },
        },
      })
      order.info.deadline = CURRENT_TIME + ONE_DAY
      // Set to be empty
      order.info.input.curve.relativeBlocks = []
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        valid: false,
        errorString: 'Invalid curve: relativeAmounts.length != relativeBlocks.length',
      })
    })

    it('Should throw invalid input curve with non-increasing relativeBlocks', () => {
      const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
        cosigner: process.env.LABS_COSIGNER,
        input: {
          curve: {
            relativeBlocks: [1, 2],
            relativeAmounts: [BigInt(1000000000000000000), BigInt(1000000000000000000)],
          },
        },
      })
      // Set to be non increasing
      order.info.input.curve.relativeBlocks = [1, 1]
      order.info.deadline = CURRENT_TIME + ONE_DAY
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        valid: false,
        errorString: 'Invalid curve: relativeBlocks must be strictly increasing',
      })
    })

    it('Should throw invalid input override if greater than startAmount', () => {
      const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
        cosigner: process.env.LABS_COSIGNER,
        input: {
          startAmount: BigNumber.from(100),
          maxAmount: BigNumber.from(100),
        },
      })
      // Override with more than the startAmount
      order.info.cosignerData.inputOverride = BigNumber.from('1000000000000000000')
      order.info.deadline = CURRENT_TIME + ONE_DAY
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        valid: false,
        errorString: 'Invalid inputOverride > startAmount',
      })
    })
  })

  it('Should throw invalid output curve with mismatched lengths', () => {
    const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosigner: process.env.LABS_COSIGNER,
      outputs: [
        {
          curve: {
            relativeBlocks: [1],
            relativeAmounts: [BigInt(1000000000000000000)],
          },
        },
      ],
    })
    order.info.deadline = CURRENT_TIME + ONE_DAY
    // Set to be empty
    order.info.outputs[0].curve.relativeBlocks = []
    const validationResp = validationProvider.validate(order)
    expect(validationResp).toEqual({
      valid: false,
      errorString: 'Invalid curve: relativeAmounts.length != relativeBlocks.length',
    })
  })

  it('Should throw invalid output curve with non-increasing relativeBlocks', () => {
    const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosigner: process.env.LABS_COSIGNER,
      outputs: [
        {
          curve: {
            relativeBlocks: [1, 2],
            relativeAmounts: [BigInt(1000000000000000000), BigInt(1000000000000000000)],
          },
        },
      ],
    })
    // Set to be non increasing
    order.info.outputs[0].curve.relativeBlocks = [2, 1]
    order.info.deadline = CURRENT_TIME + ONE_DAY
    const validationResp = validationProvider.validate(order)
    expect(validationResp).toEqual({
      valid: false,
      errorString: 'Invalid curve: relativeBlocks must be strictly increasing',
    })
  })

  it('Should throw invalid max input amount', () => {
    const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosigner: process.env.LABS_COSIGNER,
      cosignerData: {
        inputOverride: BigNumber.from(100),
      },
      input: {
        startAmount: BigNumber.from(100),
        maxAmount: BigNumber.from(10),
      },
    })
    order.info.deadline = CURRENT_TIME + ONE_DAY
    const validationResp = validationProvider.validate(order)
    expect(validationResp).toEqual({
      valid: false,
      errorString: 'Invalid maxAmount < startAmount',
    })
  })

  it('Should throw invalid min output amount', () => {
    const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosigner: process.env.LABS_COSIGNER,
      cosignerData: {
        outputOverrides: [BigInt(100)],
      },
      outputs: [
        {
          startAmount: BigNumber.from(100),
          minAmount: BigNumber.from(1000),
        },
      ],
    })
    order.info.deadline = CURRENT_TIME + ONE_DAY
    const validationResp = validationProvider.validate(order)
    expect(validationResp).toEqual({
      valid: false,
      errorString: 'Invalid minAmount > startAmount',
    })
  })

  it('Should throw invalid output override if less than startAmount', () => {
    const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosigner: process.env.LABS_COSIGNER,
      outputs: [
        {
          startAmount: BigNumber.from(100),
          minAmount: BigNumber.from(100),
        },
      ],
    })
    // Override with less than the startAmount
    order.info.cosignerData.outputOverrides = [BigNumber.from('99')]
    order.info.deadline = CURRENT_TIME + ONE_DAY
    const validationResp = validationProvider.validate(order)
    expect(validationResp).toEqual({
      valid: false,
      errorString: 'Invalid outputOverride < startAmount',
    })
  })

  it('Should throw when outputs pay different tokens', () => {
    const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosigner: process.env.LABS_COSIGNER,
      outputs: [{ token: Tokens.ARBITRUM_ONE.WETH }, { token: Tokens.ARBITRUM_ONE.USDC }],
      cosignerData: { outputOverrides: [BigInt(0), BigInt(0)] },
    })
    order.info.deadline = CURRENT_TIME + ONE_DAY
    const validationResp = validationProvider.validate(order)
    expect(validationResp).toEqual({
      valid: false,
      errorString: `Invalid output token ${Tokens.ARBITRUM_ONE.USDC}: all outputs must use ${Tokens.ARBITRUM_ONE.WETH}`,
    })
  })

  it('Should throw when outputOverrides length does not match outputs', () => {
    const order = SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, {
      cosigner: process.env.LABS_COSIGNER,
      outputs: [{}, {}],
      cosignerData: { outputOverrides: [BigInt(0), BigInt(0)] },
    })
    order.info.cosignerData.outputOverrides = [BigNumber.from(0)]
    order.info.deadline = CURRENT_TIME + ONE_DAY
    const validationResp = validationProvider.validate(order)
    expect(validationResp).toEqual({
      valid: false,
      errorString: 'Invalid outputOverrides length 1: expected 2',
    })
  })
})

// The SDK types outputs as readonly; mutating them mimics a parsed, attacker-supplied encodedOrder.
const mutableOutputs = (order: CosignedV2DutchOrder) =>
  order.info.outputs as unknown as { token: string; startAmount: BigNumber; endAmount: BigNumber }[]

describe('Testing v2 order validation', () => {
  const v2ValidationProvider = new OffChainUniswapXOrderValidator(() => Date.now() / 1000, ONE_DAY_IN_SECONDS)

  const buildV2 = (overrides: Parameters<typeof SDKDutchOrderV2Factory.buildDutchV2Order>[1] = {}) =>
    SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, {
      cosigner: process.env.LABS_COSIGNER,
      ...overrides,
    })

  // Swapper output plus a same-token fee output. The builder rejects some shapes the
  // reactor sees (zero overrides, endAmount > startAmount), so invalid cases mutate it.
  const buildTwoOutputV2 = () =>
    buildV2({
      outputs: [
        { token: Tokens.MAINNET.WETH, startAmount: '1000000000000000000', endAmount: '900000000000000000' },
        { token: Tokens.MAINNET.WETH, startAmount: '1000000000000000', endAmount: '900000000000000' },
      ],
      cosignerData: { outputOverrides: ['1000000000000000000', '1000000000000000'] },
    })

  it('Should return valid for a fee output in the same token as the swapper output', () => {
    expect(v2ValidationProvider.validate(buildTwoOutputV2())).toEqual({ valid: true })
  })

  it('Should throw when outputs pay different tokens', () => {
    const order = buildTwoOutputV2()
    mutableOutputs(order)[1].token = Tokens.MAINNET.USDC
    expect(v2ValidationProvider.validate(order)).toEqual({
      valid: false,
      errorString: `Invalid output token ${Tokens.MAINNET.USDC}: all outputs must use ${Tokens.MAINNET.WETH}`,
    })
  })

  it('Should return valid when a fee output override is left at zero', () => {
    const order = buildTwoOutputV2()
    order.info.cosignerData.outputOverrides = [order.info.outputs[0].startAmount, BigNumber.from(0)]
    expect(v2ValidationProvider.validate(order)).toEqual({ valid: true })
  })

  it('Should throw invalid endAmount > startAmount', () => {
    const order = buildV2()
    mutableOutputs(order)[0].endAmount = order.info.outputs[0].startAmount.add(1)
    expect(v2ValidationProvider.validate(order)).toEqual({
      valid: false,
      errorString: 'Invalid endAmount > startAmount',
    })
  })

  it('Should throw invalid output token', () => {
    const order = buildV2()
    mutableOutputs(order)[0].token = '0xfoo'
    expect(v2ValidationProvider.validate(order)).toEqual({
      valid: false,
      errorString: 'Invalid output token 0xfoo',
    })
  })

  it('Should throw invalid output override if less than startAmount', () => {
    const order = buildV2()
    // The reactor reverts with InvalidCosignerOutput on this order
    order.info.cosignerData.outputOverrides = [order.info.outputs[0].startAmount.sub(1)]
    expect(v2ValidationProvider.validate(order)).toEqual({
      valid: false,
      errorString: 'Invalid outputOverride < startAmount',
    })
  })

  it('Should throw when outputOverrides length does not match outputs', () => {
    const order = buildV2()
    order.info.cosignerData.outputOverrides = []
    expect(v2ValidationProvider.validate(order)).toEqual({
      valid: false,
      errorString: 'Invalid outputOverrides length 0: expected 1',
    })
  })
})

describe('Testing output tokens across order types', () => {
  it('Should throw for a v1 Dutch order whose outputs pay different tokens', () => {
    const order = SDKDutchOrderFactory.buildDutchOrder(ChainId.MAINNET, {
      outputs: [{ token: Tokens.MAINNET.WETH }, { token: Tokens.MAINNET.USDC }],
    })
    const validationResp = new OffChainUniswapXOrderValidator(() => Date.now() / 1000, ONE_DAY_IN_SECONDS).validate(
      order
    )
    expect(validationResp).toEqual({
      valid: false,
      errorString: `Invalid output token ${Tokens.MAINNET.USDC}: all outputs must use ${Tokens.MAINNET.WETH}`,
    })
  })

  it('Should throw for a priority order whose outputs pay different tokens', () => {
    const order = SDKPriorityOrderFactory.buildPriorityOrder(ChainId.MAINNET, {
      cosigner: process.env.LABS_PRIORITY_COSIGNER,
      outputs: [{ token: Tokens.MAINNET.WETH }, { token: Tokens.MAINNET.USDC }],
    })
    const validationResp = new OffChainUniswapXOrderValidator(() => Date.now() / 1000, ONE_DAY_IN_SECONDS).validate(
      order
    )
    expect(validationResp).toEqual({
      valid: false,
      errorString: `Invalid output token ${Tokens.MAINNET.USDC}: all outputs must use ${Tokens.MAINNET.WETH}`,
    })
  })
})

// The SDK types order fields as readonly; mutating them mimics a parsed, attacker-supplied encodedOrder.
type Mutable<T> = { -readonly [K in keyof T]: T[K] }
const mutableDutchOutputs = (order: DutchOrder | CosignedV2DutchOrder) =>
  order.info.outputs as unknown as Mutable<DutchOrder['info']['outputs'][number]>[]
const mutableV3Outputs = (order: CosignedV3DutchOrder) =>
  order.info.outputs as unknown as Mutable<CosignedV3DutchOrder['info']['outputs'][number]>[]
const mutableInput = <O extends { info: { input: object } }>(order: O) =>
  order.info.input as Mutable<O['info']['input']>
const mutablePriorityOutputs = (order: CosignedPriorityOrder) =>
  order.info.outputs as unknown as Mutable<CosignedPriorityOrder['info']['outputs'][number]>[]

// The SDK refuses to construct an order for a chain without a Permit2 deployment, so set it after.
const onChain = <T extends { chainId: number }>(order: T, chainId: number): T => Object.assign(order, { chainId })

const UINT256_OVERFLOW = BigNumber.from(1).shl(256)
const NEGATIVE = BigNumber.from(-1)
const ADDRESS_ERROR = 'ValidationError: VALIDATION ERROR: Invalid address'
const MPS_ERROR = 'Invalid mpsPerPriorityFeeWei: ValidationError: "value" must be greater than or equal to 0; must >= 0'

// Every errorString the validator returns, and which one wins when an order is invalid more than one way.
describe('Every errorString path', () => {
  const liveValidator = new OffChainUniswapXOrderValidator(() => Date.now() / 1000, ONE_DAY_IN_SECONDS)
  const limitValidator = new OffChainUniswapXOrderValidator(() => Date.now() / 1000, ONE_YEAR_IN_SECONDS, {
    SkipDecayStartTimeValidation: true,
  })

  const buildV2 = () => SDKDutchOrderV2Factory.buildDutchV2Order(ChainId.MAINNET, { cosigner: COSIGNER })
  const buildV3 = () => SDKDutchOrderV3Factory.buildDutchV3Order(ChainId.ARBITRUM_ONE, { cosigner: COSIGNER })
  const buildPriority = () =>
    SDKPriorityOrderFactory.buildPriorityOrder(ChainId.MAINNET, { cosigner: PRIORITY_COSIGNER })

  const rejects = (
    validator: OffChainUniswapXOrderValidator,
    order: Parameters<OffChainUniswapXOrderValidator['validate']>[0],
    errorString: string
  ) => expect(validator.validate(order)).toEqual({ valid: false, errorString })

  it('the factory orders used below are valid', () => {
    expect(liveValidator.validate(buildV2())).toEqual({ valid: true })
    expect(liveValidator.validate(buildV3())).toEqual({ valid: true })
    expect(liveValidator.validate(buildPriority())).toEqual({ valid: true })
  })

  describe('cosigners', () => {
    it('V2 with another cosigner', () => {
      const order = buildV2()
      order.info.cosigner = '0x0000000000000000000000000000000000000001'
      rejects(liveValidator, order, `Invalid cosigner: ValidationError: "value" must be [${COSIGNER}]`)
    })

    it('V3 with the priority cosigner', () => {
      const order = buildV3()
      order.info.cosigner = PRIORITY_COSIGNER
      rejects(liveValidator, order, `Invalid cosigner: ValidationError: "value" must be [${COSIGNER}]`)
    })

    it('priority with the Dutch cosigner', () => {
      const order = buildPriority()
      order.info.cosigner = COSIGNER
      rejects(
        liveValidator,
        order,
        `Invalid priority order cosigner: ValidationError: "value" must be [${PRIORITY_COSIGNER}]`
      )
    })

    it('V1 orders carry no cosigner and are not checked for one', () => {
      expect(liveValidator.validate(SDKDutchOrderFactory.buildDutchOrder())).toEqual({ valid: true })
    })
  })

  it('V2 inputOverride above the input startAmount', () => {
    const order = buildV2()
    order.info.cosignerData.inputOverride = order.info.input.startAmount.add(1)
    rejects(liveValidator, order, 'Invalid inputOverride > startAmount')
  })

  it('an unsupported chain reports the Joi message, not the error', () => {
    rejects(validationProvider, onChain(newOrder({}), 999), `"value" must be one of [${SUPPORTED_CHAINS.join(', ')}]`)
  })

  it('a reactor that matches the mapping but fails the address checksum', () => {
    const lower = (REACTOR as string).toLowerCase()
    const firstLetter = lower.slice(2).search(/[a-f]/) + 2
    const badChecksum = lower.slice(0, firstLetter) + lower[firstLetter].toUpperCase() + lower.slice(firstLetter + 1)
    rejects(validationProvider, newOrder({ reactor: badChecksum }), `Invalid reactor: ${ADDRESS_ERROR}`)
  })

  describe('decayStartTime', () => {
    it('V2 cosigner decayStartTime after the deadline', () => {
      const order = buildV2()
      order.info.cosignerData.decayStartTime = order.info.deadline + 1
      rejects(liveValidator, order, 'Invalid decayStartTime: decayStartTime > deadline')
    })

    it('the skip flag skips it for V2 too', () => {
      const order = buildV2()
      order.info.cosignerData.decayStartTime = order.info.deadline + 1
      expect(limitValidator.validate(order)).toEqual({ valid: true })
    })
  })

  describe('limit orders', () => {
    it('a limit order passes the limit validator against the Dutch reactor', () => {
      const order = SDKDutchOrderFactory.buildLimitOrder()
      expect(order.info.reactor).toEqual(REACTOR_ADDRESS_MAPPING[ChainId.MAINNET][OrderType.Dutch])
      expect(limitValidator.validate(order)).toEqual({ valid: true })
    })

    it('a limit order on the V2 reactor is rejected', () => {
      const order = SDKDutchOrderFactory.buildLimitOrder()
      order.info.reactor = REACTOR_ADDRESS_MAPPING[ChainId.MAINNET][OrderType.Dutch_V2] as string
      rejects(limitValidator, order, 'Invalid reactor address')
    })
  })

  describe('V1 outputs', () => {
    it('no outputs', () => {
      const order = newOrder({})
      mutableDutchOutputs(order).length = 0
      rejects(validationProvider, order, 'Invalid number of outputs: 0')
    })
  })

  describe('V3 input and outputs', () => {
    it('negative input startAmount', () => {
      const order = buildV3()
      mutableInput(order).startAmount = NEGATIVE
      rejects(liveValidator, order, 'Invalid input amount: -1')
    })

    it('input maxAmount past uint256', () => {
      const order = buildV3()
      mutableInput(order).maxAmount = UINT256_OVERFLOW
      rejects(liveValidator, order, `Invalid input amount: ${UINT256_OVERFLOW.toString()}`)
    })

    it('no outputs', () => {
      const order = buildV3()
      mutableV3Outputs(order).length = 0
      order.info.cosignerData.outputOverrides = []
      rejects(liveValidator, order, 'Invalid number of outputs: 0')
    })

    it('bad output token', () => {
      const order = buildV3()
      mutableV3Outputs(order)[0].token = '0xfoo'
      rejects(liveValidator, order, 'Invalid output token 0xfoo')
    })

    it('bad recipient', () => {
      const order = buildV3()
      mutableV3Outputs(order)[0].recipient = '0xfoo'
      rejects(liveValidator, order, 'Invalid recipient 0xfoo')
    })

    it('negative output startAmount', () => {
      const order = buildV3()
      mutableV3Outputs(order)[0].startAmount = NEGATIVE
      rejects(liveValidator, order, 'Invalid startAmount -1')
    })

    it('output minAmount past uint256', () => {
      const order = buildV3()
      mutableV3Outputs(order)[0].minAmount = UINT256_OVERFLOW
      rejects(liveValidator, order, `Invalid minAmount ${UINT256_OVERFLOW.toString()}`)
    })
  })

  describe('priority input and outputs', () => {
    it('input amount past uint256', () => {
      const order = buildPriority()
      mutableInput(order).amount = UINT256_OVERFLOW
      rejects(liveValidator, order, `Invalid input amount: ${UINT256_OVERFLOW.toString()}`)
    })

    it('negative input mpsPerPriorityFeeWei', () => {
      const order = buildPriority()
      mutableInput(order).mpsPerPriorityFeeWei = NEGATIVE
      rejects(liveValidator, order, MPS_ERROR)
    })

    it('no outputs', () => {
      const order = buildPriority()
      mutablePriorityOutputs(order).length = 0
      rejects(liveValidator, order, 'Invalid number of outputs: 0')
    })

    it('bad output token', () => {
      const order = buildPriority()
      mutablePriorityOutputs(order)[0].token = '0xfoo'
      rejects(liveValidator, order, 'Invalid output token 0xfoo')
    })

    it('bad recipient', () => {
      const order = buildPriority()
      mutablePriorityOutputs(order)[0].recipient = '0xfoo'
      rejects(liveValidator, order, 'Invalid recipient 0xfoo')
    })

    it('a negative output amount is reported as startAmount', () => {
      const order = buildPriority()
      mutablePriorityOutputs(order)[0].amount = NEGATIVE
      rejects(liveValidator, order, 'Invalid startAmount -1')
    })

    it('negative output mpsPerPriorityFeeWei', () => {
      const order = buildPriority()
      mutablePriorityOutputs(order)[0].mpsPerPriorityFeeWei = NEGATIVE
      rejects(liveValidator, order, MPS_ERROR)
    })
  })

  describe('first error wins', () => {
    it('V2: the cosigner before the chain', () => {
      const order = buildV2()
      order.info.cosigner = '0x0000000000000000000000000000000000000001'
      rejects(liveValidator, onChain(order, 999), `Invalid cosigner: ValidationError: "value" must be [${COSIGNER}]`)
    })

    it('V2: the cosigner before the inputOverride', () => {
      const order = buildV2()
      order.info.cosigner = '0x0000000000000000000000000000000000000001'
      order.info.cosignerData.inputOverride = order.info.input.startAmount.add(1)
      rejects(liveValidator, order, `Invalid cosigner: ValidationError: "value" must be [${COSIGNER}]`)
    })

    it('V2: the inputOverride before the deadline', () => {
      const order = buildV2()
      order.info.cosignerData.inputOverride = order.info.input.startAmount.add(1)
      order.info.deadline = 1
      rejects(liveValidator, order, 'Invalid inputOverride > startAmount')
    })

    it('priority: the cosigner before the deadline', () => {
      const order = buildPriority()
      order.info.cosigner = COSIGNER
      order.info.deadline = 1
      rejects(
        liveValidator,
        order,
        `Invalid priority order cosigner: ValidationError: "value" must be [${PRIORITY_COSIGNER}]`
      )
    })

    it('V1: the chain before the reactor mapping', () => {
      rejects(
        validationProvider,
        onChain(newOrder({ reactor: '0x0000000000000000000000000000000000000000' }), 999),
        `"value" must be one of [${SUPPORTED_CHAINS.join(', ')}]`
      )
    })

    it('V1: the deadline before decayStartTime and the swapper', () => {
      rejects(
        validationProvider,
        newOrder({ deadline: 9, decayStartTime: 15, swapper: '0xbad' }),
        'Deadline must be in the future'
      )
    })

    it('V1: decayStartTime before the nonce', () => {
      rejects(
        validationProvider,
        newOrder({ deadline: 20, decayStartTime: 21, nonce: NEGATIVE }),
        'Invalid decayStartTime: decayStartTime > deadline'
      )
    })

    it('V1: the nonce before the swapper', () => {
      rejects(
        validationProvider,
        newOrder({ nonce: NEGATIVE, swapper: '0xbad' }),
        'Invalid nonce: ValidationError: "value" with value "-1" fails to match the required pattern: /^[0-9]+$/'
      )
    })

    it('V1: the input token before the outputs', () => {
      rejects(
        validationProvider,
        newOrder({
          input: { token: '0xbad', startAmount: BigNumber.from(1), endAmount: BigNumber.from(1) },
          output: { ...OUTPUT, token: '0xfoo' },
        }),
        `Invalid input token: ${ADDRESS_ERROR}`
      )
    })

    it('V1: every output is checked before the outputs are compared for one token', () => {
      const order = SDKDutchOrderFactory.buildDutchOrder(ChainId.MAINNET, {
        outputs: [{ token: Tokens.MAINNET.WETH }, { token: Tokens.MAINNET.USDC }],
      })
      mutableDutchOutputs(order)[1].endAmount = order.info.outputs[1].startAmount.add(1)
      rejects(liveValidator, order, 'Invalid endAmount > startAmount')
    })

    it('V1: the first bad field of an output wins', () => {
      const order = newOrder({ output: { ...OUTPUT, token: '0xfoo', recipient: '0xbar' } })
      rejects(validationProvider, order, 'Invalid output token 0xfoo')
    })

    it('V2: the outputs before the outputOverrides', () => {
      const order = buildV2()
      mutableDutchOutputs(order)[0].endAmount = order.info.outputs[0].startAmount.add(1)
      order.info.cosignerData.outputOverrides = []
      rejects(liveValidator, order, 'Invalid endAmount > startAmount')
    })

    it('V3: the input curve before maxAmount', () => {
      const order = buildV3()
      order.info.input.curve.relativeBlocks = [1]
      mutableInput(order).maxAmount = order.info.input.startAmount.sub(1)
      rejects(liveValidator, order, 'Invalid curve: relativeAmounts.length != relativeBlocks.length')
    })

    it('V3: the input curve before the maxAmount range check', () => {
      const order = buildV3()
      order.info.input.curve.relativeBlocks = [1]
      mutableInput(order).maxAmount = UINT256_OVERFLOW
      rejects(liveValidator, order, 'Invalid curve: relativeAmounts.length != relativeBlocks.length')
    })

    it('V3: maxAmount below startAmount before the outputs', () => {
      const order = buildV3()
      mutableInput(order).maxAmount = order.info.input.startAmount.sub(1)
      mutableV3Outputs(order)[0].token = '0xfoo'
      rejects(liveValidator, order, 'Invalid maxAmount < startAmount')
    })

    it('priority: the input mps before the outputs', () => {
      const order = buildPriority()
      mutableInput(order).mpsPerPriorityFeeWei = NEGATIVE
      mutablePriorityOutputs(order)[0].token = '0xfoo'
      rejects(liveValidator, order, MPS_ERROR)
    })
  })
})

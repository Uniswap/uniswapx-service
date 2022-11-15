import { BigNumber } from 'ethers'
import { DutchLimitOrder } from 'gouda-sdk'
import { OrderValidator } from '../../lib/util/order-validator'

const CURRENT_TIME = 10
const validationProvider = new OrderValidator(() => CURRENT_TIME, 1)
const INPUT_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000022'
const OUTPUT_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000033'
const ONE_YEAR = 60 * 60 * 24 * 365
const OFFERER = '0x0000000000000000000000000000000000032100'
const RECIPIENT = '0x0000000000000000000000000000000000045600'
const INPUT = { token: INPUT_TOKEN_ADDRESS, amount: BigNumber.from('1') }
const OUTPUT = {
  token: OUTPUT_TOKEN_ADDRESS,
  startAmount: BigNumber.from('3'),
  endAmount: BigNumber.from('2'),
  recipient: RECIPIENT,
}
const REACTOR = '0x1111111111111111111111111111111111111111'

function newOrder({
  startTime = 5,
  deadline = 20,
  nonce = BigNumber.from(30),
  offerer = OFFERER,
  input = INPUT,
  output = OUTPUT,
  reactor = REACTOR,
  chainId = 1,
}): DutchLimitOrder {
  return new DutchLimitOrder({ startTime, deadline, nonce, offerer, input, outputs: [output], reactor }, chainId)
}

describe('Testing off chain validation', () => {
  describe('Testing deadline', () => {
    it('Testing deadline < current time.', async () => {
      const order = newOrder({ deadline: 9 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ errorString: 'Insufficient Deadline', valid: false })
    })
    it('Testing deadline longer than one year.', async () => {
      const order = newOrder({ deadline: CURRENT_TIME + ONE_YEAR + 1 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString: 'Deadline field invalid: Order expiry cannot be larger than one year',
        valid: false,
      })
    })
    it('Testing valid deadline.', async () => {
      const order = newOrder({ deadline: CURRENT_TIME + ONE_YEAR })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ valid: true })
    })
  })

  describe('Testing startTime', () => {
    it('Testing parsed startTime > deadline.', async () => {
      const order = newOrder({ deadline: 20, startTime: 21 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ errorString: 'Invalid startTime: startTime > deadline', valid: false })
    })
    it('Testing parsed startTime == deadline.', async () => {
      const order = newOrder({ deadline: 20, startTime: 20 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ valid: true })
    })
    it('Testing parsed startTime < deadline.', async () => {
      const order = newOrder({ deadline: 20, startTime: 10 })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({ valid: true })
    })
  })

  describe('Testing offerer', () => {
    it('Testing invalid parsed offerer.', async () => {
      const order = newOrder({ offerer: '0xbad_actor' })
      const validationResp = validationProvider.validate(order)

      expect(validationResp).toEqual({
        errorString:
          "Invalid offerer: ValidationError: VALIDATION ERROR: Invalid address",
        valid: false,
      })
    })
  })

  describe('Testing reactor', () => {
    it('Testing invalid parsed reactor.', async () => {
      const order = newOrder({ reactor: '0xbad_actor' })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString:
          "Invalid reactor: ValidationError: VALIDATION ERROR: Invalid address",
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
      const order = newOrder({ input: { token: '0xbad_token', amount: BigNumber.from(1) } })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString:
          "Invalid input token: ValidationError: VALIDATION ERROR: Invalid address",
        valid: false,
      })
    })

    it('invalid amount: negative', async () => {
      const order = newOrder({ input: { token: INPUT_TOKEN_ADDRESS, amount: BigNumber.from(-1) } })
      const validationResp = validationProvider.validate(order)
      expect(validationResp).toEqual({
        errorString: 'Invalid input amount: -1',
        valid: false,
      })
    })

    it('invalid amount: too big', async () => {
      const order = newOrder({ input: { token: INPUT_TOKEN_ADDRESS, amount: BigNumber.from(1).shl(256) } })
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
      const mockOrder = { ...order, hash: () => '0xfoo' }
      const validationResp = validationProvider.validate(mockOrder as any)
      expect(validationResp).toEqual({
        errorString:
          'Invalid orderHash: ValidationError: "value" with value "0xfoo" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{64}$/',
        valid: false,
      })
    })
  })
})

import { BigNumber } from 'ethers'
import { DutchOutput } from 'gouda-sdk'
import { OffchainValidationProvider } from '../../lib/util/providers/offchain-validation-provider'

let getCurrentTime: () => number
let offchainValidationProvider: OffchainValidationProvider
const USDC_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

beforeAll(() => {
    getCurrentTime = () => 1500000000
    offchainValidationProvider = new OffchainValidationProvider(getCurrentTime)
})

describe('Testing off chain validation', () => {
  describe('Testing deadline', () => {
    it('Testing deadline < current time.', async () => {
      const deadline = 1450000000
      const validationResp = offchainValidationProvider.validateDeadline(deadline)
      expect(validationResp).toEqual({"errorString": "Deadline field invalid: value too small", "valid": false})
    })
    it('Testing valid deadline.', async () => {
      const deadline = 1550000000
      const validationResp = offchainValidationProvider.validateDeadline(deadline)
      expect(validationResp).toEqual({"valid": true})
    })
  })
  describe('Testing startTime', () => {
    it('Testing parsed startTime > deadline.', async () => {
      const deadline = 1550000000
      const startTime = deadline + 1
      const validationResp = offchainValidationProvider.validateStartTime(startTime, deadline)
      expect(validationResp).toEqual({"errorString": "Invalid startTime: startTime > deadline", "valid": false})
    })
    it('Testing parsed startTime == deadline.', async () => {
        const deadline = 1550000000
        const startTime = deadline
        const validationResp = offchainValidationProvider.validateStartTime(startTime, deadline)
        expect(validationResp).toEqual({"valid": true})
      })
    it('Testing parsed startTime < deadline.', async () => {
      const deadline = 1550000000
      const startTime = deadline - 1
      const validationResp = offchainValidationProvider.validateStartTime(startTime, deadline)
      expect(validationResp).toEqual({"valid": true})
    })
  })
  describe('Testing offerer', () => {
    it('Testing invalid parsed offerer.', async () => {
      const offerer = '0xbad_actor'
      const validationResp = offchainValidationProvider.validateOfferer(offerer)
      expect(validationResp).toEqual(
        {
            "errorString": "Invalid offerer: ValidationError: \"value\" failed custom validation because invalid address (argument=\"address\", value=\"0xbad_actor\", code=INVALID_ARGUMENT, version=address/5.7.0)",
            "valid": false
        }
      )
    })
    it('Testing valid parsed offerer.', async () => {
      const offerer = '0x467Bccd9d29f223BcE8043b84E8C8B282827790F'
      const validationResp = offchainValidationProvider.validateOfferer(offerer)
      expect(validationResp).toEqual({"valid": true})
    })
  })
  describe('Testing reactor', () => {
    it('Testing invalid parsed reactor.', async () => {
      const reactor = '0x_misunderstood_actor'
      const validationResp = offchainValidationProvider.validateReactor(reactor)
      expect(validationResp).toEqual(
        {
            "errorString": "Invalid reactor: ValidationError: \"value\" failed custom validation because invalid address (argument=\"address\", value=\"0x_misunderstood_actor\", code=INVALID_ARGUMENT, version=address/5.7.0)",
            "valid": false
        }
      )
    })
    it('Testing valid parsed reactor.', async () => {
      const reactor = '0x467Bccd9d29f223BcE8043b84E8C8B282827790F'
      const validationResp = offchainValidationProvider.validateReactor(reactor)
      expect(validationResp).toEqual({"valid": true})
    })
  })
  describe('Testing nonce', () => {
    it('Testing invalid parsed nonce.', async () => {
      const nonce = BigNumber.from(-1)
      const validationResp = offchainValidationProvider.validateNonce(nonce)
      expect(validationResp).toEqual({"errorString": "Invalid startTime: nonce < 0", "valid": false})
    })
    it('Testing valid parsed nonce.', async () => {
      const nonce = BigNumber.from(0)
      const validationResp = offchainValidationProvider.validateNonce(nonce)
      expect(validationResp).toEqual({"valid": true})
    })
  })
  describe('Testing input token', () => {
    it('Testing invalid parsed input token.', async () => {
      const token = '0xbad_token'
      const validationResp = offchainValidationProvider.validateInputToken(token)
      expect(validationResp).toEqual(
        {
            "errorString": "Invalid input token: ValidationError: \"value\" failed custom validation because invalid address (argument=\"address\", value=\"0xbad_token\", code=INVALID_ARGUMENT, version=address/5.7.0)",
            "valid": false
        }
      )
    })
    it('Testing invalid parsed input token.', async () => {
      const token = USDC_MAINNET
      const validationResp = offchainValidationProvider.validateInputToken(token)
      expect(validationResp).toEqual({"valid": true})
    })
  })
  describe('Testing input amount', () => {
    it('Testing invalid parsed input amount.', async () => {
      const amount = BigNumber.from(0)
      const validationResp = offchainValidationProvider.validateInputAmount(amount)
      expect(validationResp).toEqual({"errorString": "Invalid input amount: amount <= 0", "valid": false})
    })
    it('Testing valid parsed input amount.', async () => {
      const amount = BigNumber.from(1)
      const validationResp = offchainValidationProvider.validateInputAmount(amount)
      expect(validationResp).toEqual({"valid": true})
    })
  })
  describe('Testing parsed outputs', () => {
    let validOutput: DutchOutput
    beforeAll(() => {
      validOutput = {
        endAmount: BigNumber.from(0),
        startAmount: BigNumber.from(0),
        recipient: USDC_MAINNET,
        token: USDC_MAINNET,
      }
    })
    describe('Testing endAmount', () => {
      it('Testing invalid endAmount', () => {
        const outputs = [{ ...validOutput, endAmount: BigNumber.from(-1) }]
        const validationResp = offchainValidationProvider.validateOutputs(outputs)
        expect(validationResp).toEqual({"errorString": "Invalid endAmount -1", "valid": false})
      })
      it('Testing valid endAmount', () => {
        const outputs = [validOutput]
        const validationResp = offchainValidationProvider.validateOutputs(outputs)
        expect(validationResp).toEqual({"valid": true})
      })
    })
    describe('Testing startAmount', () => {
      it('Testing invalid startAmount', () => {
        const outputs = [{ ...validOutput, startAmount: BigNumber.from(-1) }]
        const validationResp = offchainValidationProvider.validateOutputs(outputs)
        expect(validationResp).toEqual({"errorString": "Invalid startAmount -1", "valid": false})
      })
      it('Testing valid startAmount', () => {
        const outputs = [validOutput]
        const validationResp = offchainValidationProvider.validateOutputs(outputs)
        expect(validationResp).toEqual({"valid": true})
      })
    })
    describe('Testing recipient', () => {
      it('Testing invalid recipient.', async () => {
        const outputs = [{ ...validOutput, recipient: '0xfake_recipient' }]
        const validationResp = offchainValidationProvider.validateOutputs(outputs)
        expect(validationResp).toEqual({"errorString": "Invalid recipient 0xfake_recipient", "valid": false})
      })
      it('Testing valid recipient.', async () => {
        const outputs = [validOutput]
        const validationResp = offchainValidationProvider.validateOutputs(outputs)
        expect(validationResp).toEqual({"valid": true})
      })
    })
    describe('Testing token', () => {
      it('Testing invalid token.', async () => {
        const outputs = [{ ...validOutput, token: '0xbad_token' }]
        const validationResp = offchainValidationProvider.validateOutputs(outputs)
        expect(validationResp).toEqual({"errorString": "Invalid output token 0xbad_token", "valid": false})
      })
      it('Testing valid token.', async () => {
        const outputs = [validOutput]
        const validationResp = offchainValidationProvider.validateOutputs(outputs)
        expect(validationResp).toEqual({"valid": true})
      })
    })
  })
})

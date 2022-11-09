import { BigNumber } from "ethers"
import { DutchOutput } from "gouda-sdk"
import { OffchainValidationProvider } from "../../lib/util/providers/offchain-validation-provider"

let offchainValidationProvider = new OffchainValidationProvider()
const USDC_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

beforeAll(() => {
    offchainValidationProvider = new OffchainValidationProvider()
})

describe('Testing off chain validation', () => {
    describe('Testing deadline', () => {
        it('Testing invalid deadline.', async () => {
            const deadline = 1668007958
            const validationResp = offchainValidationProvider.validateDeadline(deadline)
            expect(validationResp).toEqual("Deadline field invalid: value too small")
        })
        it('Testing valid deadline.', async () => {
            const deadline = 5+(new Date().getTime())/1000
            const validationResp = offchainValidationProvider.validateDeadline(deadline)
            expect(validationResp).toBeUndefined()
        })
    })
    describe('Testing startTime', () => {
        it('Testing invalid parsed startTime.', async () => {
            const deadline = 600+(new Date().getTime())/1000
            const startTime = deadline+1
            const validationResp = offchainValidationProvider.validateStartTime(startTime, deadline)
            expect(validationResp).toEqual("Invalid startTime: startTime > deadline")
        })
        it('Testing valid parsed startTime.', async () => {
            const deadline = 600+(new Date().getTime())/1000
            const startTime = deadline-1
            const validationResp = offchainValidationProvider.validateStartTime(startTime, deadline)
            expect(validationResp).toBeUndefined()
        })
    })
    describe('Testing offerer', () => {
        it('Testing invalid parsed offerer.', async () => {
            const offerer = '0xbad_actor'
            const validationResp = offchainValidationProvider.validateOfferer(offerer)
            expect(validationResp).toEqual("Invalid offerer: ValidationError: \"value\" failed custom validation because invalid address (argument=\"address\", value=\"0xbad_actor\", code=INVALID_ARGUMENT, version=address/5.7.0)")
        })
        it('Testing valid parsed offerer.', async () => {
            const offerer = '0x467Bccd9d29f223BcE8043b84E8C8B282827790F'
            const validationResp = offchainValidationProvider.validateOfferer(offerer)
            expect(validationResp).toBeUndefined()
        })
    })
    describe('Testing reactor', () => {
        it('Testing invalid parsed reactor.', async () => {
            const reactor = '0x_misunderstood_actor'
            const validationResp = offchainValidationProvider.validateReactor(reactor)
            expect(validationResp).toEqual("Invalid reactor: ValidationError: \"value\" failed custom validation because invalid address (argument=\"address\", value=\"0x_misunderstood_actor\", code=INVALID_ARGUMENT, version=address/5.7.0)")
        })
        it('Testing valid parsed reactor.', async () => {
            const reactor = '0x467Bccd9d29f223BcE8043b84E8C8B282827790F'
            const validationResp = offchainValidationProvider.validateReactor(reactor)
            expect(validationResp).toBeUndefined()
        })
    })
    describe('Testing nonce', () => {
        it('Testing invalid parsed nonce.', async () => {
            const nonce = BigNumber.from(-1)
            const validationResp = offchainValidationProvider.validateNonce(nonce)
            expect(validationResp).toEqual("Invalid startTime: nonce < 0")
        })
        it('Testing valid parsed nonce.', async () => {
            const nonce = BigNumber.from(0)
            const validationResp = offchainValidationProvider.validateNonce(nonce)
            expect(validationResp).toBeUndefined()
        })
    })
    describe('Testing input token', () => {
        it('Testing invalid parsed input token.', async () => {
            const token = '0xbad_token'
            const validationResp = offchainValidationProvider.validateInputToken(token)
            expect(validationResp).toEqual("Invalid input token: ValidationError: \"value\" failed custom validation because invalid address (argument=\"address\", value=\"0xbad_token\", code=INVALID_ARGUMENT, version=address/5.7.0)")
        })
        it('Testing invalid parsed input token.', async () => {
            const token = USDC_MAINNET
            const validationResp = offchainValidationProvider.validateInputToken(token)
            expect(validationResp).toBeUndefined()
        })
    })
    describe('Testing input amount', () => {
        it('Testing invalid parsed input amount.', async () => {
            const amount = BigNumber.from(0)
            const validationResp = offchainValidationProvider.validateInputAmount(amount)
            expect(validationResp).toEqual("Invalid input amount: amount <= 0")
        })
        it('Testing valid parsed input amount.', async () => {
            const amount = BigNumber.from(1)
            const validationResp = offchainValidationProvider.validateInputAmount(amount)
            expect(validationResp).toBeUndefined()
        })
    })
    describe('Testing parsed outputs', () => {
        let validOutput: DutchOutput
        beforeAll(() => {
            validOutput = {endAmount:BigNumber.from(0), startAmount:BigNumber.from(0), recipient:USDC_MAINNET, token:USDC_MAINNET}
        })
        describe('Testing endAmount', () => {
            it('Testing invalid endAmount', () => {
                const outputs = [{...validOutput, endAmount:BigNumber.from(-1)}]
                const validationResp = offchainValidationProvider.validateOutputs(outputs)
                expect(validationResp).toEqual("Invalid endAmount -1")
            })
            it('Testing valid endAmount', () => {
                const outputs = [validOutput]
                const validationResp = offchainValidationProvider.validateOutputs(outputs)
                expect(validationResp).toBeUndefined()
            })
        })
        describe('Testing startAmount', () => {
            it('Testing invalid startAmount', () => {
                const outputs = [{...validOutput, startAmount:BigNumber.from(-1)}]
                const validationResp = offchainValidationProvider.validateOutputs(outputs)
                expect(validationResp).toEqual("Invalid startAmount -1")
            })
            it('Testing valid startAmount', () => {
                const outputs = [validOutput]
                const validationResp = offchainValidationProvider.validateOutputs(outputs)
                expect(validationResp).toBeUndefined()
            })
        })
        describe('Testing recipient', () => {
            it('Testing invalid recipient.', async () => {
                const outputs = [{...validOutput, recipient: '0xfake_recipient'}]
                const validationResp = offchainValidationProvider.validateOutputs(outputs)
                expect(validationResp).toEqual("Invalid recipient 0xfake_recipient")
            })
            it('Testing valid recipient.', async () => {
                const outputs = [validOutput]
                const validationResp = offchainValidationProvider.validateOutputs(outputs)
                expect(validationResp).toBeUndefined()
            })
        })
        describe('Testing token', () => {
            it('Testing invalid token.', async () => {
                const outputs = [{...validOutput, token:'0xbad_token'}]
                const validationResp = offchainValidationProvider.validateOutputs(outputs)
                expect(validationResp).toEqual("Invalid output token 0xbad_token")
            })
            it('Testing valid token.', async () => {
                const outputs = [validOutput]
                const validationResp = offchainValidationProvider.validateOutputs(outputs)
                expect(validationResp).toBeUndefined()
            })
        })
    })
    /*
    */
})
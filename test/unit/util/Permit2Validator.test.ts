import { ethers } from 'ethers'
import { OrderValidation, UniswapXOrder } from '@uniswap/uniswapx-sdk'
import { ChainId } from '../../../lib/util/chain'
import { Permit2Validator } from '../../../lib/util/Permit2Validator'

// Mock the permit2-sdk
jest.mock('@uniswap/permit2-sdk', () => ({
  permit2Address: jest.fn(),
  SignatureProvider: jest.fn()
}))

describe('Permit2Validator', () => {
  let validator: Permit2Validator
  let mockSignatureProvider: jest.Mocked<any>
  let testOrder: UniswapXOrder

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock SignatureProvider
    mockSignatureProvider = {
      validatePermit: jest.fn()
    }
    const { SignatureProvider: MockedSignatureProvider } = jest.requireMock('@uniswap/permit2-sdk')
    MockedSignatureProvider.mockImplementation(() => mockSignatureProvider)

    // Create validator instance
    validator = new Permit2Validator(undefined as any, ChainId.MAINNET)

    testOrder = {
      info: {
        deadline: Math.floor(Date.now() / 1000) + 3600,
        nonce: ethers.BigNumber.from(123),
        swapper: '0x1234567890123456789012345678901234567890',
        input: {
          token: '0x1234567890123456789012345678901234567890',
          amount: ethers.BigNumber.from('1000000000000000000')
        }
      }
    } as UniswapXOrder
  })

  describe('validate', () => {
    it('should return NonceUsed when permit is already used', async () => {
      mockSignatureProvider.validatePermit.mockResolvedValue({
        isUsed: true,
        isExpired: false,
        isValid: false
      })

      const result = await validator.validate(testOrder)

      expect(result).toBe(OrderValidation.NonceUsed)
      expect(mockSignatureProvider.validatePermit).toHaveBeenCalledWith({
        permitted: {
          token: testOrder.info.input.token,
          amount: 0
        },
        spender: testOrder.info.swapper,
        nonce: testOrder.info.nonce,
        deadline: testOrder.info.deadline
      })
    })

    it('should return Expired when permit is expired', async () => {
      mockSignatureProvider.validatePermit.mockResolvedValue({
        isUsed: false,
        isExpired: true,
        isValid: false
      })

      const result = await validator.validate(testOrder)

      expect(result).toBe(OrderValidation.Expired)
      expect(mockSignatureProvider.validatePermit).toHaveBeenCalledWith({
        permitted: {
          token: testOrder.info.input.token,
          amount: 0
        },
        spender: testOrder.info.swapper,
        nonce: testOrder.info.nonce,
        deadline: testOrder.info.deadline
      })
    })

    it('should return OK when permit is valid', async () => {
      mockSignatureProvider.validatePermit.mockResolvedValue({
        isUsed: false,
        isExpired: false,
        isValid: true
      })

      const result = await validator.validate(testOrder)

      expect(result).toBe(OrderValidation.OK)
      expect(mockSignatureProvider.validatePermit).toHaveBeenCalledWith({
        permitted: {
          token: testOrder.info.input.token,
          amount: 0
        },
        spender: testOrder.info.swapper,
        nonce: testOrder.info.nonce,
        deadline: testOrder.info.deadline
      })
    })
  })

  describe('error handling', () => {
    it('should propagate errors from SignatureProvider', async () => {
      const error = new Error('Network error')
      mockSignatureProvider.validatePermit.mockRejectedValue(error)

      await expect(validator.validate(testOrder)).rejects.toThrow('Network error')
    })
  })
})

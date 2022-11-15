import { ORDER_STATUS } from '../../lib/entities'
import { ChainId } from '../../lib/util/chain'
import FieldValidator from '../../lib/util/field-validator'

describe('Testing each field on the FieldValidator class.', () => {
  describe('Testing createdAt field.', () => {
    it('should validate field.', async () => {
      const currentTime = 15000
      expect(FieldValidator.isValidCreatedAt().validate(currentTime)).toEqual({ value: currentTime })
    })

    it('should invalidate field.', async () => {
      const validatedField = FieldValidator.isValidCreatedAt().validate('NOT_TIME')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('"value" must be a number')
    })
  })

  describe('Testing orderStatus field.', () => {
    it('should validate field.', async () => {
      expect(FieldValidator.isValidOrderStatus().validate(ORDER_STATUS.OPEN)).toEqual({ value: ORDER_STATUS.OPEN })
    })

    it('should invalidate field.', async () => {
      const validatedField = FieldValidator.isValidOrderStatus().validate('NOT_A_VALID_STATUS')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        '"value" must be one of [open, filled, cancelled, expired, error, unverified]'
      )
    })
  })

  describe('Testing orderHash field.', () => {
    it('should validate field.', async () => {
      const orderHash = '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae3'
      expect(FieldValidator.isValidOrderHash().validate(orderHash)).toEqual({ value: orderHash })
    })

    it('should invalidate field.', async () => {
      const invalidOrderHash = '0xdeadbeef'
      const validatedField = FieldValidator.isValidOrderHash().validate(invalidOrderHash)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        `"value" with value "${invalidOrderHash}" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{64}$/`
      )
    })
  })

  describe('Testing signature field.', () => {
    it('should validate field.', async () => {
      const signature =
        '0x1c33da80f46194b0db3398de4243d695dfa5049c4cc341e80f5b630804a47f2f52b9d16cb65b2a2d8ed073da4b295c7cb3ccc13a49a16a07ad80b796c31b283414'
      expect(FieldValidator.isValidSignature().validate(signature)).toEqual({ value: signature })
    })

    it('should invalidate field.', async () => {
      const invalidSignature = '0xsignaturetooshort'
      const validatedField = FieldValidator.isValidSignature().validate(invalidSignature)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        `"value" with value "${invalidSignature}" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{130}$/`
      )
    })
  })

  describe('Testing limit field.', () => {
    it('should validate field.', async () => {
      expect(FieldValidator.isValidLimit().validate(1)).toEqual({ value: 1 })
    })

    it('should invalidate field.', async () => {
      const validatedField = FieldValidator.isValidLimit().validate('not_a_number')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('"value" must be a number')
    })
  })

  describe('Testing ethAddress field.', () => {
    it('should validate field.', async () => {
      const ethAddress = '0x1325ad66ad5fa02621d3ad52c9323c6c2bff2682'
      expect(FieldValidator.isValidEthAddress().validate(ethAddress)).toEqual({ value: ethAddress })
    })

    it('should invalidate field.', async () => {
      const invalidAddress = '0xnot_a_valid_eth_address'
      const validatedField = FieldValidator.isValidEthAddress().validate(invalidAddress)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('VALIDATION ERROR: Invalid address')
    })
  })

  describe('Testing encodedOrder field.', () => {
    it('should validate field.', async () => {
      const encodedOrder = '0x00000000001325ad66ad5fa02621d3ad52c9323c6c2bff26820000000'
      expect(FieldValidator.isValidEncodedOrder().validate(encodedOrder)).toEqual({ value: encodedOrder })
    })

    it('should invalidate field.', async () => {
      const invalidOrder = '0xnot_a_valid_order_$$$$'
      const validatedField = FieldValidator.isValidEncodedOrder().validate(invalidOrder)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        `"value" with value "${invalidOrder}" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{0,2000}$/`
      )
    })
  })

  describe('Testing chainId field.', () => {
    it('should validate field.', async () => {
      const chainId = ChainId.MAINNET
      expect(FieldValidator.isValidChainId().validate(chainId)).toEqual({ value: chainId })
    })
    it('should invalidate non numeric.', async () => {
      const chainId = 'MAINNET'
      const validatedField = FieldValidator.isValidChainId().validate(chainId)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('"value" must be one of [1, 5]')
    })
    it('should invalidate unsupported chain.', async () => {
      const chainId = ChainId.ARBITRUM_ONE
      const validatedField = FieldValidator.isValidChainId().validate(chainId)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('"value" must be one of [1, 5]')
    })
  })
  describe('Testing nonce field.', () => {
    it('should validate field.', async () => {
      expect(FieldValidator.isValidNonce().validate('1')).toEqual({ value: '1' })
    })

    it('should invalidate non-numeric value.', async () => {
      const validatedField = FieldValidator.isValidNonce().validate('not_a_number')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        '"value" with value "not_a_number" fails to match the required pattern: /^[0-9]+$/'
      )
    })

    it('should invalidate string that exceeds max length.', async () => {
      const validatedField = FieldValidator.isValidNonce().validate('1'.repeat(79))
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        '"value" length must be less than or equal to 78 characters long'
      )
    })
  })

  describe('Testing cursor field.', () => {
    it('should validate field.', async () => {
      const cursor = 'eyJvcmRlckhhc2giOiIweGRlYWRiZWVmNTcxNDAzIn0='
      expect(FieldValidator.isValidCursor().validate(cursor)).toEqual({ value: cursor })
    })

    it('should invalidate field.', async () => {
      const invalidCursor = '0xnot_a_valid_order_$$$$'
      const validatedField = FieldValidator.isValidCursor().validate(invalidCursor)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('"value" must be a valid base64 string')
    })

    it('should invalidate field.', async () => {
      const maxLengthCursor = `jfkasdjfkdsajfdjsafjdsjfkljsddkfjdhsajkgfhdgjkdfshgkfhdjkghjkfdhgjkh
        hsdfjhgjkfdshgjksdfjkgfdjkshgjkhsdfjkghfdjkghjkfdshgjklhdfsjkghkjfdshg
        hsdfjhgjkfdshgjksdfjkgfdjkshgjkhsdfjkghfdjkghjkfdshgjklhdfsjkghkjfdshg
        kljdfhsgjklhsdfjkghsdfjklghjkdfhgjksdfhjkghfdjkghsdfkjlghdfjksghjkfdhg
        kjlfdhgjkhfdkjghsdfjkhgkjdfshgkjdfhskgjhfdjkghdfjkhgkjdfkghsdfjkghfkgh
        kjfdshgkljdfhsgjklhsdfjkghsdfjklghjkdfhgjksdfhjkghfdjkghsdfkjlghdfjksgh
        2giOiIweGRlYWRiZWVmNTcxNDAzIn0=`
      const validatedField = FieldValidator.isValidCursor().validate(maxLengthCursor)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        '"value" length must be less than or equal to 500 characters long'
      )
    })
  })
})

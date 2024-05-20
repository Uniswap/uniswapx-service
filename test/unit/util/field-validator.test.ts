import { ORDER_STATUS } from '../../../lib/entities'
import { ChainId, SUPPORTED_CHAINS } from '../../../lib/util/chain'
import FieldValidator from '../../../lib/util/field-validator'

describe('Testing each field on the FieldValidator class.', () => {
  describe('Testing createdAt field.', () => {
    it('should validate field.', async () => {
      const currentTime = 1668068872
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
        '"value" must be one of [open, filled, cancelled, expired, error, insufficient-funds]'
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
        `"value" with value "${invalidOrder}" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{0,3000}$/`
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
      expect(validatedField.error?.details[0].message).toEqual(`"value" must be one of [${SUPPORTED_CHAINS.join(', ')}]`)
    })
    it('should invalidate unsupported chain.', async () => {
      const chainId = 74829284
      const validatedField = FieldValidator.isValidChainId().validate(chainId)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(`"value" must be one of [${SUPPORTED_CHAINS.join(', ')}]`)
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

  describe('Testing sortKey field.', () => {
    it('should validate field.', async () => {
      expect(FieldValidator.isValidSortKey().validate('createdAt')).toEqual({ value: 'createdAt' })
    })

    it('should invalidate non-numeric value.', async () => {
      const validatedField = FieldValidator.isValidSortKey().validate('createdBy')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('"value" must be [createdAt]')
    })
  })

  describe('Testing sort field.', () => {
    it('should validate field.', async () => {
      expect(FieldValidator.isValidSort().validate('gt(12)')).toEqual({ value: 'gt(12)' })
      expect(FieldValidator.isValidSort().validate('gte(12)')).toEqual({ value: 'gte(12)' })
      expect(FieldValidator.isValidSort().validate('lt(12)')).toEqual({ value: 'lt(12)' })
      expect(FieldValidator.isValidSort().validate('lte(12)')).toEqual({ value: 'lte(12)' })
      expect(FieldValidator.isValidSort().validate('between(1,12)')).toEqual({ value: 'between(1,12)' })
    })

    it('should invalidate non-numeric value.', async () => {
      const validatedField = FieldValidator.isValidSort().validate('1(gt)')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        '"value" with value "1(gt)" fails to match the required pattern: /(\\w+)\\(([0-9]+)(?:,([0-9]+))?\\)/'
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

  describe('Testing quoteId field.', () => {
    it('should validate field.', async () => {
      const quoteId = '55e2cfca-5521-4a0a-b597-7bfb569032d7'
      expect(FieldValidator.isValidQuoteId().validate(quoteId)).toEqual({ value: quoteId })
    })

    it('should invalidate field with a number.', async () => {
      const validatedField = FieldValidator.isValidQuoteId().validate(1)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(`"value" must be a string`)
    })

    it('should invalidate field with a string.', async () => {
      const validatedField = FieldValidator.isValidQuoteId().validate('not_uuid')
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual('"value" must be a valid GUID')
    })
  })

  describe('Testing txHash field.', () => {
    it('should validate field.', async () => {
      const txHash = '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae3'
      expect(FieldValidator.isValidTxHash().validate(txHash)).toEqual({ value: txHash })
    })

    it('should invalidate field.', async () => {
      const invalidTxHash = '0xdeadbeef'
      const validatedField = FieldValidator.isValidTxHash().validate(invalidTxHash)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        `"value" with value "${invalidTxHash}" fails to match the required pattern: /^0x[0-9,a-z,A-Z]{64}$/`
      )
    })
  })

  describe('Testing orderHashes field.', () => {
    it('should validate field.', async () => {
      const orderHashes =
        '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae3,0xf8b7786fae9d7427aabf5f539121ffd55809855910c240d92c56cbe5b794af37'
      expect(FieldValidator.isValidOrderHashes().validate(orderHashes)).toEqual({ value: orderHashes })
    })

    it('should invalidate field.', async () => {
      const invalidOrderHashes =
        '0xa2444ef606a0d99809e1878f7b819541618f2b7990bb9a7275996b362680cae3;0xf8b7786fae9d7427aabf5f539121ffd55809855910c240d92c56cbe5b794af37'
      const validatedField = FieldValidator.isValidOrderHashes().validate(invalidOrderHashes)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        'Invalid input. Expected comma-separated order hashes, with a maximum of 50, each matching the pattern "^0x[0-9a-zA-Z]64$".'
      )
    })
  })

  describe('Testing orderType field.', () => {
    it.each([['Dutch'], ['DutchLimit'], ['Dutch_V2'], ['Limit']])('Validates orderType %p', async (orderType) => {
      expect(FieldValidator.isValidOrderType().validate(orderType)).toEqual({ value: orderType })
    })

    it('should invalidate field.', async () => {
      const orderType = 'LimitOrder'
      const validatedField = FieldValidator.isValidOrderType().validate(orderType)
      expect(validatedField.error).toBeTruthy()
      expect(validatedField.error?.details[0].message).toEqual(
        '"value" must be one of [Dutch, DutchLimit, Dutch_V2, Limit, Relay]'
      )
    })
  })
})
